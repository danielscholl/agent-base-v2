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
const mockGetSupportedProviders = jest.fn<() => string[]>();

// Mock registry module before importing LLMClient
jest.unstable_mockModule('../registry.js', () => ({
  isProviderSupported: mockIsProviderSupported,
  getProviderFactory: mockGetProviderFactory,
  getSupportedProviders: mockGetSupportedProviders,
}));

// Dynamic import after mock setup
const { LLMClient } = await import('../llm.js');

// Mock BaseChatModel
function createMockModel(invokeResponse: MockResponse = mockInvokeResponse): {
  invoke: jest.MockedFunction<(input: unknown) => Promise<MockResponse>>;
  stream: jest.MockedFunction<(input: unknown) => Promise<AsyncIterable<MockChunk>>>;
  bind: jest.MockedFunction<(options: Record<string, unknown>) => unknown>;
} {
  return {
    invoke: jest.fn<(input: unknown) => Promise<MockResponse>>().mockResolvedValue(invokeResponse),
    stream: jest
      .fn<(input: unknown) => Promise<AsyncIterable<MockChunk>>>()
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
    mockGetSupportedProviders.mockReturnValue(['openai']);
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

    it('ignores call options (LangChain 1.x requires options at construction)', async () => {
      // Note: In LangChain 1.x, temperature and maxTokens must be set at model construction.
      // Runtime options are passed to invoke but are no longer applied via .bind()
      const client = new LLMClient({ config });
      await client.invoke('Hello', { temperature: 0.5, maxTokens: 100 });

      // Options are accepted but not applied - LangChain 1.x doesn't support runtime binding
      expect(mockModel.invoke).toHaveBeenCalled();
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

    it('ignores call options for stream (LangChain 1.x requires options at construction)', async () => {
      // Note: In LangChain 1.x, temperature and maxTokens must be set at model construction.
      // Runtime options are passed to stream but are no longer applied via .bind()
      const client = new LLMClient({ config });
      await client.stream('Hello', { temperature: 0.7 });

      // Options are accepted but not applied - LangChain 1.x doesn't support runtime binding
      expect(mockModel.stream).toHaveBeenCalled();
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

    it('returns modelAlias for Foundry in local mode', () => {
      config.providers.default = 'foundry';
      config.providers.foundry = { mode: 'local', modelAlias: 'llama-local' };

      const client = new LLMClient({ config });
      expect(client.getModelName()).toBe('llama-local');
    });

    it('returns unknown for Foundry local mode when modelAlias not set', () => {
      config.providers.default = 'foundry';
      config.providers.foundry = { mode: 'local' };

      const client = new LLMClient({ config });
      expect(client.getModelName()).toBe('unknown');
    });
  });

  describe('getProviderMode', () => {
    it('returns mode for Foundry provider', () => {
      config.providers.default = 'foundry';
      config.providers.foundry = { mode: 'local' };

      const client = new LLMClient({ config });
      expect(client.getProviderMode()).toBe('local');
    });

    it('returns undefined for non-Foundry providers', () => {
      config.providers.default = 'openai';
      config.providers.openai = { model: 'gpt-4o' };

      const client = new LLMClient({ config });
      expect(client.getProviderMode()).toBeUndefined();
    });

    it('returns undefined when provider config is undefined', () => {
      config.providers.default = 'foundry';
      config.providers.foundry = undefined;

      const client = new LLMClient({ config });
      expect(client.getProviderMode()).toBeUndefined();
    });

    it('returns undefined when Foundry mode is not a string', () => {
      config.providers.default = 'foundry';
      config.providers.foundry = { mode: 123 as unknown as string };

      const client = new LLMClient({ config });
      expect(client.getProviderMode()).toBeUndefined();
    });
  });

  describe('retry integration', () => {
    it('retries invoke() on retryable errors and invokes onRetry callback', async () => {
      let callCount = 0;
      mockModel.invoke.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          // First 2 calls fail with rate limit
          return Promise.reject(
            Object.assign(new Error('Rate limit exceeded'), {
              status: 429,
              response: { status: 429 },
            })
          );
        }
        // Third call succeeds
        return Promise.resolve(mockInvokeResponse);
      });

      const onRetry = jest.fn();
      const callbacks: LLMCallbacks = { onRetry };

      // Enable retry with 3 max retries
      config.retry = {
        enabled: true,
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        enableJitter: false,
      };

      const client = new LLMClient({ config, callbacks });
      const result = await client.invoke('Hello');

      expect(result.success).toBe(true);
      expect(callCount).toBe(3); // Initial + 2 retries
      expect(onRetry).toHaveBeenCalledTimes(2);

      // Verify callback context
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 1,
          maxRetries: 3,
          error: 'RATE_LIMITED',
        })
      );
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 2,
          maxRetries: 3,
          error: 'RATE_LIMITED',
        })
      );
    });

    it('retries stream() on retryable errors', async () => {
      let callCount = 0;
      mockModel.stream.mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          // First call fails with network error
          return Promise.reject(new Error('Network error'));
        }
        // Second call succeeds
        return Promise.resolve(createMockStream(['Hello', ' world']));
      });

      const onRetry = jest.fn();
      const callbacks: LLMCallbacks = { onRetry };

      config.retry = {
        enabled: true,
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        enableJitter: false,
      };

      const client = new LLMClient({ config, callbacks });
      const result = await client.stream('Hello');

      expect(result.success).toBe(true);
      expect(callCount).toBe(2); // Initial + 1 retry
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 1,
          error: 'NETWORK_ERROR',
        })
      );
    });

    it('does not retry when config.retry.enabled is false', async () => {
      mockModel.invoke.mockRejectedValue(
        Object.assign(new Error('Rate limit exceeded'), {
          status: 429,
          response: { status: 429 },
        })
      );

      const onRetry = jest.fn();
      const callbacks: LLMCallbacks = { onRetry, onError: jest.fn() };

      // Disable retry
      config.retry = {
        enabled: false,
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        enableJitter: false,
      };

      const client = new LLMClient({ config, callbacks });
      const result = await client.invoke('Hello');

      expect(result.success).toBe(false);
      expect(mockModel.invoke).toHaveBeenCalledTimes(1); // No retries
      expect(onRetry).not.toHaveBeenCalled();
      expect(callbacks.onError).toHaveBeenCalledWith('RATE_LIMITED', 'Rate limit exceeded');
    });

    it('respects custom retry config passed to constructor', async () => {
      let callCount = 0;
      mockModel.invoke.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('Timeout'));
        }
        return Promise.resolve(mockInvokeResponse);
      });

      const onRetry = jest.fn();

      // Set default config retry to 1, but override with 5
      config.retry = {
        enabled: true,
        maxRetries: 1,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        enableJitter: false,
      };

      const customRetryConfig = {
        enabled: true,
        maxRetries: 5,
        baseDelayMs: 50,
        maxDelayMs: 500,
        enableJitter: false,
      };

      const client = new LLMClient({
        config,
        callbacks: { onRetry },
        retryConfig: customRetryConfig,
      });

      const result = await client.invoke('Hello');

      expect(result.success).toBe(true);
      expect(callCount).toBe(3);
      expect(onRetry).toHaveBeenCalledTimes(2);

      // Verify it used custom maxRetries (5) not config maxRetries (1)
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          maxRetries: 5,
        })
      );
    });

    it('does not retry on non-retryable errors', async () => {
      mockModel.invoke.mockRejectedValue(
        Object.assign(new Error('API key invalid'), {
          status: 401,
          response: { status: 401 },
        })
      );

      const onRetry = jest.fn();
      const callbacks: LLMCallbacks = { onRetry, onError: jest.fn() };

      config.retry = {
        enabled: true,
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        enableJitter: false,
      };

      const client = new LLMClient({ config, callbacks });
      const result = await client.invoke('Hello');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('AUTHENTICATION_ERROR');
      }
      expect(mockModel.invoke).toHaveBeenCalledTimes(1); // No retries
      expect(onRetry).not.toHaveBeenCalled();
      expect(callbacks.onError).toHaveBeenCalledWith('AUTHENTICATION_ERROR', 'API key invalid');
    });

    it('stops retrying after maxRetries is exhausted', async () => {
      mockModel.invoke.mockRejectedValue(
        Object.assign(new Error('Rate limit exceeded'), {
          status: 429,
          response: { status: 429 },
        })
      );

      const onRetry = jest.fn();
      const callbacks: LLMCallbacks = { onRetry, onError: jest.fn() };

      config.retry = {
        enabled: true,
        maxRetries: 2,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        enableJitter: false,
      };

      const client = new LLMClient({ config, callbacks });
      const result = await client.invoke('Hello');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('RATE_LIMITED');
      }
      expect(mockModel.invoke).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(callbacks.onError).toHaveBeenCalledWith('RATE_LIMITED', 'Rate limit exceeded');
    });

    it('stream() with retry disabled fires onError on failure', async () => {
      mockModel.stream.mockRejectedValue(new Error('Network error'));

      const onRetry = jest.fn();
      const onError = jest.fn();
      const callbacks: LLMCallbacks = { onRetry, onError };

      // Disable retry
      config.retry = {
        enabled: false,
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        enableJitter: false,
      };

      const client = new LLMClient({ config, callbacks });
      const result = await client.stream('Hello');

      expect(result.success).toBe(false);
      expect(mockModel.stream).toHaveBeenCalledTimes(1); // No retries
      expect(onRetry).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith('NETWORK_ERROR', 'Network error');
    });

    it('stream iteration error triggers onStreamEnd callback', async () => {
      // Create a stream that throws an error during iteration
      const errorStream = {
        [Symbol.asyncIterator](): AsyncIterator<MockChunk> {
          let count = 0;
          return {
            next(): Promise<IteratorResult<MockChunk>> {
              count++;
              if (count === 1) {
                return Promise.resolve({
                  done: false,
                  value: { content: 'First chunk', response_metadata: {} },
                });
              }
              // Second call throws an error
              return Promise.reject(new Error('Stream interrupted'));
            },
          };
        },
      };

      mockModel.stream.mockResolvedValue(errorStream);

      const onStreamChunk = jest.fn();
      const onStreamEnd = jest.fn();
      const callbacks: LLMCallbacks = { onStreamChunk, onStreamEnd };

      config.retry = {
        enabled: false,
        maxRetries: 0,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        enableJitter: false,
      };

      const client = new LLMClient({ config, callbacks });
      const result = await client.stream('Hello');

      expect(result.success).toBe(true);
      if (result.success) {
        // Consume the stream to trigger the error
        await expect(async () => {
          for await (const _chunk of result.result) {
            // consume chunks
          }
        }).rejects.toThrow('Stream interrupted');
      }

      // onStreamEnd should be called even on error (in the catch block)
      expect(onStreamChunk).toHaveBeenCalledWith('First chunk');
      expect(onStreamEnd).toHaveBeenCalled();
    });
  });
});
