/**
 * Header component for CLI shell.
 * Displays banner with version, model, and context information.
 * Styled to match osdu-agent.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';

/**
 * Props for Header component.
 */
export interface HeaderProps {
  /** Framework version */
  version: string;
  /** Current model name */
  model?: string;
  /** Current provider name */
  provider?: string;
  /** Current working directory */
  cwd?: string;
}

/**
 * Get provider display name.
 */
function getProviderDisplayName(provider: string): string {
  const names: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    azure: 'Azure OpenAI',
    foundry: 'Azure AI Foundry',
    gemini: 'Google Gemini',
    github: 'GitHub Models',
    local: 'Local',
  };
  return names[provider] ?? provider;
}

/**
 * Format path for display (shorten home directory).
 */
function formatPath(path: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  if (home !== '' && path.startsWith(home)) {
    return '~' + path.slice(home.length);
  }
  return path;
}

/**
 * Truncate text with ellipsis if it exceeds maxLength.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  if (maxLength <= 3) return maxLength >= 3 ? '...' : '';
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Side padding from InteractiveShell's padding={1}.
 * Must match the padding prop value.
 */
const SHELL_SIDE_PADDING = 1;

/**
 * Total horizontal padding (left + right).
 */
const SHELL_PADDING = SHELL_SIDE_PADDING * 2;

/**
 * Hook to get terminal width with resize support.
 * Clears the screen on resize to prevent visual artifacts.
 * Returns usable width accounting for shell padding.
 */
function useTerminalWidth(): number {
  const { stdout } = useStdout();
  // Account for shell padding (left + right sides)
  const getUsableWidth = (): number => Math.max(stdout.columns - SHELL_PADDING, 40);
  const [width, setWidth] = useState(getUsableWidth);

  useEffect(() => {
    const handleResize = (): void => {
      // Clear terminal and move cursor to home position
      // This prevents visual artifacts when Ink re-renders
      stdout.write('\x1b[2J\x1b[H');
      setWidth(Math.max(stdout.columns - SHELL_PADDING, 40));
    };

    stdout.on('resize', handleResize);
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  return width;
}

/**
 * Header banner component.
 * Shows title, version, model, and current directory.
 */
export function Header({ version, model, provider, cwd }: HeaderProps): React.ReactElement {
  const termWidth = useTerminalWidth();

  // Build version/model info
  const providerDisplay = provider !== undefined ? getProviderDisplayName(provider) : '';
  const modelDisplay = model ?? '';
  const versionModel =
    providerDisplay !== '' && modelDisplay !== ''
      ? `Version ${version} • ${providerDisplay}/${modelDisplay}`
      : `Version ${version}`;

  // Build context info (cwd), truncating path if needed
  // Calculate available space: termWidth - versionModel - 2 spaces minimum gap
  const minGap = 2;
  const availableForPath = termWidth - versionModel.length - minGap;
  const rawPath = cwd !== undefined ? formatPath(cwd) : '';
  const contextInfo = availableForPath > 10 ? truncate(rawPath, availableForPath) : '';

  // Create divider line
  const divider = '─'.repeat(termWidth);

  return (
    <Box flexDirection="column">
      {/* Title */}
      <Text bold>Agent - Conversational Assistant</Text>

      {/* Version and model info, with context on the right */}
      <Box justifyContent="space-between" width={termWidth}>
        <Text dimColor>{versionModel}</Text>
        {contextInfo !== '' && <Text dimColor>{contextInfo}</Text>}
      </Box>

      {/* Divider line */}
      <Text dimColor>{divider}</Text>
    </Box>
  );
}
