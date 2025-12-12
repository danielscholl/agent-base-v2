/**
 * Tests for Zod schema validation.
 */

import { describe, expect, it } from '@jest/globals';

import {
  LocalProviderConfigSchema,
  OpenAIProviderConfigSchema,
  AnthropicProviderConfigSchema,
  AzureOpenAIProviderConfigSchema,
  FoundryProviderConfigSchema,
  GeminiProviderConfigSchema,
  GitHubProviderConfigSchema,
  ProvidersConfigSchema,
  AgentConfigSchema,
  TelemetryConfigSchema,
  MemoryConfigSchema,
  SkillsConfigSchema,
  AppConfigSchema,
  getDefaultConfig,
  parseConfig,
} from '../schema.js';

import {
  DEFAULT_LOCAL_BASE_URL,
  DEFAULT_LOCAL_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_AZURE_API_VERSION,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_LOCATION,
  DEFAULT_GITHUB_MODEL,
  DEFAULT_GITHUB_ENDPOINT,
  DEFAULT_DATA_DIR,
  DEFAULT_LOG_LEVEL,
  DEFAULT_MEMORY_HISTORY_LIMIT,
  DEFAULT_SKILL_SCRIPT_TIMEOUT,
} from '../constants.js';

describe('Provider Schemas', () => {
  describe('LocalProviderConfigSchema', () => {
    it('should apply default values when parsing empty object', () => {
      const result = LocalProviderConfigSchema.parse({});
      expect(result.baseUrl).toBe(DEFAULT_LOCAL_BASE_URL);
      expect(result.model).toBe(DEFAULT_LOCAL_MODEL);
    });

    it('should accept valid custom values', () => {
      const input = {
        baseUrl: 'http://custom:8080',
        model: 'custom-model',
      };
      const result = LocalProviderConfigSchema.parse(input);
      expect(result.baseUrl).toBe('http://custom:8080');
      expect(result.model).toBe('custom-model');
    });

    it('should reject invalid URL', () => {
      const input = { baseUrl: 'not-a-url' };
      const result = LocalProviderConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('OpenAIProviderConfigSchema', () => {
    it('should apply default model', () => {
      const result = OpenAIProviderConfigSchema.parse({});
      expect(result.model).toBe(DEFAULT_OPENAI_MODEL);
      expect(result.apiKey).toBeUndefined();
    });

    it('should accept apiKey and custom model', () => {
      const input = {
        apiKey: 'sk-test-key',
        model: 'gpt-4-turbo',
        baseUrl: 'https://custom.openai.com/v1',
      };
      const result = OpenAIProviderConfigSchema.parse(input);
      expect(result.apiKey).toBe('sk-test-key');
      expect(result.model).toBe('gpt-4-turbo');
      expect(result.baseUrl).toBe('https://custom.openai.com/v1');
    });
  });

  describe('AnthropicProviderConfigSchema', () => {
    it('should apply default model', () => {
      const result = AnthropicProviderConfigSchema.parse({});
      expect(result.model).toBe(DEFAULT_ANTHROPIC_MODEL);
    });

    it('should accept apiKey', () => {
      const input = { apiKey: 'sk-ant-test' };
      const result = AnthropicProviderConfigSchema.parse(input);
      expect(result.apiKey).toBe('sk-ant-test');
    });
  });

  describe('AzureOpenAIProviderConfigSchema', () => {
    it('should apply default API version', () => {
      const result = AzureOpenAIProviderConfigSchema.parse({});
      expect(result.apiVersion).toBe(DEFAULT_AZURE_API_VERSION);
    });

    it('should accept full Azure config', () => {
      const input = {
        endpoint: 'https://my-resource.openai.azure.com',
        deployment: 'my-deployment',
        apiVersion: '2024-08-01',
        apiKey: 'azure-key',
      };
      const result = AzureOpenAIProviderConfigSchema.parse(input);
      expect(result.endpoint).toBe('https://my-resource.openai.azure.com');
      expect(result.deployment).toBe('my-deployment');
      expect(result.apiVersion).toBe('2024-08-01');
      expect(result.apiKey).toBe('azure-key');
    });
  });

  describe('FoundryProviderConfigSchema', () => {
    it('should accept empty object', () => {
      const result = FoundryProviderConfigSchema.parse({});
      expect(result.projectEndpoint).toBeUndefined();
      expect(result.modelDeployment).toBeUndefined();
    });

    it('should accept full config', () => {
      const input = {
        projectEndpoint: 'https://foundry.azure.com/project',
        modelDeployment: 'gpt-4o-deployment',
      };
      const result = FoundryProviderConfigSchema.parse(input);
      expect(result.projectEndpoint).toBe('https://foundry.azure.com/project');
      expect(result.modelDeployment).toBe('gpt-4o-deployment');
    });
  });

  describe('GeminiProviderConfigSchema', () => {
    it('should apply default values', () => {
      const result = GeminiProviderConfigSchema.parse({});
      expect(result.model).toBe(DEFAULT_GEMINI_MODEL);
      expect(result.location).toBe(DEFAULT_GEMINI_LOCATION);
      expect(result.useVertexai).toBe(false);
    });

    it('should accept Vertex AI config', () => {
      const input = {
        useVertexai: true,
        projectId: 'my-gcp-project',
        location: 'europe-west1',
      };
      const result = GeminiProviderConfigSchema.parse(input);
      expect(result.useVertexai).toBe(true);
      expect(result.projectId).toBe('my-gcp-project');
      expect(result.location).toBe('europe-west1');
    });
  });

  describe('GitHubProviderConfigSchema', () => {
    it('should apply default values', () => {
      const result = GitHubProviderConfigSchema.parse({});
      expect(result.model).toBe(DEFAULT_GITHUB_MODEL);
      expect(result.endpoint).toBe(DEFAULT_GITHUB_ENDPOINT);
    });

    it('should accept token and org', () => {
      const input = {
        token: 'ghp_test_token',
        org: 'my-org',
      };
      const result = GitHubProviderConfigSchema.parse(input);
      expect(result.token).toBe('ghp_test_token');
      expect(result.org).toBe('my-org');
    });
  });

  describe('ProvidersConfigSchema', () => {
    it('should apply default provider', () => {
      const result = ProvidersConfigSchema.parse({});
      expect(result.default).toBe('openai');
    });

    it('should accept all providers', () => {
      const input = {
        default: 'anthropic' as const,
        openai: { apiKey: 'sk-test' },
        anthropic: { apiKey: 'sk-ant' },
        local: { baseUrl: 'http://localhost:11434' },
      };
      const result = ProvidersConfigSchema.parse(input);
      expect(result.default).toBe('anthropic');
      expect(result.openai?.apiKey).toBe('sk-test');
      expect(result.anthropic?.apiKey).toBe('sk-ant');
    });

    it('should reject invalid default provider', () => {
      const input = { default: 'invalid-provider' };
      const result = ProvidersConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});

describe('AgentConfigSchema', () => {
  it('should apply default values', () => {
    const result = AgentConfigSchema.parse({});
    expect(result.dataDir).toBe(DEFAULT_DATA_DIR);
    expect(result.logLevel).toBe(DEFAULT_LOG_LEVEL);
    expect(result.filesystemWritesEnabled).toBe(true);
  });

  it('should accept custom values', () => {
    const input = {
      dataDir: '/custom/path',
      logLevel: 'debug' as const,
      systemPromptFile: '/prompts/custom.md',
      workspaceRoot: '/workspace',
      filesystemWritesEnabled: false,
    };
    const result = AgentConfigSchema.parse(input);
    expect(result.dataDir).toBe('/custom/path');
    expect(result.logLevel).toBe('debug');
    expect(result.systemPromptFile).toBe('/prompts/custom.md');
    expect(result.filesystemWritesEnabled).toBe(false);
  });

  it('should reject invalid log level', () => {
    const input = { logLevel: 'invalid' };
    const result = AgentConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('TelemetryConfigSchema', () => {
  it('should apply default values', () => {
    const result = TelemetryConfigSchema.parse({});
    expect(result.enabled).toBe(false);
    expect(result.enableSensitiveData).toBe(false);
  });

  it('should accept OTLP endpoint', () => {
    const input = {
      enabled: true,
      otlpEndpoint: 'http://localhost:4317',
    };
    const result = TelemetryConfigSchema.parse(input);
    expect(result.enabled).toBe(true);
    expect(result.otlpEndpoint).toBe('http://localhost:4317');
  });
});

describe('MemoryConfigSchema', () => {
  it('should apply default values', () => {
    const result = MemoryConfigSchema.parse({});
    expect(result.enabled).toBe(false);
    expect(result.type).toBe('local');
    expect(result.historyLimit).toBe(DEFAULT_MEMORY_HISTORY_LIMIT);
  });

  it('should accept mem0 config', () => {
    const input = {
      enabled: true,
      type: 'mem0' as const,
      mem0: {
        apiKey: 'mem0-key',
        userId: 'user-123',
      },
    };
    const result = MemoryConfigSchema.parse(input);
    expect(result.type).toBe('mem0');
    expect(result.mem0?.apiKey).toBe('mem0-key');
  });

  it('should reject negative history limit', () => {
    const input = { historyLimit: -1 };
    const result = MemoryConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('SkillsConfigSchema', () => {
  it('should apply default values', () => {
    const result = SkillsConfigSchema.parse({});
    expect(result.plugins).toEqual([]);
    expect(result.disabledBundled).toEqual([]);
    expect(result.scriptTimeout).toBe(DEFAULT_SKILL_SCRIPT_TIMEOUT);
  });

  it('should accept plugins array', () => {
    const input = {
      plugins: ['plugin-a', 'plugin-b'],
      disabledBundled: ['bundled-skill'],
      userDir: '~/.agent/skills',
    };
    const result = SkillsConfigSchema.parse(input);
    expect(result.plugins).toEqual(['plugin-a', 'plugin-b']);
    expect(result.disabledBundled).toEqual(['bundled-skill']);
    expect(result.userDir).toBe('~/.agent/skills');
  });
});

describe('AppConfigSchema', () => {
  it('should apply all defaults for empty object', () => {
    const result = AppConfigSchema.parse({});
    expect(result.version).toBe('1.0');
    expect(result.providers.default).toBe('openai');
    expect(result.agent.logLevel).toBe('info');
    expect(result.telemetry.enabled).toBe(false);
    expect(result.memory.enabled).toBe(false);
    expect(result.skills.plugins).toEqual([]);
  });

  it('should deep merge partial config', () => {
    const input = {
      providers: {
        default: 'anthropic' as const,
        anthropic: { apiKey: 'test-key' },
      },
      telemetry: {
        enabled: true,
      },
    };
    const result = AppConfigSchema.parse(input);
    expect(result.providers.default).toBe('anthropic');
    expect(result.providers.anthropic?.apiKey).toBe('test-key');
    expect(result.telemetry.enabled).toBe(true);
    // Other defaults should be applied
    expect(result.agent.logLevel).toBe('info');
  });
});

describe('Utility Functions', () => {
  describe('getDefaultConfig', () => {
    it('should return complete default configuration', () => {
      const config = getDefaultConfig();
      expect(config.version).toBe('1.0');
      expect(config.providers).toBeDefined();
      expect(config.agent).toBeDefined();
      expect(config.telemetry).toBeDefined();
      expect(config.memory).toBeDefined();
      expect(config.skills).toBeDefined();
    });
  });

  describe('parseConfig', () => {
    it('should return success for valid config', () => {
      const result = parseConfig({ providers: { default: 'openai' } });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.providers.default).toBe('openai');
      }
    });

    it('should return error for invalid config', () => {
      const result = parseConfig({ providers: { default: 'invalid' } });
      expect(result.success).toBe(false);
    });

    it('should validate complete config', () => {
      const config = getDefaultConfig();
      const result = parseConfig(config);
      expect(result.success).toBe(true);
    });

    it('should reject config with invalid fields', () => {
      const config = {
        version: '1.0',
        providers: { default: 'not-a-provider' },
      };
      const result = parseConfig(config);
      expect(result.success).toBe(false);
    });
  });
});
