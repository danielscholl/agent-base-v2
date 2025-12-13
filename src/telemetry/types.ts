/**
 * Telemetry type definitions.
 * Provides interfaces for OpenTelemetry setup and helpers.
 */

import type { Tracer, Meter, Span } from '@opentelemetry/api';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
import type { TelemetryConfig } from '../config/schema.js';

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

/**
 * Telemetry-specific error codes.
 */
export type TelemetryErrorCode =
  | 'INITIALIZATION_FAILED'
  | 'ENDPOINT_UNREACHABLE'
  | 'EXPORT_FAILED'
  | 'INVALID_CONFIG'
  | 'ALREADY_INITIALIZED'
  | 'NOT_INITIALIZED'
  // Aspire Dashboard error codes
  | 'DOCKER_NOT_INSTALLED'
  | 'DOCKER_NOT_RUNNING'
  | 'CONTAINER_START_FAILED'
  | 'CONTAINER_STOP_FAILED'
  | 'TIMEOUT'
  | 'UNKNOWN';

/**
 * Success response for telemetry operations.
 */
export interface TelemetrySuccessResponse<T = void> {
  success: true;
  result: T;
  message: string;
}

/**
 * Error response for telemetry operations.
 */
export interface TelemetryErrorResponse {
  success: false;
  error: TelemetryErrorCode;
  message: string;
}

/**
 * Union type for telemetry responses.
 */
export type TelemetryResponse<T = void> = TelemetrySuccessResponse<T> | TelemetryErrorResponse;

// -----------------------------------------------------------------------------
// Configuration Types
// -----------------------------------------------------------------------------

/**
 * Exporter type options.
 */
export type ExporterType = 'otlp' | 'console' | 'none';

/**
 * Options for telemetry initialization.
 */
export interface TelemetryOptions {
  /** Telemetry configuration from config system */
  config: TelemetryConfig;
  /** Service name for traces (defaults to 'agent-framework') */
  serviceName?: string;
  /** Service version for traces */
  serviceVersion?: string;
  /** Override exporter type (defaults to 'otlp' if endpoint available, else 'none') */
  exporterType?: ExporterType;
  /** Skip endpoint availability check */
  skipEndpointCheck?: boolean;
  /** Custom OTLP endpoint (overrides config) */
  endpoint?: string;
  /** Callback for debug messages */
  onDebug?: (message: string) => void;
  /** Custom span exporter for testing (bypasses type-based exporter creation) */
  customExporter?: SpanExporter;
}

/**
 * Telemetry initialization result.
 */
export interface TelemetryInitResult {
  /** Whether telemetry is enabled and exporting */
  enabled: boolean;
  /** The exporter type in use */
  exporterType: ExporterType;
  /** The endpoint being used (if OTLP) */
  endpoint?: string;
  /** Service name */
  serviceName: string;
}

// -----------------------------------------------------------------------------
// Helper Interface
// -----------------------------------------------------------------------------

/**
 * Telemetry helpers interface.
 * Provides access to tracer and meter instances.
 */
export interface TelemetryHelpers {
  /** Get a tracer for creating spans */
  getTracer(name?: string, version?: string): Tracer;
  /** Get a meter for creating metrics */
  getMeter(name?: string, version?: string): Meter;
  /** Check if telemetry is enabled */
  isEnabled(): boolean;
  /** Get current configuration */
  getConfig(): TelemetryInitResult | null;
  /** Shutdown telemetry (flush and close) */
  shutdown(): Promise<TelemetryResponse>;
}

// -----------------------------------------------------------------------------
// Type Guards
// -----------------------------------------------------------------------------

/**
 * Type guard for success responses.
 */
export function isTelemetrySuccess<T>(
  response: TelemetryResponse<T>
): response is TelemetrySuccessResponse<T> {
  return response.success;
}

/**
 * Type guard for error responses.
 */
export function isTelemetryError(
  response: TelemetryResponse<unknown>
): response is TelemetryErrorResponse {
  return !response.success;
}

// -----------------------------------------------------------------------------
// GenAI Span Types
// -----------------------------------------------------------------------------

/**
 * Options for starting an LLM span.
 */
export interface LLMSpanOptions {
  /** Operation name (defaults to 'chat') */
  operationName?: string;
  /** Provider name (e.g., 'openai', 'anthropic') */
  providerName: string;
  /** Model name */
  modelName: string;
  /** Parent span context for correlation */
  parentSpanId?: string;
  /** Trace ID for correlation */
  traceId?: string;
  /** Temperature setting */
  temperature?: number;
  /** Max tokens setting */
  maxTokens?: number;
  /** Include message content in span (requires enableSensitiveData) */
  enableSensitiveData?: boolean;
  /** Input messages (only recorded if enableSensitiveData is true) */
  messages?: unknown[];
}

/**
 * Options for ending an LLM span.
 */
export interface LLMSpanEndOptions {
  /** Number of input tokens */
  inputTokens?: number;
  /** Number of output tokens */
  outputTokens?: number;
  /** Enable recording of response content (must be true to record) */
  enableSensitiveData?: boolean;
  /** Response content (only recorded if enableSensitiveData is true) */
  response?: string;
  /** Response model name (if different from request) */
  responseModel?: string;
  /** Finish reason (e.g., 'stop', 'length') */
  finishReason?: string;
  /** Error type if operation failed */
  errorType?: string;
}

/**
 * Options for starting a tool span.
 */
export interface ToolSpanOptions {
  /** Tool name */
  toolName: string;
  /** Tool call ID */
  toolCallId?: string;
  /** Parent span ID for correlation */
  parentSpanId?: string;
  /** Trace ID for correlation */
  traceId?: string;
  /** Include arguments in span (requires enableSensitiveData) */
  enableSensitiveData?: boolean;
  /** Tool arguments (only recorded if enableSensitiveData is true) */
  arguments?: Record<string, unknown>;
}

/**
 * Options for ending a tool span.
 */
export interface ToolSpanEndOptions {
  /** Whether the tool execution succeeded */
  success: boolean;
  /** Error type if execution failed */
  errorType?: string;
  /** Include result in span (requires enableSensitiveData) */
  enableSensitiveData?: boolean;
  /** Tool result (only recorded if enableSensitiveData is true) */
  result?: unknown;
}

/**
 * Options for starting an agent span.
 */
export interface AgentSpanOptions {
  /** Agent operation name */
  operationName?: string;
  /** Provider name */
  providerName?: string;
  /** Model name */
  modelName?: string;
  /** Conversation/session ID */
  conversationId?: string;
}

/**
 * Active span handle for ending spans.
 */
export interface ActiveSpan {
  /** The underlying OTel span */
  span: Span;
  /** End the span with optional attributes */
  end: () => void;
}
