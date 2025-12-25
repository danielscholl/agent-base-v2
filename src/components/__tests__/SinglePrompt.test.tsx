/**
 * Tests for SinglePrompt component.
 * Note: Tests are minimal due to complex async mock requirements.
 */

import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render } from 'ink-testing-library';
import type { AgentCallbacks } from '../../agent/callbacks.js';

let stderrWriteSpy: { mockRestore: () => void } | null = null;

// Mock modules before importing
const mockLoadConfig = jest.fn<() => Promise<unknown>>();
const mockConfigFileExists = jest.fn<() => Promise<boolean>>();

jest.unstable_mockModule('../../config/manager.js', () => ({
  loadConfig: mockLoadConfig,
  configFileExists: mockConfigFileExists,
}));

// Mock utils module
jest.unstable_mockModule('../../utils/index.js', () => ({
  resolveModelName: jest.fn((providerName: string) => {
    if (providerName === 'azure') return 'test-deployment';
    if (providerName === 'foundry') return 'test-model-deployment';
    return 'gpt-4o';
  }),
}));

// Mock telemetry module - include all exports used by cli/callbacks.js
// Create mock functions that return proper Promises
const mockInitializeTelemetry = (): Promise<{
  success: boolean;
  result: { enabled: boolean; exporterType: string; serviceName: string };
  message: string;
}> =>
  Promise.resolve({
    success: true,
    result: { enabled: false, exporterType: 'none', serviceName: 'test' },
    message: 'Telemetry disabled',
  });

const mockShutdown = (): Promise<{ success: boolean; message: string }> =>
  Promise.resolve({
    success: true,
    message: 'Shutdown complete',
  });

jest.unstable_mockModule('../../telemetry/index.js', () => ({
  initializeTelemetry: mockInitializeTelemetry,
  shutdown: mockShutdown,
  isEnabled: () => false,
  startAgentSpan: jest.fn(),
  endAgentSpan: jest.fn(),
  startLLMSpan: jest.fn(),
  endLLMSpan: jest.fn(),
  startToolSpan: jest.fn(),
  endToolSpan: jest.fn(),
  getSpanKey: (ctx: { traceId: string; spanId: string }) => `${ctx.traceId}:${ctx.spanId}`,
  mapProviderName: (name: string) => name,
  getTracer: () => ({
    startSpan: jest.fn().mockReturnValue({
      setAttribute: jest.fn(),
      setStatus: jest.fn(),
      end: jest.fn(),
    }),
  }),
  // GenAI semantic convention constants
  ATTR_GEN_AI_OPERATION_NAME: 'gen_ai.operation.name',
  ATTR_GEN_AI_PROVIDER_NAME: 'gen_ai.provider.name',
  ATTR_GEN_AI_REQUEST_MODEL: 'gen_ai.request.model',
  ATTR_GEN_AI_INPUT_MESSAGES: 'gen_ai.request.messages',
  ATTR_GEN_AI_TOOL_NAME: 'gen_ai.tool.name',
  ATTR_GEN_AI_TOOL_CALL_ID: 'gen_ai.tool.call.id',
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS: 'gen_ai.tool.call.arguments',
  GEN_AI_OPERATION: {
    CHAT: 'chat',
    EXECUTE_TOOL: 'execute_tool',
    INVOKE_AGENT: 'invoke_agent',
  },
}));

// Mock Agent that invokes callbacks properly
// - run(): Invokes onAgentEnd only (no streaming)
// - runStream(): Invokes onLLMStream for each chunk, then onAgentEnd
jest.unstable_mockModule('../../agent/agent.js', () => ({
  Agent: class MockAgent {
    private callbacks: AgentCallbacks | undefined;

    constructor(options: { callbacks?: AgentCallbacks }) {
      this.callbacks = options.callbacks;
    }

    run(_prompt: string): Promise<string> {
      // run() only invokes onAgentEnd, not onLLMStream
      this.callbacks?.onAgentEnd?.({}, 'Hello, world!');
      return Promise.resolve('Hello, world!');
    }

    async *runStream(_prompt: string): AsyncGenerator<string, void, unknown> {
      // runStream() invokes onLLMStream for each chunk
      const chunks = ['Hello', ', ', 'world', '!'];
      for (const chunk of chunks) {
        this.callbacks?.onLLMStream?.({}, chunk);
        yield chunk;
        // Simulate async behavior
        await Promise.resolve();
      }
      // Then invokes onAgentEnd with full response
      this.callbacks?.onAgentEnd?.({}, 'Hello, world!');
    }
  },
}));

// Import after mocking
const { SinglePrompt } = await import('../SinglePrompt.js');

// Mock config for testing
const mockConfig = {
  version: '0.1.0',
  providers: {
    default: 'openai',
    openai: { model: 'gpt-4o', apiKey: 'test-key' },
  },
  agent: { maxIterations: 10 },
  telemetry: { enabled: false },
  memory: { enabled: false },
  skills: { plugins: [], disabledBundled: [], enabledBundled: [] },
  retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 30000, multiplier: 2.0 },
};

describe('SinglePrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // SinglePrompt writes errors to stderr for scripting; silence during tests to avoid CI annotations/noise.
    stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((() => true) as never);
    // Default: config file exists
    mockConfigFileExists.mockResolvedValue(true);
    // Default: config loads successfully
    mockLoadConfig.mockResolvedValue({
      success: true,
      result: mockConfig,
      message: 'Config loaded',
    });
  });

  afterEach(() => {
    stderrWriteSpy?.mockRestore();
    stderrWriteSpy = null;
  });

  it('shows spinner while loading config in verbose mode', () => {
    // Make config loading take time
    mockLoadConfig.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ success: true, result: mockConfig, message: 'ok' });
          }, 100);
        })
    );

    // Verbose mode shows spinner
    const { lastFrame } = render(<SinglePrompt prompt="test" verbose={true} />);

    // Should show loading spinner initially
    expect(lastFrame()).toContain('Loading configuration...');
  });

  it('renders nothing while loading in non-verbose mode (clean scripting)', () => {
    // Make config loading take time
    mockLoadConfig.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ success: true, result: mockConfig, message: 'ok' });
          }, 100);
        })
    );

    // Non-verbose mode renders empty during loading
    const { lastFrame } = render(<SinglePrompt prompt="test" />);

    // Should render nothing (empty string or whitespace only)
    expect(lastFrame()?.trim()).toBe('');
  });

  it('displays error when config loading fails', async () => {
    mockLoadConfig.mockResolvedValue({
      success: false,
      error: 'CONFIG_ERROR',
      message: 'Failed to load config',
    });

    // In non-verbose mode, errors go to stderr and render empty
    // Just verify it doesn't throw
    const { lastFrame } = render(<SinglePrompt prompt="test" />);

    // Wait for async operations
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });

    // Non-verbose mode renders nothing on error (error is written to stderr)
    expect(lastFrame()?.trim()).toBe('');
  });

  it('displays result when agent completes successfully (non-verbose)', async () => {
    const { lastFrame } = render(<SinglePrompt prompt="Say hello" />);

    // Wait for async operations (config load + agent run) with polling
    // CI environments can be slower, so we poll instead of fixed timeout
    const maxWait = 2000;
    const interval = 50;
    let elapsed = 0;
    while (elapsed < maxWait) {
      await new Promise((resolve) => {
        setTimeout(resolve, interval);
      });
      elapsed += interval;
      const frame = lastFrame();
      if (frame !== undefined && frame.includes('Hello, world!')) break;
    }

    // Should show the result
    expect(lastFrame()).toContain('Hello, world!');
  });

  it('streams output in verbose mode using runStream', async () => {
    const { lastFrame } = render(<SinglePrompt prompt="Say hello" verbose={true} />);

    // Wait for async operations with polling
    const maxWait = 2000;
    const interval = 50;
    let elapsed = 0;
    while (elapsed < maxWait) {
      await new Promise((resolve) => {
        setTimeout(resolve, interval);
      });
      elapsed += interval;
      const frame = lastFrame();
      if (frame !== undefined && frame.includes('Hello, world!')) break;
    }

    // Should show the streamed output
    expect(lastFrame()).toContain('Hello, world!');
  });

  it('renders without throwing', () => {
    // Basic render test
    expect(() => {
      render(<SinglePrompt prompt="test" />);
    }).not.toThrow();
  });
});
