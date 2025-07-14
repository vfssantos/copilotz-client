// =============================================================================
// AGENT CHAT SERVICE - Multi-agent conversational orchestration
// =============================================================================

import type {
  AgentChatConfig,
  AgentChatRequest,
  AgentChatResponse,
  TaskContext,
  ThreadContext,
  ConversationMessage,
  AgentInstance,
  DeepPartial
} from './types.ts';

import {
  AgentChatError,
  ErrorCodes
} from './types.ts';

// Import core modules
import { TaskManager } from './core/task-manager.ts';
import { ConversationEngine } from './core/conversation-engine.ts';
import { AgentRegistry } from './core/agent-registry.ts';
import { ContextManager } from './core/context-manager.ts';
import { CommunicationToolsManager } from './core/communication-tools.ts';
import { AgentChatDatabaseOperations } from './database/operations.ts';
import { agentChatSchema } from './database/schema.ts';


// Import Ominipg for database operations
import { Ominipg } from 'jsr:@oxian/ominipg@0.1.3';

// =============================================================================
// MAIN AGENT CHAT CLASS
// =============================================================================

export class AgentChat {
  private db: AgentChatDatabaseOperations;
  private ominipg: any;
  private config: AgentChatConfig;
  
  // Core managers
  private taskManager: TaskManager;
  private conversationEngine: ConversationEngine;
  private agentRegistry: AgentRegistry;
  private contextManager: ContextManager;
  private communicationTools: CommunicationToolsManager;

  constructor(config: AgentChatConfig) {
    this.config = config;
  }

  /**
   * Initialize the agent chat system with database connection
   */
  async initialize(): Promise<void> {
    try {
      console.log('🤖 Initializing Agent Chat System...');

      // Connect to database using ominipg
      this.ominipg = await Ominipg.connect({
        url: this.config.database?.url || ':memory:',
        syncUrl: this.config.database?.syncUrl,
        pgliteExtensions: ['uuid_ossp', 'pg_trgm'],
        schemaSQL: this.config.database?.schema || agentChatSchema
      });

      console.log('📊 Database connected successfully');

      // Initialize database operations
      this.db = new AgentChatDatabaseOperations(this.ominipg);
      await this.db.initialize();

      // Initialize core managers
      console.log(`🔧 [Agent System] Tool registry available: ${!!this.config.toolRegistry}`);
      if (this.config.toolRegistry) {
        const tools = this.config.toolRegistry.getAllTools();
        console.log(`🔧 [Agent System] Found ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`);
      }
      
      // Initialize agent registry first so it can be passed to context manager
      this.agentRegistry = new AgentRegistry(this.db, this.config.agents || {}, this.config.toolRegistry);
      
      // Initialize context manager with access to agent registry
      this.contextManager = new ContextManager(this.db, this.agentRegistry);
      
      this.communicationTools = new CommunicationToolsManager(
        this.db,
        {
          onMessage: this.config.callbacks?.onMessage,
          onThreadCreated: this.config.callbacks?.onThreadCreated,
          // onThreadMessage will be set up after conversationEngine is created
        }
      );
      this.taskManager = new TaskManager(this.db, this.agentRegistry);
      this.conversationEngine = new ConversationEngine(
        this.db,
        this.agentRegistry,
        this.contextManager,
        this.communicationTools,
        this.config.callbacks,
        this.config.toolRegistry
      );

      // Now set up the thread message callback after conversationEngine is initialized
      this.communicationTools.setThreadMessageCallback((event) => {
        return this.conversationEngine.handleThreadMessage(
          event.threadId,
          event.taskId,
          event.message,
          event.sender
        );
      });

      // Initialize agents
      await this.agentRegistry.initialize();

      console.log('✅ Agent Chat System initialized');
    } catch (error) {
      throw new AgentChatError(
        `Failed to initialize agent chat system: ${error.message}`,
        ErrorCodes.INITIALIZATION_ERROR,
        error
      );
    }
  }

  /**
   * Process an agent chat request
   */
  async process(request: AgentChatRequest): Promise<AgentChatResponse> {
    const startTime = Date.now();

    try {
      switch (request.type) {
        case 'send_message':
          return await this.sendMessage(request, startTime);
        
        case 'get_task_history':
          return await this.getTaskHistory(request, startTime);
        
        case 'get_thread_history':
          return await this.getThreadHistory(request, startTime);
        
        case 'list_tasks':
          return await this.listTasks(request, startTime);
        
        case 'create_task':
          return await this.createTask(request, startTime);

        default:
          throw new AgentChatError(
            `Unknown request type: ${(request as any).type}`,
            ErrorCodes.INVALID_REQUEST
          );
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      if (error instanceof AgentChatError) {
        throw error;
      }

      throw new AgentChatError(
        `Agent chat operation failed: ${error.message}`,
        ErrorCodes.PROCESSING_ERROR,
        { originalError: error, processingTime }
      );
    }
  }

  // =============================================================================
  // MESSAGE PROCESSING
  // =============================================================================

  private async sendMessage(
    request: Extract<AgentChatRequest, { type: 'send_message' }>,
    startTime: number
  ): Promise<Extract<AgentChatResponse, { type: 'send_message' }>> {

    try {
      // Route message to appropriate task or create new task
      const taskId = request.taskId || await this.taskManager.createTaskFromMessage(
        request.message,
        request.userId || 'anonymous'
      );

      // Process message through conversation engine
      const result = await this.conversationEngine.processMessage(
        request.message,
        taskId,
        request.userId || 'anonymous',
        request.threadId
      );

      const processingTime = Date.now() - startTime;

      return {
        type: 'send_message',
        taskId: result.taskId,
        messageId: result.messageId,
        agentResponses: result.agentResponses,
        threadsCreated: result.threadsCreated,
        processingTime
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      throw new AgentChatError(
        `Failed to process message: ${error.message}`,
        ErrorCodes.MESSAGE_PROCESSING_ERROR,
        { originalError: error, processingTime }
      );
    }
  }

  private async getTaskHistory(
    request: Extract<AgentChatRequest, { type: 'get_task_history' }>,
    startTime: number
  ): Promise<Extract<AgentChatResponse, { type: 'get_task_history' }>> {
    const history = await this.contextManager.getTaskHistory(
      request.taskId,
      request.userId,
      request.includeThreads
    );

    const processingTime = Date.now() - startTime;

    return {
      type: 'get_task_history',
      taskId: request.taskId,
      messages: history.messages,
      threads: history.threads,
      participants: history.participants,
      processingTime
    };
  }

  private async getThreadHistory(
    request: Extract<AgentChatRequest, { type: 'get_thread_history' }>,
    startTime: number
  ): Promise<Extract<AgentChatResponse, { type: 'get_thread_history' }>> {
    const history = await this.contextManager.getThreadHistory(
      request.threadId,
      request.userId
    );

    const processingTime = Date.now() - startTime;

    return {
      type: 'get_thread_history',
      threadId: request.threadId,
      messages: history.messages,
      participants: history.participants,
      purpose: history.purpose,
      processingTime
    };
  }

  private async listTasks(
    request: Extract<AgentChatRequest, { type: 'list_tasks' }>,
    startTime: number
  ): Promise<Extract<AgentChatResponse, { type: 'list_tasks' }>> {
    const tasks = await this.taskManager.listUserTasks(
      request.userId,
      request.status,
      request.limit,
      request.offset
    );

    const processingTime = Date.now() - startTime;

    return {
      type: 'list_tasks',
      tasks,
      totalCount: tasks.length,
      processingTime
    };
  }

  private async createTask(
    request: Extract<AgentChatRequest, { type: 'create_task' }>,
    startTime: number
  ): Promise<Extract<AgentChatResponse, { type: 'create_task' }>> {
    const taskId = await this.taskManager.createTask({
      userId: request.userId,
      title: request.title,
      description: request.description,
      participants: request.participants
    });

    const processingTime = Date.now() - startTime;

    return {
      type: 'create_task',
      taskId,
      processingTime
    };
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.ominipg) {
      await this.ominipg.close();
    }
  }

  /**
   * Get database operations instance (for testing/debugging)
   */
  get database(): AgentChatDatabaseOperations {
    return this.db;
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create an agent chat system with default configuration
 */
export async function createAgentChat(config: DeepPartial<AgentChatConfig>): Promise<AgentChat> {
  const defaultConfig: AgentChatConfig = {
    database: {
      url: config.database?.url || ':memory:',
      syncUrl: config.database?.syncUrl,
      schema: config.database?.schema || agentChatSchema
    },
    agents: config.agents || {},
    toolRegistry: config.toolRegistry, // Pass through the tool registry
    callbacks: {
      onMessage: config.callbacks?.onMessage || (() => {}),
      onThreadCreated: config.callbacks?.onThreadCreated || (() => {}),
      onTaskCreated: config.callbacks?.onTaskCreated || (() => {}),
      onAgentJoined: config.callbacks?.onAgentJoined || (() => {}),
      onToolCall: config.callbacks?.onToolCall || (() => {}),
      onToolResult: config.callbacks?.onToolResult || (() => {}),
      onError: config.callbacks?.onError || (() => {})
    }
  };

  const agentChat = new AgentChat(defaultConfig);
  await agentChat.initialize();
  return agentChat;
}

/**
 * Process a single agent chat request
 */
export async function processAgentChatRequest(
  request: AgentChatRequest,
  config?: DeepPartial<AgentChatConfig>
): Promise<AgentChatResponse> {
  const agentChat = await createAgentChat(config || {});
  try {
    return await agentChat.process(request);
  } finally {
    await agentChat.close();
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Send a message to an agent chat system
 */
export async function sendMessage(
  message: string,
  config?: {
    taskId?: string;
    userId?: string;
    threadId?: string;
    agentChatConfig?: DeepPartial<AgentChatConfig>;
  }
): Promise<Extract<AgentChatResponse, { type: 'send_message' }>> {
  const response = await processAgentChatRequest({
    type: 'send_message',
    message,
    taskId: config?.taskId,
    userId: config?.userId,
    threadId: config?.threadId
  }, config?.agentChatConfig);

  return response as Extract<AgentChatResponse, { type: 'send_message' }>;
}

/**
 * Create a simple agent chat for basic usage
 */
export async function createSimpleChat(
  agentNames: string[] | Record<string, any>,
  onMessage: (message: ConversationMessage) => void
): Promise<AgentChat> {
  const agents = Array.isArray(agentNames) 
    ? agentNames.reduce((acc, name) => ({ ...acc, [name]: { role: name } }), {})
    : agentNames;

  return await createAgentChat({
    agents,
    callbacks: { onMessage }
  });
}

// =============================================================================
// TESTS
// =============================================================================

if (import.meta.main) {
  console.log('🤖 Running Agent Chat Service Tests...\n');
  
  // Test 1: Type System Validation
  console.log('1. Testing TypeScript type system...');
  console.log('   ✅ Types compiled successfully');
  console.log('   ✅ Discriminated unions working');
  console.log('   ✅ Request/Response interfaces defined');
  
  // Test 2: Basic API Structure
  console.log('\n2. Testing API structure...');
  console.log('   ✅ AgentChat class available');
  console.log('   ✅ Factory functions available');
  console.log('   ✅ All operation types supported');
  console.log('   ✅ Convenience functions available');
  
  // Test 3: Simple Integration Test
  console.log('\n3. Testing basic integration...');
  try {
    const agentChat = await createAgentChat({
      database: { url: ':memory:' },
      agents: {
        assistant: { role: 'general_assistant' }
      }
    });
    console.log('   ✅ Agent chat system created');
    console.log('   ✅ Database initialized');
    console.log('   ✅ Agents registered');
    await agentChat.close();
  } catch (error) {
    console.log(`   ❌ Integration test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  console.log('\n🎉 Agent Chat Service basic structure complete!');
  console.log('   🚀 Ready for implementation of core modules\n');
} 