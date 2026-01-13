/**
 * SpanNode component for progressive disclosure UI.
 *
 * Displays an execution span with its tools in a collapsible tree format.
 * Shows span status, duration, and tool count at minimum.
 * Expands to show tool details when verbose mode is enabled.
 *
 * Note: "Span" aligns with OpenTelemetry terminology - each LLM reasoning
 * cycle produces a span with associated tool calls.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ExecutionSpan, ToolNode } from './ExecutionStatus.js';

// Tree drawing characters
const TREE_BRANCH = '├──';
const TREE_LAST = '└──';

// Status symbols
const SYMBOL_WORKING = '●'; // Yellow - working/active
const SYMBOL_COMPLETE = '•'; // Dim - completed
const SYMBOL_TOOL = '→'; // Tool executing/result separator
const SYMBOL_ERROR = '✗'; // Red - error
const SYMBOL_EXPANDED = '▼'; // Expanded indicator

/**
 * Props for SpanNode component.
 */
export interface SpanNodeProps {
  /** Span data to display */
  span: ExecutionSpan;
  /** Whether to show expanded tool details */
  expanded?: boolean;
  /** Whether this is the last span (affects tree drawing) */
  isLast?: boolean;
  /** Whether to show tool history (verbose mode) */
  showToolHistory?: boolean;
  /** Compact mode for footer display (S1 instead of Span 1) */
  compact?: boolean;
}

/**
 * Format duration in seconds.
 */
function formatDuration(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

/**
 * Get status symbol and color for a span.
 */
function getSpanStyle(span: ExecutionSpan): { symbol: string; color: string } {
  if (span.status === 'working') {
    return { symbol: SYMBOL_WORKING, color: 'yellow' };
  }
  // Check if any tools failed
  const hasError = span.toolNodes.some((t) => t.status === 'error');
  if (hasError) {
    return { symbol: SYMBOL_ERROR, color: 'red' };
  }
  return { symbol: SYMBOL_COMPLETE, color: 'gray' };
}

/**
 * Render a single tool in the span tree.
 */
function ToolNodeRow({ node, isLast }: { node: ToolNode; isLast: boolean }): React.ReactElement {
  const prefix = isLast ? TREE_LAST : TREE_BRANCH;

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

  const hasPrimaryArg = node.primaryArg !== undefined && node.primaryArg !== '';
  const hasResultSummary = node.resultSummary !== undefined && node.resultSummary !== '';
  const showDuration = node.duration !== undefined && node.duration >= 1.0;

  return (
    <Box marginLeft={2}>
      <Text dimColor>{prefix} </Text>
      <Text color={color}>{symbol} </Text>
      <Text color={color}>{node.name}</Text>
      {hasPrimaryArg && (
        <Text color="gray">
          {node.name === 'bash' ? ': ' : ' '}
          {node.primaryArg}
        </Text>
      )}
      {node.status !== 'running' && hasResultSummary && (
        <Text dimColor>
          {' '}
          {SYMBOL_TOOL} {node.resultSummary}
        </Text>
      )}
      {showDuration && <Text dimColor> ({formatDuration(node.duration ?? 0)})</Text>}
      {node.status === 'error' && node.error !== undefined && (
        <Text color="red"> - {node.error}</Text>
      )}
    </Box>
  );
}

/**
 * SpanNode component.
 *
 * Renders an execution span with optional tool details.
 * Collapsed format shows span summary, expanded format shows tool tree.
 *
 * @example Collapsed (compact=false)
 * ```
 * • Span 1 (2.1s) 3 tools
 * ```
 *
 * @example Collapsed (compact=true, for footer)
 * ```
 * S1 (2.1s) 3 tools
 * ```
 *
 * @example Expanded
 * ```
 * ▼ S1 (2.1s)
 * ├── • glob **\/*.ts → 42 files
 * ├── • read file.ts → 270 lines
 * └── • edit file.ts → 1 change (+15)
 * ```
 */
export function SpanNode({
  span,
  expanded = false,
  isLast = false,
  showToolHistory = true,
  compact = false,
}: SpanNodeProps): React.ReactElement {
  const { symbol, color } = getSpanStyle(span);
  // Note: isLast prop reserved for future tree integration
  void isLast;

  const toolCount = span.toolNodes.length;
  const spanLabel = compact ? `S${String(span.number)}` : `Span ${String(span.number)}`;

  // Collapsed view: span summary only
  if (!expanded || !showToolHistory) {
    return (
      <Box>
        <Text color={color}>{symbol} </Text>
        <Text color={color}>{spanLabel}</Text>
        {span.duration !== undefined && <Text dimColor> ({formatDuration(span.duration)})</Text>}
        <Text dimColor>
          {' '}
          {toolCount} tool{toolCount === 1 ? '' : 's'}
        </Text>
      </Box>
    );
  }

  // Expanded view: span with tool tree
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={color}>{SYMBOL_EXPANDED} </Text>
        <Text color={color}>{spanLabel}</Text>
        {span.duration !== undefined && <Text dimColor> ({formatDuration(span.duration)})</Text>}
      </Box>
      {/* Thinking summary if applicable */}
      {span.messageCount > 0 && (
        <Box marginLeft={2}>
          <Text dimColor>
            {toolCount > 0 || (span.reasoning !== undefined && span.reasoning !== '')
              ? TREE_BRANCH
              : TREE_LAST}{' '}
            {SYMBOL_COMPLETE} Thinking ({span.messageCount} messages)
          </Text>
        </Box>
      )}
      {/* Captured reasoning content */}
      {span.reasoning !== undefined && span.reasoning !== '' && (
        <Box marginLeft={4} flexDirection="column">
          <Text dimColor wrap="wrap">
            {span.reasoning}
          </Text>
          {span.reasoningFullLength !== undefined &&
            span.reasoningFullLength > span.reasoning.length && (
              <Text dimColor>({span.reasoningFullLength} chars total)</Text>
            )}
        </Box>
      )}
      {/* Tool tree */}
      {span.toolNodes.map((node, index) => (
        <ToolNodeRow key={node.id} node={node} isLast={index === span.toolNodes.length - 1} />
      ))}
    </Box>
  );
}
