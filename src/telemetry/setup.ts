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
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter as OTLPHttpExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPTraceExporter as OTLPGrpcExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
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
// OTLP endpoints - try HTTP first (4318), then gRPC (4317)
const DEFAULT_OTLP_HTTP_ENDPOINT = 'http://localhost:4318/v1/traces';
const DEFAULT_OTLP_GRPC_ENDPOINT = 'http://localhost:4317';
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
 *
 * LIMITATION: This uses HTTP/1.1 fetch to check gRPC endpoints (HTTP/2).
 * gRPC endpoints may not respond correctly to HTTP/1.1 GET requests,
 * potentially causing false negatives. However, in practice:
 * - Most OTLP collectors (Jaeger, OTEL Collector) accept both HTTP and gRPC
 * - The fallback behavior (HTTP first, then gRPC) handles most cases
 * - Any response (including errors) indicates the endpoint is reachable
 * - Adding true gRPC health checks would significantly increase complexity
 *
 * If gRPC detection is unreliable in your environment, use skipEndpointCheck
 * or explicitly specify the endpoint in configuration.
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

  // Determine exporter type and endpoint
  let exporterType: ExporterType = options.exporterType ?? 'otlp';
  let endpoint: string | undefined;
  let useGrpc = false;

  // Auto-detect endpoint availability if using OTLP (skip when using custom exporter)
  if (
    exporterType === 'otlp' &&
    options.skipEndpointCheck !== true &&
    options.customExporter === undefined
  ) {
    // If user specified an endpoint, use it
    const userEndpoint = options.endpoint ?? config.otlpEndpoint;
    if (userEndpoint !== undefined) {
      debug(`Checking user endpoint availability: ${userEndpoint}`);
      const reachable = await isEndpointReachable(userEndpoint);
      if (reachable) {
        endpoint = userEndpoint;
        // Detect gRPC vs HTTP based on port
        useGrpc = new URL(userEndpoint).port === '4317';
        debug(`User endpoint reachable: ${endpoint} (${useGrpc ? 'gRPC' : 'HTTP'})`);
      } else {
        debug(`User endpoint unreachable: ${userEndpoint}, falling back to auto-detect`);
      }
    }

    // If no user endpoint or it's unreachable, auto-detect
    if (endpoint === undefined) {
      // Try HTTP first (port 4318)
      debug(`Checking HTTP endpoint: ${DEFAULT_OTLP_HTTP_ENDPOINT}`);
      if (await isEndpointReachable(DEFAULT_OTLP_HTTP_ENDPOINT)) {
        endpoint = DEFAULT_OTLP_HTTP_ENDPOINT;
        useGrpc = false;
        debug(`HTTP endpoint reachable: ${endpoint}`);
      } else {
        // Try gRPC (port 4317)
        debug(`HTTP unreachable, checking gRPC endpoint: ${DEFAULT_OTLP_GRPC_ENDPOINT}`);
        if (await isEndpointReachable(DEFAULT_OTLP_GRPC_ENDPOINT)) {
          endpoint = DEFAULT_OTLP_GRPC_ENDPOINT;
          useGrpc = true;
          debug(`gRPC endpoint reachable: ${endpoint}`);
        } else {
          debug('No OTLP endpoints reachable, falling back to no-op');
          exporterType = 'none';
        }
      }
    }
  } else if (exporterType === 'otlp') {
    // Skip endpoint check but still need to determine endpoint
    endpoint = options.endpoint ?? config.otlpEndpoint ?? DEFAULT_OTLP_HTTP_ENDPOINT;
    useGrpc = new URL(endpoint).port === '4317';
  }

  // Handle no-op case first to avoid any allocations (unless custom exporter provided)
  if (exporterType === 'none' && options.customExporter === undefined) {
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

  // Create exporter based on type (or use custom exporter for testing)
  let exporter: SpanExporter;
  if (options.customExporter !== undefined) {
    debug('Using custom span exporter');
    exporter = options.customExporter;
  } else {
    switch (exporterType) {
      case 'otlp':
        if (useGrpc) {
          debug(`Creating OTLP gRPC exporter for ${endpoint ?? 'default'}`);
          exporter = new OTLPGrpcExporter({
            url: endpoint,
          });
        } else {
          debug(`Creating OTLP HTTP exporter for ${endpoint ?? 'default'}`);
          exporter = new OTLPHttpExporter({
            url: endpoint,
          });
        }
        break;
      case 'console':
        debug('Creating console exporter');
        exporter = new ConsoleSpanExporter();
        break;
      case 'none':
        // Should not reach here if customExporter is undefined, but TypeScript needs this
        debug('No exporter configured (no-op mode)');
        initResult = {
          enabled: false,
          exporterType: 'none',
          serviceName,
        };
        initialized = true;
        return successResponse(initResult, 'Telemetry initialized with none exporter');
    }
  }

  // Create resource and provider only when we have an exporter
  // In OTel SDK 2.x, use resourceFromAttributes instead of new Resource()
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
  });

  tracerProvider = new BasicTracerProvider({
    resource,
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  // In OTel SDK 2.x, use trace.setGlobalTracerProvider() instead of provider.register()
  trace.setGlobalTracerProvider(tracerProvider);

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
    // Disable the global tracer provider to allow re-initialization
    // This is necessary for testing scenarios where we need fresh state
    trace.disable();
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
