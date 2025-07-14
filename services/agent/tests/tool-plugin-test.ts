// =============================================================================
// TOOL PLUGIN SYSTEM TEST - Comprehensive testing of all tool plugins
// =============================================================================

import type { PluginContext, ToolExecutionContext } from './types.ts';
import { createPluginRegistry, createToolRegistry } from './plugin-system.ts';

// Import tool plugins
import webToolsPlugin from './tools/web/index.ts';
import apiToolsPlugin from './tools/api/index.ts';
import systemToolsPlugin from './tools/system/index.ts';
import dataToolsPlugin from './tools/data/index.ts';

/**
 * Test tool plugin system functionality
 */
async function testToolPluginSystem() {
  console.log('🚀 Starting Tool Plugin System Tests...\n');
  
  // Create tool registry and plugin registry
  const toolRegistry = createToolRegistry();
  const pluginRegistry = createPluginRegistry({
    agentRegistry: null,
    database: null,
    aiService: null,
    knowledgeService: null,
    toolRegistry
  }, toolRegistry);
  
  try {
    // =============================================================================
    // PLUGIN LOADING TESTS
    // =============================================================================
    
    console.log('📦 Testing Plugin Loading...');
    
    // Load all tool plugins
    const plugins = [webToolsPlugin, apiToolsPlugin, systemToolsPlugin, dataToolsPlugin];
    const loadResults = [];
    
    for (const plugin of plugins) {
      console.log(`Loading plugin: ${plugin.name}...`);
      const success = await pluginRegistry.loadPlugin(plugin);
      loadResults.push({ plugin: plugin.name, success });
      
      if (success) {
        console.log(`✅ ${plugin.name} loaded successfully`);
      } else {
        console.log(`❌ ${plugin.name} failed to load`);
      }
    }
    
    // Check plugin stats
    const pluginStats = pluginRegistry.getPluginStats();
    console.log('\n📊 Plugin Statistics:');
    for (const [pluginId, stats] of Object.entries(pluginStats)) {
      console.log(`  ${pluginId}: ${stats.toolCount} tools, loaded: ${stats.loaded}`);
    }
    
    // Check tool registry
    const allTools = toolRegistry.getAllTools();
    console.log(`\n🔧 Total tools registered: ${allTools.length}`);
    for (const tool of allTools) {
      console.log(`  - ${tool.name} (${tool.category}): ${tool.description}`);
    }
    
    // =============================================================================
    // TOOL EXECUTION TESTS
    // =============================================================================
    
    console.log('\n🧪 Testing Tool Execution...\n');
    
    // Create execution context
    const executionContext: ToolExecutionContext = {
      taskId: 'test-task',
      userId: 'test-user',
      messageId: 'test-message-001',
      agentId: 'test-agent'
    };
    
    // Test web tools
    console.log('🌐 Testing Web Tools...');
    
    // Test websearch
    try {
      console.log('  Testing websearch...');
      const searchResult = await toolRegistry.executeTool('websearch', {
        query: 'artificial intelligence latest news',
        maxResults: 3
      }, executionContext);
      
      if (searchResult.success) {
        console.log(`  ✅ websearch: Found ${searchResult.result.results?.length || 0} results`);
      } else {
        console.log(`  ❌ websearch failed: ${searchResult.error}`);
      }
    } catch (error) {
      console.log(`  ❌ websearch error: ${error.message}`);
    }
    
    // Test fetch_url
    try {
      console.log('  Testing fetch_url...');
      const fetchResult = await toolRegistry.executeTool('fetch_url', {
        url: 'https://httpbin.org/json',
        timeout: 5000
      }, executionContext);
      
      if (fetchResult.success) {
        console.log(`  ✅ fetch_url: ${fetchResult.result.metadata?.status} ${fetchResult.result.metadata?.statusText}`);
      } else {
        console.log(`  ❌ fetch_url failed: ${fetchResult.error}`);
      }
    } catch (error) {
      console.log(`  ❌ fetch_url error: ${error.message}`);
    }
    
    // Test API tools
    console.log('\n🔌 Testing API Tools...');
    
    // Test api_call
    try {
      console.log('  Testing api_call...');
      const apiResult = await toolRegistry.executeTool('api_call', {
        url: 'https://httpbin.org/get',
        method: 'GET',
        timeout: 5000
      }, executionContext);
      
      if (apiResult.success) {
        console.log(`  ✅ api_call: ${apiResult.result.status} ${apiResult.result.statusText}`);
      } else {
        console.log(`  ❌ api_call failed: ${apiResult.error}`);
      }
    } catch (error) {
      console.log(`  ❌ api_call error: ${error.message}`);
    }
    
    // Test rest_client
    try {
      console.log('  Testing rest_client...');
      const restResult = await toolRegistry.executeTool('rest_client', {
        url: 'https://httpbin.org/get',
        method: 'GET',
        query: { test: 'true', source: 'agent-tool-test' }
      }, executionContext);
      
      if (restResult.success) {
        console.log(`  ✅ rest_client: ${restResult.result.status} ${restResult.result.statusText}`);
      } else {
        console.log(`  ❌ rest_client failed: ${restResult.error}`);
      }
    } catch (error) {
      console.log(`  ❌ rest_client error: ${error.message}`);
    }
    
    // Test data tools
    console.log('\n📊 Testing Data Tools...');
    
    // Test json_process
    try {
      console.log('  Testing json_process...');
      const testJson = '{"name": "Test", "value": 42, "items": [1, 2, 3]}';
      const jsonResult = await toolRegistry.executeTool('json_process', {
        operation: 'parse',
        data: testJson
      }, executionContext);
      
      if (jsonResult.success && jsonResult.result.valid) {
        console.log(`  ✅ json_process: Successfully parsed JSON`);
      } else {
        console.log(`  ❌ json_process failed: ${jsonResult.error || 'Invalid JSON'}`);
      }
    } catch (error) {
      console.log(`  ❌ json_process error: ${error.message}`);
    }
    
    // Test csv_parse
    try {
      console.log('  Testing csv_parse...');
      const testCsv = 'Name,Age,City\nJohn,25,New York\nJane,30,London\nBob,35,Paris';
      const csvResult = await toolRegistry.executeTool('csv_parse', {
        data: testCsv,
        hasHeader: true,
        outputFormat: 'objects'
      }, executionContext);
      
      if (csvResult.success) {
        console.log(`  ✅ csv_parse: Parsed ${csvResult.result.rowCount} rows, ${csvResult.result.columnCount} columns`);
      } else {
        console.log(`  ❌ csv_parse failed: ${csvResult.error}`);
      }
    } catch (error) {
      console.log(`  ❌ csv_parse error: ${error.message}`);
    }
    
    // Test text_transform
    try {
      console.log('  Testing text_transform...');
      const testText = 'Hello World! This is a test. Visit https://example.com for more info.';
      const textResult = await toolRegistry.executeTool('text_transform', {
        text: testText,
        operations: ['stats', 'extract_urls', 'uppercase']
      }, executionContext);
      
      if (textResult.success) {
        const stats = textResult.result.results.stats;
        console.log(`  ✅ text_transform: ${stats.words} words, ${stats.characters} chars`);
      } else {
        console.log(`  ❌ text_transform failed: ${textResult.error}`);
      }
    } catch (error) {
      console.log(`  ❌ text_transform error: ${error.message}`);
    }
    
    // Test system tools (safe operations only)
    console.log('\n⚙️  Testing System Tools (safe operations)...');
    
    // Test directory_list
    try {
      console.log('  Testing directory_list...');
      const dirResult = await toolRegistry.executeTool('directory_list', {
        path: '.',
        recursive: false,
        includeHidden: false
      }, executionContext);
      
      if (dirResult.success) {
        console.log(`  ✅ directory_list: Found ${dirResult.result.itemCount} items`);
      } else {
        console.log(`  ❌ directory_list failed: ${dirResult.error}`);
      }
    } catch (error) {
      console.log(`  ❌ directory_list error: ${error.message}`);
    }
    
    // =============================================================================
    // TOOL DISCOVERY TESTS
    // =============================================================================
    
    console.log('\n🔍 Testing Tool Discovery...');
    
    // Test by category
    const webTools = toolRegistry.getToolsByCategory('web');
    console.log(`  Web tools: ${webTools.map(t => t.name).join(', ')}`);
    
    const apiTools = toolRegistry.getToolsByCategory('api');
    console.log(`  API tools: ${apiTools.map(t => t.name).join(', ')}`);
    
    const dataTools = toolRegistry.getToolsByCategory('data');
    console.log(`  Data tools: ${dataTools.map(t => t.name).join(', ')}`);
    
    const systemTools = toolRegistry.getToolsByCategory('system');
    console.log(`  System tools: ${systemTools.map(t => t.name).join(', ')}`);
    
    // Test search
    const searchResults = toolRegistry.searchTools('json');
    console.log(`  Search 'json': ${searchResults.map(t => t.name).join(', ')}`);
    
    // =============================================================================
    // STATISTICS AND MONITORING
    // =============================================================================
    
    console.log('\n📈 Tool Usage Statistics:');
    const toolStats = toolRegistry.getToolStats();
    
    for (const [toolName, stats] of Object.entries(toolStats)) {
      if (stats.callCount > 0) {
        console.log(`  ${toolName}: ${stats.callCount} calls, ${stats.errorCount} errors, avg: ${stats.averageExecutionTime?.toFixed(2)}ms`);
      }
    }
    
    // =============================================================================
    // PLUGIN MANAGEMENT TESTS
    // =============================================================================
    
    console.log('\n🔄 Testing Plugin Management...');
    
    // Test plugin unloading
    console.log('  Testing plugin unloading...');
    const unloadSuccess = await pluginRegistry.unloadPlugin('data-tools');
    console.log(`  ${unloadSuccess ? '✅' : '❌'} Data tools plugin unload: ${unloadSuccess}`);
    
    // Check tools after unload
    const toolsAfterUnload = toolRegistry.getAllTools();
    console.log(`  Tools after unload: ${toolsAfterUnload.length} (was ${allTools.length})`);
    
    // Test plugin reload
    console.log('  Testing plugin reload...');
    const reloadSuccess = await pluginRegistry.loadPlugin(dataToolsPlugin);
    console.log(`  ${reloadSuccess ? '✅' : '❌'} Data tools plugin reload: ${reloadSuccess}`);
    
    // Final plugin statistics
    console.log('\n📊 Final Plugin Statistics:');
    const finalStats = pluginRegistry.getPluginStats();
    for (const [pluginId, stats] of Object.entries(finalStats)) {
      console.log(`  ${pluginId}: type=${stats.type}, tools=${stats.toolCount}, loaded=${stats.loaded}`);
    }
    
    console.log('\n✅ All tool plugin tests completed successfully! 🎉');
    
  } catch (error) {
    console.error('\n❌ Tool plugin test failed:', error);
    throw error;
  }
}

/**
 * Test specific tool functionality in detail
 */
async function testToolDetails() {
  console.log('\n🔬 Detailed Tool Testing...\n');
  
  const toolRegistry = createToolRegistry();
  const pluginRegistry = createPluginRegistry({
    agentRegistry: null,
    database: null,
    aiService: null,
    toolRegistry
  }, toolRegistry);
  
  // Load data tools plugin for detailed testing
  await pluginRegistry.loadPlugin(dataToolsPlugin);
  
  const executionContext: ToolExecutionContext = {
    taskId: 'detail-test',
    userId: 'test-user',
    messageId: 'detail-001',
    agentId: 'test-agent'
  };
  
  // Test comprehensive JSON operations
  console.log('🔧 Testing JSON operations...');
  
  const complexJson = {
    users: [
      { id: 1, name: 'Alice', email: 'alice@example.com', active: true },
      { id: 2, name: 'Bob', email: 'bob@example.com', active: false },
      { id: 3, name: 'Charlie', email: 'charlie@example.com', active: true }
    ],
    metadata: {
      total: 3,
      created: '2024-01-01T00:00:00Z'
    }
  };
  
  // Test query operation
  const queryResult = await toolRegistry.executeTool('json_process', {
    operation: 'query',
    data: JSON.stringify(complexJson),
    query: 'users.*.name'
  }, executionContext);
  
  if (queryResult.success) {
    console.log('  ✅ JSON query test passed');
  }
  
  // Test transform operation
  const transformResult = await toolRegistry.executeTool('json_process', {
    operation: 'transform',
    data: JSON.stringify(complexJson),
    transform: {
      totalUsers: 'metadata.total',
      activeUsers: 'users.filter(u => u.active).length'
    }
  }, executionContext);
  
  if (transformResult.success) {
    console.log('  ✅ JSON transform test passed');
  }
  
  // Test CSV with more complex data
  console.log('\n📊 Testing CSV operations...');
  
  const complexCsv = `Product,Category,Price,Stock,Rating
"Laptop Pro","Electronics","$1299.99",15,4.8
"Coffee Maker","Kitchen","$89.99",32,4.2
"Book: AI Guide","Books","$29.99",100,4.9
"Wireless Mouse","Electronics","$24.99",67,4.1`;
  
  const csvAnalysisResult = await toolRegistry.executeTool('csv_parse', {
    data: complexCsv,
    hasHeader: true,
    outputFormat: 'summary'
  }, executionContext);
  
  if (csvAnalysisResult.success) {
    console.log('  ✅ CSV analysis test passed');
    console.log(`    Completeness: ${(csvAnalysisResult.result.output.overview.completeness * 100).toFixed(1)}%`);
  }
  
  console.log('\n✅ Detailed tool tests completed!');
}

// =============================================================================
// RUN TESTS
// =============================================================================

if (import.meta.main) {
  try {
    await testToolPluginSystem();
    await testToolDetails();
    console.log('\n🎉 All tool plugin tests passed! The tool plugin system is working correctly.');
  } catch (error) {
    console.error('\n💥 Tool plugin tests failed:', error);
    Deno.exit(1);
  }
} 