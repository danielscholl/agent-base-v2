/**
 * Todo tools - task list management.
 *
 * Features:
 * - TodoWrite: Create/update task list
 * - TodoRead: Read current task list
 * - Session-scoped state (todos are per-session)
 * - Status tracking: pending, in_progress, completed
 */

import { z } from 'zod';
import { Tool } from './tool.js';

/**
 * Todo item schema.
 */
const TodoItemSchema = z.object({
  content: z.string().describe('Task description'),
  status: z.enum(['pending', 'in_progress', 'completed']).describe('Task status'),
  activeForm: z.string().optional().describe('Present tense form (e.g., "Running tests")'),
});

type TodoItem = z.infer<typeof TodoItemSchema>;

/**
 * Session-scoped todo storage.
 * Key is sessionID, value is array of todos.
 */
const todoStore = new Map<string, TodoItem[]>();

/**
 * TodoWrite tool metadata type.
 */
interface TodoWriteMetadata extends Tool.Metadata {
  /** Number of todos in list */
  todoCount: number;
  /** Breakdown by status */
  statusCounts: {
    pending: number;
    in_progress: number;
    completed: number;
  };
}

/**
 * TodoWrite tool - create/update task list.
 */
export const todoWriteTool = Tool.define<
  z.ZodObject<{
    todos: z.ZodArray<typeof TodoItemSchema>;
  }>,
  TodoWriteMetadata
>('todowrite', {
  description: 'Update task list. Statuses: pending, in_progress, completed.',
  parameters: z.object({
    todos: z.array(TodoItemSchema).describe('Array of todo items'),
  }),
  execute: (args, ctx) => {
    const { todos } = args;

    // Store todos for this session
    todoStore.set(ctx.sessionID, todos);

    // Calculate status counts
    const statusCounts = {
      pending: 0,
      in_progress: 0,
      completed: 0,
    };

    for (const todo of todos) {
      statusCounts[todo.status]++;
    }

    // Format output
    const lines = todos.map((todo, i) => {
      const statusIcon = {
        pending: '○',
        in_progress: '●',
        completed: '✓',
      }[todo.status];
      return `${String(i + 1)}. [${statusIcon}] ${todo.content}`;
    });

    return {
      title: `Updated ${String(todos.length)} todo${todos.length === 1 ? '' : 's'}`,
      metadata: {
        todoCount: todos.length,
        statusCounts,
      },
      output: lines.length > 0 ? lines.join('\n') : '(empty list)',
    };
  },
});

/**
 * TodoRead tool metadata type.
 */
interface TodoReadMetadata extends Tool.Metadata {
  /** Number of todos in list */
  todoCount: number;
  /** Breakdown by status */
  statusCounts: {
    pending: number;
    in_progress: number;
    completed: number;
  };
}

/**
 * TodoRead tool - read current task list.
 */
export const todoReadTool = Tool.define<z.ZodObject<Record<string, never>>, TodoReadMetadata>(
  'todoread',
  {
    description: 'Read current task list.',
    parameters: z.object({}),
    execute: (_args, ctx) => {
      // Get todos for this session
      const todos = todoStore.get(ctx.sessionID) ?? [];

      // Calculate status counts
      const statusCounts = {
        pending: 0,
        in_progress: 0,
        completed: 0,
      };

      for (const todo of todos) {
        statusCounts[todo.status]++;
      }

      // Format output
      const lines = todos.map((todo, i) => {
        const statusIcon = {
          pending: '○',
          in_progress: '●',
          completed: '✓',
        }[todo.status];
        return `${String(i + 1)}. [${statusIcon}] ${todo.content}`;
      });

      return {
        title: `${String(todos.length)} todo${todos.length === 1 ? '' : 's'}`,
        metadata: {
          todoCount: todos.length,
          statusCounts,
        },
        output: lines.length > 0 ? lines.join('\n') : '(no todos)',
      };
    },
  }
);

/**
 * Clear todos for a session (useful for testing).
 */
export function clearTodos(sessionID: string): void {
  todoStore.delete(sessionID);
}

/**
 * Get todos for a session (for external access).
 */
export function getTodos(sessionID: string): TodoItem[] {
  return todoStore.get(sessionID) ?? [];
}
