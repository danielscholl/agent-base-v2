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
  /** Add active tool to tracking (id from SpanContext.spanId) */
  addActiveTask?: (id: string, name: string, args?: Record<string, unknown>) => void;
  /**
   * Mark tool as completed by id.
   * Note: The duration parameter is ignored by the implementation - actual duration is calculated
   * internally from the startTime stored when addActiveTask was called.
   */
  completeTask?: (
    id: string,
    name: string,
    success: boolean,
    duration: number,
    error?: string
  ) => void;
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
      // Only control spinner message, not processing state
      // Processing state is managed by component (set on submit, cleared on end/error)
      state.setSpinnerMessage(message);
    },

    onSpinnerStop: () => {
      // Only clear spinner message, not processing state
      // This allows streaming to continue after spinner stops
      state.setSpinnerMessage(null);
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

    onToolStart: (ctx, toolName, args) => {
      // Use spanId as unique identifier for concurrent tool calls
      state.addActiveTask?.(ctx.spanId, toolName, args);
    },

    onToolEnd: (ctx, toolName, result) => {
      const success = result.success;
      const error = !success && 'message' in result ? result.message : undefined;
      // Duration is calculated in the component from startTime
      state.completeTask?.(ctx.spanId, toolName, success, 0, error);
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
