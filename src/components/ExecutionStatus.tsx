/**
 * ExecutionStatus component for ephemeral agent execution visualization.
 * Displays ONLY working state - completion is handled by SpanFooter.
 *
 * This component is ephemeral: it shows during execution and disappears
 * when complete. The parent component is responsible for clearing this
 * and optionally showing SpanFooter for verbose mode post-completion.
 *
 * Note: "Span" aligns with OpenTelemetry terminology - each LLM reasoning
 * cycle produces a span with associated tool calls.
 */

import React from 'react';
import { Box, Text } from 'ink';

// Visual symbols (from agent-base)
const SYMBOL_ACTIVE = '●'; // Yellow - working/thinking
const SYMBOL_COMPLETE = '•'; // Dim - completed node
const SYMBOL_TOOL = '→'; // Tool executing
const SYMBOL_ERROR = '✗'; // Red - error

// Tree drawing characters
const TREE_BRANCH = '├──';
const TREE_LAST = '└──';

/**
 * Tool node information for display.
 */
export interface ToolNode {
  /** Unique identifier */
  id: string;
  /** Tool name */
  name: string;
  /** Tool arguments (truncated for display) */
  args?: string;
  /** Primary argument to show inline (e.g., file path, command, pattern) */
  primaryArg?: string;
  /** One-line result summary (e.g., "42 files", "270 lines") */
  resultSummary?: string;
  /** Whether the tool has detailed output worth expanding */
  hasDetailedOutput?: boolean;
  /** Execution status */
  status: 'running' | 'complete' | 'error';
  /** Duration in seconds (for completed tools) */
  duration?: number;
  /** Error message (if status is error) */
  error?: string;
  /** Span number this tool belongs to (1-indexed) */
  span?: number;
}

/**
 * Execution span information.
 * Each span represents one LLM reasoning cycle + its associated tool calls.
 * Note: "Span" aligns with OpenTelemetry terminology.
 */
export interface ExecutionSpan {
  /** Span number (1-indexed) */
  number: number;
  /** Span status */
  status: 'working' | 'complete' | 'error';
  /** Duration in seconds (for completed spans) */
  duration?: number;
  /** Message count for this span's LLM call */
  messageCount: number;
  /** Whether LLM is actively thinking in this span */
  isThinking: boolean;
  /** Tool nodes executed in this span */
  toolNodes: ToolNode[];
  /** Captured reasoning summary (truncated tail of LLM stream) */
  reasoning?: string;
  /** Full reasoning length before truncation */
  reasoningFullLength?: number;
}

/**
 * Props for ExecutionStatus component.
 */
export interface ExecutionStatusProps {
  /** Current execution status */
  status: 'working' | 'complete' | 'error';
  /** Number of messages sent to LLM */
  messageCount: number;
  /** Total tool count */
  toolCount: number;
  /** Duration in seconds (for completion status) */
  duration?: number;
  /** Thinking state - whether LLM is actively thinking */
  thinkingState?: {
    messageCount: number;
    isActive: boolean;
  };
  /** Tool execution nodes (flat list) */
  toolNodes?: ToolNode[];
  /** Error message (if status is error) */
  errorMessage?: string;
}

/**
 * Format duration as seconds with one decimal.
 */
function formatDuration(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

/**
 * Check if duration is significant enough to display (>= 1 second).
 */
function isSignificantDuration(duration: number | undefined): boolean {
  return duration !== undefined && duration >= 1.0;
}

/**
 * Render a tool node in the tree.
 *
 * Format: tool primaryArg -> resultSummary (Xs)
 *
 * Examples:
 * - Running: -> bash: npm test
 * - Complete: glob star.ts -> 42 files
 * - Complete with duration: bash: npm test -> passed (2.1s)
 * - Error: read file.ts - File not found
 */
function ToolNodeRow({ node, isLast }: { node: ToolNode; isLast: boolean }): React.ReactElement {
  const prefix = isLast ? TREE_LAST : TREE_BRANCH;

  // Determine symbol and color based on status
  let symbol: string;
  let color: string;

  if (node.status === 'running') {
    symbol = SYMBOL_TOOL;
    color = 'yellow';
  } else if (node.status === 'complete') {
    symbol = SYMBOL_COMPLETE;
    color = 'gray';
  } else {
    symbol = SYMBOL_ERROR;
    color = 'red';
  }

  // Build the display line using new summary format
  // Format: `tool primaryArg → resultSummary`
  const hasPrimaryArg = node.primaryArg !== undefined && node.primaryArg !== '';
  const hasResultSummary = node.resultSummary !== undefined && node.resultSummary !== '';
  const showDuration = isSignificantDuration(node.duration) || node.status === 'error';

  return (
    <Box>
      <Text dimColor>{prefix} </Text>
      <Text color={color}>{symbol} </Text>
      <Text color={color}>{node.name}</Text>
      {/* Show primary arg inline (e.g., file path, command, pattern) */}
      {hasPrimaryArg && (
        <Text color={node.status === 'running' ? 'yellow' : 'gray'}>
          {node.name === 'bash' ? ': ' : ' '}
          {node.primaryArg}
        </Text>
      )}
      {/* Fallback to legacy args format if no primaryArg */}
      {!hasPrimaryArg && node.args !== undefined && node.args !== '' && (
        <Text dimColor> ({node.args})</Text>
      )}
      {/* Show result summary with arrow separator */}
      {node.status !== 'running' && hasResultSummary && (
        <Text dimColor>
          {' '}
          {SYMBOL_TOOL} {node.resultSummary}
        </Text>
      )}
      {/* Show duration only if significant (>= 1s) or on error */}
      {showDuration && node.duration !== undefined && (
        <Text dimColor> ({formatDuration(node.duration)})</Text>
      )}
      {/* Show error message */}
      {node.status === 'error' && node.error !== undefined && (
        <Text color="red"> - {node.error}</Text>
      )}
    </Box>
  );
}

/**
 * ExecutionStatus component.
 * Displays EPHEMERAL execution status during working state only.
 * Returns null on completion (parent uses SpanFooter for verbose mode).
 *
 * Working state:
 * ```
 * ● working... (msg:1 tool:0)
 * ├── ● Thinking (1 messages)
 * └── • glob **\/*.ts → 42 files
 * ```
 *
 * Note: Completion state returns null. Parent component should:
 * - Non-verbose: Just clear the status (ephemeral)
 * - Verbose: Show SpanFooter with completed spans summary
 */
export function ExecutionStatus({
  status,
  messageCount,
  toolCount,
  duration,
  thinkingState,
  toolNodes = [],
  errorMessage,
}: ExecutionStatusProps): React.ReactElement | null {
  // Completion state - return null (parent shows SpanFooter for verbose mode)
  // This makes ExecutionStatus ephemeral - visible only during execution
  if (status === 'complete') {
    return null;
  }

  // Error state
  if (status === 'error') {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="red">{SYMBOL_ERROR} Error</Text>
          {duration !== undefined && <Text dimColor> ({formatDuration(duration)})</Text>}
          <Text dimColor>
            {' '}
            - msg:{messageCount} tool:{toolCount}
          </Text>
        </Box>
        {errorMessage !== undefined && (
          <Box>
            <Text dimColor>{TREE_LAST} </Text>
            <Text color="red">{errorMessage}</Text>
          </Box>
        )}
      </Box>
    );
  }

  // Working state - unified view for both verbose and non-verbose modes
  const hasThinking = thinkingState?.isActive ?? false;
  const hasTools = toolNodes.length > 0;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Header line */}
      <Box>
        <Text color="yellow">{SYMBOL_ACTIVE} working...</Text>
        <Text dimColor>
          {' '}
          (msg:{messageCount} tool:{toolCount})
        </Text>
      </Box>

      {/* Thinking node */}
      {hasThinking && (
        <Box>
          <Text dimColor>{hasTools ? TREE_BRANCH : TREE_LAST} </Text>
          <Text color="yellow">{SYMBOL_ACTIVE} Thinking</Text>
          <Text dimColor> ({thinkingState?.messageCount ?? 0} messages)</Text>
        </Box>
      )}

      {/* Tool nodes */}
      {toolNodes.map((node, index) => (
        <ToolNodeRow key={node.id} node={node} isLast={index === toolNodes.length - 1} />
      ))}
    </Box>
  );
}
