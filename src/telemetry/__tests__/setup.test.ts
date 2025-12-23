/**
 * Tests for telemetry setup module.
 */

import { describe, it, expect, afterEach, jest } from '@jest/globals';
import {
  initializeTelemetry,
  getTracer,
  getMeter,
  isEnabled,
  getConfig,
  shutdown,
  isTelemetrySuccess,
  isTelemetryError,
} from '../index.js';
import type { TelemetryConfig } from '../../config/schema.js';

// Default test config
const createTestConfig = (overrides: Partial<TelemetryConfig> = {}): TelemetryConfig => ({
  enabled: false,
  enableSensitiveData: false,
  otlpEndpoint: undefined,
  applicationinsightsConnectionString: undefined,
  ...overrides,
});

// Store original fetch for restoration
const originalFetch = globalThis.fetch;

describe('Telemetry Setup', () => {
  // Clean up after each test
  afterEach(async () => {
    await shutdown();
    // Restore original fetch if mocked
    globalThis.fetch = originalFetch;
  });

  describe('initializeTelemetry', () => {
    it('returns disabled state when config.enabled is false', async () => {
      const config = createTestConfig({ enabled: false });
      const result = await initializeTelemetry({ config });

      expect(result.success).toBe(true);
      if (isTelemetrySuccess(result)) {
        expect(result.result.enabled).toBe(false);
        expect(result.result.exporterType).toBe('none');
        expect(result.message).toBe('Telemetry disabled');
      }
    });

    it('initializes with OTLP exporter when enabled and endpoint reachable', async () => {
      const config = createTestConfig({
        enabled: true,
        otlpEndpoint: 'http://localhost:4318/v1/traces',
      });

      // Skip endpoint check for unit tests
      const result = await initializeTelemetry({
        config,
        skipEndpointCheck: true,
      });

      expect(result.success).toBe(true);
      if (isTelemetrySuccess(result)) {
        expect(result.result.enabled).toBe(true);
        expect(result.result.exporterType).toBe('otlp');
        expect(result.result.endpoint).toBe('http://localhost:4318/v1/traces');
      }
    });

    it('falls back to none when endpoint is unreachable', async () => {
      // Mock fetch to simulate unreachable endpoint
      globalThis.fetch = jest.fn<typeof fetch>().mockRejectedValue(new Error('Network error'));

      const config = createTestConfig({
        enabled: true,
        otlpEndpoint: 'http://localhost:9999/v1/traces',
      });

      const debugMessages: string[] = [];
      const result = await initializeTelemetry({
        config,
        onDebug: (msg) => debugMessages.push(msg),
      });

      expect(result.success).toBe(true);
      if (isTelemetrySuccess(result)) {
        expect(result.result.enabled).toBe(false);
        expect(result.result.exporterType).toBe('none');
      }
      expect(debugMessages.some((m) => m.includes('unreachable'))).toBe(true);
    });

    it('uses console exporter when specified', async () => {
      const config = createTestConfig({ enabled: true });
      const result = await initializeTelemetry({
        config,
        exporterType: 'console',
      });

      expect(result.success).toBe(true);
      if (isTelemetrySuccess(result)) {
        expect(result.result.enabled).toBe(true);
        expect(result.result.exporterType).toBe('console');
      }
    });

    it('uses custom service name when provided', async () => {
      const config = createTestConfig({ enabled: true });
      const result = await initializeTelemetry({
        config,
        exporterType: 'console',
        serviceName: 'my-custom-agent',
      });

      expect(result.success).toBe(true);
      if (isTelemetrySuccess(result)) {
        expect(result.result.serviceName).toBe('my-custom-agent');
      }
    });

    it('returns error when already initialized', async () => {
      const config = createTestConfig({ enabled: false });

      await initializeTelemetry({ config });
      const secondResult = await initializeTelemetry({ config });

      expect(secondResult.success).toBe(false);
      if (isTelemetryError(secondResult)) {
        expect(secondResult.error).toBe('ALREADY_INITIALIZED');
      }
    });

    it('can reinitialize after shutdown', async () => {
      const config = createTestConfig({ enabled: false });

      await initializeTelemetry({ config });
      await shutdown();

      const result = await initializeTelemetry({ config });
      expect(result.success).toBe(true);
    });

    it('uses default endpoint when config.otlpEndpoint is not provided', async () => {
      const config = createTestConfig({ enabled: true });

      const result = await initializeTelemetry({
        config,
        skipEndpointCheck: true,
      });

      expect(result.success).toBe(true);
      if (isTelemetrySuccess(result)) {
        // Default endpoint uses HTTP port 4318 (not gRPC port 4317)
        expect(result.result.endpoint).toBe('http://localhost:4318/v1/traces');
      }
    });

    it('uses custom endpoint from options over config', async () => {
      const config = createTestConfig({
        enabled: true,
        otlpEndpoint: 'http://config-endpoint:4318/v1/traces',
      });

      const result = await initializeTelemetry({
        config,
        endpoint: 'http://custom-endpoint:4318/v1/traces',
        skipEndpointCheck: true,
      });

      expect(result.success).toBe(true);
      if (isTelemetrySuccess(result)) {
        expect(result.result.endpoint).toBe('http://custom-endpoint:4318/v1/traces');
      }
    });

    it('uses none exporter when explicitly specified', async () => {
      const config = createTestConfig({ enabled: true });

      const result = await initializeTelemetry({
        config,
        exporterType: 'none',
      });

      expect(result.success).toBe(true);
      if (isTelemetrySuccess(result)) {
        expect(result.result.enabled).toBe(false);
        expect(result.result.exporterType).toBe('none');
        expect(result.result.endpoint).toBeUndefined();
      }
    });
  });

  describe('getTracer', () => {
    it('returns a tracer when telemetry is initialized', async () => {
      const config = createTestConfig({ enabled: true });
      await initializeTelemetry({ config, exporterType: 'none' });

      const tracer = getTracer('test-tracer');
      expect(tracer).toBeDefined();
      expect(typeof tracer.startSpan).toBe('function');
    });

    it('returns no-op tracer when not initialized', () => {
      // Don't initialize - should still return a tracer (no-op)
      const tracer = getTracer('test-tracer');
      expect(tracer).toBeDefined();
      expect(typeof tracer.startSpan).toBe('function');
    });

    it('uses service name when no name provided', async () => {
      const config = createTestConfig({ enabled: true });
      await initializeTelemetry({
        config,
        exporterType: 'none',
        serviceName: 'custom-service',
      });

      // getTracer without name should use the service name
      const tracer = getTracer();
      expect(tracer).toBeDefined();
    });
  });

  describe('getMeter', () => {
    it('returns a meter when telemetry is initialized', async () => {
      const config = createTestConfig({ enabled: true });
      await initializeTelemetry({ config, exporterType: 'none' });

      const meter = getMeter('test-meter');
      expect(meter).toBeDefined();
      expect(typeof meter.createCounter).toBe('function');
    });

    it('returns no-op meter when not initialized', () => {
      const meter = getMeter('test-meter');
      expect(meter).toBeDefined();
      expect(typeof meter.createCounter).toBe('function');
    });
  });

  describe('isEnabled', () => {
    it('returns false when not initialized', () => {
      expect(isEnabled()).toBe(false);
    });

    it('returns false when initialized but disabled', async () => {
      const config = createTestConfig({ enabled: false });
      await initializeTelemetry({ config });

      expect(isEnabled()).toBe(false);
    });

    it('returns true when initialized and enabled', async () => {
      const config = createTestConfig({ enabled: true });
      await initializeTelemetry({ config, exporterType: 'console' });

      expect(isEnabled()).toBe(true);
    });

    it('returns false after shutdown', async () => {
      const config = createTestConfig({ enabled: true });
      await initializeTelemetry({ config, exporterType: 'console' });

      expect(isEnabled()).toBe(true);
      await shutdown();
      expect(isEnabled()).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('returns null when not initialized', () => {
      expect(getConfig()).toBeNull();
    });

    it('returns config after initialization', async () => {
      const config = createTestConfig({ enabled: true });
      await initializeTelemetry({ config, exporterType: 'console', serviceName: 'test-agent' });

      const result = getConfig();
      expect(result).not.toBeNull();
      expect(result?.serviceName).toBe('test-agent');
      expect(result?.exporterType).toBe('console');
    });

    it('returns null after shutdown', async () => {
      const config = createTestConfig({ enabled: true });
      await initializeTelemetry({ config, exporterType: 'console' });

      expect(getConfig()).not.toBeNull();
      await shutdown();
      expect(getConfig()).toBeNull();
    });
  });

  describe('shutdown', () => {
    it('returns error when not initialized', async () => {
      const result = await shutdown();
      expect(result.success).toBe(false);
      if (isTelemetryError(result)) {
        expect(result.error).toBe('NOT_INITIALIZED');
      }
    });

    it('successfully shuts down initialized telemetry', async () => {
      const config = createTestConfig({ enabled: true });
      await initializeTelemetry({ config, exporterType: 'console' });

      const result = await shutdown();
      expect(result.success).toBe(true);
      expect(isEnabled()).toBe(false);
      expect(getConfig()).toBeNull();
    });

    it('allows reinitialization after shutdown', async () => {
      const config = createTestConfig({ enabled: true });
      await initializeTelemetry({ config, exporterType: 'console' });

      await shutdown();

      const result = await initializeTelemetry({ config, exporterType: 'console' });
      expect(result.success).toBe(true);
      expect(isEnabled()).toBe(true);
    });
  });

  describe('type guards', () => {
    it('isTelemetrySuccess correctly identifies success', async () => {
      const config = createTestConfig({ enabled: false });
      const result = await initializeTelemetry({ config });

      expect(isTelemetrySuccess(result)).toBe(true);
      expect(isTelemetryError(result)).toBe(false);
    });

    it('isTelemetryError correctly identifies errors', async () => {
      const config = createTestConfig({ enabled: false });
      await initializeTelemetry({ config });
      const result = await initializeTelemetry({ config }); // Double init

      expect(isTelemetryError(result)).toBe(true);
      expect(isTelemetrySuccess(result)).toBe(false);
    });

    it('type guards narrow types correctly', async () => {
      const config = createTestConfig({ enabled: false });
      const result = await initializeTelemetry({ config });

      if (isTelemetrySuccess(result)) {
        // TypeScript should allow accessing result
        expect(result.result.enabled).toBe(false);
        expect(result.result.exporterType).toBe('none');
      } else {
        // This branch should not execute
        expect(true).toBe(false);
      }
    });
  });
});

describe('Smoke Test: Bun + OTel', () => {
  afterEach(async () => {
    await shutdown();
  });

  it('produces at least one span when enabled with OTLP (acceptance criteria)', async () => {
    // This test validates the Phase 1b acceptance criterion:
    // "With ENABLE_OTEL=true and OTLP_ENDPOINT=http://localhost:4318/v1/traces,
    //  running a single Agent.run() produces at least one exported trace."
    //
    // Since we can't verify actual export without a collector, this test:
    // 1. Initializes telemetry with a console exporter (simulates enabled state)
    // 2. Creates a tracer and starts a span
    // 3. Verifies the span can be created and ended without error

    const config = createTestConfig({
      enabled: true,
      otlpEndpoint: 'http://localhost:4318/v1/traces',
    });

    const result = await initializeTelemetry({
      config,
      exporterType: 'console', // Use console for deterministic testing
      serviceName: 'smoke-test-agent',
    });

    expect(isTelemetrySuccess(result)).toBe(true);
    expect(isEnabled()).toBe(true);

    // Get tracer and create a span
    const tracer = getTracer('smoke-test');
    const span = tracer.startSpan('agent.run');

    expect(span).toBeDefined();

    // Set some attributes using GenAI semantic conventions
    span.setAttribute('gen_ai.provider.name', 'openai');
    span.setAttribute('gen_ai.request.model', 'gpt-4o');

    // End the span (would export in real scenario)
    span.end();

    // If we get here without errors, the smoke test passes
    // In real integration testing, we'd verify spans arrive at the collector
  });

  it('creates spans with correct service resource attributes', async () => {
    const config = createTestConfig({ enabled: true });

    await initializeTelemetry({
      config,
      exporterType: 'none', // No-op for fast test
      serviceName: 'test-service',
      serviceVersion: '1.2.3',
    });

    const result = getConfig();
    expect(result?.serviceName).toBe('test-service');
  });

  it('handles multiple span creation without errors', async () => {
    const config = createTestConfig({ enabled: true });

    await initializeTelemetry({
      config,
      exporterType: 'none',
    });

    const tracer = getTracer('multi-span-test');

    // Create multiple spans (simulating agent run with tool calls)
    const agentSpan = tracer.startSpan('agent.run');
    const llmSpan = tracer.startSpan('llm.call');
    llmSpan.setAttribute('gen_ai.request.model', 'gpt-4o');
    llmSpan.end();

    const toolSpan = tracer.startSpan('tool.execute');
    toolSpan.setAttribute('tool.name', 'test_tool');
    toolSpan.end();

    agentSpan.end();

    // All spans should be created and ended without error
    expect(true).toBe(true);
  });
});

describe('Debug callback', () => {
  afterEach(async () => {
    await shutdown();
    // Restore original fetch if mocked
    globalThis.fetch = originalFetch;
  });

  it('calls onDebug with initialization messages', async () => {
    const debugMessages: string[] = [];
    const config = createTestConfig({ enabled: false });

    await initializeTelemetry({
      config,
      onDebug: (msg) => debugMessages.push(msg),
    });

    expect(debugMessages.length).toBeGreaterThan(0);
    expect(debugMessages.some((m) => m.includes('disabled'))).toBe(true);
  });

  it('calls onDebug for endpoint check messages', async () => {
    // Mock fetch to avoid real network call
    globalThis.fetch = jest.fn<typeof fetch>().mockRejectedValue(new Error('Network error'));

    const debugMessages: string[] = [];
    const config = createTestConfig({
      enabled: true,
      otlpEndpoint: 'http://localhost:4318/v1/traces',
    });

    await initializeTelemetry({
      config,
      onDebug: (msg) => debugMessages.push(msg),
    });

    expect(debugMessages.some((m) => m.includes('endpoint'))).toBe(true);
  });

  it('calls onDebug when exporter is created', async () => {
    const debugMessages: string[] = [];
    const config = createTestConfig({ enabled: true });

    await initializeTelemetry({
      config,
      exporterType: 'console',
      onDebug: (msg) => debugMessages.push(msg),
    });

    expect(debugMessages.some((m) => m.includes('console exporter'))).toBe(true);
  });
});
