/**
 * SpanFooter component for verbose mode execution summary.
 *
 * Displays a compact span summary near the input prompt in verbose mode.
 * Shows after agent completion with expandable span details.
 *
 * Note: "Span" aligns with OpenTelemetry terminology - each LLM reasoning
 * cycle produces a span with associated tool calls.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ExecutionSpan } from './ExecutionStatus.js';
import { SpanNode } from './SpanNode.js';

// Status symbols
const SYMBOL_COMPLETE = '✓'; // Checkmark for completion
const SYMBOL_ERROR = '✗'; // Error indicator
const SYMBOL_SEPARATOR = '•'; // Dot separator between span chips

/**
 * Props for SpanFooter component.
 */
export interface SpanFooterProps {
  /** Completed spans to summarize */
  spans: ExecutionSpan[];
  /** Total execution duration in seconds */
  duration: number;
  /** Total tool count across all spans */
  toolCount: number;
  /** Set of expanded span numbers */
  expandedSpans: Set<number>;
}

/**
 * Format duration in seconds.
 */
function formatDuration(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

/**
 * Determine if any span has errors.
 */
function hasErrors(spans: ExecutionSpan[]): boolean {
  return spans.some(
    (span) => span.status === 'error' || span.toolNodes.some((tool) => tool.status === 'error')
  );
}

/**
 * SpanFooter component.
 *
 * Renders a compact execution summary for verbose mode.
 * Appears below agent output, above the input prompt.
 *
 * @example Collapsed (default)
 * ```
 * ✓ 3 spans, 12 tools (4.2s)
 * S1 • S2 • S3
 * ```
 *
 * @example Expanded
 * ```
 * ✓ 3 spans, 12 tools (4.2s)
 * ▼S1 • ▼S2 • ▼S3
 *  ▼ S1 (1.2s)
 *  ├── • Thinking (3 messages)
 *  └── • glob **\/*.ts → 42 files
 * ```
 */
export function SpanFooter({
  spans,
  duration,
  toolCount,
  expandedSpans,
}: SpanFooterProps): React.ReactElement | null {
  // Don't render if no spans
  if (spans.length === 0) {
    return null;
  }

  const isError = hasErrors(spans);
  const statusSymbol = isError ? SYMBOL_ERROR : SYMBOL_COMPLETE;
  const statusColor = isError ? 'red' : 'green';

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Summary header */}
      <Box>
        <Text color={statusColor}>{statusSymbol}</Text>
        <Text dimColor>
          {' '}
          {spans.length} span{spans.length === 1 ? '' : 's'}, {toolCount} tool
          {toolCount === 1 ? '' : 's'} ({formatDuration(duration)})
        </Text>
      </Box>

      {/* Span chips row */}
      <Box flexWrap="wrap">
        {spans.map((span, index) => {
          const isExpanded = expandedSpans.has(span.number);
          const hasError =
            span.status === 'error' || span.toolNodes.some((tool) => tool.status === 'error');

          return (
            <React.Fragment key={span.number}>
              {/* Separator between chips */}
              {index > 0 && <Text dimColor> {SYMBOL_SEPARATOR} </Text>}
              {/* Span chip */}
              <Text color={hasError ? 'red' : undefined} dimColor={!hasError}>
                {isExpanded ? '▼' : ''}S{span.number}
              </Text>
            </React.Fragment>
          );
        })}
      </Box>

      {/* Expanded span details */}
      {spans
        .filter((span) => expandedSpans.has(span.number))
        .map((span) => (
          <Box key={`expanded-${String(span.number)}`} marginLeft={1} marginTop={0}>
            <SpanNode span={span} expanded={true} compact={true} showToolHistory={true} />
          </Box>
        ))}
    </Box>
  );
}
