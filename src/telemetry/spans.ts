/**
 * GenAI Semantic Convention Span Helpers.
 * Provides functions to create properly-attributed spans for LLM and tool operations.
 *
 * Based on OpenTelemetry GenAI Semantic Conventions:
 * https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/
 */

import { SpanKind, SpanStatusCode, context, trace } from '@opentelemetry/api';
import type { Span, Context } from '@opentelemetry/api';
import { getTracer } from './setup.js';
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_ERROR_TYPE,
  GEN_AI_OPERATION,
} from './conventions.js';
import type {
  LLMSpanOptions,
  LLMSpanEndOptions,
  ToolSpanOptions,
  ToolSpanEndOptions,
  AgentSpanOptions,
} from './types.js';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const TRACER_NAME = 'agent-framework.genai';

// -----------------------------------------------------------------------------
// LLM Span Helpers
// -----------------------------------------------------------------------------

/**
 * Start an LLM operation span with GenAI semantic conventions.
 *
 * @param options - LLM span options
 * @returns The started span (or no-op span if telemetry disabled)
 *
 * @example
 * ```typescript
 * const span = startLLMSpan({
 *   providerName: 'openai',
 *   modelName: 'gpt-4o',
 *   temperature: 0.7,
 * });
 *
 * try {
 *   const response = await llm.invoke(messages);
 *   endLLMSpan(span, { inputTokens: 100, outputTokens: 50 });
 * } catch (error) {
 *   endLLMSpan(span, { errorType: error.name });
 * }
 * ```
 */
export function startLLMSpan(options: LLMSpanOptions): Span {
  const tracer = getTracer(TRACER_NAME);
  const operationName = options.operationName ?? GEN_AI_OPERATION.CHAT;

  const span = tracer.startSpan(`${operationName} ${options.modelName}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      [ATTR_GEN_AI_OPERATION_NAME]: operationName,
      [ATTR_GEN_AI_PROVIDER_NAME]: options.providerName,
      [ATTR_GEN_AI_REQUEST_MODEL]: options.modelName,
    },
  });

  // Add optional request parameters
  if (options.temperature !== undefined) {
    span.setAttribute(ATTR_GEN_AI_REQUEST_TEMPERATURE, options.temperature);
  }
  if (options.maxTokens !== undefined) {
    span.setAttribute(ATTR_GEN_AI_REQUEST_MAX_TOKENS, options.maxTokens);
  }

  // Add sensitive data if enabled
  if (options.enableSensitiveData === true && options.messages !== undefined) {
    span.setAttribute(ATTR_GEN_AI_INPUT_MESSAGES, JSON.stringify(options.messages));
  }

  return span;
}

/**
 * End an LLM span with completion attributes.
 *
 * @param span - The span to end
 * @param options - End options with token usage and optional error
 */
export function endLLMSpan(span: Span, options: LLMSpanEndOptions = {}): void {
  // Add token usage
  if (options.inputTokens !== undefined) {
    span.setAttribute(ATTR_GEN_AI_USAGE_INPUT_TOKENS, options.inputTokens);
  }
  if (options.outputTokens !== undefined) {
    span.setAttribute(ATTR_GEN_AI_USAGE_OUTPUT_TOKENS, options.outputTokens);
  }

  // Add response model if different
  if (options.responseModel !== undefined) {
    span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, options.responseModel);
  }

  // Add finish reason
  if (options.finishReason !== undefined) {
    span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [options.finishReason]);
  }

  // Add sensitive response content only if enabled
  if (options.enableSensitiveData === true && options.response !== undefined) {
    span.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, options.response);
  }

  // Handle error case
  if (options.errorType !== undefined) {
    span.setAttribute(ATTR_ERROR_TYPE, options.errorType);
    span.setStatus({ code: SpanStatusCode.ERROR, message: options.errorType });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }

  span.end();
}

// -----------------------------------------------------------------------------
// Tool Span Helpers
// -----------------------------------------------------------------------------

/**
 * Start a tool execution span with GenAI semantic conventions.
 *
 * @param options - Tool span options
 * @returns The started span
 *
 * @example
 * ```typescript
 * const span = startToolSpan({
 *   toolName: 'read_file',
 *   toolCallId: 'call_123',
 *   arguments: { path: '/etc/hosts' },
 *   enableSensitiveData: true,
 * });
 *
 * try {
 *   const result = await tool.execute(args);
 *   endToolSpan(span, { success: true, result });
 * } catch (error) {
 *   endToolSpan(span, { success: false, errorType: error.name });
 * }
 * ```
 */
export function startToolSpan(options: ToolSpanOptions): Span {
  const tracer = getTracer(TRACER_NAME);

  const span = tracer.startSpan(`${GEN_AI_OPERATION.EXECUTE_TOOL} ${options.toolName}`, {
    kind: SpanKind.INTERNAL,
    attributes: {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION.EXECUTE_TOOL,
      [ATTR_GEN_AI_TOOL_NAME]: options.toolName,
    },
  });

  // Add tool call ID if provided
  if (options.toolCallId !== undefined) {
    span.setAttribute(ATTR_GEN_AI_TOOL_CALL_ID, options.toolCallId);
  }

  // Add sensitive arguments if enabled
  if (options.enableSensitiveData === true && options.arguments !== undefined) {
    span.setAttribute(ATTR_GEN_AI_TOOL_CALL_ARGUMENTS, JSON.stringify(options.arguments));
  }

  return span;
}

/**
 * End a tool execution span.
 *
 * @param span - The span to end
 * @param options - End options with success status and optional result
 */
export function endToolSpan(span: Span, options: ToolSpanEndOptions): void {
  // Add sensitive result if enabled
  if (options.enableSensitiveData === true && options.result !== undefined) {
    span.setAttribute(ATTR_GEN_AI_TOOL_CALL_RESULT, JSON.stringify(options.result));
  }

  // Set status based on success
  if (options.success) {
    span.setStatus({ code: SpanStatusCode.OK });
  } else {
    if (options.errorType !== undefined) {
      span.setAttribute(ATTR_ERROR_TYPE, options.errorType);
    }
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: options.errorType ?? 'Tool execution failed',
    });
  }

  span.end();
}

// -----------------------------------------------------------------------------
// Agent Span Helpers
// -----------------------------------------------------------------------------

/**
 * Start an agent invocation span.
 * This creates the root span for an agent.run() call.
 *
 * @param options - Agent span options
 * @returns The started span
 */
export function startAgentSpan(options: AgentSpanOptions = {}): Span {
  const tracer = getTracer(TRACER_NAME);
  const operationName = options.operationName ?? GEN_AI_OPERATION.INVOKE_AGENT;

  // Span name follows GenAI convention: "{operation_name} {model_name}"
  const spanName =
    options.modelName !== undefined ? `${operationName} ${options.modelName}` : operationName;

  const span = tracer.startSpan(spanName, {
    kind: SpanKind.SERVER,
    attributes: {
      [ATTR_GEN_AI_OPERATION_NAME]: operationName,
    },
  });

  // Add optional attributes
  if (options.providerName !== undefined) {
    span.setAttribute(ATTR_GEN_AI_PROVIDER_NAME, options.providerName);
  }
  if (options.modelName !== undefined) {
    span.setAttribute(ATTR_GEN_AI_REQUEST_MODEL, options.modelName);
  }
  if (options.conversationId !== undefined) {
    span.setAttribute(ATTR_GEN_AI_CONVERSATION_ID, options.conversationId);
  }

  return span;
}

/**
 * End an agent span.
 *
 * @param span - The span to end
 * @param error - Optional error if the agent run failed
 */
export function endAgentSpan(span: Span, error?: string): void {
  if (error !== undefined) {
    span.setAttribute(ATTR_ERROR_TYPE, error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}

// -----------------------------------------------------------------------------
// Span Context Utilities
// -----------------------------------------------------------------------------

/**
 * Get the current active span from context.
 * Returns undefined if no span is active.
 */
export function getActiveSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Execute a function within a span context.
 * The span becomes the active span for the duration of the function.
 *
 * @param span - The span to make active
 * @param fn - The function to execute
 * @returns The function result
 */
export function withSpan<T>(span: Span, fn: () => T): T {
  const ctx = trace.setSpan(context.active(), span);
  return context.with(ctx, fn);
}

/**
 * Execute an async function within a span context.
 *
 * @param span - The span to make active
 * @param fn - The async function to execute
 * @returns Promise resolving to the function result
 */
export async function withSpanAsync<T>(span: Span, fn: () => Promise<T>): Promise<T> {
  const ctx = trace.setSpan(context.active(), span);
  return context.with(ctx, fn);
}

// -----------------------------------------------------------------------------
// Context Bridging Helpers
// -----------------------------------------------------------------------------

/**
 * Internal SpanContext from callbacks (not OTel SpanContext).
 */
interface CallbackSpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

/**
 * Create an OTel context with a parent span for proper hierarchy.
 * This bridges the callback SpanContext with OTel's context propagation.
 *
 * @param parentSpan - Optional parent span to use as context
 * @returns Context to use when creating child spans
 */
function getParentContext(parentSpan?: Span): Context {
  if (parentSpan !== undefined) {
    return trace.setSpan(context.active(), parentSpan);
  }
  return context.active();
}

// -----------------------------------------------------------------------------
// Callback Integration Helpers
// -----------------------------------------------------------------------------

/**
 * Options for creating tracing callbacks.
 */
export interface TracingCallbacksOptions {
  /** Provider name for LLM spans */
  providerName: string;
  /** Model name for LLM spans */
  modelName: string;
  /** Enable recording of sensitive data (messages, tool args) */
  enableSensitiveData?: boolean;
  /** Conversation/session ID */
  conversationId?: string;
}

/**
 * Active spans tracked by the tracing callbacks.
 */
export interface TracingState {
  agentSpan?: Span;
  llmSpans: Map<string, Span>;
  toolSpans: Map<string, Span>;
}

/**
 * Create tracing state for a new agent invocation.
 */
export function createTracingState(): TracingState {
  return {
    agentSpan: undefined,
    llmSpans: new Map(),
    toolSpans: new Map(),
  };
}

/**
 * Map internal SpanContext to span operations.
 * This bridges the callback SpanContext with OTel spans.
 */
export function getSpanKey(ctx: { traceId: string; spanId: string }): string {
  return `${ctx.traceId}:${ctx.spanId}`;
}

/**
 * Callbacks interface for tracing (subset of AgentCallbacks).
 * This avoids circular dependency with agent/callbacks.ts.
 */
export interface TracingCallbacksInput {
  onAgentStart?: (ctx: CallbackSpanContext, query: string) => void;
  onAgentEnd?: (ctx: CallbackSpanContext, answer: string) => void;
  onLLMStart?: (
    ctx: CallbackSpanContext,
    model: string,
    messages: Array<{ role: string; content: string }>
  ) => void;
  onLLMEnd?: (
    ctx: CallbackSpanContext,
    response: string,
    usage?: { promptTokens?: number; completionTokens?: number }
  ) => void;
  onToolStart?: (ctx: CallbackSpanContext, toolName: string, args: Record<string, unknown>) => void;
  onToolEnd?: (
    ctx: CallbackSpanContext,
    toolName: string,
    result: { success: boolean; error?: string; result?: unknown }
  ) => void;
}

/**
 * Create AgentCallbacks that automatically trace all operations.
 * Wraps existing callbacks and adds OpenTelemetry spans.
 *
 * @param options - Tracing configuration
 * @param baseCallbacks - Optional existing callbacks to wrap
 * @returns Enhanced callbacks with automatic tracing
 *
 * @example
 * ```typescript
 * const { callbacks, getState } = createTracingCallbacks({
 *   providerName: 'openai',
 *   modelName: 'gpt-4o',
 *   enableSensitiveData: false,
 * });
 *
 * const agent = new Agent({ config, callbacks });
 * await agent.run('Hello');
 *
 * // Spans are automatically created for agent/LLM/tool operations
 * ```
 */
export function createTracingCallbacks(
  options: TracingCallbacksOptions,
  baseCallbacks?: TracingCallbacksInput
): { callbacks: TracingCallbacksInput; getState: () => TracingState } {
  const state = createTracingState();
  const { providerName, modelName, enableSensitiveData = false, conversationId } = options;

  const callbacks: TracingCallbacksInput = {
    onAgentStart: (ctx, query) => {
      // Create root agent span
      state.agentSpan = startAgentSpan({
        providerName: mapProviderName(providerName),
        modelName,
        conversationId,
      });

      // Call base callback
      baseCallbacks?.onAgentStart?.(ctx, query);
    },

    onAgentEnd: (ctx, answer) => {
      // Clean up any dangling LLM spans (error occurred before onLLMEnd)
      for (const [key, span] of Array.from(state.llmSpans.entries())) {
        span.setAttribute(ATTR_ERROR_TYPE, 'AgentError');
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Agent ended before LLM completed' });
        span.end();
        state.llmSpans.delete(key);
      }

      // Clean up any dangling tool spans (error occurred before onToolEnd)
      for (const [key, span] of Array.from(state.toolSpans.entries())) {
        span.setAttribute(ATTR_ERROR_TYPE, 'AgentError');
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'Agent ended before tool completed',
        });
        span.end();
        state.toolSpans.delete(key);
      }

      // End agent span
      if (state.agentSpan !== undefined) {
        endAgentSpan(state.agentSpan);
        state.agentSpan = undefined;
      }

      // Call base callback
      baseCallbacks?.onAgentEnd?.(ctx, answer);
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
        span.setAttribute(ATTR_GEN_AI_INPUT_MESSAGES, JSON.stringify(messages));
      }

      state.llmSpans.set(spanKey, span);

      // Call base callback
      baseCallbacks?.onLLMStart?.(ctx, model, messages);
    },

    onLLMEnd: (ctx, response, usage) => {
      const spanKey = getSpanKey(ctx);
      const span = state.llmSpans.get(spanKey);

      if (span !== undefined) {
        // Add token usage
        if (usage?.promptTokens !== undefined) {
          span.setAttribute(ATTR_GEN_AI_USAGE_INPUT_TOKENS, usage.promptTokens);
        }
        if (usage?.completionTokens !== undefined) {
          span.setAttribute(ATTR_GEN_AI_USAGE_OUTPUT_TOKENS, usage.completionTokens);
        }

        // Add response if sensitive data enabled
        if (enableSensitiveData) {
          span.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, response);
        }

        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        state.llmSpans.delete(spanKey);
      }

      // Call base callback
      baseCallbacks?.onLLMEnd?.(ctx, response, usage);
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
          },
        },
        parentCtx
      );

      // Add sensitive arguments if enabled
      if (enableSensitiveData) {
        span.setAttribute(ATTR_GEN_AI_TOOL_CALL_ARGUMENTS, JSON.stringify(args));
      }

      state.toolSpans.set(spanKey, span);

      // Call base callback
      baseCallbacks?.onToolStart?.(ctx, toolName, args);
    },

    onToolEnd: (ctx, toolName, result) => {
      const spanKey = getSpanKey(ctx);
      const span = state.toolSpans.get(spanKey);

      if (span !== undefined) {
        // Add sensitive result if enabled
        if (enableSensitiveData && result.result !== undefined) {
          span.setAttribute(ATTR_GEN_AI_TOOL_CALL_RESULT, JSON.stringify(result.result));
        }

        // Set status based on success
        if (result.success) {
          span.setStatus({ code: SpanStatusCode.OK });
        } else {
          if (result.error !== undefined) {
            span.setAttribute(ATTR_ERROR_TYPE, result.error);
          }
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: result.error ?? 'Tool execution failed',
          });
        }

        span.end();
        state.toolSpans.delete(spanKey);
      }

      // Call base callback
      baseCallbacks?.onToolEnd?.(ctx, toolName, result);
    },
  };

  return {
    callbacks,
    getState: () => state,
  };
}

// -----------------------------------------------------------------------------
// Provider Name Mapping
// -----------------------------------------------------------------------------

/**
 * Map provider config names to GenAI semantic convention provider names.
 */
export function mapProviderName(configProvider: string): string {
  const mapping: Record<string, string> = {
    openai: 'openai',
    anthropic: 'anthropic',
    azure: 'azure.ai.openai',
    foundry: 'azure.ai.foundry',
    gemini: 'google.gemini',
    github: 'github',
    local: 'local',
  };
  return mapping[configProvider] ?? configProvider;
}
