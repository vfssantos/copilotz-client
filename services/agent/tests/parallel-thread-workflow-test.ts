// =============================================================================
// PARALLEL THREAD WORKFLOW TEST - Complete end-to-end test
// =============================================================================

import { createAgentChat, AgentChat } from '../index.ts';
import { createToolRegistry } from '../plugin-system.ts';
import type { ConversationMessage, ThreadCreatedEvent } from '../types.ts';

interface TestResults {
  success: boolean;
  phases: {
    threadCreation: boolean;
    parallelProcessing: boolean;
    threadContinuation: boolean;
    threadClosure: boolean;
    summaryProcessing: boolean;
  };
  messages: ConversationMessage[];
  errors: string[];
  performanceMetrics: {
    totalDuration: number;
    threadCreationTime: number;
    parallelProcessingTime: number;
    summaryProcessingTime: number;
  };
}

/**
 * Comprehensive test for the complete parallel thread workflow
 */
export async function testParallelThreadWorkflow(): Promise<TestResults> {
  console.log('🧪 Starting Parallel Thread Workflow Test...\n');
  
  const startTime = Date.now();
  const results: TestResults = {
    success: false,
    phases: {
      threadCreation: false,
      parallelProcessing: false,
      threadContinuation: false,
      threadClosure: false,
      summaryProcessing: false
    },
    messages: [],
    errors: [],
    performanceMetrics: {
      totalDuration: 0,
      threadCreationTime: 0,
      parallelProcessingTime: 0,
      summaryProcessingTime: 0
    }
  };

  try {
    // Initialize test environment
    const { agentService, conversationHistory } = await setupTestEnvironment();
    
    console.log('📋 Test Environment Setup Complete');
    console.log(`   Registered Agents: coordinator, helper, reviewer`);
    console.log(`   Tools Available: communication tools loaded\n`);

    // Phase 1: Test Thread Creation and Immediate Response
    console.log('🔄 PHASE 1: Thread Creation and Parallel Processing');
    const threadCreationStart = Date.now();
    
    const response = await agentService.process({
      type: 'send_message',
      message: 'I need help analyzing the requirements for our new user authentication system. ' +
               'Let me create a focused discussion thread.',
      userId: 'user_1'
    });

    // Verify thread was created and main conversation continued
    if (response.threadsCreated && response.threadsCreated.length > 0) {
      results.phases.threadCreation = true;
      results.performanceMetrics.threadCreationTime = Date.now() - threadCreationStart;
      console.log(`   ✅ Thread Created: ${response.threadsCreated[0]}`);
      console.log(`   ✅ Main Conversation Continued: ${response.agentResponses.length} responses`);
      console.log(`   ⏱️  Creation Time: ${results.performanceMetrics.threadCreationTime}ms`);
    } else {
      results.errors.push('No threads were created in Phase 1');
    }

    // Wait for background thread processing to complete
    console.log('\n⏳ Waiting for background thread processing...');
    await waitForThreadProcessing(agentService, 3000);

    // Phase 2: Verify Thread Continuation
    console.log('\n🔄 PHASE 2: Thread Continuation Testing');
    const continuationStart = Date.now();
    
    const threadHistory = await agentService.process({
      type: 'get_thread_history',
      threadId: response.threadsCreated[0],
      userId: 'user_1'
    });
    
    console.log(`   📊 Thread Messages: ${threadHistory.messages.length}`);
    
    // Check for proper continuation (multiple agents should have responded)
    const agentResponses = threadHistory.messages.filter(m => m.senderType === 'agent');
    const uniqueAgents = new Set(agentResponses.map(m => m.sender));
    
    if (uniqueAgents.size >= 2) {
      results.phases.threadContinuation = true;
      console.log(`   ✅ Thread Continuation: ${uniqueAgents.size} agents participated`);
      console.log(`   📝 Agents: ${Array.from(uniqueAgents).join(', ')}`);
    } else {
      results.errors.push(`Insufficient thread continuation: only ${uniqueAgents.size} agents responded`);
    }

    // Phase 3: Test Thread Closure with Summary
    console.log('\n🔄 PHASE 3: Thread Closure and Summary Generation');
    const closureStart = Date.now();
    
    // Trigger thread closure by sending ending signal
    await agentService.process({
      type: 'send_message',
      message: 'Based on our discussion, I think we have enough information. ' +
               'The requirements are clear: implement OAuth 2.0 with multi-factor authentication, ' +
               'use JWT tokens for session management, and ensure GDPR compliance. Task completed.',
      taskId: response.taskId,
      threadId: response.threadsCreated[0],
      userId: 'user_1'
    });

    // Wait for closure processing
    await waitForThreadProcessing(agentService, 2000);
    
    // Check if thread was properly closed
    const finalThreadHistory = await agentService.process({
      type: 'get_thread_history',
      threadId: response.threadsCreated[0],
      userId: 'user_1'
    });
    
    const closureMessages = finalThreadHistory.messages.filter(m => 
      m.metadata?.toolUsed === 'end_thread' || 
      m.content.toLowerCase().includes('thread closed') ||
      m.messageType === 'summary'
    );
    
    if (closureMessages.length > 0) {
      results.phases.threadClosure = true;
      console.log(`   ✅ Thread Closure: ${closureMessages.length} closure messages found`);
    } else {
      results.errors.push('Thread closure not detected');
    }

    // Phase 4: Test Summary Processing in Parent Conversation  
    console.log('\n🔄 PHASE 4: Summary Processing in Parent Conversation');
    const summaryStart = Date.now();
    
    // Wait for summary to be processed in parent conversation
    await waitForThreadProcessing(agentService, 2000);
    
    // Check main conversation for thread summary
    const mainHistory = await agentService.process({
      type: 'get_task_history',
      taskId: response.taskId,
      userId: 'user_1'
    });
    
    const summaryMessages = mainHistory.messages.filter(m => 
      m.metadata?.isThreadSummary === true || 
      (m.content.includes('Thread "') && m.content.includes('completed'))
    );
    
    if (summaryMessages.length > 0) {
      results.phases.summaryProcessing = true;
      results.performanceMetrics.summaryProcessingTime = Date.now() - summaryStart;
      console.log(`   ✅ Summary Processing: ${summaryMessages.length} summary messages in main conversation`);
      
      // Check if other agents responded to the summary
      const summaryResponsesAfter = mainHistory.messages.filter(m => 
        new Date(m.timestamp) > new Date(summaryMessages[0].timestamp) &&
        m.senderType === 'agent' &&
        !summaryMessages.some(sm => sm.sender === m.sender)
      );
      
      if (summaryResponsesAfter.length > 0) {
        console.log(`   ✅ Summary Triggered Responses: ${summaryResponsesAfter.length} follow-up responses`);
      }
    } else {
      results.errors.push('Thread summary not found in parent conversation');
    }

    // Phase 5: Performance and Parallel Processing Verification
    console.log('\n🔄 PHASE 5: Performance Analysis');
    
    const totalMessages = conversationHistory.length;
    const threadMessages = finalThreadHistory.messages.length;
    const mainMessages = mainHistory.messages.length;
    
    // Verify parallel processing occurred (thread and main conversation both active)
    const hasParallelMessages = mainMessages > 1 && threadMessages > 1;
    if (hasParallelMessages) {
      results.phases.parallelProcessing = true;
      console.log(`   ✅ Parallel Processing: Main (${mainMessages}) + Thread (${threadMessages}) messages`);
    }

    // Final Results
    results.performanceMetrics.totalDuration = Date.now() - startTime;
    results.messages = [...mainHistory.messages, ...finalThreadHistory.messages];
    
    const successfulPhases = Object.values(results.phases).filter(Boolean).length;
    results.success = successfulPhases >= 4; // At least 4 out of 5 phases successful
    
    console.log('\n📊 TEST RESULTS SUMMARY');
    console.log('========================');
    console.log(`Overall Success: ${results.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Successful Phases: ${successfulPhases}/5`);
    console.log(`Total Duration: ${results.performanceMetrics.totalDuration}ms`);
    console.log(`Total Messages: ${totalMessages}`);
    console.log(`Errors: ${results.errors.length}`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ Errors:');
      results.errors.forEach(error => console.log(`   - ${error}`));
    }

    console.log('\n✅ Phases:');
    Object.entries(results.phases).forEach(([phase, success]) => {
      console.log(`   ${success ? '✅' : '❌'} ${phase}: ${success ? 'PASS' : 'FAIL'}`);
    });

    // Clean up
    await agentService.close();

  } catch (error) {
    results.errors.push(`Test execution failed: ${error.message}`);
    console.error('❌ Test execution failed:', error);
  }

  return results;
}

/**
 * Setup test environment with agents and tools
 */
async function setupTestEnvironment() {
  const conversationHistory: ConversationMessage[] = [];
  
  // Create agent service with message tracking
  const agentService = await createAgentChat({
    database: { url: ':memory:' },
    toolRegistry: createToolRegistry(),
    agents: {
      coordinator: {
        role: 'coordinator',
        description: 'Coordinates discussions and manages overall task flow',
        llmProvider: 'openai',
        llmModel: 'gpt-4o',
        temperature: 0.7,
        personality: {
          tone: 'professional',
          verbosity: 'concise',
          traits: ['organized', 'efficient']
        },
        tools: ['create_thread', 'send', 'end_thread']
      },
      helper: {
        role: 'specialist',
        description: 'Technical specialist who provides detailed analysis and recommendations',
        llmProvider: 'openai',
        llmModel: 'gpt-4o',
        temperature: 0.6,
        personality: {
          tone: 'technical',
          verbosity: 'detailed',
          traits: ['analytical', 'thorough']
        },
        tools: ["__"]
      },
      reviewer: {
        role: 'reviewer',
        description: 'Reviews proposals and provides quality assurance feedback',
        llmProvider: 'openai',
        llmModel: 'gpt-4o',
        temperature: 0.5,
        personality: {
          tone: 'critical',
          verbosity: 'precise',
          traits: ['detail-oriented', 'quality-focused']
        },
        tools: ["__"]
      }
    },
    callbacks: {
      onMessage: (message) => {
        conversationHistory.push(message);
        console.log(`   📨 ${message.sender}: ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`);
      }
    }
  });

  return { agentService, conversationHistory };
}

/**
 * Wait for background thread processing to complete
 */
async function waitForThreadProcessing(agentService: AgentChat, maxWaitMs: number): Promise<void> {
  const startTime = Date.now();
  let attempts = 0;
  const maxAttempts = Math.floor(maxWaitMs / 100);

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
    
    // Could add more sophisticated completion detection here
    // For now, just wait the specified time
  }
  
  console.log(`   ⏱️  Waited ${Date.now() - startTime}ms for background processing`);
}

/**
 * Run the test if this file is executed directly
 */
if (import.meta.main) {
  testParallelThreadWorkflow()
    .then(results => {
      console.log('\n🏁 Test completed');
      Deno.exit(results.success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Test failed:', error);
      Deno.exit(1);
    });
} 