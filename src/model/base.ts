/**
 * Helper functions for model operations.
 * Provides response factories and error mapping utilities.
 */

import type {
  ModelSuccessResponse,
  ModelErrorResponse,
  ModelErrorCode,
  TokenUsage,
} from './types.js';

/**
 * Create a success response.
 * @param result - The result data
 * @param message - Human-readable success message
 */
export function successResponse<T>(result: T, message: string): ModelSuccessResponse<T> {
  return { success: true, result, message };
}

/**
 * Create an error response.
 * @param error - The error code
 * @param message - Human-readable error message
 */
export function errorResponse(error: ModelErrorCode, message: string): ModelErrorResponse {
  return { success: false, error, message };
}

/**
 * Map common LLM errors to ModelErrorCode.
 * Uses keyword matching on error messages to categorize errors.
 *
 * @param error - The error to map
 * @returns The appropriate ModelErrorCode
 */
export function mapErrorToCode(error: unknown): ModelErrorCode {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (
      message.includes('api key') ||
      message.includes('authentication') ||
      message.includes('unauthorized')
    ) {
      return 'AUTHENTICATION_ERROR';
    }
    if (message.includes('rate limit') || message.includes('429')) {
      return 'RATE_LIMITED';
    }
    if (message.includes('model') && message.includes('not found')) {
      return 'MODEL_NOT_FOUND';
    }
    if (
      message.includes('context length') ||
      message.includes('too long') ||
      message.includes('token limit')
    ) {
      return 'CONTEXT_LENGTH_EXCEEDED';
    }
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'TIMEOUT';
    }
    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('etimedout') ||
      message.includes('epipe') ||
      message.includes('socket hang up') ||
      message.includes('fetch failed') ||
      message.includes('connection refused') ||
      message.includes('dns')
    ) {
      return 'NETWORK_ERROR';
    }
    // 5xx server errors are transient (504/gateway timeout handled above by TIMEOUT)
    if (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('internal server error') ||
      message.includes('bad gateway') ||
      message.includes('service unavailable')
    ) {
      return 'NETWORK_ERROR';
    }
  }
  return 'UNKNOWN';
}

/**
 * Extract token usage from LangChain response metadata.
 * Handles various metadata formats from different providers.
 *
 * @param metadata - Response metadata from LangChain
 * @returns TokenUsage if found, undefined otherwise
 */
export function extractTokenUsage(
  metadata: Record<string, unknown> | undefined
): TokenUsage | undefined {
  if (!metadata) return undefined;

  // OpenAI format (snake_case or camelCase)
  const usage = metadata.usage as Record<string, number> | undefined;
  if (usage) {
    return {
      promptTokens: usage.prompt_tokens ?? usage.promptTokens ?? 0,
      completionTokens: usage.completion_tokens ?? usage.completionTokens ?? 0,
      totalTokens: usage.total_tokens ?? usage.totalTokens ?? 0,
    };
  }

  // Check for token_usage format (some providers)
  const tokenUsage = metadata.token_usage as Record<string, number> | undefined;
  if (tokenUsage) {
    return {
      promptTokens: tokenUsage.prompt_tokens ?? 0,
      completionTokens: tokenUsage.completion_tokens ?? 0,
      totalTokens: tokenUsage.total_tokens ?? 0,
    };
  }

  return undefined;
}
