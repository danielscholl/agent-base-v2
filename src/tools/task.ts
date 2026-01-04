/**
 * Task tool - subagent delegation.
 *
 * Features:
 * - Launch specialized subagents
 * - Session creation and continuation
 * - Progress streaming via metadata
 * - Abort signal handling
 *
 * Note: This is a placeholder implementation. The actual subagent execution
 * requires integration with the Agent layer which is outside the scope of
 * individual tools. The Tool layer must not call LLMs directly.
 */

import { z } from 'zod';
import { Tool } from './tool.js';
import type { ToolErrorCode } from './types.js';

/**
 * Task tool metadata type.
 */
interface TaskMetadata extends Tool.Metadata {
  /** Session ID for this task */
  sessionID: string;
  /** Subagent type used */
  subagentType: string;
  /** Task status */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Error code if task failed */
  error?: ToolErrorCode;
}

/**
 * Available subagent types (placeholder - would be discovered dynamically).
 */
const SUBAGENT_TYPES = ['general', 'code-review', 'research', 'planning'] as const;

type SubagentType = (typeof SUBAGENT_TYPES)[number];

function isValidSubagentType(type: string): type is SubagentType {
  return SUBAGENT_TYPES.includes(type as SubagentType);
}

/** Parameters schema for task tool */
const taskParametersSchema = z.object({
  description: z.string().describe('Short (3-5 word) description of the task'),
  prompt: z.string().describe('Detailed prompt/instructions for the subagent'),
  subagent_type: z.string().optional().describe('Subagent type'),
  session_id: z.string().optional().describe('Session ID to continue previous task'),
});

type TaskParameters = z.infer<typeof taskParametersSchema>;

/**
 * Task tool - delegate work to subagents.
 *
 * Note: This tool returns LLM_ASSIST_REQUIRED to signal that the Agent layer
 * should handle the subagent execution. Tools must not call LLMs directly.
 */
export const taskTool = Tool.define<typeof taskParametersSchema, TaskMetadata>('task', {
  description: `Launch subagent for complex tasks. Types: ${SUBAGENT_TYPES.join(', ')}`,
  parameters: taskParametersSchema,
  execute: (args: TaskParameters, ctx: Tool.Context<TaskMetadata>): Tool.Result<TaskMetadata> => {
    const {
      description,
      prompt,
      subagent_type: subagentType = 'general',
      session_id: sessionId,
    } = args;
    const availableTypes = SUBAGENT_TYPES.join(', ');

    // Validate subagent type
    if (!isValidSubagentType(subagentType)) {
      return {
        title: `Error: Invalid subagent type`,
        metadata: {
          sessionID: sessionId ?? ctx.sessionID,
          subagentType,
          status: 'failed' as const,
          error: 'VALIDATION_ERROR' as ToolErrorCode,
        },
        output: `Error: Unknown subagent type '${subagentType}'. Available: ${availableTypes}`,
      };
    }

    // Stream progress
    ctx.metadata({
      title: `Launching ${subagentType} agent: ${description}`,
      metadata: {
        sessionID: sessionId ?? ctx.sessionID,
        subagentType,
        status: 'pending',
      },
    });

    // Generate session ID if not provided
    const taskSessionID =
      sessionId ?? `task-${String(Date.now())}-${crypto.randomUUID().slice(0, 8)}`;

    // Since tools cannot call LLMs directly, we return a structured response
    // indicating that the Agent layer should handle this request.
    // In a real implementation, the Agent would intercept this and spawn a subagent.
    return {
      title: `Task delegated: ${description}`,
      metadata: {
        sessionID: taskSessionID,
        subagentType,
        status: 'pending' as const,
      },
      output: JSON.stringify(
        {
          action: 'LLM_ASSIST_REQUIRED',
          taskType: 'subagent_delegation',
          sessionID: taskSessionID,
          subagentType,
          description,
          prompt,
          message: 'Agent layer should spawn subagent to handle this request',
        },
        null,
        2
      ),
    };
  },
});
