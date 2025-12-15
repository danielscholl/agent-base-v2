/**
 * Unit tests for Anthropic provider factory.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock @langchain/anthropic before importing
interface MockAnthropicConfig {
  model: string;
  anthropicApiKey?: string;
}

const mockChatAnthropic = jest
  .fn<(config: MockAnthropicConfig) => { model: string; _type: string }>()
  .mockImplementation((config) => ({
    model: config.model,
    _type: 'chat_model',
  }));

jest.unstable_mockModule('@langchain/anthropic', () => ({
  ChatAnthropic: mockChatAnthropic,
}));

// Import after mocking
const { createAnthropicClient } = await import('../providers/anthropic.js');

describe('createAnthropicClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates ChatAnthropic with model from config', async () => {
    const result = await createAnthropicClient({
      model: 'claude-sonnet-4-20250514',
      apiKey: 'test-key',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toBeDefined();
      expect(result.message).toContain('claude-sonnet-4-20250514');
    }
  });

  it('creates ChatAnthropic without apiKey (uses env var)', async () => {
    const result = await createAnthropicClient({
      model: 'claude-sonnet-4-20250514',
    });

    expect(result.success).toBe(true);
  });

  it('uses default model when not specified', async () => {
    const config: Record<string, unknown> = {
      apiKey: 'test-key',
    };

    const result = await createAnthropicClient(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain('claude-sonnet-4-20250514');
    }
  });

  it('handles Record<string, unknown> config type', async () => {
    const config: Record<string, unknown> = {
      model: 'claude-opus-4-20250514',
      apiKey: 'test-key',
    };

    const result = await createAnthropicClient(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain('claude-opus-4-20250514');
    }
  });

  it('passes correct parameters to ChatAnthropic', async () => {
    await createAnthropicClient({
      model: 'claude-sonnet-4-20250514',
      apiKey: 'test-key',
    });

    expect(mockChatAnthropic).toHaveBeenCalledWith({
      model: 'claude-sonnet-4-20250514',
      anthropicApiKey: 'test-key',
    });
  });

  it('returns error when ChatAnthropic constructor throws', async () => {
    mockChatAnthropic.mockImplementationOnce(() => {
      throw new Error('Invalid API key provided');
    });

    const result = await createAnthropicClient({
      model: 'claude-sonnet-4-20250514',
      apiKey: 'invalid-key',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('AUTHENTICATION_ERROR');
      expect(result.message).toBe('Invalid API key provided');
    }
  });

  it('handles non-Error thrown objects', async () => {
    mockChatAnthropic.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'string error';
    });

    const result = await createAnthropicClient({
      model: 'claude-sonnet-4-20250514',
      apiKey: 'test-key',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe('Failed to create Anthropic client');
    }
  });
});
