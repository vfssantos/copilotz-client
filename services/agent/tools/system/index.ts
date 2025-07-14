// =============================================================================
// SYSTEM TOOLS PLUGIN - File operations and safe command execution
// =============================================================================

import type { ToolPlugin, ToolDefinition, ToolExecutionContext, ToolResult } from '../../types.ts';

/**
 * File reading tool with security checks
 */
const fileReadTool: ToolDefinition = {
  name: 'file_read',
  description: 'Read content from files with proper security checks',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path to read from'
      },
      encoding: {
        type: 'string',
        description: 'Text encoding',
        enum: ['utf8', 'utf-8', 'ascii', 'latin1', 'base64'],
        default: 'utf8'
      },
      maxSize: {
        type: 'number',
        description: 'Maximum file size in bytes',
        default: 1048576, // 1MB
        minimum: 1,
        maximum: 10485760 // 10MB
      }
    },
    required: ['path']
  },
  rateLimit: {
    maxCalls: 50,
    windowMs: 60000 // 1 minute
  },
  dangerous: true, // Requires explicit consent
  execute: async (params, context): Promise<ToolResult> => {
    try {
      const { path, encoding = 'utf8', maxSize = 1048576 } = params;
      
      // Security checks
      const safePath = path.replace(/\.\./g, ''); // Remove directory traversal
      if (safePath !== path) {
        throw new Error('Directory traversal detected in path');
      }
      
      // Check if file exists and get stats
      let fileInfo;
      try {
        fileInfo = await Deno.stat(safePath);
      } catch (error) {
        throw new Error(`File not found or not accessible: ${safePath}`);
      }
      
      if (!fileInfo.isFile) {
        throw new Error(`Path is not a file: ${safePath}`);
      }
      
      if (fileInfo.size > maxSize) {
        throw new Error(`File too large: ${fileInfo.size} bytes (max: ${maxSize})`);
      }
      
      // Read file content
      let content: string;
      try {
        if (encoding === 'base64') {
          const bytes = await Deno.readFile(safePath);
          content = btoa(String.fromCharCode(...bytes));
        } else {
          content = await Deno.readTextFile(safePath);
        }
      } catch (error) {
        throw new Error(`Failed to read file: ${error.message}`);
      }
      
      const result = {
        path: safePath,
        content,
        encoding,
        size: fileInfo.size,
        modified: fileInfo.mtime?.toISOString(),
        readAt: new Date().toISOString()
      };
      
      return {
        toolCallId: context.messageId || '',
        success: true,
        result
      };
    } catch (error) {
      console.error(`❌ File read failed:`, error);
      
      return {
        toolCallId: context.messageId || '',
        success: false,
        result: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

/**
 * File writing tool with security checks
 */
const fileWriteTool: ToolDefinition = {
  name: 'file_write',
  description: 'Write content to files with proper security checks',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path to write to'
      },
      content: {
        type: 'string',
        description: 'Content to write to the file'
      },
      encoding: {
        type: 'string',
        description: 'Text encoding',
        enum: ['utf8', 'utf-8', 'ascii', 'latin1', 'base64'],
        default: 'utf8'
      },
      mode: {
        type: 'string',
        description: 'Write mode',
        enum: ['write', 'append'],
        default: 'write'
      },
      createDir: {
        type: 'boolean',
        description: 'Create parent directories if they don\'t exist',
        default: false
      }
    },
    required: ['path', 'content']
  },
  rateLimit: {
    maxCalls: 20,
    windowMs: 60000 // 1 minute
  },
  dangerous: true, // Requires explicit consent
  execute: async (params, context): Promise<ToolResult> => {
    try {
      const { path, content, encoding = 'utf8', mode = 'write', createDir = false } = params;
      
      // Security checks
      const safePath = path.replace(/\.\./g, ''); // Remove directory traversal
      if (safePath !== path) {
        throw new Error('Directory traversal detected in path');
      }
      
      // Create parent directories if requested
      if (createDir) {
        const dir = safePath.substring(0, safePath.lastIndexOf('/'));
        if (dir) {
          try {
            await Deno.mkdir(dir, { recursive: true });
          } catch (error) {
            // Directory might already exist, continue
          }
        }
      }
      
      // Write content
      let bytesWritten: number;
      try {
        if (encoding === 'base64') {
          // Decode base64 and write as binary
          const binaryString = atob(content);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          if (mode === 'append') {
            const existingBytes = await Deno.readFile(safePath).catch(() => new Uint8Array(0));
            const combinedBytes = new Uint8Array(existingBytes.length + bytes.length);
            combinedBytes.set(existingBytes);
            combinedBytes.set(bytes, existingBytes.length);
            await Deno.writeFile(safePath, combinedBytes);
            bytesWritten = combinedBytes.length;
          } else {
            await Deno.writeFile(safePath, bytes);
            bytesWritten = bytes.length;
          }
        } else {
          if (mode === 'append') {
            const file = await Deno.open(safePath, { create: true, append: true });
            const encoder = new TextEncoder();
            const encoded = encoder.encode(content);
            await file.write(encoded);
            file.close();
            bytesWritten = encoded.length;
          } else {
            await Deno.writeTextFile(safePath, content);
            bytesWritten = new TextEncoder().encode(content).length;
          }
        }
      } catch (error) {
        throw new Error(`Failed to write file: ${error.message}`);
      }
      
      // Get file stats
      const fileInfo = await Deno.stat(safePath);
      
      const result = {
        path: safePath,
        mode,
        encoding,
        bytesWritten,
        totalSize: fileInfo.size,
        modified: fileInfo.mtime?.toISOString(),
        writtenAt: new Date().toISOString()
      };
      
      return {
        toolCallId: context.messageId || '',
        success: true,
        result
      };
    } catch (error) {
      console.error(`❌ File write failed:`, error);
      
      return {
        toolCallId: context.messageId || '',
        success: false,
        result: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

/**
 * Directory listing tool
 */
const directoryListTool: ToolDefinition = {
  name: 'directory_list',
  description: 'List contents of directories with file information',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to list',
        default: '.'
      },
      recursive: {
        type: 'boolean',
        description: 'List subdirectories recursively',
        default: false
      },
      includeHidden: {
        type: 'boolean',
        description: 'Include hidden files and directories',
        default: false
      },
      maxDepth: {
        type: 'number',
        description: 'Maximum recursion depth',
        default: 3,
        minimum: 1,
        maximum: 10
      }
    },
    required: ['path']
  },
  rateLimit: {
    maxCalls: 30,
    windowMs: 60000 // 1 minute
  },
  execute: async (params, context): Promise<ToolResult> => {
    try {
      const { path = '.', recursive = false, includeHidden = false, maxDepth = 3 } = params;
      
      // Security checks
      const safePath = path.replace(/\.\./g, ''); // Remove directory traversal
      if (safePath !== path) {
        throw new Error('Directory traversal detected in path');
      }
      
      // Check if directory exists
      let dirInfo;
      try {
        dirInfo = await Deno.stat(safePath);
      } catch (error) {
        throw new Error(`Directory not found or not accessible: ${safePath}`);
      }
      
      if (!dirInfo.isDirectory) {
        throw new Error(`Path is not a directory: ${safePath}`);
      }
      
      // List directory contents
      const items: any[] = [];
      
      async function listDir(dirPath: string, depth: number = 0): Promise<void> {
        if (depth > maxDepth) return;
        
        try {
          for await (const entry of Deno.readDir(dirPath)) {
            // Skip hidden files if not requested
            if (!includeHidden && entry.name.startsWith('.')) {
              continue;
            }
            
            const itemPath = `${dirPath}/${entry.name}`;
            let itemInfo;
            
            try {
              itemInfo = await Deno.stat(itemPath);
            } catch (error) {
              console.warn(`Failed to stat ${itemPath}:`, error);
              continue;
            }
            
            const item = {
              name: entry.name,
              path: itemPath.replace(safePath + '/', ''),
              type: entry.isDirectory ? 'directory' : entry.isFile ? 'file' : 'other',
              size: itemInfo.size,
              modified: itemInfo.mtime?.toISOString(),
              permissions: {
                readable: true, // Assume readable if we can stat it
                writable: false, // Conservative default
                executable: false
              }
            };
            
            items.push(item);
            
            // Recurse into subdirectories
            if (recursive && entry.isDirectory && depth < maxDepth) {
              await listDir(itemPath, depth + 1);
            }
          }
        } catch (error) {
          console.warn(`Failed to read directory ${dirPath}:`, error);
        }
      }
      
      await listDir(safePath);
      
      // Sort items by type (directories first) then by name
      items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      
      const result = {
        path: safePath,
        itemCount: items.length,
        items: items.slice(0, 1000), // Limit to prevent huge responses
        recursive,
        includeHidden,
        listedAt: new Date().toISOString()
      };
      
      return {
        toolCallId: context.messageId || '',
        success: true,
        result
      };
    } catch (error) {
      console.error(`❌ Directory listing failed:`, error);
      
      return {
        toolCallId: context.messageId || '',
        success: false,
        result: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

/**
 * Safe command execution tool
 */
const executeCommandTool: ToolDefinition = {
  name: 'execute_command',
  description: 'Execute system commands safely with restrictions and timeouts',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Command to execute'
      },
      args: {
        type: 'array',
        description: 'Command arguments',
        items: { type: 'string' },
        default: []
      },
      cwd: {
        type: 'string',
        description: 'Working directory for command execution',
        default: '.'
      },
      timeout: {
        type: 'number',
        description: 'Command timeout in milliseconds',
        default: 30000,
        minimum: 1000,
        maximum: 300000 // 5 minutes max
      },
      captureOutput: {
        type: 'boolean',
        description: 'Capture stdout and stderr',
        default: true
      }
    },
    required: ['command']
  },
  rateLimit: {
    maxCalls: 10,
    windowMs: 60000 // 1 minute
  },
  dangerous: true, // Requires explicit consent
  execute: async (params, context): Promise<ToolResult> => {
    try {
      const { 
        command, 
        args = [], 
        cwd = '.', 
        timeout = 30000,
        captureOutput = true
      } = params;
      
      // Security checks - block dangerous commands
      const dangerousCommands = [
        'rm', 'rmdir', 'del', 'delete', 'format', 'fdisk',
        'chmod', 'chown', 'passwd', 'sudo', 'su',
        'reboot', 'shutdown', 'halt', 'poweroff',
        'iptables', 'netsh', 'firewall-cmd'
      ];
      
      const baseCommand = command.split(' ')[0].toLowerCase();
      if (dangerousCommands.includes(baseCommand)) {
        throw new Error(`Command '${baseCommand}' is not allowed for security reasons`);
      }
      
      // Set up command execution
      const cmd = new Deno.Command(command, {
        args,
        cwd,
        stdout: captureOutput ? 'piped' : 'null',
        stderr: captureOutput ? 'piped' : 'null'
      });
      
      // Execute with timeout
      const startTime = Date.now();
      let process;
      let timeoutId: number;
      
      try {
        process = cmd.spawn();
        
        // Set up timeout
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            process.kill('SIGTERM');
            reject(new Error(`Command timed out after ${timeout}ms`));
          }, timeout);
        });
        
        // Wait for completion or timeout
        const result = await Promise.race([
          process.output(),
          timeoutPromise
        ]) as Deno.CommandOutput;
        
        clearTimeout(timeoutId);
        
        const executionTime = Date.now() - startTime;
        
        // Decode output
        const stdout = captureOutput ? new TextDecoder().decode(result.stdout) : '';
        const stderr = captureOutput ? new TextDecoder().decode(result.stderr) : '';
        
        const commandResult = {
          command: `${command} ${args.join(' ')}`,
          exitCode: result.code,
          success: result.success,
          stdout: stdout.slice(0, 10000), // Limit output size
          stderr: stderr.slice(0, 10000),
          executionTime,
          cwd,
          executedAt: new Date().toISOString()
        };
        
        return {
          toolCallId: context.messageId || '',
          success: true,
          result: commandResult
        };
      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        if (process) {
          try {
            process.kill('SIGKILL');
          } catch {
            // Process might already be dead
          }
        }
        throw error;
      }
    } catch (error) {
      console.error(`❌ Command execution failed:`, error);
      
      return {
        toolCallId: context.messageId || '',
        success: false,
        result: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

// =============================================================================
// SYSTEM TOOLS PLUGIN DEFINITION
// =============================================================================

const systemToolsPlugin: ToolPlugin = {
  id: 'system-tools',
  name: 'System Tools',
  description: 'Tools for file operations and safe system command execution',
  version: '1.0.0',
  author: 'Axion Functions',
  tags: ['system', 'file', 'command', 'filesystem'],
  
  tools: [
    fileReadTool,
    fileWriteTool,
    directoryListTool,
    executeCommandTool
  ],
  
  // Plugin lifecycle
  initialize: async (context) => {
    
  },
  
  cleanup: async () => {
    
  },
  
  // Plugin dependencies
  requiredServices: []
};

export default systemToolsPlugin; 