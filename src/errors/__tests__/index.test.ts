/**
 * Unit tests for error types, helpers, and type guards.
 */

import { describe, it, expect } from '@jest/globals';
import {
  successResponse,
  errorResponse,
  isAgentSuccess,
  isAgentError,
  mapModelErrorCodeToAgentErrorCode,
  mapToolErrorCodeToAgentErrorCode,
  getUserFriendlyMessage,
} from '../index.js';
import type {
  AgentErrorCode,
  AgentSuccessResponse,
  AgentErrorResponse,
  ProviderErrorMetadata,
} from '../index.js';

describe('Agent Error Types', () => {
  describe('successResponse', () => {
    it('creates a success response with result and message', () => {
      const response = successResponse('Hello', 'Success');

      expect(response).toEqual({
        success: true,
        result: 'Hello',
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

    it('handles empty string result', () => {
      const response = successResponse('', 'Empty result');
      expect(response.result).toBe('');
    });

    it('handles empty string message', () => {
      const response = successResponse('data', '');
      expect(response.message).toBe('');
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

    it('includes optional metadata when provided', () => {
      const metadata: ProviderErrorMetadata = {
        provider: 'openai',
        model: 'gpt-4o',
        statusCode: 429,
        retryAfter: 60,
      };
      const response = errorResponse('RATE_LIMITED', 'Too many requests', metadata);

      expect(response.metadata).toEqual(metadata);
      expect(response.metadata?.retryAfter).toBe(60);
    });

    it('does not include metadata field when not provided', () => {
      const response = errorResponse('UNKNOWN', 'Error');
      expect(response).not.toHaveProperty('metadata');
    });

    it('handles empty message', () => {
      const response = errorResponse('UNKNOWN', '');
      expect(response.message).toBe('');
    });

    it('preserves originalError in metadata', () => {
      const originalError = new Error('SDK error');
      const response = errorResponse('PROVIDER_NOT_CONFIGURED', 'Provider failed', {
        originalError,
      });

      expect(response.metadata?.originalError).toBe(originalError);
    });

    // Provider error codes (from ModelErrorCode)
    it.each<AgentErrorCode>([
      'PROVIDER_NOT_CONFIGURED',
      'PROVIDER_NOT_SUPPORTED',
      'AUTHENTICATION_ERROR',
      'RATE_LIMITED',
      'MODEL_NOT_FOUND',
      'CONTEXT_LENGTH_EXCEEDED',
      'NETWORK_ERROR',
      'TIMEOUT',
      'INVALID_RESPONSE',
    ])('accepts provider error code: %s', (errorCode) => {
      const response = errorResponse(errorCode, 'Test error');
      expect(response.error).toBe(errorCode);
    });

    // Tool error codes (from ToolErrorCode)
    it.each<AgentErrorCode>([
      'VALIDATION_ERROR',
      'IO_ERROR',
      'CONFIG_ERROR',
      'PERMISSION_DENIED',
      'NOT_FOUND',
      'LLM_ASSIST_REQUIRED',
    ])('accepts tool error code: %s', (errorCode) => {
      const response = errorResponse(errorCode, 'Test error');
      expect(response.error).toBe(errorCode);
    });

    // Agent-specific error codes
    it.each<AgentErrorCode>([
      'MAX_ITERATIONS_EXCEEDED',
      'TOOL_EXECUTION_ERROR',
      'INITIALIZATION_ERROR',
      'UNKNOWN',
    ])('accepts agent-specific error code: %s', (errorCode) => {
      const response = errorResponse(errorCode, 'Test error');
      expect(response.error).toBe(errorCode);
    });
  });

  describe('type guards', () => {
    describe('isAgentSuccess', () => {
      it('returns true for success responses', () => {
        const response = successResponse({ data: 1 }, 'OK');
        expect(isAgentSuccess(response)).toBe(true);
      });

      it('returns false for error responses', () => {
        const response = errorResponse('NETWORK_ERROR', 'Failed');
        expect(isAgentSuccess(response)).toBe(false);
      });

      it('narrows type correctly', () => {
        const response = successResponse('result', 'OK') as
          | AgentSuccessResponse<string>
          | AgentErrorResponse;

        if (isAgentSuccess(response)) {
          // TypeScript should allow accessing result
          expect(response.result).toBe('result');
        } else {
          // This branch should not execute
          expect(true).toBe(false);
        }
      });
    });

    describe('isAgentError', () => {
      it('returns true for error responses', () => {
        const response = errorResponse('UNKNOWN', 'Error');
        expect(isAgentError(response)).toBe(true);
      });

      it('returns false for success responses', () => {
        const response = successResponse('result', 'OK');
        expect(isAgentError(response)).toBe(false);
      });

      it('returns true for error responses with metadata', () => {
        const response = errorResponse('RATE_LIMITED', 'Error', {
          provider: 'openai',
          retryAfter: 30,
        });
        expect(isAgentError(response)).toBe(true);
      });

      it('narrows type correctly', () => {
        const response = errorResponse('TIMEOUT', 'Request timed out') as
          | AgentSuccessResponse<string>
          | AgentErrorResponse;

        if (isAgentError(response)) {
          // TypeScript should allow accessing error
          expect(response.error).toBe('TIMEOUT');
        } else {
          // This branch should not execute
          expect(true).toBe(false);
        }
      });
    });
  });

  describe('error mapping functions', () => {
    describe('mapModelErrorCodeToAgentErrorCode', () => {
      it.each([
        ['PROVIDER_NOT_CONFIGURED', 'PROVIDER_NOT_CONFIGURED'],
        ['PROVIDER_NOT_SUPPORTED', 'PROVIDER_NOT_SUPPORTED'],
        ['AUTHENTICATION_ERROR', 'AUTHENTICATION_ERROR'],
        ['RATE_LIMITED', 'RATE_LIMITED'],
        ['MODEL_NOT_FOUND', 'MODEL_NOT_FOUND'],
        ['CONTEXT_LENGTH_EXCEEDED', 'CONTEXT_LENGTH_EXCEEDED'],
        ['NETWORK_ERROR', 'NETWORK_ERROR'],
        ['TIMEOUT', 'TIMEOUT'],
        ['INVALID_RESPONSE', 'INVALID_RESPONSE'],
        ['UNKNOWN', 'UNKNOWN'],
      ] as const)('maps ModelErrorCode %s to AgentErrorCode %s', (input, expected) => {
        expect(mapModelErrorCodeToAgentErrorCode(input)).toBe(expected);
      });
    });

    describe('mapToolErrorCodeToAgentErrorCode', () => {
      it.each([
        ['VALIDATION_ERROR', 'VALIDATION_ERROR'],
        ['IO_ERROR', 'IO_ERROR'],
        ['CONFIG_ERROR', 'CONFIG_ERROR'],
        ['PERMISSION_DENIED', 'PERMISSION_DENIED'],
        ['RATE_LIMITED', 'RATE_LIMITED'],
        ['NOT_FOUND', 'NOT_FOUND'],
        ['LLM_ASSIST_REQUIRED', 'LLM_ASSIST_REQUIRED'],
        ['TIMEOUT', 'TIMEOUT'],
        ['UNKNOWN', 'UNKNOWN'],
      ] as const)('maps ToolErrorCode %s to AgentErrorCode %s', (input, expected) => {
        expect(mapToolErrorCodeToAgentErrorCode(input)).toBe(expected);
      });
    });
  });

  describe('getUserFriendlyMessage', () => {
    it('returns authentication error message with provider', () => {
      const message = getUserFriendlyMessage('AUTHENTICATION_ERROR', { provider: 'openai' });
      expect(message).toBe('Authentication failed with openai. Please check your API key.');
    });

    it('returns rate limit message with retry time', () => {
      const message = getUserFriendlyMessage('RATE_LIMITED', {
        provider: 'anthropic',
        retryAfter: 30,
      });
      expect(message).toBe('Rate limited by anthropic. Retry after 30 seconds.');
    });

    it('returns rate limit message without retry time', () => {
      const message = getUserFriendlyMessage('RATE_LIMITED', { provider: 'openai' });
      expect(message).toBe('Rate limited by openai. Please wait before retrying.');
    });

    it('returns model not found message with model name', () => {
      const message = getUserFriendlyMessage('MODEL_NOT_FOUND', {
        provider: 'openai',
        model: 'gpt-5',
      });
      expect(message).toBe("Model 'gpt-5' not found on openai.");
    });

    it('returns model not found message without model name', () => {
      const message = getUserFriendlyMessage('MODEL_NOT_FOUND', { provider: 'openai' });
      expect(message).toBe('The requested model was not found on openai.');
    });

    it('returns context length exceeded message', () => {
      const message = getUserFriendlyMessage('CONTEXT_LENGTH_EXCEEDED', { provider: 'openai' });
      expect(message).toBe('Input exceeds the context length limit for openai.');
    });

    it('returns network error message', () => {
      const message = getUserFriendlyMessage('NETWORK_ERROR', { provider: 'anthropic' });
      expect(message).toBe('Network error connecting to anthropic. Please check your connection.');
    });

    it('returns timeout message', () => {
      const message = getUserFriendlyMessage('TIMEOUT', { provider: 'openai' });
      expect(message).toBe('Request to openai timed out. Please try again.');
    });

    it('returns provider not configured message', () => {
      const message = getUserFriendlyMessage('PROVIDER_NOT_CONFIGURED', { provider: 'azure' });
      expect(message).toBe("Provider 'azure' is not configured. Please check your configuration.");
    });

    it('returns provider not supported message', () => {
      const message = getUserFriendlyMessage('PROVIDER_NOT_SUPPORTED', { provider: 'unknown' });
      expect(message).toBe("Provider 'unknown' is not supported.");
    });

    it('returns max iterations exceeded message', () => {
      const message = getUserFriendlyMessage('MAX_ITERATIONS_EXCEEDED');
      expect(message).toBe('Maximum iterations exceeded. The query may be too complex.');
    });

    it('returns tool execution error message', () => {
      const message = getUserFriendlyMessage('TOOL_EXECUTION_ERROR');
      expect(message).toBe('A tool failed to execute. Please check the tool configuration.');
    });

    it('returns initialization error message', () => {
      const message = getUserFriendlyMessage('INITIALIZATION_ERROR');
      expect(message).toBe('Agent initialization failed. Please check your configuration.');
    });

    it('returns validation error message', () => {
      const message = getUserFriendlyMessage('VALIDATION_ERROR');
      expect(message).toBe('Invalid input parameters provided.');
    });

    it('returns IO error message', () => {
      const message = getUserFriendlyMessage('IO_ERROR');
      expect(message).toBe('An I/O error occurred while processing your request.');
    });

    it('returns config error message', () => {
      const message = getUserFriendlyMessage('CONFIG_ERROR');
      expect(message).toBe('Configuration error. Please check your settings.');
    });

    it('returns permission denied message', () => {
      const message = getUserFriendlyMessage('PERMISSION_DENIED');
      expect(message).toBe('Permission denied for the requested operation.');
    });

    it('returns not found message', () => {
      const message = getUserFriendlyMessage('NOT_FOUND');
      expect(message).toBe('The requested resource was not found.');
    });

    it('returns LLM assist required message', () => {
      const message = getUserFriendlyMessage('LLM_ASSIST_REQUIRED');
      expect(message).toBe('The operation requires LLM assistance.');
    });

    it('returns invalid response message', () => {
      const message = getUserFriendlyMessage('INVALID_RESPONSE', { provider: 'openai' });
      expect(message).toBe('Received an invalid response from openai.');
    });

    it('returns unknown error message', () => {
      const message = getUserFriendlyMessage('UNKNOWN');
      expect(message).toBe('An unexpected error occurred.');
    });

    it('uses default provider name when metadata is missing', () => {
      const message = getUserFriendlyMessage('AUTHENTICATION_ERROR');
      expect(message).toBe('Authentication failed with the provider. Please check your API key.');
    });
  });

  describe('edge cases', () => {
    it('handles undefined metadata fields gracefully', () => {
      const metadata: ProviderErrorMetadata = {};
      const response = errorResponse('RATE_LIMITED', 'Rate limited', metadata);

      expect(response.metadata).toEqual({});
    });

    it('handles partial metadata', () => {
      const metadata: ProviderErrorMetadata = {
        provider: 'openai',
        // No other fields
      };
      const response = errorResponse('AUTHENTICATION_ERROR', 'Auth failed', metadata);

      expect(response.metadata?.provider).toBe('openai');
      expect(response.metadata?.model).toBeUndefined();
      expect(response.metadata?.statusCode).toBeUndefined();
    });

    it('handles complex result types in success responses', () => {
      const complexResult = {
        nested: {
          deeply: {
            value: 42,
          },
        },
        array: [1, 2, 3],
        nullField: null,
      };

      const response = successResponse(complexResult, 'Complex result');

      expect(response.result.nested.deeply.value).toBe(42);
      expect(response.result.array).toEqual([1, 2, 3]);
      expect(response.result.nullField).toBeNull();
    });
  });
});
