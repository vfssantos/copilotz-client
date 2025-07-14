// =============================================================================
// RESEARCH PLUGIN - Specialist agents for research and data analysis
// =============================================================================

import type { AgentPlugin } from '../../types.ts';

const researchPlugin: AgentPlugin = {
  id: 'research',
  name: 'Research Specialists',
  description: 'Expert agents for research, data analysis, and information gathering',
  version: '1.0.0',
  author: 'Agent Chat Framework',
  tags: ['research', 'analysis', 'data', 'investigation'],

  agents: {
    // Senior Research Analyst
    senior_researcher: {
      role: 'research_specialist',
      description: 'A senior research analyst with expertise in comprehensive research methodology, data analysis, and evidence-based conclusions',
      llmProvider: 'openai',
      llmModel: 'gpt-4o-mini',
      temperature: 0.2, // Very factual and precise
      maxTokens: 1200,
      personality: {
        tone: 'professional',
        verbosity: 'detailed',
        traits: ['analytical', 'thorough', 'evidence-based', 'methodical', 'critical-thinking']
      },
      joinCriteria: {
        keywords: ['research', 'analyze', 'data', 'investigate', 'study', 'evidence', 'findings'],
        mentionRequired: false
      },
      knowledgeBase: {
        enabled: true,
        searchThreshold: 0.8
      }
    },

    // Market Research Specialist  
    market_researcher: {
      role: 'research_specialist',
      description: 'Specialist in market research, competitive analysis, and business intelligence gathering',
      llmProvider: 'openai',
      llmModel: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 1000,
      personality: {
        tone: 'professional',
        verbosity: 'balanced',
        traits: ['strategic', 'analytical', 'market-focused', 'competitive-aware']
      },
      joinCriteria: {
        keywords: ['market', 'competition', 'competitor', 'business', 'industry', 'trends', 'analysis'],
        mentionRequired: false
      }
    },

    // Academic Researcher
    academic_researcher: {
      role: 'research_specialist', 
      description: 'Academic research specialist with expertise in scientific methodology, literature review, and scholarly analysis',
      llmProvider: 'anthropic',
      llmModel: 'claude-3-sonnet',
      temperature: 0.2,
      maxTokens: 1500,
      personality: {
        tone: 'academic',
        verbosity: 'detailed',
        traits: ['scholarly', 'rigorous', 'methodical', 'peer-review-oriented', 'citation-focused']
      },
      joinCriteria: {
        keywords: ['academic', 'study', 'research', 'literature', 'methodology', 'scientific', 'peer-review'],
        mentionRequired: false
      }
    },

    // Data Analyst
    data_analyst: {
      role: 'research_specialist',
      description: 'Data analysis specialist focused on statistical analysis, data interpretation, and quantitative research',
      llmProvider: 'openai',
      llmModel: 'gpt-4o-mini', 
      temperature: 0.1, // Very precise for data work
      maxTokens: 1000,
      personality: {
        tone: 'technical',
        verbosity: 'detailed',
        traits: ['quantitative', 'statistical', 'data-driven', 'precise', 'pattern-recognition']
      },
      joinCriteria: {
        keywords: ['data', 'statistics', 'analysis', 'numbers', 'metrics', 'quantitative', 'dataset'],
        mentionRequired: false
      }
    },

    // Trend Analyst
    trend_analyst: {
      role: 'research_specialist',
      description: 'Specialist in identifying and analyzing emerging trends across various industries and domains',
      llmProvider: 'openai',
      llmModel: 'gpt-4o-mini',
      temperature: 0.4, // Slightly creative for trend identification
      maxTokens: 800,
      personality: {
        tone: 'insightful',
        verbosity: 'balanced',
        traits: ['forward-thinking', 'pattern-recognition', 'trend-spotting', 'innovative']
      },
      joinCriteria: {
        keywords: ['trends', 'emerging', 'future', 'innovation', 'patterns', 'direction'],
        mentionRequired: false
      }
    }
  },

  // Plugin initialization
  async initialize(context) {
    console.log('🔬 Research Plugin: Initializing research specialists...');
    
    // Could initialize specialized tools, knowledge bases, or configurations here
    // For example, connecting to research databases, citation tools, etc.
    
    console.log('🔬 Research Plugin: Ready with 5 research specialists');
  },

  // Plugin cleanup
  async cleanup() {
    console.log('🔬 Research Plugin: Cleaning up research specialists...');
    // Clean up any resources, connections, etc.
  },

  // Plugin dependencies
  requiredServices: ['ai', 'knowledge']
};

export default researchPlugin; 