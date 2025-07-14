// =============================================================================
// AGENT PLUGIN SYSTEM - Dynamic loading and management of agent specializations and tools
// =============================================================================

import type {
  AgentPlugin,
  ToolPlugin,
  PluginContext,
  PluginRegistry as IPluginRegistry,
  PluginStats,
  PluginLoader as IPluginLoader,
  PluginValidationResult,
  AgentConfig,
  ToolDefinition,
  ToolRegistry as IToolRegistry,
  ToolStats,
  ToolExecutionContext,
  ToolResult,
  AgentChatError,
  ErrorCodes
} from './types.ts';

// =============================================================================
// TOOL REGISTRY - Manages and executes tools from plugins
// =============================================================================

export class ToolRegistry implements IToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private toolStats: Map<string, ToolStats> = new Map();
  private rateLimits: Map<string, { calls: number; resetTime: number }> = new Map();

  /**
   * Register a tool for use by agents
   */
  registerTool(tool: ToolDefinition): boolean {
    try {
      if (this.tools.has(tool.name)) {
        console.warn(`⚠️  Tool ${tool.name} is already registered`);
        return false;
      }

      this.tools.set(tool.name, tool);
      
      // Initialize stats
      const stats: ToolStats = {
        name: tool.name,
        category: tool.category || 'general',
        registered: true,
        callCount: 0,
        errorCount: 0
      };
      this.toolStats.set(tool.name, stats);

      return true;
    } catch (error) {
      console.error(`❌ Failed to register tool ${tool.name}:`, error);
      return false;
    }
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolName: string): boolean {
    try {
      if (!this.tools.has(toolName)) {
        console.warn(`⚠️  Tool ${toolName} is not registered`);
        return false;
      }

      this.tools.delete(toolName);
      
      // Update stats
      const stats = this.toolStats.get(toolName);
      if (stats) {
        stats.registered = false;
      }

      return true;
    } catch (error) {
      console.error(`❌ Failed to unregister tool ${toolName}:`, error);
      return false;
    }
  }

  /**
   * Get a specific tool
   */
  getTool(toolName: string): ToolDefinition | undefined {
    return this.tools.get(toolName);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Execute a tool with rate limiting and error handling
   */
  async executeTool(toolName: string, params: any, context: ToolExecutionContext): Promise<ToolResult> {
    const startTime = Date.now();
    
    try {
      const tool = this.tools.get(toolName);
      if (!tool) {
        return {
          toolCallId: context.messageId || '',
          success: false,
          result: null,
          error: `Tool ${toolName} not found`
        };
      }

      // Check rate limits
      if (!this.checkRateLimit(tool)) {
        return {
          toolCallId: context.messageId || '',
          success: false,
          result: null,
          error: `Rate limit exceeded for tool ${toolName}`
        };
      }

      
      // Execute the tool
      const result = await tool.execute(params, context);
      
      // Update stats
      this.updateToolStats(toolName, true, Date.now() - startTime);
      
      return result;
    } catch (error) {
      console.error(`❌ Tool ${toolName} execution failed:`, error);
      
      // Update error stats
      this.updateToolStats(toolName, false, Date.now() - startTime);
      
      return {
        toolCallId: context.messageId || '',
        success: false,
        result: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(tool => tool.category === category);
  }

  /**
   * Search tools by name or description
   */
  searchTools(query: string): ToolDefinition[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.tools.values()).filter(tool => 
      tool.name.toLowerCase().includes(lowerQuery) ||
      tool.description.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Check if a tool is registered
   */
  isToolRegistered(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /**
   * Get tool statistics
   */
  getToolStats(): Record<string, ToolStats> {
    const stats: Record<string, ToolStats> = {};
    for (const [toolName, toolStats] of this.toolStats.entries()) {
      stats[toolName] = { ...toolStats };
    }
    return stats;
  }

  /**
   * Check rate limits for a tool
   */
  private checkRateLimit(tool: ToolDefinition): boolean {
    if (!tool.rateLimit) return true;

    const now = Date.now();
    const key = tool.name;
    const limit = this.rateLimits.get(key);

    if (!limit) {
      this.rateLimits.set(key, { calls: 1, resetTime: now + tool.rateLimit.windowMs });
      return true;
    }

    if (now > limit.resetTime) {
      this.rateLimits.set(key, { calls: 1, resetTime: now + tool.rateLimit.windowMs });
      return true;
    }

    if (limit.calls >= tool.rateLimit.maxCalls) {
      return false;
    }

    limit.calls++;
    return true;
  }

  /**
   * Update tool execution statistics
   */
  private updateToolStats(toolName: string, success: boolean, executionTime: number): void {
    const stats = this.toolStats.get(toolName);
    if (!stats) return;

    stats.callCount++;
    stats.lastUsed = new Date();
    
    if (success) {
      // Update average execution time
      stats.averageExecutionTime = stats.averageExecutionTime 
        ? (stats.averageExecutionTime + executionTime) / 2
        : executionTime;
    } else {
      stats.errorCount++;
    }
  }
}

// =============================================================================
// PLUGIN REGISTRY - Manages loaded plugins and their agents/tools
// =============================================================================

export class PluginRegistry implements IPluginRegistry {
  private plugins: Map<string, AgentPlugin | ToolPlugin> = new Map();
  private pluginStats: Map<string, PluginStats> = new Map();
  private context: PluginContext;
  private toolRegistry: ToolRegistry;

  constructor(context: PluginContext, toolRegistry?: ToolRegistry) {
    this.context = context;
    this.toolRegistry = toolRegistry || new ToolRegistry();
    this.context.toolRegistry = this.toolRegistry;
  }

  /**
   * Load a plugin into the registry
   */
  async loadPlugin(plugin: AgentPlugin | ToolPlugin): Promise<boolean> {
    try {
      // Validate plugin
      const validation = this.validatePlugin(plugin);
      if (!validation.valid) {
        console.error(`❌ Plugin validation failed for ${plugin.id}:`, validation.errors);
        return false;
      }

      // Check if already loaded
      if (this.plugins.has(plugin.id)) {
        console.warn(`⚠️  Plugin ${plugin.id} is already loaded`);
        return false;
      }

      // Check dependencies
      if (plugin.dependencies) {
        for (const dep of plugin.dependencies) {
          if (!this.plugins.has(dep)) {
            console.error(`❌ Plugin ${plugin.id} requires dependency: ${dep}`);
            return false;
          }
        }
      }

      // Initialize plugin if needed
      if (plugin.initialize) {
        await plugin.initialize(this.context);
      }

      // Register tools if this is a tool plugin
      if ('tools' in plugin) {
        for (const tool of plugin.tools) {
          this.toolRegistry.registerTool(tool);
        }
      }

      // Store plugin
      this.plugins.set(plugin.id, plugin);

      // Create stats
      const isAgentPlugin = 'agents' in plugin;
      const isToolPlugin = 'tools' in plugin;
      
      const stats: PluginStats = {
        id: plugin.id,
        type: isAgentPlugin && isToolPlugin ? 'mixed' : isAgentPlugin ? 'agent' : 'tool',
        loaded: true,
        agentCount: isAgentPlugin ? Object.keys(plugin.agents).length : 0,
        toolCount: isToolPlugin ? plugin.tools.length : 0,
        loadedAt: new Date(),
        errors: []
      };
      this.pluginStats.set(plugin.id, stats);

      
      return true;
    } catch (error) {
      console.error(`❌ Failed to load plugin ${plugin.id}:`, error);
      
      // Update stats with error
      const stats = this.pluginStats.get(plugin.id) || {
        id: plugin.id,
        type: 'agent',
        loaded: false,
        agentCount: 0,
        toolCount: 0,
        errors: []
      };
      stats.errors!.push(error.message);
      this.pluginStats.set(plugin.id, stats);
      
      return false;
    }
  }

  /**
   * Unload a plugin from the registry
   */
  async unloadPlugin(pluginId: string): Promise<boolean> {
    try {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        console.warn(`⚠️  Plugin ${pluginId} is not loaded`);
        return false;
      }

      // Unregister tools if this is a tool plugin
      if ('tools' in plugin) {
        for (const tool of plugin.tools) {
          this.toolRegistry.unregisterTool(tool.name);
        }
      }

      // Run cleanup if available
      if (plugin.cleanup) {
        await plugin.cleanup();
      }

      // Remove from registry
      this.plugins.delete(pluginId);
      
      // Update stats
      const stats = this.pluginStats.get(pluginId);
      if (stats) {
        stats.loaded = false;
      }

      return true;
    } catch (error) {
      console.error(`❌ Failed to unload plugin ${pluginId}:`, error);
      return false;
    }
  }

  /**
   * Get a specific plugin
   */
  getPlugin(pluginId: string): AgentPlugin | ToolPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * List all loaded plugins
   */
  listPlugins(): (AgentPlugin | ToolPlugin)[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get agents from a specific plugin
   */
  getPluginAgents(pluginId: string): Record<string, AgentConfig> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !('agents' in plugin)) {
      return {};
    }

    // Add plugin name to agent configs
    const agents: Record<string, AgentConfig> = {};
    for (const [agentId, agentConfig] of Object.entries(plugin.agents)) {
      agents[agentId] = {
        ...agentConfig,
        name: agentId
      };
    }

    return agents;
  }

  /**
   * Get all agents from all loaded plugins
   */
  getAllPluginAgents(): Record<string, AgentConfig> {
    const allAgents: Record<string, AgentConfig> = {};
    
    for (const plugin of this.plugins.values()) {
      if ('agents' in plugin) {
        const pluginAgents = this.getPluginAgents(plugin.id);
        Object.assign(allAgents, pluginAgents);
      }
    }

    return allAgents;
  }

  /**
   * Get tools from a specific plugin
   */
  getPluginTools(pluginId: string): ToolDefinition[] {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !('tools' in plugin)) {
      return [];
    }

    return [...plugin.tools];
  }

  /**
   * Get all tools from all loaded plugins
   */
  getAllPluginTools(): ToolDefinition[] {
    const allTools: ToolDefinition[] = [];
    
    for (const plugin of this.plugins.values()) {
      if ('tools' in plugin) {
        allTools.push(...plugin.tools);
      }
    }

    return allTools;
  }

  /**
   * Check if a plugin is loaded
   */
  isPluginLoaded(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * Get plugin statistics
   */
  getPluginStats(): Record<string, PluginStats> {
    const stats: Record<string, PluginStats> = {};
    for (const [pluginId, pluginStats] of this.pluginStats.entries()) {
      stats[pluginId] = { ...pluginStats };
    }
    return stats;
  }

  /**
   * Get the tool registry
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Validate a plugin before loading
   */
  private validatePlugin(plugin: AgentPlugin | ToolPlugin): PluginValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!plugin.id) errors.push('Plugin must have an id');
    if (!plugin.name) errors.push('Plugin must have a name');
    if (!plugin.version) errors.push('Plugin must have a version');

    // Check plugin type
    const isAgentPlugin = 'agents' in plugin;
    const isToolPlugin = 'tools' in plugin;
    
    if (!isAgentPlugin && !isToolPlugin) {
      errors.push('Plugin must define either agents or tools (or both)');
    }

    // Validate agent configurations
    if (isAgentPlugin) {
      if (!plugin.agents || Object.keys(plugin.agents).length === 0) {
        warnings.push('Agent plugin has no agents defined');
      } else {
        for (const [agentId, agentConfig] of Object.entries(plugin.agents)) {
          if (!agentConfig.role) {
            errors.push(`Agent ${agentId} must have a role`);
          }
          
          // Warn about missing descriptions
          if (!agentConfig.description) {
            warnings.push(`Agent ${agentId} should have a description`);
          }
        }
      }
    }

    // Validate tool definitions
    if (isToolPlugin) {
      if (!plugin.tools || plugin.tools.length === 0) {
        warnings.push('Tool plugin has no tools defined');
      } else {
        for (const tool of plugin.tools) {
          if (!tool.name) {
            errors.push('Tool must have a name');
          }
          if (!tool.description) {
            warnings.push(`Tool ${tool.name} should have a description`);
          }
          if (!tool.execute || typeof tool.execute !== 'function') {
            errors.push(`Tool ${tool.name} must have an execute function`);
          }
        }
      }
    }

    // Validate plugin ID format
    if (plugin.id && !/^[a-z0-9-_]+$/.test(plugin.id)) {
      errors.push('Plugin ID must contain only lowercase letters, numbers, hyphens, and underscores');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// =============================================================================
// PLUGIN LOADER - Loads plugins from files and directories
// =============================================================================

export class PluginLoader implements IPluginLoader {
  private registry: PluginRegistry;

  constructor(registry: PluginRegistry) {
    this.registry = registry;
  }

  /**
   * Load all plugins from a directory
   */
  async loadFromDirectory(pluginDir: string): Promise<(AgentPlugin | ToolPlugin)[]> {
    try {
      
      const plugins: (AgentPlugin | ToolPlugin)[] = [];
      
      // Check if directory exists
      try {
        const dirInfo = await Deno.stat(pluginDir);
        if (!dirInfo.isDirectory) {
          throw new Error(`${pluginDir} is not a directory`);
        }
      } catch (error) {
        console.warn(`⚠️  Plugin directory ${pluginDir} does not exist or is not accessible`);
        return plugins;
      }

      // Read directory contents
      for await (const entry of Deno.readDir(pluginDir)) {
        if (entry.isDirectory) {
          const pluginPath = `${pluginDir}/${entry.name}/index.ts`;
          
          try {
            const plugin = await this.loadFromFile(pluginPath);
            plugins.push(plugin);
          } catch (error) {
            console.warn(`⚠️  Failed to load plugin from ${pluginPath}:`, error.message);
          }
        }
      }

      return plugins;
    } catch (error) {
      console.error(`❌ Failed to load plugins from directory ${pluginDir}:`, error);
      return [];
    }
  }

  /**
   * Load a plugin from a specific file
   */
  async loadFromFile(pluginFile: string): Promise<AgentPlugin | ToolPlugin> {
    try {
      // Import the plugin module
      const pluginModule = await import(pluginFile);
      
      // Get the default export (should be the plugin definition)
      const plugin: AgentPlugin | ToolPlugin = pluginModule.default;
      
      if (!plugin) {
        throw new Error('Plugin file must have a default export');
      }

      // Validate the plugin
      const validation = this.validatePlugin(plugin);
      if (!validation.valid) {
        throw new Error(`Plugin validation failed: ${validation.errors.join(', ')}`);
      }

      // Show warnings
      if (validation.warnings.length > 0) {
        console.warn(`⚠️  Plugin ${plugin.id} warnings:`, validation.warnings);
      }

      
      return plugin;
    } catch (error) {
      throw new AgentChatError(
        `Failed to load plugin from ${pluginFile}: ${error.message}`,
        ErrorCodes.INITIALIZATION_ERROR,
        error
      );
    }
  }

  /**
   * Validate a plugin structure
   */
  validatePlugin(plugin: AgentPlugin | ToolPlugin): PluginValidationResult {
    // Use the registry's validation method
    return this.registry['validatePlugin'](plugin);
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a plugin registry with context
 */
export function createPluginRegistry(context: PluginContext, toolRegistry?: ToolRegistry): PluginRegistry {
  return new PluginRegistry(context, toolRegistry);
}

/**
 * Create a tool registry
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}

/**
 * Create a plugin loader
 */
export function createPluginLoader(registry: PluginRegistry): PluginLoader {
  return new PluginLoader(registry);
}

/**
 * Load and register plugins from a directory
 */
export async function loadPluginsFromDirectory(
  registry: PluginRegistry,
  pluginDir: string
): Promise<PluginStats[]> {
  const loader = createPluginLoader(registry);
  const plugins = await loader.loadFromDirectory(pluginDir);
  
  const results: PluginStats[] = [];
  
  for (const plugin of plugins) {
    const success = await registry.loadPlugin(plugin);
    const stats = registry.getPluginStats()[plugin.id];
    if (stats) {
      results.push(stats);
    }
  }
  
  return results;
} 