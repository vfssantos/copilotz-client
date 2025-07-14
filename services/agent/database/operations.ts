// =============================================================================
// AGENT CHAT DATABASE OPERATIONS - Database interaction layer with ominipg
// =============================================================================

import type {
  DatabaseOperations,
  TaskContext,
  ThreadContext,
  ConversationMessage,
  TaskSummary,
  AgentConversationContext,
  AgentConfig,
  CreateTaskRequest,
  CreateThreadRequest,
  ToolCall,
  ToolResult
} from '../types.ts';

import {
  AgentChatError,
  ErrorCodes
} from '../types.ts';

// =============================================================================
// MAIN DATABASE OPERATIONS CLASS
// =============================================================================

export class AgentChatDatabaseOperations implements DatabaseOperations {
  private db: any; // ominipg instance

  constructor(ominipg: any) {
    this.db = ominipg;
  }

  async initialize(): Promise<void> {
    try {      
      // Test database connection
      await this.db.query('SELECT 1');
      
    } catch (error) {
      throw new AgentChatError(
        `Failed to initialize database operations: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        error
      );
    }
  }

  // =============================================================================
  // TASK OPERATIONS
  // =============================================================================

  async createTask(task: Omit<TaskContext, 'id' | 'createdAt' | 'lastActivity'>): Promise<string> {
    try {
      const result = await this.db.query(`
        INSERT INTO tasks (
          user_id, title, description, participants, status, priority,
          context, goals, constraints, expected_completion
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        task.userId,
        task.title || null,
        task.description || null,
        JSON.stringify(task.participants),
        task.status,
        task.priority,
        JSON.stringify(task.context),
        JSON.stringify(task.goals || []),
        JSON.stringify(task.constraints || {}),
        task.expectedCompletion || null
      ]);

      const taskId = result.rows[0].id;

      // Add participants to task_participants table
      if (task.participants.length > 0) {
        await this.addParticipantsToTask(taskId, task.participants);
      }

      return taskId;
    } catch (error) {
      throw new AgentChatError(
        `Failed to create task: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        error
      );
    }
  }

  async getTask(taskId: string): Promise<TaskContext | null> {
    try {
      const result = await this.db.query(`
        SELECT 
          id, user_id, title, description, participants, status, priority,
          context, goals, constraints, created_at, last_activity,
          expected_completion, completed_at
        FROM tasks
        WHERE id = $1
      `, [taskId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        title: row.title,
        description: row.description,
        participants: row.participants,
        status: row.status,
        priority: row.priority,
        context: row.context,
        goals: row.goals,
        constraints: row.constraints,
        createdAt: new Date(row.created_at),
        lastActivity: new Date(row.last_activity),
        expectedCompletion: row.expected_completion ? new Date(row.expected_completion) : undefined,
        completedAt: row.completed_at ? new Date(row.completed_at) : undefined
      };
    } catch (error) {
      throw new AgentChatError(
        `Failed to get task: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        error
      );
    }
  }

  async updateTask(taskId: string, updates: Partial<TaskContext>): Promise<boolean> {
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      // Build dynamic update query
      if (updates.title !== undefined) {
        setClauses.push(`title = $${paramCount++}`);
        values.push(updates.title);
      }

      if (updates.description !== undefined) {
        setClauses.push(`description = $${paramCount++}`);
        values.push(updates.description);
      }

      if (updates.status !== undefined) {
        setClauses.push(`status = $${paramCount++}`);
        values.push(updates.status);
      }

      if (updates.participants !== undefined) {
        setClauses.push(`participants = $${paramCount++}`);
        values.push(JSON.stringify(updates.participants));
      }

      if (updates.context !== undefined) {
        setClauses.push(`context = $${paramCount++}`);
        values.push(JSON.stringify(updates.context));
      }

      if (updates.expectedCompletion !== undefined) {
        setClauses.push(`expected_completion = $${paramCount++}`);
        values.push(updates.expectedCompletion);
      }

      if (updates.completedAt !== undefined) {
        setClauses.push(`completed_at = $${paramCount++}`);
        values.push(updates.completedAt);
      }

      // Always update last_activity
      setClauses.push(`last_activity = NOW()`);

      if (setClauses.length === 1) { // Only last_activity
        return true;
      }

      values.push(taskId); // Add taskId as last parameter

      const result = await this.db.query(`
        UPDATE tasks 
        SET ${setClauses.join(', ')}
        WHERE id = $${paramCount}
      `, values);

      return result.rowCount > 0;
    } catch (error) {
      throw new AgentChatError(
        `Failed to update task: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        error
      );
    }
  }

  async listUserTasks(
    userId: string, 
    status?: string, 
    limit?: number, 
    offset?: number
  ): Promise<TaskSummary[]> {
    try {
      let query = `
        SELECT 
          t.id, t.title, t.status, t.participants, t.last_activity,
          COALESCE(m.message_count, 0) as message_count,
          COALESCE(th.thread_count, 0) as thread_count
        FROM tasks t
        LEFT JOIN (
          SELECT task_id, COUNT(*) as message_count
          FROM messages
          GROUP BY task_id
        ) m ON t.id = m.task_id
        LEFT JOIN (
          SELECT task_id, COUNT(*) as thread_count
          FROM threads
          GROUP BY task_id
        ) th ON t.id = th.task_id
        WHERE t.user_id = $1
      `;

      const values = [userId];
      let paramCount = 2;

      if (status) {
        query += ` AND t.status = $${paramCount++}`;
        values.push(status);
      }

      query += ` ORDER BY t.last_activity DESC`;

      if (limit) {
        query += ` LIMIT $${paramCount++}`;
        values.push(limit);
      }

      if (offset) {
        query += ` OFFSET $${paramCount++}`;
        values.push(offset);
      }

      const result = await this.db.query(query, values);

      return result.rows.map((row: any) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        participants: row.participants,
        lastActivity: new Date(row.last_activity),
        messageCount: parseInt(row.message_count),
        threadCount: parseInt(row.thread_count)
      }));
    } catch (error) {
      throw new AgentChatError(
        `Failed to list user tasks: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        error
      );
    }
  }

  async addParticipantToTask(taskId: string, participant: string): Promise<boolean> {
    try {
      // Add to task_participants table
      await this.db.query(`
        INSERT INTO task_participants (task_id, participant_id, participant_type, joined_reason)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (task_id, participant_id) DO UPDATE SET
          is_active = true,
          joined_at = NOW()
      `, [
        taskId,
        participant,
        participant === 'user' ? 'user' : 'agent',
        'Joined task'
      ]);

      // Update participants array in tasks table
      await this.db.query(`
        UPDATE tasks 
        SET participants = (
          SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
          FROM (
            SELECT jsonb_array_elements_text(participants) as elem
            UNION 
            SELECT $2
          ) t
        )
        WHERE id = $1
      `, [taskId, participant]);

      return true;
    } catch (error) {
      throw new AgentChatError(
        `Failed to add participant to task: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        error
      );
    }
  }

  // =============================================================================
  // THREAD OPERATIONS
  // =============================================================================

  async createThread(thread: Omit<ThreadContext, 'id' | 'createdAt' | 'lastActivity'>): Promise<string> {
    try {
      const result = await this.db.query(`
        INSERT INTO threads (task_id, purpose, participants, status, parent_message_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [
        thread.taskId,
        thread.purpose,
        JSON.stringify(thread.participants),
        thread.status,
        thread.parentMessageId || null
      ]);

      const threadId = result.rows[0].id;

      // Add participants to thread_participants table
      if (thread.participants.length > 0) {
        await this.addParticipantsToThread(threadId, thread.participants);
      }

      return threadId;
    } catch (error) {
      throw new AgentChatError(
        `Failed to create thread: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        error
      );
    }
  }

  async getThread(threadId: string): Promise<ThreadContext | null> {
    try {
      const result = await this.db.query(`
        SELECT 
          id, task_id, purpose, participants, status, parent_message_id,
          created_at, last_activity, resolved_at
        FROM threads
        WHERE id = $1
      `, [threadId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        taskId: row.task_id,
        purpose: row.purpose,
        participants: row.participants,
        status: row.status,
        parentMessageId: row.parent_message_id,
        createdAt: new Date(row.created_at),
        lastActivity: new Date(row.last_activity),
        resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined
      };
    } catch (error) {
      throw new AgentChatError(
        `Failed to get thread: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        error
      );
    }
  }

  async updateThread(threadId: string, updates: Partial<ThreadContext>): Promise<boolean> {
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (updates.purpose !== undefined) {
        setClauses.push(`purpose = $${paramCount++}`);
        values.push(updates.purpose);
      }

      if (updates.participants !== undefined) {
        setClauses.push(`participants = $${paramCount++}`);
        values.push(JSON.stringify(updates.participants));
      }

      if (updates.status !== undefined) {
        setClauses.push(`status = $${paramCount++}`);
        values.push(updates.status);

        if (updates.status === 'resolved') {
          setClauses.push(`resolved_at = NOW()`);
        }
      }

      // Always update last_activity
      setClauses.push(`last_activity = NOW()`);

      if (setClauses.length === 1) { // Only last_activity
        return true;
      }

      values.push(threadId); // Add threadId as last parameter

      const result = await this.db.query(`
        UPDATE threads 
        SET ${setClauses.join(', ')}
        WHERE id = $${paramCount}
      `, values);

      return result.rowCount > 0;
    } catch (error) {
      throw new AgentChatError(
        `Failed to update thread: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        error
      );
    }
  }

  async listTaskThreads(taskId: string): Promise<ThreadContext[]> {
    try {
      const result = await this.db.query(`
        SELECT 
          id, task_id, purpose, participants, status, parent_message_id,
          created_at, last_activity, resolved_at
        FROM threads
        WHERE task_id = $1
        ORDER BY created_at DESC
      `, [taskId]);

      return result.rows.map((row: any) => ({
        id: row.id,
        taskId: row.task_id,
        purpose: row.purpose,
        participants: row.participants,
        status: row.status,
        parentMessageId: row.parent_message_id,
        createdAt: new Date(row.created_at),
        lastActivity: new Date(row.last_activity),
        resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined
      }));
    } catch (error) {
      throw new AgentChatError(
        `Failed to list task threads: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        error
      );
    }
  }

  async addParticipantToThread(threadId: string, participant: string): Promise<boolean> {
    try {
      // Add to thread_participants table
      await this.db.query(`
        INSERT INTO thread_participants (thread_id, participant_id, participant_type)
        VALUES ($1, $2, $3)
        ON CONFLICT (thread_id, participant_id) DO UPDATE SET
          is_active = true,
          joined_at = NOW()
      `, [
        threadId,
        participant,
        participant === 'user' ? 'user' : 'agent'
      ]);

      // Update participants array in threads table
      await this.db.query(`
        UPDATE threads 
        SET participants = (
          SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
          FROM (
            SELECT jsonb_array_elements_text(participants) as elem
            UNION 
            SELECT $2
          ) t
        )
        WHERE id = $1
      `, [threadId, participant]);

      return true;
    } catch (error) {
      throw new AgentChatError(
        `Failed to add participant to thread: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        error
      );
    }
  }

  async closeThread(threadId: string): Promise<boolean> {
    try {
      return await this.updateThread(threadId, { status: 'resolved' });
    } catch (error) {
      throw new AgentChatError(
        `Failed to close thread: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        error
      );
    }
  }

  // =============================================================================
  // MESSAGE OPERATIONS
  // =============================================================================

  async addMessage(message: Omit<ConversationMessage, 'id' | 'timestamp'>): Promise<string> {
    try {
      const result = await this.db.query(`
        INSERT INTO messages (
          task_id, thread_id, sender, sender_type, content, message_type,
          reply_to_id, mentioned_participants, tool_calls, tool_results, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [
        message.taskId,
        message.threadId || null,
        message.sender,
        message.senderType,
        message.content,
        message.messageType,
        message.replyToId || null,
        JSON.stringify(message.mentionedParticipants || []),
        JSON.stringify([]), // tool_calls placeholder
        JSON.stringify([]), // tool_results placeholder
        JSON.stringify(message.metadata || {})
      ]);

      const messageId = result.rows[0].id;

      // Update last_activity for task and thread
      await this.updateTaskActivity(message.taskId);
      if (message.threadId) {
        await this.updateThreadActivity(message.threadId);
      }

      return messageId;
    } catch (error) {
      throw new AgentChatError(
        `Failed to add message: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        error
      );
    }
  }

  async getTaskMessages(
    taskId: string, 
    threadId?: string, 
    limit?: number, 
    offset?: number
  ): Promise<ConversationMessage[]> {
    try {
      let query = `
        SELECT 
          id, task_id, thread_id, sender, sender_type, content, message_type,
          reply_to_id, mentioned_participants, tool_calls, tool_results,
          metadata, created_at, edited_at
        FROM messages
        WHERE task_id = $1
      `;
      
      const values = [taskId];
      let paramCount = 2;

      if (threadId) {
        query += ` AND thread_id = $${paramCount++}`;
        values.push(threadId);
      } else {
        // Only main conversation (no thread)
        query += ` AND thread_id IS NULL`;
      }

      query += ` ORDER BY created_at ASC`;

      if (limit) {
        query += ` LIMIT $${paramCount++}`;
        values.push(limit);
      }

      if (offset) {
        query += ` OFFSET $${paramCount++}`;
        values.push(offset);
      }

      const result = await this.db.query(query, values);

      return result.rows.map(this.mapRowToMessage);
    } catch (error) {
      throw new AgentChatError(
        `Failed to get task messages: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        error
      );
    }
  }

  async getThreadMessages(
    threadId: string, 
    limit?: number, 
    offset?: number
  ): Promise<ConversationMessage[]> {
    try {
      let query = `
        SELECT 
          id, task_id, thread_id, sender, sender_type, content, message_type,
          reply_to_id, mentioned_participants, tool_calls, tool_results,
          metadata, created_at, edited_at
        FROM messages
        WHERE thread_id = $1
        ORDER BY created_at ASC
      `;

      const values = [threadId];
      let paramCount = 2;

      if (limit) {
        query += ` LIMIT $${paramCount++}`;
        values.push(limit);
      }

      if (offset) {
        query += ` OFFSET $${paramCount++}`;
        values.push(offset);
      }

      const result = await this.db.query(query, values);

      return result.rows.map(this.mapRowToMessage);
    } catch (error) {
      throw new AgentChatError(
        `Failed to get thread messages: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        error
      );
    }
  }

  async getMessage(messageId: string): Promise<ConversationMessage | null> {
    try {
      const result = await this.db.query(`
        SELECT 
          id, task_id, thread_id, sender, sender_type, content, message_type,
          reply_to_id, mentioned_participants, tool_calls, tool_results,
          metadata, created_at, edited_at
        FROM messages
        WHERE id = $1
      `, [messageId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToMessage(result.rows[0]);
    } catch (error) {
      throw new AgentChatError(
        `Failed to get message: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        error
      );
    }
  }

  async updateMessage(messageId: string, updates: Partial<ConversationMessage>): Promise<boolean> {
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (updates.content !== undefined) {
        setClauses.push(`content = $${paramCount++}`);
        values.push(updates.content);
      }

      if (updates.metadata !== undefined) {
        setClauses.push(`metadata = $${paramCount++}`);
        values.push(JSON.stringify(updates.metadata));
      }

      // Always update edited_at
      setClauses.push(`edited_at = NOW()`);

      if (setClauses.length === 1) { // Only edited_at
        return true;
      }

      values.push(messageId); // Add messageId as last parameter

      const result = await this.db.query(`
        UPDATE messages 
        SET ${setClauses.join(', ')}
        WHERE id = $${paramCount}
      `, values);

      return result.rowCount > 0;
    } catch (error) {
      throw new AgentChatError(
        `Failed to update message: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        error
      );
    }
  }

  // =============================================================================
  // CONTEXT OPERATIONS
  // =============================================================================

  async getTaskContext(taskId: string, participantId: string): Promise<AgentConversationContext> {
    try {
      // Get task details
      const task = await this.getTask(taskId);
      if (!task) {
        throw new AgentChatError(`Task ${taskId} not found`, ErrorCodes.DATABASE_ERROR);
      }

      // Get recent messages (last 50)
      const messages = await this.getTaskMessages(taskId, undefined, 50);

      // Get other participants
      const otherParticipants = task.participants.filter(p => p !== participantId);

      return {
        taskId,
        messageHistory: messages,
        taskContext: task,
        otherParticipants,
        availableTools: [] // Will be populated by agent registry
      };
    } catch (error) {
      throw new AgentChatError(
        `Failed to get task context: ${error.message}`,
        ErrorCodes.CONTEXT_ERROR,
        error
      );
    }
  }

  async getThreadContext(threadId: string, participantId: string): Promise<AgentConversationContext> {
    try {
      // Get thread details
      const thread = await this.getThread(threadId);
      if (!thread) {
        throw new AgentChatError(`Thread ${threadId} not found`, ErrorCodes.DATABASE_ERROR);
      }

      // Get task details
      const task = await this.getTask(thread.taskId);
      if (!task) {
        throw new AgentChatError(`Task ${thread.taskId} not found`, ErrorCodes.DATABASE_ERROR);
      }

      // Get thread messages
      const messages = await this.getThreadMessages(threadId, 50);

      // Get other participants in thread
      const otherParticipants = thread.participants.filter(p => p !== participantId);

      return {
        taskId: thread.taskId,
        threadId,
        messageHistory: messages,
        taskContext: task,
        threadContext: thread,
        otherParticipants,
        availableTools: [] // Will be populated by agent registry
      };
    } catch (error) {
      throw new AgentChatError(
        `Failed to get thread context: ${error.message}`,
        ErrorCodes.CONTEXT_ERROR,
        error
      );
    }
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private async addParticipantsToTask(taskId: string, participants: string[]): Promise<void> {
    for (const participant of participants) {
      await this.addParticipantToTask(taskId, participant);
    }
  }

  private async addParticipantsToThread(threadId: string, participants: string[]): Promise<void> {
    for (const participant of participants) {
      await this.addParticipantToThread(threadId, participant);
    }
  }

  private async updateTaskActivity(taskId: string): Promise<void> {
    await this.db.query(`
      UPDATE tasks 
      SET last_activity = NOW()
      WHERE id = $1
    `, [taskId]);
  }

  private async updateThreadActivity(threadId: string): Promise<void> {
    await this.db.query(`
      UPDATE threads 
      SET last_activity = NOW()
      WHERE id = $1
    `, [threadId]);
  }

  private mapRowToMessage(row: any): ConversationMessage {
    return {
      id: row.id,
      taskId: row.task_id,
      threadId: row.thread_id,
      sender: row.sender,
      senderType: row.sender_type,
      content: row.content,
      messageType: row.message_type,
      replyToId: row.reply_to_id,
      mentionedParticipants: row.mentioned_participants,
      metadata: row.metadata,
      timestamp: new Date(row.created_at),
      editedAt: row.edited_at ? new Date(row.edited_at) : undefined
    };
  }
} 