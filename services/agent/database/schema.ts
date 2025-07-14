// =============================================================================
// AGENT CHAT DATABASE SCHEMA - PostgreSQL/PGlite schema definitions
// =============================================================================

export const agentChatSchema = [
  // Main tasks table (like "projects" or "conversations")
  `CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    title TEXT,
    description TEXT,
    
    -- Participants (JSON array of user + agent names)
    participants JSONB NOT NULL DEFAULT '[]',
    
    -- Task state
    status TEXT NOT NULL DEFAULT 'active',
    priority INTEGER DEFAULT 1,
    
    -- Context and goals
    context JSONB DEFAULT '{}',
    goals JSONB DEFAULT '[]',
    constraints JSONB DEFAULT '{}',
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    expected_completion TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Indexing
    CONSTRAINT tasks_status_check CHECK (status IN ('active', 'paused', 'completed', 'cancelled'))
  )`,

  // Conversation threads within tasks
  `CREATE TABLE IF NOT EXISTS threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    
    -- Thread details
    purpose TEXT NOT NULL,
    participants JSONB NOT NULL DEFAULT '[]',
    
    -- State
    status TEXT NOT NULL DEFAULT 'active',
    
    -- Relationship to messages
    parent_message_id UUID,
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT threads_status_check CHECK (status IN ('active', 'resolved', 'archived'))
  )`,

  // All conversation messages
  `CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    thread_id UUID REFERENCES threads(id) ON DELETE CASCADE,
    
    -- Message details
    sender TEXT NOT NULL,
    sender_type TEXT NOT NULL,
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'message',
    
    -- Threading and replies
    reply_to_id UUID REFERENCES messages(id),
    mentioned_participants JSONB DEFAULT '[]',
    
    -- Tool calling
    tool_calls JSONB DEFAULT '[]',
    tool_results JSONB DEFAULT '[]',
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    edited_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT messages_sender_type_check CHECK (sender_type IN ('user', 'agent', 'system')),
    CONSTRAINT messages_type_check CHECK (message_type IN ('message', 'question', 'response', 'system', 'tool_result'))
  )`,

  // Agent configurations and state
  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    description TEXT,
    
    -- Configuration
    config JSONB NOT NULL DEFAULT '{}',
    
    -- Capabilities
    capabilities JSONB DEFAULT '[]',
    tools JSONB DEFAULT '[]',
    
    -- LLM settings
    llm_provider TEXT,
    llm_model TEXT,
    temperature REAL DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 1000,
    
    -- Personality
    personality JSONB DEFAULT '{}',
    
    -- Communication preferences
    preferred_channels JSONB DEFAULT '["main"]',
    join_criteria JSONB DEFAULT '{}',
    
    -- Knowledge integration
    knowledge_base JSONB DEFAULT '{}',
    
    -- State
    is_active BOOLEAN DEFAULT true,
    current_tasks JSONB DEFAULT '[]',
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // Task participation tracking
  `CREATE TABLE IF NOT EXISTS task_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    participant_id TEXT NOT NULL,
    participant_type TEXT NOT NULL,
    
    -- Participation details
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    joined_reason TEXT,
    is_active BOOLEAN DEFAULT true,
    
    -- Role in task
    role TEXT,
    permissions JSONB DEFAULT '{}',
    
    -- Unique constraint
    UNIQUE(task_id, participant_id),
    
    -- Constraints
    CONSTRAINT task_participants_type_check CHECK (participant_type IN ('user', 'agent'))
  )`,

  // Thread participation tracking
  `CREATE TABLE IF NOT EXISTS thread_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    participant_id TEXT NOT NULL,
    participant_type TEXT NOT NULL,
    
    -- Participation details
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    
    -- Unique constraint
    UNIQUE(thread_id, participant_id),
    
    -- Constraints
    CONSTRAINT thread_participants_type_check CHECK (participant_type IN ('user', 'agent'))
  )`,

  // Agent performance and learning
  `CREATE TABLE IF NOT EXISTS agent_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    task_id UUID NOT NULL REFERENCES tasks(id),
    message_id UUID REFERENCES messages(id),
    
    -- Interaction details
    interaction_type TEXT NOT NULL,
    context JSONB DEFAULT '{}',
    
    -- Performance metrics
    response_time INTEGER, -- milliseconds
    tool_calls_count INTEGER DEFAULT 0,
    user_feedback_score REAL,
    
    -- Learning data
    learned_patterns JSONB DEFAULT '{}',
    improvement_suggestions JSONB DEFAULT '[]',
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT agent_interactions_type_check CHECK (interaction_type IN ('message', 'tool_call', 'task_join', 'thread_create', 'error'))
  )`,

  // Tool execution logs
  `CREATE TABLE IF NOT EXISTS tool_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    task_id UUID NOT NULL REFERENCES tasks(id),
    thread_id UUID REFERENCES threads(id),
    
    -- Tool details
    tool_name TEXT NOT NULL,
    tool_parameters JSONB NOT NULL,
    
    -- Execution results
    success BOOLEAN NOT NULL,
    result JSONB,
    error_message TEXT,
    
    -- Performance
    execution_time INTEGER, -- milliseconds
    
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  )`,

  // Performance and analytics
  `CREATE TABLE IF NOT EXISTS task_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id),
    
    -- Performance metrics
    total_messages INTEGER DEFAULT 0,
    total_threads INTEGER DEFAULT 0,
    total_participants INTEGER DEFAULT 0,
    
    -- Timing metrics
    duration_seconds INTEGER,
    first_response_time INTEGER, -- milliseconds
    average_response_time INTEGER, -- milliseconds
    
    -- Agent metrics
    most_active_agent TEXT,
    agent_message_counts JSONB DEFAULT '{}',
    
    -- Tool usage
    tools_used JSONB DEFAULT '[]',
    tool_success_rate REAL,
    
    -- Quality metrics
    user_satisfaction_score REAL,
    task_completion_rate REAL,
    
    -- Snapshot timestamp
    calculated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // =============================================================================
  // INDEXES FOR PERFORMANCE
  // =============================================================================

  // Task indexes
  `CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_last_activity ON tasks(last_activity DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_participants_gin ON tasks USING gin(participants)`,

  // Thread indexes
  `CREATE INDEX IF NOT EXISTS idx_threads_task_id ON threads(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status)`,
  `CREATE INDEX IF NOT EXISTS idx_threads_last_activity ON threads(last_activity DESC)`,

  // Message indexes
  `CREATE INDEX IF NOT EXISTS idx_messages_task_id ON messages(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_message_type ON messages(message_type)`,

  // Agent indexes
  `CREATE INDEX IF NOT EXISTS idx_agents_is_active ON agents(is_active)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_role ON agents(role)`,

  // Participation indexes
  `CREATE INDEX IF NOT EXISTS idx_task_participants_task_id ON task_participants(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_task_participants_participant_id ON task_participants(participant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_thread_participants_thread_id ON thread_participants(thread_id)`,
  `CREATE INDEX IF NOT EXISTS idx_thread_participants_participant_id ON thread_participants(participant_id)`,

  // Performance indexes
  `CREATE INDEX IF NOT EXISTS idx_agent_interactions_agent_id ON agent_interactions(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_interactions_task_id ON agent_interactions(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tool_executions_agent_id ON tool_executions(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tool_executions_task_id ON tool_executions(task_id)`,

  // =============================================================================
  // FULL-TEXT SEARCH INDEXES
  // =============================================================================

  // Message content search
  `CREATE INDEX IF NOT EXISTS idx_messages_content_fts ON messages USING gin(to_tsvector('english', content))`,
  
  // Task title and description search
  `CREATE INDEX IF NOT EXISTS idx_tasks_text_fts ON tasks USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')))`,

  // =============================================================================
  // VIEWS FOR COMMON QUERIES
  // =============================================================================

  // Task summary view
  `CREATE OR REPLACE VIEW task_summaries AS
  SELECT 
    t.id,
    t.user_id,
    t.title,
    t.status,
    t.participants,
    t.last_activity,
    t.created_at,
    COALESCE(message_counts.count, 0) as message_count,
    COALESCE(thread_counts.count, 0) as thread_count
  FROM tasks t
  LEFT JOIN (
    SELECT task_id, COUNT(*) as count
    FROM messages
    GROUP BY task_id
  ) message_counts ON t.id = message_counts.task_id
  LEFT JOIN (
    SELECT task_id, COUNT(*) as count
    FROM threads
    GROUP BY task_id
  ) thread_counts ON t.id = thread_counts.task_id`,

  // Agent activity view
  `CREATE OR REPLACE VIEW agent_activity AS
  SELECT 
    a.id,
    a.name,
    a.role,
    a.is_active,
    COALESCE(message_counts.count, 0) as total_messages,
    COALESCE(task_counts.count, 0) as active_tasks,
    COALESCE(tool_counts.count, 0) as tool_executions
  FROM agents a
  LEFT JOIN (
    SELECT sender as agent_id, COUNT(*) as count
    FROM messages
    WHERE sender_type = 'agent'
    GROUP BY sender
  ) message_counts ON a.id = message_counts.agent_id
  LEFT JOIN (
    SELECT participant_id as agent_id, COUNT(DISTINCT task_id) as count
    FROM task_participants
    WHERE participant_type = 'agent' AND is_active = true
    GROUP BY participant_id
  ) task_counts ON a.id = task_counts.agent_id
  LEFT JOIN (
    SELECT agent_id, COUNT(*) as count
    FROM tool_executions
    GROUP BY agent_id
  ) tool_counts ON a.id = tool_counts.agent_id`
];

// Alternative schema without full-text search for basic compatibility
export const agentChatSchemaBasic = agentChatSchema.filter(sql => 
  !sql.includes('gin(to_tsvector') && !sql.includes('CREATE OR REPLACE VIEW')
);

// Schema for testing (in-memory, simplified)
export const agentChatSchemaTest = [
  ...agentChatSchemaBasic.filter(sql => !sql.includes('CREATE INDEX')),
  // Add minimal indexes for testing
  `CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_task_id ON messages(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_threads_task_id ON threads(task_id)`
]; 