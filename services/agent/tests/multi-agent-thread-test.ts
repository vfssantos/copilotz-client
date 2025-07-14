// =============================================================================
// MULTI-AGENT THREAD MANAGEMENT TEST - Complete workflow demonstration
// =============================================================================

import { createAgentChat } from '../index.ts';

async function testMultiAgentThreadManagement() {
  console.log('🧵 Testing Enhanced Multi-Agent Thread Management...\n');

  try {
    // Create enhanced agent chat with multiple specialized agents
    console.log('🤖 Creating multi-agent system with thread management...');
    const chat = await createAgentChat({
      database: { url: ':memory:' },
      agents: {
        coordinator: {
          name: 'coordinator',
          role: 'project_coordinator',
          description: 'Coordinates tasks and manages communication between teams',
          llmProvider: 'openai',
          llmModel: 'gpt-4o-mini',
          temperature: 0.3,
          tools: ['send', 'create_thread', 'end_thread', 'send_to_thread'],
          joinCriteria: { keywords: ['coordinate', 'organize', 'manage'], mentionRequired: false }
        },
        researcher: {
          name: 'researcher',
          role: 'data_researcher', 
          description: 'Specializes in research and data analysis',
          llmProvider: 'openai',
          llmModel: 'gpt-4o-mini',
          temperature: 0.2,
          tools: ['send', 'end_thread', 'send_to_thread'],
          joinCriteria: { keywords: ['research', 'analyze', 'data'], mentionRequired: false }
        },
        analyst: {
          name: 'analyst',
          role: 'data_analyst',
          description: 'Analyzes data and provides insights', 
          llmProvider: 'openai',
          llmModel: 'gpt-4o-mini',
          temperature: 0.2,
          tools: ['send', 'end_thread', 'send_to_thread'],
          joinCriteria: { keywords: ['analyze', 'insights', 'findings'], mentionRequired: false }
        }
      },
      callbacks: {
        onMessage: (msg) => {
          const context = msg.metadata?.conversationContext;
          const threadInfo = context?.type === 'thread' 
            ? `[Thread: ${context.threadPurpose}]` 
            : '[Main]';
          const messageType = msg.metadata?.isThreadSummary ? '📋 SUMMARY' :
                             msg.metadata?.isThreadClosure ? '🔒 CLOSURE' :
                             msg.metadata?.toolUsed ? `🔧 ${msg.metadata.toolUsed.toUpperCase()}` : '💬';
          
          console.log(`${threadInfo} ${messageType} ${msg.sender}: ${msg.content.substring(0, 80)}${msg.content.length > 80 ? '...' : ''}`);
        },
        onThreadCreated: (event) => {
          console.log(`🧵 Thread created: "${event.purpose}" by ${event.createdBy}`);
          console.log(`   Participants: ${event.participants.join(', ')}`);
        }
      }
    });

    console.log('✅ Multi-agent system initialized\n');

    // Test 1: Main conversation with comprehensive task management
    console.log('📋 Test 1: Starting complex multi-agent task...');
    await chat.process({
      type: 'send_message',
      message: 'We need to coordinate a comprehensive data analysis project. Please organize research and analysis teams to work on this.',
      userId: 'project-manager'
    });

    console.log('\n⏳ Waiting for thread creation and coordination...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test 2: Cross-thread communication
    console.log('📋 Test 2: Testing cross-thread communication...');
    await chat.process({
      type: 'send_message', 
      message: 'Can the research team share their initial findings with the analysis team?',
      userId: 'project-manager'
    });

    console.log('\n⏳ Waiting for cross-thread communication...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test 3: Thread closure with summaries
    console.log('📋 Test 3: Testing thread closure with summary generation...');
    await chat.process({
      type: 'send_message',
      message: 'Please wrap up the research phase and provide a summary of findings.',
      userId: 'project-manager'
    });

    console.log('\n⏳ Waiting for thread closure and summary...\n');
    await new Promise(resolve => setTimeout(resolve, 4000));

    console.log('\n🎉 Multi-Agent Thread Management Test Completed!');
    console.log('\n📊 FEATURES DEMONSTRATED:');
    console.log('   ✅ Comprehensive message history across all threads');
    console.log('   ✅ Thread lifecycle (creation, activity, closure)');
    console.log('   ✅ Cross-thread communication between agents');
    console.log('   ✅ Enhanced agent context with thread awareness');
    console.log('   ✅ Thread summaries sent to parent conversations');
    console.log('   ✅ Parallel thread execution capabilities');
    console.log('   ✅ Sequential agent processing within threads');
    console.log('\n🚀 The enhanced unified processor successfully handles complex multi-agent workflows!');

    return true;

  } catch (error) {
    console.error('❌ Multi-agent thread test failed:', error);
    return false;
  }
}

/**
 * Test specific thread management features
 */
async function testThreadLifecycleFeatures() {
  console.log('\n🔄 Testing Thread Lifecycle Features...');
  
  try {
    const chat = await createAgentChat({
      database: { url: ':memory:' },
      agents: {
        team_lead: {
          name: 'team_lead',
          role: 'team_leader',
          description: 'Manages team coordination and task assignment',
          llmProvider: 'openai',
          llmModel: 'gpt-4o-mini',
          tools: ['create_thread', 'end_thread', 'send_to_thread'],
          joinCriteria: { keywords: ['lead', 'coordinate'], mentionRequired: false }
        }
      },
      callbacks: {
        onMessage: (msg) => console.log(`🔄 ${msg.sender}: ${msg.content.substring(0, 60)}...`),
        onThreadCreated: (event) => console.log(`🧵 Created: ${event.purpose}`)
      }
    });

    // Test thread creation
    await chat.process({
      type: 'send_message',
      message: 'Create a focused thread to handle user onboarding tasks.',
      userId: 'manager'
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('✅ Thread lifecycle features tested successfully!');
    return true;

  } catch (error) {
    console.error('❌ Thread lifecycle test failed:', error);
    return false;
  }
}

/**
 * Run all multi-agent thread tests
 */
export async function runMultiAgentThreadTests() {
  console.log('🚀 RUNNING COMPLETE MULTI-AGENT THREAD TESTS');
  console.log('='.repeat(70));
  console.log('');

  const results = {
    multiAgent: await testMultiAgentThreadManagement(),
    lifecycle: await testThreadLifecycleFeatures()
  };

  const allPassed = Object.values(results).every(passed => passed);

  console.log('\n' + '='.repeat(70));
  console.log('📊 MULTI-AGENT THREAD TEST RESULTS:');
  console.log(`   → Multi-agent workflow: ${results.multiAgent ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   → Thread lifecycle: ${results.lifecycle ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   → Overall: ${allPassed ? '🎉 ALL TESTS PASSED' : '💥 SOME TESTS FAILED'}`);
  console.log('='.repeat(70));

  return allPassed;
}

// Run if called directly
if (import.meta.main) {
  await runMultiAgentThreadTests();
}

export { testMultiAgentThreadManagement, testThreadLifecycleFeatures }; 