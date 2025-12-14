/**
 * Retry logic with exponential backoff for LLM operations.
 * Provides resilient handling of transient failures like rate limits and network errors.
 */

import {
  DEFAULT_MAX_RETRIES,
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_DELAY_MS,
  DEFAULT_ENABLE_JITTER,
  DEFAULT_JITTER_FACTOR,
} from '../config/constants.js';
import type { ModelResponse, ModelErrorCode, RetryOptions, RetryContext } from './types.js';

/**
 * Set of error codes that are safe to retry.
 * These represent transient failures that may succeed on retry.
 */
const RETRYABLE_ERROR_CODES: ReadonlySet<ModelErrorCode> = new Set([
  'RATE_LIMITED',
  'NETWORK_ERROR',
  'TIMEOUT',
]);

/**
 * Check if an error code is retryable.
 *
 * @param code - The error code to check
 * @returns true if the error is transient and safe to retry
 */
export function isRetryableError(code: ModelErrorCode): boolean {
  return RETRYABLE_ERROR_CODES.has(code);
}

/**
 * Calculate delay for exponential backoff with optional jitter.
 *
 * Formula: delay = min(baseDelay * 2^attempt, maxDelay)
 * With jitter: delay = delay * (1 + random(-jitterFactor, +jitterFactor))
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @param maxDelayMs - Maximum delay cap in milliseconds
 * @param enableJitter - Whether to add random jitter
 * @returns Calculated delay in milliseconds
 */
export function calculateDelay(
  attempt: number,
  baseDelayMs: number = DEFAULT_BASE_DELAY_MS,
  maxDelayMs: number = DEFAULT_MAX_DELAY_MS,
  enableJitter: boolean = DEFAULT_ENABLE_JITTER
): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);

  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  if (!enableJitter) {
    return cappedDelay;
  }

  // Add jitter: random value between (1 - jitterFactor) and (1 + jitterFactor)
  const jitterMultiplier = 1 + (Math.random() * 2 - 1) * DEFAULT_JITTER_FACTOR;
  // Ensure minimum 1ms delay to avoid busy-looping
  return Math.max(1, Math.floor(cappedDelay * jitterMultiplier));
}

/**
 * Extract retry-after delay from error metadata.
 * Some providers return a Retry-After header indicating when to retry.
 * Per ProviderErrorMetadata, retryAfter is in SECONDS, not milliseconds.
 *
 * @param error - The error object that may contain retry-after info
 * @returns Delay in milliseconds, or undefined if not present
 */
export function extractRetryAfter(error: unknown): number | undefined {
  if (error === null || typeof error !== 'object') {
    return undefined;
  }

  const errorObj = error as Record<string, unknown>;

  // Check for retryAfter in various locations
  // LangChain errors may have it in different places
  const responseHeaders = (errorObj.response as Record<string, unknown> | undefined)?.headers as
    | Record<string, unknown>
    | undefined;
  const directHeaders = errorObj.headers as Record<string, unknown> | undefined;

  const retryAfter =
    errorObj.retryAfter ?? responseHeaders?.['retry-after'] ?? directHeaders?.['retry-after'];

  if (typeof retryAfter === 'number') {
    // retryAfter is in SECONDS (per ProviderErrorMetadata), convert to ms
    return retryAfter > 0 ? retryAfter * 1000 : undefined;
  }

  if (typeof retryAfter === 'string') {
    // Could be seconds (number string) or HTTP date
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds) && seconds > 0) {
      return seconds * 1000; // Convert to milliseconds
    }
  }

  return undefined;
}

/**
 * Sleep for a specified duration.
 *
 * @param ms - Duration in milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap an async operation with retry logic.
 *
 * Only retries on transient errors (rate limits, network errors, timeouts).
 * Non-retryable errors (authentication, model not found, etc.) fail immediately.
 *
 * @param operation - The async operation to execute
 * @param options - Retry configuration options
 * @returns The operation result or final error after retries exhausted
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => client.invoke('Hello'),
 *   {
 *     maxRetries: 3,
 *     onRetry: (ctx) => console.log(`Retry ${ctx.attempt}/${ctx.maxRetries}`)
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<ModelResponse<T>>,
  options: RetryOptions = {}
): Promise<ModelResponse<T>> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    enableJitter = DEFAULT_ENABLE_JITTER,
    onRetry,
  } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await operation();

    // Success - return immediately
    if (result.success) {
      return result;
    }

    // Check if error is retryable
    if (!isRetryableError(result.error)) {
      // Non-retryable error - fail immediately
      return result;
    }

    // Check if we've exhausted retries
    if (attempt >= maxRetries) {
      return result;
    }

    // Calculate delay for next attempt
    const delayMs = calculateDelay(attempt, baseDelayMs, maxDelayMs, enableJitter);

    // Invoke callback before retrying
    const context: RetryContext = {
      attempt: attempt + 1,
      maxRetries,
      delayMs,
      error: result.error,
      message: result.message,
    };
    onRetry?.(context);

    // Wait before retrying
    await sleep(delayMs);
  }

  // This is unreachable - the loop always returns
  // But we need a return for TypeScript, use a fallback error response
  return {
    success: false,
    error: 'UNKNOWN',
    message: 'Retry logic reached unreachable state',
  } as ModelResponse<T>;
}
