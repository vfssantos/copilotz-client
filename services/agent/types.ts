// =============================================================================
// AGENT CHAT TYPES - Complete type definitions for multi-agent conversation
// =============================================================================

// =============================================================================
// PLUGIN SYSTEM TYPES
// =============================================================================

export interface AgentPlugin {
  // Plugin metadata
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  tags?: string[];
  
  // Plugin content
  agents: Record<string, Omit<AgentConfig, 'name'>>;
  tools?: CommunicationTool[];
  
  // Plugin lifecycle
  initialize?: (context: PluginContext) => Promise<void>;
  cleanup?: () => Promise<void>;
  
  // Plugin dependencies
  dependencies?: string[];
  requiredServices?: ('ai' | 'knowledge' | 'database')[];
}

export interface ToolPlugin {
  // Plugin metadata
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  tags?: string[];
  
  // Plugin content
  tools: ToolDefinition[];
  
  // Plugin lifecycle
  initialize?: (context: PluginContext) => Promise<void>;
  cleanup?: () => Promise<void>;
  
  // Plugin dependencies
  dependencies?: string[];
  requiredServices?: ('ai' | 'knowledge' | 'database' | 'network')[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  category?: string; // 'web', 'api', 'file', 'system', 'custom'
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (params: any, context: ToolExecutionContext) => Promise<ToolResult>;
  
  // Tool metadata
  rateLimit?: {
    maxCalls: number;
    windowMs: number;
  };
  requiresAuth?: boolean;
  dangerous?: boolean; // Requires explicit user consent
}

export interface PluginContext {
  agentRegistry: any; // Will be typed properly when implemented
  database: any;
  aiService: any;
  knowledgeService?: any;
  toolRegistry?: any;
}

export interface PluginRegistry {
  // Plugin management
  loadPlugin(plugin: AgentPlugin | ToolPlugin): Promise<boolean>;
  unloadPlugin(pluginId: string): Promise<boolean>;
  getPlugin(pluginId: string): AgentPlugin | ToolPlugin | undefined;
  listPlugins(): (AgentPlugin | ToolPlugin)[];
  
  // Agent access
  getPluginAgents(pluginId: string): Record<string, AgentConfig>;
  getAllPluginAgents(): Record<string, AgentConfig>;
  
  // Tool access
  getPluginTools(pluginId: string): ToolDefinition[];
  getAllPluginTools(): ToolDefinition[];
  
  // Plugin state
  isPluginLoaded(pluginId: string): boolean;
  getPluginStats(): Record<string, PluginStats>;
}

export interface PluginStats {
  id: string;
  type: 'agent' | 'tool' | 'mixed';
  loaded: boolean;
  agentCount: number;
  toolCount: number;
  loadedAt?: Date;
  errors?: string[];
}

export interface PluginLoader {
  loadFromDirectory(pluginDir: string): Promise<(AgentPlugin | ToolPlugin)[]>;
  loadFromFile(pluginFile: string): Promise<AgentPlugin | ToolPlugin>;
  validatePlugin(plugin: AgentPlugin | ToolPlugin): PluginValidationResult;
}

export interface PluginValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ToolRegistry {
  // Tool management
  registerTool(tool: ToolDefinition): boolean;
  unregisterTool(toolName: string): boolean;
  getTool(toolName: string): ToolDefinition | undefined;
  getAllTools(): ToolDefinition[];
  
  // Tool execution
  executeTool(toolName: string, params: any, context: ToolExecutionContext): Promise<ToolResult>;
  
  // Tool discovery
  getToolsByCategory(category: string): ToolDefinition[];
  searchTools(query: string): ToolDefinition[];
  
  // Tool state
  isToolRegistered(toolName: string): boolean;
  getToolStats(): Record<string, ToolStats>;
}

export interface ToolStats {
  name: string;
  category: string;
  registered: boolean;
  callCount: number;
  lastUsed?: Date;
  averageExecutionTime?: number;
  errorCount: number;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// =============================================================================
// ERROR HANDLING
// =============================================================================

export enum ErrorCodes {
  INITIALIZATION_ERROR = 'INITIALIZATION_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
  MESSAGE_PROCESSING_ERROR = 'MESSAGE_PROCESSING_ERROR',
  TASK_CREATION_ERROR = 'TASK_CREATION_ERROR',
  AGENT_ERROR = 'AGENT_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  CONTEXT_ERROR = 'CONTEXT_ERROR',
  TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR'
}

export class AgentChatError extends Error {
  constructor(
    message: string,
    public code: ErrorCodes,
    public details?: any
  ) {
    super(message);
    this.name = 'AgentChatError';
  }
}

// =============================================================================
// CORE MESSAGE TYPES
// =============================================================================

export interface ConversationMessage {
  id: string;
  taskId: string;
  threadId?: string;
  
  // Message details
  sender: string; // 'user' or agent name
  senderType: 'user' | 'agent' | 'system';
  content: string;
  messageType: 'message' | 'question' | 'response' | 'system' | 'tool_result';
  
  // Context
  replyToId?: string;
  mentionedParticipants?: string[];
  
  // Metadata
  metadata?: {
    confidence?: number;
    toolsUsed?: string[];
    processingTime?: number;
    [key: string]: any;
  };
  
  // Timing
  timestamp: Date;
  editedAt?: Date;
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, any>;
}

export interface ToolResult {
  toolCallId: string;
  success: boolean;
  result: any;
  error?: string;
  metadata?: Record<string, any>;
}

// =============================================================================
// TASK & THREAD TYPES
// =============================================================================

export interface TaskContext {
  id: string;
  userId: string;
  title?: string;
  description?: string;
  
  // Participants
  participants: string[]; // user + agents who joined
  
  // State
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  priority: number;
  
  // Context data
  context: Record<string, any>;
  goals?: string[];
  constraints?: Record<string, any>;
  
  // Timing
  createdAt: Date;
  lastActivity: Date;
  expectedCompletion?: Date;
  completedAt?: Date;
}

export interface ThreadContext {
  id: string;
  taskId: string;
  
  // Thread details
  purpose: string;
  participants: string[]; // subset of task participants
  
  // State
  status: 'active' | 'resolved' | 'archived';
  
  // Relationship
  parentMessageId?: string; // message that sparked this thread
  
  // Timing
  createdAt: Date;
  lastActivity: Date;
  resolvedAt?: Date;
}

export interface TaskSummary {
  id: string;
  title?: string;
  status: string;
  participants: string[];
  lastActivity: Date;
  messageCount: number;
  threadCount: number;
}

// =============================================================================
// AGENT TYPES
// =============================================================================

export interface AgentConfig {
  // Basic info
  name: string;
  role: string;
  description?: string; // Long description for the agent itself
  shortDescription?: string; // Short description for reference by other agents
  
  // Capabilities
  capabilities?: string[];
  tools?: string[];
  
  // LLM Configuration
  llmProvider?: string;
  llmModel?: string;
  temperature?: number;
  maxTokens?: number;
  
  // Behavior
  personality?: {
    tone?: string;
    verbosity?: 'concise' | 'balanced' | 'detailed';
    creativity?: 'low' | 'medium' | 'high';
    traits?: string[];
  };
  
  // Communication preferences
  preferredChannels?: ('main' | 'thread' | 'private')[];
  joinCriteria?: {
    keywords?: string[];
    topics?: string[];
    mentionRequired?: boolean;
  };
  
  // Integration
  knowledgeBase?: {
    enabled: boolean;
    collectionIds?: string[];
    searchThreshold?: number;
  };
}

export interface AgentInstance {
  config: AgentConfig;
  isActive: boolean;
  currentTasks: string[];
  
  // Core methods
  shouldJoinTask(message: string, taskContext: TaskContext): Promise<AgentJoinDecision>;
  process(message: string, context: AgentConversationContext): Promise<AgentResponse>;
}

export interface AgentJoinDecision {
  join: boolean;
  reason: string;
  urgency?: number;
}

export interface AgentResponse {
  agent: string;
  content: string;
  toolCalls?: ToolCall[];
  metadata?: {
    confidence?: number;
    toolsUsed?: string[];
    processingTime?: number;
    currentWork?: string[];
  };
}

export interface AgentConversationContext {
  taskId: string;
  threadId?: string;
  messageHistory: ConversationMessage[];
  taskContext: TaskContext;
  threadContext?: ThreadContext;
  otherParticipants: string[];
  availableTools: string[];
  availableAgents?: AgentConfig[]; // Agents available for collaboration but not in current conversation
}

// =============================================================================
// DATABASE TYPES
// =============================================================================

export interface DatabaseConfig {
  url?: string;
  syncUrl?: string;
  schema?: string[];
}

export interface DatabaseOperations {
  // Task operations
  createTask(task: Omit<TaskContext, 'id' | 'createdAt' | 'lastActivity'>): Promise<string>;
  getTask(taskId: string): Promise<TaskContext | null>;
  updateTask(taskId: string, updates: Partial<TaskContext>): Promise<boolean>;
  listUserTasks(userId: string, status?: string, limit?: number, offset?: number): Promise<TaskSummary[]>;
  addParticipantToTask(taskId: string, participant: string): Promise<boolean>;
  
  // Thread operations
  createThread(thread: Omit<ThreadContext, 'id' | 'createdAt' | 'lastActivity'>): Promise<string>;
  getThread(threadId: string): Promise<ThreadContext | null>;
  updateThread(threadId: string, updates: Partial<ThreadContext>): Promise<boolean>;
  listTaskThreads(taskId: string): Promise<ThreadContext[]>;
  addParticipantToThread(threadId: string, participant: string): Promise<boolean>;
  
  // Message operations
  addMessage(message: Omit<ConversationMessage, 'id' | 'timestamp'>): Promise<string>;
  getTaskMessages(taskId: string, threadId?: string, limit?: number, offset?: number): Promise<ConversationMessage[]>;
  getThreadMessages(threadId: string, limit?: number, offset?: number): Promise<ConversationMessage[]>;
  updateMessage(messageId: string, updates: Partial<ConversationMessage>): Promise<boolean>;
  
  // Context operations
  getTaskContext(taskId: string, participantId: string): Promise<AgentConversationContext>;
  getThreadContext(threadId: string, participantId: string): Promise<AgentConversationContext>;
}

// =============================================================================
// COMMUNICATION TOOLS
// =============================================================================

export interface CommunicationTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (params: any, context: ToolExecutionContext) => Promise<ToolResult>;
}

export interface ToolExecutionContext {
  taskId: string;
  threadId?: string;
  agentId: string;
  userId: string;
  messageId?: string;
}

// =============================================================================
// SYSTEM CONFIGURATION
// =============================================================================

export interface AgentChatConfig {
  // Database configuration
  database?: DatabaseConfig;
  
  // Agent definitions
  agents?: Record<string, AgentConfig>;
  
  // Tool registry for external tools
  toolRegistry?: ToolRegistry;
  
  // Callbacks for events
  callbacks?: {
    onMessage?: (message: ConversationMessage) => void;
    onThreadCreated?: (event: ThreadCreatedEvent) => void;
    onTaskCreated?: (event: TaskCreatedEvent) => void;
    onAgentJoined?: (event: AgentJoinedEvent) => void;
    onToolCall?: (event: ToolCallEvent) => void;
    onToolResult?: (event: ToolResultEvent) => void;
    onError?: (error: AgentChatError) => void;
  };
  
  // System settings
  settings?: {
    maxTokensPerAgent?: number;
    defaultTimeout?: number;
    enableToolCalling?: boolean;
    enableKnowledgeIntegration?: boolean;
  };
}

// =============================================================================
// EVENT TYPES
// =============================================================================

export interface ThreadCreatedEvent {
  threadId: string;
  taskId: string;
  purpose: string;
  participants: string[];
  createdBy: string;
  initialMessage?: ConversationMessage;
}

export interface TaskCreatedEvent {
  taskId: string;
  userId: string;
  title?: string;
  participants: string[];
  triggerMessage?: string;
}

export interface AgentJoinedEvent {
  taskId: string;
  agentId: string;
  reason: string;
  timestamp: Date;
}

export interface ToolCallEvent {
  taskId: string;
  threadId?: string;
  agentId: string;
  toolCall: ToolCall;
  context: ToolExecutionContext;
  timestamp: Date;
}

export interface ToolResultEvent {
  taskId: string;
  threadId?: string;
  agentId: string;
  toolCall: ToolCall;
  result: ToolResult;
  executionTime: number;
  context: ToolExecutionContext;
  timestamp: Date;
}

// =============================================================================
// REQUEST/RESPONSE TYPES
// =============================================================================

export type AgentChatRequest = 
  | { type: 'send_message'; message: string; taskId?: string; threadId?: string; userId?: string; }
  | { type: 'get_task_history'; taskId: string; userId?: string; includeThreads?: boolean; }
  | { type: 'get_thread_history'; threadId: string; userId?: string; }
  | { type: 'list_tasks'; userId: string; status?: string; limit?: number; offset?: number; }
  | { type: 'create_task'; userId: string; title?: string; description?: string; participants?: string[]; };

export type AgentChatResponse = 
  | { type: 'send_message'; taskId: string; messageId: string; agentResponses: AgentResponse[]; threadsCreated: string[]; processingTime: number; }
  | { type: 'get_task_history'; taskId: string; messages: ConversationMessage[]; threads: ThreadContext[]; participants: string[]; processingTime: number; }
  | { type: 'get_thread_history'; threadId: string; messages: ConversationMessage[]; participants: string[]; purpose: string; processingTime: number; }
  | { type: 'list_tasks'; tasks: TaskSummary[]; totalCount: number; processingTime: number; }
  | { type: 'create_task'; taskId: string; processingTime: number; };

// =============================================================================
// CONTEXT MANAGEMENT TYPES
// =============================================================================

export interface ContextWindow {
  messages: ConversationMessage[];
  maxTokens: number;
  currentTokens: number;
  truncated: boolean;
}

export interface ConversationHistory {
  messages: ConversationMessage[];
  threads: ThreadContext[];
  participants: string[];
  tokenCount: number;
}

// =============================================================================
// FACTORY TYPES
// =============================================================================

export interface CreateTaskRequest {
  userId: string;
  title?: string;
  description?: string;
  participants?: string[];
  context?: Record<string, any>;
}

export interface CreateThreadRequest {
  taskId: string;
  purpose: string;
  participants: string[];
  parentMessageId?: string;
  initialMessage?: string;
}

export interface MessageProcessingResult {
  taskId: string;
  messageId: string;
  agentResponses: AgentResponse[];
  threadsCreated: string[];
  toolResults?: ToolResult[];
}

// =============================================================================
// INTEGRATION TYPES
// =============================================================================

export interface ServiceIntegration {
  aiService: {
    enabled: boolean;
    defaultProvider?: string;
    providers?: string[];
  };
  knowledgeService: {
    enabled: boolean;
    defaultCollection?: string;
    searchThreshold?: number;
  };
}

// =============================================================================
// EXPORT CONVENIENCE INTERFACES
// =============================================================================

export interface SimpleAgentChatConfig {
  agents: string[] | Record<string, { role: string; description?: string; }>;
  onMessage: (message: ConversationMessage) => void;
  database?: { url?: string; };
} 

// =============================================================================
// UNIFIED CONVERSATION PROCESSING TYPES
// =============================================================================

/**
 * Unified conversation context that handles all scenarios:
 * - Main task conversations
 * - Thread conversations  
 * - Recursive tool result processing
 * - Agent-to-agent communication
 */
export interface UnifiedConversationContext {
  // Core identifiers
  taskId: string;
  threadId?: string;
  
  // Conversation trigger
  trigger: ConversationTrigger;
  
  // Context data
  taskContext: TaskContext;
  threadContext?: ThreadContext;
  
  // Participants and agents
  availableAgents: string[];
  relevantAgents: string[];
  excludedAgents: string[]; // Agents to exclude (e.g., message sender to avoid loops)
  
  // Message context
  messageHistory: ConversationMessage[];
  contextWindow: ContextWindow;
  
  // Processing state
  processingDepth: number; // Track recursion depth
  parentProcessingId?: string; // For tracking recursive chains
  continuationReason?: string; // Why processing is continuing
  
  // Available resources
  availableTools: string[];
  toolRegistry?: ToolRegistry;
  
  // Metadata
  metadata: {
    isRecursive: boolean;
    isThreadContext: boolean;
    triggerType: string;
    processingStartTime: number;
    maxDepth?: number;
    [key: string]: any;
  };
}

/**
 * Conversation trigger - what initiated this processing cycle
 */
export interface ConversationTrigger {
  type: 'user_message' | 'tool_results' | 'thread_message' | 'agent_response' | 'system_event';
  content: string;
  sender: string;
  senderType: 'user' | 'agent' | 'system';
  originalMessageId?: string;
  toolResults?: Array<{toolCall: ToolCall, result: ToolResult}>;
  metadata?: Record<string, any>;
}

/**
 * Result of unified conversation processing
 */
export interface ConversationProcessingResult {
  // Processing metadata
  processingId: string;
  taskId: string;
  threadId?: string;
  processingTime: number;
  processingDepth: number;
  
  // Messages created
  messageIds: string[];
  
  // Agent responses
  agentResponses: AgentResponse[];
  
  // Tool execution results
  toolResults: Array<{toolCall: ToolCall, result: ToolResult}>;
  
  // Side effects
  threadsCreated: string[];
  agentsJoined: string[];
  
  // Continuation state
  continuationRequired: boolean;
  continuationContext?: UnifiedConversationContext;
  
  // Status
  success: boolean;
  errors: AgentChatError[];
  
  // Processing chain (for recursive scenarios)
  parentProcessingId?: string;
  childProcessingIds: string[];
}

/**
 * Configuration for conversation processing
 */
export interface ConversationProcessingConfig {
  // Recursion control
  maxDepth: number;
  maxContinuations: number;
  
  // Agent selection
  useConfigOrder: boolean;
  parallelProcessing: boolean;
  
  // Tool execution
  enableToolCalling: boolean;
  toolExecutionTimeout: number;
  
  // Message storage
  storeIntermediateResults: boolean;
  consolidateMessages: boolean;
  
  // Continuation logic
  enableAutoContinuation: boolean;
  continuationTimeout: number;
  
  // Callbacks
  onAgentResponse?: (response: AgentResponse, context: UnifiedConversationContext) => void;
  onToolExecution?: (toolCall: ToolCall, result: ToolResult, context: UnifiedConversationContext) => void;
  onContinuation?: (reason: string, context: UnifiedConversationContext) => void;
  onError?: (error: AgentChatError, context: UnifiedConversationContext) => void;
}

/**
 * Interface for unified conversation processor
 */
export interface ConversationProcessor {
  /**
   * Process any conversation scenario with unified logic
   */
  processConversation(context: UnifiedConversationContext, config?: Partial<ConversationProcessingConfig>): Promise<ConversationProcessingResult>;
  
  /**
   * Determine if processing should continue based on current state
   */
  shouldContinueProcessing(
    result: ConversationProcessingResult, 
    context: UnifiedConversationContext
  ): { continue: boolean; reason?: string; newContext?: UnifiedConversationContext };
  
  /**
   * Create conversation context from different scenarios
   */
  createContextFromUserMessage(message: string, taskId: string, userId: string, threadId?: string): Promise<UnifiedConversationContext>;
  createContextFromToolResults(toolResults: Array<{toolCall: ToolCall, result: ToolResult}>, agentId: string, taskId: string, threadId?: string): Promise<UnifiedConversationContext>;
  createContextFromThreadMessage(message: string, threadId: string, taskId: string, sender: string): Promise<UnifiedConversationContext>;
} 