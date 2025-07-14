// =============================================================================
// WEB TOOLS PLUGIN - Web search, URL fetching, and content scraping
// =============================================================================

import type { ToolPlugin, ToolDefinition, ToolExecutionContext, ToolResult } from '../../types.ts';

/**
 * Web search tool using DuckDuckGo API (via duck-duck-scrape)
 */
const websearchTool: ToolDefinition = {
  name: 'websearch',
  description: 'Search the web for information using DuckDuckGo',
  category: 'web',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query to look up'
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (1-20)',
        default: 5,
        minimum: 1,
        maximum: 20
      },
      safesearch: {
        type: 'string',
        description: 'Safe search setting',
        enum: ['strict', 'moderate', 'off'],
        default: 'moderate'
      }
    },
    required: ['query']
  },
  rateLimit: {
    maxCalls: 100,
    windowMs: 60000 // 1 minute
  },
  execute: async (params, context): Promise<ToolResult> => {
    try {
      const { query, maxResults = 5, safesearch = 'moderate' } = params;

      const myHeaders = new Headers();
      myHeaders.append("X-API-KEY", Deno.env.get("DEFAULT_SERPER_KEY") || "");
      myHeaders.append("Content-Type", "application/json");

      const raw = JSON.stringify({
        q: query,
        num: maxResults
      });

      const requestOptions = {
        method: "POST",
        headers: myHeaders,
        body: raw,
        redirect: "follow" as RequestRedirect
      };

      const searchResults = await fetch("https://google.serper.dev/search", requestOptions).then(res => res.json());

      let results: Array<any> = [];

      if (searchResults && Array.isArray(searchResults.organic) && searchResults.organic.length > 0) {
        results = searchResults.organic.slice(0, maxResults).map((item: any) => ({
          title: item.title,
          content: item.snippet || '',
          url: item.link,
          type: 'result'
        }));
      }


      // If no results, fallback
      if (!results.length) {
        results.push({
          title: 'Search Completed',
          content: `Searched for "${query}" but no results were found. You may want to try fetching specific URLs or rephrasing the query.`,
          type: 'fallback'
        });
      }

      return {
        toolCallId: context.messageId || '',
        success: true,
        result: {
          query,
          results:{
            knowledgeGraph: searchResults.knowledgeGraph,
            organic: results
          },
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error(`❌ Web search failed:`, error);

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
 * URL fetching tool with proper headers and error handling
 */
const fetchUrlTool: ToolDefinition = {
  name: 'fetch_url',
  description: 'Fetch content from a URL with proper headers and parsing',
  category: 'web',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to fetch content from'
      },
      method: {
        type: 'string',
        description: 'HTTP method to use',
        enum: ['GET', 'POST', 'HEAD'],
        default: 'GET'
      },
      headers: {
        type: 'object',
        description: 'Custom headers to include',
        default: {}
      },
      timeout: {
        type: 'number',
        description: 'Request timeout in milliseconds',
        default: 10000,
        minimum: 1000,
        maximum: 30000
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
      const { url, method = 'GET', headers = {}, timeout = 10000 } = params;

      // Validate URL
      try {
        new URL(url);
      } catch {
        throw new Error('Invalid URL format');
      }

      // Default headers
      const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (compatible; AgentChat/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        ...headers
      };

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers: defaultHeaders,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Get content type
      const contentType = response.headers.get('content-type') || '';
      const isText = contentType.includes('text/') ||
        contentType.includes('application/json') ||
        contentType.includes('application/xml');

      let content;
      if (isText) {
        content = await response.text();
      } else {
        content = `[Binary content: ${contentType}]`;
      }

      // Extract metadata
      const metadata = {
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        contentType,
        contentLength: response.headers.get('content-length'),
        lastModified: response.headers.get('last-modified'),
        server: response.headers.get('server')
      };

      return {
        toolCallId: context.messageId || '',
        success: true,
        result: {
          content: content.slice(0, 50000), // Limit content size
          metadata,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error(`❌ URL fetch failed:`, error);

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
 * Web scraping tool for extracting structured data
 */
const scrapeWebpageTool: ToolDefinition = {
  name: 'scrape_webpage',
  description: 'Extract structured data from web pages (title, headings, links, text)',
  category: 'web',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL of the webpage to scrape'
      },
      extractors: {
        type: 'array',
        description: 'What to extract from the page',
        items: {
          type: 'string',
          enum: ['title', 'headings', 'links', 'text', 'meta', 'images']
        },
        default: ['title', 'headings', 'text']
      },
      maxLength: {
        type: 'number',
        description: 'Maximum content length to extract',
        default: 10000,
        minimum: 1000,
        maximum: 50000
      }
    },
    required: ['url']
  },
  rateLimit: {
    maxCalls: 30,
    windowMs: 60000 // 1 minute
  },
  execute: async (params, context): Promise<ToolResult> => {
    try {
      const { url, extractors = ['title', 'headings', 'text'], maxLength = 10000 } = params;

      // First fetch the page
      const fetchResult = await fetchUrlTool.execute(
        { url, timeout: 15000 },
        context
      );

      if (!fetchResult.success) {
        throw new Error(`Failed to fetch page: ${fetchResult.error}`);
      }

      const html = fetchResult.result.content;
      const metadata = fetchResult.result.metadata;

      // Simple HTML parsing (basic regex-based approach)
      const extracted: any = {};

      if (extractors.includes('title')) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        extracted.title = titleMatch ? titleMatch[1].trim() : 'No title found';
      }

      if (extractors.includes('meta')) {
        const metaDescription = html.match(/<meta[^>]+name=['"]description['"][^>]+content=['"]([^'"]+)['"]/i);
        const metaKeywords = html.match(/<meta[^>]+name=['"]keywords['"][^>]+content=['"]([^'"]+)['"]/i);

        extracted.meta = {
          description: metaDescription ? metaDescription[1] : null,
          keywords: metaKeywords ? metaKeywords[1] : null
        };
      }

      if (extractors.includes('headings')) {
        const headings = [];
        const h1Matches = html.match(/<h1[^>]*>([^<]+)<\/h1>/gi) || [];
        const h2Matches = html.match(/<h2[^>]*>([^<]+)<\/h2>/gi) || [];
        const h3Matches = html.match(/<h3[^>]*>([^<]+)<\/h3>/gi) || [];

        h1Matches.forEach(match => {
          const text = match.replace(/<[^>]+>/g, '').trim();
          if (text) headings.push({ level: 1, text });
        });

        h2Matches.forEach(match => {
          const text = match.replace(/<[^>]+>/g, '').trim();
          if (text) headings.push({ level: 2, text });
        });

        h3Matches.forEach(match => {
          const text = match.replace(/<[^>]+>/g, '').trim();
          if (text) headings.push({ level: 3, text });
        });

        extracted.headings = headings.slice(0, 20); // Limit headings
      }

      if (extractors.includes('links')) {
        const linkMatches = html.match(/<a[^>]+href=['"]([^'"]+)['"][^>]*>([^<]*)<\/a>/gi) || [];
        const links = linkMatches.map(match => {
          const hrefMatch = match.match(/href=['"]([^'"]+)['"]/i);
          const textMatch = match.match(/>([^<]*)</);

          return {
            url: hrefMatch ? hrefMatch[1] : '',
            text: textMatch ? textMatch[1].trim() : ''
          };
        }).filter(link => link.url && link.text).slice(0, 50); // Limit links

        extracted.links = links;
      }

      if (extractors.includes('images')) {
        const imgMatches = html.match(/<img[^>]+src=['"]([^'"]+)['"][^>]*>/gi) || [];
        const images = imgMatches.map(match => {
          const srcMatch = match.match(/src=['"]([^'"]+)['"]/i);
          const altMatch = match.match(/alt=['"]([^'"]*)['"]/i);

          return {
            src: srcMatch ? srcMatch[1] : '',
            alt: altMatch ? altMatch[1] : ''
          };
        }).filter(img => img.src).slice(0, 20); // Limit images

        extracted.images = images;
      }

      if (extractors.includes('text')) {
        // Remove scripts, styles, and HTML tags
        let text = html
          .replace(/<script[^>]*>.*?<\/script>/gis, '')
          .replace(/<style[^>]*>.*?<\/style>/gis, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        extracted.text = text.slice(0, maxLength);
      }

      return {
        toolCallId: context.messageId || '',
        success: true,
        result: {
          url,
          extracted,
          metadata,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error(`❌ Web scraping failed:`, error);

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
// WEB TOOLS PLUGIN DEFINITION
// =============================================================================

const webToolsPlugin: ToolPlugin = {
  id: 'web-tools',
  name: 'Web Tools',
  description: 'Tools for web searches, URL fetching, and content scraping',
  version: '1.0.0',
  author: 'Axion Functions',
  tags: ['web', 'search', 'scraping', 'content'],

  tools: [
    websearchTool,
    fetchUrlTool,
    scrapeWebpageTool
  ],

  // Plugin lifecycle
  initialize: async (context) => {
  },

  cleanup: async () => {
  },

  // Plugin dependencies
  requiredServices: ['network']
};

export default webToolsPlugin; 