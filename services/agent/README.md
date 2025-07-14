# Agent Chat Service 🤖

A powerful multi-agent conversation service built on PostgreSQL/PGlite with **real AI integration** using the existing AI service. Enables natural conversations between users and multiple AI agents with intelligent communication tools and context awareness.

## ✨ Key Features

- **🧠 Real AI Integration**: Powered by OpenAI, Anthropic, and other LLM providers
- **🤖 Multi-Agent Coordination**: Multiple AI agents collaborate on tasks
- **💬 Natural Conversations**: Main conversations + focused threads (like Slack/Teams)
- **🛠️ Intelligent Communication**: Agents use tools to decide where to send messages
- **📚 Context Awareness**: Agents understand conversation history and participant roles  
- **🗄️ Persistent Storage**: PostgreSQL/PGlite with ominipg database operations
- **⚡ Async Processing**: Parallel agent responses for maximum efficiency
- **🎯 Role-Based Behavior**: Each agent has specialized roles and personalities

## 🏗️ Architecture

```
┌─ Task (Project/Conversation) ─────────────────────────┐
│                                                       │
│  📋 Main Conversation                                 │
│  ├─ User: "Research and write a blog post about AI"  │
│  ├─ Researcher: Uses create_thread for research      │
│  ├─ Writer: Uses create_thread for writing           │
│  └─ Coordinator: Uses send_to_main for updates       │
│                                                       │
│  🧵 Thread: "Research Phase"                         │
│  ├─ Researcher: "Found key trends..."                │
│  └─ User: "Focus on healthcare applications"         │
│                                                       │
│  🧵 Thread: "Writing Phase"                          │
│  ├─ Writer: "Here's the draft outline..."            │
│  └─ Coordinator: "Timeline looks good"               │
│                                                       │
└───────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Basic Usage with AI-Powered Agents

```typescript
import { createAgentChat } from './services/agent/index.ts';

const chat = await createAgentChat({
  database: { url: 'postgresql://...' }, // or ':memory:' for testing
  agents: {
    researcher: {
      role: 'research_specialist',
      description: 'Expert researcher who analyzes data and gathers insights',
      llmProvider: 'openai',
      llmModel: 'gpt-4o-mini',
      temperature: 0.3, // More factual responses
      personality: {
        tone: 'professional',
        verbosity: 'detailed',
        traits: ['analytical', 'thorough', 'evidence-based']
      },
      joinCriteria: {
        keywords: ['research', 'analyze', 'data', 'investigate']
      }
    },
    writer: {
      role: 'content_creator', 
      description: 'Creative writer who produces engaging content',
      llmProvider: 'openai',
      llmModel: 'gpt-4o-mini',
      temperature: 0.7, // More creative responses
      personality: {
        tone: 'creative',
        verbosity: 'balanced',
        traits: ['articulate', 'engaging', 'storyteller']
      },
      joinCriteria: {
        keywords: ['write', 'create', 'content', 'blog', 'article']
      }
    }
  },
  callbacks: {
    onMessage: (msg) => console.log(`${msg.sender}: ${msg.content}`)
  }
});

// Send a message - agents automatically join and coordinate
const response = await chat.process({
  type: 'send_message',
  message: 'Help me create a comprehensive article about renewable energy trends',
  userId: 'user123'
});

console.log(`Task: ${response.taskId}`);
console.log(`Agents responded: ${response.agentResponses.length}`);
console.log(`Threads created: ${response.threadsCreated.length}`);
```

### Environment Setup

The service integrates with your existing AI service. Make sure you have API keys:

```bash
export DEFAULT_OPENAI_KEY="your-openai-api-key"
export DEFAULT_ANTHROPIC_KEY="your-anthropic-api-key"
# Or other supported provider keys
```

### Example Agent Response Flow

When you send: *"Help me research and write a technical blog post about machine learning in healthcare"*

1. **Researcher Agent** (temperature: 0.3):
   - Analyzes the request for research needs
   - Uses `create_thread` tool: "Research: ML Healthcare Applications"
   - Provides detailed, factual research findings

2. **Writer Agent** (temperature: 0.7):
   - Recognizes writing task
   - Uses `create_thread` tool: "Writing: Technical Blog Draft" 
   - Creates engaging, well-structured content

3. **Technical Expert** (temperature: 0.2):
   - Joins for technical accuracy
   - Uses `send_to_thread` for technical review
   - Ensures code examples and technical details are correct

## 🛠️ Communication Tools

Agents automatically use these tools to coordinate:

- **`send_to_main`**: Share updates with everyone
- **`create_thread`**: Start focused discussions with specific participants  
- **`send_to_thread`**: Contribute to existing thread discussions
- **`join_thread`**: Join ongoing thread conversations

## 👥 Agent Roles & Personalities

### Research Specialist
```typescript
{
  role: 'research_specialist',
  llmProvider: 'openai',
  temperature: 0.3, // Factual
  personality: {
    tone: 'professional',
    traits: ['analytical', 'thorough', 'evidence-based']
  }
}
```

### Content Creator  
```typescript
{
  role: 'content_creator',
  llmProvider: 'openai', 
  temperature: 0.7, // Creative
  personality: {
    tone: 'creative',
    traits: ['articulate', 'engaging', 'storyteller']
  }
}
```

### Technical Expert
```typescript
{
  role: 'technical_expert',
  llmProvider: 'anthropic',
  model: 'claude-3-sonnet',
  temperature: 0.2, // Precise
  personality: {
    tone: 'technical',
    traits: ['precise', 'systematic', 'code-focused']
  }
}
```

### Project Coordinator
```typescript
{
  role: 'project_coordinator',
  temperature: 0.5, // Balanced
  personality: {
    tone: 'professional',
    verbosity: 'concise',
    traits: ['organized', 'diplomatic', 'goal-oriented']
  }
}
```

## 📊 Real-World Example

```typescript
// Complex multi-agent task
const response = await chat.process({
  type: 'send_message',
  message: `I need to launch a new product. Help me:
  1. Research market trends and competitors
  2. Create marketing content and blog posts  
  3. Plan the technical implementation
  4. Coordinate the overall project timeline`,
  userId: 'product-manager'
});

// Agents automatically coordinate:
// 1. Researcher creates "Market Analysis" thread
// 2. Writer creates "Marketing Content" thread  
// 3. Technical Expert creates "Implementation Plan" thread
// 4. Coordinator uses main conversation for status updates
```

## 🔧 Advanced Configuration

### Custom Agent with Knowledge Integration

```typescript
{
  role: 'domain_expert',
  description: 'Specialized expert with access to company knowledge base',
  llmProvider: 'anthropic',
  llmModel: 'claude-3-sonnet',
  temperature: 0.4,
  knowledgeBase: {
    enabled: true,
    collectionIds: ['company-docs', 'technical-specs'],
    searchThreshold: 0.8
  },
  personality: {
    tone: 'authoritative',
    verbosity: 'detailed',
    traits: ['expert', 'comprehensive', 'company-focused']
  }
}
```

### Multi-Provider Setup

```typescript
agents: {
  creative_agent: {
    llmProvider: 'openai',
    llmModel: 'gpt-4',
    temperature: 0.8
  },
  analytical_agent: {  
    llmProvider: 'anthropic',
    llmModel: 'claude-3-sonnet',
    temperature: 0.2
  },
  conversational_agent: {
    llmProvider: 'groq', 
    llmModel: 'mixtral-8x7b',
    temperature: 0.6
  }
}
```

## 🧪 Testing

Run the AI integration test:

```bash
cd services/agent
deno run --allow-all --env test.ts
```

This test showcases:
- Real AI-powered agent responses
- Intelligent tool usage for communication
- Multi-agent coordination on complex tasks
- Thread creation and management
- Token usage and performance metrics

## 📈 Performance

- **Response Time**: 1-3 seconds per agent (depends on LLM provider)
- **Parallel Processing**: All agents respond simultaneously
- **Token Efficiency**: Context-aware prompt construction
- **Database**: Optimized queries with proper indexing
- **Memory**: Efficient message truncation for long conversations

## 🔌 Integration

The service integrates seamlessly with:

- **AI Service**: Uses existing `/services/ai/` for LLM calls
- **Knowledge Service**: Can query `/services/knowledge/` for context
- **Database**: PostgreSQL with ominipg for persistence
- **Axion Functions**: Ready for HTTP endpoint exposure

## 🚀 Production Ready

- ✅ Real AI integration with multiple providers
- ✅ Error handling and graceful degradation  
- ✅ Database persistence and transactions
- ✅ Token usage tracking and optimization
- ✅ Comprehensive logging and monitoring
- ✅ Type-safe with full TypeScript support
- ✅ Battle-tested with integration tests

## 🎯 Next Steps

1. **Create HTTP Endpoints**: Expose via Axion Functions for web integration
2. **Add Learning**: Agent performance tracking and improvement
3. **Workflow Templates**: Pre-built templates for common use cases
4. **Advanced Tools**: File handling, web search, code execution
5. **Real-time Updates**: WebSocket support for live conversations

---

*Ready to experience the future of AI collaboration? The Agent Chat Service brings together the best of multiple AI providers with intelligent coordination and natural conversation flow.* 🚀 