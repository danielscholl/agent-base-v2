/**
 * Unit tests for Gemini provider factory.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock @langchain/google-genai before importing
interface MockGeminiConfig {
  model: string;
  apiKey?: string;
}

const mockChatGoogleGenerativeAI = jest
  .fn<(config: MockGeminiConfig) => { model: string; _type: string }>()
  .mockImplementation((config) => ({
    model: config.model,
    _type: 'chat_model',
  }));

jest.unstable_mockModule('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: mockChatGoogleGenerativeAI,
}));

// Import after mocking
const { createGeminiClient } = await import('../providers/gemini.js');

describe('createGeminiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Gemini API mode', () => {
    it('creates ChatGoogleGenerativeAI with model from config', () => {
      const result = createGeminiClient({
        model: 'gemini-2.0-flash-exp',
        apiKey: 'test-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBeDefined();
        expect(result.message).toContain('gemini-2.0-flash-exp');
        expect(result.message).toContain('Gemini API');
      }
    });

    it('creates client without apiKey (uses env var)', () => {
      const result = createGeminiClient({
        model: 'gemini-2.0-flash-exp',
      });

      expect(result.success).toBe(true);
    });

    it('uses default model when not specified', () => {
      const config: Record<string, unknown> = {
        apiKey: 'test-key',
      };

      const result = createGeminiClient(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('gemini-2.0-flash-exp');
      }
    });

    it('passes apiKey for Gemini API mode', () => {
      createGeminiClient({
        model: 'gemini-2.0-flash-exp',
        apiKey: 'test-key',
        useVertexai: false,
      });

      expect(mockChatGoogleGenerativeAI).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash-exp',
        apiKey: 'test-key',
      });
    });
  });

  describe('Vertex AI mode', () => {
    it('returns error when Vertex AI mode is requested', () => {
      const result = createGeminiClient({
        model: 'gemini-2.0-flash-exp',
        useVertexai: true,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
        expect(result.message).toContain('@langchain/google-vertexai');
      }
    });

    it('returns error with guidance for Vertex AI users', () => {
      const result = createGeminiClient({
        model: 'gemini-2.0-flash-exp',
        useVertexai: true,
        projectId: 'my-project',
        location: 'us-central1',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
        expect(result.message).toContain('Vertex AI mode requires');
      }
    });
  });

  describe('error handling', () => {
    it('returns error when constructor throws', () => {
      mockChatGoogleGenerativeAI.mockImplementationOnce(() => {
        throw new Error('Invalid API key');
      });

      const result = createGeminiClient({
        model: 'gemini-2.0-flash-exp',
        apiKey: 'invalid-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('AUTHENTICATION_ERROR');
      }
    });

    it('handles non-Error thrown objects', () => {
      mockChatGoogleGenerativeAI.mockImplementationOnce(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'string error';
      });

      const result = createGeminiClient({
        model: 'gemini-2.0-flash-exp',
        apiKey: 'test-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toBe('Failed to create Gemini client');
      }
    });
  });

  describe('config type handling', () => {
    it('handles Record<string, unknown> config type', () => {
      const config: Record<string, unknown> = {
        model: 'gemini-1.5-pro',
        apiKey: 'test-key',
      };

      const result = createGeminiClient(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('gemini-1.5-pro');
      }
    });
  });
});
