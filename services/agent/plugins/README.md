# Agent Plugin System 🔌

A modular plugin system for dynamically loading and managing specialized AI agents. This allows the agent framework to be extended with new agent types without modifying the core codebase.

## 📦 **Available Plugins**

### 🔬 **Research Specialists** (`research`)
Expert agents for research, data analysis, and information gathering:
- **Senior Researcher**: Comprehensive research methodology and evidence-based analysis
- **Market Researcher**: Competitive analysis and business intelligence
- **Academic Researcher**: Scientific methodology and scholarly analysis
- **Data Analyst**: Statistical analysis and quantitative research
- **Trend Analyst**: Emerging trends and pattern identification

### ✍️ **Writing Specialists** (`writing`)
Expert agents for content creation and editing:
- **Senior Writer**: Engaging, well-structured content across multiple formats
- **Technical Writer**: Technical documentation and user guides
- **Marketing Copywriter**: Persuasive content and brand messaging
- **Blog Writer**: Online content and thought leadership
- **Script Writer**: Narratives and storytelling content
- **Content Editor**: Quality improvement and editing

### ⚙️ **Technical Specialists** (`technical`)
Expert agents for software development and technical implementation:
- **Senior Developer**: Multi-language development and architecture design
- **DevOps Engineer**: Infrastructure, CI/CD, and system operations
- **System Architect**: Large-scale system design and patterns
- **Security Expert**: Cybersecurity and secure coding practices

### 💼 **Business Specialists** (`business`)
Expert agents for project management and business strategy:
- **Project Manager**: Coordination, planning, and project delivery
- **Business Analyst**: Requirements gathering and process optimization
- **Product Manager**: Product strategy and feature prioritization
- **Operations Manager**: Workflow optimization and operational excellence
- **Strategy Consultant**: Business insights and growth strategies

## 🚀 **Quick Start**

### Using Plugins in Agent Chat

```typescript
import { createAgentChat } from '../index.ts';
import { createPluginRegistry, loadPluginsFromDirectory } from '../plugin-system.ts';

// Load all plugins
const context = { /* plugin context */ };
const pluginRegistry = createPluginRegistry(context);
await loadPluginsFromDirectory(pluginRegistry, './plugins');

// Get agents from plugins
const allAgents = pluginRegistry.getAllPluginAgents();

// Create agent chat with plugin agents
const chat = await createAgentChat({
  database: { url: 'postgresql://...' },
  agents: {
    // Use specific agents from plugins
    researcher: allAgents.senior_researcher,
    writer: allAgents.senior_writer,
    developer: allAgents.senior_developer,
    manager: allAgents.project_manager
  }
});

// Send a message - agents automatically coordinate
const response = await chat.process({
  type: 'send_message',
  message: 'Build a new AI product with research, development, content, and project management',
  userId: 'user123'
});
```

### Loading Specific Plugins

```typescript
import { createPluginRegistry, createPluginLoader } from '../plugin-system.ts';

const registry = createPluginRegistry(context);
const loader = createPluginLoader(registry);

// Load individual plugins
const researchPlugin = await loader.loadFromFile('./plugins/research/index.ts');
await registry.loadPlugin(researchPlugin);

// Get agents from specific plugin
const researchAgents = registry.getPluginAgents('research');
console.log(researchAgents); // { senior_researcher: {...}, market_researcher: {...}, ... }
```

## 🔧 **Creating Custom Plugins**

### Plugin Structure

```
plugins/
└── my-plugin/
    └── index.ts    # Plugin definition (required)
```

### Plugin Definition

```typescript
// plugins/my-plugin/index.ts
import type { AgentPlugin } from '../../types.ts';

const myPlugin: AgentPlugin = {
  // Plugin metadata
  id: 'my-plugin',
  name: 'My Specialists',
  description: 'Custom specialist agents for my domain',
  version: '1.0.0',
  author: 'Your Name',
  tags: ['custom', 'domain-specific'],

  // Agent definitions
  agents: {
    specialist_agent: {
      role: 'domain_specialist',
      description: 'Expert in my specific domain',
      llmProvider: 'openai',
      llmModel: 'gpt-4o-mini',
      temperature: 0.5,
      maxTokens: 1000,
      personality: {
        tone: 'professional',
        verbosity: 'balanced',
        traits: ['expert', 'helpful', 'domain-focused']
      },
      joinCriteria: {
        keywords: ['domain', 'specialist', 'expert'],
        mentionRequired: false
      }
    }
  },

  // Optional: Plugin lifecycle
  async initialize(context) {
    console.log('🔌 My Plugin: Initializing...');
    // Custom initialization logic
  },

  async cleanup() {
    console.log('🔌 My Plugin: Cleaning up...');
    // Custom cleanup logic
  },

  // Optional: Service dependencies
  requiredServices: ['ai']
};

export default myPlugin;
```

### Agent Configuration Options

```typescript
interface AgentConfig {
  // Basic info
  role: string;                    // Agent role type
  description?: string;            // What the agent does
  
  // AI Configuration
  llmProvider?: string;            // 'openai', 'anthropic', 'groq', etc.
  llmModel?: string;               // Model name
  temperature?: number;            // 0.0 (precise) to 1.0 (creative)
  maxTokens?: number;              // Response length limit
  
  // Personality
  personality?: {
    tone?: string;                 // 'professional', 'creative', 'technical'
    verbosity?: 'concise' | 'balanced' | 'detailed';
    traits?: string[];             // ['analytical', 'helpful', 'expert']
  };
  
  // Join Criteria
  joinCriteria?: {
    keywords?: string[];           // Keywords that trigger interest
    mentionRequired?: boolean;     // Must be @mentioned
  };
  
  // Knowledge Integration
  knowledgeBase?: {
    enabled: boolean;
    searchThreshold?: number;      // Relevance threshold (0.0-1.0)
  };
}
```

## 📊 **Plugin Management**

### Loading and Unloading

```typescript
// Load plugin
const success = await registry.loadPlugin(myPlugin);

// Check if loaded
const isLoaded = registry.isPluginLoaded('my-plugin');

// Unload plugin
await registry.unloadPlugin('my-plugin');

// Get plugin stats
const stats = registry.getPluginStats();
console.log(stats['my-plugin']); // { loaded: true, agentCount: 1, ... }
```

### Plugin Information

```typescript
// List all plugins
const plugins = registry.listPlugins();

// Get specific plugin
const plugin = registry.getPlugin('research');

// Get plugin agents
const researchAgents = registry.getPluginAgents('research');
const allAgents = registry.getAllPluginAgents();
```

## 🎯 **Best Practices**

### 1. **Plugin Naming**
- Use lowercase with hyphens: `my-domain-experts`
- Keep IDs short but descriptive
- Avoid conflicts with existing plugins

### 2. **Agent Design**
- **Specific roles**: Each agent should have a clear specialty
- **Appropriate temperature**: 0.1-0.3 for precise tasks, 0.7+ for creative
- **Relevant keywords**: Include terms users would naturally use
- **Clear descriptions**: Help users understand when to use each agent

### 3. **Performance**
- **Token limits**: Set appropriate `maxTokens` for response length
- **Provider selection**: Choose AI providers based on agent needs
- **Join criteria**: Prevent unnecessary agent activation

### 4. **Plugin Organization**
- **Logical grouping**: Group related agents in the same plugin
- **Version management**: Use semantic versioning
- **Dependencies**: Declare required services

## 🔄 **Plugin Lifecycle**

1. **Load**: Plugin file is imported and validated
2. **Initialize**: Optional `initialize()` method called
3. **Register**: Agents become available to the system
4. **Use**: Agents can be selected and used in conversations
5. **Unload**: Optional `cleanup()` method called
6. **Remove**: Plugin and agents removed from registry

## 🧪 **Testing Plugins**

```bash
# Test plugin system
deno run --allow-all --env plugin-test.ts

# Test specific functionality
deno run --allow-all --env -c "
import { createPluginRegistry } from './plugin-system.ts';
const registry = createPluginRegistry({});
// Test your plugin here
"
```

## 📈 **Advanced Features**

### Custom Tools
Plugins can define custom communication tools:

```typescript
const myPlugin: AgentPlugin = {
  // ... other config
  tools: [
    {
      name: 'custom_action',
      description: 'Perform a custom action',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string' }
        }
      },
      execute: async (params, context) => {
        // Custom tool implementation
        return { toolCallId: '', success: true, result: 'Done' };
      }
    }
  ]
};
```

### Plugin Dependencies
Declare dependencies on other plugins:

```typescript
const myPlugin: AgentPlugin = {
  // ... other config
  dependencies: ['research', 'technical'],
  requiredServices: ['ai', 'knowledge']
};
```

## 🚀 **Future Enhancements**

- **Plugin Marketplace**: Share and discover plugins
- **Hot Reloading**: Update plugins without restart
- **Plugin Templates**: Scaffolding for new plugins
- **Metrics**: Plugin performance tracking
- **Sandbox**: Isolated plugin execution

---

*The plugin system makes the Agent Chat Framework infinitely extensible. Create specialized agents for any domain and share them with the community!* 🌟 