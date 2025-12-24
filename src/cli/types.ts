/**
 * CLI type definitions for the agent framework.
 * Defines interfaces for CLI flags and component props.
 */

import type { Message } from '../agent/types.js';

/**
 * CLI flags parsed from command line arguments.
 * These map to meow options in src/index.tsx.
 */
export interface CLIFlags {
  /** Single prompt to execute (non-interactive mode) */
  prompt?: string;
  /** Show configuration and connectivity status */
  check?: boolean;
  /** Show available tools */
  tools?: boolean;
  /** Show version information */
  version?: boolean;
  /** Override LLM provider */
  provider?: string;
  /** Override model name */
  model?: string;
  /** Resume previous session */
  continue?: boolean;
  /** Enable verbose/debug output */
  verbose?: boolean;
}

/**
 * Props for the CLI router component.
 */
export interface CLIProps {
  /** Parsed CLI flags */
  flags: CLIFlags;
}

/**
 * Props for SinglePrompt component.
 */
export interface SinglePromptProps {
  /** The prompt to execute */
  prompt: string;
  /** Enable verbose output */
  verbose?: boolean;
  /** Optional initial history for context continuation */
  initialHistory?: Message[];
}

/**
 * Props for InteractiveShell component.
 */
export interface InteractiveShellProps {
  /** Whether to resume the previous session */
  resumeSession?: boolean;
  /** Enable verbose output (shows detailed tool history) */
  verbose?: boolean;
}

/**
 * State for interactive shell.
 */
export interface ShellState {
  /** User input buffer */
  input: string;
  /** Whether agent is processing */
  isProcessing: boolean;
  /** Current spinner message */
  spinnerMessage: string | null;
  /** Current streaming output */
  streamingOutput: string;
  /** Conversation history */
  messages: ShellMessage[];
}

/**
 * A message in the shell conversation.
 */
export interface ShellMessage {
  /** Message role */
  role: 'user' | 'assistant' | 'system';
  /** Message content */
  content: string;
  /** Timestamp */
  timestamp: Date;
}
