/**
 * Unit tests for OpenAI provider factory.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock @langchain/openai before importing
interface MockOpenAIConfig {
  model: string;
  openAIApiKey?: string;
  configuration?: { baseURL?: string };
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

// Import after mocking
const { createOpenAIClient } = await import('../providers/openai.js');

describe('createOpenAIClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates ChatOpenAI with model from config', async () => {
    const result = await createOpenAIClient({
      model: 'gpt-4o',
      apiKey: 'test-key',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toBeDefined();
      expect(result.message).toContain('gpt-4o');
    }
  });

  it('creates ChatOpenAI with custom baseUrl', async () => {
    const result = await createOpenAIClient({
      model: 'gpt-4o',
      apiKey: 'test-key',
      baseUrl: 'https://custom.openai.com/v1',
    });

    expect(result.success).toBe(true);
  });

  it('creates ChatOpenAI without apiKey (uses env var)', async () => {
    const result = await createOpenAIClient({
      model: 'gpt-4o',
    });

    expect(result.success).toBe(true);
  });

  it('uses provided model', async () => {
    const result = await createOpenAIClient({
      model: 'gpt-4o-mini',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain('gpt-4o-mini');
    }
  });

  it('handles Record<string, unknown> config type', async () => {
    const config: Record<string, unknown> = {
      model: 'gpt-4o-mini',
      apiKey: 'test-key',
    };

    const result = await createOpenAIClient(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain('gpt-4o-mini');
    }
  });

  it('uses default model when model field is undefined', async () => {
    const config: Record<string, unknown> = {
      apiKey: 'test-key',
    };

    const result = await createOpenAIClient(config);

    expect(result.success).toBe(true);
    if (result.success) {
      // Default model is gpt-5-codex which uses Responses API
      expect(result.message).toContain('gpt-5-codex');
      expect(result.message).toContain('Responses');
    }
    // Note: gpt-5-codex uses Responses API (OpenAI client), not ChatOpenAI
    // So mockChatOpenAI is not called for the default model
  });

  it('passes correct parameters to ChatOpenAI', async () => {
    await createOpenAIClient({
      model: 'gpt-4o',
      apiKey: 'test-key',
      baseUrl: 'https://custom.openai.com/v1',
    });

    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: 'gpt-4o',
      openAIApiKey: 'test-key',
      configuration: { baseURL: 'https://custom.openai.com/v1' },
    });
  });

  it('passes undefined configuration when no baseUrl', async () => {
    await createOpenAIClient({
      model: 'gpt-4o',
      apiKey: 'test-key',
    });

    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: 'gpt-4o',
      openAIApiKey: 'test-key',
      configuration: undefined,
    });
  });

  it('returns error when ChatOpenAI constructor throws', async () => {
    mockChatOpenAI.mockImplementationOnce(() => {
      throw new Error('Invalid API key provided');
    });

    const result = await createOpenAIClient({
      model: 'gpt-4o',
      apiKey: 'invalid-key',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('AUTHENTICATION_ERROR');
      expect(result.message).toBe('Invalid API key provided');
    }
  });

  it('handles non-Error thrown objects', async () => {
    mockChatOpenAI.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'string error';
    });

    const result = await createOpenAIClient({
      model: 'gpt-4o',
      apiKey: 'test-key',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe('Failed to create OpenAI client');
    }
  });

  it('passes empty baseUrl as undefined configuration', async () => {
    await createOpenAIClient({
      model: 'gpt-4o',
      apiKey: 'test-key',
      baseUrl: '',
    });

    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: 'gpt-4o',
      openAIApiKey: 'test-key',
      configuration: undefined,
    });
  });

  describe('Responses API validation', () => {
    beforeEach(() => {
      // Clear OPENAI_API_KEY env var for these tests
      delete process.env.OPENAI_API_KEY;
    });

    it('returns error when Responses API model has no API key', async () => {
      const result = await createOpenAIClient({
        model: 'gpt-5-codex',
        // No apiKey provided and no OPENAI_API_KEY env var
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
        expect(result.message).toContain('OpenAI Responses API requires an API key');
        expect(result.message).toContain('OPENAI_API_KEY');
      }
    });

    it('returns error when Responses API model has empty API key', async () => {
      const result = await createOpenAIClient({
        model: 'o1',
        apiKey: '',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
        expect(result.message).toContain('OpenAI Responses API requires an API key');
      }
    });

    it('succeeds when Responses API model has API key from config', async () => {
      const result = await createOpenAIClient({
        model: 'o3-mini',
        apiKey: 'test-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('o3-mini');
        expect(result.message).toContain('Responses');
      }
    });

    it('succeeds when Responses API model has API key from env var', async () => {
      process.env.OPENAI_API_KEY = 'env-test-key';

      const result = await createOpenAIClient({
        model: 'o1-preview',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('o1-preview');
        expect(result.message).toContain('Responses');
      }

      delete process.env.OPENAI_API_KEY;
    });
  });
});
