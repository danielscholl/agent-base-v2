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
 * Format token count in compact form (k/M notation).
 * - Under 1,000: show as-is (e.g., "842")
 * - 1,000-999,999: show as Xk (e.g., "6.4k")
 * - 1,000,000+: show as XM (e.g., "1.2M")
 */
function formatTokensCompact(num: number): string {
  if (num < 1000) {
    return String(num);
  }
  if (num < 1_000_000) {
    const k = num / 1000;
    // Show one decimal place if under 10k, otherwise whole numbers
    return k < 10 ? `${k.toFixed(1)}k` : `${String(Math.round(k))}k`;
  }
  const m = num / 1_000_000;
  return m < 10 ? `${m.toFixed(1)}M` : `${String(Math.round(m))}M`;
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

  // Compact view - single line with k/M notation
  return (
    <Box marginTop={1}>
      <Text dimColor>Tokens: </Text>
      <Text color="cyan">{formatTokensCompact(usage.tokens)}</Text>
      <Text dimColor>
        {' '}
        ({formatNumber(usage.queryCount)} {usage.queryCount === 1 ? 'query' : 'queries'})
      </Text>
    </Box>
  );
}
