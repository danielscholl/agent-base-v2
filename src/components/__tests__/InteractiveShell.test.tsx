/**
 * Tests for InteractiveShell component.
 */

import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render } from 'ink-testing-library';
import type { AgentCallbacks } from '../../agent/callbacks.js';

// Mock modules before importing
const mockLoadConfig = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('../../config/manager.js', () => ({
  loadConfig: mockLoadConfig,
}));

// Mock Agent that invokes callbacks properly
// InteractiveShell uses runStream(), which invokes onLLMStream and onAgentEnd
jest.unstable_mockModule('../../agent/agent.js', () => ({
  Agent: class MockAgent {
    private callbacks: AgentCallbacks | undefined;

    constructor(options: { callbacks?: AgentCallbacks }) {
      this.callbacks = options.callbacks;
    }

    run(_prompt: string): Promise<string> {
      this.callbacks?.onAgentEnd?.({}, 'Hello, world!');
      return Promise.resolve('Hello, world!');
    }

    async *runStream(_prompt: string): AsyncGenerator<string, void, unknown> {
      const chunks = ['Hello', ', ', 'world', '!'];
      for (const chunk of chunks) {
        this.callbacks?.onLLMStream?.({}, chunk);
        yield chunk;
        // Simulate async behavior
        await Promise.resolve();
      }
      this.callbacks?.onAgentEnd?.({}, 'Hello, world!');
    }
  },
}));

// Import after mocking
const { InteractiveShell } = await import('../InteractiveShell.js');

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

describe('InteractiveShell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: config loads successfully
    mockLoadConfig.mockResolvedValue({
      success: true,
      result: mockConfig,
      message: 'Config loaded',
    });
  });

  it('shows spinner while loading config', () => {
    // Make config loading take time
    mockLoadConfig.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ success: true, result: mockConfig, message: 'ok' });
          }, 100);
        })
    );

    const { lastFrame } = render(<InteractiveShell />);

    // Should show loading spinner initially
    expect(lastFrame()).toContain('Loading configuration...');
  });

  it('renders header with version after config loads', async () => {
    const { lastFrame } = render(<InteractiveShell />);

    // Wait for config load with polling
    const maxWait = 1000;
    const interval = 20;
    let elapsed = 0;
    while (elapsed < maxWait) {
      await new Promise((resolve) => {
        setTimeout(resolve, interval);
      });
      elapsed += interval;
      const frame = lastFrame();
      if (frame !== undefined && frame.includes('Agent Framework')) break;
    }

    // Should show header with version
    expect(lastFrame()).toContain('Agent Framework v0.1.0');
  });

  it('renders header with model info after config loads', async () => {
    const { lastFrame } = render(<InteractiveShell />);

    // Wait for config load with polling
    const maxWait = 1000;
    const interval = 20;
    let elapsed = 0;
    while (elapsed < maxWait) {
      await new Promise((resolve) => {
        setTimeout(resolve, interval);
      });
      elapsed += interval;
      const frame = lastFrame();
      if (frame !== undefined && frame.includes('openai')) break;
    }

    // Should show model info
    expect(lastFrame()).toContain('openai');
    expect(lastFrame()).toContain('gpt-4o');
  });

  it('shows welcome message when no messages exist', async () => {
    const { lastFrame } = render(<InteractiveShell />);

    // Wait for config load with polling
    const maxWait = 1000;
    const interval = 20;
    let elapsed = 0;
    while (elapsed < maxWait) {
      await new Promise((resolve) => {
        setTimeout(resolve, interval);
      });
      elapsed += interval;
      const frame = lastFrame();
      if (frame !== undefined && frame.includes('Type a message')) break;
    }

    // Should show welcome message
    expect(lastFrame()).toContain('Type a message to chat');
  });

  it('shows input prompt when not processing', async () => {
    const { lastFrame } = render(<InteractiveShell />);

    // Wait for config load with polling
    const maxWait = 1000;
    const interval = 20;
    let elapsed = 0;
    while (elapsed < maxWait) {
      await new Promise((resolve) => {
        setTimeout(resolve, interval);
      });
      elapsed += interval;
      const frame = lastFrame();
      if (frame !== undefined && frame.includes('>')) break;
    }

    // Should show input prompt (cursor indicator)
    expect(lastFrame()).toContain('>');
  });

  it('displays error when config loading fails', async () => {
    mockLoadConfig.mockResolvedValue({
      success: false,
      error: 'CONFIG_ERROR',
      message: 'Failed to load config file',
    });

    const { lastFrame } = render(<InteractiveShell />);

    // Wait for config load with polling
    const maxWait = 1000;
    const interval = 20;
    let elapsed = 0;
    while (elapsed < maxWait) {
      await new Promise((resolve) => {
        setTimeout(resolve, interval);
      });
      elapsed += interval;
      const frame = lastFrame();
      if (frame !== undefined && frame.includes('Error')) break;
    }

    // Should show error
    expect(lastFrame()).toContain('Error');
  });

  it('accepts resumeSession prop without error', () => {
    // Should render without throwing
    expect(() => {
      render(<InteractiveShell resumeSession={true} />);
    }).not.toThrow();
  });

  it('renders with default props', () => {
    // Should render without throwing
    expect(() => {
      render(<InteractiveShell />);
    }).not.toThrow();
  });
});
