// =============================================================================
// CONVERSATION ENGINE - Main message processing and agent orchestration
// =============================================================================

import type {
  ConversationMessage,
  MessageProcessingResult,
  AgentResponse,
  ToolResult,
  AgentConversationContext,
  ThreadCreatedEvent,
  AgentJoinedEvent,
  ToolCall
} from '../types.ts';

import {
  AgentChatError,
  ErrorCodes
} from '../types.ts';

import { AgentChatDatabaseOperations } from '../database/operations.ts';
import { AgentRegistry } from './agent-registry.ts';
import { ContextManager } from './context-manager.ts';
import { CommunicationToolsManager } from './communication-tools.ts';
import { UnifiedConversationProcessor } from './unified-conversation-processor.ts';

// =============================================================================
// CONVERSATION ENGINE CLASS
// =============================================================================

export class ConversationEngine {
  private db: AgentChatDatabaseOperations;
  private agentRegistry: AgentRegistry;
  private contextManager: ContextManager;
  private communicationTools: CommunicationToolsManager;
  private callbacks: any;
  private toolRegistry?: import('../plugin-system.ts').ToolRegistry;
  
  // Unified conversation processor
  private unifiedProcessor: UnifiedConversationProcessor;

  constructor(
    db: AgentChatDatabaseOperations,
    agentRegistry: AgentRegistry,
    contextManager: ContextManager,
    communicationTools: CommunicationToolsManager,
    callbacks: any,
    toolRegistry?: import('../plugin-system.ts').ToolRegistry
  ) {
    this.db = db;
    this.agentRegistry = agentRegistry;
    this.contextManager = contextManager;
    this.communicationTools = communicationTools;
    this.callbacks = callbacks;
    this.toolRegistry = toolRegistry;
    
    // Initialize unified processor
    this.unifiedProcessor = new UnifiedConversationProcessor(
      db,
      agentRegistry,
      contextManager,
      communicationTools,
      callbacks,
      toolRegistry
    );
  }

  /**
   * Process a message and coordinate agent responses using unified processor
   */
  async processMessage(
    message: string,
    taskId: string,
    userId: string,
    threadId?: string
  ): Promise<MessageProcessingResult> {
    try {
      console.log(`🎯 [ConversationEngine] Processing message via unified processor`);

      // Create unified conversation context
      const context = await this.unifiedProcessor.createContextFromUserMessage(
        message,
        taskId,
        userId,
        threadId
      );

      // Process conversation using unified processor
      const result = await this.unifiedProcessor.processConversation(context);

      // Convert unified result to legacy format
      return {
        taskId: result.taskId,
        messageId: result.messageIds[0] || '', // First message is the user message
        agentResponses: result.agentResponses,
        threadsCreated: result.threadsCreated
      };

    } catch (error) {
      console.error(`Failed to process message: ${error}`);
      
      if (this.callbacks?.onError) {
        this.callbacks.onError(error);
      }

      throw new AgentChatError(
        `Message processing failed: ${error.message}`,
        ErrorCodes.MESSAGE_PROCESSING_ERROR,
        { originalError: error }
      );
    }
  }

  /**
   * Handle thread message processing - automatically triggered when thread messages are created
   */
  async handleThreadMessage(threadId: string, taskId: string, message: string, sender: string): Promise<void> {
    try {
      console.log(`🧵 [ConversationEngine] Handling thread message via unified processor`);
      
      // Create unified conversation context for thread message
      const context = await this.unifiedProcessor.createContextFromThreadMessage(
        message,
        threadId,
        taskId,
        sender
      );

      // Process conversation using unified processor
      await this.unifiedProcessor.processConversation(context);
      
    } catch (error) {
      console.error(`Failed to handle thread message: ${error}`);
    }
  }

  // =============================================================================
  // THREAD MANAGEMENT
  // =============================================================================

  /**
   * Handle thread creation from agent tool calls
   */
  async handleThreadCreation(
    agentId: string,
    taskId: string,
    purpose: string,
    participants: string[],
    initialMessage: string
  ): Promise<string> {
    try {

      // Create thread
      const threadId = await this.db.createThread({
        taskId,
        purpose,
        participants: [agentId, ...participants],
        status: 'active'
      });

      // Add initial message
      const initialMessageData: Omit<ConversationMessage, 'id' | 'timestamp'> = {
        taskId,
        threadId,
        sender: agentId,
        senderType: 'agent',
        content: initialMessage,
        messageType: 'message',
        metadata: {
          isThreadInitialMessage: true,
          threadPurpose: purpose
        }
      };

      const messageId = await this.db.addMessage(initialMessageData);

      // Trigger callbacks
      if (this.callbacks?.onThreadCreated) {
        const event: ThreadCreatedEvent = {
          threadId,
          taskId,
          purpose,
          participants: [agentId, ...participants],
          createdBy: agentId,
          initialMessage: {
            ...initialMessageData,
            id: messageId,
            timestamp: new Date()
          }
        };
        this.callbacks.onThreadCreated(event);
      }

      if (this.callbacks?.onMessage) {
        this.callbacks.onMessage({
          ...initialMessageData,
          id: messageId,
          timestamp: new Date()
        });
      }

      return threadId;
    } catch (error) {
      console.error('Failed to handle thread creation:', error);
      throw error;
    }
  }

  // =============================================================================
  // UTILITIES
  // =============================================================================

  /**
   * Get conversation statistics
   */
  async getConversationStats(taskId: string): Promise<Record<string, any>> {
    try {
      const task = await this.db.getTask(taskId);
      const messages = await this.db.getTaskMessages(taskId, undefined, 1000);
      const threads = await this.db.listTaskThreads(taskId);

      // Count messages by sender
      const messageCounts: Record<string, number> = {};
      for (const message of messages) {
        messageCounts[message.sender] = (messageCounts[message.sender] || 0) + 1;
      }

      return {
        taskId,
        totalMessages: messages.length,
        totalThreads: threads.length,
        participants: task?.participants || [],
        messageCounts,
        lastActivity: task?.lastActivity,
        status: task?.status
      };
    } catch (error) {
      console.error('Failed to get conversation stats:', error);
      return {
        taskId,
        totalMessages: 0,
        totalThreads: 0,
        participants: [],
        messageCounts: {},
        error: (error as any).message
      };
    }
  }

  /**
   * Check if the conversation engine is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check all components are available
      const hasDb = !!this.db;
      const hasAgentRegistry = !!this.agentRegistry;
      const hasContextManager = !!this.contextManager;
      const hasCommunicationTools = !!this.communicationTools;

      return hasDb && hasAgentRegistry && hasContextManager && hasCommunicationTools;
    } catch (error) {
      console.error('Conversation engine health check failed:', error);
      return false;
    }
  }
} 