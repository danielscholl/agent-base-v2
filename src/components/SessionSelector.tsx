/**
 * SessionSelector component for interactive session selection.
 * Shows a navigable list of sessions when user runs /resume without arguments.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { SessionMetadata } from '../utils/session.js';

/**
 * Props for SessionSelector component.
 */
export interface SessionSelectorProps {
  /** List of available sessions */
  sessions: SessionMetadata[];
  /** Currently selected index */
  selectedIndex: number;
  /** Maximum items to display */
  maxItems?: number;
}

/**
 * Format a date for compact display.
 */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return `Today ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (isYesterday) {
    return `Yesterday ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * SessionSelector component.
 * Displays a navigable list of sessions with selection highlighting.
 */
export function SessionSelector({
  sessions,
  selectedIndex,
  maxItems = 10,
}: SessionSelectorProps): React.ReactElement | null {
  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="yellow">No saved sessions found.</Text>
        <Text dimColor>Use /save to save the current session.</Text>
      </Box>
    );
  }

  // Calculate visible window around selected item
  const halfWindow = Math.floor(maxItems / 2);
  let startIdx = Math.max(0, selectedIndex - halfWindow);
  const endIdx = Math.min(sessions.length, startIdx + maxItems);

  // Adjust start if we're near the end
  if (endIdx - startIdx < maxItems && startIdx > 0) {
    startIdx = Math.max(0, endIdx - maxItems);
  }

  const displayed = sessions.slice(startIdx, endIdx);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Select a session to resume:
        </Text>
        <Text dimColor> (↑/↓ navigate, Enter select, Esc cancel)</Text>
      </Box>

      {startIdx > 0 && <Text dimColor> ↑ {String(startIdx)} more above</Text>}

      {displayed.map((session, idx) => {
        const actualIndex = startIdx + idx;
        const isSelected = actualIndex === selectedIndex;
        const dateStr = formatDate(session.lastActivityAt);
        const msgCount = session.messageCount;
        const preview = session.firstMessage.slice(0, 40);
        const previewText =
          preview.length < session.firstMessage.length ? `${preview}...` : preview;

        return (
          <Box key={session.id} paddingLeft={1}>
            <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
              {isSelected ? '▶ ' : '  '}
            </Text>
            <Box width={20}>
              <Text color={isSelected ? 'cyan' : 'gray'}>{dateStr}</Text>
            </Box>
            <Box width={8}>
              <Text color={isSelected ? 'cyan' : 'gray'}>({String(msgCount)} msgs)</Text>
            </Box>
            <Text color={isSelected ? 'white' : 'gray'} dimColor={!isSelected}>
              {previewText || '(empty)'}
            </Text>
          </Box>
        );
      })}

      {endIdx < sessions.length && (
        <Text dimColor> ↓ {String(sessions.length - endIdx)} more below</Text>
      )}
    </Box>
  );
}
