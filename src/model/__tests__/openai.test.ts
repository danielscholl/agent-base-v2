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
      expect(result.message).toContain('gpt-5-mini');
    }
    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: 'gpt-5-mini',
      openAIApiKey: 'test-key',
      configuration: undefined,
    });
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
});
