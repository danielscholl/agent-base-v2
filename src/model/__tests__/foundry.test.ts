/**
 * Unit tests for Azure AI Foundry provider factory.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock @langchain/openai before importing
interface MockOpenAIConfig {
  model: string;
  openAIApiKey?: string;
  temperature?: number;
  configuration?: { baseURL?: string; defaultHeaders?: Record<string, string> };
}

const mockChatOpenAI = jest
  .fn<(config: MockOpenAIConfig) => { model: string; _type: string }>()
  .mockImplementation((config) => ({
    model: config.model,
    _type: 'chat_model',
  }));

jest.unstable_mockModule('@langchain/openai', () => ({
  ChatOpenAI: mockChatOpenAI,
}));

// Mock foundry-local-sdk with stable mock function
const mockInit = jest.fn<(alias: string) => Promise<{ id: string } | null>>();

// Create a stable mock class
class MockFoundryLocalManager {
  init = mockInit;
  endpoint = 'http://localhost:5272/v1';
  apiKey = 'local-key';
}

jest.unstable_mockModule('foundry-local-sdk', () => ({
  FoundryLocalManager: MockFoundryLocalManager,
}));

// Import after mocking
const { createFoundryClient } = await import('../providers/foundry.js');

describe('createFoundryClient (async)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock implementations
    mockChatOpenAI.mockImplementation((config) => ({
      model: config.model,
      _type: 'chat_model',
    }));
    mockInit.mockResolvedValue({ id: 'phi-3-mini-4k-instruct' });
  });

  describe('Cloud Mode', () => {
    it('creates ChatOpenAI with full cloud config', async () => {
      const result = await createFoundryClient({
        mode: 'cloud',
        projectEndpoint: 'https://my-resource.services.ai.azure.com/',
        modelDeployment: 'gpt-4o',
        apiKey: 'test-api-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBeDefined();
        expect(result.message).toContain('gpt-4o');
      }
      expect(mockChatOpenAI).toHaveBeenCalledWith({
        model: 'gpt-4o',
        openAIApiKey: 'azure-uses-api-key-header',
        configuration: {
          baseURL: 'https://my-resource.services.ai.azure.com/openai/v1',
          defaultHeaders: {
            'api-key': 'test-api-key',
          },
        },
      });
    });

    it('creates ChatOpenAI with default model when not specified', async () => {
      const result = await createFoundryClient({
        mode: 'cloud',
        projectEndpoint: 'https://my-resource.services.ai.azure.com/',
        apiKey: 'test-api-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('gpt-4o');
      }
    });

    it('returns error when projectEndpoint is missing in cloud mode', async () => {
      const result = await createFoundryClient({
        mode: 'cloud',
        modelDeployment: 'gpt-4o',
        apiKey: 'test-api-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
        expect(result.message).toContain('projectEndpoint');
      }
    });

    it('returns error when projectEndpoint is empty string in cloud mode', async () => {
      const result = await createFoundryClient({
        mode: 'cloud',
        projectEndpoint: '',
        modelDeployment: 'gpt-4o',
        apiKey: 'test-api-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
      }
    });

    it('handles temperature parameter in cloud mode', async () => {
      const result = await createFoundryClient({
        mode: 'cloud',
        projectEndpoint: 'https://my-resource.services.ai.azure.com/',
        modelDeployment: 'gpt-4o',
        apiKey: 'test-api-key',
        temperature: 0.7,
      });

      expect(result.success).toBe(true);
      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
        })
      );
    });

    it('handles projectEndpoint without trailing slash', async () => {
      const result = await createFoundryClient({
        mode: 'cloud',
        projectEndpoint: 'https://my-resource.services.ai.azure.com',
        modelDeployment: 'gpt-4o',
        apiKey: 'test-api-key',
      });

      expect(result.success).toBe(true);
      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            baseURL: 'https://my-resource.services.ai.azure.com/openai/v1',
          }),
        })
      );
    });

    it('handles undefined apiKey in cloud mode', async () => {
      const result = await createFoundryClient({
        mode: 'cloud',
        projectEndpoint: 'https://my-resource.services.ai.azure.com/',
        modelDeployment: 'gpt-4o',
      });

      expect(result.success).toBe(true);
      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          openAIApiKey: 'azure-uses-api-key-header',
          configuration: expect.objectContaining({
            defaultHeaders: {
              'api-key': '',
            },
          }),
        })
      );
    });

    it('returns error when ChatOpenAI constructor throws in cloud mode', async () => {
      mockChatOpenAI.mockImplementationOnce(() => {
        throw new Error('Network error');
      });

      const result = await createFoundryClient({
        mode: 'cloud',
        projectEndpoint: 'https://my-resource.services.ai.azure.com/',
        modelDeployment: 'gpt-4o',
        apiKey: 'test-api-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('NETWORK_ERROR');
        expect(result.message).toBe('Network error');
      }
    });

    it('handles non-Error thrown objects in cloud mode', async () => {
      mockChatOpenAI.mockImplementationOnce(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'string error';
      });

      const result = await createFoundryClient({
        mode: 'cloud',
        projectEndpoint: 'https://my-resource.services.ai.azure.com/',
        modelDeployment: 'gpt-4o',
        apiKey: 'test-api-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toBe('Failed to create Foundry Cloud client');
      }
    });
  });

  describe('Local Mode', () => {
    it('creates ChatOpenAI with model alias', async () => {
      const result = await createFoundryClient({
        mode: 'local',
        modelAlias: 'phi-3-mini-4k',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBeDefined();
        expect(result.message).toContain('phi-3-mini-4k-instruct');
        expect(result.message).toContain('phi-3-mini-4k');
      }
      expect(mockInit).toHaveBeenCalledWith('phi-3-mini-4k');
      expect(mockChatOpenAI).toHaveBeenCalledWith({
        model: 'phi-3-mini-4k-instruct',
        openAIApiKey: 'local-key',
        configuration: { baseURL: 'http://localhost:5272/v1' },
      });
    });

    it('creates ChatOpenAI with default alias when not specified', async () => {
      const result = await createFoundryClient({
        mode: 'local',
      });

      expect(result.success).toBe(true);
      expect(mockInit).toHaveBeenCalledWith('phi-3-mini-4k');
    });

    it('handles temperature parameter in local mode', async () => {
      const result = await createFoundryClient({
        mode: 'local',
        modelAlias: 'phi-3-mini-4k',
        temperature: 0.5,
      });

      expect(result.success).toBe(true);
      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.5,
        })
      );
    });

    it('returns error when foundry-local-sdk init fails', async () => {
      mockInit.mockRejectedValueOnce(new Error('Model not found'));

      const result = await createFoundryClient({
        mode: 'local',
        modelAlias: 'unknown-model',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toBe('Model not found');
      }
    });

    it('returns error when model info is null', async () => {
      mockInit.mockResolvedValueOnce(null);

      const result = await createFoundryClient({
        mode: 'local',
        modelAlias: 'unknown-model',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('MODEL_NOT_FOUND');
        expect(result.message).toContain('unknown-model');
      }
    });

    it('returns error when ChatOpenAI constructor throws in local mode', async () => {
      mockChatOpenAI.mockImplementationOnce(() => {
        throw new Error('Connection refused');
      });

      const result = await createFoundryClient({
        mode: 'local',
        modelAlias: 'phi-3-mini-4k',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('NETWORK_ERROR');
        expect(result.message).toBe('Connection refused');
      }
    });

    it('handles non-Error thrown objects in local mode', async () => {
      mockInit.mockRejectedValueOnce('string error');

      const result = await createFoundryClient({
        mode: 'local',
        modelAlias: 'phi-3-mini-4k',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toBe('Failed to create Foundry Local client');
      }
    });
  });

  describe('Mode Selection', () => {
    it('defaults to cloud mode when mode not specified', async () => {
      const result = await createFoundryClient({
        projectEndpoint: 'https://my-resource.services.ai.azure.com/',
        modelDeployment: 'gpt-4o',
        apiKey: 'test-api-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('Foundry Cloud');
      }
    });

    it('uses local mode when explicitly set', async () => {
      const result = await createFoundryClient({
        mode: 'local',
        modelAlias: 'phi-3-mini-4k',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('Foundry Local');
      }
    });

    it('uses cloud mode when explicitly set', async () => {
      const result = await createFoundryClient({
        mode: 'cloud',
        projectEndpoint: 'https://my-resource.services.ai.azure.com/',
        modelDeployment: 'gpt-4o',
        apiKey: 'test-api-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('Foundry Cloud');
      }
    });
  });

  describe('Record<string, unknown> Config', () => {
    it('handles Record<string, unknown> config type for cloud mode', async () => {
      const config: Record<string, unknown> = {
        mode: 'cloud',
        projectEndpoint: 'https://my-resource.services.ai.azure.com/',
        modelDeployment: 'gpt-4o',
        apiKey: 'test-api-key',
      };

      const result = await createFoundryClient(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('gpt-4o');
      }
    });

    it('handles Record<string, unknown> config type for local mode', async () => {
      const config: Record<string, unknown> = {
        mode: 'local',
        modelAlias: 'qwen2.5-0.5b',
      };

      mockInit.mockResolvedValueOnce({ id: 'qwen2.5-0.5b-instruct' });

      const result = await createFoundryClient(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('qwen2.5-0.5b');
      }
    });
  });
});
