// =============================================================================
// SIMPLE TOOL TEST - Testing API tools with agent framework
// =============================================================================

import { createAgentChat } from '../index.ts';
import { createPluginRegistry, createToolRegistry } from '../plugin-system.ts';
import apiToolsPlugin from '../tools/api/index.ts';

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
          description: `A coordinator agent that coordinates the work of other agents. You are responsible for creating threads and sending messages to them.
          It is also responsible for joining threads and sending messages to them.
          if you need advanced habilities, you can call other agents to do the work for you.`,
          llmProvider: 'openai',
          llmModel: 'gpt-4o',
          temperature: 0.3, // Lower temperature for more precise API usage
          maxTokens: 5000,
          personality: {
            tone: 'technical',
            verbosity: 'detailed',
            traits: ['precise', 'analytical', 'helpful']
          },
          tools: ['create_thread', 'send', 'join_thread'], // Specify which tools this agent can use
        },
        researcher: {
          role: 'researcher',
          description: 'A researcher agent that researches the web',
          llmProvider: 'openai',
          llmModel: 'gpt-4o',
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

    // Show the agent's response and any tool calls
    if (response.agentResponses.length > 0) {
      const agentResponse = response.agentResponses[0];
      console.log(`🤖 ${agentResponse.agent} says:`);
      console.log(`   ${agentResponse.content}\n`);
      
      if (agentResponse.toolCalls && agentResponse.toolCalls.length > 0) {
        console.log(`🛠️ Tool calls made: ${agentResponse.toolCalls.length}`);
        for (const toolCall of agentResponse.toolCalls) {
          console.log(`   - ${toolCall.name} with parameters:`, JSON.stringify(toolCall.parameters, null, 2));
        }
        console.log('');
      }
    }

    // 4. Test another API call with different parameters
    console.log('4. Testing API call with custom headers...');
    console.log('📤 Asking agent to make an API call with custom headers');
    console.log('');
    
    const followUp = await chat.process({
      type: 'send_message',
      message: 'Now please make a GET request to https://httpbin.org/headers and include a custom header "X-Test-Header: AgentFrameworkTest"',
      taskId: response.taskId, // Continue the same task
      userId: 'test-user'
    });

    if (followUp.agentResponses.length > 0) {
      const agentResponse = followUp.agentResponses[0];
      console.log(`🤖 ${agentResponse.agent} says:`);
      console.log(`   ${agentResponse.content}\n`);
      
      if (agentResponse.toolCalls && agentResponse.toolCalls.length > 0) {
        console.log(`🛠️ Additional tool calls: ${agentResponse.toolCalls.length}`);
        for (const toolCall of agentResponse.toolCalls) {
          console.log(`   - ${toolCall.name}:`, JSON.stringify(toolCall.parameters, null, 2));
        }
        console.log('');
      }
    }

    // 5. Show tool usage statistics
    console.log('5. Tool usage statistics:');
    const toolStats = toolRegistry.getToolStats();
    for (const [toolName, stats] of Object.entries(toolStats)) {
      console.log(`   ${toolName}: ${stats.callCount} calls, ${stats.errorCount} errors`);
      if (stats.lastUsed) {
        console.log(`      Last used: ${stats.lastUsed.toLocaleTimeString()}`);
      }
      if (stats.averageExecutionTime) {
        console.log(`      Avg execution time: ${Math.round(stats.averageExecutionTime)}ms`);
      }
    }
    console.log('');

    // Clean up
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