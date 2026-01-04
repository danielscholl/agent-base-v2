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
    getUserConfigPath: jest.fn().mockReturnValue('/home/user/.agent/config.yaml'),
  })),
  NodeFileSystem: jest.fn().mockImplementation(() => ({})),
  deepMerge: jest.fn((target: Record<string, unknown>, source: Record<string, unknown>) => ({
    ...target,
    ...source,
  })),
  userConfigExists: jest.fn().mockResolvedValue(true),
  configFileExists: jest.fn().mockResolvedValue(true),
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
    // configInitHandler now delegates to configProviderHandler, so these tests
    // verify the init-as-provider-alias behavior

    it('requires interactive mode when no providers configured', async () => {
      // Mock no providers configured (triggers setup flow)
      const emptyConfig = {
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
      };
      loadConfig.mockResolvedValue({ success: true, result: emptyConfig });
      loadConfigFromFiles.mockResolvedValue({ success: true, result: emptyConfig });

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
      // Mock no providers configured (triggers setup flow)
      const emptyConfig = {
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
      };
      loadConfig.mockResolvedValue({ success: true, result: emptyConfig });
      loadConfigFromFiles.mockResolvedValue({ success: true, result: emptyConfig });

      const { configInitHandler } = await import('../config.js');
      const context = createMockContext({ withPrompt: true, promptResponses: ['99'] });
      const result = await configInitHandler('', context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid provider selection');
    });

    it('runs provider wizard and saves config on valid selection', async () => {
      // Mock no providers configured (triggers setup flow)
      const emptyConfig = {
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
      };
      loadConfig.mockResolvedValue({ success: true, result: emptyConfig });
      loadConfigFromFiles.mockResolvedValue({ success: true, result: emptyConfig });

      const { configInitHandler } = await import('../config.js');
      // Select OpenAI (1), provide API key, use default model
      const context = createMockContext({
        withPrompt: true,
        promptResponses: ['1', 'sk-test-key-123', ''],
      });
      const result = await configInitHandler('', context);

      expect(result.success).toBe(true);
      expect(result.message).toBe('openai configured');
      expect(context.outputs.some((o) => o.content.includes('configured as default'))).toBe(true);
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
      expect(context.outputs.some((o) => o.content.includes('/home/user/.agent/config.yaml'))).toBe(
        true
      );
      expect(result.success).toBe(true);
    });
  });

  describe('configProviderHandler', () => {
    describe('no arguments (list providers)', () => {
      it('shows provider list with status when providers are configured', async () => {
        const configWithProviders = {
          version: '1.0',
          providers: {
            default: 'openai',
            openai: { apiKey: 'test', model: 'gpt-4o' },
            anthropic: { apiKey: 'test2', model: 'claude-3' },
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
        };
        loadConfig.mockResolvedValue({ success: true, result: configWithProviders });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: configWithProviders });

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler('', context);

        expect(result.success).toBe(true);
        expect(result.message).toBe('Listed providers');
        expect(context.outputs.some((o) => o.content.includes('Provider Configuration'))).toBe(
          true
        );
        expect(context.outputs.some((o) => o.content.includes('openai'))).toBe(true);
        expect(context.outputs.some((o) => o.content.includes('✓ default'))).toBe(true);
      });

      it('starts interactive setup when no providers configured', async () => {
        const emptyConfig = {
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
        };
        loadConfig.mockResolvedValue({ success: true, result: emptyConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: emptyConfig });

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext({ withPrompt: false });
        const result = await configProviderHandler('', context);

        expect(result.success).toBe(false);
        expect(result.message).toBe('No prompt handler available');
        expect(context.outputs.some((o) => o.content.includes('Interactive mode required'))).toBe(
          true
        );
      });
    });

    describe('provider set command', () => {
      it('sets key=value pairs non-interactively', async () => {
        const baseConfig = {
          version: '1.0',
          providers: { default: 'openai', openai: { apiKey: 'existing', model: 'gpt-4o' } },
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
        loadConfig.mockResolvedValue({ success: true, result: baseConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: baseConfig });

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler(
          'set local baseUrl=http://localhost:11434/v1 model=qwen3:latest',
          context
        );

        expect(result.success).toBe(true);
        expect(result.message).toBe('local configured');
        expect(context.outputs.some((o) => o.content.includes('✓ local configured'))).toBe(true);
      });

      it('converts numeric fields correctly', async () => {
        const baseConfig = {
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
        };
        loadConfig.mockResolvedValue({ success: true, result: baseConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: baseConfig });

        const manager = await import('../../../config/manager.js');
        const mockSave = jest.fn().mockResolvedValue({ success: true, message: 'Saved' });
        (
          manager.ConfigManager as jest.MockedClass<typeof manager.ConfigManager>
        ).mockImplementation(() => ({
          save: mockSave,
          getUserConfigPath: jest.fn().mockReturnValue('/home/user/.agent/config.yaml'),
        }));

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler(
          'set openai apiKey=sk-test temperature=0.7 maxTokens=1000',
          context
        );

        expect(result.success).toBe(true);

        // Verify save was called with numeric conversion
        const savedConfig = mockSave.mock.calls[0][0];
        expect(savedConfig.providers.openai).toEqual({
          apiKey: 'sk-test',
          temperature: 0.7,
          maxTokens: 1000,
        });
      });

      it('converts boolean strings correctly', async () => {
        const baseConfig = {
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
        };
        loadConfig.mockResolvedValue({ success: true, result: baseConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: baseConfig });

        const manager = await import('../../../config/manager.js');
        const mockSave = jest.fn().mockResolvedValue({ success: true, message: 'Saved' });
        (
          manager.ConfigManager as jest.MockedClass<typeof manager.ConfigManager>
        ).mockImplementation(() => ({
          save: mockSave,
          getUserConfigPath: jest.fn().mockReturnValue('/home/user/.agent/config.yaml'),
        }));

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler(
          'set gemini apiKey=test useVertexai=true',
          context
        );

        expect(result.success).toBe(true);

        const savedConfig = mockSave.mock.calls[0][0];
        expect(savedConfig.providers.gemini.useVertexai).toBe(true);
      });

      it('shows error when provider name is missing', async () => {
        const baseConfig = {
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
        };
        loadConfig.mockResolvedValue({ success: true, result: baseConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: baseConfig });

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler('set', context);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Provider name required');
        expect(context.outputs.some((o) => o.content.includes('Usage:'))).toBe(true);
      });

      it('shows error when provider name is invalid', async () => {
        const baseConfig = {
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
        };
        loadConfig.mockResolvedValue({ success: true, result: baseConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: baseConfig });

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler('set invalid-provider apiKey=test', context);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Invalid provider name');
        expect(context.outputs.some((o) => o.content.includes('Unknown provider'))).toBe(true);
      });

      it('shows error when no key=value pairs provided', async () => {
        const baseConfig = {
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
        };
        loadConfig.mockResolvedValue({ success: true, result: baseConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: baseConfig });

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler('set openai', context);

        expect(result.success).toBe(false);
        expect(result.message).toBe('No values provided');
        expect(context.outputs.some((o) => o.content.includes('No configuration values'))).toBe(
          true
        );
      });

      it('shows error for invalid key=value format', async () => {
        const baseConfig = {
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
        };
        loadConfig.mockResolvedValue({ success: true, result: baseConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: baseConfig });

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler('set openai invalid-format', context);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Invalid key=value format');
        expect(context.outputs.some((o) => o.content.includes('Invalid format'))).toBe(true);
      });

      it('sets first provider as default automatically', async () => {
        const emptyConfig = {
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
        };
        loadConfig.mockResolvedValue({ success: true, result: emptyConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: emptyConfig });

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler(
          'set local baseUrl=http://localhost:11434/v1',
          context
        );

        expect(result.success).toBe(true);
        expect(context.outputs.some((o) => o.content.includes('(set as default)'))).toBe(true);
      });

      it('merges with existing provider config', async () => {
        const baseConfig = {
          version: '1.0',
          providers: {
            default: 'openai',
            openai: { apiKey: 'existing-key', model: 'gpt-4o', temperature: 0.5 },
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
        };
        loadConfig.mockResolvedValue({ success: true, result: baseConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: baseConfig });

        const manager = await import('../../../config/manager.js');
        const mockSave = jest.fn().mockResolvedValue({ success: true, message: 'Saved' });
        (
          manager.ConfigManager as jest.MockedClass<typeof manager.ConfigManager>
        ).mockImplementation(() => ({
          save: mockSave,
          getUserConfigPath: jest.fn().mockReturnValue('/home/user/.agent/config.yaml'),
        }));

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler('set openai model=gpt-4o-mini', context);

        expect(result.success).toBe(true);

        const savedConfig = mockSave.mock.calls[0][0];
        expect(savedConfig.providers.openai).toEqual({
          apiKey: 'existing-key',
          model: 'gpt-4o-mini',
          temperature: 0.5,
        });
      });
    });

    describe('provider default command', () => {
      it('sets default provider successfully', async () => {
        const baseConfig = {
          version: '1.0',
          providers: {
            default: 'openai',
            openai: { apiKey: 'test1', model: 'gpt-4o' },
            anthropic: { apiKey: 'test2', model: 'claude-3' },
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
        };
        loadConfig.mockResolvedValue({ success: true, result: baseConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: baseConfig });

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler('default anthropic', context);

        expect(result.success).toBe(true);
        expect(result.message).toBe('Default provider set to anthropic');
        expect(
          context.outputs.some((o) => o.content.includes('Default provider set to: anthropic'))
        ).toBe(true);
      });

      it('shows error when provider name is missing', async () => {
        const baseConfig = {
          version: '1.0',
          providers: { default: 'openai', openai: { apiKey: 'test', model: 'gpt-4o' } },
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
        loadConfig.mockResolvedValue({ success: true, result: baseConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: baseConfig });

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler('default', context);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Provider name required');
        expect(context.outputs.some((o) => o.content.includes('Usage:'))).toBe(true);
      });

      it('shows error when provider name is invalid', async () => {
        const baseConfig = {
          version: '1.0',
          providers: { default: 'openai', openai: { apiKey: 'test', model: 'gpt-4o' } },
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
        loadConfig.mockResolvedValue({ success: true, result: baseConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: baseConfig });

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler('default invalid-provider', context);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Invalid provider name');
        expect(context.outputs.some((o) => o.content.includes('Unknown provider'))).toBe(true);
      });

      it('shows warning when provider is not configured', async () => {
        const baseConfig = {
          version: '1.0',
          providers: { default: 'openai', openai: { apiKey: 'test', model: 'gpt-4o' } },
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
        loadConfig.mockResolvedValue({ success: true, result: baseConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: baseConfig });

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler('default anthropic', context);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Provider not configured');
        expect(
          context.outputs.some((o) => o.content.includes("Provider 'anthropic' is not configured"))
        ).toBe(true);
      });
    });

    describe('provider remove command', () => {
      it('removes provider successfully', async () => {
        const baseConfig = {
          version: '1.0',
          providers: {
            default: 'openai',
            openai: { apiKey: 'test1', model: 'gpt-4o' },
            anthropic: { apiKey: 'test2', model: 'claude-3' },
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
        };
        loadConfig.mockResolvedValue({ success: true, result: baseConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: baseConfig });

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler('remove anthropic', context);

        expect(result.success).toBe(true);
        expect(result.message).toBe('anthropic removed');
        expect(context.outputs.some((o) => o.content.includes('✓ anthropic removed'))).toBe(true);
      });

      it('updates default when removing default provider', async () => {
        const baseConfig = {
          version: '1.0',
          providers: {
            default: 'openai',
            openai: { apiKey: 'test1', model: 'gpt-4o' },
            anthropic: { apiKey: 'test2', model: 'claude-3' },
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
        };
        loadConfig.mockResolvedValue({ success: true, result: baseConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: baseConfig });

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler('remove openai', context);

        expect(result.success).toBe(true);
        expect(context.outputs.some((o) => o.content.includes('New default:'))).toBe(true);
      });

      it('shows error when provider name is missing', async () => {
        const baseConfig = {
          version: '1.0',
          providers: { default: 'openai', openai: { apiKey: 'test', model: 'gpt-4o' } },
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
        loadConfig.mockResolvedValue({ success: true, result: baseConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: baseConfig });

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler('remove', context);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Provider name required');
        expect(context.outputs.some((o) => o.content.includes('Usage:'))).toBe(true);
      });

      it('shows error when provider name is invalid', async () => {
        const baseConfig = {
          version: '1.0',
          providers: { default: 'openai', openai: { apiKey: 'test', model: 'gpt-4o' } },
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
        loadConfig.mockResolvedValue({ success: true, result: baseConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: baseConfig });

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler('remove invalid-provider', context);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Invalid provider name');
        expect(context.outputs.some((o) => o.content.includes('Unknown provider'))).toBe(true);
      });

      it('shows warning when provider is not configured', async () => {
        const baseConfig = {
          version: '1.0',
          providers: { default: 'openai', openai: { apiKey: 'test', model: 'gpt-4o' } },
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
        loadConfig.mockResolvedValue({ success: true, result: baseConfig });
        loadConfigFromFiles.mockResolvedValue({ success: true, result: baseConfig });

        const { configProviderHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configProviderHandler('remove anthropic', context);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Provider not configured');
        expect(
          context.outputs.some((o) => o.content.includes("Provider 'anthropic' is not configured"))
        ).toBe(true);
      });
    });
  });
});
