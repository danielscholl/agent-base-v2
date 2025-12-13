/**
 * Telemetry type definitions.
 * Provides interfaces for OpenTelemetry setup and helpers.
 */

import type { Tracer, Meter } from '@opentelemetry/api';
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
