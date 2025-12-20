/**
 * CLI command aliases and exit codes.
 * Mirrors Python agent-base/src/agent/cli/constants.py
 */

/** Command aliases - multiple strings map to same command */
export const COMMAND_EXIT = ['exit', 'quit', 'q', '/exit', '/quit'] as const;
export const COMMAND_HELP = ['help', '?', '/help'] as const;
export const COMMAND_CLEAR = ['clear', '/clear'] as const;
export const COMMAND_HISTORY = ['/history'] as const;
export const COMMAND_TELEMETRY = ['/telemetry', '/aspire'] as const;
export const COMMAND_SAVE = ['/save'] as const;
export const COMMAND_SESSIONS = ['/sessions'] as const;
export const COMMAND_RESUME = ['/resume'] as const;
export const COMMAND_PURGE = ['/purge'] as const;
export const COMMAND_CONTINUE = ['/continue'] as const;
export const COMMAND_CONFIG = ['/config'] as const;
export const COMMAND_SKILL = ['/skill', '/skills'] as const;

/** Shell command prefix */
export const SHELL_PREFIX = '!' as const;

/** Standard exit codes */
export const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  CONFIG_ERROR: 2,
  INTERRUPTED: 130,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/**
 * Check if input matches a command set.
 * Case-insensitive comparison after trimming whitespace.
 */
export function matchesCommand(input: string, commands: readonly string[]): boolean {
  const normalized = input.trim().toLowerCase();
  return commands.includes(normalized);
}

/**
 * Check if input is a shell command (starts with !).
 */
export function isShellCommand(input: string): boolean {
  return input.trim().startsWith(SHELL_PREFIX);
}

/**
 * Check if input is a slash command (starts with / but not //).
 * Double slash (//) is an escape to send literal slash messages.
 */
export function isSlashCommand(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith('/') && !trimmed.startsWith('//');
}

/**
 * Check if input is an escaped slash (starts with //).
 * Returns the unescaped content (single /).
 */
export function unescapeSlash(input: string): string | undefined {
  const trimmed = input.trim();
  if (trimmed.startsWith('//')) {
    return trimmed.slice(1); // Remove one slash, keep the rest
  }
  return undefined;
}

/**
 * Extract shell command (without ! prefix).
 */
export function extractShellCommand(input: string): string {
  return input.trim().slice(1).trim();
}
