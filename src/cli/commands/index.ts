/**
 * Command registry and dispatcher.
 */

import type { CommandDefinition, CommandHandler, CommandContext, CommandResult } from './types.js';
import {
  COMMAND_EXIT,
  COMMAND_HELP,
  COMMAND_CLEAR,
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

export type { CommandDefinition, CommandHandler, CommandContext, CommandResult };
export { helpHandler, clearHandler, exitHandler, telemetryHandler, shellHandler };

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
