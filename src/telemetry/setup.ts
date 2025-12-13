/**
 * OpenTelemetry setup and initialization.
 * Provides configurable telemetry with OTLP export support.
 *
 * Key design decisions:
 * - Manual spans only (no Node auto-instrumentation for Bun compatibility)
 * - Uses @opentelemetry/sdk-trace-base instead of sdk-node for Bun
 * - Zero overhead when disabled (no-op tracer/meter)
 */

import { trace, metrics, diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import type { Tracer, Meter } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';

import type {
  TelemetryOptions,
  TelemetryInitResult,
  TelemetryResponse,
  TelemetryHelpers,
  ExporterType,
} from './types.js';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_SERVICE_NAME = 'agent-framework';
const DEFAULT_SERVICE_VERSION = '0.1.0';
const DEFAULT_OTLP_ENDPOINT = 'http://localhost:4318/v1/traces';
const ENDPOINT_CHECK_TIMEOUT_MS = 500;

// -----------------------------------------------------------------------------
// Module State
// -----------------------------------------------------------------------------

let initialized = false;
let tracerProvider: BasicTracerProvider | null = null;
let initResult: TelemetryInitResult | null = null;

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Check if an OTLP endpoint is reachable via fast HTTP check.
 * Returns true if the endpoint origin responds within timeout.
 *
 * Note: Uses GET on the origin (not the full /v1/traces path) since
 * OTLP collectors only accept POST on trace endpoints. This check
 * verifies the collector is running, not that the trace endpoint is
 * correctly configured. Some collectors may return 404/405 which is
 * acceptable - we only care that the service is reachable.
 */
async function isEndpointReachable(
  endpoint: string,
  timeoutMs: number = ENDPOINT_CHECK_TIMEOUT_MS
): Promise<boolean> {
  try {
    const url = new URL(endpoint);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      // Check the origin only - OTLP collectors only accept POST on /v1/traces
      await fetch(url.origin, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      // Any response (even 4xx/5xx) means endpoint is reachable
      return true;
    } catch {
      clearTimeout(timeoutId);
      return false;
    }
  } catch {
    // Invalid URL
    return false;
  }
}

/**
 * Create success response helper.
 */
function successResponse<T>(result: T, message: string): TelemetryResponse<T> {
  return { success: true, result, message };
}

// -----------------------------------------------------------------------------
// Main Setup Function
// -----------------------------------------------------------------------------

/**
 * Initialize OpenTelemetry with the provided configuration.
 *
 * @param options - Telemetry initialization options
 * @returns Result indicating success/failure and configuration
 *
 * @example
 * const result = await initializeTelemetry({
 *   config: { enabled: true, otlpEndpoint: 'http://localhost:4318/v1/traces' },
 *   serviceName: 'my-agent',
 * });
 * if (result.success) {
 *   console.log(`Telemetry enabled: ${result.result.enabled}`);
 * }
 */
export async function initializeTelemetry(
  options: TelemetryOptions
): Promise<TelemetryResponse<TelemetryInitResult>> {
  const { config, onDebug } = options;
  const debug = onDebug ?? ((_msg: string): void => {});

  // Check if already initialized
  if (initialized) {
    return {
      success: false,
      error: 'ALREADY_INITIALIZED',
      message: 'Telemetry has already been initialized. Call shutdown() first to reinitialize.',
    };
  }

  // Check if telemetry is disabled
  if (!config.enabled) {
    debug('Telemetry disabled via configuration');
    initResult = {
      enabled: false,
      exporterType: 'none',
      serviceName: options.serviceName ?? DEFAULT_SERVICE_NAME,
    };
    initialized = true;
    return successResponse(initResult, 'Telemetry disabled');
  }

  const serviceName = options.serviceName ?? DEFAULT_SERVICE_NAME;
  const serviceVersion = options.serviceVersion ?? DEFAULT_SERVICE_VERSION;
  const endpoint = options.endpoint ?? config.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT;

  // Determine exporter type
  let exporterType: ExporterType = options.exporterType ?? 'otlp';

  // Auto-detect endpoint availability if using OTLP
  if (exporterType === 'otlp' && options.skipEndpointCheck !== true) {
    debug(`Checking endpoint availability: ${endpoint}`);
    const reachable = await isEndpointReachable(endpoint);
    if (!reachable) {
      debug(`Endpoint unreachable: ${endpoint}, falling back to no-op`);
      exporterType = 'none';
    } else {
      debug(`Endpoint reachable: ${endpoint}`);
    }
  }

  // Handle no-op case first to avoid any allocations
  if (exporterType === 'none') {
    debug('No exporter configured (no-op mode)');
    // True no-op: skip provider/resource creation entirely, use OTel's built-in no-op
    initResult = {
      enabled: false,
      exporterType: 'none',
      serviceName,
    };
    initialized = true;
    return successResponse(initResult, 'Telemetry initialized with none exporter');
  }

  // Create exporter based on type
  let exporter: SpanExporter;
  switch (exporterType) {
    case 'otlp':
      debug(`Creating OTLP exporter for ${endpoint}`);
      exporter = new OTLPTraceExporter({
        url: endpoint,
      });
      break;
    case 'console':
      debug('Creating console exporter');
      exporter = new ConsoleSpanExporter();
      break;
  }

  // Create resource and provider only when we have an exporter
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
  });

  tracerProvider = new BasicTracerProvider({
    resource,
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  tracerProvider.register();

  // Enable debug logging if DEBUG_OTEL is set
  if (process.env['DEBUG_OTEL'] === 'true') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  initResult = {
    enabled: true,
    exporterType,
    endpoint: exporterType === 'otlp' ? endpoint : undefined,
    serviceName,
  };

  initialized = true;
  debug(`Telemetry initialized: ${JSON.stringify(initResult)}`);

  return successResponse(initResult, `Telemetry initialized with ${exporterType} exporter`);
}

// -----------------------------------------------------------------------------
// Getter Functions
// -----------------------------------------------------------------------------

/**
 * Get a tracer instance for creating spans.
 * Returns a no-op tracer if telemetry is not initialized or disabled.
 *
 * @param name - Instrumentation scope name (defaults to service name)
 * @param version - Instrumentation scope version
 * @returns Tracer instance
 */
export function getTracer(name?: string, version?: string): Tracer {
  const tracerName = name ?? initResult?.serviceName ?? DEFAULT_SERVICE_NAME;
  return trace.getTracer(tracerName, version);
}

/**
 * Get a meter instance for creating metrics.
 * Returns a no-op meter if telemetry is not initialized or disabled.
 *
 * @param name - Instrumentation scope name (defaults to service name)
 * @param version - Instrumentation scope version
 * @returns Meter instance
 */
export function getMeter(name?: string, version?: string): Meter {
  const meterName = name ?? initResult?.serviceName ?? DEFAULT_SERVICE_NAME;
  return metrics.getMeter(meterName, version);
}

/**
 * Check if telemetry is currently enabled and exporting.
 */
export function isEnabled(): boolean {
  return initialized && (initResult?.enabled ?? false);
}

/**
 * Get the current telemetry configuration.
 * Returns null if not initialized.
 */
export function getConfig(): TelemetryInitResult | null {
  return initResult;
}

/**
 * Shutdown telemetry, flushing any pending spans.
 * Must be called before reinitializing.
 */
export async function shutdown(): Promise<TelemetryResponse> {
  if (!initialized) {
    return {
      success: false,
      error: 'NOT_INITIALIZED',
      message: 'Telemetry is not initialized',
    };
  }

  try {
    if (tracerProvider) {
      await tracerProvider.shutdown();
      tracerProvider = null;
    }
    initialized = false;
    initResult = null;
    return successResponse(undefined, 'Telemetry shutdown complete');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during shutdown';
    return {
      success: false,
      error: 'UNKNOWN',
      message,
    };
  }
}

// -----------------------------------------------------------------------------
// Helpers Export Object
// -----------------------------------------------------------------------------

/**
 * Telemetry helpers object implementing TelemetryHelpers interface.
 */
export const telemetryHelpers: TelemetryHelpers = {
  getTracer,
  getMeter,
  isEnabled,
  getConfig,
  shutdown,
};
