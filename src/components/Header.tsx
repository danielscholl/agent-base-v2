/**
 * Header component for CLI shell.
 * Displays banner with version, model, and context information.
 * Styled to match osdu-agent.
 */

import React from 'react';
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
  /** Current git branch */
  gitBranch?: string;
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
 * Header banner component.
 * Shows title, version, model, current directory, and git branch.
 */
export function Header({
  version,
  model,
  provider,
  cwd,
  gitBranch,
}: HeaderProps): React.ReactElement {
  const { stdout } = useStdout();
  const termWidth = stdout.columns;

  // Build version/model info
  const providerDisplay = provider !== undefined ? getProviderDisplayName(provider) : '';
  const modelDisplay = model ?? '';
  const versionModel =
    providerDisplay !== '' && modelDisplay !== ''
      ? `Version ${version} • ${providerDisplay}/${modelDisplay}`
      : `Version ${version}`;

  // Build context info (cwd + git branch)
  const pathDisplay = cwd !== undefined ? formatPath(cwd) : '';
  const branchDisplay = gitBranch !== undefined && gitBranch !== '' ? ` [⎇ ${gitBranch}]` : '';
  const contextInfo = pathDisplay + branchDisplay;

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
