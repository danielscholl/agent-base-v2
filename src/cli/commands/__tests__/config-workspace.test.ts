/**
 * Tests for workspace config command handlers.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { CommandContext } from '../types.js';
import type { AppConfig } from '../../../config/schema.js';
import type { WorkspaceInitResult } from '../../../tools/workspace.js';

// Mock workspace module - use getWorkspaceInfo (read-only, no env mutation)
const mockGetWorkspaceInfo = jest.fn<() => Promise<WorkspaceInitResult>>();
jest.unstable_mockModule('../../../tools/workspace.js', () => ({
  getWorkspaceInfo: mockGetWorkspaceInfo,
}));

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
  getProviderWizards: jest.fn().mockReturnValue([]),
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

// Mock node:fs/promises for set command path checking
const mockStat = jest.fn();
const mockMkdir = jest.fn();
jest.unstable_mockModule('node:fs/promises', () => ({
  stat: mockStat,
  mkdir: mockMkdir,
}));

// Mock node:path for path resolution
jest.unstable_mockModule('node:path', () => ({
  resolve: jest.fn((base: string, p: string) => (p.startsWith('/') ? p : `${base}/${p}`)),
}));

interface OutputEntry {
  content: string;
  type?: string;
}

function createMockContext(
  options: { withPrompt?: boolean; promptResponses?: string[]; isInteractive?: boolean } = {}
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
    isInteractive: options.isInteractive,
    outputs,
    exitCalled: false,
    promptCalls,
  };
}

describe('workspace config command handlers', () => {
  let loadConfig: jest.MockedFunction<
    () => Promise<{ success: boolean; result?: AppConfig; message?: string }>
  >;
  let loadConfigFromFiles: jest.MockedFunction<
    () => Promise<{ success: boolean; result?: AppConfig; message?: string }>
  >;

  const baseConfig: AppConfig = {
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

  beforeEach(async () => {
    jest.clearAllMocks();
    const manager = await import('../../../config/manager.js');
    loadConfig = manager.loadConfig as typeof loadConfig;
    loadConfigFromFiles = manager.loadConfigFromFiles as typeof loadConfigFromFiles;

    // Default mock implementations
    loadConfig.mockResolvedValue({ success: true, result: baseConfig });
    loadConfigFromFiles.mockResolvedValue({ success: true, result: baseConfig });
    mockGetWorkspaceInfo.mockResolvedValue({
      workspaceRoot: '/home/user/project',
      source: 'cwd',
    });
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockMkdir.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('configShowHandler', () => {
    it('displays workspace root in configuration table', async () => {
      mockGetWorkspaceInfo.mockResolvedValue({
        workspaceRoot: '/home/user/project',
        source: 'cwd',
      });

      const { configShowHandler } = await import('../config.js');
      const context = createMockContext();
      const result = await configShowHandler('', context);

      expect(result.success).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Workspace Root'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('/home/user/project'))).toBe(true);
    });

    it('displays workspace source as current directory', async () => {
      mockGetWorkspaceInfo.mockResolvedValue({
        workspaceRoot: '/home/user/project',
        source: 'cwd',
      });

      const { configShowHandler } = await import('../config.js');
      const context = createMockContext();
      await configShowHandler('', context);

      expect(context.outputs.some((o) => o.content.includes('current directory'))).toBe(true);
    });

    it('displays workspace source as env variable', async () => {
      mockGetWorkspaceInfo.mockResolvedValue({
        workspaceRoot: '/workspace',
        source: 'env',
      });

      const { configShowHandler } = await import('../config.js');
      const context = createMockContext();
      await configShowHandler('', context);

      expect(context.outputs.some((o) => o.content.includes('env variable'))).toBe(true);
    });

    it('displays workspace source as config file', async () => {
      mockGetWorkspaceInfo.mockResolvedValue({
        workspaceRoot: '/configured/path',
        source: 'config',
      });

      const { configShowHandler } = await import('../config.js');
      const context = createMockContext();
      await configShowHandler('', context);

      expect(context.outputs.some((o) => o.content.includes('config file'))).toBe(true);
    });

    it('shows warning when config is overridden by env', async () => {
      mockGetWorkspaceInfo.mockResolvedValue({
        workspaceRoot: '/env/workspace',
        source: 'env',
        warning: 'Config was overridden by env var',
      });

      const { configShowHandler } = await import('../config.js');
      const context = createMockContext();
      await configShowHandler('', context);

      expect(context.outputs.some((o) => o.content.includes('config overridden'))).toBe(true);
    });
  });

  describe('configWorkspaceHandler', () => {
    describe('display mode (no args)', () => {
      it('shows current workspace root', async () => {
        mockGetWorkspaceInfo.mockResolvedValue({
          workspaceRoot: '/home/user/myproject',
          source: 'cwd',
        });

        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configWorkspaceHandler('', context);

        expect(result.success).toBe(true);
        expect(context.outputs.some((o) => o.content.includes('Workspace Configuration'))).toBe(
          true
        );
        expect(context.outputs.some((o) => o.content.includes('/home/user/myproject'))).toBe(true);
      });

      it('shows source as env variable', async () => {
        mockGetWorkspaceInfo.mockResolvedValue({
          workspaceRoot: '/env/workspace',
          source: 'env',
        });

        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext();
        await configWorkspaceHandler('', context);

        expect(context.outputs.some((o) => o.content.includes('AGENT_WORKSPACE_ROOT'))).toBe(true);
      });

      it('shows source as config file', async () => {
        mockGetWorkspaceInfo.mockResolvedValue({
          workspaceRoot: '/config/workspace',
          source: 'config',
        });

        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext();
        await configWorkspaceHandler('', context);

        expect(context.outputs.some((o) => o.content.includes('config file'))).toBe(true);
      });

      it('shows warning when config is overridden by env', async () => {
        mockGetWorkspaceInfo.mockResolvedValue({
          workspaceRoot: '/env/workspace',
          source: 'env',
          warning: 'Config overridden by env var',
        });

        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext();
        await configWorkspaceHandler('', context);

        expect(context.outputs.some((o) => o.content.includes('Warning'))).toBe(true);
        expect(context.outputs.some((o) => o.content.includes('Config overridden'))).toBe(true);
      });

      it('shows configured value when not used due to env override', async () => {
        const configWithWorkspace = {
          ...baseConfig,
          agent: { ...baseConfig.agent, workspaceRoot: '/configured/path' },
        };
        loadConfigFromFiles.mockResolvedValue({ success: true, result: configWithWorkspace });

        mockGetWorkspaceInfo.mockResolvedValue({
          workspaceRoot: '/env/workspace',
          source: 'env',
        });

        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext();
        await configWorkspaceHandler('', context);

        expect(context.outputs.some((o) => o.content.includes('Config value'))).toBe(true);
        expect(context.outputs.some((o) => o.content.includes('/configured/path'))).toBe(true);
        expect(context.outputs.some((o) => o.content.includes('not used'))).toBe(true);
      });

      it('uses default config when loadConfigFromFiles fails', async () => {
        loadConfigFromFiles.mockResolvedValue({
          success: false,
          message: 'Config file not found',
        });

        mockGetWorkspaceInfo.mockResolvedValue({
          workspaceRoot: '/default/workspace',
          source: 'cwd',
        });

        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configWorkspaceHandler('', context);

        expect(result.success).toBe(true);
        expect(context.outputs.some((o) => o.content.includes('Workspace Configuration'))).toBe(
          true
        );
      });
    });

    describe('set command', () => {
      it('shows error when path is missing and no prompt available', async () => {
        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configWorkspaceHandler('set', context);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Path required');
        expect(context.outputs.some((o) => o.content.includes('Usage:'))).toBe(true);
      });

      it('prompts for path in interactive mode when not provided', async () => {
        const manager = await import('../../../config/manager.js');
        const mockSave = jest.fn().mockResolvedValue({ success: true, message: 'Saved' });
        (
          manager.ConfigManager as jest.MockedClass<typeof manager.ConfigManager>
        ).mockImplementation(() => ({
          save: mockSave,
          getUserConfigPath: jest.fn().mockReturnValue('/home/user/.agent/config.yaml'),
        }));

        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext({
          isInteractive: true,
          withPrompt: true,
          promptResponses: ['/prompted/path'],
        });
        const result = await configWorkspaceHandler('set', context);

        expect(result.success).toBe(true);
        expect(context.promptCalls).toContain('Enter workspace root path:');
        expect(result.message).toContain('/prompted/path');
      });

      it('cancels when empty path provided in prompt', async () => {
        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext({
          isInteractive: true,
          withPrompt: true,
          promptResponses: [''],
        });
        const result = await configWorkspaceHandler('set', context);

        expect(result.success).toBe(false);
        expect(result.message).toBe('No path provided');
        expect(context.outputs.some((o) => o.content.includes('operation cancelled'))).toBe(true);
      });

      it('sets workspace root in interactive mode with path argument', async () => {
        const manager = await import('../../../config/manager.js');
        const mockSave = jest.fn().mockResolvedValue({ success: true, message: 'Saved' });
        (
          manager.ConfigManager as jest.MockedClass<typeof manager.ConfigManager>
        ).mockImplementation(() => ({
          save: mockSave,
          getUserConfigPath: jest.fn().mockReturnValue('/home/user/.agent/config.yaml'),
        }));

        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext({ isInteractive: true, withPrompt: true });
        const result = await configWorkspaceHandler('set /some/path', context);

        expect(result.success).toBe(true);
        expect(result.message).toContain('/some/path');
      });

      it('sets workspace root to absolute path', async () => {
        const manager = await import('../../../config/manager.js');
        const mockSave = jest.fn().mockResolvedValue({ success: true, message: 'Saved' });
        (
          manager.ConfigManager as jest.MockedClass<typeof manager.ConfigManager>
        ).mockImplementation(() => ({
          save: mockSave,
          getUserConfigPath: jest.fn().mockReturnValue('/home/user/.agent/config.yaml'),
        }));

        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configWorkspaceHandler('set /absolute/path', context);

        expect(result.success).toBe(true);
        expect(result.message).toContain('/absolute/path');
        expect(context.outputs.some((o) => o.content.includes('Workspace root set'))).toBe(true);

        // Verify save was called with correct workspaceRoot
        expect(mockSave).toHaveBeenCalledTimes(1);
        const savedConfig = mockSave.mock.calls[0][0] as AppConfig;
        expect(savedConfig.agent.workspaceRoot).toBe('/absolute/path');
      });

      it('warns when path does not exist (no prompt)', async () => {
        mockStat.mockRejectedValue(new Error('ENOENT'));

        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext();
        await configWorkspaceHandler('set /nonexistent/path', context);

        expect(context.outputs.some((o) => o.content.includes('does not exist yet'))).toBe(true);
      });

      it('offers to create directory when path does not exist (with prompt)', async () => {
        mockStat.mockRejectedValue(new Error('ENOENT'));

        const manager = await import('../../../config/manager.js');
        const mockSave = jest.fn().mockResolvedValue({ success: true, message: 'Saved' });
        (
          manager.ConfigManager as jest.MockedClass<typeof manager.ConfigManager>
        ).mockImplementation(() => ({
          save: mockSave,
          getUserConfigPath: jest.fn().mockReturnValue('/home/user/.agent/config.yaml'),
        }));

        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext({
          withPrompt: true,
          promptResponses: ['y'],
        });
        const result = await configWorkspaceHandler('set /nonexistent/path', context);

        expect(result.success).toBe(true);
        expect(context.promptCalls.some((q) => q.includes('Create it?'))).toBe(true);
        expect(mockMkdir).toHaveBeenCalledWith('/nonexistent/path', { recursive: true });
        expect(context.outputs.some((o) => o.content.includes('Created directory'))).toBe(true);
      });

      it('does not create directory when user declines', async () => {
        mockStat.mockRejectedValue(new Error('ENOENT'));

        const manager = await import('../../../config/manager.js');
        const mockSave = jest.fn().mockResolvedValue({ success: true, message: 'Saved' });
        (
          manager.ConfigManager as jest.MockedClass<typeof manager.ConfigManager>
        ).mockImplementation(() => ({
          save: mockSave,
          getUserConfigPath: jest.fn().mockReturnValue('/home/user/.agent/config.yaml'),
        }));

        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext({
          withPrompt: true,
          promptResponses: ['n'],
        });
        const result = await configWorkspaceHandler('set /nonexistent/path', context);

        expect(result.success).toBe(true);
        expect(mockMkdir).not.toHaveBeenCalled();
        expect(context.outputs.some((o) => o.content.includes('does not exist yet'))).toBe(true);
      });

      it('handles mkdir failure gracefully', async () => {
        mockStat.mockRejectedValue(new Error('ENOENT'));
        mockMkdir.mockRejectedValue(new Error('Permission denied'));

        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext({
          withPrompt: true,
          promptResponses: ['y'],
        });
        const result = await configWorkspaceHandler('set /nonexistent/path', context);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Failed to create directory');
        expect(context.outputs.some((o) => o.content.includes('Failed to create directory'))).toBe(
          true
        );
      });

      it('warns when path is not a directory', async () => {
        mockStat.mockResolvedValue({ isDirectory: () => false });

        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext();
        await configWorkspaceHandler('set /path/to/file.txt', context);

        expect(context.outputs.some((o) => o.content.includes('not a directory'))).toBe(true);
      });

      it('warns when env var will override config', async () => {
        // Temporarily set env var
        const originalEnv = process.env['AGENT_WORKSPACE_ROOT'];
        process.env['AGENT_WORKSPACE_ROOT'] = '/env/workspace';

        try {
          const { configWorkspaceHandler } = await import('../config.js');
          const context = createMockContext();
          await configWorkspaceHandler('set /new/path', context);

          expect(
            context.outputs.some((o) => o.content.includes('AGENT_WORKSPACE_ROOT env var'))
          ).toBe(true);
          expect(context.outputs.some((o) => o.content.includes('will override'))).toBe(true);
        } finally {
          if (originalEnv === undefined) {
            delete process.env['AGENT_WORKSPACE_ROOT'];
          } else {
            process.env['AGENT_WORKSPACE_ROOT'] = originalEnv;
          }
        }
      });

      it('returns error when save fails', async () => {
        const manager = await import('../../../config/manager.js');
        const mockSave = jest
          .fn()
          .mockResolvedValue({ success: false, message: 'Permission denied' });
        (
          manager.ConfigManager as jest.MockedClass<typeof manager.ConfigManager>
        ).mockImplementation(() => ({
          save: mockSave,
          getUserConfigPath: jest.fn().mockReturnValue('/home/user/.agent/config.yaml'),
        }));

        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configWorkspaceHandler('set /new/path', context);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Permission denied');
        expect(context.outputs.some((o) => o.content.includes('Failed to save'))).toBe(true);
      });
    });

    describe('clear command', () => {
      it('clears workspace in interactive mode', async () => {
        const manager = await import('../../../config/manager.js');
        const mockSave = jest.fn().mockResolvedValue({ success: true, message: 'Saved' });
        (
          manager.ConfigManager as jest.MockedClass<typeof manager.ConfigManager>
        ).mockImplementation(() => ({
          save: mockSave,
          getUserConfigPath: jest.fn().mockReturnValue('/home/user/.agent/config.yaml'),
        }));

        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext({ isInteractive: true });
        const result = await configWorkspaceHandler('clear', context);

        expect(result.success).toBe(true);
        expect(result.message).toBe('Workspace cleared');
      });

      it('clears workspace root from config', async () => {
        const manager = await import('../../../config/manager.js');
        const mockSave = jest.fn().mockResolvedValue({ success: true, message: 'Saved' });
        (
          manager.ConfigManager as jest.MockedClass<typeof manager.ConfigManager>
        ).mockImplementation(() => ({
          save: mockSave,
          getUserConfigPath: jest.fn().mockReturnValue('/home/user/.agent/config.yaml'),
        }));

        const configWithWorkspace = {
          ...baseConfig,
          agent: { ...baseConfig.agent, workspaceRoot: '/configured/path' },
        };
        loadConfigFromFiles.mockResolvedValue({ success: true, result: configWithWorkspace });

        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configWorkspaceHandler('clear', context);

        expect(result.success).toBe(true);
        expect(result.message).toBe('Workspace cleared');
        expect(context.outputs.some((o) => o.content.includes('cleared from config'))).toBe(true);
        expect(context.outputs.some((o) => o.content.includes('current directory'))).toBe(true);

        // Verify save was called with undefined workspaceRoot
        expect(mockSave).toHaveBeenCalledTimes(1);
        const savedConfig = mockSave.mock.calls[0][0] as AppConfig;
        expect(savedConfig.agent.workspaceRoot).toBeUndefined();
      });

      it('returns error when save fails', async () => {
        const manager = await import('../../../config/manager.js');
        const mockSave = jest.fn().mockResolvedValue({ success: false, message: 'Write error' });
        (
          manager.ConfigManager as jest.MockedClass<typeof manager.ConfigManager>
        ).mockImplementation(() => ({
          save: mockSave,
          getUserConfigPath: jest.fn().mockReturnValue('/home/user/.agent/config.yaml'),
        }));

        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configWorkspaceHandler('clear', context);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Write error');
        expect(context.outputs.some((o) => o.content.includes('Failed to save'))).toBe(true);
      });
    });

    describe('unknown command', () => {
      it('shows error for unknown workspace command', async () => {
        const { configWorkspaceHandler } = await import('../config.js');
        const context = createMockContext();
        const result = await configWorkspaceHandler('invalid', context);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Unknown command');
        expect(context.outputs.some((o) => o.content.includes('Unknown workspace command'))).toBe(
          true
        );
        expect(context.outputs.some((o) => o.content.includes('Usage:'))).toBe(true);
      });
    });
  });

  describe('configHandler routes workspace subcommand', () => {
    it('routes workspace to configWorkspaceHandler', async () => {
      mockGetWorkspaceInfo.mockResolvedValue({
        workspaceRoot: '/home/user/project',
        source: 'cwd',
      });

      const { configHandler } = await import('../config.js');
      const context = createMockContext();
      const result = await configHandler('workspace', context);

      expect(result.success).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Workspace Configuration'))).toBe(true);
    });

    it('allows set in interactive mode with path', async () => {
      const manager = await import('../../../config/manager.js');
      const mockSave = jest.fn().mockResolvedValue({ success: true, message: 'Saved' });
      (manager.ConfigManager as jest.MockedClass<typeof manager.ConfigManager>).mockImplementation(
        () => ({
          save: mockSave,
          getUserConfigPath: jest.fn().mockReturnValue('/home/user/.agent/config.yaml'),
        })
      );

      const { configHandler } = await import('../config.js');
      const context = createMockContext({ isInteractive: true, withPrompt: true });
      const result = await configHandler('workspace set /path', context);

      expect(result.success).toBe(true);
      expect(result.message).toContain('/path');
    });
  });
});
