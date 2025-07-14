// =============================================================================
// API TOOLS PLUGIN - HTTP requests, REST API interactions, and webhooks
// =============================================================================

import type { ToolPlugin, ToolDefinition, ToolExecutionContext, ToolResult } from '../../types.ts';

/**
 * Generic API call tool for HTTP requests
 */
const apiCallTool: ToolDefinition = {
  name: 'api_call',
  description: 'Make HTTP requests to external APIs with full control over headers, body, and method',
  category: 'api',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'API endpoint URL'
      },
      method: {
        type: 'string',
        description: 'HTTP method',
        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
        default: 'GET'
      },
      headers: {
        type: 'object',
        description: 'HTTP headers to include',
        default: {}
      },
      body: {
        type: 'string',
        description: 'Request body (JSON string for JSON APIs)'
      },
      contentType: {
        type: 'string',
        description: 'Content-Type header',
        enum: ['application/json', 'application/x-www-form-urlencoded', 'text/plain', 'application/xml'],
        default: 'application/json'
      },
      timeout: {
        type: 'number',
        description: 'Request timeout in milliseconds',
        default: 15000,
        minimum: 1000,
        maximum: 60000
      },
      validateSSL: {
        type: 'boolean',
        description: 'Whether to validate SSL certificates',
        default: true
      }
    },
    required: ['url']
  },
  rateLimit: {
    maxCalls: 100,
    windowMs: 60000 // 1 minute
  },
  execute: async (params, context): Promise<ToolResult> => {
    try {
      const { 
        url, 
        method = 'GET', 
        headers = {}, 
        body, 
        contentType = 'application/json',
        timeout = 15000,
        validateSSL = true
      } = params;
      
      // Validate URL
      try {
        new URL(url);
      } catch {
        throw new Error('Invalid URL format');
      }
      
      // Prepare headers
      const requestHeaders: Record<string, string> = {
        'User-Agent': 'AgentChat/1.0 (API Client)',
        ...headers
      };
      
      // Add content type if body is provided
      if (body && !requestHeaders['Content-Type']) {
        requestHeaders['Content-Type'] = contentType;
      }
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      // Prepare fetch options
      const fetchOptions: RequestInit = {
        method,
        headers: requestHeaders,
        signal: controller.signal
      };
      
      // Add body for non-GET requests
      if (body && method !== 'GET' && method !== 'HEAD') {
        fetchOptions.body = body;
      }
      
      const startTime = Date.now();
      const response = await fetch(url, fetchOptions);
      const responseTime = Date.now() - startTime;
      
      clearTimeout(timeoutId);
      
      // Get response headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      
      // Get response body
      const responseContentType = response.headers.get('content-type') || '';
      let responseBody;
      
      try {
        if (responseContentType.includes('application/json')) {
          responseBody = await response.json();
        } else if (responseContentType.includes('text/')) {
          responseBody = await response.text();
        } else {
          responseBody = await response.arrayBuffer();
          responseBody = `[Binary data: ${responseBody.byteLength} bytes]`;
        }
      } catch (error) {
        responseBody = await response.text();
      }
      
      const result = {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: responseHeaders,
        body: responseBody,
        url: response.url,
        redirected: response.redirected,
        responseTime,
        timestamp: new Date().toISOString()
      };
      
      return {
        toolCallId: context.messageId || '',
        success: true,
        result
      };
    } catch (error) {
      console.error(`❌ API call failed:`, error);
      
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
 * REST client tool with common patterns
 */
const restClientTool: ToolDefinition = {
  name: 'rest_client',
  description: 'Advanced REST API client with JSON handling, authentication, and error handling',
  category: 'api',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'API endpoint URL'
      },
      method: {
        type: 'string',
        description: 'HTTP method',
        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        default: 'GET'
      },
      data: {
        type: 'object',
        description: 'JSON data to send (will be stringified)'
      },
      auth: {
        type: 'object',
        description: 'Authentication configuration',
        properties: {
          type: {
            type: 'string',
            enum: ['bearer', 'basic', 'api-key'],
            description: 'Authentication type'
          },
          token: {
            type: 'string',
            description: 'Authentication token/key'
          },
          username: {
            type: 'string',
            description: 'Username for basic auth'
          },
          password: {
            type: 'string',
            description: 'Password for basic auth'
          },
          headerName: {
            type: 'string',
            description: 'Custom header name for API key auth',
            default: 'X-API-Key'
          }
        }
      },
      query: {
        type: 'object',
        description: 'Query parameters to append to URL'
      },
      timeout: {
        type: 'number',
        description: 'Request timeout in milliseconds',
        default: 15000,
        minimum: 1000,
        maximum: 60000
      }
    },
    required: ['url']
  },
  rateLimit: {
    maxCalls: 50,
    windowMs: 60000 // 1 minute
  },
  execute: async (params, context): Promise<ToolResult> => {
    try {
      const { url, method = 'GET', data, auth, query, timeout = 15000 } = params;
      
      // Build URL with query parameters
      let requestUrl = url;
      if (query && Object.keys(query).length > 0) {
        const queryString = new URLSearchParams(query).toString();
        requestUrl += (url.includes('?') ? '&' : '?') + queryString;
      }
      
      // Prepare headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'AgentChat/1.0 (REST Client)'
      };
      
      // Add authentication
      if (auth) {
        switch (auth.type) {
          case 'bearer':
            if (auth.token) {
              headers['Authorization'] = `Bearer ${auth.token}`;
            }
            break;
          case 'basic':
            if (auth.username && auth.password) {
              const credentials = btoa(`${auth.username}:${auth.password}`);
              headers['Authorization'] = `Basic ${credentials}`;
            }
            break;
          case 'api-key':
            if (auth.token) {
              const headerName = auth.headerName || 'X-API-Key';
              headers[headerName] = auth.token;
            }
            break;
        }
      }
      
      // Prepare body
      let body;
      if (data && method !== 'GET') {
        try {
          body = JSON.stringify(data);
        } catch (error) {
          throw new Error(`Failed to serialize data: ${error.message}`);
        }
      }
      
      // Use the api_call tool for the actual request
      const apiResult = await apiCallTool.execute({
        url: requestUrl,
        method,
        headers,
        body,
        contentType: 'application/json',
        timeout
      }, context);
      
      if (!apiResult.success) {
        throw new Error(apiResult.error || 'REST API call failed');
      }
      
      const response = apiResult.result;
      
      // Enhanced result with REST-specific processing
      const restResult = {
        ...response,
        data: response.body, // Alias for easier access
        success: response.ok,
        error: response.ok ? null : {
          status: response.status,
          message: response.statusText,
          body: response.body
        }
      };
      
      return {
        toolCallId: context.messageId || '',
        success: true,
        result: restResult
      };
    } catch (error) {
      console.error(`❌ REST call failed:`, error);
      
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
 * Webhook tool for sending notifications
 */
const webhookTool: ToolDefinition = {
  name: 'webhook',
  description: 'Send webhook notifications to external services',
  category: 'api',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'Webhook endpoint URL'
      },
      payload: {
        type: 'object',
        description: 'Webhook payload data'
      },
      headers: {
        type: 'object',
        description: 'Custom headers',
        default: {}
      },
      secret: {
        type: 'string',
        description: 'Webhook secret for signature generation'
      },
      signatureHeader: {
        type: 'string',
        description: 'Header name for webhook signature',
        default: 'X-Webhook-Signature'
      },
      retries: {
        type: 'number',
        description: 'Number of retry attempts on failure',
        default: 3,
        minimum: 0,
        maximum: 5
      },
      timeout: {
        type: 'number',
        description: 'Request timeout in milliseconds',
        default: 10000,
        minimum: 1000,
        maximum: 30000
      }
    },
    required: ['url', 'payload']
  },
  rateLimit: {
    maxCalls: 200,
    windowMs: 60000 // 1 minute
  },
  execute: async (params, context): Promise<ToolResult> => {
    try {
      const { 
        url, 
        payload, 
        headers = {}, 
        secret, 
        signatureHeader = 'X-Webhook-Signature',
        retries = 3,
        timeout = 10000
      } = params;
      
      // Prepare payload
      let body: string;
      try {
        body = JSON.stringify(payload);
      } catch (error) {
        throw new Error(`Failed to serialize webhook payload: ${error.message}`);
      }
      
      // Prepare headers
      const webhookHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'AgentChat/1.0 (Webhook)',
        ...headers
      };
      
      // Add signature if secret provided
      if (secret) {
        try {
          // Simple HMAC-like signature (in production, use proper crypto)
          const signature = btoa(`${secret}:${body}`);
          webhookHeaders[signatureHeader] = `sha256=${signature}`;
        } catch (error) {
          console.warn('Failed to generate webhook signature:', error);
        }
      }
      
      // Retry logic
      let lastError: Error | null = null;
      let attempt = 0;
      
      while (attempt <= retries) {
        try {
          const result = await apiCallTool.execute({
            url,
            method: 'POST',
            headers: webhookHeaders,
            body,
            contentType: 'application/json',
            timeout
          }, context);
          
          if (result.success && result.result.ok) {
            return {
              toolCallId: context.messageId || '',
              success: true,
              result: {
                delivered: true,
                attempts: attempt + 1,
                response: result.result,
                timestamp: new Date().toISOString()
              }
            };
          } else {
            throw new Error(`Webhook failed: ${result.result?.status} ${result.result?.statusText}`);
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(`⚠️  Webhook attempt ${attempt + 1} failed:`, lastError.message);
          
          attempt++;
          
          // Wait before retry (exponential backoff)
          if (attempt <= retries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      console.error(`❌ Webhook failed after ${retries + 1} attempts`);
      
      return {
        toolCallId: context.messageId || '',
        success: false,
        result: {
          delivered: false,
          attempts: retries + 1,
          lastError: lastError?.message,
          timestamp: new Date().toISOString()
        },
        error: `Webhook delivery failed after ${retries + 1} attempts: ${lastError?.message}`
      };
    } catch (error) {
      console.error(`❌ Webhook setup failed:`, error);
      
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
// API TOOLS PLUGIN DEFINITION
// =============================================================================

const apiToolsPlugin: ToolPlugin = {
  id: 'api-tools',
  name: 'API Tools',
  description: 'Tools for HTTP requests, REST API interactions, and webhook notifications',
  version: '1.0.0',
  author: 'Axion Functions',
  tags: ['api', 'http', 'rest', 'webhook', 'integration'],
  
  tools: [
    apiCallTool,
    restClientTool,
    webhookTool
  ],
  
  // Plugin lifecycle
  initialize: async (context) => {
  },
  
  cleanup: async () => {
  },
  
  // Plugin dependencies
  requiredServices: ['network']
};

export default apiToolsPlugin; 