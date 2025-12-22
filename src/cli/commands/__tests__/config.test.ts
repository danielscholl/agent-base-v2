/**
 * Tests for config command handlers.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { CommandContext } from '../types.js';
import type { AppConfig } from '../../../config/schema.js';
import type { ProviderInfo } from '../../../config/providers/index.js';

// Mock the config manager
jest.unstable_mockModule('../../../config/manager.js', () => ({
  loadConfig: jest.fn(),
  loadConfigFromFiles: jest.fn(),
  ConfigManager: jest.fn().mockImplementation(() => ({
    save: jest.fn().mockResolvedValue({ success: true, message: 'Saved' }),
    getUserConfigPath: jest.fn().mockReturnValue('/home/user/.agent/settings.json'),
  })),
}));

// Mock the provider wizards
jest.unstable_mockModule('../../../config/providers/index.js', () => ({
  getProviderWizards: jest.fn().mockReturnValue([
    {
      name: 'openai',
      displayName: 'OpenAI',
      description: 'GPT-4, GPT-4o, o1 models',
      authMethod: 'API Key',
      wizard: jest
        .fn()
        .mockResolvedValue({ success: true, config: { apiKey: 'test', model: 'gpt-4o' } }),
    },
    {
      name: 'anthropic',
      displayName: 'Anthropic',
      description: 'Claude models',
      authMethod: 'API Key',
      wizard: jest
        .fn()
        .mockResolvedValue({ success: true, config: { apiKey: 'test', model: 'claude-3' } }),
    },
  ] as ProviderInfo[]),
}));

// Mock default config
jest.unstable_mockModule('../../../config/schema.js', () => ({
  getDefaultConfig: jest.fn().mockReturnValue({
    version: '1.0',
    providers: { default: 'openai' },
    agent: { dataDir: '~/.agent', logLevel: 'info', filesystemWritesEnabled: true },
    memory: { enabled: false, type: 'local', historyLimit: 100 },
    session: { autoSave: true, maxSessions: 50 },
    skills: { disabledBundled: [], plugins: [] },
    telemetry: { enabled: false },
    retry: {},
  }),
}));

// Mock child_process for editor tests
const mockSpawn = jest.fn();
jest.unstable_mockModule('node:child_process', () => ({
  spawn: mockSpawn,
}));

interface OutputEntry {
  content: string;
  type?: string;
}

function createMockContext(
  options: { withPrompt?: boolean; promptResponses?: string[] } = {}
): CommandContext & {
  outputs: OutputEntry[];
  exitCalled: boolean;
  promptCalls: string[];
} {
  const outputs: OutputEntry[] = [];
  const promptCalls: string[] = [];
  let promptIndex = 0;

  return {
    config: {
      version: '1.0',
      providers: {
        default: 'openai',
        openai: { apiKey: 'test', model: 'gpt-4o' },
      },
      agent: { dataDir: '~/.agent', logLevel: 'info', filesystemWritesEnabled: true },
      memory: { enabled: false, type: 'local', historyLimit: 100 },
      session: { autoSave: true, maxSessions: 50 },
      skills: { disabledBundled: [], enabledBundled: [], plugins: [], scriptTimeout: 30000 },
      telemetry: { enabled: false, enableSensitiveData: false },
      retry: {
        enabled: true,
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        enableJitter: true,
      },
    },
    onOutput: (content: string, type?: string) => {
      outputs.push({ content, type });
    },
    onPrompt:
      options.withPrompt === true
        ? (question: string) => {
            promptCalls.push(question);
            return Promise.resolve(options.promptResponses?.[promptIndex++] ?? '');
          }
        : undefined,
    exit: () => {
      // noop for test
    },
    outputs,
    exitCalled: false,
    promptCalls,
  };
}

describe('config command handlers', () => {
  let loadConfig: jest.MockedFunction<
    () => Promise<{ success: boolean; result?: AppConfig; message?: string }>
  >;
  let loadConfigFromFiles: jest.MockedFunction<
    () => Promise<{ success: boolean; result?: AppConfig; message?: string }>
  >;

  beforeEach(async () => {
    jest.clearAllMocks();
    const manager = await import('../../../config/manager.js');
    loadConfig = manager.loadConfig as typeof loadConfig;
    loadConfigFromFiles = manager.loadConfigFromFiles as typeof loadConfigFromFiles;
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('configHandler', () => {
    it('routes to configShowHandler by default', async () => {
      const mockConfig = {
        version: '1.0',
        providers: { default: 'openai', openai: { model: 'gpt-4o' } },
        agent: { dataDir: '~/.agent', logLevel: 'info', filesystemWritesEnabled: true },
        memory: { enabled: false, type: 'local', historyLimit: 100 },
        session: { autoSave: true, maxSessions: 50 },
        skills: { disabledBundled: [], enabledBundled: [], plugins: [], scriptTimeout: 30000 },
        telemetry: { enabled: false, enableSensitiveData: false },
        retry: {
          enabled: true,
          maxRetries: 3,
          baseDelayMs: 1000,
          maxDelayMs: 10000,
          enableJitter: true,
        },
      };
      loadConfig.mockResolvedValue({ success: true, result: mockConfig });
      loadConfigFromFiles.mockResolvedValue({ success: true, result: mockConfig });

      const { configHandler } = await import('../config.js');
      const context = createMockContext();
      const result = await configHandler('', context);

      expect(result.success).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Agent Configuration'))).toBe(true);
    });

    it('shows error for unknown subcommand', async () => {
      const { configHandler } = await import('../config.js');
      const context = createMockContext();
      const result = await configHandler('unknown', context);

      expect(result.success).toBe(false);
      expect(context.outputs.some((o) => o.content.includes('Unknown subcommand'))).toBe(true);
    });
  });

  describe('configShowHandler', () => {
    it('displays formatted configuration', async () => {
      const mockConfig = {
        version: '1.0',
        providers: { default: 'openai', openai: { apiKey: 'sk-test', model: 'gpt-4o' } },
        agent: { dataDir: '~/.agent', logLevel: 'info', filesystemWritesEnabled: true },
        memory: { enabled: true, type: 'local', historyLimit: 100 },
        session: { autoSave: true, maxSessions: 50 },
        skills: { disabledBundled: [], enabledBundled: [], plugins: [], scriptTimeout: 30000 },
        telemetry: { enabled: false, enableSensitiveData: false },
        retry: {
          enabled: true,
          maxRetries: 3,
          baseDelayMs: 1000,
          maxDelayMs: 10000,
          enableJitter: true,
        },
      };
      loadConfig.mockResolvedValue({ success: true, result: mockConfig });
      loadConfigFromFiles.mockResolvedValue({ success: true, result: mockConfig });

      const { configShowHandler } = await import('../config.js');
      const context = createMockContext();
      const result = await configShowHandler('', context);

      expect(result.success).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Agent Configuration'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Enabled Providers'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Default Provider'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('openai'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Telemetry'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Memory'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Data Directory'))).toBe(true);
    });

    it('shows error when config fails to load', async () => {
      loadConfig.mockResolvedValue({
        success: false,
        message: 'Config file not found',
      });
      loadConfigFromFiles.mockResolvedValue({
        success: false,
        message: 'Config file not found',
      });

      const { configShowHandler } = await import('../config.js');
      const context = createMockContext();
      const result = await configShowHandler('', context);

      expect(result.success).toBe(false);
      expect(context.outputs.some((o) => o.content.includes('Failed to load config'))).toBe(true);
    });
  });

  describe('configInitHandler', () => {
    it('requires interactive mode', async () => {
      const { configInitHandler } = await import('../config.js');
      const context = createMockContext({ withPrompt: false });
      const result = await configInitHandler('', context);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No prompt handler');
      expect(context.outputs.some((o) => o.content.includes('Interactive mode required'))).toBe(
        true
      );
    });

    it('shows error for invalid provider selection', async () => {
      const { configInitHandler } = await import('../config.js');
      const context = createMockContext({ withPrompt: true, promptResponses: ['99'] });
      const result = await configInitHandler('', context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid provider selection');
    });

    it('runs provider wizard and saves config on valid selection', async () => {
      loadConfig.mockResolvedValue({
        success: true,
        result: {
          version: '1.0',
          providers: { default: 'openai' },
          agent: { dataDir: '~/.agent', logLevel: 'info', filesystemWritesEnabled: true },
          memory: { enabled: false, type: 'local', historyLimit: 100 },
          session: { autoSave: true, maxSessions: 50 },
          skills: { disabledBundled: [], enabledBundled: [], plugins: [], scriptTimeout: 30000 },
          telemetry: { enabled: false, enableSensitiveData: false },
          retry: {
            enabled: true,
            maxRetries: 3,
            baseDelayMs: 1000,
            maxDelayMs: 10000,
            enableJitter: true,
          },
        },
      });

      const { configInitHandler } = await import('../config.js');
      const context = createMockContext({ withPrompt: true, promptResponses: ['1'] });
      const result = await configInitHandler('', context);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Configuration initialized');
      expect(context.outputs.some((o) => o.content.includes('Configuration saved'))).toBe(true);
    });
  });

  describe('configEditHandler', () => {
    it('opens config file in editor', async () => {
      // Mock spawn to simulate successful editor open
      const eventHandlers: Record<string, ((arg: number | null | Error) => void)[]> = {};
      const mockProcess = {
        on: jest.fn((event: string, callback: (arg: number | null | Error) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);

          // Simulate editor closing successfully
          if (event === 'close') {
            setTimeout(() => {
              callback(0);
            }, 10);
          }
          return mockProcess;
        }),
      };
      mockSpawn.mockReturnValue(mockProcess);

      const { configEditHandler } = await import('../config.js');
      const context = createMockContext({ withPrompt: true });

      const result = await configEditHandler('', context);

      // Should output the config file path
      expect(
        context.outputs.some((o) => o.content.includes('/home/user/.agent/settings.json'))
      ).toBe(true);
      expect(result.success).toBe(true);
    });
  });
});
