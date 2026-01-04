/**
 * Tests for InteractiveShell component.
 */

import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render } from 'ink-testing-library';
import type { AgentCallbacks } from '../../agent/callbacks.js';

// Mock modules before importing
const mockLoadConfig = jest.fn<() => Promise<unknown>>();
const mockConfigFileExists = jest.fn<() => Promise<boolean>>();
const mockLoadConfigFromFiles = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('../../config/manager.js', () => ({
  loadConfig: mockLoadConfig,
  loadConfigFromFiles: mockLoadConfigFromFiles,
  configFileExists: mockConfigFileExists,
  ConfigManager: class MockConfigManager {
    save(): Promise<{ success: boolean; message: string }> {
      return Promise.resolve({ success: true, message: 'Saved' });
    }
    getUserConfigPath(): string {
      return '/home/user/.agent/config.yaml';
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  NodeFileSystem: class MockNodeFileSystem {},
  deepMerge: jest.fn(),
}));

// Mock CLI commands module
jest.unstable_mockModule('../../cli/commands/index.js', () => ({
  executeCommand: jest.fn(),
  isCommand: jest.fn(() => false),
  getAutocompleteCommands: jest.fn(() => [
    { name: 'help', description: 'Show help message' },
    { name: 'clear', description: 'Clear screen and history' },
    { name: 'exit', description: 'Exit the shell' },
  ]),
}));

// Mock config command handler for setup flow
const mockConfigInitHandler =
  jest.fn<
    (
      args: string,
      context: { onOutput: (msg: string) => void }
    ) => Promise<{ success: boolean; message: string }>
  >();
jest.unstable_mockModule('../../cli/commands/config.js', () => ({
  configInitHandler: mockConfigInitHandler,
}));

// Mock CLI input module
jest.unstable_mockModule('../../cli/input/index.js', () => ({
  InputHistory: class MockInputHistory {
    add(): void {}
    previous(): string | undefined {
      return undefined;
    }
    next(): string | undefined {
      return undefined;
    }
    reset(): void {}
    getAll(): string[] {
      return [];
    }
    clear(): void {}
    getPosition(): number {
      return -1;
    }
  },
}));

// Mock resolveModelName function - must be defined before mock module
const mockResolveModelName = (
  providerName: string,
  providerConfig?: Record<string, unknown>
): string => {
  if (providerConfig === undefined) return 'unknown';
  if (providerName === 'azure') return 'test-deployment';
  if (providerName === 'foundry') return 'test-model-deployment';
  const model = providerConfig.model as string | undefined;
  return model !== undefined ? model : 'gpt-4o';
};

// Mock utils module for SessionManager
jest.unstable_mockModule('../../utils/index.js', () => ({
  SessionManager: class MockSessionManager {
    getLastSession(): Promise<string | null> {
      return Promise.resolve(null);
    }
    restoreSession(): Promise<null> {
      return Promise.resolve(null);
    }
    saveSession(): Promise<{ id: string }> {
      return Promise.resolve({ id: 'mock-session-id' });
    }
    listSessions(): Promise<[]> {
      return Promise.resolve([]);
    }
  },
  MessageHistory: class MockMessageHistory {
    add(): void {}
    addExchange(): void {}
    getRecent(): [] {
      return [];
    }
    getAllStored(): [] {
      return [];
    }
    isEmpty = true;
    clear(): void {}
  },
  resolveModelName: mockResolveModelName,
  isProviderConfigured: () => true,
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
  session: { autoSave: false, maxSessions: 50 },
};

describe('InteractiveShell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: config file exists
    mockConfigFileExists.mockResolvedValue(true);
    // Default: config loads successfully
    mockLoadConfig.mockResolvedValue({
      success: true,
      result: mockConfig,
      message: 'Config loaded',
    });
    // Default: loadConfigFromFiles returns same as loadConfig
    mockLoadConfigFromFiles.mockResolvedValue({
      success: true,
      result: mockConfig,
      message: 'Config loaded from files',
    });
    // Default: configInitHandler produces setup wizard output
    mockConfigInitHandler.mockImplementation((_args, context) => {
      context.onOutput('Agent Configuration Setup');
      context.onOutput('Select provider (1-7):');
      // Return success: false to stay in the shell (simulating user needs to configure)
      return Promise.resolve({ success: false, message: 'Setup cancelled' });
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
      if (frame !== undefined && frame.includes('Agent - Conversational Assistant')) break;
    }

    // Should show header with title
    expect(lastFrame()).toContain('Agent - Conversational Assistant');
  });

  it('renders header with model info after config loads', async () => {
    const { lastFrame } = render(<InteractiveShell />);

    // Wait for config load with polling - look for OpenAI (capitalized display name)
    const maxWait = 1000;
    const interval = 20;
    let elapsed = 0;
    while (elapsed < maxWait) {
      await new Promise((resolve) => {
        setTimeout(resolve, interval);
      });
      elapsed += interval;
      const frame = lastFrame();
      if (frame !== undefined && frame.includes('OpenAI')) break;
    }

    // Should show model info (provider display name is capitalized)
    expect(lastFrame()).toContain('OpenAI');
    expect(lastFrame()).toContain('gpt-4o');
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

  it('displays error when provider credentials are missing', async () => {
    // Mock config with no API key (default OpenAI provider, no credentials)
    const mockConfigNoCredentials = {
      version: '0.1.0',
      providers: {
        default: 'openai',
        openai: { model: 'gpt-4o' },
      },
      agent: { dataDir: '~/.agent', logLevel: 'info', filesystemWritesEnabled: true },
      telemetry: { enabled: false },
      memory: { enabled: false },
      skills: { plugins: [], disabledBundled: [], enabledBundled: [] },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 30000, multiplier: 2.0 },
      session: { autoSave: false, maxSessions: 50 },
    };

    mockLoadConfig.mockResolvedValue({
      success: true,
      result: mockConfigNoCredentials,
      message: 'Config loaded',
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
      if (frame !== undefined && frame.includes('config init')) break;
    }

    // Should show error about missing credentials
    const frame = lastFrame();
    expect(frame).toContain('Configuration Error');
    expect(frame).toContain('OpenAI provider requires an API key');
    expect(frame).toContain('agent config init');
  });

  it('runs config init flow when no config file exists', async () => {
    // Mock no config file
    mockConfigFileExists.mockResolvedValue(false);

    // Track when config init is called via object to allow mutation in closure
    const tracker = { configInitCalled: false };
    mockConfigInitHandler.mockImplementation((_args, context) => {
      tracker.configInitCalled = true;
      context.onOutput('Agent Configuration Setup');
      // Return success=false to show error state (but we verify it was called)
      return Promise.resolve({ success: false, message: 'Setup cancelled by test' });
    });

    const { lastFrame } = render(<InteractiveShell />);

    // Wait for config init to be invoked with polling
    const maxWait = 1000;
    const interval = 20;
    let elapsed = 0;
    while (elapsed < maxWait && !tracker.configInitCalled) {
      await new Promise((resolve) => {
        setTimeout(resolve, interval);
      });
      elapsed += interval;
    }

    // Verify configInitHandler was called (the key behavior we're testing)
    expect(mockConfigInitHandler).toHaveBeenCalled();

    // Wait for component to re-render with error state after handler failure
    // The error state takes time to propagate through React's render cycle
    elapsed = 0;
    let frame = lastFrame() ?? '';
    while (elapsed < maxWait && !frame.includes('Configuration Error')) {
      await new Promise((resolve) => {
        setTimeout(resolve, interval);
      });
      elapsed += interval;
      frame = lastFrame() ?? '';
    }

    // After handler completes with failure, should show error state
    expect(frame).toContain('Configuration Error');
    expect(frame).toContain('Setup cancelled by test');
  });
});
