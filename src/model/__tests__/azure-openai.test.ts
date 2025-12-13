/**
 * Unit tests for Azure OpenAI provider factory.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock @langchain/openai before importing
interface MockAzureOpenAIConfig {
  azureOpenAIEndpoint: string;
  azureOpenAIApiDeploymentName: string;
  azureOpenAIApiVersion: string;
  azureOpenAIApiKey?: string;
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

// Import after mocking
const { createAzureOpenAIClient } = await import('../providers/azure-openai.js');

describe('createAzureOpenAIClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates AzureChatOpenAI with full config', () => {
    const result = createAzureOpenAIClient({
      endpoint: 'https://my-resource.openai.azure.com/',
      deployment: 'gpt-4o',
      apiVersion: '2024-06-01',
      apiKey: 'test-key',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toBeDefined();
      expect(result.message).toContain('gpt-4o');
    }
  });

  it('creates AzureChatOpenAI without apiKey (uses env var)', () => {
    const result = createAzureOpenAIClient({
      endpoint: 'https://my-resource.openai.azure.com/',
      deployment: 'gpt-4o',
      apiVersion: '2024-06-01',
    });

    expect(result.success).toBe(true);
  });

  it('uses default apiVersion when not specified', () => {
    const config: Record<string, unknown> = {
      endpoint: 'https://my-resource.openai.azure.com/',
      deployment: 'gpt-4o',
      apiKey: 'test-key',
    };

    const result = createAzureOpenAIClient(config);

    expect(result.success).toBe(true);
    expect(mockAzureChatOpenAI).toHaveBeenCalledWith({
      azureOpenAIEndpoint: 'https://my-resource.openai.azure.com/',
      azureOpenAIApiDeploymentName: 'gpt-4o',
      azureOpenAIApiVersion: '2024-06-01',
      azureOpenAIApiKey: 'test-key',
    });
  });

  it('returns error when endpoint is missing', () => {
    const result = createAzureOpenAIClient({
      deployment: 'gpt-4o',
      apiKey: 'test-key',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
      expect(result.message).toContain('endpoint');
    }
  });

  it('returns error when deployment is missing', () => {
    const result = createAzureOpenAIClient({
      endpoint: 'https://my-resource.openai.azure.com/',
      apiKey: 'test-key',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
      expect(result.message).toContain('deployment');
    }
  });

  it('handles Record<string, unknown> config type', () => {
    const config: Record<string, unknown> = {
      endpoint: 'https://my-resource.openai.azure.com/',
      deployment: 'my-gpt4',
      apiVersion: '2024-08-01',
      apiKey: 'test-key',
    };

    const result = createAzureOpenAIClient(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain('my-gpt4');
    }
  });

  it('passes correct parameters to AzureChatOpenAI', () => {
    createAzureOpenAIClient({
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

  it('returns error when AzureChatOpenAI constructor throws', () => {
    mockAzureChatOpenAI.mockImplementationOnce(() => {
      throw new Error('Invalid API key provided');
    });

    const result = createAzureOpenAIClient({
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

  it('handles non-Error thrown objects', () => {
    mockAzureChatOpenAI.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'string error';
    });

    const result = createAzureOpenAIClient({
      endpoint: 'https://my-resource.openai.azure.com/',
      deployment: 'gpt-4o',
      apiKey: 'test-key',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe('Failed to create Azure OpenAI client');
    }
  });
});
