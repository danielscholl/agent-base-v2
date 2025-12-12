import React, { useEffect } from 'react';
import { render, Text, Box, useApp } from 'ink';

/**
 * Minimal Ink application entry point.
 * Validates the React 19 + Ink 6 setup works correctly.
 */
function App(): React.ReactElement {
  const { exit } = useApp();

  useEffect(() => {
    // Exit cleanly after initial render (non-interactive demo mode)
    exit();
  }, [exit]);

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

const { waitUntilExit } = render(<App />);
await waitUntilExit();
