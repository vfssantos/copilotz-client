// =============================================================================
// AGENT REGISTRY - Manages and coordinates multiple agents
// =============================================================================

import type {
  AgentConfig,
  AgentInstance,
  AgentJoinDecision,
  TaskContext,
  AgentConversationContext,
  AgentResponse,
  ToolCall,
  AgentChatError,
  ErrorCodes
} from '../types.ts';

import { AgentChatDatabaseOperations } from '../database/operations.ts';
import type { ToolRegistry } from '../plugin-system.ts';

// Import AI service for LLM calls
import { ai } from '../../ai/index.ts';

// Import communication tools
import { communicationTools } from './communication-tools.ts';

// Import the standardized tool calling function from helpers
import { parseToolCallsFromResponse } from '../../ai/llm/helpers.ts';

// =============================================================================
// BASIC AGENT IMPLEMENTATION
// =============================================================================

class BasicAgent implements AgentInstance {
  config: AgentConfig;
  isActive: boolean = true;
  currentTasks: string[] = [];
  private toolRegistry?: ToolRegistry;

  constructor(config: AgentConfig, toolRegistry?: ToolRegistry) {
    this.config = config;
    this.toolRegistry = toolRegistry;
  }

  /**
   * Decide whether to join a task based on the initial message
   */
  async shouldJoinTask(message: string, taskContext: TaskContext): Promise<AgentJoinDecision> {
    try {
      const criteria = this.config.joinCriteria;

      if (!criteria) {
        // Default: join all tasks
        return {
          join: true,
          reason: `Agent ${this.config.name} (${this.config.role}) available to help`
        };
      }

      // Check if mention required
      if (criteria.mentionRequired) {
        const isMentioned = message.toLowerCase().includes(this.config.name.toLowerCase()) ||
          message.toLowerCase().includes(`@${this.config.name.toLowerCase()}`);

        if (!isMentioned) {
          return {
            join: false,
            reason: 'Not explicitly mentioned'
          };
        }

        // If mentioned and mention was required, join
        return {
          join: true,
          reason: 'Explicitly mentioned',
          urgency: 3
        };
      }

      // If mention is not required, check keywords (if any)
      if (criteria.keywords && criteria.keywords.length > 0) {
        const messageWords = message.toLowerCase().split(/\s+/);
        const hasKeyword = criteria.keywords.some(keyword =>
          messageWords.some(word => word.includes(keyword.toLowerCase()))
        );

        if (hasKeyword) {
          return {
            join: true,
            reason: `Relevant keywords detected: ${criteria.keywords.join(', ')}`,
            urgency: 2
          };
        }

        // If keywords are specified but none match, don't join
        return {
          join: false,
          reason: `No matching keywords (looking for: ${criteria.keywords.join(', ')})`
        };
      }

      // If no mention required and no keywords specified, join by default
      return {
        join: true,
        reason: `Agent ${this.config.name} available (no specific criteria)`
      };
    } catch (error) {
      console.error(`Error in shouldJoinTask for ${this.config.name}:`, error);
      return {
        join: false,
        reason: 'Error in decision making'
      };
    }
  }

  /**
   * Process a message and generate a response using AI service
   */
  async process(message: string, context: AgentConversationContext): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Build conversation messages for AI
      const messages = this.buildConversationMessages(message, context);

      // Build tool list based on agent configuration
      const allTools = [];

      if (this.config.tools && this.config.tools.length > 0) {
        // Agent has specific tool restrictions - only include configured tools
        const configuredTools = this.config.tools;

        // Filter communication tools
        const availableCommunicationTools = communicationTools.filter(tool =>
          configuredTools.includes(tool.name)
        );

        // Filter external tools from registry
        let availableExternalTools = [];
        if (this.toolRegistry) {
          const allExternalTools = this.toolRegistry.getAllTools();
          availableExternalTools = allExternalTools.filter(tool =>
            configuredTools.includes(tool.name)
          );
        }

        // Add filtered communication tools
        for (const tool of availableCommunicationTools) {
          allTools.push({
            type: 'function' as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters
            }
          });
        }

        // Add filtered external tools
        for (const tool of availableExternalTools) {
          allTools.push({
            type: 'function' as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters
            }
          });
        }

      } else {
        // No restrictions - agent gets all tools (backward compatibility)

        // Add all communication tools
        for (const tool of communicationTools) {
          allTools.push({
            type: 'function' as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters
            }
          });
        }

        // Add all external tools
        if (this.toolRegistry) {
          const allExternalTools = this.toolRegistry.getAllTools();
          for (const tool of allExternalTools) {
            allTools.push({
              type: 'function' as const,
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
              }
            });
          }
        }

      }

      // Get AI response with standardized tool calling
      const aiResponse = await ai({
        type: 'llm',
        messages,
        config: {
          provider: this.config.llmProvider || 'openai',
          model: this.config.llmModel || 'gpt-4o-mini',
          temperature: this.config.temperature || 0.7,
          maxTokens: this.config.maxTokens || 1000
        },
        tools: allTools // Use our standardized tool calling
      });

      if (!aiResponse.success) {
        throw new Error(aiResponse.error || 'AI service failed');
      }

      // Extract tool calls from standardized AI response
      const toolCalls: ToolCall[] = [];
      let content = aiResponse.answer || '';

      // Process standardized tool calls from AI service
      if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
        for (const toolCall of aiResponse.toolCalls) {
          toolCalls.push({
            id: toolCall.id,
            name: toolCall.function.name,
            parameters: typeof toolCall.function.arguments === 'string'
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments
          });
        }
      } else {
        // Fallback: parse tool calls from response text (for backwards compatibility)
        const { content: cleanContent, toolCalls: textToolCalls } = this.parseResponseForToolCalls(aiResponse.answer || '');
        content = cleanContent;
        toolCalls.push(...textToolCalls);
      }

      const processingTime = Date.now() - startTime;

      // If we have tool calls but no content, provide a meaningful default
      let finalContent = content;
      if (!finalContent && toolCalls.length > 0) {
        // Generate a contextual message based on the tool calls
        const toolNames = toolCalls.map(tc => tc.name).join(', ');
        finalContent = `I'll complete that task using: ${toolNames}`;
      } else if (!finalContent) {
        finalContent = 'I apologize, but I encountered an issue generating a response.';
      }

      return {
        agent: this.config.name,
        content: finalContent,
        toolCalls,
        metadata: {
          processingTime,
          confidence: 0.9,
          currentWork: this.currentTasks,
          tokensUsed: aiResponse.tokens?.total || 0,
          provider: this.config.llmProvider || 'openai',
          model: this.config.llmModel || 'gpt-4o-mini'
        }
      };
    } catch (error) {
      console.error(`Error processing message for ${this.config.name}:`, error);
      const processingTime = Date.now() - startTime;

      return {
        agent: this.config.name,
        content: `I encountered an error processing your message: ${error.message}`,
        metadata: {
          processingTime,
          confidence: 0.1,
          error: true,
          errorMessage: error.message
        }
      };
    }
  }

  /**
   * Build conversation messages for AI service
   */
  private buildConversationMessages(newMessage: string, context: AgentConversationContext): any[] {
    const messages = [];

    // System message with agent role and personality
    const systemPrompt = this.buildSystemPrompt(context);
    messages.push({
      role: 'system',
      content: systemPrompt
    });

    // Add recent conversation history
    const recentMessages = context.messageHistory.slice(-10); // Last 10 messages
    for (const msg of recentMessages) {
      if (msg.senderType === 'user') {
        messages.push({
          role: 'user',
          content: `${msg.sender}: ${msg.content}`
        });
      } else if (msg.senderType === 'agent') {
        // Only assign 'assistant' role to messages from THIS agent
        // All other agent messages should be treated as 'user' messages
        const role = msg.sender === this.config.name ? 'assistant' : 'user';
        messages.push({
          role: role,
          content: `${msg.sender}: ${msg.content}`
        });
      }
    }

    return messages;
  }

  /**
   * Build system prompt based on agent configuration and context
   */
  private buildSystemPrompt(context: AgentConversationContext): string {
    const role = this.config.role;
    const description = this.config.description || '';
    const personality = this.config.personality;
    const otherParticipants = context.otherParticipants;
    const isThreadContext = !!context.threadId;

    let prompt = `=== PROFILE ===\n\n`;
    prompt += `You are ${this.config.name}, an AI agent with the role of ${role}.`;

    if (description) {
      prompt += ` ${description}`;
    }

    prompt += `\n\n=== PERSONALITY ===\n\n`;
    // Add personality traits
    if (personality) {
      if (personality.tone) {
        prompt += `Communication style: Use a ${personality.tone} tone.`;
      }

      if (personality.verbosity) {
        const verbosityMap = {
          'concise': 'Keep responses brief and to the point.',
          'balanced': 'Provide moderate detail in responses.',
          'detailed': 'Give comprehensive and detailed responses.'
        };
        prompt += ` ${verbosityMap[personality.verbosity]}`;
      }

      if (personality.traits && personality.traits.length > 0) {
        prompt += ` Embody these traits: ${personality.traits.join(', ')}.`;
      }
    }

    // Add specific instructions from description
    // Note: instructions field doesn't exist in AgentConfig, using description instead

    prompt += `\n\n=== CONTEXT ===\n\n`;
    prompt += `You are participating in a ${isThreadContext ? 'thread discussion' : 'main conversation'}`;

    if (otherParticipants.length > 0) {
      prompt += ` with other participants: ${otherParticipants.join(', ')}.`;
    }

    // Add information about available agents not in the conversation
    const availableAgents = this.getAvailableAgentsNotInConversation(context);
    if (availableAgents.length > 0) {
      prompt += `\n\nOther agents available for thread creation or collaboration:`;
      for (const agent of availableAgents) {
        const shortDesc = agent.shortDescription || agent.role;
        prompt += `\n- ${agent.name}: ${shortDesc}`;
      }
    }

    // Add guidance about tool usage and communication
    prompt += `\n\nYou have access to various tools to help you complete tasks. Use them appropriately based on the situation.`;

    if (context.taskContext) {
      prompt += `\n\nCurrent task context:`;
      if (context.taskContext.title) {
        prompt += ` "${context.taskContext.title}"`;
      }
      if (context.taskContext.goals && context.taskContext.goals.length > 0) {
        prompt += `\nGoals: ${context.taskContext.goals.join(', ')}`;
      }
    }

    // add current date
    prompt += `\n\n=== CURRENT DATE ===\n\n`;
    prompt += `Current date: ${new Date().toDateString()}`;

    return prompt;
  }

  /**
   * Get agents available for collaboration but not currently in the conversation
   */
  private getAvailableAgentsNotInConversation(context: AgentConversationContext): AgentConfig[] {
    // Return available agents from context (populated by ContextManager)
    return context.availableAgents || [];
  }

  /**
   * Parse response content for embedded tool calls using standardized format
   */
  private parseResponseForToolCalls(content: string): { content: string; toolCalls: ToolCall[] } {
    // Use standardized tool calling parser from helpers.ts
    const { cleanResponse, toolCalls: parsedToolCalls } = parseToolCallsFromResponse(content);

    // Convert parsed tool calls to agent system format
    const toolCalls: ToolCall[] = parsedToolCalls.map(toolCall => ({
      id: toolCall.id,
      name: toolCall.function.name,
      parameters: typeof toolCall.function.arguments === 'string'
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments
    }));

    // If we extracted tool calls but no content remains, provide a default response
    let finalContent = cleanResponse;
    if (toolCalls.length > 0 && !finalContent.trim()) {
      finalContent = `I'll help with that task.`;
    }

    return {
      content: finalContent,
      toolCalls
    };
  }
}

// =============================================================================
// AGENT REGISTRY CLASS
// =============================================================================

export class AgentRegistry {
  private db: AgentChatDatabaseOperations;
  private agents: Map<string, AgentInstance> = new Map();
  private agentConfigs: Record<string, AgentConfig>;
  private toolRegistry?: ToolRegistry;

  constructor(db: AgentChatDatabaseOperations, agentConfigs: Record<string, AgentConfig>, toolRegistry?: ToolRegistry) {
    this.db = db;
    this.agentConfigs = agentConfigs;
    this.toolRegistry = toolRegistry;
  }

  /**
   * Initialize the agent registry
   */
  async initialize(): Promise<void> {
    try {

      // Create agent instances from configurations
      for (const [agentId, config] of Object.entries(this.agentConfigs)) {
        const fullConfig = {
          name: agentId,
          ...config
        };

        // Create basic agent instance with tool registry
        const agent = new BasicAgent(fullConfig, this.toolRegistry);
        this.agents.set(agentId, agent);

        // Store agent in database
        await this.storeAgentConfig(agentId, fullConfig);
      }

    } catch (error) {
      throw new AgentChatError(
        `Failed to initialize agent registry: ${error.message}`,
        ErrorCodes.INITIALIZATION_ERROR,
        error
      );
    }
  }

  /**
   * Get all active agents
   */
  async getAllAgents(): Promise<AgentInstance[]> {
    return Array.from(this.agents.values()).filter(agent => agent.isActive);
  }

  /**
   * Get all agent IDs in the order they were defined in config
   */
  getAgentIdsInConfigOrder(): string[] {
    return Object.keys(this.agentConfigs);
  }

  /**
   * Order agent IDs according to their definition order in config
   */
  orderAgentsByConfigOrder(agentIds: string[]): string[] {
    const configOrder = this.getAgentIdsInConfigOrder();
    return agentIds.sort((a, b) => {
      const indexA = configOrder.indexOf(a);
      const indexB = configOrder.indexOf(b);
      
      // If an agent isn't in config, put it at the end
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      
      return indexA - indexB;
    });
  }

  /**
   * Get a specific agent by ID
   */
  getAgent(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Add a task to an agent's current tasks
   */
  async addTaskToAgent(agentId: string, taskId: string): Promise<boolean> {
    try {
      const agent = this.agents.get(agentId);
      if (!agent) {
        console.warn(`Agent ${agentId} not found`);
        return false;
      }

      if (!agent.currentTasks.includes(taskId)) {
        agent.currentTasks.push(taskId);
      }

      return true;
    } catch (error) {
      console.error(`Failed to add task to agent ${agentId}:`, error);
      return false;
    }
  }

  /**
   * Remove a task from an agent's current tasks
   */
  async removeTaskFromAgent(agentId: string, taskId: string): Promise<boolean> {
    try {
      const agent = this.agents.get(agentId);
      if (!agent) {
        console.warn(`Agent ${agentId} not found`);
        return false;
      }

      agent.currentTasks = agent.currentTasks.filter(id => id !== taskId);
      return true;
    } catch (error) {
      console.error(`Failed to remove task from agent ${agentId}:`, error);
      return false;
    }
  }

  /**
   * Get agents that should participate in a task
   */
  async getRelevantAgents(
    message: string,
    taskContext: TaskContext
  ): Promise<{ agent: AgentInstance; decision: AgentJoinDecision }[]> {
    const agents = await this.getAllAgents();
    const decisions = await Promise.all(
      agents.map(async (agent) => {
        const decision = await agent.shouldJoinTask(message, taskContext);
        return { agent, decision };
      })
    );

    return decisions.filter(({ decision }) => decision.join);
  }

  /**
   * Check if an agent exists
   */
  hasAgent(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  /**
   * Get agent configuration
   */
  getAgentConfig(agentId: string): AgentConfig | undefined {
    const agent = this.agents.get(agentId);
    return agent?.config;
  }

  /**
   * Update agent configuration
   */
  async updateAgentConfig(agentId: string, updates: Partial<AgentConfig>): Promise<boolean> {
    try {
      const agent = this.agents.get(agentId);
      if (!agent) {
        return false;
      }

      // Update configuration
      agent.config = { ...agent.config, ...updates };

      // Store updated config in database
      await this.storeAgentConfig(agentId, agent.config);

      return true;
    } catch (error) {
      console.error(`Failed to update agent config for ${agentId}:`, error);
      return false;
    }
  }

  /**
   * Activate/deactivate an agent
   */
  async setAgentActive(agentId: string, active: boolean): Promise<boolean> {
    try {
      const agent = this.agents.get(agentId);
      if (!agent) {
        return false;
      }

      agent.isActive = active;

      return true;
    } catch (error) {
      console.error(`Failed to set agent ${agentId} active state:`, error);
      return false;
    }
  }

  /**
   * Get agent statistics
   */
  getAgentStats(): Record<string, any> {
    const stats: Record<string, any> = {};

    for (const [agentId, agent] of this.agents.entries()) {
      stats[agentId] = {
        isActive: agent.isActive,
        currentTaskCount: agent.currentTasks.length,
        role: agent.config.role,
        capabilities: agent.config.capabilities || []
      };
    }

    return stats;
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  /**
   * Store agent configuration in database
   */
  private async storeAgentConfig(agentId: string, config: AgentConfig): Promise<void> {
    try {
      // This would typically use database operations to store agent config
      // For now, we'll skip the actual database storage
      console.log(`📝 TO DO: store agent config for ${agentId}`);
    } catch (error) {
      console.error(`Failed to store agent config for ${agentId}:`, error);
    }
  }

  /**
   * Load agent configurations from database
   */
  private async loadAgentConfigs(): Promise<Record<string, AgentConfig>> {
    try {
      // This would typically load from database
      // For now, return empty object
      return {};
    } catch (error) {
      console.error('Failed to load agent configs from database:', error);
      return {};
    }
  }
} 