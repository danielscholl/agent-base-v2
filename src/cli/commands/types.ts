/**
 * Command handler interfaces and types.
 */

import type { AppConfig } from '../../config/schema.js';

/** Result of a command execution */
export interface CommandResult {
  /** Whether command executed successfully */
  success: boolean;
  /** Message to display to user */
  message?: string;
  /** Whether to exit the shell after this command */
  shouldExit?: boolean;
  /** Whether to clear the screen */
  shouldClear?: boolean;
  /** Whether to clear the conversation history */
  shouldClearHistory?: boolean;
  /** Additional data from command */
  data?: unknown;
}

/** Context passed to command handlers */
export interface CommandContext {
  /** Current app configuration */
  config: AppConfig | null;
  /** Callback to display output */
  onOutput: (content: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  /** Callback for interactive prompts */
  onPrompt?: (question: string) => Promise<string>;
  /** Exit the shell */
  exit: () => void;
}

/** Command handler function signature */
export type CommandHandler = (args: string, context: CommandContext) => Promise<CommandResult>;

/** Command definition with metadata */
export interface CommandDefinition {
  /** Command aliases that trigger this handler */
  aliases: readonly string[];
  /** Brief description for help */
  description: string;
  /** Handler function */
  handler: CommandHandler;
  /** Whether command requires arguments */
  requiresArgs?: boolean;
  /** Usage example */
  usage?: string;
}
