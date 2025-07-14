# 🛠️ Tool Plugins

This directory contains tool plugins that provide additional capabilities to agents. Tools are functions that agents can call to perform specific tasks like web searches, API calls, file operations, and more.

## 🏗️ Architecture

- **Tool Registry**: Manages and executes tools with rate limiting and error handling
- **Tool Plugins**: Packages containing one or more related tools
- **Tool Execution**: Secure execution with proper context and error handling
- **Plugin Loading**: Dynamic loading and unloading of tool capabilities

## 📦 Available Tool Plugins

### Web Tools (`/web`)
Tools for internet-based operations:
- **`websearch`**: Search the web using various search engines
- **`fetch_url`**: Fetch content from URLs with proper headers
- **`scrape_webpage`**: Extract structured data from web pages

### API Tools (`/api`)
Tools for API interactions:
- **`api_call`**: Make HTTP requests to external APIs
- **`rest_client`**: Advanced REST API interactions
- **`webhook`**: Send webhook notifications

### System Tools (`/system`)
Tools for system operations:
- **`execute_command`**: Execute system commands safely
- **`file_read`**: Read files from the filesystem
- **`file_write`**: Write files to the filesystem
- **`directory_list`**: List directory contents

### Data Tools (`/data`)
Tools for data processing:
- **`json_process`**: Process and transform JSON data
- **`csv_parse`**: Parse and analyze CSV files
- **`text_transform`**: Transform and analyze text content

## 🔧 Tool Structure

Each tool must implement the `ToolDefinition` interface:

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  category?: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (params: any, context: ToolExecutionContext) => Promise<ToolResult>;
  rateLimit?: {
    maxCalls: number;
    windowMs: number;
  };
  requiresAuth?: boolean;
  dangerous?: boolean;
}
```

## 🎯 Tool Plugin Example

```typescript
// tools/web/index.ts
import type { ToolPlugin } from '../../types.ts';

const webToolsPlugin: ToolPlugin = {
  id: 'web-tools',
  name: 'Web Tools',
  description: 'Tools for web searches and content fetching',
  version: '1.0.0',
  author: 'Axion Functions',
  tags: ['web', 'search', 'content'],
  
  tools: [
    {
      name: 'websearch',
      description: 'Search the web for information',
      category: 'web',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query'
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results',
            default: 10
          }
        },
        required: ['query']
      },
      rateLimit: {
        maxCalls: 100,
        windowMs: 60000 // 1 minute
      },
      execute: async (params, context) => {
        // Tool implementation
        return {
          toolCallId: context.messageId || '',
          success: true,
          result: { /* search results */ }
        };
      }
    }
  ],
  
  requiredServices: ['network']
};

export default webToolsPlugin;
```

## 🚀 Usage

Tools are automatically available to agents once their plugin is loaded:

```typescript
// Load tool plugins
await pluginRegistry.loadPlugin(webToolsPlugin);
await pluginRegistry.loadPlugin(apiToolsPlugin);

// Agents can now use these tools in their responses
const response = await agent.processMessage(
  "Search for recent AI developments",
  conversationContext
);

// Agent might respond with:
// "I'll search for recent AI developments for you."
// [Uses websearch tool internally]
```

## 🛡️ Security Features

- **Rate Limiting**: Prevent tool abuse with configurable limits
- **Authentication**: Tools can require authentication
- **Dangerous Flags**: Mark potentially risky tools
- **Error Handling**: Comprehensive error capture and reporting
- **Context Isolation**: Tools run in isolated contexts

## 📊 Monitoring

Tool usage is tracked with detailed statistics:
- Call counts and success rates
- Average execution times
- Error rates and types
- Last usage timestamps

## 🔌 Plugin Management

```typescript
// Get all available tools
const tools = toolRegistry.getAllTools();

// Get tools by category
const webTools = toolRegistry.getToolsByCategory('web');

// Execute a tool directly
const result = await toolRegistry.executeTool('websearch', {
  query: 'latest AI news',
  maxResults: 5
}, context);

// Get tool statistics
const stats = toolRegistry.getToolStats();
```

## 🤝 Contributing

To create a new tool plugin:

1. Create a directory under `/tools/`
2. Implement tools following the `ToolDefinition` interface
3. Create an `index.ts` file exporting the plugin
4. Test the plugin with the tool test suite
5. Update this README with your new tools

Happy building! 🚀 