// =============================================================================
// TASK MANAGER - Handles task lifecycle and participant management
// =============================================================================

import type {
  TaskContext,
  TaskSummary,
  CreateTaskRequest,
  AgentJoinDecision,
  AgentInstance,
  AgentChatError,
  ErrorCodes
} from '../types.ts';

import { AgentChatDatabaseOperations } from '../database/operations.ts';

// =============================================================================
// TASK MANAGER CLASS
// =============================================================================

export class TaskManager {
  private db: AgentChatDatabaseOperations;
  private agentRegistry: any; // Will be typed when AgentRegistry is implemented

  constructor(db: AgentChatDatabaseOperations, agentRegistry: any) {
    this.db = db;
    this.agentRegistry = agentRegistry;
  }

  // =============================================================================
  // TASK CREATION
  // =============================================================================

  /**
   * Create a new task from a user message
   */
  async createTaskFromMessage(message: string, userId: string): Promise<string> {
    try {

      // Create basic task
      const taskData: Omit<TaskContext, 'id' | 'createdAt' | 'lastActivity'> = {
        userId,
        title: this.generateTaskTitle(message),
        description: message,
        participants: [userId], // Start with just the user
        status: 'active',
        priority: 1,
        context: {
          originalMessage: message,
          triggerTimestamp: new Date().toISOString()
        },
        goals: [],
        constraints: {}
      };

      const taskId = await this.db.createTask(taskData);

      // Determine which agents should join this task
      await this.inviteAgentsToTask(taskId, message);

      return taskId;
    } catch (error) {
      throw new AgentChatError(
        `Failed to create task from message: ${error.message}`,
        ErrorCodes.TASK_CREATION_ERROR,
        error
      );
    }
  }

  /**
   * Create a task explicitly with provided details
   */
  async createTask(request: CreateTaskRequest): Promise<string> {
    try {

      const taskData: Omit<TaskContext, 'id' | 'createdAt' | 'lastActivity'> = {
        userId: request.userId,
        title: request.title,
        description: request.description,
        participants: [request.userId, ...(request.participants || [])],
        status: 'active',
        priority: 1,
        context: request.context || {},
        goals: [],
        constraints: {}
      };

      const taskId = await this.db.createTask(taskData);

      return taskId;
    } catch (error) {
      throw new AgentChatError(
        `Failed to create task: ${error.message}`,
        ErrorCodes.TASK_CREATION_ERROR,
        error
      );
    }
  }

  // =============================================================================
  // AGENT INVITATION
  // =============================================================================

  /**
   * Invite agents to join a task based on the initial message
   */
  private async inviteAgentsToTask(taskId: string, triggerMessage: string): Promise<void> {
    try {
      // Get task context
      const task = await this.db.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Get all available agents
      const agents = await this.agentRegistry.getAllAgents();
      
      // Ask each agent if they want to join
      const joinDecisionPromises = agents.map(async (agent: AgentInstance) => {
        try {
          const decision = await agent.shouldJoinTask(triggerMessage, task);
          return {
            agentId: agent.config.name,
            decision
          };
        } catch (error) {
          console.warn(`Agent ${agent.config.name} failed to decide on joining task:`, error);
          return {
            agentId: agent.config.name,
            decision: { join: false, reason: 'Error in decision making' }
          };
        }
      });

      const joinDecisions = await Promise.all(joinDecisionPromises);

      // Add agents that decided to join
      for (const { agentId, decision } of joinDecisions) {
        if (decision.join) {
          await this.addAgentToTask(taskId, agentId, decision.reason);
        }
      }

    } catch (error) {
      console.error(`Failed to invite agents to task ${taskId}:`, error);
      // Don't throw - task can continue without agents
    }
  }

  /**
   * Add a specific agent to a task
   */
  async addAgentToTask(taskId: string, agentId: string, reason?: string): Promise<boolean> {
    try {
      // Add to database
      const success = await this.db.addParticipantToTask(taskId, agentId);
      
      if (success) {
        // Update agent's current tasks
        await this.agentRegistry.addTaskToAgent(agentId, taskId);
      }

      return success;
    } catch (error) {
      console.error(`Failed to add agent ${agentId} to task ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Remove an agent from a task
   */
  async removeAgentFromTask(taskId: string, agentId: string): Promise<boolean> {
    try {
      // Get current task
      const task = await this.db.getTask(taskId);
      if (!task) {
        return false;
      }

      // Remove from participants list
      const updatedParticipants = task.participants.filter(p => p !== agentId);
      
      await this.db.updateTask(taskId, {
        participants: updatedParticipants
      });

      // Update agent's current tasks
      await this.agentRegistry.removeTaskFromAgent(agentId, taskId);
      
      return true;
    } catch (error) {
      console.error(`Failed to remove agent ${agentId} from task ${taskId}:`, error);
      return false;
    }
  }

  // =============================================================================
  // TASK MANAGEMENT
  // =============================================================================

  /**
   * Get task details
   */
  async getTask(taskId: string): Promise<TaskContext | null> {
    return await this.db.getTask(taskId);
  }

  /**
   * Update task status or properties
   */
  async updateTask(taskId: string, updates: Partial<TaskContext>): Promise<boolean> {
    return await this.db.updateTask(taskId, updates);
  }

  /**
   * List tasks for a user
   */
  async listUserTasks(
    userId: string,
    status?: string,
    limit?: number,
    offset?: number
  ): Promise<TaskSummary[]> {
    return await this.db.listUserTasks(userId, status, limit, offset);
  }

  /**
   * Complete a task
   */
  async completeTask(taskId: string): Promise<boolean> {
    try {
      const success = await this.db.updateTask(taskId, {
        status: 'completed',
        completedAt: new Date()
      });

      if (success) {
        // Remove task from all agents' current tasks
        const task = await this.db.getTask(taskId);
        if (task) {
          for (const participantId of task.participants) {
            if (participantId !== task.userId) { // Skip user, only update agents
              await this.agentRegistry.removeTaskFromAgent(participantId, taskId);
            }
          }
        }

      }

      return success;
    } catch (error) {
      console.error(`Failed to complete task ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    try {
      const success = await this.db.updateTask(taskId, {
        status: 'cancelled',
        completedAt: new Date()
      });

      if (success) {
        // Remove task from all agents' current tasks
        const task = await this.db.getTask(taskId);
        if (task) {
          for (const participantId of task.participants) {
            if (participantId !== task.userId) { // Skip user, only update agents
              await this.agentRegistry.removeTaskFromAgent(participantId, taskId);
            }
          }
        }

      }

      return success;
    } catch (error) {
      console.error(`Failed to cancel task ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Pause a task
   */
  async pauseTask(taskId: string): Promise<boolean> {
    try {
      const success = await this.db.updateTask(taskId, {
        status: 'paused'
      });

      if (success) {
        console.log(`⏸️ Task ${taskId} paused`);
      }

      return success;
    } catch (error) {
      console.error(`Failed to pause task ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Resume a paused task
   */
  async resumeTask(taskId: string): Promise<boolean> {
    try {
      const success = await this.db.updateTask(taskId, {
        status: 'active'
      });

      if (success) {
        console.log(`▶️ Task ${taskId} resumed`);
      }

      return success;
    } catch (error) {
      console.error(`Failed to resume task ${taskId}:`, error);
      return false;
    }
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  /**
   * Generate a task title from the initial message
   */
  private generateTaskTitle(message: string): string {
    // Extract key intent from message
    const cleanMessage = message.trim();
    
    // Look for action words and create title
    const actionWords = [
      'help', 'create', 'build', 'write', 'analyze', 'research', 
      'plan', 'design', 'develop', 'implement', 'review', 'improve'
    ];

    const words = cleanMessage.toLowerCase().split(' ');
    const actionWord = words.find(word => actionWords.includes(word));

    if (actionWord && cleanMessage.length > 50) {
      // Use action + first part of message
      const firstPart = cleanMessage.substring(0, 50).trim();
      return `${actionWord.charAt(0).toUpperCase() + actionWord.slice(1)}: ${firstPart}...`;
    } else if (cleanMessage.length > 60) {
      // Just truncate long messages
      return cleanMessage.substring(0, 60).trim() + '...';
    } else {
      // Use the message as-is for short messages
      return cleanMessage;
    }
  }

  /**
   * Check if a task exists and is active
   */
  async isTaskActive(taskId: string): Promise<boolean> {
    try {
      const task = await this.db.getTask(taskId);
      return task?.status === 'active';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get task participants
   */
  async getTaskParticipants(taskId: string): Promise<string[]> {
    try {
      const task = await this.db.getTask(taskId);
      return task?.participants || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Check if a user/agent is participant in a task
   */
  async isParticipant(taskId: string, participantId: string): Promise<boolean> {
    try {
      const participants = await this.getTaskParticipants(taskId);
      return participants.includes(participantId);
    } catch (error) {
      return false;
    }
  }
} 