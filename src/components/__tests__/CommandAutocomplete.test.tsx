/**
 * Tests for CommandAutocomplete component.
 */

import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { render } from 'ink-testing-library';
import { CommandAutocomplete, filterCommands } from '../CommandAutocomplete.js';
import type { AutocompleteCommand } from '../CommandAutocomplete.js';

const TEST_COMMANDS: AutocompleteCommand[] = [
  { name: 'clear', description: 'Clear screen and history' },
  { name: 'continue', description: 'Continue the last session' },
  { name: 'exit', description: 'Exit the shell' },
  { name: 'help', description: 'Show help message' },
  { name: 'history', description: 'Show conversation history' },
  { name: 'purge', description: 'Delete old or specific sessions' },
  { name: 'resume', description: 'Resume a saved session' },
  { name: 'save', description: 'Save current session' },
  { name: 'sessions', description: 'List saved sessions' },
  { name: 'telemetry', description: 'Manage telemetry dashboard' },
];

describe('filterCommands', () => {
  it('returns all commands for empty filter', () => {
    const result = filterCommands(TEST_COMMANDS, '');
    expect(result).toEqual(TEST_COMMANDS);
  });

  it('filters commands by prefix', () => {
    const result = filterCommands(TEST_COMMANDS, 'c');
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('clear');
    expect(result[1]?.name).toBe('continue');
  });

  it('filters case-insensitively', () => {
    const result = filterCommands(TEST_COMMANDS, 'C');
    expect(result).toHaveLength(2);
  });

  it('returns empty array for no matches', () => {
    const result = filterCommands(TEST_COMMANDS, 'xyz');
    expect(result).toHaveLength(0);
  });

  it('matches exact command name', () => {
    const result = filterCommands(TEST_COMMANDS, 'help');
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('help');
  });

  it('filters by multiple characters', () => {
    const result = filterCommands(TEST_COMMANDS, 'ses');
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('sessions');
  });
});

describe('CommandAutocomplete', () => {
  it('renders all commands when filter is empty', () => {
    const { lastFrame } = render(
      <CommandAutocomplete commands={TEST_COMMANDS} filter="" selectedIndex={0} />
    );

    expect(lastFrame()).toContain('/clear');
    expect(lastFrame()).toContain('/help');
    expect(lastFrame()).toContain('/exit');
  });

  it('renders filtered commands', () => {
    const { lastFrame } = render(
      <CommandAutocomplete commands={TEST_COMMANDS} filter="c" selectedIndex={0} />
    );

    expect(lastFrame()).toContain('/clear');
    expect(lastFrame()).toContain('/continue');
    expect(lastFrame()).not.toContain('/help');
    expect(lastFrame()).not.toContain('/exit');
  });

  it('returns null when no matches', () => {
    const { lastFrame } = render(
      <CommandAutocomplete commands={TEST_COMMANDS} filter="xyz" selectedIndex={0} />
    );

    expect(lastFrame()).toBe('');
  });

  it('shows command descriptions', () => {
    const { lastFrame } = render(
      <CommandAutocomplete commands={TEST_COMMANDS} filter="help" selectedIndex={0} />
    );

    expect(lastFrame()).toContain('Show help message');
  });

  it('respects maxItems limit and shows hidden count below', () => {
    const { lastFrame } = render(
      <CommandAutocomplete commands={TEST_COMMANDS} filter="" selectedIndex={0} maxItems={3} />
    );

    expect(lastFrame()).toContain('/clear');
    expect(lastFrame()).toContain('/continue');
    expect(lastFrame()).toContain('/exit');
    expect(lastFrame()).not.toContain('/sessions');
    expect(lastFrame()).toContain('7 more below');
  });

  it('scrolls window to keep selected item visible', () => {
    // When selection is at the bottom, window should scroll down
    const { lastFrame } = render(
      <CommandAutocomplete commands={TEST_COMMANDS} filter="" selectedIndex={9} maxItems={3} />
    );

    // Last item (telemetry) should be visible
    expect(lastFrame()).toContain('/telemetry');
    // First item should no longer be visible
    expect(lastFrame()).not.toContain('/clear');
    // Should show items above indicator
    expect(lastFrame()).toContain('more above');
  });

  it('shows both above and below indicators when scrolled to middle', () => {
    // Select item in the middle
    const { lastFrame } = render(
      <CommandAutocomplete commands={TEST_COMMANDS} filter="" selectedIndex={5} maxItems={3} />
    );

    // Should show both indicators
    expect(lastFrame()).toContain('more above');
    expect(lastFrame()).toContain('more below');
  });

  it('highlights selected command', () => {
    const { lastFrame } = render(
      <CommandAutocomplete commands={TEST_COMMANDS} filter="c" selectedIndex={1} />
    );

    // Selected item should have different styling (checked by presence in output)
    expect(lastFrame()).toContain('/continue');
  });

  it('handles selectedIndex at 0', () => {
    const { lastFrame } = render(
      <CommandAutocomplete commands={TEST_COMMANDS} filter="" selectedIndex={0} />
    );

    // First item should be rendered (clear)
    expect(lastFrame()).toContain('/clear');
  });

  it('handles selectedIndex beyond filtered list', () => {
    // When selectedIndex is greater than filtered results, component should still render
    const { lastFrame } = render(
      <CommandAutocomplete commands={TEST_COMMANDS} filter="help" selectedIndex={5} />
    );

    expect(lastFrame()).toContain('/help');
  });

  it('shows argument hint for single matching command with hint', () => {
    const commandsWithHint: AutocompleteCommand[] = [
      { name: 'prime', description: 'Prime understanding', argumentHint: '[service-or-repo]' },
      { name: 'help', description: 'Show help' },
    ];

    const { lastFrame } = render(
      <CommandAutocomplete commands={commandsWithHint} filter="prime" selectedIndex={0} />
    );

    expect(lastFrame()).toContain('/prime');
    expect(lastFrame()).toContain('Usage:');
    expect(lastFrame()).toContain('[service-or-repo]');
  });

  it('shows argument hint on exact match', () => {
    const commandsWithHint: AutocompleteCommand[] = [
      { name: 'prime', description: 'Prime understanding', argumentHint: '<target>' },
      { name: 'primed', description: 'Different command' },
    ];

    const { lastFrame } = render(
      <CommandAutocomplete commands={commandsWithHint} filter="prime" selectedIndex={0} />
    );

    // Both commands match filter 'prime', but exact match should show hint
    expect(lastFrame()).toContain('/prime');
    expect(lastFrame()).toContain('/primed');
    expect(lastFrame()).toContain('Usage:');
    expect(lastFrame()).toContain('<target>');
  });

  it('does not show argument hint when no hint defined', () => {
    const commandsNoHint: AutocompleteCommand[] = [{ name: 'help', description: 'Show help' }];

    const { lastFrame } = render(
      <CommandAutocomplete commands={commandsNoHint} filter="help" selectedIndex={0} />
    );

    expect(lastFrame()).toContain('/help');
    expect(lastFrame()).not.toContain('Usage:');
  });

  it('does not show argument hint for multiple non-exact matches', () => {
    const commandsWithHint: AutocompleteCommand[] = [
      { name: 'clear', description: 'Clear screen', argumentHint: '[options]' },
      { name: 'continue', description: 'Continue session', argumentHint: '[id]' },
    ];

    const { lastFrame } = render(
      <CommandAutocomplete commands={commandsWithHint} filter="c" selectedIndex={0} />
    );

    // Multiple matches for 'c', neither is exact, so no hint shown
    expect(lastFrame()).toContain('/clear');
    expect(lastFrame()).toContain('/continue');
    expect(lastFrame()).not.toContain('Usage:');
  });
});
