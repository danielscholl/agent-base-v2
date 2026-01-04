/**
 * Command handler interfaces and types.
 */

import type { AppConfig } from '../../config/schema.js';
import type { StoredMessage } from '../../utils/message-history.js';
import type { SessionMetadata } from '../../utils/session.js';

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
  /** Whether to save the current session */
  shouldSaveSession?: boolean;
  /** Session name for save operation */
  sessionName?: string;
  /** Session ID to resume */
  sessionToResume?: string;
  /** Restored session messages for resume operation */
  sessionMessages?: StoredMessage[];
  /** Context summary for resumed session */
  sessionContextSummary?: string;
  /** Whether to list saved sessions */
  shouldListSessions?: boolean;
  /** Whether to show interactive session selector */
  shouldShowSessionSelector?: boolean;
  /** Available sessions for interactive selection */
  availableSessions?: SessionMetadata[];
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
  /** Whether running in interactive mode (vs CLI) */
  isInteractive?: boolean;
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
