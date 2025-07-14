// =============================================================================
// PLUGIN SYSTEM TEST - Demonstrates dynamic loading of agent plugins
// =============================================================================

import { createPluginRegistry, createPluginLoader, loadPluginsFromDirectory } from './plugin-system.ts';
import { createAgentChat } from './index.ts';

async function runPluginSystemTest() {
  console.log('🔌 Running Plugin System Test...\n');

  try {
    // Test 1: Create plugin registry and loader
    console.log('1. Creating plugin registry and loader...');
    
    const context = {
      agentRegistry: null, // Will be set after agent chat creation
      database: null,
      aiService: null,
      knowledgeService: null
    };

    const pluginRegistry = createPluginRegistry(context);
    const pluginLoader = createPluginLoader(pluginRegistry);

    console.log('   ✅ Plugin system components created\n');

    // Test 2: Load individual plugins
    console.log('2. Loading individual plugins...');
    
    // Load research plugin
    const researchPlugin = await pluginLoader.loadFromFile('./plugins/research/index.ts');
    await pluginRegistry.loadPlugin(researchPlugin);

    // Load writing plugin
    const writingPlugin = await pluginLoader.loadFromFile('./plugins/writing/index.ts');
    await pluginRegistry.loadPlugin(writingPlugin);

    // Load technical plugin
    const technicalPlugin = await pluginLoader.loadFromFile('./plugins/technical/index.ts');
    await pluginRegistry.loadPlugin(technicalPlugin);

    // Load business plugin
    const businessPlugin = await pluginLoader.loadFromFile('./plugins/business/index.ts');
    await pluginRegistry.loadPlugin(businessPlugin);

    console.log('\n   ✅ Individual plugins loaded successfully\n');

    // Test 3: Show plugin statistics
    console.log('3. Plugin statistics:');
    const stats = pluginRegistry.getPluginStats();
    
    for (const [pluginId, pluginStats] of Object.entries(stats)) {
      console.log(`   📦 ${pluginId}:`);
      console.log(`      Loaded: ${pluginStats.loaded ? '✅' : '❌'}`);
      console.log(`      Agents: ${pluginStats.agentCount}`);
      console.log(`      Tools: ${pluginStats.toolCount}`);
      console.log(`      Loaded at: ${pluginStats.loadedAt?.toLocaleTimeString()}`);
    }
    console.log('');

    // Test 4: Get all plugin agents
    console.log('4. Available agents from plugins:');
    const allPluginAgents = pluginRegistry.getAllPluginAgents();
    
    for (const [agentId, agentConfig] of Object.entries(allPluginAgents)) {
      console.log(`   🤖 ${agentId} (${agentConfig.role}): ${agentConfig.description}`);
    }
    console.log(`\n   Total agents available: ${Object.keys(allPluginAgents).length}\n`);

    // Test 5: Create agent chat with plugin agents
    console.log('5. Creating agent chat with plugin-loaded agents...');
    
    // Select a few interesting agents from different plugins
    const selectedAgents = {
      senior_researcher: allPluginAgents.senior_researcher,
      senior_writer: allPluginAgents.senior_writer,
      senior_developer: allPluginAgents.senior_developer,
      project_manager: allPluginAgents.project_manager
    };

    const chat = await createAgentChat({
      database: { url: ':memory:' },
      agents: selectedAgents,
      callbacks: {
        onMessage: (message) => {
          const type = message.threadId ? '[THREAD]' : '[MAIN]';
          console.log(`  ${type} ${message.sender}: ${message.content.substring(0, 80)}...`);
        },
        onTaskCreated: (event) => {
          console.log(`  📋 Task created with participants: ${event.participants.join(', ')}`);
        },
        onAgentJoined: (event) => {
          console.log(`  🤝 ${event.agentId} joined: ${event.reason}`);
        }
      }
    });

    console.log('   ✅ Agent chat created with plugin agents\n');

    // Test 6: Test plugin agents with a complex request
    console.log('6. Testing plugin agents with complex request...');
    
    const response = await chat.process({
      type: 'send_message',
      message: 'I need to build a new AI-powered web application. Help me with research, architecture design, content strategy, and project planning.',
      userId: 'plugin-test-user'
    });

    console.log(`\n   ✅ Plugin agents responded successfully`);
    console.log(`   📋 Task: ${response.taskId}`);
    console.log(`   🤖 Responses: ${response.agentResponses.length}`);
    
    for (const agentResponse of response.agentResponses) {
      console.log(`\n   🤖 ${agentResponse.agent}:`);
      console.log(`      Content preview: ${agentResponse.content.substring(0, 100)}...`);
      if (agentResponse.toolCalls && agentResponse.toolCalls.length > 0) {
        console.log(`      Tool calls: ${agentResponse.toolCalls.map(t => t.name).join(', ')}`);
      }
    }
    console.log('');

    // Test 7: Show plugin agents by category
    console.log('7. Plugin agents by category:');
    
    const pluginCategories = {
      'Research Specialists': pluginRegistry.getPluginAgents('research'),
      'Writing Specialists': pluginRegistry.getPluginAgents('writing'),
      'Technical Specialists': pluginRegistry.getPluginAgents('technical'),
      'Business Specialists': pluginRegistry.getPluginAgents('business')
    };

    for (const [category, agents] of Object.entries(pluginCategories)) {
      console.log(`\n   📂 ${category}:`);
      for (const [agentId, agentConfig] of Object.entries(agents)) {
        console.log(`      🤖 ${agentId}: ${agentConfig.description?.substring(0, 60)}...`);
      }
    }
    console.log('');

    // Test 8: Load plugins from directory (alternative method)
    console.log('8. Testing directory-based plugin loading...');
    
    // Create a new registry for testing directory loading
    const newRegistry = createPluginRegistry(context);
    const directoryStats = await loadPluginsFromDirectory(newRegistry, './plugins');
    
    console.log(`   📂 Loaded ${directoryStats.length} plugins from directory`);
    for (const stat of directoryStats) {
      console.log(`      ${stat.id}: ${stat.loaded ? '✅' : '❌'} (${stat.agentCount} agents)`);
    }
    console.log('');

    // Test 9: Plugin management operations
    console.log('9. Testing plugin management...');
    
    console.log('   📋 Listing all plugins:');
    const allPlugins = pluginRegistry.listPlugins();
    for (const plugin of allPlugins) {
      console.log(`      📦 ${plugin.name} (${plugin.id}) v${plugin.version} - ${Object.keys(plugin.agents).length} agents`);
    }

    console.log('\n   🔄 Testing plugin unload/reload:');
    const unloadSuccess = await pluginRegistry.unloadPlugin('research');
    console.log(`      Unload research plugin: ${unloadSuccess ? '✅' : '❌'}`);
    
    const reloadSuccess = await pluginRegistry.loadPlugin(researchPlugin);
    console.log(`      Reload research plugin: ${reloadSuccess ? '✅' : '❌'}`);
    console.log('');

    // Clean up
    await chat.close();

    console.log('🎉 Plugin System test completed successfully!');
    console.log('🔌 The plugin system enables dynamic loading and management of specialized agent types');
    console.log('📦 Plugins provide modular, extensible agent capabilities');
    console.log('🤖 Agents can be loaded on-demand, providing scalable agent ecosystems\n');

  } catch (error) {
    console.error('❌ Plugin System test failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run test if this file is executed directly
if (import.meta.main) {
  await runPluginSystemTest();
}

export { runPluginSystemTest }; 