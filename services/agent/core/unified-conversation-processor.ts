// =============================================================================
// UNIFIED CONVERSATION PROCESSOR - Single generalized conversation handler
// =============================================================================

import type {
  UnifiedConversationContext,
  ConversationTrigger,
  ConversationProcessor,
  ConversationProcessingResult,
  ConversationProcessingConfig,
  AgentResponse,
  ToolCall,
  ToolResult,
  ConversationMessage,
  TaskContext,
  ThreadContext,
  ContextWindow,
  AgentConversationContext
} from '../types.ts';

import {
  AgentChatError,
  ErrorCodes
} from '../types.ts';

import { AgentChatDatabaseOperations } from '../database/operations.ts';
import { AgentRegistry } from './agent-registry.ts';
import { ContextManager } from './context-manager.ts';
import { CommunicationToolsManager } from './communication-tools.ts';

// =============================================================================
// UNIFIED CONVERSATION PROCESSOR
// =============================================================================

export class UnifiedConversationProcessor implements ConversationProcessor {
  private db: AgentChatDatabaseOperations;
  private agentRegistry: AgentRegistry;
  private contextManager: ContextManager;
  private communicationTools: CommunicationToolsManager;
  private callbacks: any;
  private toolRegistry?: import('../plugin-system.ts').ToolRegistry;
  
  // Default configuration
  private defaultConfig: ConversationProcessingConfig = {
    maxDepth: 10,
    maxContinuations: 5,
    useConfigOrder: true,
    parallelProcessing: false,
    enableToolCalling: true,
    toolExecutionTimeout: 30000,
    storeIntermediateResults: true,
    consolidateMessages: true,
    enableAutoContinuation: true,
    continuationTimeout: 5000
  };

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
  }

  /**
   * Core unified conversation processing method
   * Handles ALL conversation scenarios through a single, generalized flow
   */
  async processConversation(
    context: UnifiedConversationContext,
    config?: Partial<ConversationProcessingConfig>
  ): Promise<ConversationProcessingResult> {
    const fullConfig = { ...this.defaultConfig, ...config };
    const processingId = this.generateProcessingId();
    const startTime = Date.now();

    try {
      console.log(`🔄 [Unified Processor] Starting conversation processing [${processingId}]`);
      console.log(`   → Trigger: ${context.trigger.type} from ${context.trigger.sender}`);
      console.log(`   → Context: Task ${context.taskId}${context.threadId ? `, Thread ${context.threadId}` : ''}`);
      console.log(`   → Depth: ${context.processingDepth}/${fullConfig.maxDepth}`);

      // Depth check to prevent infinite recursion
      if (context.processingDepth >= fullConfig.maxDepth) {
        throw new AgentChatError(
          `Maximum processing depth (${fullConfig.maxDepth}) exceeded`,
          ErrorCodes.PROCESSING_ERROR,
          { processingDepth: context.processingDepth, processingId }
        );
      }

      // Initialize result
      const result: ConversationProcessingResult = {
        processingId,
        taskId: context.taskId,
        threadId: context.threadId,
        processingTime: 0,
        processingDepth: context.processingDepth,
        messageIds: [],
        agentResponses: [],
        toolResults: [],
        threadsCreated: [],
        agentsJoined: [],
        continuationRequired: false,
        success: false,
        errors: [],
        parentProcessingId: context.parentProcessingId,
        childProcessingIds: []
      };

      // Step 1: Store trigger message if it's a new external message
      if (this.shouldStoreTriggerMessage(context)) {
        const messageId = await this.storeTriggerMessage(context);
        result.messageIds.push(messageId);
      }

      // Step 2: Determine and order relevant agents
      const relevantAgents = await this.determineRelevantAgents(context);
      console.log(`   → Relevant agents: ${relevantAgents.join(', ')}`);

      // Step 3: Process agents based on context type
      if (context.metadata.isThreadContext && fullConfig.parallelProcessing) {
        // In threads: process agents in parallel for efficiency (but ensure tool calls are sequential per agent)
        const agentPromises = relevantAgents.map(async (agentId) => {
          try {
            const agentResult = await this.processAgentInConversation(agentId, context, fullConfig);
            
            // Trigger callbacks
            if (fullConfig.onAgentResponse) {
              fullConfig.onAgentResponse(agentResult.response, context);
            }
            
            return { success: true, agentId, result: agentResult };
          } catch (error) {
            console.error(`❌ Agent ${agentId} processing failed:`, error);
            const agentError = new AgentChatError(
              `Agent ${agentId} processing failed: ${error.message}`,
              ErrorCodes.AGENT_ERROR,
              { agentId, originalError: error }
            );
            
            if (fullConfig.onError) {
              fullConfig.onError(agentError, context);
            }
            
            return { success: false, agentId, error: agentError };
          }
        });

        const agentResults = await Promise.all(agentPromises);
        
        // Merge successful results
        for (const result_item of agentResults) {
          if (result_item.success) {
            result.agentResponses.push(result_item.result.response);
            result.messageIds.push(...result_item.result.messageIds);
            result.toolResults.push(...result_item.result.toolResults);
            result.threadsCreated.push(...result_item.result.threadsCreated);
          } else {
            result.errors.push(result_item.error);
          }
        }
      } else {
        // Main conversation: process agents sequentially for predictable order
        for (const agentId of relevantAgents) {
          try {
            const agentResult = await this.processAgentInConversation(agentId, context, fullConfig);
            
            // Merge agent results
            result.agentResponses.push(agentResult.response);
            result.messageIds.push(...agentResult.messageIds);
            result.toolResults.push(...agentResult.toolResults);
            result.threadsCreated.push(...agentResult.threadsCreated);

            // Trigger callbacks
            if (fullConfig.onAgentResponse) {
              fullConfig.onAgentResponse(agentResult.response, context);
            }

          } catch (error) {
            console.error(`❌ Agent ${agentId} processing failed:`, error);
            const agentError = new AgentChatError(
              `Agent ${agentId} processing failed: ${error.message}`,
              ErrorCodes.AGENT_ERROR,
              { agentId, originalError: error }
            );
            result.errors.push(agentError);
            
            if (fullConfig.onError) {
              fullConfig.onError(agentError, context);
            }
          }
        }
      }

      // Step 4: Determine if continuation is needed
      // if (fullConfig.enableAutoContinuation) {
        const continuationDecision = await this.shouldContinueProcessing(result, context);
        
        if (continuationDecision.continue) {
          result.continuationRequired = true;
          result.continuationContext = continuationDecision.newContext;
          
          console.log(`🔄 Continuation required: ${continuationDecision.reason}`);
          
          if (fullConfig.onContinuation) {
            fullConfig.onContinuation(continuationDecision.reason!, context);
          }

          // Recursive processing
          const continuationResult = await this.processConversation(
            continuationDecision.newContext!,
            fullConfig
          );

          // Merge continuation results
          result.childProcessingIds.push(continuationResult.processingId);
          result.messageIds.push(...continuationResult.messageIds);
          result.agentResponses.push(...continuationResult.agentResponses);
          result.toolResults.push(...continuationResult.toolResults);
          result.threadsCreated.push(...continuationResult.threadsCreated);
          result.agentsJoined.push(...continuationResult.agentsJoined);
          result.errors.push(...continuationResult.errors);
        }
      // }

      // Step 5: Finalize result
      result.processingTime = Date.now() - startTime;
      result.success = result.errors.length === 0;

      console.log(`✅ [Unified Processor] Completed processing [${processingId}] in ${result.processingTime}ms`);
      console.log(`   → Messages: ${result.messageIds.length}, Responses: ${result.agentResponses.length}, Tools: ${result.toolResults.length}`);

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ [Unified Processor] Processing failed [${processingId}]:`, error);
      
      const processError = new AgentChatError(
        `Unified conversation processing failed: ${error.message}`,
        ErrorCodes.MESSAGE_PROCESSING_ERROR,
        { processingTime, processingId, originalError: error }
      );

      if (fullConfig.onError) {
        fullConfig.onError(processError, context);
      }

      throw processError;
    }
  }

  /**
   * Process a single agent within the conversation context
   */
  private async processAgentInConversation(
    agentId: string,
    context: UnifiedConversationContext,
    config: ConversationProcessingConfig
  ): Promise<{
    response: AgentResponse;
    messageIds: string[];
    toolResults: Array<{toolCall: ToolCall, result: ToolResult}>;
    threadsCreated: string[];
  }> {
    console.log(`🤖 Processing agent: ${agentId}`);

    // Get agent instance
    const agent = this.agentRegistry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Build agent-specific context
    const agentContext = await this.buildAgentContextFromUnified(agentId, context);

    // Get agent response
    const agentResponse = await agent.process(context.trigger.content, agentContext);

    const result = {
      response: agentResponse,
      messageIds: [] as string[],
      toolResults: [] as Array<{toolCall: ToolCall, result: ToolResult}>,
      threadsCreated: [] as string[]
    };

    // Store original agent response
    if (config.storeIntermediateResults) {
      const messageId = await this.storeAgentResponse(agentResponse, context, { isOriginal: true });
      result.messageIds.push(messageId);
    }

    // Execute tool calls if present
    if (agentResponse.toolCalls && agentResponse.toolCalls.length > 0 && config.enableToolCalling) {
      console.log(`🔧 Executing ${agentResponse.toolCalls.length} tool calls`);

      for (const toolCall of agentResponse.toolCalls) {
        try {
          const toolResult = await this.executeToolCall(toolCall, agentId, context);
          result.toolResults.push({ toolCall, result: toolResult });

          // Track thread creation
          if (toolCall.name === 'create_thread' && toolResult.success && toolResult.result?.threadId) {
            result.threadsCreated.push(toolResult.result.threadId);
          }

          if (config.onToolExecution) {
            config.onToolExecution(toolCall, toolResult, context);
          }

        } catch (error) {
          console.error(`❌ Tool ${toolCall.name} execution failed:`, error);
          const toolResult: ToolResult = {
            toolCallId: toolCall.id,
            success: false,
            result: null,
            error: error.message
          };
          result.toolResults.push({ toolCall, result: toolResult });
        }
      }

      // Store tool results if configured
      if (config.storeIntermediateResults && result.toolResults.length > 0) {
        const toolResultsMessageId = await this.storeToolResults(result.toolResults, agentId, context);
        result.messageIds.push(toolResultsMessageId);
      }
    }

    return result;
  }

  /**
   * Determine if processing should continue with unified logic
   */
  async shouldContinueProcessing(
    result: ConversationProcessingResult,
    context: UnifiedConversationContext
  ): Promise<{ continue: boolean; reason?: string; newContext?: UnifiedConversationContext }> {
    
    // Don't continue if we have errors
    if (result.errors.length > 0) {
      return { continue: false, reason: 'Processing errors occurred' };
    }

    // For tool results continuation: only continue if we have successful tool results and reasonable depth
    const hasTools = result.toolResults.length > 0;
    if (hasTools && context.processingDepth < 10) {
      // Continue processing tool results, but limit depth to prevent infinite loops
      const toolResultsContent = this.buildToolResultsMessage(result.toolResults);
      
      // Refresh message history to include newly stored messages
      const firstAgent = result.agentResponses[0]?.agent;
      const updatedMessageHistory = await this.getRelevantMessageHistory(context.taskId, context.threadId, firstAgent);
      
      const newContext: UnifiedConversationContext = {
        ...context,
        trigger: {
          type: 'tool_results',
          content: toolResultsContent,
          sender: 'system',
          senderType: 'system',
          toolResults: result.toolResults,
          metadata: { parentProcessingId: result.processingId }
        },
        messageHistory: updatedMessageHistory,
        contextWindow: this.buildContextWindow(updatedMessageHistory),
        processingDepth: context.processingDepth + 1,
        parentProcessingId: result.processingId,
        continuationReason: 'Tool results require further processing',
        metadata: {
          ...context.metadata,
          isRecursive: true,
          processingStartTime: Date.now()
        }
      };

      return { 
        continue: true, 
        reason: 'Tool results indicate continuation needed',
        newContext 
      };
    }

    // Enhanced thread continuation logic: enable proper sequential conversation flow
    if (context.threadId && context.metadata.isThreadContext) {
      // Check if we should continue thread conversation
      const threadContinuation = await this.evaluateThreadContinuation(result, context);
      if (threadContinuation.continue) {
        return threadContinuation;
      }
    }

    return { continue: false, reason: 'No continuation needed' };
  }

  /**
   * Enhanced thread continuation logic - evaluates if thread conversation should continue
   * and determines next participants
   */
  private async evaluateThreadContinuation(
    result: ConversationProcessingResult,
    context: UnifiedConversationContext
  ): Promise<{ continue: boolean; reason?: string; newContext?: UnifiedConversationContext }> {
    
    // Don't continue if max depth reached
    if (context.processingDepth >= 8) { // Reasonable limit for thread conversations
      return { continue: false, reason: 'Maximum thread depth reached' };
    }

    // Don't continue if no meaningful responses were generated
    if (result.agentResponses.length === 0) {
      return { continue: false, reason: 'No agent responses to continue from' };
    }

    // Get thread info
    const thread = await this.db.getThread(context.threadId!);
    if (!thread || thread.status !== 'active') {
      console.log(`🔄 Ending thread ${context.threadId} because it is not active`);
      return { continue: false, reason: 'Thread is not active' };
    }

    // Get the latest message to determine who just spoke
    const latestMessages = await this.db.getTaskMessages(context.taskId, context.threadId, 3);
    if (latestMessages.length === 0) {
      console.log(`🔄 Ending thread ${context.threadId} because it has no messages`);
      return { continue: false, reason: 'No messages found in thread' };
    }

    const latestMessage = latestMessages[latestMessages.length - 1];
    const lastSender = latestMessage.sender;

    // Determine who should respond next (all participants except the last sender)
    const allParticipants = thread.participants.filter(p => this.agentRegistry.hasAgent(p));
    const nextResponders = allParticipants.filter(p => p !== lastSender);

    // Don't continue if no one else to respond
    if (nextResponders.length === 0) {
      console.log(`🔄 Ending thread ${context.threadId} because there are no other participants to continue`);
      return { continue: false, reason: 'No other participants to continue thread' };
    }

    // Check conversation natural ending signals
    const shouldEnd = await this.detectThreadNaturalEnding(latestMessages, context);
    if (shouldEnd.shouldEnd) {
      console.log(`🔄 Ending thread ${context.threadId} because it should end naturally`);
      return { continue: false, reason: shouldEnd.reason };
    }

    // Refresh message history to include latest responses
    const updatedMessageHistory = await this.getRelevantMessageHistory(
      context.taskId, 
      context.threadId, 
      nextResponders[0]
    );

    // Create continuation context with the last agent response as trigger
    const lastAgentResponse = result.agentResponses[result.agentResponses.length - 1];
    const continuationContent = lastAgentResponse?.content || latestMessage.content;

    const newContext: UnifiedConversationContext = {
      ...context,
      trigger: {
        type: 'thread_continuation',
        content: continuationContent,
        sender: lastSender,
        senderType: 'agent',
        metadata: { 
          parentProcessingId: result.processingId,
          continuationStep: (context.metadata.continuationStep || 0) + 1
        }
      },
      relevantAgents: nextResponders,
      excludedAgents: [lastSender], // Exclude the agent who just responded
      messageHistory: updatedMessageHistory,
      contextWindow: this.buildContextWindow(updatedMessageHistory),
      processingDepth: context.processingDepth + 1,
      parentProcessingId: result.processingId,
      continuationReason: `Thread continuation: ${nextResponders.join(', ')} responding to ${lastSender}`,
      metadata: {
        ...context.metadata,
        isRecursive: true,
        continuationStep: (context.metadata.continuationStep || 0) + 1,
        processingStartTime: Date.now()
      }
    };

    return {
      continue: true,
      reason: `Thread continuation: ${nextResponders.length} participants ready to respond`,
      newContext
    };
  }

  /**
   * Detect natural ending signals in thread conversations
   * Enhanced with comprehensive closure detection patterns
   */
  private async detectThreadNaturalEnding(
    recentMessages: ConversationMessage[],
    context: UnifiedConversationContext
  ): Promise<{ shouldEnd: boolean; reason?: string }> {
    
    if (recentMessages.length < 1) {
      return { shouldEnd: false };
    }

    // Get thread metadata for comprehensive analysis
    const thread = await this.db.getThread(context.threadId!);
    if (!thread) {
      return { shouldEnd: true, reason: 'Thread no longer exists' };
    }

    // Check thread inactivity timeout
    const inactivityCheck = this.checkThreadInactivity(thread, recentMessages);
    if (inactivityCheck.shouldEnd) {
      return inactivityCheck;
    }

    // Check for explicit ending mechanisms
    const explicitEndingCheck = this.checkExplicitEndingSignals(recentMessages);
    if (explicitEndingCheck.shouldEnd) {
      return explicitEndingCheck;
    }

    // Check for conversation loops
    const loopDetectionCheck = this.detectConversationLoops(recentMessages);
    if (loopDetectionCheck.shouldEnd) {
      return loopDetectionCheck;
    }

    return { shouldEnd: false };
  }

  /**
   * Check if thread has been inactive for too long
   */
  private checkThreadInactivity(
    thread: any, 
    recentMessages: ConversationMessage[]
  ): { shouldEnd: boolean; reason?: string } {
    
    if (recentMessages.length === 0) {
      return { shouldEnd: false };
    }

    const lastMessage = recentMessages[recentMessages.length - 1];
    const lastMessageTime = new Date(lastMessage.timestamp).getTime();
    const currentTime = Date.now();
    const inactivityHours = (currentTime - lastMessageTime) / (1000 * 60 * 60);

    // End thread if inactive for more than 24 hours
    if (inactivityHours > 24) {
      return {
        shouldEnd: true,
        reason: `Thread inactive for ${Math.round(inactivityHours)} hours - auto-closing`
      };
    }

    return { shouldEnd: false };
  }

  /**
   * Check for explicit ending signals
   */
  private checkExplicitEndingSignals(
    recentMessages: ConversationMessage[]
  ): { shouldEnd: boolean; reason?: string } {
    
    const lastTwoMessages = recentMessages.slice(-2);
    
    // Check for explicit ending tools or commands
    const hasEndThreadTool = lastTwoMessages.some(msg => 
      msg.metadata?.toolUsed === 'end_thread'
    );
    if (hasEndThreadTool) {
      return {
        shouldEnd: true,
        reason: 'Thread explicitly ended by participant'
      };
    }

    return { shouldEnd: false };
  }

  /**
   * Detect conversation loops (repetitive patterns)
   */
  private detectConversationLoops(
    recentMessages: ConversationMessage[]
  ): { shouldEnd: boolean; reason?: string } {
    
    if (recentMessages.length < 4) {
      return { shouldEnd: false };
    }

    const lastMessages = recentMessages.slice(-4);
    
    // Check for same agent responding multiple times with similar content
    const agentMessages = new Map<string, string[]>();
    for (const message of lastMessages) {
      if (!agentMessages.has(message.sender)) {
        agentMessages.set(message.sender, []);
      }
      agentMessages.get(message.sender)!.push(message.content);
    }

    // Check for repetitive responses from the same agent
    for (const [agent, messages] of agentMessages.entries()) {
      if (messages.length >= 2) {
        for (let i = 0; i < messages.length - 1; i++) {
          const similarity = this.calculateStringSimilarity(messages[i], messages[i + 1]);
          if (similarity > 0.8) {
            return {
              shouldEnd: true,
              reason: `Repetitive responses detected from ${agent} - preventing loop`
            };
          }
        }
      }
    }

    // Check for conversational deadlock (back-and-forth with no progress)
    if (lastMessages.length >= 4) {
      const isDeadlock = this.detectConversationalDeadlock(lastMessages);
      if (isDeadlock) {
        return {
          shouldEnd: true,
          reason: 'Conversational deadlock detected - no progress being made'
        };
      }
    }

    return { shouldEnd: false };
  }

  /**
   * Detect conversational deadlock patterns
   */
  private detectConversationalDeadlock(messages: ConversationMessage[]): boolean {
    if (messages.length < 4) return false;

    // Check for repetitive questions without answers
    const questionPatterns = /\?$/;
    let consecutiveQuestions = 0;
    
    for (const message of messages) {
      if (questionPatterns.test(message.content.trim())) {
        consecutiveQuestions++;
      } else {
        consecutiveQuestions = 0;
      }
      
      if (consecutiveQuestions >= 3) {
        return true; // Too many unanswered questions
      }
    }

    return false;
  }

  /**
   * Simple string similarity calculation for loop detection
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = Math.max(words1.length, words2.length);
    
    return totalWords > 0 ? commonWords.length / totalWords : 0;
  }

  // Helper methods for context creation
  async createContextFromUserMessage(
    message: string,
    taskId: string,
    userId: string,
    threadId?: string
  ): Promise<UnifiedConversationContext> {
    const task = await this.db.getTask(taskId);
    if (!task) {
      throw new AgentChatError(`Task ${taskId} not found`, ErrorCodes.PROCESSING_ERROR);
    }

    const threadContext = threadId ? await this.db.getThread(threadId) : undefined;
    const availableAgents = this.agentRegistry.getAgentIdsInConfigOrder();
    const relevantAgents = await this.determineRelevantAgentsForMessage(message, task.participants, threadContext?.participants);
    
    // Get comprehensive message history for the first relevant agent (they all see the same task scope)
    const messageHistory = await this.getRelevantMessageHistory(taskId, threadId, relevantAgents[0]);

    return {
      taskId,
      threadId,
      trigger: {
        type: 'user_message',
        content: message,
        sender: userId,
        senderType: 'user'
      },
      taskContext: task,
      threadContext,
      availableAgents,
      relevantAgents,
      excludedAgents: [userId], // Exclude user from responses
      messageHistory,
      contextWindow: this.buildContextWindow(messageHistory),
      processingDepth: 0,
      availableTools: this.getAvailableTools(),
      toolRegistry: this.toolRegistry,
      metadata: {
        isRecursive: false,
        isThreadContext: !!threadId,
        triggerType: 'user_message',
        processingStartTime: Date.now()
      }
    };
  }

  async createContextFromToolResults(
    toolResults: Array<{toolCall: ToolCall, result: ToolResult}>,
    agentId: string,
    taskId: string,
    threadId?: string
  ): Promise<UnifiedConversationContext> {
    const task = await this.db.getTask(taskId);
    if (!task) {
      throw new AgentChatError(`Task ${taskId} not found`, ErrorCodes.PROCESSING_ERROR);
    }

    const threadContext = threadId ? await this.db.getThread(threadId) : undefined;
    const toolResultsContent = this.buildToolResultsMessage(toolResults);
    
    // Get comprehensive message history for the agent who executed tools
    const messageHistory = await this.getRelevantMessageHistory(taskId, threadId, agentId);

    return {
      taskId,
      threadId,
      trigger: {
        type: 'tool_results',
        content: toolResultsContent,
        sender: agentId,
        senderType: 'agent',
        toolResults
      },
      taskContext: task,
      threadContext,
      availableAgents: this.agentRegistry.getAgentIdsInConfigOrder(),
      relevantAgents: [agentId], // Only the agent that executed tools
      excludedAgents: [],
      messageHistory,
      contextWindow: this.buildContextWindow(messageHistory),
      processingDepth: 1, // This is a recursive call
      availableTools: this.getAvailableTools(),
      toolRegistry: this.toolRegistry,
      metadata: {
        isRecursive: true,
        isThreadContext: !!threadId,
        triggerType: 'tool_results',
        processingStartTime: Date.now()
      }
    };
  }

  async createContextFromThreadMessage(
    message: string,
    threadId: string,
    taskId: string,
    sender: string
  ): Promise<UnifiedConversationContext> {
    const task = await this.db.getTask(taskId);
    
    if (!task) {
      throw new AgentChatError(`Task ${taskId} not found`, ErrorCodes.PROCESSING_ERROR);
    }

    // Handle thread summary messages in main conversation (threadId = undefined) differently
    if (!threadId) {
      return this.createContextFromThreadSummary(message, taskId, sender, task);
    }

    // Regular thread message processing
    const thread = await this.db.getThread(threadId);
    if (!thread) {
      throw new AgentChatError(`Thread ${threadId} not found`, ErrorCodes.PROCESSING_ERROR);
    }

    const relevantAgents = thread.participants.filter(p => 
      p !== sender && this.agentRegistry.hasAgent(p)
    );
    
    // Get comprehensive message history for the first relevant agent
    const messageHistory = await this.getRelevantMessageHistory(taskId, threadId, relevantAgents[0]);

    return {
      taskId,
      threadId,
      trigger: {
        type: 'thread_message',
        content: message,
        sender,
        senderType: this.agentRegistry.hasAgent(sender) ? 'agent' : 'user'
      },
      taskContext: task,
      threadContext: thread,
      availableAgents: this.agentRegistry.getAgentIdsInConfigOrder(),
      relevantAgents,
      excludedAgents: [sender], // Exclude sender to prevent loops
      messageHistory,
      contextWindow: this.buildContextWindow(messageHistory),
      processingDepth: 0,
      availableTools: this.getAvailableTools(),
      toolRegistry: this.toolRegistry,
      metadata: {
        isRecursive: false,
        isThreadContext: true,
        triggerType: 'thread_message',
        processingStartTime: Date.now()
      }
    };
  }

  /**
   * Create context for thread summary messages in main conversation
   * These require special handling to engage relevant agents who can act on the summary
   */
  private async createContextFromThreadSummary(
    message: string,
    taskId: string,
    sender: string,
    task: any
  ): Promise<UnifiedConversationContext> {
    
    // Determine agents who should respond to thread summaries
    // This includes:
    // 1. Agents not involved in the closed thread (to get fresh perspective)
    // 2. Coordinator agents who manage overall task flow
    // 3. Agents whose roles are relevant to the thread outcomes
    
    const allTaskAgents = task.participants.filter(p => this.agentRegistry.hasAgent(p));
    const availableAgents = this.agentRegistry.getAgentIdsInConfigOrder();
    
    // Extract source thread info from message
    const threadIdMatch = message.match(/Thread "([^"]+)" completed/);
    const threadPurpose = threadIdMatch ? threadIdMatch[1] : '';
    
    // Get the closed thread to determine its participants
    let closedThreadParticipants: string[] = [];
    if (threadPurpose) {
      const recentThreads = await this.db.listTaskThreads(taskId);
      const closedThread = recentThreads.find(t => 
        t.purpose === threadPurpose && t.status === 'resolved'
      );
      if (closedThread) {
        closedThreadParticipants = closedThread.participants;
      }
    }

    // Determine relevant agents for thread summary processing
    let relevantAgents = this.determineThreadSummaryAgents(
      allTaskAgents,
      closedThreadParticipants,
      sender,
      threadPurpose,
      message
    );

    // Get comprehensive message history for main conversation context
    const messageHistory = await this.getRelevantMessageHistory(taskId, undefined, relevantAgents[0]);

    return {
      taskId,
      threadId: undefined, // Main conversation
      trigger: {
        type: 'thread_message',
        content: message,
        sender,
        senderType: this.agentRegistry.hasAgent(sender) ? 'agent' : 'user',
        metadata: {
          isThreadSummary: true,
          sourceThreadPurpose: threadPurpose,
          closedThreadParticipants
        }
      },
      taskContext: task,
      threadContext: undefined,
      availableAgents,
      relevantAgents,
      excludedAgents: [sender], // Exclude sender to prevent loops
      messageHistory,
      contextWindow: this.buildContextWindow(messageHistory),
      processingDepth: 0,
      availableTools: this.getAvailableTools(),
      toolRegistry: this.toolRegistry,
      metadata: {
        isRecursive: false,
        isThreadContext: false, // Main conversation processing
        isThreadSummaryProcessing: true,
        triggerType: 'thread_summary',
        sourceThreadPurpose: threadPurpose,
        processingStartTime: Date.now()
      }
    };
  }

  /**
   * Determine which agents should respond to thread summaries
   */
  private determineThreadSummaryAgents(
    allTaskAgents: string[],
    closedThreadParticipants: string[],
    sender: string,
    threadPurpose: string,
    summaryContent: string
  ): string[] {
    
    // Start with agents not involved in the closed thread
    let candidateAgents = allTaskAgents.filter(agent => 
      !closedThreadParticipants.includes(agent) && agent !== sender
    );

    // If no external agents available, include some thread participants (except sender)
    if (candidateAgents.length === 0) {
      candidateAgents = closedThreadParticipants.filter(agent => agent !== sender);
    }

    // Prioritize agents based on thread purpose and summary content
    const prioritizedAgents = this.prioritizeAgentsForSummary(
      candidateAgents,
      threadPurpose,
      summaryContent
    );

    // Limit to most relevant agents (max 3 for main conversation processing)
    return prioritizedAgents.slice(0, 3);
  }

  /**
   * Prioritize agents for thread summary processing based on relevance
   */
  private prioritizeAgentsForSummary(
    candidateAgents: string[],
    threadPurpose: string,
    summaryContent: string
  ): string[] {
    
    const purpose = threadPurpose.toLowerCase();
    const content = summaryContent.toLowerCase();
    
    // Create priority scoring for agents
    const agentScores = candidateAgents.map(agentId => {
      let score = 1; // Base score
      
      // Prioritize coordinator agents for any thread completion
      if (agentId.toLowerCase().includes('coordinator') || agentId.toLowerCase().includes('manager')) {
        score += 3;
      }
      
      // Prioritize based on thread purpose relevance
      if (purpose.includes('planning') && agentId.toLowerCase().includes('plan')) score += 2;
      if (purpose.includes('research') && agentId.toLowerCase().includes('research')) score += 2;
      if (purpose.includes('decision') && agentId.toLowerCase().includes('decision')) score += 2;
      if (purpose.includes('technical') && agentId.toLowerCase().includes('tech')) score += 2;
      if (purpose.includes('business') && agentId.toLowerCase().includes('business')) score += 2;
      
      // Prioritize based on summary content keywords
      const actionKeywords = ['action', 'next', 'implement', 'execute', 'deploy'];
      const reviewKeywords = ['review', 'feedback', 'approve', 'validate'];
      const decisionKeywords = ['decision', 'choice', 'select', 'recommend'];
      
      if (actionKeywords.some(keyword => content.includes(keyword))) {
        if (agentId.toLowerCase().includes('executor') || agentId.toLowerCase().includes('implement')) score += 2;
      }
      
      if (reviewKeywords.some(keyword => content.includes(keyword))) {
        if (agentId.toLowerCase().includes('review') || agentId.toLowerCase().includes('quality')) score += 2;
      }
      
      if (decisionKeywords.some(keyword => content.includes(keyword))) {
        if (agentId.toLowerCase().includes('decision') || agentId.toLowerCase().includes('lead')) score += 2;
      }
      
      return { agentId, score };
    });
    
    // Sort by score (descending) and return agent IDs
    return agentScores
      .sort((a, b) => b.score - a.score)
      .map(item => item.agentId);
  }

  // Private helper methods (continued in next part due to length)
  private generateProcessingId(): string {
    return `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private shouldStoreTriggerMessage(context: UnifiedConversationContext): boolean {
    // Store new user messages, but not thread messages (they're already stored by thread creation tools)
    // and not recursive tool results
    return context.trigger.type === 'user_message';
  }

  private async storeTriggerMessage(context: UnifiedConversationContext): Promise<string> {
    const messageData: Omit<ConversationMessage, 'id' | 'timestamp'> = {
      taskId: context.taskId,
      threadId: context.threadId,
      sender: context.trigger.sender,
      senderType: context.trigger.senderType,
      content: context.trigger.content,
      messageType: 'message',
      metadata: {
        processingStartTime: context.metadata.processingStartTime,
        triggerType: context.trigger.type
      }
    };

    // Use universal method - don't trigger thread processing for user messages 
    // (thread processing happens after agents respond)
    return await this.storeAndProcessMessage(messageData, false);
  }

  /**
   * Universal message storage and processing method
   * Handles both user notifications and thread processing automatically
   */
  private async storeAndProcessMessage(
    messageData: Omit<ConversationMessage, 'id' | 'timestamp'>,
    triggerThreadProcessing: boolean = true
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

    // If this is a thread message and we want to trigger processing, do so
    if (messageData.threadId && triggerThreadProcessing && this.callbacks?.onThreadMessage) {
      await this.callbacks.onThreadMessage({
        threadId: messageData.threadId,
        taskId: messageData.taskId,
        message: messageData.content,
        sender: messageData.sender
      });
    }

    return messageId;
  }

  private async storeAgentResponse(
    response: AgentResponse,
    context: UnifiedConversationContext,
    metadata: { isOriginal?: boolean; isFinal?: boolean } = {}
  ): Promise<string> {
    const messageData: Omit<ConversationMessage, 'id' | 'timestamp'> = {
      taskId: context.taskId,
      threadId: context.threadId,
      sender: response.agent,
      senderType: 'agent',
      content: response.content,
      messageType: 'response',
      metadata: {
        ...response.metadata,
        ...metadata,
        hasToolCalls: response.toolCalls && response.toolCalls.length > 0
      }
    };

    // Use the universal method - it handles both callbacks automatically
    return await this.storeAndProcessMessage(messageData, true);
  }

  private async storeToolResults(
    toolResults: Array<{toolCall: ToolCall, result: ToolResult}>,
    agentId: string,
    context: UnifiedConversationContext
  ): Promise<string> {
    const toolResultsMessage = this.buildToolResultsMessage(toolResults);
    
    const messageData: Omit<ConversationMessage, 'id' | 'timestamp'> = {
      taskId: context.taskId,
      threadId: context.threadId,
      sender: agentId,
      senderType: 'agent',
      content: toolResultsMessage,
      messageType: 'message',
      metadata: {
        isToolResultsMessage: true,
        toolCallsProcessed: toolResults.length,
        toolExecutionSummary: toolResults.map(tr => ({
          tool: tr.toolCall.name,
          success: tr.result.success
        }))
      }
    };

    const messageId = await this.db.addMessage(messageData);

    // Trigger callback
    if (this.callbacks?.onMessage) {
      this.callbacks.onMessage({
        ...messageData,
        id: messageId,
        timestamp: new Date()
      });
    }

    return messageId;
  }

  private buildToolResultsMessage(
    toolResults: Array<{toolCall: ToolCall, result: ToolResult}>
  ): string {
    const successfulResults = toolResults.filter(tr => tr.result.success);
    const failedResults = toolResults.filter(tr => !tr.result.success);
    
    let message = "📋 Tool Execution Summary:\n\n";
    
    if (successfulResults.length > 0) {
      message += "✅ Successful:\n";
      successfulResults.forEach(tr => {
        const shortId = tr.toolCall.id.substring(0, 8);
        const resultStr = typeof tr.result.result === 'object' 
          ? JSON.stringify(tr.result.result, null, 2)
          : String(tr.result.result);
        message += `• ${tr.toolCall.name} [${shortId}]: ${resultStr}\n`;
      });
    }
    
    if (failedResults.length > 0) {
      message += "\n❌ Failed:\n";
      failedResults.forEach(tr => {
        const shortId = tr.toolCall.id.substring(0, 8);
        message += `• ${tr.toolCall.name} [${shortId}]: ${tr.result.error}\n`;
      });
    }
    
    message += "\n💭 What should be done next based on these results?";
    
    return message;
  }

  // Additional helper methods would continue here...
  // (I'll implement the remaining methods in the next steps)
  
  private async determineRelevantAgents(context: UnifiedConversationContext): Promise<string[]> {
    // For now, use the pre-determined relevant agents from context
    // This can be enhanced with more sophisticated agent selection logic
    return this.agentRegistry.orderAgentsByConfigOrder(context.relevantAgents);
  }

  private async determineRelevantAgentsForMessage(
    message: string,
    taskParticipants: string[],
    threadParticipants?: string[]
  ): Promise<string[]> {
    // Use existing logic from ConversationEngine for now
    const participants = threadParticipants || taskParticipants;
    return participants.filter(p => this.agentRegistry.hasAgent(p));
  }

  /**
   * Get appropriate message history based on context
   * - In thread context: Only messages from that specific thread
   * - In main conversation: Comprehensive history across all open threads the agent participates in
   */
  private async getRelevantMessageHistory(taskId: string, threadId?: string, agentId?: string): Promise<ConversationMessage[]> {
    if (!agentId) {
      // Legacy fallback - get messages from current context only
      return await this.db.getTaskMessages(taskId, threadId, 50);
    }

    // If we're in a specific thread context, only return messages from that thread
    if (threadId) {
      const threadMessages = await this.db.getTaskMessages(taskId, threadId, 100);
      return threadMessages.map(msg => ({
        ...msg,
        metadata: {
          ...msg.metadata,
          conversationContext: {
            type: 'thread',
            taskId: taskId,
            threadId: threadId
          }
        }
      }));
    }

    // For main conversation: Get comprehensive view across all open threads
    const taskThreads = await this.db.listTaskThreads(taskId);
    const openThreads = taskThreads.filter(t => 
      t.status === 'active' && t.participants.includes(agentId)
    );
    
    // Collect messages from main conversation and all open threads
    const allMessages: ConversationMessage[] = [];
    
    // 1. Main conversation messages (threadId = null)
    const mainMessages = await this.db.getTaskMessages(taskId, undefined, 100);
    allMessages.push(...mainMessages.map(msg => ({
      ...msg,
      metadata: {
        ...msg.metadata,
        conversationContext: {
          type: 'main',
          taskId: taskId,
          threadId: null
        }
      }
    })));
    
    // 2. Messages from all open threads agent participates in
    for (const thread of openThreads) {
      const threadMessages = await this.db.getTaskMessages(taskId, thread.id, 100);
      allMessages.push(...threadMessages.map(msg => ({
        ...msg,
        metadata: {
          ...msg.metadata,
          conversationContext: {
            type: 'thread',
            taskId: taskId,
            threadId: thread.id,
            threadPurpose: thread.purpose,
            threadStatus: thread.status
          }
        }
      })));
    }
    
    // Sort by timestamp and return recent messages (limit to 150 total)
    return allMessages
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-150);
  }

  private buildContextWindow(messages: ConversationMessage[]): ContextWindow {
    // Simplified context window for now
    return {
      messages,
      maxTokens: 4000,
      currentTokens: messages.length * 100, // Rough estimate
      truncated: false
    };
  }

  private getAvailableTools(): string[] {
    return this.toolRegistry?.getAllTools().map(t => t.name) || [];
  }

  private async buildAgentContextFromUnified(
    agentId: string,
    context: UnifiedConversationContext
  ): Promise<AgentConversationContext> {
    // Get comprehensive thread information for this agent
    const allTaskThreads = await this.db.listTaskThreads(context.taskId);
    const accessibleThreads = allTaskThreads.filter(t => t.participants.includes(agentId));
    const openThreads = accessibleThreads.filter(t => t.status === 'active');
    const closedThreads = accessibleThreads.filter(t => t.status === 'resolved');

    // Convert unified context to enhanced agent context format with thread awareness
    const allAgents = await this.agentRegistry.getAllAgents();
    return {
      taskId: context.taskId,
      threadId: context.threadId,
      messageHistory: context.messageHistory,
      taskContext: context.taskContext,
      threadContext: context.threadContext,
      otherParticipants: context.relevantAgents.filter(id => id !== agentId),
      availableTools: context.availableTools,
      availableAgents: allAgents
        .filter(a => a.config.name !== agentId)
        .map(a => a.config),
      
      // Enhanced thread awareness
      metadata: {
        accessibleThreads: accessibleThreads.map(t => ({
          id: t.id,
          purpose: t.purpose,
          status: t.status,
          participants: t.participants,
          createdAt: t.createdAt,
          lastActivity: t.lastActivity
        })),
        openThreadCount: openThreads.length,
        closedThreadCount: closedThreads.length,
        currentThreadInfo: context.threadId ? {
          isInThread: true,
          threadId: context.threadId,
          threadPurpose: context.threadContext?.purpose,
          threadParticipants: context.threadContext?.participants
        } : {
          isInThread: false,
          isInMainConversation: true
        },
        conversationScope: context.messageHistory.length > 0 ? 
          `Viewing ${context.messageHistory.length} messages across ${openThreads.length + 1} conversations (main + ${openThreads.length} open threads)` :
          'No previous conversation history'
      }
    };
  }

  private async executeToolCall(
    toolCall: ToolCall,
    agentId: string,
    context: UnifiedConversationContext
  ): Promise<ToolResult> {
    const toolExecutionContext = {
      taskId: context.taskId,
      threadId: context.threadId,
      agentId,
      userId: context.trigger.sender // Approximate user ID
    };

    // First, try to execute as a communication tool
    const communicationTools = this.communicationTools.getCommunicationTools();
    const isCommunicationTool = communicationTools.some(tool => tool.name === toolCall.name);
    
    if (isCommunicationTool) {
      return await this.communicationTools.executeTool(toolCall.name, toolCall.parameters, toolExecutionContext);
    }

    // If not a communication tool, try the external tool registry
    if (this.toolRegistry) {
      return await this.toolRegistry.executeTool(toolCall.name, toolCall.parameters, toolExecutionContext);
    } else {
      return {
        toolCallId: toolCall.id || '',
        success: false,
        result: null,
        error: `Tool '${toolCall.name}' not found in communication tools or tool registry`
      };
    }
  }
} 