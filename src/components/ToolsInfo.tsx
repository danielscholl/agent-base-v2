/**
 * ToolsInfo component.
 * Displays available tools grouped by toolset with descriptions and token counts.
 * Follows osdu-agent CLI style.
 */

import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { Tiktoken } from 'js-tiktoken/lite';
import cl100k_base from 'js-tiktoken/ranks/cl100k_base';
import { loadConfig } from '../config/manager.js';
import { Spinner } from './Spinner.js';

// Import tools
import {
  getPathInfoTool,
  listDirectoryTool,
  readFileTool,
  searchTextTool,
  writeFileTool,
  applyTextEditTool,
  createDirectoryTool,
  applyFilePatchTool,
  getWorkspaceRoot,
  isFilesystemWritesEnabled,
  DEFAULT_MAX_READ_BYTES,
  DEFAULT_MAX_WRITE_BYTES,
} from '../tools/index.js';
import { helloWorldTool, greetUserTool } from '../tools/hello.js';

/**
 * Toolset metadata for display.
 */
interface ToolsetMeta {
  name: string;
  tools: StructuredToolInterface[];
  metadata?: string[];
}

/**
 * Shared tiktoken encoder instance.
 * Intentionally a module-level singleton for performance - tiktoken encoding is
 * stateless, so a single encoder instance can safely be reused across all tool
 * descriptions. Lazy initialization is unnecessary as the cost is minimal and
 * this component is only loaded when explicitly displaying tool information.
 */
const tokenEncoder = new Tiktoken(cl100k_base);

/**
 * Count tokens in a string using tiktoken.
 */
function countTokens(text: string): number {
  const tokens = tokenEncoder.encode(text);
  return tokens.length;
}

/**
 * Format bytes as human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)}KB`;
  }
  return `${String(bytes)}B`;
}

/**
 * Build toolsets with metadata.
 */
function buildToolsets(): ToolsetMeta[] {
  const workspaceRoot = getWorkspaceRoot();
  const writesEnabled = isFilesystemWritesEnabled();

  const toolsets: ToolsetMeta[] = [
    {
      name: 'FileSystemTools',
      tools: [
        getPathInfoTool,
        listDirectoryTool,
        readFileTool,
        searchTextTool,
        writeFileTool,
        applyTextEditTool,
        createDirectoryTool,
        applyFilePatchTool,
      ],
      metadata: [
        `Workspace: ${workspaceRoot} (cwd)`,
        `Writes: ${writesEnabled ? 'Enabled' : 'Disabled'} · Read: ${formatBytes(DEFAULT_MAX_READ_BYTES)} · Write: ${formatBytes(DEFAULT_MAX_WRITE_BYTES)}`,
      ],
    },
    {
      name: 'HelloTools',
      tools: [helloWorldTool, greetUserTool],
      metadata: ['Reference implementation for tool development'],
    },
  ];

  return toolsets;
}

/**
 * ToolsInfo component.
 * Lists registered tools grouped by toolset with descriptions and token counts.
 */
export function ToolsInfo(): React.ReactElement {
  const { exit } = useApp();
  const [loading, setLoading] = useState(true);
  const [toolsets, setToolsets] = useState<ToolsetMeta[]>([]);

  useEffect(() => {
    async function loadTools(): Promise<void> {
      // Load config to ensure environment is initialized
      await loadConfig();

      // Build toolsets
      const allToolsets = buildToolsets();
      setToolsets(allToolsets);
      setLoading(false);

      // Exit after displaying tools
      setTimeout(() => {
        exit();
      }, 100);
    }

    void loadTools();
  }, [exit]);

  if (loading) {
    return <Spinner message="Loading tools..." />;
  }

  return (
    <Box flexDirection="column" paddingTop={1}>
      {toolsets.map((toolset, tsIndex) => (
        <Box
          key={toolset.name}
          flexDirection="column"
          marginBottom={tsIndex < toolsets.length - 1 ? 1 : 0}
        >
          {/* Toolset header */}
          <Text>
            <Text color="green">●</Text>
            <Text bold> {toolset.name}</Text>
            <Text dimColor> · {toolset.tools.length} tools</Text>
          </Text>

          {/* Toolset metadata */}
          {toolset.metadata !== undefined &&
            toolset.metadata.map((meta, metaIndex) => (
              <Text key={metaIndex}>
                <Text dimColor>└─ </Text>
                <Text color="green">◉</Text>
                <Text> {meta}</Text>
              </Text>
            ))}

          {/* Individual tools */}
          {toolset.tools.map((tool) => {
            const tokenCount = countTokens(tool.description);
            return (
              <Text key={tool.name}>
                <Text> </Text>
                <Text dimColor>• </Text>
                <Text color="cyan">{tool.name}</Text>
                <Text dimColor> · {tokenCount} tokens</Text>
              </Text>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
