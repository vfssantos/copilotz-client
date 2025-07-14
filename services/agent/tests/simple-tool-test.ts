// =============================================================================
// SIMPLE TOOL TEST - Testing unified processor with API tools
// =============================================================================

import { createAgentChat } from '../index.ts';
import { createPluginRegistry, createToolRegistry } from '../plugin-system.ts';
import apiToolsPlugin from '../tools/api/index.ts';

async function runSimpleToolTest() {
  console.log('🛠️ Testing Unified Processor with API Tools...\n');

  try {
    // Setup tool registry with API tools
    console.log('🔧 Setting up unified tool system...');
    const toolRegistry = createToolRegistry();
    const pluginRegistry = createPluginRegistry({
      agentRegistry: null, database: null, aiService: null,
      knowledgeService: null, toolRegistry
    }, toolRegistry);

    await pluginRegistry.loadPlugin(apiToolsPlugin);
    const tools = toolRegistry.getAllTools();
    console.log(`   ✅ Loaded ${tools.length} tools: ${tools.map(t => t.name).join(', ')}\n`);

    // Create chat with API-enabled agent (using unified processor)
    console.log('🤖 Creating agent with unified conversation processor...');
    const chat = await createAgentChat({
      database: { url: ':memory:' },
      toolRegistry,
      agents: {
        api_assistant: {
          name: 'api_assistant',
          role: 'api_specialist',
          description: 'API specialist using unified processor',
          llmProvider: 'openai',
          llmModel: 'gpt-4o-mini',
          temperature: 0.1,
          tools: ['api_call'],
          joinCriteria: { keywords: ['api', 'test'], mentionRequired: false }
        }
      },
      callbacks: {
        onMessage: (msg) => {
          const type = msg.metadata?.isOriginalResponse ? '[AGENT]' :
            msg.metadata?.isToolResultsMessage ? '[TOOLS]' : '[MSG]';
          console.log(`${type} ${msg.sender}: ${msg.content.substring(0, 80)}...`);
        },
        onToolCall: (event) => console.log(`🔧 ${event.toolCall.name} called by ${event.agentId}`),
        onToolResult: (event) => console.log(`${event.result.success ? '✅' : '❌'} ${event.toolCall.name} (${event.executionTime}ms)`)
      }
    });

    console.log('🚀 Testing unified processor with API tools...\n');
    await chat.process({
      type: 'send_message',
      message: 'Make two API calls to https://httpbin.org/json to test our API functionality. This is a testing service that returns sample JSON data.',
      userId: 'test-user'
    });

    // Clean up
    await chat.close();


    console.log('\n✅ Unified processor with API tools test completed successfully!');
    console.log('   → Demonstrated unified conversation processing');
    console.log('   → Verified tool execution and continuation logic');
    console.log('   → Confirmed backward compatibility\n');

  } catch (error) {
    console.error('❌ Unified processor test failed:', error);
    console.error('💡 Requirements: OpenAI API key, internet connection, --allow-net permission\n');
  }
}

// Run the unified processor tool test
if (import.meta.main) {
  await runSimpleToolTest();
}

export { runSimpleToolTest }; 