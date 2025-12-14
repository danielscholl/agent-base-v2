/**
 * ToolsInfo component.
 * Displays available tools with descriptions.
 * Placeholder for full tool registry integration (Feature 10).
 */

import React, { useEffect } from 'react';
import { Box, Text, useApp } from 'ink';

/**
 * Tool information for display.
 */
interface ToolInfo {
  name: string;
  description: string;
}

/**
 * Built-in tools (placeholder - actual tools loaded from registry in Feature 10).
 */
const BUILTIN_TOOLS: ToolInfo[] = [
  {
    name: 'hello',
    description: 'Greet someone by name',
  },
];

/**
 * ToolsInfo component.
 * Lists registered tools with their descriptions.
 */
export function ToolsInfo(): React.ReactElement {
  const { exit } = useApp();

  useEffect(() => {
    // Exit after displaying tools
    const timer = setTimeout(() => {
      exit();
    }, 100);
    return () => {
      clearTimeout(timer);
    };
  }, [exit]);

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="green" bold>
        Available Tools
      </Text>
      <Text dimColor>─────────────────────────</Text>
      {BUILTIN_TOOLS.length === 0 ? (
        <Text dimColor>No tools registered</Text>
      ) : (
        BUILTIN_TOOLS.map((tool) => (
          <Box key={tool.name} gap={1}>
            <Text color="cyan">{tool.name}</Text>
            <Text dimColor>- {tool.description}</Text>
          </Box>
        ))
      )}
      <Box marginTop={1}>
        <Text dimColor>Use skills to add more tools to the agent.</Text>
      </Box>
    </Box>
  );
}
