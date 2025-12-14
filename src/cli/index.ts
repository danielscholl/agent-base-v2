/**
 * CLI module exports.
 * Public API for CLI types and utilities.
 */

// Types
export type {
  CLIFlags,
  CLIProps,
  SinglePromptProps,
  InteractiveShellProps,
  ShellState,
  ShellMessage,
} from './types.js';

// Constants
export * from './constants.js';

// Callback utilities
export { createCallbacks } from './callbacks.js';
export type { CallbackState, CallbackFactoryOptions } from './callbacks.js';

// Commands
export { executeCommand, isCommand, findCommand, COMMANDS } from './commands/index.js';
export type {
  CommandResult,
  CommandContext,
  CommandHandler,
  CommandDefinition,
} from './commands/types.js';

// Input
export { InputHistory } from './input/index.js';
export type { InputState, KeyboardShortcut, InputResult } from './input/types.js';

// Version
export { VERSION } from './version.js';
