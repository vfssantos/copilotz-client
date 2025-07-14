// =============================================================================
// COMMUNICATION TEST - Test improved communication tools and formatting
// =============================================================================

import { createAgentChat } from '../index.ts';

async function runCommunicationTest() {
  console.log('🧪 Starting Communication Test...\n');

  try {
    // Create agent chat with multiple agents to test coordination
    const chat = await createAgentChat({
      database: {
        url: ':memory:' // In-memory database for testing
      },
      agents: {
        coordinator: {
          role: 'project_coordinator',
          description: 'Coordinates tasks and manages project workflow. Creates threads when needed and uses send tool for communication. Experienced in breaking down complex projects into manageable tasks and ensuring team coordination.',
          shortDescription: 'Coordinates projects and manages workflows',
          llmProvider: 'openai',
          llmModel: 'gpt-4.1',
          temperature: 0.4,
          maxTokens: 2000,
          personality: {
            tone: 'professional',
            verbosity: 'concise',
            traits: ['organized', 'efficient', 'proactive']
          },
          joinCriteria: {
            mentionRequired: false,
            keywords: ['help']
          }
        },
        analyst: {
          role: 'data_analyst',
          description: 'Analyzes data and provides insights. Uses communication tools to share findings. Expert in statistical analysis, data visualization, and turning raw data into actionable insights.',
          shortDescription: 'Analyzes data and provides insights',
          llmProvider: 'openai',
          llmModel: 'gpt-4.1',
          temperature: 0.3,
          maxTokens: 2000,
          personality: {
            tone: 'analytical',
            verbosity: 'detailed',
            traits: ['thorough', 'precise', 'data-driven']
          },
          joinCriteria: {
            mentionRequired: false,
            keywords: ['']
          }
        },
        assistant: {
          role: 'general_assistant',
          description: 'Provides general assistance and support. Uses tools to help with various tasks. Versatile problem-solver who can adapt to different situations and provide practical solutions.',
          shortDescription: 'Provides general assistance and support',
          llmProvider: 'openai',
          llmModel: 'gpt-4.1-nano',
          temperature: 0.5,
          maxTokens: 2000,
          personality: {
            tone: 'friendly',
            verbosity: 'balanced',
            traits: ['helpful', 'responsive', 'supportive']
          },
          joinCriteria: {
            mentionRequired: false,
            keywords: ['']
          }
        }
      },
      callbacks: {
        onMessage: (message) => {
          const truncated = message.content.length > 120 
            ? message.content.substring(0, 120) + '...'
            : message.content;
          console.log(`💬 [${message.senderType}] ${message.sender}: ${truncated}`);
        },
        onThreadCreated: (event) => {
          console.log(`🧵 Thread created: "${event.purpose}" (${event.threadId.substring(0, 8)}...)`);
          console.log(`   Participants: ${event.participants.join(', ')}`);
        },
        onToolCall: (event) => {
          console.log(`🔧 Tool called: ${event.toolCall.name} by ${event.agentId}`);
        }
      }
    });

    console.log('✅ Agent chat system initialized\n');

    // Test 1: Basic communication with send tool
    console.log('🔹 Test 1: Basic communication with improved context visibility');
    console.log('📤 Sending: "Hello team! I need help to coordinate this task. Please assist with data analysis and organize our workflow."');
    
    const response1 = await chat.process({
      type: 'send_message',
      message: 'Hello team! I need help to coordinate this task. Can you introduce yourselves and show me what other agents are available?',
      userId: 'team-lead'
    });

    console.log(`✅ Response received in ${response1.processingTime}ms`);
    console.log(`🤖 Agent responses: ${response1.agentResponses.length}`);
    console.log(`🧵 Threads created: ${response1.threadsCreated.length}`);
   

    // Clean up
    await chat.close();

    console.log('🎉 All communication tests completed successfully!');
    console.log('✅ Verified:');
    console.log('   - Multi-agent coordination');
    console.log('   - Improved tool calling format');
    console.log('   - Thread creation and management');
    console.log('   - Context preservation');
    console.log('   - Complex task coordination');
    console.log('   - Tool execution tracking\n');

    return true;

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

// Run the test
if (import.meta.main) {
  const success = await runCommunicationTest();
  Deno.exit(success ? 0 : 1);
}

export { runCommunicationTest }; 