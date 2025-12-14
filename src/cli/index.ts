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

// Callback utilities
export { createCallbacks } from './callbacks.js';
export type { CallbackState, CallbackFactoryOptions } from './callbacks.js';

// Version
export { VERSION } from './version.js';
