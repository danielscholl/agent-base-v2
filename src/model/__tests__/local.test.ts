/**
 * Unit tests for Local provider factory.
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
const { createLocalClient } = await import('../providers/local.js');

describe('createLocalClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates ChatOpenAI with default baseUrl and model', async () => {
    const result = await createLocalClient({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toBeDefined();
      expect(result.message).toContain('qwen3-coder:latest');
    }
    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: 'qwen3-coder:latest',
      openAIApiKey: 'not-needed',
      configuration: { baseURL: 'http://localhost:11434/v1' },
    });
  });

  it('creates ChatOpenAI with custom baseUrl', async () => {
    const result = await createLocalClient({
      baseUrl: 'http://localhost:11434/v1',
      model: 'qwen3-coder:latest',
    });

    expect(result.success).toBe(true);
    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: 'qwen3-coder:latest',
      openAIApiKey: 'not-needed',
      configuration: { baseURL: 'http://localhost:11434/v1' },
    });
  });

  it('creates ChatOpenAI with custom model', async () => {
    const result = await createLocalClient({
      model: 'ai/llama3.2',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain('ai/llama3.2');
    }
  });

  it('handles Record<string, unknown> config type', async () => {
    const config: Record<string, unknown> = {
      model: 'ai/mistral',
      baseUrl: 'http://custom.local:8080/v1',
    };

    const result = await createLocalClient(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain('ai/mistral');
    }
  });

  it('uses defaults when fields are undefined', async () => {
    const config: Record<string, unknown> = {};

    const result = await createLocalClient(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain('qwen3-coder:latest');
    }
    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: 'qwen3-coder:latest',
      openAIApiKey: 'not-needed',
      configuration: { baseURL: 'http://localhost:11434/v1' },
    });
  });

  it('passes correct parameters to ChatOpenAI including openAIApiKey', async () => {
    await createLocalClient({
      model: 'ai/phi4',
      baseUrl: 'http://model-runner.docker.internal/',
    });

    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: 'ai/phi4',
      openAIApiKey: 'not-needed',
      configuration: { baseURL: 'http://model-runner.docker.internal/' },
    });
  });

  it('returns error when ChatOpenAI constructor throws', async () => {
    mockChatOpenAI.mockImplementationOnce(() => {
      throw new Error('Connection refused');
    });

    const result = await createLocalClient({
      model: 'ai/phi4',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('NETWORK_ERROR');
      expect(result.message).toBe('Connection refused');
    }
  });

  it('handles non-Error thrown objects', async () => {
    mockChatOpenAI.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'string error';
    });

    const result = await createLocalClient({
      model: 'ai/phi4',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe('Failed to create Local client');
    }
  });

  it('works with Ollama-style baseUrl', async () => {
    const result = await createLocalClient({
      baseUrl: 'http://localhost:11434/v1',
      model: 'qwen3-coder:latest',
    });

    expect(result.success).toBe(true);
    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: 'qwen3-coder:latest',
      openAIApiKey: 'not-needed',
      configuration: { baseURL: 'http://localhost:11434/v1' },
    });
  });

  it('works with LM Studio-style baseUrl', async () => {
    const result = await createLocalClient({
      baseUrl: 'http://localhost:1234/v1',
      model: 'local-model',
    });

    expect(result.success).toBe(true);
    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: 'local-model',
      openAIApiKey: 'not-needed',
      configuration: { baseURL: 'http://localhost:1234/v1' },
    });
  });

  it('uses default baseUrl when empty string provided', async () => {
    const result = await createLocalClient({
      baseUrl: '',
      model: 'custom-model',
    });

    expect(result.success).toBe(true);
    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: 'custom-model',
      openAIApiKey: 'not-needed',
      configuration: { baseURL: 'http://localhost:11434/v1' },
    });
  });

  it('uses default model when empty string provided', async () => {
    const result = await createLocalClient({
      baseUrl: 'http://localhost:11434/v1',
      model: '',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain('qwen3-coder:latest');
    }
    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: 'qwen3-coder:latest',
      openAIApiKey: 'not-needed',
      configuration: { baseURL: 'http://localhost:11434/v1' },
    });
  });

  it('uses all defaults when both baseUrl and model are empty strings', async () => {
    const result = await createLocalClient({
      baseUrl: '',
      model: '',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain('qwen3-coder:latest');
    }
    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: 'qwen3-coder:latest',
      openAIApiKey: 'not-needed',
      configuration: { baseURL: 'http://localhost:11434/v1' },
    });
  });
});
