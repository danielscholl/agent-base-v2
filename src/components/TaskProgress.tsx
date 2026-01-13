/**
 * TaskProgress component for tool execution visualization.
 * Displays active and completed tool operations.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Spinner } from './Spinner.js';

/**
 * Information about an active tool execution.
 */
export interface ActiveTask {
  /** Unique identifier for this task (spanId from context) */
  id: string;
  /** Tool name */
  name: string;
  /** Tool arguments (for display) */
  args?: Record<string, unknown>;
  /** Primary argument for display (e.g., file path, command) */
  primaryArg?: string;
  /** Timestamp when tool started */
  startTime: number;
  /** Span number this task belongs to (1-indexed) */
  span: number;
}

/**
 * Information about a completed tool execution.
 */
export interface CompletedTask {
  /** Unique identifier for this task (used as React key) */
  id: string;
  /** Tool name */
  name: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Duration in milliseconds (-1 if unknown) */
  duration: number;
  /** Error message if failed */
  error?: string;
  /** Span number this task belongs to (1-indexed) */
  span: number;
  /** Primary argument to show inline (e.g., file path, command, pattern) */
  primaryArg?: string;
  /** One-line result summary (e.g., "42 files", "270 lines") */
  resultSummary?: string;
  /** Whether the tool has detailed output worth expanding */
  hasDetailedOutput?: boolean;
}

/**
 * Props for TaskProgress component.
 */
export interface TaskProgressProps {
  /** Currently active tool executions */
  activeTasks?: ActiveTask[];
  /** Completed tool executions */
  completedTasks?: CompletedTask[];
  /** Whether to show completed tasks (default: true) */
  showCompleted?: boolean;
  /** Maximum completed tasks to show (default: 3) */
  maxCompleted?: number;
}

/**
 * Format tool arguments for display.
 * Shows first few args, truncates long values.
 */
function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args).slice(0, 2);
  return entries
    .map(([key, value]) => {
      const strValue = String(value);
      const truncated = strValue.length > 20 ? strValue.slice(0, 17) + '...' : strValue;
      return `${key}: ${truncated}`;
    })
    .join(', ');
}

/**
 * TaskProgress component.
 * Displays tool execution status with active spinners and completion indicators.
 */
export function TaskProgress({
  activeTasks = [],
  completedTasks = [],
  showCompleted = true,
  maxCompleted = 3,
}: TaskProgressProps): React.ReactElement | null {
  // Don't render if no tasks
  if (activeTasks.length === 0 && completedTasks.length === 0) {
    return null;
  }

  // Get most recent completed tasks
  const visibleCompleted = showCompleted ? completedTasks.slice(-maxCompleted) : [];

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Completed tasks (most recent) */}
      {visibleCompleted.map((task) => (
        <Box key={task.id}>
          <Text color={task.success ? 'green' : 'red'}>{task.success ? '✓' : '✗'}</Text>
          <Text> {task.name}</Text>
          <Text dimColor>
            {task.duration >= 0 ? ` (${String(task.duration)}ms)` : ' (duration unknown)'}
          </Text>
          {task.error !== undefined && <Text color="red"> - {task.error}</Text>}
        </Box>
      ))}

      {/* Active tasks */}
      {activeTasks.map((task) => (
        <Box key={task.id}>
          <Spinner message="" />
          <Text color="cyan"> {task.name}</Text>
          {task.args !== undefined && Object.keys(task.args).length > 0 && (
            <Text dimColor> ({formatArgs(task.args)})</Text>
          )}
        </Box>
      ))}
    </Box>
  );
}
