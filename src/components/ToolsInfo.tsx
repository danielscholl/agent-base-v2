/**
 * ToolsInfo component.
 * Displays available tools from ToolRegistry with descriptions and token counts.
 */

import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import { Tiktoken } from 'js-tiktoken/lite';
import cl100k_base from 'js-tiktoken/ranks/cl100k_base';
import { loadConfig } from '../config/manager.js';
import { Spinner } from './Spinner.js';
import {
  ToolRegistry,
  type ToolPermission,
  getWorkspaceRoot,
  isFilesystemWritesEnabled,
  DEFAULT_MAX_READ_BYTES,
  DEFAULT_MAX_WRITE_BYTES,
} from '../tools/index.js';

/**
 * Tool info for display.
 */
interface ToolDisplayInfo {
  name: string;
  description: string;
  permissions: ToolPermission[];
}

/**
 * Tool group for display.
 */
interface ToolGroup {
  name: string;
  tools: ToolDisplayInfo[];
  metadata?: string[];
}

/**
 * Shared tiktoken encoder instance.
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
 * Permission display names.
 */
const permissionNames: Record<ToolPermission, string> = {
  read: 'Read Tools',
  write: 'Write Tools',
  execute: 'Execute Tools',
  network: 'Network Tools',
};

/**
 * Build tool groups from registry, grouped by primary permission.
 */
async function buildToolGroups(): Promise<ToolGroup[]> {
  const workspaceRoot = getWorkspaceRoot();
  const writesEnabled = isFilesystemWritesEnabled();

  // Initialize all tools to get their descriptions
  const toolIds = ToolRegistry.ids();
  const toolInfos: ToolDisplayInfo[] = [];

  for (const id of toolIds) {
    const initialized = await ToolRegistry.initialize(id, {
      workingDir: process.cwd(),
    });
    const permissions = ToolRegistry.permissions(id);

    if (initialized && permissions) {
      toolInfos.push({
        name: id,
        description: initialized.description,
        permissions: permissions.required,
      });
    }
  }

  // Group by primary permission
  const groupMap = new Map<ToolPermission, ToolDisplayInfo[]>();

  for (const tool of toolInfos) {
    const primaryPermission = tool.permissions[0] ?? 'read';
    const group = groupMap.get(primaryPermission) ?? [];
    group.push(tool);
    groupMap.set(primaryPermission, group);
  }

  // Build groups with metadata
  const groups: ToolGroup[] = [];

  // Order: read, write, execute, network
  const order: ToolPermission[] = ['read', 'write', 'execute', 'network'];

  for (const permission of order) {
    const tools = groupMap.get(permission);
    if (tools && tools.length > 0) {
      const group: ToolGroup = {
        name: permissionNames[permission],
        tools: tools.sort((a, b) => a.name.localeCompare(b.name)),
      };

      // Add metadata for read tools (workspace info)
      if (permission === 'read') {
        group.metadata = [`Workspace: ${workspaceRoot} (cwd)`];
      }

      // Add metadata for write tools
      if (permission === 'write') {
        group.metadata = [
          `Writes: ${writesEnabled ? 'Enabled' : 'Disabled'} · Read: ${formatBytes(DEFAULT_MAX_READ_BYTES)} · Write: ${formatBytes(DEFAULT_MAX_WRITE_BYTES)}`,
        ];
      }

      groups.push(group);
    }
  }

  return groups;
}

/**
 * ToolsInfo component.
 * Lists registered tools from ToolRegistry with descriptions and token counts.
 */
export function ToolsInfo(): React.ReactElement {
  const { exit } = useApp();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<ToolGroup[]>([]);

  useEffect(() => {
    async function loadTools(): Promise<void> {
      // Load config to ensure environment is initialized
      await loadConfig();

      // Build tool groups from registry
      const toolGroups = await buildToolGroups();
      setGroups(toolGroups);
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

  const totalTools = groups.reduce((sum, g) => sum + g.tools.length, 0);

  return (
    <Box flexDirection="column" paddingTop={1}>
      <Text>
        <Text bold>Tool Registry</Text>
        <Text dimColor> · {String(totalTools)} tools registered</Text>
      </Text>
      <Text> </Text>

      {groups.map((group, gIndex) => (
        <Box
          key={group.name}
          flexDirection="column"
          marginBottom={gIndex < groups.length - 1 ? 1 : 0}
        >
          {/* Group header */}
          <Text>
            <Text color="green">●</Text>
            <Text bold> {group.name}</Text>
            <Text dimColor> · {String(group.tools.length)} tools</Text>
          </Text>

          {/* Group metadata */}
          {group.metadata !== undefined &&
            group.metadata.map((meta, metaIndex) => (
              <Text key={metaIndex}>
                <Text dimColor>└─ </Text>
                <Text color="green">◉</Text>
                <Text> {meta}</Text>
              </Text>
            ))}

          {/* Individual tools */}
          {group.tools.map((tool) => {
            const tokenCount = countTokens(tool.description);
            return (
              <Text key={tool.name}>
                <Text> </Text>
                <Text dimColor>• </Text>
                <Text color="cyan">{tool.name}</Text>
                <Text dimColor> · {String(tokenCount)} tokens</Text>
              </Text>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
