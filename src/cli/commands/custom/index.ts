/**
 * Custom slash commands module.
 * Provides discovery, parsing, and execution of user-defined commands.
 */

export * from './types.js';
export { parseCustomCommandMd, hasYamlFrontmatter } from './parser.js';
export { CustomCommandLoader, createCustomCommandLoader } from './loader.js';
export {
  executeCustomCommand,
  substituteArguments,
  processFileReferences,
  executeBashContext,
} from './executor.js';

import { CustomCommandLoader } from './loader.js';
import { executeCustomCommand as executeCmd } from './executor.js';
import type { DiscoveredCustomCommand, CustomCommandExecutionResult } from './types.js';
import type { AutocompleteCommandInfo } from '../index.js';
import { getWorkspaceRoot } from '../../../tools/workspace.js';

/** Cached loader instance for performance */
let cachedLoader: CustomCommandLoader | null = null;
let cachedWorkspaceRoot: string | null = null;

/**
 * Get or create a cached loader instance.
 */
function getLoader(workspaceRoot?: string): CustomCommandLoader {
  const workspace = workspaceRoot ?? getWorkspaceRoot();

  // Invalidate cache if workspace changed
  if (cachedLoader === null || cachedWorkspaceRoot !== workspace) {
    cachedLoader = new CustomCommandLoader({ workspaceRoot: workspace });
    cachedWorkspaceRoot = workspace;
  }

  return cachedLoader;
}

/**
 * Clear the cached loader (useful for testing or workspace changes).
 */
export function clearCustomCommandCache(): void {
  cachedLoader = null;
  cachedWorkspaceRoot = null;
}

/**
 * Get custom commands formatted for autocomplete.
 * Returns commands with (project) or (user) suffix in description.
 *
 * @param workspaceRoot - Optional workspace root override
 * @returns Array of autocomplete command info
 */
export async function getCustomCommands(
  workspaceRoot?: string
): Promise<AutocompleteCommandInfo[]> {
  const loader = getLoader(workspaceRoot);
  const { commands, errors } = await loader.discover();

  // Log errors in debug mode
  if (errors.length > 0 && process.env.AGENT_DEBUG !== undefined) {
    for (const error of errors) {
      process.stderr.write(`[DEBUG] Custom command error: ${error.path}: ${error.message}\n`);
    }
  }

  return commands.map((cmd) => {
    // Build description with source and namespace
    let description = cmd.content.manifest.description ?? `Custom command from ${cmd.source}`;

    // Add namespace if present
    if (cmd.namespace !== undefined) {
      description = `${description} (${cmd.source}:${cmd.namespace})`;
    } else {
      description = `${description} (${cmd.source})`;
    }

    return {
      name: cmd.name,
      description,
      argumentHint: cmd.content.manifest.argumentHint,
    };
  });
}

/**
 * Find and execute a custom command by name.
 *
 * @param name - Command name (without leading slash)
 * @param args - Arguments string
 * @param workspaceRoot - Optional workspace root override
 * @returns Execution result with processed prompt or error
 */
export async function findAndExecuteCustomCommand(
  name: string,
  args: string,
  workspaceRoot?: string
): Promise<CustomCommandExecutionResult> {
  const workspace = workspaceRoot ?? getWorkspaceRoot();
  const loader = getLoader(workspace);

  const command = await loader.getCommand(name);

  if (command === null) {
    return {
      success: false,
      error: `Custom command not found: ${name}`,
      type: 'NOT_FOUND',
    };
  }

  return executeCmd(command, args, workspace);
}

/**
 * Check if a custom command exists by name.
 *
 * @param name - Command name (without leading slash)
 * @param workspaceRoot - Optional workspace root override
 * @returns True if command exists
 */
export async function customCommandExists(name: string, workspaceRoot?: string): Promise<boolean> {
  const loader = getLoader(workspaceRoot);
  const command = await loader.getCommand(name);
  return command !== null;
}

/**
 * Get all discovered custom commands.
 *
 * @param workspaceRoot - Optional workspace root override
 * @returns Array of discovered commands
 */
export async function getAllCustomCommands(
  workspaceRoot?: string
): Promise<DiscoveredCustomCommand[]> {
  const loader = getLoader(workspaceRoot);
  const { commands } = await loader.discover();
  return commands;
}
