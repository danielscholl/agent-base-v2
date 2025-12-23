/**
 * Header component for CLI shell.
 * Displays banner with version and model information.
 * Path and divider are handled by PromptDivider before each prompt.
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
  /** Current working directory (unused, kept for API compatibility) */
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
 * Header banner component.
 * Shows title, version, model information, and a divider to start the chat session.
 */
export function Header({ version, model, provider }: HeaderProps): React.ReactElement {
  const { stdout } = useStdout();
  const [termWidth, setTermWidth] = useState(stdout.columns - 2);

  useEffect(() => {
    const handleResize = (): void => {
      setTermWidth(stdout.columns - 2);
    };
    stdout.on('resize', handleResize);
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  // Build version/model info
  const providerDisplay = provider !== undefined ? getProviderDisplayName(provider) : '';
  const modelDisplay = model ?? '';
  const versionModel =
    providerDisplay !== '' && modelDisplay !== ''
      ? `Version ${version} • ${providerDisplay}/${modelDisplay}`
      : `Version ${version}`;

  // Create divider line
  const divider = '─'.repeat(Math.max(10, termWidth));

  return (
    <Box flexDirection="column">
      {/* Title */}
      <Text bold>Agent - Conversational Assistant</Text>

      {/* Version and model info */}
      <Text dimColor>{versionModel}</Text>

      {/* Divider to indicate chat session start */}
      <Text dimColor>{divider}</Text>
    </Box>
  );
}
