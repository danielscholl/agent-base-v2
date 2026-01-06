/**
 * Command registry and dispatcher.
 */

import type { CommandDefinition, CommandHandler, CommandContext, CommandResult } from './types.js';
import {
  COMMAND_EXIT,
  COMMAND_HELP,
  COMMAND_CLEAR,
  COMMAND_SAVE,
  COMMAND_RESUME,
  COMMAND_TELEMETRY,
  matchesCommand,
  isShellCommand,
  isSlashCommand,
  extractShellCommand,
} from '../constants.js';

import { helpHandler } from './help.js';
import { clearHandler } from './clear.js';
import { exitHandler } from './exit.js';
import { telemetryHandler } from './telemetry.js';
import { shellHandler } from './shell.js';
import { saveHandler, resumeHandler } from './session.js';
import { getCustomCommands, findAndExecuteCustomCommand } from './custom/index.js';

// CLI-only handlers (not interactive commands)
export { sessionsHandler, purgeHandler } from './session.js';

// Note: configHandler and skillHandler are exported for CLI subcommand use,
// but are no longer registered as interactive commands (use `agent config` / `agent skill` instead)
export { configHandler } from './config.js';
export { skillHandler } from './skills.js';

export type { CommandDefinition, CommandHandler, CommandContext, CommandResult };
export {
  helpHandler,
  clearHandler,
  exitHandler,
  telemetryHandler,
  shellHandler,
  saveHandler,
  resumeHandler,
};

/** All registered commands */
export const COMMANDS: CommandDefinition[] = [
  {
    aliases: COMMAND_EXIT,
    description: 'Exit the shell',
    handler: exitHandler,
  },
  {
    aliases: COMMAND_HELP,
    description: 'Show help message',
    handler: helpHandler,
  },
  {
    aliases: COMMAND_CLEAR,
    description: 'Clear screen and history',
    handler: clearHandler,
  },
  {
    aliases: COMMAND_SAVE,
    description: 'Save current session',
    handler: saveHandler,
    usage: '/save [name]',
  },
  {
    aliases: COMMAND_RESUME,
    description: 'Resume a saved session',
    handler: resumeHandler,
    usage: '/resume [session-id]',
  },
  {
    aliases: COMMAND_TELEMETRY,
    description: 'Manage telemetry dashboard',
    handler: telemetryHandler,
    usage: '/telemetry [start|stop|status|url]',
  },
];

/**
 * Find a command handler for the given input.
 * Returns undefined if input is not a recognized command.
 */
export function findCommand(input: string): CommandDefinition | undefined {
  const normalized = input.trim().toLowerCase();
  const [baseCmd] = normalized.split(/\s+/);

  if (baseCmd === undefined || baseCmd === '') return undefined;

  return COMMANDS.find((cmd) => matchesCommand(baseCmd, cmd.aliases));
}

/**
 * Extract arguments from command input.
 */
export function extractArgs(input: string): string {
  const trimmed = input.trim();
  const firstSpace = trimmed.indexOf(' ');
  return firstSpace > 0 ? trimmed.slice(firstSpace + 1).trim() : '';
}

/**
 * Execute a command and return the result.
 * Returns undefined if input is not a command.
 */
export async function executeCommand(
  input: string,
  context: CommandContext
): Promise<CommandResult | undefined> {
  // Handle shell commands (! prefix)
  if (isShellCommand(input)) {
    const command = extractShellCommand(input);
    return shellHandler(command, context);
  }

  // Find matching built-in command
  const command = findCommand(input);
  if (command !== undefined) {
    // Extract arguments and execute
    const args = extractArgs(input);
    return command.handler(args, context);
  }

  // Handle slash commands - try custom commands before showing unknown error
  if (isSlashCommand(input)) {
    const cmdName = input.trim().split(/\s+/)[0]?.slice(1) ?? ''; // Remove leading /
    const args = extractArgs(input);

    // Try to execute as custom command
    const customResult = await findAndExecuteCustomCommand(cmdName, args);

    if (customResult.success) {
      // Return the prompt to be injected into the agent
      return {
        success: true,
        customCommandPrompt: customResult.prompt,
        customCommandName: customResult.commandName,
      };
    }

    // Custom command not found - show error
    if (customResult.type === 'NOT_FOUND') {
      context.onOutput(
        `Unknown command: /${cmdName}. Type /help for available commands.`,
        'warning'
      );
      return { success: false, message: `Unknown command: /${cmdName}` };
    }

    // Custom command execution error
    context.onOutput(`Command error: ${customResult.error}`, 'error');
    return { success: false, message: customResult.error };
  }

  // Not a command - let caller pass to agent
  return undefined;
}

/**
 * Check if input is a command (starts with / or ! or matches alias).
 * All slash commands are treated as commands (unknown ones show error).
 */
export function isCommand(input: string): boolean {
  if (isShellCommand(input)) return true;
  if (isSlashCommand(input)) return true;
  return findCommand(input) !== undefined;
}

/**
 * Command info for autocomplete display.
 */
export interface AutocompleteCommandInfo {
  /** Command name (without leading slash) */
  name: string;
  /** Brief description */
  description: string;
  /** Optional argument hint (e.g., "[filepath]" or "<required-arg>") */
  argumentHint?: string;
}

/**
 * Get all commands formatted for autocomplete (sync version).
 * Returns unique command names (using first alias that starts with /).
 * Does NOT include custom commands - use getAutocompleteCommandsAsync for that.
 */
export function getAutocompleteCommands(): AutocompleteCommandInfo[] {
  const commands: AutocompleteCommandInfo[] = [];

  for (const cmd of COMMANDS) {
    // Find the primary slash command alias
    const slashAlias = cmd.aliases.find((a) => a.startsWith('/'));
    if (slashAlias !== undefined) {
      // Remove leading slash for display
      commands.push({
        name: slashAlias.slice(1),
        description: cmd.description,
      });
    }
  }

  // Sort alphabetically by name
  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get all commands formatted for autocomplete (async version).
 * Includes both built-in commands and custom commands from .agent/commands/.
 *
 * @param workspaceRoot - Optional workspace root override
 * @returns Promise resolving to sorted array of autocomplete command info
 */
export async function getAutocompleteCommandsAsync(
  workspaceRoot?: string
): Promise<AutocompleteCommandInfo[]> {
  // Get built-in commands
  const builtIn = getAutocompleteCommands();

  // Get custom commands
  const custom = await getCustomCommands(workspaceRoot);

  // Merge and deduplicate (built-in commands take priority)
  const builtInNames = new Set(builtIn.map((c) => c.name));
  const uniqueCustom = custom.filter((c) => !builtInNames.has(c.name));

  // Combine and sort
  const all = [...builtIn, ...uniqueCustom];
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

// Re-export custom command utilities for external use
export { clearCustomCommandCache, getCustomCommands } from './custom/index.js';
