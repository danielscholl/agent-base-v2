/**
 * ErrorDisplay component for formatted error output.
 * Uses getUserFriendlyMessage for human-readable error messages.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { AgentErrorResponse } from '../errors/index.js';
import { getUserFriendlyMessage } from '../errors/index.js';

/**
 * Props for ErrorDisplay component.
 */
export interface ErrorDisplayProps {
  /** The error response to display */
  error: AgentErrorResponse;
}

/**
 * Error display component.
 * Formats agent errors with user-friendly messages and provider context.
 */
export function ErrorDisplay({ error }: ErrorDisplayProps): React.ReactElement {
  const friendlyMessage = getUserFriendlyMessage(error.error, error.metadata);

  return (
    <Box flexDirection="column">
      <Text color="red">Error: {friendlyMessage}</Text>
      {error.metadata?.provider !== undefined && (
        <Text dimColor>Provider: {error.metadata.provider}</Text>
      )}
      {error.metadata?.model !== undefined && <Text dimColor>Model: {error.metadata.model}</Text>}
    </Box>
  );
}
