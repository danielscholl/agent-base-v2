/**
 * Unit tests for LLMClient.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { AppConfig } from '../../config/schema.js';
import { getDefaultConfig } from '../../config/schema.js';
import type { LLMCallbacks, ModelResponse } from '../types.js';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

// Create mock async iterator for streaming
interface MockChunk {
  content: string;
  response_metadata: Record<string, unknown>;
}

function createMockStream(chunks: string[]): AsyncIterable<MockChunk> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<MockChunk> {
      let index = 0;
      return {
        next(): Promise<IteratorResult<MockChunk>> {
          if (index < chunks.length) {
            const chunk = chunks[index] ?? '';
            index++;
            return Promise.resolve({
              done: false,
              value: { content: chunk, response_metadata: {} },
            });
          }
          return Promise.resolve({ done: true, value: undefined });
        },
      };
    },
  };
}

// Mock response type
interface MockResponse {
  content: string | { type: string; text: string }[];
  response_metadata: Record<string, unknown>;
}

// Mock ChatOpenAI response
const mockInvokeResponse: MockResponse = {
  content: 'Hello! How can I help you?',
  response_metadata: {
    usage: {
      prompt_tokens: 10,
      completion_tokens: 15,
      total_tokens: 25,
    },
  },
};

// Mock registry functions
const mockIsProviderSupported = jest.fn<(name: string) => boolean>();
const mockGetProviderFactory =
  jest.fn<() => ((config: Record<string, unknown>) => ModelResponse<BaseChatModel>) | undefined>();

// Mock registry module before importing LLMClient
jest.unstable_mockModule('../registry.js', () => ({
  isProviderSupported: mockIsProviderSupported,
  getProviderFactory: mockGetProviderFactory,
}));

// Dynamic import after mock setup
const { LLMClient } = await import('../llm.js');

// Mock BaseChatModel
function createMockModel(invokeResponse: MockResponse = mockInvokeResponse): {
  invoke: jest.MockedFunction<() => Promise<MockResponse>>;
  stream: jest.MockedFunction<() => Promise<AsyncIterable<MockChunk>>>;
  bind: jest.MockedFunction<(options: Record<string, unknown>) => unknown>;
} {
  return {
    invoke: jest.fn<() => Promise<MockResponse>>().mockResolvedValue(invokeResponse),
    stream: jest
      .fn<() => Promise<AsyncIterable<MockChunk>>>()
      .mockResolvedValue(createMockStream(['Hello', ' world', '!'])),
    bind: jest.fn<(options: Record<string, unknown>) => unknown>().mockReturnThis(),
  };
}

describe('LLMClient', () => {
  let config: AppConfig;
  let mockModel: ReturnType<typeof createMockModel>;

  beforeEach(() => {
    config = getDefaultConfig();
    config.providers.openai = { apiKey: 'test-key', model: 'gpt-4o' };
    config.providers.default = 'openai';

    mockModel = createMockModel();

    // Reset mocks
    jest.clearAllMocks();

    // Setup registry mocks
    mockIsProviderSupported.mockReturnValue(true);
    mockGetProviderFactory.mockReturnValue(() => ({
      success: true as const,
      result: mockModel as unknown as BaseChatModel,
      message: 'Client created',
    }));
  });

  describe('constructor', () => {
    it('creates client with config', () => {
      const client = new LLMClient({ config });
      expect(client).toBeInstanceOf(LLMClient);
    });

    it('accepts optional callbacks', () => {
      const callbacks: LLMCallbacks = {
        onStreamStart: jest.fn(),
        onStreamChunk: jest.fn(),
        onStreamEnd: jest.fn(),
        onError: jest.fn(),
      };

      const client = new LLMClient({ config, callbacks });
      expect(client).toBeInstanceOf(LLMClient);
    });
  });

  describe('invoke', () => {
    it('invokes the model with a string prompt', async () => {
      const client = new LLMClient({ config });
      const result = await client.invoke('Hello');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.content).toBe('Hello! How can I help you?');
        expect(result.result.usage).toEqual({
          promptTokens: 10,
          completionTokens: 15,
          totalTokens: 25,
        });
      }
    });

    it('returns error when provider is not supported', async () => {
      mockIsProviderSupported.mockReturnValue(false);

      const client = new LLMClient({ config });
      const result = await client.invoke('Hello');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PROVIDER_NOT_SUPPORTED');
      }
    });

    it('returns error when provider is not configured', async () => {
      config.providers.anthropic = undefined;
      config.providers.default = 'anthropic';
      mockIsProviderSupported.mockReturnValue(true);
      mockGetProviderFactory.mockReturnValue(() => ({
        success: false as const,
        error: 'PROVIDER_NOT_CONFIGURED' as const,
        message: 'Provider not configured',
      }));

      const client = new LLMClient({ config });
      const result = await client.invoke('Hello');

      expect(result.success).toBe(false);
    });

    it('caches the client across invocations', async () => {
      const client = new LLMClient({ config });

      await client.invoke('Hello');
      await client.invoke('World');

      // Factory should only be called once
      expect(mockGetProviderFactory).toHaveBeenCalledTimes(1);
    });

    it('handles model errors gracefully', async () => {
      mockModel.invoke.mockRejectedValue(new Error('API key invalid'));

      const callbacks: LLMCallbacks = { onError: jest.fn() };
      const client = new LLMClient({ config, callbacks });
      const result = await client.invoke('Hello');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('AUTHENTICATION_ERROR');
      }
      expect(callbacks.onError).toHaveBeenCalledWith('AUTHENTICATION_ERROR', 'API key invalid');
    });

    it('applies call options', async () => {
      const client = new LLMClient({ config });
      await client.invoke('Hello', { temperature: 0.5, maxTokens: 100 });

      expect(mockModel.bind).toHaveBeenCalledWith({
        temperature: 0.5,
        max_tokens: 100,
      });
    });

    it('handles non-string content', async () => {
      const mockModelWithComplexContent = createMockModel({
        content: [{ type: 'text', text: 'Hello' }],
        response_metadata: {},
      });
      mockGetProviderFactory.mockReturnValue(() => ({
        success: true as const,
        result: mockModelWithComplexContent as unknown as BaseChatModel,
        message: 'Client created',
      }));

      const client = new LLMClient({ config });
      const result = await client.invoke('Hello');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.content).toBe('[{"type":"text","text":"Hello"}]');
      }
    });

    it('returns error when factory returns undefined', async () => {
      mockIsProviderSupported.mockReturnValue(true);
      mockGetProviderFactory.mockReturnValue(undefined);

      const client = new LLMClient({ config });
      const result = await client.invoke('Hello');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PROVIDER_NOT_SUPPORTED');
        expect(result.message).toContain('No factory registered');
      }
    });

    it('invokes with array of messages', async () => {
      const client = new LLMClient({ config });
      const messages = [new SystemMessage('You are helpful.'), new HumanMessage('Hello')];

      const result = await client.invoke(messages);

      expect(result.success).toBe(true);
      expect(mockModel.invoke).toHaveBeenCalledWith(messages);
    });
  });

  describe('stream', () => {
    it('streams response chunks', async () => {
      const callbacks: LLMCallbacks = {
        onStreamStart: jest.fn(),
        onStreamChunk: jest.fn(),
        onStreamEnd: jest.fn(),
      };

      const client = new LLMClient({ config, callbacks });
      const result = await client.stream('Tell me a story');

      expect(result.success).toBe(true);
      expect(callbacks.onStreamStart).toHaveBeenCalled();

      if (result.success) {
        const chunks: string[] = [];
        for await (const chunk of result.result) {
          if (typeof chunk.content === 'string') {
            chunks.push(chunk.content);
          }
        }

        expect(chunks).toEqual(['Hello', ' world', '!']);
        expect(callbacks.onStreamChunk).toHaveBeenCalledTimes(3);
        expect(callbacks.onStreamEnd).toHaveBeenCalled();
      }
    });

    it('returns error on stream failure', async () => {
      mockModel.stream.mockRejectedValue(new Error('Network error'));

      const callbacks: LLMCallbacks = { onError: jest.fn() };
      const client = new LLMClient({ config, callbacks });
      const result = await client.stream('Hello');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('NETWORK_ERROR');
      }
      expect(callbacks.onError).toHaveBeenCalled();
    });

    it('applies call options to stream', async () => {
      const client = new LLMClient({ config });
      await client.stream('Hello', { temperature: 0.7 });

      expect(mockModel.bind).toHaveBeenCalledWith({
        temperature: 0.7,
      });
    });

    it('returns error when getClient fails', async () => {
      mockIsProviderSupported.mockReturnValue(false);

      const client = new LLMClient({ config });
      const result = await client.stream('Hello');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PROVIDER_NOT_SUPPORTED');
      }
    });

    it('streams with array of messages', async () => {
      const client = new LLMClient({ config });
      const messages = [new SystemMessage('You are helpful.'), new HumanMessage('Tell me a story')];

      const result = await client.stream(messages);

      expect(result.success).toBe(true);
      expect(mockModel.stream).toHaveBeenCalledWith(messages);
    });
  });

  describe('getProviderName', () => {
    it('returns the current provider name', () => {
      const client = new LLMClient({ config });
      expect(client.getProviderName()).toBe('openai');
    });
  });

  describe('getModelName', () => {
    it('returns the model name for OpenAI', () => {
      const client = new LLMClient({ config });
      expect(client.getModelName()).toBe('gpt-4o');
    });

    it('returns deployment for Azure', () => {
      config.providers.default = 'azure';
      config.providers.azure = { deployment: 'my-gpt4', apiVersion: '2024-06-01' };

      const client = new LLMClient({ config });
      expect(client.getModelName()).toBe('my-gpt4');
    });

    it('returns modelDeployment for Foundry', () => {
      config.providers.default = 'foundry';
      config.providers.foundry = { modelDeployment: 'my-model' };

      const client = new LLMClient({ config });
      expect(client.getModelName()).toBe('my-model');
    });

    it('returns unknown when model not configured', () => {
      config.providers.default = 'openai';
      config.providers.openai = undefined;

      const client = new LLMClient({ config });
      expect(client.getModelName()).toBe('unknown');
    });
  });
});
