/**
 * TokenUsageDisplay component for token statistics visualization.
 * Displays session-level token usage information.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { SessionTokenUsage } from '../utils/index.js';

/**
 * Props for TokenUsageDisplay component.
 */
export interface TokenUsageDisplayProps {
  /** Current session token usage */
  usage: SessionTokenUsage;
  /** Whether to show detailed breakdown (default: false) */
  showDetails?: boolean;
}

/**
 * Format a number with thousands separators.
 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * TokenUsageDisplay component.
 * Shows token statistics in a compact or detailed format.
 */
export function TokenUsageDisplay({
  usage,
  showDetails = false,
}: TokenUsageDisplayProps): React.ReactElement | null {
  // Don't render if no queries yet
  if (usage.queryCount === 0) {
    return null;
  }

  if (showDetails) {
    // Detailed view with breakdown
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text dimColor>Tokens: </Text>
          <Text color="cyan">{formatNumber(usage.tokens)}</Text>
          <Text dimColor> total</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text dimColor>Prompt: </Text>
          <Text>{formatNumber(usage.promptTokens)}</Text>
          <Text dimColor> | Completion: </Text>
          <Text>{formatNumber(usage.completionTokens)}</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text dimColor>Queries: </Text>
          <Text>{formatNumber(usage.queryCount)}</Text>
          <>
            <Text dimColor> (avg </Text>
            <Text>{formatNumber(Math.round(usage.tokens / usage.queryCount))}</Text>
            <Text dimColor>/query)</Text>
          </>
        </Box>
      </Box>
    );
  }

  // Compact view - single line
  return (
    <Box marginTop={1}>
      <Text dimColor>Tokens: </Text>
      <Text color="cyan">{formatNumber(usage.tokens)}</Text>
      <Text dimColor>
        {' '}
        ({formatNumber(usage.queryCount)} {usage.queryCount === 1 ? 'query' : 'queries'})
      </Text>
    </Box>
  );
}
