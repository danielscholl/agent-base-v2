/**
 * Tests for ConfigManager.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ConfigManager, deepMerge, loadConfig, NodeFileSystem } from '../manager.js';
import { getDefaultConfig } from '../schema.js';
import type { IFileSystem, ConfigCallbacks } from '../types.js';
import type { IEnvReader } from '../env.js';

// Mock file system for testing
class MockFileSystem implements IFileSystem {
  private files: Map<string, string> = new Map();
  private permissions: Map<string, number> = new Map();

  readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      return Promise.reject(new Error(`ENOENT: no such file or directory: ${path}`));
    }
    return Promise.resolve(content);
  }

  writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
    return Promise.resolve();
  }

  exists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(path));
  }

  mkdir(_path: string): Promise<void> {
    // No-op for mock
    return Promise.resolve();
  }

  chmod(path: string, mode: number): Promise<void> {
    this.permissions.set(path, mode);
    return Promise.resolve();
  }

  resolvePath(path: string): string {
    if (path.startsWith('~')) {
      return '/home/user' + path.slice(1);
    }
    return path;
  }

  joinPath(...segments: string[]): string {
    return segments.join('/');
  }

  getHomeDir(): string {
    return '/home/user';
  }

  getCwd(): string {
    return '/project';
  }

  dirname(filePath: string): string {
    const parts = filePath.split('/');
    parts.pop();
    return parts.join('/') || '/';
  }

  // Test helpers
  setFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  getFile(path: string): string | undefined {
    return this.files.get(path);
  }

  getPermissions(path: string): number | undefined {
    return this.permissions.get(path);
  }
}

// Mock environment reader
class MockEnvReader implements IEnvReader {
  private env: Map<string, string> = new Map();

  get(name: string): string | undefined {
    return this.env.get(name);
  }

  getBoolean(name: string): boolean | undefined {
    const value = this.get(name);
    if (value === undefined) return undefined;
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
    return undefined;
  }

  getNumber(name: string): number | undefined {
    const value = this.get(name);
    if (value === undefined) return undefined;
    const num = Number(value);
    return Number.isNaN(num) ? undefined : num;
  }

  set(name: string, value: string): void {
    this.env.set(name, value);
  }

  clear(): void {
    this.env.clear();
  }
}

describe('deepMerge', () => {
  it('should merge simple objects', () => {
    const target = { a: 1, b: 2 };
    const source = { b: 3, c: 4 };
    const result = deepMerge(target, source);
    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('should deep merge nested objects', () => {
    const target = { nested: { a: 1, b: 2 }, top: 'value' };
    const source = { nested: { b: 3, c: 4 } };
    const result = deepMerge(target, source);
    expect(result).toEqual({ nested: { a: 1, b: 3, c: 4 }, top: 'value' });
  });

  it('should replace arrays (not concat)', () => {
    const target = { items: [1, 2, 3] };
    const source = { items: [4, 5] };
    const result = deepMerge(target, source);
    expect(result).toEqual({ items: [4, 5] });
  });

  it('should not modify original objects', () => {
    const target = { a: { b: 1 } };
    const source = { a: { c: 2 } };
    const result = deepMerge(target, source);
    expect(target).toEqual({ a: { b: 1 } });
    expect(result).toEqual({ a: { b: 1, c: 2 } });
  });

  it('should ignore undefined values in source', () => {
    const target = { a: 1, b: 2 };
    const source = { a: undefined, c: 3 };
    const result = deepMerge(target, source);
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });
});

describe('ConfigManager', () => {
  let mockFs: MockFileSystem;
  let mockEnv: MockEnvReader;
  let manager: ConfigManager;

  beforeEach(() => {
    mockFs = new MockFileSystem();
    mockEnv = new MockEnvReader();
    manager = new ConfigManager({
      fileSystem: mockFs,
      envReader: mockEnv,
    });
  });

  describe('getDefaults', () => {
    it('should return complete default configuration', () => {
      const defaults = manager.getDefaults();
      expect(defaults.version).toBe('1.0');
      expect(defaults.providers.default).toBe('openai');
      expect(defaults.agent.logLevel).toBe('info');
    });
  });

  describe('getUserConfigPath', () => {
    it('should return resolved user config path', () => {
      const path = manager.getUserConfigPath();
      expect(path).toBe('/home/user/.agent/settings.json');
    });
  });

  describe('getProjectConfigPath', () => {
    it('should return project config path in cwd', () => {
      const path = manager.getProjectConfigPath();
      expect(path).toBe('/project/.agent/settings.json');
    });

    it('should return project config path for specified path', () => {
      const path = manager.getProjectConfigPath('/custom/project');
      expect(path).toBe('/custom/project/.agent/settings.json');
    });
  });

  describe('load', () => {
    it('should return defaults when no config files exist', async () => {
      const result = await manager.load();
      expect(result.success).toBe(true);
      expect(result.result?.providers.default).toBe('openai');
    });

    it('should load and merge user config', async () => {
      mockFs.setFile(
        '/home/user/.agent/settings.json',
        JSON.stringify({
          providers: {
            default: 'anthropic',
            anthropic: { apiKey: 'user-key' },
          },
        })
      );

      const result = await manager.load();
      expect(result.success).toBe(true);
      expect(result.result?.providers.default).toBe('anthropic');
      expect(result.result?.providers.anthropic?.apiKey).toBe('user-key');
    });

    it('should merge project config over user config', async () => {
      mockFs.setFile(
        '/home/user/.agent/settings.json',
        JSON.stringify({
          providers: {
            default: 'anthropic',
            anthropic: { apiKey: 'user-key' },
          },
        })
      );

      mockFs.setFile(
        '/project/.agent/settings.json',
        JSON.stringify({
          providers: {
            default: 'openai',
            openai: { apiKey: 'project-key' },
          },
        })
      );

      const result = await manager.load();
      expect(result.success).toBe(true);
      // Project config overrides user config for default
      expect(result.result?.providers.default).toBe('openai');
      expect(result.result?.providers.openai?.apiKey).toBe('project-key');
      // But user config is still merged
      expect(result.result?.providers.anthropic?.apiKey).toBe('user-key');
    });

    it('should apply environment variable overrides', async () => {
      mockFs.setFile(
        '/home/user/.agent/settings.json',
        JSON.stringify({
          providers: {
            default: 'openai',
            openai: { apiKey: 'file-key' },
          },
        })
      );

      mockEnv.set('OPENAI_API_KEY', 'env-key');
      mockEnv.set('LLM_PROVIDER', 'anthropic');

      const result = await manager.load();
      expect(result.success).toBe(true);
      // Env overrides file
      expect(result.result?.providers.openai?.apiKey).toBe('env-key');
      expect(result.result?.providers.default).toBe('anthropic');
    });

    it('should return error for invalid JSON', async () => {
      mockFs.setFile('/home/user/.agent/settings.json', 'not valid json');

      const result = await manager.load();
      expect(result.success).toBe(false);
      expect(result.error).toBe('PARSE_ERROR');
    });

    it('should return validation error for valid JSON with invalid schema', async () => {
      mockFs.setFile(
        '/home/user/.agent/settings.json',
        JSON.stringify({
          providers: { default: 'invalid-provider-name' },
        })
      );

      const result = await manager.load();
      expect(result.success).toBe(false);
      expect(result.error).toBe('VALIDATION_FAILED');
    });

    it('should invoke onValidationError callback for schema errors', async () => {
      const callbacks: ConfigCallbacks = {
        onConfigLoad: jest.fn(),
        onValidationError: jest.fn(),
      };

      const callbackManager = new ConfigManager({
        fileSystem: mockFs,
        envReader: mockEnv,
        callbacks,
      });

      mockFs.setFile(
        '/home/user/.agent/settings.json',
        JSON.stringify({
          providers: { default: 'not-a-valid-provider' },
        })
      );

      await callbackManager.load();

      expect(callbacks.onValidationError).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions during load', async () => {
      // Create a mock that throws a non-Error value
      const throwingFs: IFileSystem = {
        readFile: (): Promise<string> => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'string error'; // Non-Error throw for testing
        },
        exists: () => Promise.resolve(true),
        writeFile: () => Promise.resolve(),
        mkdir: () => Promise.resolve(),
        chmod: () => Promise.resolve(),
        resolvePath: (p: string) => mockFs.resolvePath(p),
        joinPath: (...s: string[]) => mockFs.joinPath(...s),
        getHomeDir: () => mockFs.getHomeDir(),
        getCwd: () => mockFs.getCwd(),
        dirname: (p: string) => mockFs.dirname(p),
      };

      const throwingManager = new ConfigManager({
        fileSystem: throwingFs,
        envReader: mockEnv,
      });

      const result = await throwingManager.load();
      expect(result.success).toBe(false);
      expect(result.error).toBe('FILE_READ_ERROR');
    });

    it('should invoke callbacks during load', async () => {
      const callbacks: ConfigCallbacks = {
        onConfigLoad: jest.fn(),
        onValidationError: jest.fn(),
      };

      const callbackManager = new ConfigManager({
        fileSystem: mockFs,
        envReader: mockEnv,
        callbacks,
      });

      mockFs.setFile(
        '/home/user/.agent/settings.json',
        JSON.stringify({ providers: { default: 'openai' } })
      );

      await callbackManager.load();

      expect(callbacks.onConfigLoad).toHaveBeenCalled();
    });

    it('should apply AGENT_MODEL to merged default provider', async () => {
      // User config sets anthropic as default
      mockFs.setFile(
        '/home/user/.agent/settings.json',
        JSON.stringify({
          providers: { default: 'anthropic' },
        })
      );

      // Env sets AGENT_MODEL (without LLM_PROVIDER)
      mockEnv.set('AGENT_MODEL', 'claude-3-opus');

      const result = await manager.load();
      expect(result.success).toBe(true);
      // AGENT_MODEL should be applied to anthropic (the merged default)
      expect(result.result?.providers.anthropic?.model).toBe('claude-3-opus');
      // Not openai
      expect(result.result?.providers.openai?.model).not.toBe('claude-3-opus');
    });

    it('should apply AGENT_MODEL to env LLM_PROVIDER when set', async () => {
      // User config sets anthropic as default
      mockFs.setFile(
        '/home/user/.agent/settings.json',
        JSON.stringify({
          providers: { default: 'anthropic' },
        })
      );

      // Env overrides to gemini and sets model
      mockEnv.set('LLM_PROVIDER', 'gemini');
      mockEnv.set('AGENT_MODEL', 'gemini-2.0-pro');

      const result = await manager.load();
      expect(result.success).toBe(true);
      // AGENT_MODEL should be applied to gemini (env overrides user config)
      expect(result.result?.providers.gemini?.model).toBe('gemini-2.0-pro');
    });

    it('should drop invalid env values and fall back to defaults', async () => {
      // Set invalid values for validated fields
      mockEnv.set('AGENT_LOG_LEVEL', 'invalid-level'); // Not in LOG_LEVELS
      mockEnv.set('MEMORY_TYPE', 'invalid-type'); // Not in MEMORY_TYPES
      mockEnv.set('OTLP_ENDPOINT', 'not-a-valid-url'); // Invalid URL

      const result = await manager.load();
      expect(result.success).toBe(true);
      // Should fall back to defaults
      expect(result.result?.agent.logLevel).toBe('info');
      expect(result.result?.memory.type).toBe('local');
      expect(result.result?.telemetry.otlpEndpoint).toBeUndefined();
    });

    it('should accept valid env values for validated fields', async () => {
      mockEnv.set('AGENT_LOG_LEVEL', 'debug');
      mockEnv.set('MEMORY_TYPE', 'mem0');
      mockEnv.set('OTLP_ENDPOINT', 'http://localhost:4317');

      const result = await manager.load();
      expect(result.success).toBe(true);
      expect(result.result?.agent.logLevel).toBe('debug');
      expect(result.result?.memory.type).toBe('mem0');
      expect(result.result?.telemetry.otlpEndpoint).toBe('http://localhost:4317');
    });

    it('should apply AGENT_MODEL to azure deployment field', async () => {
      // User config sets azure as default
      mockFs.setFile(
        '/home/user/.agent/settings.json',
        JSON.stringify({
          providers: { default: 'azure' },
        })
      );

      mockEnv.set('AGENT_MODEL', 'gpt-4o-deployment');

      const result = await manager.load();
      expect(result.success).toBe(true);
      // AGENT_MODEL should map to 'deployment' for azure
      expect(result.result?.providers.azure?.deployment).toBe('gpt-4o-deployment');
    });

    it('should apply AGENT_MODEL to foundry modelDeployment field', async () => {
      // User config sets foundry as default
      mockFs.setFile(
        '/home/user/.agent/settings.json',
        JSON.stringify({
          providers: { default: 'foundry' },
        })
      );

      mockEnv.set('AGENT_MODEL', 'my-foundry-deployment');

      const result = await manager.load();
      expect(result.success).toBe(true);
      // AGENT_MODEL should map to 'modelDeployment' for foundry
      expect(result.result?.providers.foundry?.modelDeployment).toBe('my-foundry-deployment');
    });

    it('should drop invalid MEMORY_HISTORY_LIMIT and fall back to default', async () => {
      mockEnv.set('MEMORY_HISTORY_LIMIT', '0'); // Invalid: must be positive

      const result = await manager.load();
      expect(result.success).toBe(true);
      // Should fall back to default (100)
      expect(result.result?.memory.historyLimit).toBe(100);
    });
  });

  describe('validate', () => {
    it('should return success for valid config', () => {
      const config = getDefaultConfig();
      const result = manager.validate(config);
      expect(result.success).toBe(true);
    });

    it('should return error for invalid config', () => {
      const result = manager.validate({
        version: '1.0',
        providers: { default: 'invalid' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('VALIDATION_FAILED');
    });
  });

  describe('save', () => {
    it('should save config to user path by default', async () => {
      const config = getDefaultConfig();
      config.providers.openai = { apiKey: 'test-key', model: 'gpt-4o' };

      const result = await manager.save(config);
      expect(result.success).toBe(true);

      const savedContent = mockFs.getFile('/home/user/.agent/settings.json');
      expect(savedContent).toBeDefined();

      const saved = JSON.parse(savedContent ?? '{}') as Record<string, unknown>;
      expect(saved.version).toBe('1.0');
      expect((saved.providers as Record<string, unknown>).openai).toEqual(
        expect.objectContaining({ apiKey: 'test-key' })
      );
    });

    it('should save to custom path', async () => {
      const config = getDefaultConfig();
      const result = await manager.save(config, '/custom/config.json');
      expect(result.success).toBe(true);

      const savedContent = mockFs.getFile('/custom/config.json');
      expect(savedContent).toBeDefined();
    });

    it('should set file permissions', async () => {
      const config = getDefaultConfig();
      await manager.save(config);

      const permissions = mockFs.getPermissions('/home/user/.agent/settings.json');
      expect(permissions).toBe(0o600);
    });

    it('should produce minimal JSON output', async () => {
      const config = getDefaultConfig();
      // Only set openai apiKey, leave everything else as default
      config.providers.openai = { apiKey: 'my-key', model: 'gpt-4o' };

      await manager.save(config);

      const savedContent = mockFs.getFile('/home/user/.agent/settings.json');
      const saved = JSON.parse(savedContent ?? '{}') as Record<string, unknown>;

      // Should include version and providers
      expect(saved.version).toBe('1.0');
      expect(saved.providers).toBeDefined();

      // Should NOT include default agent/telemetry/memory/skills sections
      // (unless they have non-default values)
      expect(saved.telemetry).toBeUndefined();
      expect(saved.memory).toBeUndefined();
      expect(saved.skills).toBeUndefined();
    });

    it('should include telemetry when enabled', async () => {
      const config = getDefaultConfig();
      config.telemetry.enabled = true;
      config.telemetry.otlpEndpoint = 'http://localhost:4317';

      await manager.save(config);

      const savedContent = mockFs.getFile('/home/user/.agent/settings.json');
      const saved = JSON.parse(savedContent ?? '{}') as Record<string, unknown>;
      expect(saved.telemetry).toBeDefined();
    });

    it('should include memory when enabled', async () => {
      const config = getDefaultConfig();
      config.memory.enabled = true;

      await manager.save(config);

      const savedContent = mockFs.getFile('/home/user/.agent/settings.json');
      const saved = JSON.parse(savedContent ?? '{}') as Record<string, unknown>;
      expect(saved.memory).toBeDefined();
    });

    it('should include skills when plugins are configured', async () => {
      const config = getDefaultConfig();
      config.skills.plugins = ['plugin-a'];

      await manager.save(config);

      const savedContent = mockFs.getFile('/home/user/.agent/settings.json');
      const saved = JSON.parse(savedContent ?? '{}') as Record<string, unknown>;
      expect(saved.skills).toBeDefined();
    });

    it('should include agent section when non-default values exist', async () => {
      const config = getDefaultConfig();
      config.agent.logLevel = 'debug';

      await manager.save(config);

      const savedContent = mockFs.getFile('/home/user/.agent/settings.json');
      const saved = JSON.parse(savedContent ?? '{}') as Record<string, unknown>;
      expect(saved.agent).toBeDefined();
    });

    it('should include multiple providers with credentials', async () => {
      const config = getDefaultConfig();
      config.providers.openai = { apiKey: 'openai-key', model: 'gpt-4o' };
      config.providers.anthropic = { apiKey: 'anthropic-key', model: 'claude-3-opus' };

      await manager.save(config);

      const savedContent = mockFs.getFile('/home/user/.agent/settings.json');
      const saved = JSON.parse(savedContent ?? '{}') as Record<string, unknown>;
      const providers = saved.providers as Record<string, unknown>;
      expect(providers.openai).toBeDefined();
      expect(providers.anthropic).toBeDefined();
    });

    it('should reject invalid config', async () => {
      const invalidConfig = {
        ...getDefaultConfig(),
        providers: { default: 'invalid' as 'openai' },
      };

      const result = await manager.save(invalidConfig as ReturnType<typeof getDefaultConfig>);
      expect(result.success).toBe(false);
    });

    it('should invoke onConfigSave callback with validated config', async () => {
      const callbacks: ConfigCallbacks = {
        onConfigSave: jest.fn(),
      };

      const callbackManager = new ConfigManager({
        fileSystem: mockFs,
        envReader: mockEnv,
        callbacks,
      });

      const config = getDefaultConfig();
      await callbackManager.save(config);

      // Callback receives the validated config and path
      expect(callbacks.onConfigSave).toHaveBeenCalledWith(
        expect.objectContaining({ version: '1.0' }),
        '/home/user/.agent/settings.json'
      );
    });

    it('should handle write errors', async () => {
      const errorFs: IFileSystem = {
        writeFile: () => Promise.reject(new Error('Write failed')),
        exists: () => Promise.resolve(false),
        mkdir: () => Promise.resolve(),
        chmod: () => Promise.resolve(),
        resolvePath: (p: string) => mockFs.resolvePath(p),
        joinPath: (...s: string[]) => mockFs.joinPath(...s),
        getHomeDir: () => mockFs.getHomeDir(),
        getCwd: () => mockFs.getCwd(),
        dirname: (p: string) => mockFs.dirname(p),
        readFile: () => Promise.resolve('{}'),
      };

      const errorManager = new ConfigManager({
        fileSystem: errorFs,
        envReader: mockEnv,
      });

      const config = getDefaultConfig();
      const result = await errorManager.save(config);
      expect(result.success).toBe(false);
      expect(result.error).toBe('FILE_WRITE_ERROR');
    });

    it('should handle non-Error exceptions during save', async () => {
      const throwingFs: IFileSystem = {
        writeFile: (): Promise<void> => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'string error'; // Non-Error throw for testing
        },
        exists: () => Promise.resolve(false),
        mkdir: () => Promise.resolve(),
        chmod: () => Promise.resolve(),
        resolvePath: (p: string) => mockFs.resolvePath(p),
        joinPath: (...s: string[]) => mockFs.joinPath(...s),
        getHomeDir: () => mockFs.getHomeDir(),
        getCwd: () => mockFs.getCwd(),
        dirname: (p: string) => mockFs.dirname(p),
        readFile: () => Promise.resolve('{}'),
      };

      const throwingManager = new ConfigManager({
        fileSystem: throwingFs,
        envReader: mockEnv,
      });

      const config = getDefaultConfig();
      const result = await throwingManager.save(config);
      expect(result.success).toBe(false);
      expect(result.error).toBe('FILE_WRITE_ERROR');
      expect(result.message).toBe('Unknown error saving config');
    });

    it('should strip empty nested objects from output', async () => {
      const config = getDefaultConfig();
      // Create a mem0 config with all undefined/null values
      config.memory.enabled = true;
      config.memory.mem0 = {
        storagePath: undefined,
        apiKey: undefined,
        orgId: undefined,
        userId: undefined,
        projectId: undefined,
      };

      await manager.save(config);

      const savedContent = mockFs.getFile('/home/user/.agent/settings.json');
      const saved = JSON.parse(savedContent ?? '{}') as Record<string, unknown>;
      // memory should exist but mem0 should be stripped since all values are undefined
      expect(saved.memory).toBeDefined();
      const memory = saved.memory as Record<string, unknown>;
      expect(memory.mem0).toBeUndefined();
    });

    it('should strip empty arrays from output', async () => {
      const config = getDefaultConfig();
      config.skills.userDir = '/custom/skills';
      // plugins is an empty array, should be stripped

      await manager.save(config);

      const savedContent = mockFs.getFile('/home/user/.agent/settings.json');
      const saved = JSON.parse(savedContent ?? '{}') as Record<string, unknown>;
      const skills = saved.skills as Record<string, unknown>;
      expect(skills.userDir).toBe('/custom/skills');
      expect(skills.plugins).toBeUndefined(); // Empty array stripped
    });

    it('should strip unknown fields via Zod validation', async () => {
      // Simulate config with unknown fields (would happen if schema changed)
      const config = getDefaultConfig() as Record<string, unknown>;
      config.unknownField = 'should be stripped';
      (config.providers as Record<string, unknown>).unknownProvider = { key: 'value' };

      const result = await manager.save(config as ReturnType<typeof getDefaultConfig>);
      expect(result.success).toBe(true);

      const savedContent = mockFs.getFile('/home/user/.agent/settings.json');
      const saved = JSON.parse(savedContent ?? '{}') as Record<string, unknown>;
      // Unknown fields should be stripped by Zod
      expect(saved.unknownField).toBeUndefined();
      expect((saved.providers as Record<string, unknown>).unknownProvider).toBeUndefined();
    });

    it('should include Gemini Vertex AI config (without apiKey)', async () => {
      const config = getDefaultConfig();
      config.providers.gemini = {
        useVertexai: true,
        projectId: 'my-gcp-project',
        location: 'europe-west1',
        model: 'gemini-2.0-flash-exp',
      };

      await manager.save(config);

      const savedContent = mockFs.getFile('/home/user/.agent/settings.json');
      const saved = JSON.parse(savedContent ?? '{}') as Record<string, unknown>;
      const providers = saved.providers as Record<string, unknown>;
      // Should include gemini even without apiKey (has useVertexai, projectId, location)
      expect(providers.gemini).toBeDefined();
      expect((providers.gemini as Record<string, unknown>).useVertexai).toBe(true);
      expect((providers.gemini as Record<string, unknown>).projectId).toBe('my-gcp-project');
    });

    it('should include OpenAI with custom baseUrl (without apiKey)', async () => {
      const config = getDefaultConfig();
      // OpenAI-compatible endpoint without apiKey
      config.providers.openai = {
        baseUrl: 'http://localhost:8080/v1',
        model: 'llama3.2',
      };

      await manager.save(config);

      const savedContent = mockFs.getFile('/home/user/.agent/settings.json');
      const saved = JSON.parse(savedContent ?? '{}') as Record<string, unknown>;
      const providers = saved.providers as Record<string, unknown>;
      expect(providers.openai).toBeDefined();
      expect((providers.openai as Record<string, unknown>).baseUrl).toBe(
        'http://localhost:8080/v1'
      );
    });
  });
});

describe('loadConfig convenience function', () => {
  it('should be callable', async () => {
    // Just verify it doesn't throw
    const result = await loadConfig('/nonexistent');
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });
});

describe('NodeFileSystem', () => {
  const nodeFs = new NodeFileSystem();

  it('should resolve ~ to home directory', () => {
    const resolved = nodeFs.resolvePath('~/.agent/config.json');
    expect(resolved).not.toContain('~');
    expect(resolved).toContain('.agent/config.json');
  });

  it('should resolve absolute paths', () => {
    const resolved = nodeFs.resolvePath('/absolute/path');
    expect(resolved).toBe('/absolute/path');
  });

  it('should join paths', () => {
    const joined = nodeFs.joinPath('/home', 'user', '.agent');
    expect(joined).toBe('/home/user/.agent');
  });

  it('should get home directory', () => {
    const homeDir = nodeFs.getHomeDir();
    expect(homeDir).toBeDefined();
    expect(typeof homeDir).toBe('string');
  });

  it('should get current working directory', () => {
    const cwd = nodeFs.getCwd();
    expect(cwd).toBeDefined();
    expect(typeof cwd).toBe('string');
  });
});
