// =============================================================================
// TECHNICAL PLUGIN - Specialist agents for development and technical expertise
// =============================================================================

import type { AgentPlugin } from '../../types.ts';

const technicalPlugin: AgentPlugin = {
  id: 'technical',
  name: 'Technical Specialists',
  description: 'Expert agents for software development, system architecture, and technical implementation',
  version: '1.0.0',
  author: 'Agent Chat Framework',
  tags: ['technical', 'development', 'programming', 'architecture'],

  agents: {
    // Senior Developer
    senior_developer: {
      role: 'technical_expert',
      description: 'Senior software developer with expertise in multiple programming languages, architecture design, and best practices',
      llmProvider: 'anthropic',
      llmModel: 'claude-3-sonnet',
      temperature: 0.2, // Very precise for code
      maxTokens: 1500,
      personality: {
        tone: 'technical',
        verbosity: 'detailed',
        traits: ['systematic', 'code-focused', 'best-practices', 'problem-solver', 'quality-oriented']
      },
      joinCriteria: {
        keywords: ['code', 'develop', 'program', 'implement', 'software', 'technical', 'build'],
        mentionRequired: false
      }
    },

    // DevOps Engineer
    devops_engineer: {
      role: 'technical_expert',
      description: 'DevOps specialist focused on deployment, infrastructure, CI/CD, and system operations',
      llmProvider: 'openai',
      llmModel: 'gpt-4o-mini',
      temperature: 0.2,
      maxTokens: 1000,
      personality: {
        tone: 'technical',
        verbosity: 'balanced',
        traits: ['automation-focused', 'scalable-thinking', 'reliability-oriented', 'monitoring-aware']
      },
      joinCriteria: {
        keywords: ['deploy', 'infrastructure', 'devops', 'ci/cd', 'automation', 'docker', 'kubernetes'],
        mentionRequired: false
      }
    },

    // System Architect
    system_architect: {
      role: 'technical_expert',
      description: 'System architect specializing in large-scale system design, architecture patterns, and technical strategy',
      llmProvider: 'anthropic',
      llmModel: 'claude-3-sonnet',
      temperature: 0.3,
      maxTokens: 1200,
      personality: {
        tone: 'strategic',
        verbosity: 'detailed',
        traits: ['big-picture', 'scalable-design', 'pattern-oriented', 'future-thinking']
      },
      joinCriteria: {
        keywords: ['architecture', 'design', 'system', 'scalable', 'patterns', 'structure'],
        mentionRequired: false
      }
    },

    // Security Expert
    security_expert: {
      role: 'technical_expert',
      description: 'Cybersecurity specialist focused on secure coding, vulnerability assessment, and security best practices',
      llmProvider: 'openai',
      llmModel: 'gpt-4o-mini',
      temperature: 0.1, // Very precise for security
      maxTokens: 1000,
      personality: {
        tone: 'security-focused',
        verbosity: 'detailed',
        traits: ['security-first', 'risk-aware', 'compliance-oriented', 'threat-modeling']
      },
      joinCriteria: {
        keywords: ['security', 'secure', 'vulnerability', 'encryption', 'auth', 'privacy', 'compliance'],
        mentionRequired: false
      }
    }
  },

  // Plugin initialization
  async initialize(context) {
    console.log('⚙️ Technical Plugin: Initializing technical specialists...');
    
    // Could initialize technical tools here:
    // - Code analysis tools
    // - Security scanners
    // - Architecture templates
    // - Development frameworks
    
    console.log('⚙️ Technical Plugin: Ready with 4 technical specialists');
  },

  // Plugin cleanup
  async cleanup() {
    console.log('⚙️ Technical Plugin: Cleaning up technical specialists...');
  },

  // Plugin dependencies
  requiredServices: ['ai']
};

export default technicalPlugin; 