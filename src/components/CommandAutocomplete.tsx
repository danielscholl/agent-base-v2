/**
 * CommandAutocomplete component for slash command suggestions.
 * Shows a filterable list of available commands when user types '/'.
 */

import React from 'react';
import { Box, Text } from 'ink';

/**
 * Command item for autocomplete display.
 */
export interface AutocompleteCommand {
  /** Command name (without leading slash) */
  name: string;
  /** Brief description */
  description: string;
  /** Optional argument hint (e.g., "[filepath]" or "<required-arg>") */
  argumentHint?: string;
}

/**
 * Props for CommandAutocomplete component.
 */
export interface CommandAutocompleteProps {
  /** List of all available commands */
  commands: AutocompleteCommand[];
  /** Current filter text (after the '/') */
  filter: string;
  /** Currently selected index */
  selectedIndex: number;
  /** Maximum items to display */
  maxItems?: number;
}

/**
 * Filter commands based on input filter.
 * Returns commands that start with the filter text.
 */
export function filterCommands(
  commands: AutocompleteCommand[],
  filter: string
): AutocompleteCommand[] {
  const normalized = filter.toLowerCase();
  if (normalized === '') {
    return commands;
  }
  return commands.filter((cmd) => cmd.name.toLowerCase().startsWith(normalized));
}

/**
 * CommandAutocomplete component.
 * Displays a filtered list of commands with selection highlighting.
 */
export function CommandAutocomplete({
  commands,
  filter,
  selectedIndex,
  maxItems = 10,
}: CommandAutocompleteProps): React.ReactElement | null {
  const filtered = filterCommands(commands, filter);

  // Don't show if no matches
  if (filtered.length === 0) {
    return null;
  }

  // Calculate window bounds to keep selected item visible
  // The window scrolls to follow the selection
  let startIndex = 0;
  if (filtered.length > maxItems) {
    // Keep selected item roughly centered, but clamp to valid bounds
    const halfWindow = Math.floor(maxItems / 2);
    startIndex = Math.max(0, selectedIndex - halfWindow);
    // Clamp so we don't go past the end
    startIndex = Math.min(startIndex, filtered.length - maxItems);
  }
  const endIndex = Math.min(startIndex + maxItems, filtered.length);
  const displayed = filtered.slice(startIndex, endIndex);

  // Adjust selected index relative to displayed window
  const displayedSelectedIndex = selectedIndex - startIndex;

  // Calculate column widths
  const maxNameWidth = Math.max(...displayed.map((cmd) => cmd.name.length)) + 1;
  const nameColWidth = Math.max(maxNameWidth, 12); // Minimum 12 chars

  // Check if we should show argument hint:
  // - Single match OR exact match with the selected command
  const selectedCommand = filtered[selectedIndex];
  const isExactMatch =
    selectedCommand !== undefined && filter.toLowerCase() === selectedCommand.name.toLowerCase();

  // Determine if hint should be shown and extract hint info
  const hintCommand =
    (filtered.length === 1 || isExactMatch) &&
    selectedCommand !== undefined &&
    selectedCommand.argumentHint !== undefined
      ? selectedCommand
      : null;

  // Calculate how many items are hidden above/below
  const hiddenAbove = startIndex;
  const hiddenBelow = filtered.length - endIndex;

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      {hiddenAbove > 0 && <Text dimColor>↑ {String(hiddenAbove)} more above</Text>}
      {displayed.map((cmd, index) => {
        const isSelected = index === displayedSelectedIndex;
        return (
          <Box key={cmd.name}>
            <Text color={isSelected ? 'cyan' : 'gray'} bold={isSelected}>
              {'/'}
              {cmd.name.padEnd(nameColWidth)}
            </Text>
            <Text color={isSelected ? 'white' : 'gray'} dimColor={!isSelected}>
              {cmd.description}
            </Text>
          </Box>
        );
      })}
      {hintCommand !== null && (
        <Box marginTop={0}>
          <Text dimColor>{'  Usage: /'}</Text>
          <Text color="cyan">{hintCommand.name}</Text>
          <Text dimColor> </Text>
          <Text color="yellow">{hintCommand.argumentHint}</Text>
        </Box>
      )}
      {hiddenBelow > 0 && <Text dimColor>↓ {String(hiddenBelow)} more below</Text>}
    </Box>
  );
}
