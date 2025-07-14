// =============================================================================
// SIMPLE THREAD TEST - Start simple and build up gradually  
// =============================================================================

import { createAgentChat } from '../index.ts';
import { createToolRegistry } from '../plugin-system.ts';

/**
 * Test 1: Basic single agent response
 */
async function testBasicAgent() {
  console.log('🤖 Test 1: Basic single agent...\n');

  try {
    // Create tool registry to enable communication tools
    const toolRegistry = createToolRegistry();
    
    const chat = await createAgentChat({
      database: { url: ':memory:' },
      toolRegistry: toolRegistry, // Enable communication tools
      agents: {
        helper: {
          name: 'helper',
          role: 'assistant',
          description: 'A helpful assistant that responds to messages',
          llmProvider: 'openai',
          llmModel: 'gpt-4o-mini',
          temperature: 0.7,
          tools: ['send'],
          joinCriteria: { keywords: ['help'], mentionRequired: false }
        }
      },
      callbacks: {
        onMessage: (msg) => {
          console.log(`📝 ${msg.sender}: ${msg.content}`);
        }
      }
    });

    console.log('Sending simple message...');
    await chat.process({
      type: 'send_message',
      message: 'Hello! Can you help me?',
      userId: 'user'
    });

    console.log('✅ Basic agent test completed!\n');
    return true;

  } catch (error) {
    console.error('❌ Basic agent test failed:', error);
    return false;
  }
}

/**
 * Test 2: Basic thread creation
 */
async function testBasicThreadCreation() {
  console.log('🧵 Test 2: Basic thread creation...\n');

  try {
    // Create tool registry to enable communication tools
    const toolRegistry = createToolRegistry();
    
    const chat = await createAgentChat({
      database: { url: ':memory:' },
      toolRegistry: toolRegistry, // Enable communication tools
      agents: {
        coordinator: {
          name: 'coordinator',
          role: 'coordinator',
          description: 'Creates threads when needed',
          llmProvider: 'openai', 
          llmModel: 'gpt-4o',
          temperature: 0.5,
          tools: ['send', 'create_thread', 'end_thread'],
          joinCriteria: { keywords: ['coordinate', 'create'], mentionRequired: false }
        },
        helper: {
            name: 'helper',
            role: 'assistant',
            description: 'A helpful assistant that responds to messages',
            llmProvider: 'openai',
            llmModel: 'gpt-4o-mini',
            temperature: 0.7,
            tools: [],
            joinCriteria: { keywords: ['help'], mentionRequired: false }
          }
      },
      callbacks: {
        onMessage: (msg) => {
          console.log(`📝 ${msg.sender}: ${msg.content}`);
        },
        onThreadCreated: (event) => {
          console.log(`🧵 Thread created: "${event.purpose}"`);
        }
      }
    });

    console.log('Requesting thread creation...');
    await chat.process({
      type: 'send_message',
      message: 'Please create a thread for planning tasks',
      userId: 'user'
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('✅ Basic thread creation test completed!\n');
    return true;

  } catch (error) {
    console.error('❌ Basic thread creation test failed:', error);
    return false;
  }
}

/**
 * Run simple tests
 */
export async function runSimpleTests() {
  console.log('🚀 RUNNING SIMPLE THREAD TESTS');
  console.log('='.repeat(50));
  console.log('');

  const results = {
    basic: await testBasicAgent(),
    thread: await testBasicThreadCreation()
  };

  const allPassed = Object.values(results).every(passed => passed);

  console.log('='.repeat(50));
  console.log('📊 SIMPLE TEST RESULTS:');
  console.log(`   → Basic agent: ${results.basic ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   → Thread creation: ${results.thread ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   → Overall: ${allPassed ? '🎉 ALL TESTS PASSED' : '💥 SOME TESTS FAILED'}`);
  console.log('='.repeat(50));

  return allPassed;
}

// Run if called directly
if (import.meta.main) {
  await runSimpleTests();
}

export { testBasicAgent, testBasicThreadCreation }; 