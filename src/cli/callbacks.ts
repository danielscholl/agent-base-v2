/**
 * Callback factory for CLI components.
 * Creates AgentCallbacks that update React state.
 */

import { trace, context, SpanKind } from '@opentelemetry/api';
import type { Span, Context } from '@opentelemetry/api';
import type { AgentCallbacks } from '../agent/callbacks.js';
import type { SpanContext } from '../agent/types.js';
import type { AgentErrorResponse } from '../errors/index.js';
import { generateToolSummary, type SessionTokenUsage } from '../utils/index.js';
import {
  isEnabled as isTelemetryEnabled,
  startAgentSpan,
  endAgentSpan,
  endLLMSpan,
  endToolSpan,
  getSpanKey,
  mapProviderName,
  getTracer,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_OPERATION,
} from '../telemetry/index.js';

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
  addActiveTask?: (
    id: string,
    name: string,
    args?: Record<string, unknown>,
    /** Primary argument for display (e.g., file path, command) */
    primaryArg?: string
  ) => void;
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
    error?: string,
    /** Primary argument for display (e.g., file path, command) */
    primaryArg?: string,
    /** Result summary for display (e.g., "42 files", "270 lines") */
    resultSummary?: string,
    /** Whether the tool has detailed output worth expanding */
    hasDetailedOutput?: boolean
  ) => void;
  /** Update session token usage with per-request data */
  updateTokenUsage?: (usage: SessionTokenUsage) => void;
  /** Set message count from LLM context (for execution status display) */
  setMessageCount?: (count: number) => void;
  /**
   * Increment span counter (called on each LLM iteration).
   * Each LLM call starts a new span - Span 1, Span 2, etc.
   * Note: "Span" aligns with OpenTelemetry terminology.
   */
  incrementSpan?: () => void;
  /** Get current span number (for associating tools with spans) */
  getCurrentSpan?: () => number;
  /** Append to per-span reasoning buffer for post-completion review */
  appendToSpanReasoning?: (chunk: string) => void;
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

  // Track original args for each tool call by spanId
  // Used to pass correct args to generateToolSummary in onToolEnd
  const toolArgsCache = new Map<string, Record<string, unknown>>();

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

    onLLMStart: (_ctx, _model, messages) => {
      // Increment span counter - each LLM call starts a new span
      state.incrementSpan?.();
      // Track message count for execution status display
      state.setMessageCount?.(messages.length);
    },

    onLLMStream: (_ctx, chunk) => {
      state.appendToOutput(chunk);
    },

    onLLMEnd: (_ctx, response, usage) => {
      // Capture LLM response for per-span reasoning
      // This works with both run() and runStream() since onLLMEnd is called in both
      state.appendToSpanReasoning?.(response);

      // Forward token usage to component state if callback is provided
      if (usage !== undefined && state.updateTokenUsage !== undefined) {
        // Pass per-request TokenUsage with correct field names
        // The component accumulates these values
        state.updateTokenUsage({
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          tokens: usage.totalTokens,
          queryCount: 1,
        });
      }
    },

    onAgentEnd: (_ctx, answer) => {
      // Clear cache to prevent memory leaks from aborted/crashed tools
      toolArgsCache.clear();
      state.setIsProcessing(false);
      state.onComplete?.(answer);
    },

    onError: (_ctx, error) => {
      // Clear cache to prevent memory leaks from aborted/crashed tools
      toolArgsCache.clear();
      state.setError(error);
      state.setIsProcessing(false);
    },

    onToolStart: (ctx, toolName, args) => {
      // Cache args for use in onToolEnd (generateToolSummary needs original args)
      toolArgsCache.set(ctx.spanId, args);

      // Generate summary to get primaryArg for immediate display
      // This ensures running tools show "bash: npm test" instead of "(command: npm test)"
      const summary = generateToolSummary(toolName, args, { success: true, message: '' }, {});

      // Use spanId as unique identifier for concurrent tool calls
      state.addActiveTask?.(ctx.spanId, toolName, args, summary.primary);
    },

    onToolEnd: (ctx, toolName, result, executionResult) => {
      const success = executionResult?.success ?? result.success;
      // Prefer error from executionResult result.metadata.error, fallback to result.message
      let error: string | undefined;
      if (!success) {
        // Check executionResult metadata for error code
        if (executionResult !== undefined) {
          const meta = executionResult.result.metadata as Record<string, unknown>;
          const errorFromMeta = 'error' in meta ? meta.error : undefined;
          if (typeof errorFromMeta === 'string' && errorFromMeta.length > 0) {
            error = errorFromMeta;
          }
        }
        // Fallback to result.message
        if (error === undefined && 'message' in result) {
          error = result.message;
        }
      }

      // Generate tool summary for progressive disclosure display
      const metadata =
        executionResult !== undefined
          ? (executionResult.result.metadata as Record<string, unknown>)
          : {};
      const output =
        executionResult !== undefined
          ? executionResult.result.output
          : result.success
            ? result.message
            : '';

      // Retrieve original args from cache (set in onToolStart)
      const originalArgs = toolArgsCache.get(ctx.spanId) ?? {};
      toolArgsCache.delete(ctx.spanId); // Clean up cache

      // Generate summary using original args (for primary display) and metadata (for result info)
      const summary = generateToolSummary(
        toolName,
        originalArgs, // Use original args for primary argument extraction
        { success, message: result.message, output },
        metadata
      );

      // Duration is calculated in the component from startTime
      state.completeTask?.(
        ctx.spanId,
        toolName,
        success,
        0,
        error,
        summary.primary,
        summary.summary,
        summary.hasDetail
      );
    },

    onDebug: (message, data) => {
      if (process.env.AGENT_DEBUG !== undefined) {
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

// -----------------------------------------------------------------------------
// Telemetry Wrapper
// -----------------------------------------------------------------------------

/**
 * Options for telemetry-enhanced callbacks.
 */
export interface TelemetryWrapperOptions {
  /** Provider name (e.g., 'openai', 'anthropic') */
  providerName: string;
  /** Model name (e.g., 'gpt-4o') */
  modelName: string;
  /** Enable recording of sensitive data (messages, tool args) */
  enableSensitiveData?: boolean;
  /** Conversation/session ID for correlation */
  conversationId?: string;
}

/**
 * Tracing state for managing active spans.
 */
interface TracingState {
  agentSpan?: Span;
  llmSpans: Map<string, Span>;
  toolSpans: Map<string, Span>;
}

const TRACER_NAME = 'agent-framework.genai';

/**
 * Get the OTel context with a parent span for creating child spans.
 */
function getParentContext(parentSpan?: Span): Context {
  if (parentSpan !== undefined) {
    return trace.setSpan(context.active(), parentSpan);
  }
  return context.active();
}

/**
 * Wrap AgentCallbacks with OpenTelemetry tracing.
 * Automatically creates spans for agent, LLM, and tool operations.
 *
 * @param callbacks - Base AgentCallbacks to wrap
 * @param options - Telemetry configuration
 * @returns Enhanced callbacks with automatic span creation
 *
 * @example
 * ```typescript
 * const baseCallbacks = createCallbacks(state);
 * const tracedCallbacks = wrapWithTelemetry(baseCallbacks, {
 *   providerName: 'openai',
 *   modelName: 'gpt-4o',
 * });
 * const agent = new Agent({ config, callbacks: tracedCallbacks });
 * ```
 */
export function wrapWithTelemetry(
  callbacks: AgentCallbacks,
  options: TelemetryWrapperOptions
): AgentCallbacks {
  // If telemetry is not enabled, return callbacks unchanged
  if (!isTelemetryEnabled()) {
    return callbacks;
  }

  const { providerName, modelName, enableSensitiveData = false, conversationId } = options;

  // State for tracking active spans
  const state: TracingState = {
    agentSpan: undefined,
    llmSpans: new Map(),
    toolSpans: new Map(),
  };

  return {
    ...callbacks,

    onAgentStart: (ctx: SpanContext, query: string) => {
      // Start agent span
      state.agentSpan = startAgentSpan({
        providerName: mapProviderName(providerName),
        modelName,
        conversationId,
      });

      // Call original callback
      callbacks.onAgentStart?.(ctx, query);
    },

    onAgentEnd: (ctx: SpanContext, answer: string) => {
      // Clean up any dangling LLM spans
      for (const span of state.llmSpans.values()) {
        endLLMSpan(span, { errorType: 'AgentEndedEarly' });
      }
      state.llmSpans.clear();

      // Clean up any dangling tool spans
      for (const span of state.toolSpans.values()) {
        endToolSpan(span, { success: false, errorType: 'AgentEndedEarly' });
      }
      state.toolSpans.clear();

      // End agent span
      if (state.agentSpan !== undefined) {
        endAgentSpan(state.agentSpan);
        state.agentSpan = undefined;
      }

      // Call original callback
      callbacks.onAgentEnd?.(ctx, answer);
    },

    onLLMStart: (ctx, model, messages) => {
      const spanKey = getSpanKey(ctx);

      // Create LLM span as child of agent span
      const tracer = getTracer(TRACER_NAME);
      const parentCtx = getParentContext(state.agentSpan);

      const span = tracer.startSpan(
        `${GEN_AI_OPERATION.CHAT} ${model}`,
        {
          kind: SpanKind.CLIENT,
          attributes: {
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION.CHAT,
            [ATTR_GEN_AI_PROVIDER_NAME]: mapProviderName(providerName),
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
          },
        },
        parentCtx
      );

      // Add sensitive data if enabled
      if (enableSensitiveData) {
        span.setAttribute(
          ATTR_GEN_AI_INPUT_MESSAGES,
          JSON.stringify(messages.map((m) => ({ role: m.role, content: m.content })))
        );
      }

      state.llmSpans.set(spanKey, span);

      // Call original callback
      callbacks.onLLMStart?.(ctx, model, messages);
    },

    onLLMEnd: (ctx, response, usage) => {
      const spanKey = getSpanKey(ctx);
      const span = state.llmSpans.get(spanKey);

      if (span !== undefined) {
        endLLMSpan(span, {
          inputTokens: usage?.promptTokens,
          outputTokens: usage?.completionTokens,
          enableSensitiveData,
          response: enableSensitiveData ? response : undefined,
        });
        state.llmSpans.delete(spanKey);
      }

      // Call original callback
      callbacks.onLLMEnd?.(ctx, response, usage);
    },

    onToolStart: (ctx, toolName, args) => {
      const spanKey = getSpanKey(ctx);

      // Create tool span as child of agent span
      const tracer = getTracer(TRACER_NAME);
      const parentCtx = getParentContext(state.agentSpan);

      const span = tracer.startSpan(
        `${GEN_AI_OPERATION.EXECUTE_TOOL} ${toolName}`,
        {
          kind: SpanKind.INTERNAL,
          attributes: {
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION.EXECUTE_TOOL,
            [ATTR_GEN_AI_TOOL_NAME]: toolName,
            [ATTR_GEN_AI_TOOL_CALL_ID]: ctx.spanId,
          },
        },
        parentCtx
      );

      // Add sensitive arguments if enabled
      if (enableSensitiveData) {
        span.setAttribute(ATTR_GEN_AI_TOOL_CALL_ARGUMENTS, JSON.stringify(args));
      }

      state.toolSpans.set(spanKey, span);

      // Call original callback
      callbacks.onToolStart?.(ctx, toolName, args);
    },

    onToolEnd: (ctx, toolName, result, executionResult) => {
      const spanKey = getSpanKey(ctx);
      const span = state.toolSpans.get(spanKey);

      if (span !== undefined) {
        // Prefer executionResult.result.metadata.error when available (more accurate for tools like bash)
        // Fall back to result.success for legacy tool format
        const metadata = executionResult?.result.metadata;
        const metadataError = metadata !== undefined ? metadata.error : undefined;
        const hasMetadataError = metadataError !== undefined ? Boolean(metadataError) : false;
        const isSuccess = hasMetadataError ? false : result.success;

        // Extract error type: use result.error only when result indicates failure
        const errorType = !result.success ? result.error : undefined;

        endToolSpan(span, {
          success: isSuccess,
          errorType: isSuccess ? undefined : errorType,
          enableSensitiveData,
          // Only access result.result when success is true (type narrowing)
          result: enableSensitiveData && result.success ? result.result : undefined,
        });
        state.toolSpans.delete(spanKey);
      }

      // Call original callback with executionResult
      callbacks.onToolEnd?.(ctx, toolName, result, executionResult);
    },
  };
}
