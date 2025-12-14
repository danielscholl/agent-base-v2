/**
 * Unit tests for model response helpers and type guards.
 */

import { describe, it, expect } from '@jest/globals';
import { successResponse, errorResponse, mapErrorToCode, extractTokenUsage } from '../base.js';
import { isModelSuccess, isModelError } from '../types.js';
import type { ModelErrorCode } from '../types.js';

describe('Model Response Helpers', () => {
  describe('successResponse', () => {
    it('creates a success response with result and message', () => {
      const response = successResponse({ content: 'Hello' }, 'Success');

      expect(response).toEqual({
        success: true,
        result: { content: 'Hello' },
        message: 'Success',
      });
    });

    it('preserves generic type in result', () => {
      interface CustomResult {
        count: number;
        items: string[];
      }
      const result: CustomResult = { count: 2, items: ['a', 'b'] };
      const response = successResponse<CustomResult>(result, 'Found items');

      expect(response.result.count).toBe(2);
      expect(response.result.items).toHaveLength(2);
    });
  });

  describe('errorResponse', () => {
    it('creates an error response with code and message', () => {
      const response = errorResponse('NETWORK_ERROR', 'Connection failed');

      expect(response).toEqual({
        success: false,
        error: 'NETWORK_ERROR',
        message: 'Connection failed',
      });
    });

    it.each<ModelErrorCode>([
      'PROVIDER_NOT_CONFIGURED',
      'PROVIDER_NOT_SUPPORTED',
      'AUTHENTICATION_ERROR',
      'RATE_LIMITED',
      'MODEL_NOT_FOUND',
      'CONTEXT_LENGTH_EXCEEDED',
      'NETWORK_ERROR',
      'TIMEOUT',
      'INVALID_RESPONSE',
      'UNKNOWN',
    ])('accepts error code: %s', (errorCode) => {
      const response = errorResponse(errorCode, 'Test error');
      expect(response.error).toBe(errorCode);
    });
  });

  describe('type guards', () => {
    describe('isModelSuccess', () => {
      it('returns true for success responses', () => {
        const response = successResponse({ data: 1 }, 'OK');
        expect(isModelSuccess(response)).toBe(true);
      });

      it('returns false for error responses', () => {
        const response = errorResponse('NETWORK_ERROR', 'Failed');
        expect(isModelSuccess(response)).toBe(false);
      });
    });

    describe('isModelError', () => {
      it('returns true for error responses', () => {
        const response = errorResponse('UNKNOWN', 'Error');
        expect(isModelError(response)).toBe(true);
      });

      it('returns false for success responses', () => {
        const response = successResponse('result', 'OK');
        expect(isModelError(response)).toBe(false);
      });
    });
  });
});

describe('mapErrorToCode', () => {
  it('maps API key errors to AUTHENTICATION_ERROR', () => {
    expect(mapErrorToCode(new Error('Invalid API key'))).toBe('AUTHENTICATION_ERROR');
    expect(mapErrorToCode(new Error('Authentication failed'))).toBe('AUTHENTICATION_ERROR');
    expect(mapErrorToCode(new Error('Unauthorized access'))).toBe('AUTHENTICATION_ERROR');
  });

  it('maps rate limit errors to RATE_LIMITED', () => {
    expect(mapErrorToCode(new Error('Rate limit exceeded'))).toBe('RATE_LIMITED');
    expect(mapErrorToCode(new Error('Error 429: Too many requests'))).toBe('RATE_LIMITED');
  });

  it('maps model not found errors to MODEL_NOT_FOUND', () => {
    expect(mapErrorToCode(new Error('Model gpt-5 not found'))).toBe('MODEL_NOT_FOUND');
  });

  it('maps context length errors to CONTEXT_LENGTH_EXCEEDED', () => {
    expect(mapErrorToCode(new Error('Context length exceeded'))).toBe('CONTEXT_LENGTH_EXCEEDED');
    expect(mapErrorToCode(new Error('Input too long'))).toBe('CONTEXT_LENGTH_EXCEEDED');
    expect(mapErrorToCode(new Error('Token limit reached'))).toBe('CONTEXT_LENGTH_EXCEEDED');
  });

  it('maps timeout errors to TIMEOUT', () => {
    expect(mapErrorToCode(new Error('Request timeout'))).toBe('TIMEOUT');
    expect(mapErrorToCode(new Error('Operation timed out'))).toBe('TIMEOUT');
  });

  it('maps network errors to NETWORK_ERROR', () => {
    expect(mapErrorToCode(new Error('Network error'))).toBe('NETWORK_ERROR');
    expect(mapErrorToCode(new Error('ECONNREFUSED'))).toBe('NETWORK_ERROR');
    expect(mapErrorToCode(new Error('Fetch failed'))).toBe('NETWORK_ERROR');
    // Additional transient network errors
    expect(mapErrorToCode(new Error('ECONNRESET'))).toBe('NETWORK_ERROR');
    expect(mapErrorToCode(new Error('ENOTFOUND'))).toBe('NETWORK_ERROR');
    expect(mapErrorToCode(new Error('ETIMEDOUT'))).toBe('NETWORK_ERROR');
    expect(mapErrorToCode(new Error('EPIPE'))).toBe('NETWORK_ERROR');
    expect(mapErrorToCode(new Error('socket hang up'))).toBe('NETWORK_ERROR');
    expect(mapErrorToCode(new Error('connection refused'))).toBe('NETWORK_ERROR');
    expect(mapErrorToCode(new Error('DNS lookup failed'))).toBe('NETWORK_ERROR');
  });

  it('maps 5xx server errors to NETWORK_ERROR', () => {
    expect(mapErrorToCode(new Error('500 Internal Server Error'))).toBe('NETWORK_ERROR');
    expect(mapErrorToCode(new Error('502 Bad Gateway'))).toBe('NETWORK_ERROR');
    expect(mapErrorToCode(new Error('503 Service Unavailable'))).toBe('NETWORK_ERROR');
    // Note: 504 contains "timeout" so it matches TIMEOUT first (also retryable)
    expect(mapErrorToCode(new Error('504 Gateway Timeout'))).toBe('TIMEOUT');
    expect(mapErrorToCode(new Error('internal server error'))).toBe('NETWORK_ERROR');
    expect(mapErrorToCode(new Error('bad gateway'))).toBe('NETWORK_ERROR');
    expect(mapErrorToCode(new Error('service unavailable'))).toBe('NETWORK_ERROR');
    // "gateway timeout" matches TIMEOUT first (also retryable)
    expect(mapErrorToCode(new Error('gateway timeout'))).toBe('TIMEOUT');
  });

  it('returns UNKNOWN for unrecognized errors', () => {
    expect(mapErrorToCode(new Error('Something went wrong'))).toBe('UNKNOWN');
    expect(mapErrorToCode('string error')).toBe('UNKNOWN');
    expect(mapErrorToCode(null)).toBe('UNKNOWN');
  });
});

describe('extractTokenUsage', () => {
  it('extracts OpenAI format token usage (snake_case)', () => {
    const metadata = {
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    };

    expect(extractTokenUsage(metadata)).toEqual({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    });
  });

  it('extracts camelCase format token usage', () => {
    const metadata = {
      usage: {
        promptTokens: 15,
        completionTokens: 25,
        totalTokens: 40,
      },
    };

    expect(extractTokenUsage(metadata)).toEqual({
      promptTokens: 15,
      completionTokens: 25,
      totalTokens: 40,
    });
  });

  it('extracts token_usage format', () => {
    const metadata = {
      token_usage: {
        prompt_tokens: 5,
        completion_tokens: 10,
        total_tokens: 15,
      },
    };

    expect(extractTokenUsage(metadata)).toEqual({
      promptTokens: 5,
      completionTokens: 10,
      totalTokens: 15,
    });
  });

  it('returns undefined for missing metadata', () => {
    expect(extractTokenUsage(undefined)).toBeUndefined();
  });

  it('returns undefined for metadata without usage', () => {
    expect(extractTokenUsage({})).toBeUndefined();
    expect(extractTokenUsage({ other: 'data' })).toBeUndefined();
  });

  it('defaults to 0 for missing usage fields', () => {
    const metadata = {
      usage: {
        prompt_tokens: 10,
        // completion_tokens and total_tokens missing
      },
    };

    expect(extractTokenUsage(metadata)).toEqual({
      promptTokens: 10,
      completionTokens: 0,
      totalTokens: 0,
    });
  });
});
