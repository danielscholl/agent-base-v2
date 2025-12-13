/**
 * Callback interface for agent lifecycle events.
 * Enables Agent→UI communication without direct dependencies.
 *
 * All callbacks are optional and include SpanContext for telemetry correlation.
 * This replaces Python's EventBus pattern with better React integration.
 */

import type { SpanContext, Message } from './types.js';
import type { TokenUsage } from '../model/types.js';
import type { ToolResponse } from '../tools/types.js';
import type { AgentErrorResponse } from '../errors/index.js';

/**
 * Callbacks for agent lifecycle events.
 * All callbacks are optional with SpanContext for telemetry correlation.
 */
export interface AgentCallbacks {
  // ─── Agent Lifecycle ─────────────────────────────────────────────────
  /** Called when agent starts processing a query */
  onAgentStart?: (ctx: SpanContext, query: string) => void;
  /** Called when agent finishes with final answer */
  onAgentEnd?: (ctx: SpanContext, answer: string) => void;

  // ─── LLM Interaction ─────────────────────────────────────────────────
  /** Called before LLM invocation */
  onLLMStart?: (ctx: SpanContext, model: string, messages: Message[]) => void;
  /** Called for each streamed chunk */
  onLLMStream?: (ctx: SpanContext, chunk: string) => void;
  /** Called after LLM invocation completes */
  onLLMEnd?: (ctx: SpanContext, response: string, usage?: TokenUsage) => void;

  // ─── Tool Execution ──────────────────────────────────────────────────
  /** Called before tool execution */
  onToolStart?: (ctx: SpanContext, toolName: string, args: Record<string, unknown>) => void;
  /** Called after tool execution */
  onToolEnd?: (ctx: SpanContext, toolName: string, result: ToolResponse) => void;

  // ─── UI Feedback ─────────────────────────────────────────────────────
  /** Called to show loading indicator */
  onSpinnerStart?: (message: string) => void;
  /** Called to hide loading indicator */
  onSpinnerStop?: () => void;
  /**
   * Called with streaming answer generator.
   * Note: This callback is designed for CLI shell integration (Feature 16).
   * Currently, runStream() yields chunks directly and emits onLLMStream.
   * The CLI shell may use onAnswerStream to receive the stream via callback.
   */
  onAnswerStream?: (stream: AsyncGenerator<string>) => void;

  // ─── Error Handling ────────────────────────────────────────────────────
  /**
   * Called when an error occurs during agent execution.
   * Provides structured error information for programmatic handling.
   * Note: onAgentEnd continues to receive error strings for backward compatibility.
   */
  onError?: (ctx: SpanContext, error: AgentErrorResponse) => void;

  // ─── Debug/Logging ───────────────────────────────────────────────────
  /** Debug-level logging */
  onDebug?: (message: string, data?: unknown) => void;
  /** Trace-level logging (verbose) */
  onTrace?: (message: string, data?: unknown) => void;
}

// -----------------------------------------------------------------------------
// Span Context Helpers
// -----------------------------------------------------------------------------

/**
 * Generate a random hex string of specified length.
 * Uses crypto for randomness when available.
 */
function randomHex(length: number): string {
  const bytes = new Uint8Array(length / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create a new root span context for a new operation.
 * Generates new trace and span IDs.
 *
 * @returns New SpanContext with unique trace and span IDs
 */
export function createSpanContext(): SpanContext {
  return {
    traceId: randomHex(32), // 128-bit trace ID
    spanId: randomHex(16), // 64-bit span ID
  };
}

/**
 * Create a child span context from a parent.
 * Preserves trace ID, generates new span ID, sets parent reference.
 *
 * @param parent - Parent span context
 * @returns New SpanContext with same trace ID and new span ID
 */
export function createChildSpanContext(parent: SpanContext): SpanContext {
  return {
    traceId: parent.traceId,
    spanId: randomHex(16),
    parentSpanId: parent.spanId,
  };
}
