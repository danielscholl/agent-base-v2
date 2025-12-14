/**
 * Header component for CLI shell.
 * Displays banner with version and model information.
 */

import React from 'react';
import { Box, Text } from 'ink';

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
}

/**
 * Header banner component.
 * Shows framework version and active model/provider.
 */
export function Header({ version, model, provider }: HeaderProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="green" bold>
        Agent Framework v{version}
      </Text>
      {model !== undefined && provider !== undefined && (
        <Text dimColor>
          Model: {provider}/{model}
        </Text>
      )}
    </Box>
  );
}
