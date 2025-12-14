/**
 * Unit tests for retry logic with exponential backoff.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { isRetryableError, calculateDelay, extractRetryAfter, withRetry } from '../retry.js';
import { successResponse, errorResponse } from '../base.js';
import type { ModelResponse, RetryContext, ModelErrorCode } from '../types.js';
import {
  DEFAULT_MAX_RETRIES,
  DEFAULT_MAX_DELAY_MS,
  DEFAULT_JITTER_FACTOR,
} from '../../config/constants.js';

describe('isRetryableError', () => {
  it.each<ModelErrorCode>(['RATE_LIMITED', 'NETWORK_ERROR', 'TIMEOUT'])(
    'returns true for retryable error: %s',
    (errorCode) => {
      expect(isRetryableError(errorCode)).toBe(true);
    }
  );

  it.each<ModelErrorCode>([
    'AUTHENTICATION_ERROR',
    'MODEL_NOT_FOUND',
    'CONTEXT_LENGTH_EXCEEDED',
    'PROVIDER_NOT_CONFIGURED',
    'PROVIDER_NOT_SUPPORTED',
    'INVALID_RESPONSE',
    'UNKNOWN',
  ])('returns false for non-retryable error: %s', (errorCode) => {
    expect(isRetryableError(errorCode)).toBe(false);
  });
});

describe('calculateDelay', () => {
  describe('exponential backoff', () => {
    it('returns base delay for attempt 0', () => {
      const delay = calculateDelay(0, 1000, 10000, false);
      expect(delay).toBe(1000);
    });

    it('doubles delay for each attempt', () => {
      const delay1 = calculateDelay(1, 1000, 10000, false);
      const delay2 = calculateDelay(2, 1000, 10000, false);
      const delay3 = calculateDelay(3, 1000, 10000, false);

      expect(delay1).toBe(2000); // 1000 * 2^1
      expect(delay2).toBe(4000); // 1000 * 2^2
      expect(delay3).toBe(8000); // 1000 * 2^3
    });

    it('caps delay at maxDelayMs', () => {
      const delay = calculateDelay(10, 1000, 10000, false);
      expect(delay).toBe(10000); // Would be 1000 * 2^10 = 1024000, capped at 10000
    });

    it('uses default values when not provided', () => {
      // Without jitter, should use defaults
      const delay = calculateDelay(0);
      // With jitter enabled by default, delay will vary
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(DEFAULT_MAX_DELAY_MS * (1 + DEFAULT_JITTER_FACTOR));
    });
  });

  describe('jitter', () => {
    it('applies jitter when enabled', () => {
      // Run multiple times to verify randomness
      const delays = Array.from({ length: 100 }, () => calculateDelay(0, 1000, 10000, true));

      // All delays should be within jitter range
      const minExpected = 1000 * (1 - DEFAULT_JITTER_FACTOR);
      const maxExpected = 1000 * (1 + DEFAULT_JITTER_FACTOR);

      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(minExpected);
        expect(delay).toBeLessThanOrEqual(maxExpected);
      }

      // There should be some variation (not all the same)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });

    it('does not apply jitter when disabled', () => {
      const delays = Array.from({ length: 10 }, () => calculateDelay(0, 1000, 10000, false));

      // All delays should be exactly the same
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBe(1);
      expect(delays[0]).toBe(1000);
    });
  });
});

describe('extractRetryAfter', () => {
  it('returns undefined for null', () => {
    expect(extractRetryAfter(null)).toBeUndefined();
  });

  it('returns undefined for non-object', () => {
    expect(extractRetryAfter('error')).toBeUndefined();
    expect(extractRetryAfter(123)).toBeUndefined();
    expect(extractRetryAfter(undefined)).toBeUndefined();
  });

  it('extracts retryAfter as number (seconds -> milliseconds)', () => {
    // retryAfter is in SECONDS per ProviderErrorMetadata, converted to ms
    expect(extractRetryAfter({ retryAfter: 5 })).toBe(5000);
    expect(extractRetryAfter({ retryAfter: 60 })).toBe(60000);
  });

  it('extracts retryAfter as string (seconds)', () => {
    expect(extractRetryAfter({ retryAfter: '5' })).toBe(5000);
    expect(extractRetryAfter({ retryAfter: '60' })).toBe(60000);
  });

  it('returns undefined for zero or negative values', () => {
    expect(extractRetryAfter({ retryAfter: 0 })).toBeUndefined();
    expect(extractRetryAfter({ retryAfter: -1 })).toBeUndefined();
    expect(extractRetryAfter({ retryAfter: '0' })).toBeUndefined();
  });

  it('extracts from response.headers', () => {
    const error = {
      response: {
        headers: {
          'retry-after': '10',
        },
      },
    };
    expect(extractRetryAfter(error)).toBe(10000);
  });

  it('extracts from headers directly', () => {
    const error = {
      headers: {
        'retry-after': 3, // 3 seconds
      },
    };
    expect(extractRetryAfter(error)).toBe(3000); // converted to ms
  });

  it('returns undefined for invalid string', () => {
    expect(extractRetryAfter({ retryAfter: 'invalid' })).toBeUndefined();
  });

  it('extracts retryAfter as HTTP-date format', () => {
    // Create a future date 10 seconds from now
    const futureDate = new Date(Date.now() + 10000);
    const httpDate = futureDate.toUTCString();

    const result = extractRetryAfter({ retryAfter: httpDate });
    expect(result).toBeGreaterThanOrEqual(9000); // Allow some time variance
    expect(result).toBeLessThanOrEqual(10000);
  });

  it('returns undefined for HTTP-date in the past', () => {
    // Date in the past
    const pastDate = new Date(Date.now() - 1000);
    const httpDate = pastDate.toUTCString();

    expect(extractRetryAfter({ retryAfter: httpDate })).toBeUndefined();
  });

  it('handles various HTTP-date formats', () => {
    // Test IMF-fixdate format (preferred HTTP-date format per RFC 7231)
    const futureDate1 = new Date(Date.now() + 5000);
    const imfDate = futureDate1.toUTCString(); // "Wed, 14 Dec 2025 00:53:25 GMT"
    const result1 = extractRetryAfter({ retryAfter: imfDate });
    expect(result1).toBeGreaterThan(0);
    expect(result1).toBeLessThanOrEqual(5100); // Allow 100ms tolerance

    // Test ISO 8601 format (also parseable by Date.parse)
    const futureDate2 = new Date(Date.now() + 5000);
    const isoDate = futureDate2.toISOString(); // "2025-12-14T00:53:25.643Z"
    const result2 = extractRetryAfter({ retryAfter: isoDate });
    expect(result2).toBeGreaterThan(0);
    expect(result2).toBeLessThanOrEqual(5100); // Allow 100ms tolerance
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns success immediately without retrying', async () => {
    const operation = jest
      .fn<() => Promise<ModelResponse<string>>>()
      .mockResolvedValue(successResponse('result', 'OK'));

    const resultPromise = withRetry(operation);
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toBe('result');
    }
    expect(operation).toHaveBeenCalledTimes(1);
  });

  describe('retryable errors', () => {
    it.each<ModelErrorCode>(['RATE_LIMITED', 'NETWORK_ERROR', 'TIMEOUT'])(
      'retries on %s error',
      async (errorCode) => {
        let callCount = 0;
        const operation = jest.fn<() => Promise<ModelResponse<string>>>().mockImplementation(() => {
          callCount++;
          if (callCount < 2) {
            return Promise.resolve(errorResponse(errorCode, 'Temporary error'));
          }
          return Promise.resolve(successResponse('result', 'OK'));
        });

        const resultPromise = withRetry(operation, { maxRetries: 3, enableJitter: false });
        await jest.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.success).toBe(true);
        expect(operation).toHaveBeenCalledTimes(2);
      }
    );
  });

  describe('non-retryable errors', () => {
    it.each<ModelErrorCode>([
      'AUTHENTICATION_ERROR',
      'MODEL_NOT_FOUND',
      'CONTEXT_LENGTH_EXCEEDED',
      'PROVIDER_NOT_CONFIGURED',
      'PROVIDER_NOT_SUPPORTED',
      'INVALID_RESPONSE',
    ])('does not retry on %s error', async (errorCode) => {
      const operation = jest
        .fn<() => Promise<ModelResponse<string>>>()
        .mockResolvedValue(errorResponse(errorCode, 'Non-retryable error'));

      const resultPromise = withRetry(operation, { maxRetries: 3 });
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorCode);
      }
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  it('stops after maxRetries attempts', async () => {
    const operation = jest
      .fn<() => Promise<ModelResponse<string>>>()
      .mockResolvedValue(errorResponse('RATE_LIMITED', 'Rate limited'));

    const resultPromise = withRetry(operation, {
      maxRetries: 2,
      baseDelayMs: 100,
      enableJitter: false,
    });
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('RATE_LIMITED');
    }
    // Initial attempt + 2 retries = 3 total calls
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('succeeds on last retry attempt', async () => {
    let callCount = 0;
    const operation = jest.fn<() => Promise<ModelResponse<string>>>().mockImplementation(() => {
      callCount++;
      if (callCount <= 3) {
        return Promise.resolve(errorResponse('NETWORK_ERROR', 'Network error'));
      }
      return Promise.resolve(successResponse('success', 'OK'));
    });

    const resultPromise = withRetry(operation, {
      maxRetries: 3,
      baseDelayMs: 100,
      enableJitter: false,
    });
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(true);
    // Initial + 3 retries = 4 calls
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it('invokes onRetry callback before each retry', async () => {
    let callCount = 0;
    const operation = jest.fn<() => Promise<ModelResponse<string>>>().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve(errorResponse('TIMEOUT', 'Timeout'));
      }
      return Promise.resolve(successResponse('result', 'OK'));
    });

    const onRetry = jest.fn<(ctx: RetryContext) => void>();

    const resultPromise = withRetry(operation, {
      maxRetries: 5,
      baseDelayMs: 100,
      enableJitter: false,
      onRetry,
    });
    await jest.runAllTimersAsync();
    await resultPromise;

    // Should have called onRetry twice (before retry 1 and retry 2)
    expect(onRetry).toHaveBeenCalledTimes(2);

    // First retry callback
    expect(onRetry).toHaveBeenNthCalledWith(1, {
      attempt: 1,
      maxRetries: 5,
      delayMs: 100, // base delay for attempt 0
      error: 'TIMEOUT',
      message: 'Timeout',
    });

    // Second retry callback
    expect(onRetry).toHaveBeenNthCalledWith(2, {
      attempt: 2,
      maxRetries: 5,
      delayMs: 200, // base delay * 2^1
      error: 'TIMEOUT',
      message: 'Timeout',
    });
  });

  it('uses default options when not provided', async () => {
    const operation = jest
      .fn<() => Promise<ModelResponse<string>>>()
      .mockResolvedValue(errorResponse('RATE_LIMITED', 'Rate limited'));

    const resultPromise = withRetry(operation);
    await jest.runAllTimersAsync();
    await resultPromise;

    // Default maxRetries is 3, so 4 total calls
    expect(operation).toHaveBeenCalledTimes(DEFAULT_MAX_RETRIES + 1);
  });

  it('handles zero maxRetries (no retries)', async () => {
    const operation = jest
      .fn<() => Promise<ModelResponse<string>>>()
      .mockResolvedValue(errorResponse('NETWORK_ERROR', 'Network error'));

    const resultPromise = withRetry(operation, { maxRetries: 0 });
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('does not share state between concurrent calls', async () => {
    let call1Count = 0;
    let call2Count = 0;

    const operation1 = jest.fn<() => Promise<ModelResponse<string>>>().mockImplementation(() => {
      call1Count++;
      if (call1Count < 2) {
        return Promise.resolve(errorResponse('RATE_LIMITED', 'Rate limited'));
      }
      return Promise.resolve(successResponse('result1', 'OK'));
    });

    const operation2 = jest.fn<() => Promise<ModelResponse<string>>>().mockImplementation(() => {
      call2Count++;
      if (call2Count < 3) {
        return Promise.resolve(errorResponse('NETWORK_ERROR', 'Network error'));
      }
      return Promise.resolve(successResponse('result2', 'OK'));
    });

    const promise1 = withRetry(operation1, { maxRetries: 3, enableJitter: false });
    const promise2 = withRetry(operation2, { maxRetries: 3, enableJitter: false });

    await jest.runAllTimersAsync();
    const [result1, result2] = await Promise.all([promise1, promise2]);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(operation1).toHaveBeenCalledTimes(2);
    expect(operation2).toHaveBeenCalledTimes(3);
  });

  it('applies exponential backoff delays', async () => {
    const operation = jest
      .fn<() => Promise<ModelResponse<string>>>()
      .mockResolvedValue(errorResponse('RATE_LIMITED', 'Rate limited'));

    const onRetry = jest.fn<(ctx: RetryContext) => void>();

    const resultPromise = withRetry(operation, {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      enableJitter: false,
      onRetry,
    });

    await jest.runAllTimersAsync();
    await resultPromise;

    // Check delays follow exponential pattern
    expect(onRetry).toHaveBeenCalledTimes(3);
    expect(onRetry.mock.calls[0]?.[0]?.delayMs).toBe(1000); // 1000 * 2^0
    expect(onRetry.mock.calls[1]?.[0]?.delayMs).toBe(2000); // 1000 * 2^1
    expect(onRetry.mock.calls[2]?.[0]?.delayMs).toBe(4000); // 1000 * 2^2
  });

  it('respects maxDelayMs cap', async () => {
    const operation = jest
      .fn<() => Promise<ModelResponse<string>>>()
      .mockResolvedValue(errorResponse('RATE_LIMITED', 'Rate limited'));

    const onRetry = jest.fn<(ctx: RetryContext) => void>();

    const resultPromise = withRetry(operation, {
      maxRetries: 5,
      baseDelayMs: 1000,
      maxDelayMs: 3000, // Cap at 3 seconds
      enableJitter: false,
      onRetry,
    });

    await jest.runAllTimersAsync();
    await resultPromise;

    // All delays should be capped at maxDelayMs
    for (const call of onRetry.mock.calls) {
      expect(call[0].delayMs).toBeLessThanOrEqual(3000);
    }
  });

  it('passes correct error context to onRetry', async () => {
    const operation = jest
      .fn<() => Promise<ModelResponse<string>>>()
      .mockResolvedValueOnce(errorResponse('RATE_LIMITED', 'Rate limit exceeded - try again'))
      .mockResolvedValueOnce(successResponse('result', 'OK'));

    const onRetry = jest.fn<(ctx: RetryContext) => void>();

    const resultPromise = withRetry(operation, {
      maxRetries: 3,
      enableJitter: false,
      onRetry,
    });

    await jest.runAllTimersAsync();
    await resultPromise;

    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'RATE_LIMITED',
        message: 'Rate limit exceeded - try again',
      })
    );
  });

  it('uses retryAfterMs from error response when available', async () => {
    let callCount = 0;
    const operation = jest.fn<() => Promise<ModelResponse<string>>>().mockImplementation(() => {
      callCount++;
      if (callCount < 2) {
        // Return error with retryAfterMs set (e.g., from provider Retry-After header)
        return Promise.resolve({
          success: false as const,
          error: 'RATE_LIMITED' as const,
          message: 'Rate limited',
          retryAfterMs: 5000, // Provider says wait 5 seconds
        });
      }
      return Promise.resolve(successResponse('result', 'OK'));
    });

    const onRetry = jest.fn<(ctx: RetryContext) => void>();

    const resultPromise = withRetry(operation, {
      maxRetries: 3,
      baseDelayMs: 100, // Would normally use 100ms, but should use 5000ms from retryAfterMs
      enableJitter: false,
      onRetry,
    });

    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(onRetry).toHaveBeenCalledTimes(1);
    // Should use the retryAfterMs (5000) instead of calculated delay (100)
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        delayMs: 5000,
      })
    );
  });

  it('falls back to calculated delay when retryAfterMs is not set', async () => {
    let callCount = 0;
    const operation = jest.fn<() => Promise<ModelResponse<string>>>().mockImplementation(() => {
      callCount++;
      if (callCount < 2) {
        // Return error without retryAfterMs
        return Promise.resolve(errorResponse('RATE_LIMITED', 'Rate limited'));
      }
      return Promise.resolve(successResponse('result', 'OK'));
    });

    const onRetry = jest.fn<(ctx: RetryContext) => void>();

    const resultPromise = withRetry(operation, {
      maxRetries: 3,
      baseDelayMs: 100,
      enableJitter: false,
      onRetry,
    });

    await jest.runAllTimersAsync();
    await resultPromise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    // Should use calculated delay (100ms for attempt 0)
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        delayMs: 100,
      })
    );
  });
});
