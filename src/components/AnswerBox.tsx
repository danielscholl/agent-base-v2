/**
 * AnswerBox component for streaming LLM response display.
 * Provides visual container for assistant responses with typing indicator.
 */

import React from 'react';
import { Box, Text } from 'ink';

/**
 * Props for AnswerBox component.
 */
export interface AnswerBoxProps {
  /** Content to display (accumulated streamed text) */
  content: string;
  /** Whether currently streaming (show typing indicator) */
  isStreaming?: boolean;
  /** Optional label for the box */
  label?: string;
}

/** Typing indicator character */
const TYPING_INDICATOR = '▌';

/**
 * AnswerBox component.
 * Displays streaming LLM responses with visual container.
 */
export function AnswerBox({
  content,
  isStreaming = false,
  label,
}: AnswerBoxProps): React.ReactElement | null {
  // Don't render if empty and not streaming
  if (content === '' && !isStreaming) {
    return null;
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Optional label */}
      {label !== undefined && <Text dimColor>{label}</Text>}

      {/* Content with optional typing indicator */}
      <Box>
        <Text color="green">
          {content}
          {isStreaming && content !== '' && <Text color="cyan">{TYPING_INDICATOR}</Text>}
        </Text>
      </Box>

      {/* Show "thinking..." when streaming starts but no content yet */}
      {isStreaming && content === '' && (
        <Text color="cyan" dimColor>
          Generating response...
        </Text>
      )}
    </Box>
  );
}
