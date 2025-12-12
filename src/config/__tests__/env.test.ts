/**
 * Tests for environment variable parsing.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import {
  ProcessEnvReader,
  readEnvConfig,
  getEnvDefaultProvider,
  getEnvModel,
  type IEnvReader,
} from '../env.js';

// Mock environment reader for testing
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

describe('ProcessEnvReader', () => {
  const originalEnv = process.env;
  let reader: ProcessEnvReader;

  beforeEach(() => {
    process.env = { ...originalEnv };
    reader = new ProcessEnvReader();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('get', () => {
    it('should return environment variable value', () => {
      process.env.TEST_VAR = 'test-value';
      expect(reader.get('TEST_VAR')).toBe('test-value');
    });

    it('should return undefined for missing variable', () => {
      delete process.env.MISSING_VAR;
      expect(reader.get('MISSING_VAR')).toBeUndefined();
    });
  });

  describe('getBoolean', () => {
    it.each([
      ['true', true],
      ['TRUE', true],
      ['True', true],
      ['1', true],
      ['yes', true],
      ['YES', true],
      ['false', false],
      ['FALSE', false],
      ['False', false],
      ['0', false],
      ['no', false],
      ['NO', false],
    ])('should parse "%s" as %s', (input, expected) => {
      process.env.BOOL_VAR = input;
      expect(reader.getBoolean('BOOL_VAR')).toBe(expected);
    });

    it('should return undefined for non-boolean string', () => {
      process.env.BOOL_VAR = 'maybe';
      expect(reader.getBoolean('BOOL_VAR')).toBeUndefined();
    });

    it('should return undefined for missing variable', () => {
      delete process.env.BOOL_VAR;
      expect(reader.getBoolean('BOOL_VAR')).toBeUndefined();
    });
  });

  describe('getNumber', () => {
    it('should parse integer', () => {
      process.env.NUM_VAR = '42';
      expect(reader.getNumber('NUM_VAR')).toBe(42);
    });

    it('should parse float', () => {
      process.env.NUM_VAR = '3.14';
      expect(reader.getNumber('NUM_VAR')).toBe(3.14);
    });

    it('should parse negative number', () => {
      process.env.NUM_VAR = '-10';
      expect(reader.getNumber('NUM_VAR')).toBe(-10);
    });

    it('should return undefined for non-numeric string', () => {
      process.env.NUM_VAR = 'not-a-number';
      expect(reader.getNumber('NUM_VAR')).toBeUndefined();
    });

    it('should return undefined for missing variable', () => {
      delete process.env.NUM_VAR;
      expect(reader.getNumber('NUM_VAR')).toBeUndefined();
    });
  });
});

describe('readEnvConfig', () => {
  let mockEnv: MockEnvReader;

  beforeEach(() => {
    mockEnv = new MockEnvReader();
  });

  describe('Provider API Keys', () => {
    it('should map OPENAI_API_KEY', () => {
      mockEnv.set('OPENAI_API_KEY', 'sk-test-openai');
      const config = readEnvConfig(mockEnv);
      expect(config.providers?.openai?.apiKey).toBe('sk-test-openai');
    });

    it('should map ANTHROPIC_API_KEY', () => {
      mockEnv.set('ANTHROPIC_API_KEY', 'sk-ant-test');
      const config = readEnvConfig(mockEnv);
      expect(config.providers?.anthropic?.apiKey).toBe('sk-ant-test');
    });

    it('should map GEMINI_API_KEY', () => {
      mockEnv.set('GEMINI_API_KEY', 'gemini-test-key');
      const config = readEnvConfig(mockEnv);
      expect(config.providers?.gemini?.apiKey).toBe('gemini-test-key');
    });

    it('should map GITHUB_TOKEN', () => {
      mockEnv.set('GITHUB_TOKEN', 'ghp_test');
      const config = readEnvConfig(mockEnv);
      expect(config.providers?.github?.token).toBe('ghp_test');
    });
  });

  describe('Azure Configuration', () => {
    it('should map Azure OpenAI variables', () => {
      mockEnv.set('AZURE_OPENAI_ENDPOINT', 'https://my-resource.openai.azure.com');
      mockEnv.set('AZURE_OPENAI_DEPLOYMENT_NAME', 'gpt-4o-deployment');
      mockEnv.set('AZURE_OPENAI_API_KEY', 'azure-key');
      mockEnv.set('AZURE_OPENAI_API_VERSION', '2024-08-01');

      const config = readEnvConfig(mockEnv);
      expect(config.providers?.azure?.endpoint).toBe('https://my-resource.openai.azure.com');
      expect(config.providers?.azure?.deployment).toBe('gpt-4o-deployment');
      expect(config.providers?.azure?.apiKey).toBe('azure-key');
      expect(config.providers?.azure?.apiVersion).toBe('2024-08-01');
    });

    it('should map Azure Foundry variables', () => {
      mockEnv.set('AZURE_PROJECT_ENDPOINT', 'https://foundry.azure.com/project');
      mockEnv.set('AZURE_MODEL_DEPLOYMENT', 'model-deployment');

      const config = readEnvConfig(mockEnv);
      expect(config.providers?.foundry?.projectEndpoint).toBe('https://foundry.azure.com/project');
      expect(config.providers?.foundry?.modelDeployment).toBe('model-deployment');
    });
  });

  describe('Gemini Vertex AI Configuration', () => {
    it('should map Gemini Vertex AI variables', () => {
      mockEnv.set('GEMINI_USE_VERTEXAI', 'true');
      mockEnv.set('GEMINI_PROJECT_ID', 'my-gcp-project');
      mockEnv.set('GEMINI_LOCATION', 'europe-west1');

      const config = readEnvConfig(mockEnv);
      expect(config.providers?.gemini?.useVertexai).toBe(true);
      expect(config.providers?.gemini?.projectId).toBe('my-gcp-project');
      expect(config.providers?.gemini?.location).toBe('europe-west1');
    });
  });

  describe('Agent Configuration', () => {
    it('should map AGENT_DATA_DIR', () => {
      mockEnv.set('AGENT_DATA_DIR', '/custom/data');
      const config = readEnvConfig(mockEnv);
      expect(config.agent?.dataDir).toBe('/custom/data');
    });

    it('should map AGENT_LOG_LEVEL', () => {
      mockEnv.set('AGENT_LOG_LEVEL', 'debug');
      const config = readEnvConfig(mockEnv);
      expect(config.agent?.logLevel).toBe('debug');
    });

    it('should map AGENT_WORKSPACE_ROOT', () => {
      mockEnv.set('AGENT_WORKSPACE_ROOT', '/workspace');
      const config = readEnvConfig(mockEnv);
      expect(config.agent?.workspaceRoot).toBe('/workspace');
    });
  });

  describe('Telemetry Configuration', () => {
    it('should map ENABLE_OTEL as boolean', () => {
      mockEnv.set('ENABLE_OTEL', 'true');
      const config = readEnvConfig(mockEnv);
      expect(config.telemetry?.enabled).toBe(true);
    });

    it('should map OTLP_ENDPOINT', () => {
      mockEnv.set('OTLP_ENDPOINT', 'http://localhost:4317');
      const config = readEnvConfig(mockEnv);
      expect(config.telemetry?.otlpEndpoint).toBe('http://localhost:4317');
    });

    it('should map APPLICATIONINSIGHTS_CONNECTION_STRING', () => {
      mockEnv.set('APPLICATIONINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=...');
      const config = readEnvConfig(mockEnv);
      expect(config.telemetry?.applicationinsightsConnectionString).toBe('InstrumentationKey=...');
    });
  });

  describe('Memory Configuration', () => {
    it('should map MEMORY_ENABLED as boolean', () => {
      mockEnv.set('MEMORY_ENABLED', '1');
      const config = readEnvConfig(mockEnv);
      expect(config.memory?.enabled).toBe(true);
    });

    it('should map MEMORY_TYPE', () => {
      mockEnv.set('MEMORY_TYPE', 'mem0');
      const config = readEnvConfig(mockEnv);
      expect(config.memory?.type).toBe('mem0');
    });

    it('should map MEMORY_HISTORY_LIMIT as number', () => {
      mockEnv.set('MEMORY_HISTORY_LIMIT', '50');
      const config = readEnvConfig(mockEnv);
      expect(config.memory?.historyLimit).toBe(50);
    });
  });

  describe('LLM_PROVIDER', () => {
    it('should set providers.default', () => {
      mockEnv.set('LLM_PROVIDER', 'anthropic');
      const config = readEnvConfig(mockEnv);
      expect(config.providers?.default).toBe('anthropic');
    });

    it('should ignore invalid provider names', () => {
      mockEnv.set('LLM_PROVIDER', 'invalid-provider');
      const config = readEnvConfig(mockEnv);
      expect(config.providers?.default).toBeUndefined();
    });

    it.each(['local', 'openai', 'anthropic', 'azure', 'foundry', 'gemini', 'github'])(
      'should accept valid provider: %s',
      (provider) => {
        mockEnv.set('LLM_PROVIDER', provider);
        const config = readEnvConfig(mockEnv);
        expect(config.providers?.default).toBe(provider);
      }
    );
  });

  describe('AGENT_MODEL', () => {
    // Note: AGENT_MODEL is now handled in ConfigManager.load() after merging,
    // so it can apply to the merged default provider (not just env LLM_PROVIDER).
    // These tests verify readEnvConfig() does NOT process AGENT_MODEL.
    it('should not set model directly (handled in ConfigManager)', () => {
      mockEnv.set('AGENT_MODEL', 'gpt-4-turbo');
      const config = readEnvConfig(mockEnv);
      // AGENT_MODEL should not create any provider config in readEnvConfig
      expect(config.providers?.openai?.model).toBeUndefined();
    });

    it('should not set model even with LLM_PROVIDER', () => {
      mockEnv.set('LLM_PROVIDER', 'anthropic');
      mockEnv.set('AGENT_MODEL', 'claude-3-opus');
      const config = readEnvConfig(mockEnv);
      // AGENT_MODEL should not be applied here
      expect(config.providers?.anthropic?.model).toBeUndefined();
      // But LLM_PROVIDER should still set default
      expect(config.providers?.default).toBe('anthropic');
    });
  });

  describe('Empty environment', () => {
    it('should return empty config for no env vars', () => {
      const config = readEnvConfig(mockEnv);
      expect(Object.keys(config).length).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string for LLM_PROVIDER', () => {
      mockEnv.set('LLM_PROVIDER', '');
      const config = readEnvConfig(mockEnv);
      expect(config.providers?.default).toBeUndefined();
    });
  });

  describe('Env validation', () => {
    it('should drop invalid AGENT_LOG_LEVEL', () => {
      mockEnv.set('AGENT_LOG_LEVEL', 'invalid-level');
      const config = readEnvConfig(mockEnv);
      expect(config.agent?.logLevel).toBeUndefined();
    });

    it('should accept valid AGENT_LOG_LEVEL', () => {
      mockEnv.set('AGENT_LOG_LEVEL', 'warn');
      const config = readEnvConfig(mockEnv);
      expect(config.agent?.logLevel).toBe('warn');
    });

    it('should drop invalid MEMORY_TYPE', () => {
      mockEnv.set('MEMORY_TYPE', 'invalid-type');
      const config = readEnvConfig(mockEnv);
      expect(config.memory?.type).toBeUndefined();
    });

    it('should accept valid MEMORY_TYPE', () => {
      mockEnv.set('MEMORY_TYPE', 'mem0');
      const config = readEnvConfig(mockEnv);
      expect(config.memory?.type).toBe('mem0');
    });

    it('should drop invalid URL for OTLP_ENDPOINT', () => {
      mockEnv.set('OTLP_ENDPOINT', 'not-a-valid-url');
      const config = readEnvConfig(mockEnv);
      expect(config.telemetry?.otlpEndpoint).toBeUndefined();
    });

    it('should accept valid URL for OTLP_ENDPOINT', () => {
      mockEnv.set('OTLP_ENDPOINT', 'http://localhost:4317');
      const config = readEnvConfig(mockEnv);
      expect(config.telemetry?.otlpEndpoint).toBe('http://localhost:4317');
    });

    it('should drop invalid URL for OPENAI_BASE_URL', () => {
      mockEnv.set('OPENAI_BASE_URL', 'not-a-url');
      const config = readEnvConfig(mockEnv);
      expect(config.providers?.openai?.baseUrl).toBeUndefined();
    });

    it('should accept valid URL for OPENAI_BASE_URL', () => {
      mockEnv.set('OPENAI_BASE_URL', 'http://localhost:8080/v1');
      const config = readEnvConfig(mockEnv);
      expect(config.providers?.openai?.baseUrl).toBe('http://localhost:8080/v1');
    });

    it('should drop invalid URL for AZURE_OPENAI_ENDPOINT', () => {
      mockEnv.set('AZURE_OPENAI_ENDPOINT', 'just-text');
      const config = readEnvConfig(mockEnv);
      expect(config.providers?.azure?.endpoint).toBeUndefined();
    });

    it('should drop invalid URL for AZURE_PROJECT_ENDPOINT', () => {
      mockEnv.set('AZURE_PROJECT_ENDPOINT', 'invalid');
      const config = readEnvConfig(mockEnv);
      expect(config.providers?.foundry?.projectEndpoint).toBeUndefined();
    });

    it('should drop invalid URL for GITHUB_MODELS_ENDPOINT', () => {
      mockEnv.set('GITHUB_MODELS_ENDPOINT', 'bad-url');
      const config = readEnvConfig(mockEnv);
      expect(config.providers?.github?.endpoint).toBeUndefined();
    });

    it('should drop zero MEMORY_HISTORY_LIMIT', () => {
      mockEnv.set('MEMORY_HISTORY_LIMIT', '0');
      const config = readEnvConfig(mockEnv);
      expect(config.memory?.historyLimit).toBeUndefined();
    });

    it('should drop negative MEMORY_HISTORY_LIMIT', () => {
      mockEnv.set('MEMORY_HISTORY_LIMIT', '-5');
      const config = readEnvConfig(mockEnv);
      expect(config.memory?.historyLimit).toBeUndefined();
    });

    it('should drop non-integer MEMORY_HISTORY_LIMIT', () => {
      mockEnv.set('MEMORY_HISTORY_LIMIT', '3.14');
      const config = readEnvConfig(mockEnv);
      expect(config.memory?.historyLimit).toBeUndefined();
    });

    it('should drop non-numeric MEMORY_HISTORY_LIMIT', () => {
      mockEnv.set('MEMORY_HISTORY_LIMIT', 'abc');
      const config = readEnvConfig(mockEnv);
      expect(config.memory?.historyLimit).toBeUndefined();
    });

    it('should accept valid positive integer MEMORY_HISTORY_LIMIT', () => {
      mockEnv.set('MEMORY_HISTORY_LIMIT', '50');
      const config = readEnvConfig(mockEnv);
      expect(config.memory?.historyLimit).toBe(50);
    });
  });
});

describe('getEnvDefaultProvider', () => {
  let mockEnv: MockEnvReader;

  beforeEach(() => {
    mockEnv = new MockEnvReader();
  });

  it('should return provider from LLM_PROVIDER', () => {
    mockEnv.set('LLM_PROVIDER', 'anthropic');
    expect(getEnvDefaultProvider(mockEnv)).toBe('anthropic');
  });

  it('should return undefined for invalid provider', () => {
    mockEnv.set('LLM_PROVIDER', 'invalid');
    expect(getEnvDefaultProvider(mockEnv)).toBeUndefined();
  });

  it('should return undefined when not set', () => {
    expect(getEnvDefaultProvider(mockEnv)).toBeUndefined();
  });
});

describe('getEnvModel', () => {
  let mockEnv: MockEnvReader;

  beforeEach(() => {
    mockEnv = new MockEnvReader();
  });

  it('should return model from AGENT_MODEL', () => {
    mockEnv.set('AGENT_MODEL', 'gpt-4-turbo');
    expect(getEnvModel(mockEnv)).toBe('gpt-4-turbo');
  });

  it('should return undefined when not set', () => {
    expect(getEnvModel(mockEnv)).toBeUndefined();
  });
});
