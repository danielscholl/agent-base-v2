/**
 * Type definitions for the model response contract.
 * Establishes the uniform response format that all LLM operations must follow.
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { AIMessageChunk } from '@langchain/core/messages';

/**
 * Error codes for model operations.
 * Aligned with ToolErrorCode but specific to LLM operations.
 */
export type ModelErrorCode =
  | 'PROVIDER_NOT_CONFIGURED' // Provider config missing
  | 'PROVIDER_NOT_SUPPORTED' // Unknown provider name
  | 'AUTHENTICATION_ERROR' // API key invalid or missing
  | 'RATE_LIMITED' // Rate limit exceeded
  | 'MODEL_NOT_FOUND' // Model name not available
  | 'CONTEXT_LENGTH_EXCEEDED' // Input too long
  | 'NETWORK_ERROR' // Connection failed
  | 'TIMEOUT' // Request timed out
  | 'INVALID_RESPONSE' // Malformed response
  | 'UNKNOWN'; // Unexpected errors

/**
 * Success response from a model operation.
 */
export interface ModelSuccessResponse<T = unknown> {
  success: true;
  result: T;
  message: string;
}

/**
 * Error response from a model operation.
 */
export interface ModelErrorResponse {
  success: false;
  error: ModelErrorCode;
  message: string;
}

/**
 * Discriminated union for model responses.
 * Model operations return this type at public boundaries.
 */
export type ModelResponse<T = unknown> = ModelSuccessResponse<T> | ModelErrorResponse;

/**
 * Type guard for success responses.
 */
export function isModelSuccess<T>(response: ModelResponse<T>): response is ModelSuccessResponse<T> {
  return response.success;
}

/**
 * Type guard for error responses.
 */
export function isModelError(response: ModelResponse): response is ModelErrorResponse {
  return !response.success;
}

/**
 * Token usage information from an LLM call.
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Result from a successful invoke operation.
 */
export interface InvokeResult {
  content: string;
  usage?: TokenUsage;
}

/**
 * Error codes that are safe to retry (transient failures).
 */
export type RetryableErrorCode = 'RATE_LIMITED' | 'NETWORK_ERROR' | 'TIMEOUT';

/**
 * Error codes that should fail immediately (non-transient).
 */
export type NonRetryableErrorCode =
  | 'AUTHENTICATION_ERROR'
  | 'MODEL_NOT_FOUND'
  | 'CONTEXT_LENGTH_EXCEEDED'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_NOT_SUPPORTED'
  | 'INVALID_RESPONSE';

/**
 * Context passed to retry callbacks.
 */
export interface RetryContext {
  attempt: number;
  maxRetries: number;
  delayMs: number;
  error: ModelErrorCode;
  message: string;
}

/**
 * Configuration options for retry operations.
 */
export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  enableJitter?: boolean;
  onRetry?: (context: RetryContext) => void;
}

/**
 * Callbacks for LLM operations.
 * Follows the callbacks pattern from architecture.md.
 */
export interface LLMCallbacks {
  /** Called when streaming starts */
  onStreamStart?: () => void;
  /** Called for each streamed chunk */
  onStreamChunk?: (chunk: string) => void;
  /** Called when streaming ends */
  onStreamEnd?: (usage?: TokenUsage) => void;
  /** Called on errors */
  onError?: (error: ModelErrorCode, message: string) => void;
  /** Called when an operation is being retried */
  onRetry?: (context: RetryContext) => void;
}

/**
 * Options for LLM client operations.
 */
export interface LLMCallOptions {
  /** Temperature for generation (0-1) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
}

/**
 * Provider factory function type.
 * Creates a LangChain BaseChatModel from provider config.
 */
export type ProviderFactory = (config: Record<string, unknown>) => ModelResponse<BaseChatModel>;

/**
 * Stream result type - async iterable of chunks.
 */
export type StreamResult = AsyncIterable<AIMessageChunk>;
