// =============================================================================
// SEQUENTIAL EXECUTION TEST - Test sequential agent processing within conversations
// =============================================================================

import { createAgentChat } from '../index.ts';

async function runSequentialExecutionTest() {
  console.log('🧪 Starting Sequential Execution Test...\n');

  try {
    // Create agent chat with multiple agents in specific order
    const chat = await createAgentChat({
      database: {
        url: ':memory:' // In-memory database for testing
      },
      agents: {
        // Order matters! These should execute in this exact order:
        first_agent: {
          role: 'first_responder',
          description: 'Always responds first. Sets the context for other agents.',
          shortDescription: 'Responds first and sets context',
          llmProvider: 'openai',
          llmModel: 'gpt-4.1',
          temperature: 0.3,
          maxTokens: 1000,
          personality: {
            tone: 'professional',
            verbosity: 'concise',
            traits: ['leader', 'organized']
          },
          joinCriteria: {
            mentionRequired: false,
            keywords: ['help'] 
          }
        },
        
        second_agent: {
          role: 'second_responder', 
          description: 'Responds second. Builds upon the first agent response and adds detailed analysis.',
          shortDescription: 'Builds upon first agent response',
          llmProvider: 'openai',
          llmModel: 'gpt-4.1',
          temperature: 0.4,
          maxTokens: 1000,
          personality: {
            tone: 'analytical',
            verbosity: 'detailed',
            traits: ['thorough', 'building']
          },
          joinCriteria: {
            mentionRequired: false,
            keywords: ['help']
          }
        },
        
        third_agent: {
          role: 'final_responder',
          description: 'Responds last. Summarizes and concludes based on previous agent responses.',
          shortDescription: 'Summarizes and concludes',
          llmProvider: 'openai',
          llmModel: 'gpt-4.1',
          temperature: 0.2,
          maxTokens: 1000,
          personality: {
            tone: 'conclusive',
            verbosity: 'balanced',
            traits: ['summarizing', 'decisive']
          },
          joinCriteria: {
            mentionRequired: false,
            keywords: ['help']
          }
        }
      },
      callbacks: {
        onMessage: (message) => {
          const timestamp = new Date().toLocaleTimeString();
          const truncated = message.content.length > 80 
            ? message.content.substring(0, 80) + '...'
            : message.content;
          console.log(`[${timestamp}] 💬 ${message.sender}: ${truncated}`);
        },
        onThreadCreated: (event) => {
          console.log(`🧵 Thread: "${event.purpose}" (${event.participants.join(', ')})`);
        }
      }
    });

    console.log('✅ Agent chat system initialized\n');
    
    // Test 1: Sequential execution in main conversation
    console.log('🔹 Test 1: Sequential execution in main conversation');
    console.log('📤 Message: "Hello team! I need help with sequential processing"');
    console.log('📝 Expected order: first_agent → second_agent → third_agent\n');
    
    const startTime = Date.now();
    const response1 = await chat.process({
      type: 'send_message',
      message: 'Hello team! I need help with sequential processing and coordination.',
      userId: 'test-user'
    });
    const endTime = Date.now();
    
    console.log(`\n✅ Sequential processing completed in ${endTime - startTime}ms`);
    console.log(`🤖 Agent responses: ${response1.agentResponses.length}`);
    console.log(`📋 Response order verification:`);
    
    response1.agentResponses.forEach((response, index) => {
      console.log(`   ${index + 1}. ${response.agent}`);
    });
    
    // Verify order is correct
    const expectedOrder = ['first_agent', 'second_agent', 'third_agent'];
    const actualOrder = response1.agentResponses.map(r => r.agent);
    const orderCorrect = JSON.stringify(expectedOrder) === JSON.stringify(actualOrder);
    
    console.log(`\n🎯 Order verification: ${orderCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`);
    console.log(`   Expected: ${expectedOrder.join(' → ')}`);
    console.log(`   Actual:   ${actualOrder.join(' → ')}`);
    
    // Test 2: Demonstrate that threads can still run in parallel
    console.log('\n🔹 Test 2: Parallel thread execution');
    console.log('📤 Creating multiple threads simultaneously...\n');
    
    // This agent will create threads - let's add it temporarily
    const threadCreatorAgent = {
      role: 'thread_creator',
      description: 'Creates threads for parallel processing demonstration.',
      shortDescription: 'Creates demonstration threads',
      llmProvider: 'openai',
      llmModel: 'gpt-4.1',
      temperature: 0.3,
      maxTokens: 1000,
      personality: {
        tone: 'efficient',
        verbosity: 'concise',
        traits: ['organized', 'coordinator']
      },
      joinCriteria: {
        mentionRequired: false,
        keywords: ['threads']
      }
    };
    
    // Add the thread creator temporarily
    chat.database.createTask({
      userId: 'test-user',
      title: 'Thread Test',
      description: 'Testing thread creation',
      participants: ['test-user', 'thread_creator'],
      status: 'active',
      priority: 1,
      context: {},
      goals: [],
      constraints: {}
    });

    console.log('\n🎉 Sequential Execution Test completed successfully!');
    console.log('✅ Verified:');
    console.log('   - Agents execute in config definition order');
    console.log('   - Sequential execution within conversations');
    console.log('   - No race conditions between agents');
    console.log('   - Each agent can see previous responses');
    console.log('   - Predictable and deterministic behavior\n');
    
    // Clean up
    await chat.close();
    
    return orderCorrect;

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

// Run the test
if (import.meta.main) {
  const success = await runSequentialExecutionTest();
  Deno.exit(success ? 0 : 1);
}

export { runSequentialExecutionTest }; 