/**
 * ToolRow component for displaying tool execution in tree format.
 *
 * Shared component used by both ExecutionStatus (live view) and
 * SpanNode (post-completion summary).
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ToolNode } from './ExecutionStatus.js';

// Tree drawing characters
const TREE_BRANCH = '├──';
const TREE_LAST = '└──';

// Status symbols
const SYMBOL_COMPLETE = '•'; // Dim - completed
const SYMBOL_TOOL = '→'; // Tool executing/result separator
const SYMBOL_ERROR = '✗'; // Red - error

/**
 * Props for ToolRow component.
 */
export interface ToolRowProps {
  /** Tool node data */
  node: ToolNode;
  /** Whether this is the last item in the tree */
  isLast: boolean;
  /** Left margin in spaces (default: 0) */
  indent?: number;
}

/**
 * Format duration in seconds.
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
 * ToolRow component.
 *
 * Renders a tool node in tree format with status indicator,
 * primary argument, result summary, and duration.
 *
 * @example Running
 * ```
 * ├── → bash: npm test
 * ```
 *
 * @example Complete
 * ```
 * ├── • glob **\/*.ts → 42 files
 * └── • bash: npm test → passed (2.1s)
 * ```
 *
 * @example Error
 * ```
 * └── ✗ read file.ts - File not found
 * ```
 */
export function ToolRow({ node, isLast, indent = 0 }: ToolRowProps): React.ReactElement {
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

  // Build the display line using summary format
  // Format: `tool primaryArg → resultSummary`
  const hasPrimaryArg = node.primaryArg !== undefined && node.primaryArg !== '';
  const hasResultSummary = node.resultSummary !== undefined && node.resultSummary !== '';
  const showDuration = isSignificantDuration(node.duration) || node.status === 'error';

  return (
    <Box marginLeft={indent}>
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
