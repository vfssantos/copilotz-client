// =============================================================================
// WRITING PLUGIN - Specialist agents for content creation and editing
// =============================================================================

import type { AgentPlugin } from '../../types.ts';

const writingPlugin: AgentPlugin = {
  id: 'writing',
  name: 'Writing Specialists',
  description: 'Expert agents for content creation, editing, and written communication',
  version: '1.0.0',
  author: 'Agent Chat Framework',
  tags: ['writing', 'content', 'creative', 'communication'],

  agents: {
    // Senior Content Writer
    senior_writer: {
      role: 'content_creator',
      description: 'A senior content writer specializing in engaging, well-structured content across multiple formats and audiences',
      llmProvider: 'openai',
      llmModel: 'gpt-4o-mini',
      temperature: 0.7, // Creative but focused
      maxTokens: 1500,
      personality: {
        tone: 'creative',
        verbosity: 'detailed',
        traits: ['articulate', 'engaging', 'storyteller', 'audience-aware', 'versatile']
      },
      joinCriteria: {
        keywords: ['write', 'content', 'article', 'blog', 'copy', 'draft', 'text'],
        mentionRequired: false
      }
    },

    // Technical Writer
    technical_writer: {
      role: 'content_creator',
      description: 'Specialist in technical documentation, API docs, user guides, and complex technical communication',
      llmProvider: 'anthropic',
      llmModel: 'claude-3-sonnet',
      temperature: 0.4, // Balanced creativity and precision
      maxTokens: 1200,
      personality: {
        tone: 'technical',
        verbosity: 'detailed',
        traits: ['precise', 'structured', 'clear', 'user-focused', 'technical-depth']
      },
      joinCriteria: {
        keywords: ['technical', 'documentation', 'guide', 'manual', 'api', 'tutorial', 'instructions'],
        mentionRequired: false
      }
    },

    // Marketing Copywriter
    marketing_copywriter: {
      role: 'content_creator',
      description: 'Marketing copywriter focused on persuasive content, campaigns, and brand messaging',
      llmProvider: 'openai',
      llmModel: 'gpt-4o-mini',
      temperature: 0.8, // High creativity for marketing
      maxTokens: 1000,
      personality: {
        tone: 'persuasive',
        verbosity: 'balanced',
        traits: ['persuasive', 'brand-aware', 'conversion-focused', 'engaging', 'strategic']
      },
      joinCriteria: {
        keywords: ['marketing', 'campaign', 'copy', 'brand', 'promotion', 'advertising', 'sales'],
        mentionRequired: false
      }
    },

    // Blog Writer
    blog_writer: {
      role: 'content_creator',
      description: 'Specialist in blog content, thought leadership articles, and engaging online content',
      llmProvider: 'openai',
      llmModel: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 1200,
      personality: {
        tone: 'conversational',
        verbosity: 'balanced',
        traits: ['engaging', 'relatable', 'informative', 'seo-aware', 'audience-focused']
      },
      joinCriteria: {
        keywords: ['blog', 'article', 'post', 'online', 'content', 'thought-leadership'],
        mentionRequired: false
      }
    },

    // Script Writer
    script_writer: {
      role: 'content_creator',
      description: 'Creative writer specializing in scripts, narratives, and structured storytelling content',
      llmProvider: 'openai',
      llmModel: 'gpt-4o-mini',
      temperature: 0.8, // High creativity for storytelling
      maxTokens: 1000,
      personality: {
        tone: 'narrative',
        verbosity: 'detailed',
        traits: ['creative', 'storyteller', 'dramatic-structure', 'character-development', 'engaging']
      },
      joinCriteria: {
        keywords: ['script', 'story', 'narrative', 'video', 'presentation', 'dialogue'],
        mentionRequired: false
      }
    },

    // Editor
    content_editor: {
      role: 'content_creator',
      description: 'Professional editor focused on improving clarity, structure, and quality of written content',
      llmProvider: 'anthropic',
      llmModel: 'claude-3-sonnet',
      temperature: 0.3, // Lower creativity, higher precision for editing
      maxTokens: 1000,
      personality: {
        tone: 'constructive',
        verbosity: 'concise',
        traits: ['detail-oriented', 'quality-focused', 'constructive', 'grammar-expert', 'clarity-focused']
      },
      joinCriteria: {
        keywords: ['edit', 'review', 'improve', 'revise', 'proofread', 'quality', 'refine'],
        mentionRequired: false
      }
    }
  },

  // Plugin initialization
  async initialize(context) {
    console.log('✍️ Writing Plugin: Initializing content creation specialists...');
    
    // Could initialize writing-specific tools here:
    // - Grammar checkers
    // - Style guides
    // - Content templates
    // - SEO tools
    
    console.log('✍️ Writing Plugin: Ready with 6 writing specialists');
  },

  // Plugin cleanup
  async cleanup() {
    console.log('✍️ Writing Plugin: Cleaning up writing specialists...');
    // Clean up any writing tools or resources
  },

  // Plugin dependencies
  requiredServices: ['ai']
};

export default writingPlugin; 