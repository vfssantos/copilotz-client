// =============================================================================
// TOOL CALLBACK TEST - Focused test for tool execution callbacks
// =============================================================================

import { createAgentChat } from '../index.ts';
import { createPluginRegistry, createToolRegistry } from '../plugin-system.ts';
import apiToolsPlugin from '../tools/api/index.ts';

async function runToolCallbackTest() {
  console.log('🎯 Testing Tool Callbacks...\n');

  try {
    // 1. Setup tool registry
    const toolRegistry = createToolRegistry();
    const pluginContext = {
      agentRegistry: null,
      database: null,
      aiService: null,
      knowledgeService: null,
      toolRegistry
    };
    const pluginRegistry = createPluginRegistry(pluginContext, toolRegistry);
    await pluginRegistry.loadPlugin(apiToolsPlugin);

    // 2. Create agent chat with focused callbacks
    const chat = await createAgentChat({
      database: {
        url: ':memory:'
      },
      toolRegistry: toolRegistry,
      agents: {
        callback_tester: {
          role: 'callback_tester',
          description: 'Agent for testing tool callbacks',
          llmProvider: 'openai',
          llmModel: 'gpt-4o-mini',
          temperature: 0.3,
          maxTokens: 400,
          personality: {
            tone: 'concise',
            verbosity: 'concise',
            traits: ['focused']
          }
        }
      },
      callbacks: {
        onMessage: (message) => {
          if (message.metadata?.isToolResultsMessage) {
            // Skip the consolidated tool results messages to reduce noise
            return;
          }
          console.log(`📝 Message: ${message.sender} - ${message.content.substring(0, 80)}...`);
        },
        onToolCall: (event) => {
          console.log(`\n🔧 TOOL CALL EVENT:`);
          console.log(`   Tool: ${event.toolCall.name}`);
          console.log(`   Agent: ${event.agentId}`);
          console.log(`   Parameters: ${JSON.stringify(event.toolCall.parameters)}`);
          console.log(`   Time: ${event.timestamp.toLocaleTimeString()}`);
        },
        onToolResult: (event) => {
          const success = event.result.success ? '✅' : '❌';
          console.log(`\n${success} TOOL RESULT EVENT:`);
          console.log(`   Tool: ${event.toolCall.name}`);
          console.log(`   Agent: ${event.agentId}`);
          console.log(`   Execution Time: ${event.executionTime}ms`);
          console.log(`   Success: ${event.result.success}`);
          if (event.result.success) {
            console.log(`   Result Preview: ${JSON.stringify(event.result.result).substring(0, 100)}...`);
          } else {
            console.log(`   Error: ${event.result.error}`);
          }
          console.log(`   Time: ${event.timestamp.toLocaleTimeString()}`);
        }
      }
    });

    console.log('✅ Test setup complete\n');

    // 3. Test tool execution with callbacks
    console.log('🚀 Making test API call...');
    const response = await chat.process({
      type: 'send_message',
      message: 'Make a simple GET request to https://httpbin.org/ip to get the current IP address',
      userId: 'callback-tester'
    });

    console.log(`\n📊 Response Summary:`);
    console.log(`   Task ID: ${response.taskId}`);
    console.log(`   Agent Responses: ${response.agentResponses.length}`);
    console.log(`   Processing Time: ${response.processingTime}ms`);

    // Clean up
    await chat.close();

    console.log('\n🎉 Tool callback test completed!');
    console.log('✅ If you see "TOOL CALL EVENT" and "TOOL RESULT EVENT" above, callbacks are working!');

  } catch (error) {
    console.error('❌ Tool callback test failed:', error);
    console.error('💡 Make sure your OpenAI API key is set');
  }
}

// Run the test
if (import.meta.main) {
  await runToolCallbackTest();
}

export { runToolCallbackTest }; 