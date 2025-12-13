/**
 * Telemetry module - OpenTelemetry setup and helpers.
 *
 * This module provides:
 * - initializeTelemetry() for one-time OTel setup
 * - getTracer() and getMeter() for creating tracers/meters
 * - GenAI span helpers for LLM and tool tracing
 * - Zero overhead when disabled (no-op implementations)
 */

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  TelemetryErrorCode,
  TelemetrySuccessResponse,
  TelemetryErrorResponse,
  TelemetryResponse,
  ExporterType,
  TelemetryOptions,
  TelemetryInitResult,
  TelemetryHelpers,
  // GenAI span types
  LLMSpanOptions,
  LLMSpanEndOptions,
  ToolSpanOptions,
  ToolSpanEndOptions,
  AgentSpanOptions,
  ActiveSpan,
} from './types.js';

// ─── Type Guards ─────────────────────────────────────────────────────────────
export { isTelemetrySuccess, isTelemetryError } from './types.js';

// ─── Setup Functions ─────────────────────────────────────────────────────────
export {
  initializeTelemetry,
  getTracer,
  getMeter,
  isEnabled,
  getConfig,
  shutdown,
  telemetryHelpers,
} from './setup.js';

// ─── GenAI Semantic Conventions ──────────────────────────────────────────────
export {
  // Attribute constants
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_ERROR_TYPE,
  // Well-known values
  GEN_AI_OPERATION,
  GEN_AI_PROVIDER,
} from './conventions.js';

export type { GenAIOperationName, GenAIProviderName } from './conventions.js';

// ─── GenAI Span Helpers ──────────────────────────────────────────────────────
export {
  // LLM spans
  startLLMSpan,
  endLLMSpan,
  // Tool spans
  startToolSpan,
  endToolSpan,
  // Agent spans
  startAgentSpan,
  endAgentSpan,
  // Context utilities
  getActiveSpan,
  withSpan,
  withSpanAsync,
  // Callback integration
  createTracingState,
  createTracingCallbacks,
  getSpanKey,
  mapProviderName,
} from './spans.js';

export type { TracingCallbacksOptions, TracingCallbacksInput, TracingState } from './spans.js';

// ─── Aspire Dashboard Management ─────────────────────────────────────────────
export {
  // Constants
  ASPIRE_CONTAINER_NAME,
  ASPIRE_DASHBOARD_URL,
  ASPIRE_OTLP_GRPC_ENDPOINT,
  ASPIRE_OTLP_HTTP_ENDPOINT,
  ASPIRE_IMAGE,
  // Core functions
  startAspireDashboard,
  stopAspireDashboard,
  getAspireStatus,
  getAspireUrl,
  // Config-integrated functions
  startAspireDashboardWithConfig,
  stopAspireDashboardWithConfig,
} from './aspire.js';

export type { AspireStatus, AspireOptions, AspireConfigOptions } from './aspire.js';
