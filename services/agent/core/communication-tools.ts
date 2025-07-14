// =============================================================================
// COMMUNICATION TOOLS MANAGER - Handles communication tool calls
// =============================================================================

import type {
  CommunicationTool,
  ToolExecutionContext,
  ToolResult,
  ConversationMessage,
  ThreadCreatedEvent,
  CreateThreadRequest,
  AgentChatError,
  ErrorCodes
} from '../types.ts';

import { AgentChatDatabaseOperations } from '../database/operations.ts';

// =============================================================================
// COMMUNICATION TOOLS DEFINITIONS
// =============================================================================

export const communicationTools: CommunicationTool[] = [
  {
    name: "send",
    description: "Send a message to a specific thread or main conversation. If threadId is not provided, message goes to main conversation.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The message content to send"
        },
        threadId: {
          type: "string",
          description: "Optional thread ID to send message to. If not provided, sends to main conversation."
        }
      },
      required: ["message"]
    },
    execute: async () => ({ toolCallId: "", success: false, result: null }) // Will be overridden
  },

  {
    name: "create_thread",
    description: "Start a new thread for focused discussion with specific participants. Thread will be created immediately without waiting for responses.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Initial message for the thread"
        },
        participants: {
          type: "array",
          items: { type: "string" },
          description: "List of participants to include in the thread (agent names or 'user')"
        },
        purpose: {
          type: "string",
          description: "Brief description of what this thread is for"
        }
      },
      required: ["message", "participants", "purpose"]
    },
    execute: async () => ({ toolCallId: "", success: false, result: null }) // Will be overridden
  },

  {
    name: "end_thread",
    description: "End a thread with a summary. The summary will be posted to the parent thread or main conversation.",
    parameters: {
      type: "object",
      properties: {
        threadId: {
          type: "string",
          description: "ID of the thread to end"
        },
        thread_summary: {
          type: "string",
          description: "Summary of what was accomplished in the thread"
        }
      },
      required: ["threadId", "thread_summary"]
    },
    execute: async () => ({ toolCallId: "", success: false, result: null }) // Will be overridden
  },

  {
    name: "join_thread",
    description: "Join an existing thread in the current task",
    parameters: {
      type: "object",
      properties: {
        threadId: {
          type: "string", 
          description: "ID of the thread to join"
        },
        introduction_message: {
          type: "string",
          description: "Optional message to send when joining the thread"
        }
      },
      required: ["threadId"]
    },
    execute: async () => ({ toolCallId: "", success: false, result: null }) // Will be overridden
  },

  {
    name: "send_to_thread",
    description: "Send a message to a specific thread by purpose or ID. Use this to communicate across threads.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Message to send to the thread"
        },
        threadId: {
          type: "string",
          description: "Specific thread ID to send to (optional if using threadPurpose)"
        },
        threadPurpose: {
          type: "string", 
          description: "Purpose/description of the thread to send to (optional if using threadId)"
        }
      },
      required: ["message"]
    },
    execute: async () => ({ toolCallId: "", success: false, result: null }) // Will be overridden
  }
];

// =============================================================================
// COMMUNICATION TOOLS MANAGER CLASS
// =============================================================================

export class CommunicationToolsManager {
  private db: AgentChatDatabaseOperations;
  private callbacks: {
    onMessage?: (message: ConversationMessage) => void;
    onThreadCreated?: (event: ThreadCreatedEvent) => void;
    onThreadMessage?: (event: { threadId: string; taskId: string; message: string; sender: string }) => Promise<void>;
  };

  constructor(
    db: AgentChatDatabaseOperations,
    callbacks: {
      onMessage?: (message: ConversationMessage) => void;
      onThreadCreated?: (event: ThreadCreatedEvent) => void;
      onThreadMessage?: (event: { threadId: string; taskId: string; message: string; sender: string }) => Promise<void>;
    } = {}
  ) {
    this.db = db;
    this.callbacks = callbacks;
    this.setupToolExecutors();
  }

  /**
   * Set the thread message callback after initialization
   */
  setThreadMessageCallback(callback: (event: { threadId: string; taskId: string; message: string; sender: string }) => Promise<void>) {
    this.callbacks.onThreadMessage = callback;
  }

  /**
   * Bind execution methods to communication tools
   */
  private setupToolExecutors(): void {
    const toolMap = new Map(communicationTools.map(tool => [tool.name, tool]));

    // Bind send
    const sendTool = toolMap.get('send')!;
    sendTool.execute = this.executeSend.bind(this);

    // Bind create_thread
    const createThreadTool = toolMap.get('create_thread')!;
    createThreadTool.execute = this.executeCreateThread.bind(this);

    // Bind end_thread
    const endThreadTool = toolMap.get('end_thread')!;
    endThreadTool.execute = this.executeEndThread.bind(this);

    // Bind join_thread
    const joinThreadTool = toolMap.get('join_thread')!;
    joinThreadTool.execute = this.executeJoinThread.bind(this);

    // Bind send_to_thread
    const sendToThreadTool = toolMap.get('send_to_thread')!;
    sendToThreadTool.execute = this.executeSendToThread.bind(this);
  }

  /**
   * Get all communication tools
   */
  getCommunicationTools(): CommunicationTool[] {
    return communicationTools;
  }

  /**
   * Execute a communication tool by name
   */
  async executeTool(
    toolName: string,
    parameters: any,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const tool = communicationTools.find(t => t.name === toolName);
    
    if (!tool) {
      return {
        toolCallId: context.messageId || '',
        success: false,
        result: null,
        error: `Unknown communication tool: ${toolName}`
      };
    }

    try {
      return await tool.execute(parameters, context);
    } catch (error) {
      return {
        toolCallId: context.messageId || '',
        success: false,
        result: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // =============================================================================
  // TOOL EXECUTION METHODS
  // =============================================================================

  /**
   * Universal message storage and processing - handles both notifications and thread processing
   */
  private async storeAndProcessMessage(
    messageData: Omit<ConversationMessage, 'id' | 'timestamp'>
  ): Promise<string> {
    const messageId = await this.db.addMessage(messageData);

    const fullMessage = {
      ...messageData,
      id: messageId,
      timestamp: new Date()
    };

    // Always trigger user notification callback
    if (this.callbacks?.onMessage) {
      this.callbacks.onMessage(fullMessage);
    }

    // If this is a thread message, automatically trigger thread processing for other participants
    if (messageData.threadId && this.callbacks?.onThreadMessage) {
      await this.callbacks.onThreadMessage({
        threadId: messageData.threadId,
        taskId: messageData.taskId,
        message: messageData.content,
        sender: messageData.sender
      });
    }

    return messageId;
  }

  /**
   * Send a message to the main conversation (can be used from any context)
   */
  async executeSend(
    params: { message: string; threadId?: string },
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    try {
      const message: Omit<ConversationMessage, 'id' | 'timestamp'> = {
        taskId: context.taskId,
        threadId: params.threadId || undefined,
        sender: context.agentId,
        senderType: 'agent',
        content: params.message,
        messageType: 'message',
        metadata: {
          toolUsed: 'send',
          executionContext: context.messageId
        }
      };

      // Validate thread access if sending to thread
      if (params.threadId) {
        const thread = await this.db.getThread(params.threadId);
        if (!thread) {
          return {
            toolCallId: context.messageId || '',
            success: false,
            result: null,
            error: `Thread ${params.threadId} not found`
          };
        }
        if (!thread.participants.includes(context.agentId)) {
          return {
            toolCallId: context.messageId || '',
            success: false,
            result: null,
            error: `Agent ${context.agentId} is not a participant in thread ${params.threadId}`
          };
        }
      }

      // Use universal method - automatically handles both callbacks and thread processing
      const messageId = await this.storeAndProcessMessage(message);

      return {
        toolCallId: context.messageId || '',
        success: true,
        result: {
          messageId,
          threadId: params.threadId || undefined,
          message: params.message
        }
      };
    } catch (error) {
      return {
        toolCallId: context.messageId || '',
        success: false,
        result: null,
        error: `Failed to send message: ${error.message}`
      };
    }
  }

  /**
   * Create a new thread
   */
  private async executeCreateThread(
    params: { message: string; participants: string[]; purpose: string },
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    try {

      // Validate participants
      const validParticipants = this.validateParticipants(params.participants, context.taskId);
      
      // Create thread
      const threadRequest: CreateThreadRequest = {
        taskId: context.taskId,
        purpose: params.purpose,
        participants: [context.agentId, ...validParticipants],
        parentMessageId: context.messageId,
        initialMessage: params.message
      };

      const threadId = await this.db.createThread({
        taskId: threadRequest.taskId,
        purpose: threadRequest.purpose,
        participants: threadRequest.participants,
        status: 'active',
        parentMessageId: threadRequest.parentMessageId
      });

      // Add initial message to thread
      const initialMessage: Omit<ConversationMessage, 'id' | 'timestamp'> = {
        taskId: context.taskId,
        threadId,
        sender: context.agentId,
        senderType: 'agent',
        content: params.message,
        messageType: 'message',
        metadata: {
          toolUsed: 'create_thread',
          threadPurpose: params.purpose,
          isInitialMessage: true
        }
      };

      // Store initial message but DON'T trigger thread processing yet (that will be async)
      const messageId = await this.db.addMessage(initialMessage);

      // Trigger user notification callback only
      if (this.callbacks?.onMessage) {
        this.callbacks.onMessage({
          ...initialMessage,
          id: messageId,
          timestamp: new Date()
        });
      }

      // Trigger thread creation callback
      if (this.callbacks?.onThreadCreated) {
        const event: ThreadCreatedEvent = {
          threadId,
          taskId: context.taskId,
          purpose: params.purpose,
          participants: threadRequest.participants,
          createdBy: context.agentId,
          initialMessage: {
            ...initialMessage,
            id: messageId,
            timestamp: new Date()
          }
        };
        this.callbacks.onThreadCreated(event);
      }

      // Schedule async thread processing (don't await - let it run in background)
      if (this.callbacks?.onThreadMessage) {
        // Use setImmediate/setTimeout to process thread message asynchronously
        setTimeout(async () => {
          try {
            await this.callbacks.onThreadMessage({
              threadId,
              taskId: context.taskId,
              message: params.message,
              sender: context.agentId
            });
          } catch (error) {
            console.error('❌ Async thread processing failed:', error);
          }
        }, 10); // Small delay to ensure tool result is processed first
      }

      // Return immediately - thread processing happens in background
      return {
        toolCallId: context.messageId || '',
        success: true,
        result: {
          threadId,
          messageId,
          purpose: params.purpose,
          participants: threadRequest.participants,
          asyncProcessing: true // Indicate that background processing started
        }
      };
    } catch (error) {
      return {
        toolCallId: context.messageId || '',
        success: false,
        result: null,
        error: `Failed to create thread: ${error.message}`
      };
    }
  }

  /**
   * End a thread with a summary.
   */
  private async executeEndThread(
    params: { threadId: string; thread_summary: string },
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    try {
      const thread = await this.db.getThread(params.threadId);
      if (!thread) {
        return {
          toolCallId: context.messageId || '',
          success: false,
          result: null,
          error: `Thread ${params.threadId} not found`
        };
      }

      if (!thread.participants.includes(context.agentId)) {
        return {
          toolCallId: context.messageId || '',
          success: false,
          result: null,
          error: `Agent ${context.agentId} is not a participant in thread ${params.threadId}`
        };
      }

      // 1. Create summary message in the current thread
      const threadSummaryMessage: Omit<ConversationMessage, 'id' | 'timestamp'> = {
        taskId: context.taskId,
        threadId: params.threadId,
        sender: context.agentId,
        senderType: 'agent',
        content: `🔒 Thread closed with summary: ${params.thread_summary}`,
        messageType: 'summary',
        metadata: {
          toolUsed: 'end_thread',
          isSummary: true,
          isThreadClosure: true
        }
      };

      const threadMessageId = await this.storeAndProcessMessage(threadSummaryMessage);

      // 2. Send summary to parent (main conversation or parent thread)
      const parentSummaryMessage: Omit<ConversationMessage, 'id' | 'timestamp'> = {
        taskId: context.taskId,
        threadId: undefined, // Send to main conversation
        sender: context.agentId,
        senderType: 'agent',
        content: `📋 Thread "${thread.purpose}" completed:\n\n${params.thread_summary}`,
        messageType: 'message',
        metadata: {
          toolUsed: 'end_thread',
          isThreadSummary: true,
          sourceThreadId: params.threadId,
          sourceThreadPurpose: thread.purpose,
          requiresParentProcessing: true // Flag for explicit parent processing
        }
      };

      // Store summary in parent conversation WITHOUT auto-triggering thread processing
      // (since this is going to main conversation, not a thread)
      const parentMessageId = await this.db.addMessage(parentSummaryMessage);

      // Trigger user notification callback for parent summary
      if (this.callbacks?.onMessage) {
        this.callbacks.onMessage({
          ...parentSummaryMessage,
          id: parentMessageId,
          timestamp: new Date()
        });
      }

      // 3. Explicitly trigger parent conversation processing for the summary
      // This ensures other agents in the main conversation can respond to the thread summary
      if (this.callbacks?.onThreadMessage) {
        // Use setTimeout to process parent conversation asynchronously (similar to create_thread)
        setTimeout(async () => {
          try {
            await this.callbacks.onThreadMessage({
              threadId: undefined, // Main conversation
              taskId: context.taskId,
              message: `📋 Thread "${thread.purpose}" completed:\n\n${params.thread_summary}`,
              sender: context.agentId
            });
          } catch (error) {
            console.error('❌ Parent conversation processing for thread summary failed:', error);
          }
        }, 50); // Slightly longer delay to ensure thread closure is complete
      }

      // 4. Close the thread (sets status to 'resolved')
      await this.db.closeThread(params.threadId);

      return {
        toolCallId: context.messageId || '',
        success: true,
        result: {
          threadMessageId,
          parentMessageId,
          threadId: params.threadId,
          summary: params.thread_summary,
          threadClosed: true,
          parentProcessingTriggered: true // Indicate that parent processing was initiated
        }
      };
    } catch (error) {
      return {
        toolCallId: context.messageId || '',
        success: false,
        result: null,
        error: `Failed to end thread: ${error.message}`
      };
    }
  }

  /**
   * Join an existing thread
   */
  private async executeJoinThread(
    params: { threadId: string; introduction_message?: string },
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    try {

      // Verify thread exists
      const thread = await this.db.getThread(params.threadId);
      if (!thread) {
        return {
          toolCallId: context.messageId || '',
          success: false,
          result: null,
          error: `Thread ${params.threadId} not found`
        };
      }

      // Check if already a participant
      if (thread.participants.includes(context.agentId)) {
        return {
          toolCallId: context.messageId || '',
          success: true,
          result: {
            message: 'Already a participant in this thread',
            threadId: params.threadId
          }
        };
      }

      // Add agent to thread
      await this.db.addParticipantToThread(params.threadId, context.agentId);

      // Send introduction message if provided
      let messageId: string | undefined;
      if (params.introduction_message) {
        const introMessage: Omit<ConversationMessage, 'id' | 'timestamp'> = {
          taskId: context.taskId,
          threadId: params.threadId,
          sender: context.agentId,
          senderType: 'agent',
          content: params.introduction_message,
          messageType: 'message',
          metadata: {
            toolUsed: 'join_thread',
            isIntroduction: true
          }
        };

        messageId = await this.db.addMessage(introMessage);

        // Trigger callback
        if (this.callbacks?.onMessage) {
          this.callbacks.onMessage({
            ...introMessage,
            id: messageId,
            timestamp: new Date()
          });
        }
      }

      return {
        toolCallId: context.messageId || '',
        success: true,
        result: {
          threadId: params.threadId,
          messageId,
          joinedSuccessfully: true
        }
      };
    } catch (error) {
      return {
        toolCallId: context.messageId || '',
        success: false,
        result: null,
        error: `Failed to join thread: ${error.message}`
      };
    }
  }

  /**
   * Send a message to a specific thread by ID or purpose
   */
  private async executeSendToThread(
    params: { message: string; threadId?: string; threadPurpose?: string },
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    try {
      let targetThreadId = params.threadId;

      // If no threadId provided, find thread by purpose
      if (!targetThreadId && params.threadPurpose) {
        const taskThreads = await this.db.listTaskThreads(context.taskId);
        const matchingThread = taskThreads.find(t => 
          t.purpose.toLowerCase().includes(params.threadPurpose!.toLowerCase()) &&
          t.participants.includes(context.agentId) &&
          t.status === 'active'
        );
        
        if (matchingThread) {
          targetThreadId = matchingThread.id;
        } else {
          return {
            toolCallId: context.messageId || '',
            success: false,
            result: null,
            error: `No active thread found with purpose containing "${params.threadPurpose}" that you can access`
          };
        }
      }

      if (!targetThreadId) {
        return {
          toolCallId: context.messageId || '',
          success: false,
          result: null,
          error: 'Either threadId or threadPurpose must be provided'
        };
      }

      // Verify thread access
      const thread = await this.db.getThread(targetThreadId);
      if (!thread) {
        return {
          toolCallId: context.messageId || '',
          success: false,
          result: null,
          error: `Thread ${targetThreadId} not found`
        };
      }

      if (!thread.participants.includes(context.agentId)) {
        return {
          toolCallId: context.messageId || '',
          success: false,
          result: null,
          error: `You are not a participant in thread "${thread.purpose}"`
        };
      }

      if (thread.status !== 'active') {
        return {
          toolCallId: context.messageId || '',
          success: false,
          result: null,
          error: `Thread "${thread.purpose}" is ${thread.status} and cannot receive new messages`
        };
      }

      // Send message to the thread
      const message: Omit<ConversationMessage, 'id' | 'timestamp'> = {
        taskId: context.taskId,
        threadId: targetThreadId,
        sender: context.agentId,
        senderType: 'agent',
        content: params.message,
        messageType: 'message',
        metadata: {
          toolUsed: 'send_to_thread',
          sourceThreadId: context.threadId, // Where this was sent from
          targetThreadPurpose: thread.purpose
        }
      };

      // Use universal method - automatically handles both callbacks and thread processing
      const messageId = await this.storeAndProcessMessage(message);

      return {
        toolCallId: context.messageId || '',
        success: true,
        result: {
          messageId,
          threadId: targetThreadId,
          threadPurpose: thread.purpose,
          messageSent: true
        }
      };
    } catch (error) {
      return {
        toolCallId: context.messageId || '',
        success: false,
        result: null,
        error: `Failed to send message to thread: ${error.message}`
      };
    }
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  /**
   * Validate that participants exist and are part of the task
   */
  private validateParticipants(participants: string[], taskId: string): string[] {
    // For now, just return the participants as-is
    // In a full implementation, this would check against task participants
    // and validate that agent names exist in the agent registry
    return participants.filter(p => p !== ''); // Remove empty strings
  }

  /**
   * Check if an agent can access a thread
   */
  async canAccessThread(agentId: string, threadId: string): Promise<boolean> {
    try {
      const thread = await this.db.getThread(threadId);
      return thread?.participants.includes(agentId) || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get available threads for an agent in a task
   */
  async getAvailableThreads(agentId: string, taskId: string): Promise<any[]> {
    try {
      const threads = await this.db.listTaskThreads(taskId);
      return threads.filter(thread => thread.participants.includes(agentId));
    } catch (error) {
      return [];
    }
  }

  /**
   * Get thread participants
   */
  async getThreadParticipants(threadId: string): Promise<string[]> {
    try {
      const thread = await this.db.getThread(threadId);
      return thread?.participants || [];
    } catch (error) {
      return [];
    }
  }
} 