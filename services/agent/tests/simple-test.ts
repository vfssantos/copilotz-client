// =============================================================================
// SIMPLE TOOL TEST - Testing API tools with agent framework
// =============================================================================

import { createAgentChat } from '../index.ts';
import { createPluginRegistry, createToolRegistry } from '../plugin-system.ts';
import apiToolsPlugin from '../tools/api/index.ts';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runSimpleToolTest() {
  console.log('🛠️ Starting Simple Tool Test...\n');

  try {
    // 1. Create tool registry and load API tools
    console.log('1. Setting up tool system...');
    const toolRegistry = createToolRegistry();
    const pluginContext = {
      agentRegistry: null,
      database: null,
      aiService: null,
      knowledgeService: null,
      toolRegistry
    };
    const pluginRegistry = createPluginRegistry(pluginContext, toolRegistry);
    
    // Load API tools plugin
    console.log('   Loading API tools plugin...');
    const success = await pluginRegistry.loadPlugin(apiToolsPlugin);
    if (!success) {
      throw new Error('Failed to load API tools plugin');
    }
    
    // Check what tools are available
    const availableTools = toolRegistry.getAllTools();
    console.log(`   ✅ Loaded ${availableTools.length} tools: ${availableTools.map(t => t.name).join(', ')}`);
    console.log('');

    // 2. Create agent chat with tool-enabled agent
    console.log('2. Creating tool-enabled agent...');
    const chat = await createAgentChat({
      database: {
        url: ':memory:' // In-memory database for testing
      },
      toolRegistry: toolRegistry, // Pass the tool registry to the agent system
      agents: {
        coordinator: {
          role: 'coordinator',
          description: `A coordinator agent that coordinates the work of other agents. 
You are responsible for creating threads and sending messages to them.
It is also responsible for joining threads and sending messages to them.
if you need advanced habilities, you can call other agents to do the work for you.
Use the create_thread and end_thread tools, and simply respond accordinly`,
          llmProvider: 'openai',
          llmModel: 'gpt-4o-mini',
          temperature: 0.3, // Lower temperature for more precise API usage
          maxTokens: 5000,
          personality: {
            tone: 'technical',
            verbosity: 'detailed',
            traits: ['precise', 'analytical', 'helpful']
          },
          tools: ['create_thread', 'end_thread'], // Specify which tools this agent can use
        },
        researcher: {
          role: 'researcher',
          description: 'A researcher agent that researches the web',
          llmProvider: 'openai',
          llmModel: 'gpt-4o-mini',
          temperature: 0.3, // Lower temperature for more precise API usage
          maxTokens: 5000,
          personality: {
            tone: 'technical',
            verbosity: 'detailed',
            traits: ['precise', 'analytical', 'helpful']
          },
          joinCriteria: {
            keywords: ['researcher', 'research', 'research', 'research'],
            mentionRequired: false
          },
          tools: ['api_call'], // Specify which tools this agent can use
        }
      },
      callbacks: {
        onMessage: (message) => {
          console.log(`💬 ${message.sender}: ${message.content}`);
        },
        onTaskCreated: (event) => {
          console.log(`📋 New task created: ${event.taskId}`);
        },
        onAgentJoined: (event) => {
          console.log(`🤝 ${event.agentId} joined the conversation`);
        },
        onToolCall: (event) => {
          console.log(`🔧 Tool called: ${event.toolCall.name} by ${event.agentId}`);
          console.log(`   Parameters: ${JSON.stringify(event.toolCall.parameters)}`);
        },
        onToolResult: (event) => {
          const success = event.result.success ? '✅' : '❌';
          console.log(`${success} Tool result: ${event.toolCall.name} (${event.executionTime}ms)`);
          if (event.result.success) {
            console.log(`   Result: ${JSON.stringify(event.result.result)}`);
          } else {
            console.log(`   Error: ${event.result.error}`);
          }
        }
      }
    });

    console.log('✅ Tool-enabled agent system initialized\n');

    // 3. Test simple API call
    console.log('3. Testing API call functionality...');
    console.log('📤 Asking agent to make an API call to httpbin.org (a testing service)');
    console.log('');
    
    const response = await chat.process({
      type: 'send_message',
      message: 'Please make an API call to https://httpbin.org/json to test our API functionality. This is a testing service that returns sample JSON data.',
      userId: 'test-user'
    });

    console.log('\n✅ Response received!');
    console.log(`📋 Task ID: ${response.taskId}`);
    console.log(`🤖 Agent responses: ${response.agentResponses.length}`);
    console.log(`⏱️  Processing time: ${response.processingTime}ms\n`);


    // Clean up
    await sleep(10000);
    await chat.close();

    console.log('🎉 Tool test completed successfully!');
    console.log('🛠️ Your agent can now use API tools! Next steps:');
    console.log('   1. Try different API endpoints');
    console.log('   2. Test POST requests with data');
    console.log('   3. Add more tool plugins (web, system, etc.)');
    console.log('   4. Create custom tools for your specific needs\n');

  } catch (error) {
    console.error('❌ Tool test failed:', error);
    console.error('💡 Make sure you have:');
    console.error('   1. Set up your OpenAI API key');
    console.error('   2. Internet connection for API calls');
    console.error('   3. All required permissions (--allow-net, --allow-read, etc.)\n');
  }
}

// Run the test
if (import.meta.main) {
  await runSimpleToolTest();
}

export { runSimpleToolTest }; 