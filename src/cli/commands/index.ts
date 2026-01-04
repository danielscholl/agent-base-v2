/**
 * Command registry and dispatcher.
 */

import type { CommandDefinition, CommandHandler, CommandContext, CommandResult } from './types.js';
import {
  COMMAND_EXIT,
  COMMAND_HELP,
  COMMAND_CLEAR,
  COMMAND_TELEMETRY,
  COMMAND_SAVE,
  COMMAND_RESUME,
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
    aliases: COMMAND_TELEMETRY,
    description: 'Manage telemetry dashboard',
    handler: telemetryHandler,
    usage: '/telemetry [start|stop|status|url]',
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

  // Find matching command
  const command = findCommand(input);
  if (command !== undefined) {
    // Extract arguments and execute
    const args = extractArgs(input);
    return command.handler(args, context);
  }

  // Handle unknown slash commands - don't pass to agent
  if (isSlashCommand(input)) {
    const cmdName = input.trim().split(/\s+/)[0] ?? input.trim();
    context.onOutput(`Unknown command: ${cmdName}. Type /help for available commands.`, 'warning');
    return { success: false, message: `Unknown command: ${cmdName}` };
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
}

/**
 * Get all commands formatted for autocomplete.
 * Returns unique command names (using first alias that starts with /).
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
