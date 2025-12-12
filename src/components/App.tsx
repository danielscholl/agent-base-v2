import React from 'react';
import { Text, Box } from 'ink';

/**
 * Root application component for the agent framework.
 * Displays version info and framework stack details.
 */
export function App(): React.ReactElement {
  return (
    <Box flexDirection="column" padding={1}>
      <Text color="green" bold>
        Agent Framework v2
      </Text>
      <Text>Hello, World!</Text>
      <Text dimColor>TypeScript + Bun + React + Ink</Text>
    </Box>
  );
}
