/**
 * Telemetry module - OpenTelemetry setup and helpers.
 *
 * This module provides:
 * - initializeTelemetry() for one-time OTel setup
 * - getTracer() and getMeter() for creating tracers/meters
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
