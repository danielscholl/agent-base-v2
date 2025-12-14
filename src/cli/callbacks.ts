/**
 * Callback factory for CLI components.
 * Creates AgentCallbacks that update React state.
 */

import type { AgentCallbacks } from '../agent/callbacks.js';
import type { AgentErrorResponse } from '../errors/index.js';

/**
 * State setters for callback wiring.
 * These are called by callbacks to update component state.
 */
export interface CallbackState {
  /** Set the spinner message (null to hide) */
  setSpinnerMessage: (message: string | null) => void;
  /** Set processing state */
  setIsProcessing: (value: boolean) => void;
  /** Append text to streaming output */
  appendToOutput: (text: string) => void;
  /** Set error state (null to clear) */
  setError: (error: AgentErrorResponse | null) => void;
  /** Called when agent finishes with final answer */
  onComplete?: (answer: string) => void;
}

/**
 * Options for callback factory.
 */
export interface CallbackFactoryOptions {
  /** Enable verbose/debug logging */
  verbose?: boolean;
}

/**
 * Create AgentCallbacks that update React state.
 * Centralizes callback creation for consistent behavior across CLI components.
 *
 * @param state - State setters from component
 * @param options - Factory options
 * @returns AgentCallbacks wired to update state
 */
export function createCallbacks(
  state: CallbackState,
  options: CallbackFactoryOptions = {}
): AgentCallbacks {
  const { verbose = false } = options;

  return {
    onSpinnerStart: (message) => {
      state.setSpinnerMessage(message);
      state.setIsProcessing(true);
    },

    onSpinnerStop: () => {
      state.setSpinnerMessage(null);
      state.setIsProcessing(false);
    },

    onLLMStream: (_ctx, chunk) => {
      state.appendToOutput(chunk);
    },

    onAgentEnd: (_ctx, answer) => {
      state.setIsProcessing(false);
      state.onComplete?.(answer);
    },

    onError: (_ctx, error) => {
      state.setError(error);
      state.setIsProcessing(false);
    },

    onDebug: (message, data) => {
      if (verbose || process.env.AGENT_DEBUG !== undefined) {
        process.stderr.write(
          `[DEBUG] ${message} ${data !== undefined ? JSON.stringify(data) : ''}\n`
        );
      }
    },

    onTrace: (message, data) => {
      if (verbose && process.env.AGENT_TRACE !== undefined) {
        process.stderr.write(
          `[TRACE] ${message} ${data !== undefined ? JSON.stringify(data) : ''}\n`
        );
      }
    },
  };
}
