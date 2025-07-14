// =============================================================================
// CONTEXT MANAGER - Provides scoped conversation context to agents
// =============================================================================

import type {
  AgentConversationContext,
  ConversationHistory,
  ConversationMessage,
  ThreadContext,
  TaskContext
} from '../types.ts';

import { AgentChatDatabaseOperations } from '../database/operations.ts';
import type { AgentRegistry } from './agent-registry.ts';

// =============================================================================
// CONTEXT MANAGER CLASS
// =============================================================================

export class ContextManager {
  private db: AgentChatDatabaseOperations;
  private agentRegistry: AgentRegistry;

  constructor(db: AgentChatDatabaseOperations, agentRegistry: AgentRegistry) {
    this.db = db;
    this.agentRegistry = agentRegistry;
  }

  /**
   * Get task history including main conversation and threads
   */
  async getTaskHistory(
    taskId: string,
    userId?: string,
    includeThreads?: boolean
  ): Promise<ConversationHistory> {
    try {
      // Get main conversation messages
      const messages = await this.db.getTaskMessages(taskId, undefined, 100);
      
      // Get threads if requested
      let threads: ThreadContext[] = [];
      if (includeThreads) {
        threads = await this.db.listTaskThreads(taskId);
      }

      // Get task details for participants
      const task = await this.db.getTask(taskId);
      const participants = task?.participants || [];

      return {
        messages,
        threads,
        participants,
        tokenCount: this.estimateTokenCount(messages)
      };
    } catch (error) {
      console.error(`Failed to get task history: ${error}`);
      return {
        messages: [],
        threads: [],
        participants: [],
        tokenCount: 0
      };
    }
  }

  /**
   * Get thread history
   */
  async getThreadHistory(
    threadId: string,
    userId?: string
  ): Promise<{
    messages: ConversationMessage[];
    participants: string[];
    purpose: string;
  }> {
    try {
      // Get thread messages
      const messages = await this.db.getThreadMessages(threadId, 100);
      
      // Get thread details
      const thread = await this.db.getThread(threadId);
      
      return {
        messages,
        participants: thread?.participants || [],
        purpose: thread?.purpose || 'Thread discussion'
      };
    } catch (error) {
      console.error(`Failed to get thread history: ${error}`);
      return {
        messages: [],
        participants: [],
        purpose: 'Unknown'
      };
    }
  }

  /**
   * Get conversation context for an agent in a specific task
   */
  async getAgentTaskContext(
    agentId: string,
    taskId: string,
    maxMessages?: number
  ): Promise<AgentConversationContext> {
    try {
      return await this.db.getTaskContext(taskId, agentId);
    } catch (error) {
      console.error(`Failed to get agent task context: ${error}`);
      
      // Return minimal context as fallback
      return {
        taskId,
        messageHistory: [],
        taskContext: {
          id: taskId,
          userId: 'unknown',
          participants: [agentId],
          status: 'active',
          priority: 1,
          context: {},
          createdAt: new Date(),
          lastActivity: new Date()
        },
        otherParticipants: [],
        availableTools: []
      };
    }
  }

  /**
   * Get conversation context for an agent in a specific thread
   */
  async getAgentThreadContext(
    agentId: string,
    threadId: string,
    maxMessages?: number
  ): Promise<AgentConversationContext> {
    try {
      return await this.db.getThreadContext(threadId, agentId);
    } catch (error) {
      console.error(`Failed to get agent thread context: ${error}`);
      
      // Return minimal context as fallback
      return {
        taskId: 'unknown',
        threadId,
        messageHistory: [],
        taskContext: {
          id: 'unknown',
          userId: 'unknown',
          participants: [agentId],
          status: 'active',
          priority: 1,
          context: {},
          createdAt: new Date(),
          lastActivity: new Date()
        },
        otherParticipants: [],
        availableTools: []
      };
    }
  }

  /**
   * Build optimized context for an agent considering token limits
   * Now includes full task history for the agent across all threads
   */
  async buildOptimizedContext(
    agentId: string,
    taskId: string,
    threadId?: string,
    maxTokens: number = 4000
  ): Promise<AgentConversationContext> {
    try {
      // Get base context (for task/thread metadata)
      let baseContext: AgentConversationContext;
      
      if (threadId) {
        baseContext = await this.getAgentThreadContext(agentId, threadId);
      } else {
        baseContext = await this.getAgentTaskContext(agentId, taskId);
      }

      // Get ALL messages for this agent across the entire task (all threads)
      const allTaskMessages = await this.getAgentFullTaskHistory(agentId, taskId);
      
      // Get current thread info if we're in a thread
      const currentThreadContext = threadId ? await this.db.getThread(threadId) : undefined;
      
      // Get available thread IDs that the agent can access
      const availableThreads = await this.getAgentAccessibleThreads(agentId, taskId);

      // Get available agents not in current conversation
      const availableAgents = await this.getAvailableAgentsNotInConversation(agentId, taskId, threadId);

      // Optimize message history to fit within token limit
      const optimizedMessages = this.optimizeMessageHistory(
        allTaskMessages,
        maxTokens
      );

      // Build enhanced context with full task history
      return {
        ...baseContext,
        messageHistory: optimizedMessages,
        threadContext: currentThreadContext,
        availableAgents,
        metadata: {
          ...baseContext.metadata,
          availableThreads,
          currentThread: threadId,
          totalTaskMessages: allTaskMessages.length
        }
      };
    } catch (error) {
      console.error(`Failed to build optimized context: ${error}`);
      return await this.getAgentTaskContext(agentId, taskId);
    }
  }

  /**
   * Get all messages for an agent across the entire task (all threads)
   */
  private async getAgentFullTaskHistory(
    agentId: string,
    taskId: string
  ): Promise<ConversationMessage[]> {
    try {
      // Get all messages for this task
      const allMessages = await this.db.getTaskMessages(taskId, undefined, 1000);
      
      // Filter to messages that are:
      // 1. From this agent
      // 2. To this agent (mentioned)
      // 3. In threads where this agent is a participant
      // 4. In main conversation where this agent is a task participant
      
      const task = await this.db.getTask(taskId);
      const isTaskParticipant = task?.participants.includes(agentId) || false;
      
      // Get all threads where this agent is a participant
      const taskThreads = await this.db.listTaskThreads(taskId);
      const participantThreadIds = taskThreads
        .filter(thread => thread.participants.includes(agentId))
        .map(thread => thread.id);
      
      // Filter messages
      const relevantMessages = allMessages.filter(msg => {
        // Include if agent is sender
        if (msg.sender === agentId) return true;
        
        // Include if agent is mentioned
        if (msg.mentionedParticipants?.includes(agentId)) return true;
        
        // Include if message is in main conversation and agent is task participant
        if (!msg.threadId && isTaskParticipant) return true;
        
        // Include if message is in a thread where agent is participant
        if (msg.threadId && participantThreadIds.includes(msg.threadId)) return true;
        
        return false;
      });
      
      // Sort by timestamp
      return relevantMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (error) {
      console.error(`Failed to get agent full task history: ${error}`);
      return [];
    }
  }

  /**
   * Get thread IDs that an agent can access within a task
   */
  private async getAgentAccessibleThreads(
    agentId: string,
    taskId: string
  ): Promise<string[]> {
    try {
      const taskThreads = await this.db.listTaskThreads(taskId);
      return taskThreads
        .filter(thread => thread.participants.includes(agentId))
        .map(thread => thread.id);
    } catch (error) {
      console.error(`Failed to get agent accessible threads: ${error}`);
      return [];
    }
  }

  /**
   * Get agents available for collaboration but not currently in the conversation
   */
  private async getAvailableAgentsNotInConversation(
    agentId: string,
    taskId: string,
    threadId?: string
  ): Promise<import('../types.ts').AgentConfig[]> {
    try {
      const availableAgents: import('../types.ts').AgentConfig[] = [];
      
      // Get all agents in the task
      const task = await this.db.getTask(taskId);
      if (!task) return availableAgents;
      
      // Get current conversation participants
      let currentParticipants = [agentId];
      
      if (threadId) {
        // For thread conversations, get thread participants
        const thread = await this.db.getThread(threadId);
        if (thread) {
          currentParticipants = thread.participants;
        }
      } else {
        // For main conversation, we need to determine who's currently participating
        // This would typically be based on recent activity or explicit participation
        // For now, let's assume main conversation includes the current agent
        currentParticipants = [agentId];
      }
      
      // Find agents that are in the task but not in current conversation
      for (const participantId of task.participants) {
        if (!currentParticipants.includes(participantId)) {
          // Check if this is an agent (not a user)
          const agentConfig = this.agentRegistry.getAgentConfig(participantId);
          if (agentConfig) {
            availableAgents.push(agentConfig);
          }
        }
      }
      
      return availableAgents;
    } catch (error) {
      console.error(`Failed to get available agents not in conversation: ${error}`);
      return [];
    }
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  /**
   * Estimate token count for messages
   */
  private estimateTokenCount(messages: ConversationMessage[]): number {
    // Rough estimation: ~4 characters per token
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  /**
   * Optimize message history to fit within token limits
   */
  private optimizeMessageHistory(
    messages: ConversationMessage[],
    maxTokens: number
  ): ConversationMessage[] {
    if (messages.length === 0) return messages;

    let currentTokens = 0;
    const optimizedMessages: ConversationMessage[] = [];

    // Start from most recent messages and work backwards
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const messageTokens = this.estimateTokenCount([message]);
      
      if (currentTokens + messageTokens <= maxTokens) {
        optimizedMessages.unshift(message);
        currentTokens += messageTokens;
      } else {
        break;
      }
    }

    return optimizedMessages;
  }

  /**
   * Get recent messages with a sliding window approach
   */
  async getRecentMessages(
    taskId: string,
    threadId?: string,
    limit: number = 50
  ): Promise<ConversationMessage[]> {
    try {
      return await this.db.getTaskMessages(taskId, threadId, limit);
    } catch (error) {
      console.error(`Failed to get recent messages: ${error}`);
      return [];
    }
  }

  /**
   * Check if an agent has access to a specific context
   */
  async hasContextAccess(
    agentId: string,
    taskId: string,
    threadId?: string
  ): Promise<boolean> {
    try {
      // Check task access
      const task = await this.db.getTask(taskId);
      if (!task?.participants.includes(agentId)) {
        return false;
      }

      // Check thread access if specified
      if (threadId) {
        const thread = await this.db.getThread(threadId);
        return thread?.participants.includes(agentId) || false;
      }

      return true;
    } catch (error) {
      console.error(`Failed to check context access: ${error}`);
      return false;
    }
  }
} 