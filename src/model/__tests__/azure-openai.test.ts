/**
 * Unit tests for Azure OpenAI provider factory.
 */

import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';

// Mock @langchain/openai before importing
interface MockAzureOpenAIConfig {
  azureOpenAIEndpoint: string;
  azureOpenAIApiDeploymentName: string;
  azureOpenAIApiVersion: string;
  azureOpenAIApiKey?: string;
  azureADTokenProvider?: () => string;
}

const mockAzureChatOpenAI = jest
  .fn<(config: MockAzureOpenAIConfig) => { deployment: string; _type: string }>()
  .mockImplementation((config) => ({
    deployment: config.azureOpenAIApiDeploymentName,
    _type: 'chat_model',
  }));

jest.unstable_mockModule('@langchain/openai', () => ({
  AzureChatOpenAI: mockAzureChatOpenAI,
}));

// Mock the openai package for Responses API
const mockAzureOpenAI = jest.fn().mockImplementation(() => ({
  responses: { create: jest.fn() },
}));

jest.unstable_mockModule('openai', () => ({
  AzureOpenAI: mockAzureOpenAI,
}));

// Mock child_process for Azure CLI token
const mockSpawnSync = jest.fn().mockReturnValue({
  status: 1,
  stdout: '',
  stderr: 'not logged in',
});

jest.unstable_mockModule('node:child_process', () => ({
  spawnSync: mockSpawnSync,
}));

// Import after mocking
const { createAzureOpenAIClient, getAzureCLIToken } = await import('../providers/azure-openai.js');

describe('createAzureOpenAIClient', () => {
  // Save original env vars
  const originalEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const originalDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  const originalApiKey = process.env.AZURE_OPENAI_API_KEY;
  const originalApiVersion = process.env.AZURE_OPENAI_API_VERSION;

  beforeEach(() => {
    mockAzureChatOpenAI.mockClear();
    mockAzureOpenAI.mockClear();
    mockSpawnSync.mockClear();
    // Clear Azure-related env vars to ensure test isolation
    delete process.env.AZURE_OPENAI_ENDPOINT;
    delete process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_API_VERSION;
  });

  afterAll(() => {
    // Restore original env vars
    if (originalEndpoint !== undefined) process.env.AZURE_OPENAI_ENDPOINT = originalEndpoint;
    if (originalDeploymentName !== undefined)
      process.env.AZURE_OPENAI_DEPLOYMENT_NAME = originalDeploymentName;
    if (originalApiKey !== undefined) process.env.AZURE_OPENAI_API_KEY = originalApiKey;
    if (originalApiVersion !== undefined) process.env.AZURE_OPENAI_API_VERSION = originalApiVersion;
  });

  describe('Chat Completions API (standard models)', () => {
    it('creates AzureChatOpenAI with full config', async () => {
      const result = await createAzureOpenAIClient({
        endpoint: 'https://my-resource.openai.azure.com/',
        deployment: 'gpt-4o',
        apiVersion: '2024-06-01',
        apiKey: 'test-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBeDefined();
        expect(result.message).toContain('gpt-4o');
        expect(result.message).toContain('Chat Completions');
      }
    });

    it('creates AzureChatOpenAI without apiKey (uses Azure CLI)', async () => {
      // Mock Azure CLI returning a token
      mockSpawnSync.mockReturnValueOnce({
        status: 0,
        stdout: 'mock-cli-token\n',
        stderr: '',
      });

      const result = await createAzureOpenAIClient({
        endpoint: 'https://my-resource.openai.azure.com/',
        deployment: 'gpt-4o',
        apiVersion: '2024-06-01',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('Azure CLI');
      }
    });

    it('uses default apiVersion when not specified', async () => {
      const config: Record<string, unknown> = {
        endpoint: 'https://my-resource.openai.azure.com/',
        deployment: 'gpt-4o',
        apiKey: 'test-key',
      };

      const result = await createAzureOpenAIClient(config);

      expect(result.success).toBe(true);
      expect(mockAzureChatOpenAI).toHaveBeenCalledWith({
        azureOpenAIEndpoint: 'https://my-resource.openai.azure.com/',
        azureOpenAIApiDeploymentName: 'gpt-4o',
        azureOpenAIApiVersion: '2024-06-01',
        azureOpenAIApiKey: 'test-key',
      });
    });

    it('returns error when endpoint is missing', async () => {
      const result = await createAzureOpenAIClient({
        deployment: 'gpt-4o',
        apiKey: 'test-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
        expect(result.message).toContain('endpoint');
      }
    });

    it('returns error when deployment is missing', async () => {
      const result = await createAzureOpenAIClient({
        endpoint: 'https://my-resource.openai.azure.com/',
        apiKey: 'test-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
        expect(result.message).toContain('deployment');
      }
    });

    it('returns error when no authentication available', async () => {
      const result = await createAzureOpenAIClient({
        endpoint: 'https://my-resource.openai.azure.com/',
        deployment: 'gpt-4o',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
        expect(result.message).toContain('authentication');
      }
    });

    it('handles Record<string, unknown> config type', async () => {
      const config: Record<string, unknown> = {
        endpoint: 'https://my-resource.openai.azure.com/',
        deployment: 'my-gpt4',
        apiVersion: '2024-08-01',
        apiKey: 'test-key',
      };

      const result = await createAzureOpenAIClient(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('my-gpt4');
      }
    });

    it('passes correct parameters to AzureChatOpenAI', async () => {
      await createAzureOpenAIClient({
        endpoint: 'https://my-resource.openai.azure.com/',
        deployment: 'gpt-4o',
        apiVersion: '2024-06-01',
        apiKey: 'test-key',
      });

      expect(mockAzureChatOpenAI).toHaveBeenCalledWith({
        azureOpenAIEndpoint: 'https://my-resource.openai.azure.com/',
        azureOpenAIApiDeploymentName: 'gpt-4o',
        azureOpenAIApiVersion: '2024-06-01',
        azureOpenAIApiKey: 'test-key',
      });
    });

    it('returns error when AzureChatOpenAI constructor throws', async () => {
      mockAzureChatOpenAI.mockImplementationOnce(() => {
        throw new Error('Invalid API key provided');
      });

      const result = await createAzureOpenAIClient({
        endpoint: 'https://my-resource.openai.azure.com/',
        deployment: 'gpt-4o',
        apiKey: 'invalid-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('AUTHENTICATION_ERROR');
        expect(result.message).toBe('Invalid API key provided');
      }
    });

    it('handles non-Error thrown objects', async () => {
      mockAzureChatOpenAI.mockImplementationOnce(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'string error';
      });

      const result = await createAzureOpenAIClient({
        endpoint: 'https://my-resource.openai.azure.com/',
        deployment: 'gpt-4o',
        apiKey: 'test-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toBe('Failed to create Azure OpenAI client');
      }
    });

    it('uses env vars when config values are empty strings', async () => {
      process.env.AZURE_OPENAI_ENDPOINT = 'https://env-resource.openai.azure.com/';
      process.env.AZURE_OPENAI_DEPLOYMENT_NAME = 'env-deployment';
      process.env.AZURE_OPENAI_API_KEY = 'env-key';

      const result = await createAzureOpenAIClient({
        endpoint: '',
        deployment: '',
        apiKey: '',
      });

      expect(result.success).toBe(true);
      expect(mockAzureChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          azureOpenAIEndpoint: 'https://env-resource.openai.azure.com/',
          azureOpenAIApiDeploymentName: 'env-deployment',
          azureOpenAIApiKey: 'env-key',
        })
      );
    });

    it('uses env var for apiVersion when not in config', async () => {
      process.env.AZURE_OPENAI_API_VERSION = '2025-01-01';

      const result = await createAzureOpenAIClient({
        endpoint: 'https://my-resource.openai.azure.com/',
        deployment: 'gpt-4o',
        apiKey: 'test-key',
      });

      expect(result.success).toBe(true);
      expect(mockAzureChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          azureOpenAIApiVersion: '2025-01-01',
        })
      );
    });
  });

  describe('Responses API (reasoning models)', () => {
    it('creates Responses API client for gpt-5-codex deployment', async () => {
      const result = await createAzureOpenAIClient({
        endpoint: 'https://my-resource.openai.azure.com/',
        deployment: 'gpt-5-codex',
        apiKey: 'test-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('gpt-5-codex');
        expect(result.message).toContain('Responses');
      }
      // Should use AzureOpenAI from openai package, not AzureChatOpenAI
      expect(mockAzureOpenAI).toHaveBeenCalled();
    });

    it('creates Responses API client for o1 deployment', async () => {
      const result = await createAzureOpenAIClient({
        endpoint: 'https://my-resource.openai.azure.com/',
        deployment: 'o1',
        apiKey: 'test-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('Responses');
      }
    });

    it('creates Responses API client for o3 deployment', async () => {
      const result = await createAzureOpenAIClient({
        endpoint: 'https://my-resource.openai.azure.com/',
        deployment: 'o3',
        apiKey: 'test-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('Responses');
      }
    });

    it('creates Responses API client for o1-preview deployment', async () => {
      const result = await createAzureOpenAIClient({
        endpoint: 'https://my-resource.openai.azure.com/',
        deployment: 'o1-preview',
        apiKey: 'test-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('Responses');
      }
    });

    it('creates Responses API client for o1-mini deployment', async () => {
      const result = await createAzureOpenAIClient({
        endpoint: 'https://my-resource.openai.azure.com/',
        deployment: 'o1-mini',
        apiKey: 'test-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('Responses');
      }
    });

    it('handles case-insensitive model detection', async () => {
      const result = await createAzureOpenAIClient({
        endpoint: 'https://my-resource.openai.azure.com/',
        deployment: 'GPT-5-CODEX',
        apiKey: 'test-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('Responses');
      }
    });

    it('uses Azure CLI auth for Responses API when no apiKey', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 0,
        stdout: 'cli-token-for-responses\n',
        stderr: '',
      });

      const result = await createAzureOpenAIClient({
        endpoint: 'https://my-resource.openai.azure.com/',
        deployment: 'gpt-5-codex',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('Azure CLI');
      }
    });

    it('returns llmType as azure-responses', async () => {
      const result = await createAzureOpenAIClient({
        endpoint: 'https://my-resource.openai.azure.com/',
        deployment: 'gpt-5-codex',
        apiKey: 'test-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result._llmType()).toBe('azure-responses');
      }
    });
  });
});

describe('getAzureCLIToken', () => {
  beforeEach(() => {
    mockSpawnSync.mockClear();
  });

  it('returns token when az CLI succeeds', () => {
    mockSpawnSync.mockReturnValueOnce({
      status: 0,
      stdout: 'test-token-value\n',
      stderr: '',
    });

    const token = getAzureCLIToken();
    expect(token).toBe('test-token-value');
  });

  it('returns undefined when az CLI fails', () => {
    mockSpawnSync.mockReturnValueOnce({
      status: 1,
      stdout: '',
      stderr: 'not logged in',
    });

    const token = getAzureCLIToken();
    expect(token).toBeUndefined();
  });

  it('returns undefined when az CLI returns empty output', () => {
    mockSpawnSync.mockReturnValueOnce({
      status: 0,
      stdout: '',
      stderr: '',
    });

    const token = getAzureCLIToken();
    expect(token).toBeUndefined();
  });

  it('handles az CLI throwing an exception', () => {
    mockSpawnSync.mockImplementationOnce(() => {
      throw new Error('Command not found');
    });

    const token = getAzureCLIToken();
    expect(token).toBeUndefined();
  });
});
