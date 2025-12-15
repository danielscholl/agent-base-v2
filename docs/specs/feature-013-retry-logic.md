# Feature 13: Implement Retry Logic with Exponential Backoff

## Feature Description

Add `model/retry.ts` with configurable retry logic for transient failures (rate limits, network errors). Apply consistently across all providers. Include jitter to prevent thundering herd. This feature provides resilient LLM operations that automatically recover from transient failures without user intervention.

## User Story

As a developer using the agent framework
I want LLM calls to automatically retry on transient failures
So that my applications are resilient to temporary network issues and rate limits

## Problem Statement

LLM API calls are susceptible to transient failures:
- **Rate limiting (429)**: All providers impose rate limits that can temporarily block requests
- **Network errors**: Temporary connectivity issues, DNS failures, or connection resets
- **Timeouts**: Slow responses under load conditions

Without retry logic, these transient failures cause immediate errors that require manual intervention or application restart, degrading user experience.

## Solution Statement

Implement a configurable retry wrapper with:
1. **Exponential backoff**: Delay increases exponentially (1s → 2s → 4s → 8s...)
2. **Maximum delay cap**: Prevents excessive waits (default: 10s)
3. **Maximum retry attempts**: Limits total retries (default: 3)
4. **Jitter**: Random variance prevents thundering herd when multiple requests fail simultaneously
5. **Retryable error detection**: Only retries transient errors, fails fast on authentication or validation errors
6. **Callback integration**: Emits retry events for observability and UI feedback

## Related Documentation

### Requirements
- `docs/plans/typescript-rewrite-features.md`: Feature 13 specification (lines 98-100)

### Architecture Decisions
- `docs/architecture.md`: Retry strategy section (lines 306-313)
- Error handling patterns (lines 275-304)

## Archon Project

project_id: 57819263-3258-496c-bd7c-8faad7ff3a69

## Codebase Analysis Findings

### Architecture Patterns
- **Discriminated union responses**: All operations return `ModelResponse<T>` with success/error variants
- **Error codes**: Type-safe `ModelErrorCode` enum for error categorization
- **Factory functions**: `successResponse()` and `errorResponse()` for consistent responses
- **Provider metadata**: `ProviderErrorMetadata` includes `retryAfter` field (already defined but not yet populated)

### Naming Conventions
- camelCase for all variables and functions
- PascalCase for types and interfaces
- Files use kebab-case (e.g., `retry.ts`)
- Constants in SCREAMING_SNAKE_CASE

### Similar Implementations
- `src/model/base.ts`: Error mapping with `mapErrorToCode()` function
- `src/model/llm.ts`: LLMClient with try-catch error handling pattern
- `src/errors/index.ts`: Complete error hierarchy with metadata

### Integration Patterns
- Callbacks injected via constructor options
- Configuration via Zod schemas in `src/config/schema.ts`
- Constants in `src/config/constants.ts`

## Relevant Files

### Existing Files
- `src/model/types.ts`: Add retry-related types (RetryableErrorCode, RetryContext)
- `src/model/base.ts`: Reference for error mapping pattern
- `src/model/llm.ts`: Integration point - wrap invoke/stream calls with retry
- `src/config/schema.ts`: Add RetryConfigSchema
- `src/config/constants.ts`: Add retry default constants
- `src/errors/index.ts`: Reference for ProviderErrorMetadata (retryAfter field)

### New Files
- `src/model/retry.ts`: Main retry logic implementation
- `src/model/__tests__/retry.test.ts`: Comprehensive unit tests

## Implementation Plan

### Phase 1: Foundation
1. Add retry constants to `src/config/constants.ts`
2. Add RetryConfigSchema to `src/config/schema.ts`
3. Add retry types to `src/model/types.ts`

### Phase 2: Core Implementation
1. Implement `src/model/retry.ts` with:
   - `isRetryableError()` function to classify errors
   - `calculateDelay()` function with exponential backoff and jitter
   - `withRetry<T>()` generic wrapper function
   - `extractRetryAfter()` to parse rate limit headers

### Phase 3: Integration
1. Update `LLMClient.invoke()` to use `withRetry()`
2. Update `LLMClient.stream()` to use `withRetry()`
3. Add retry callbacks to `LLMCallbacks` interface

## Step by Step Tasks

### Task 1: Add Retry Constants
- Description: Define default values for retry configuration
- Files to modify: `src/config/constants.ts`
- Implementation:
  ```typescript
  // Retry defaults (from architecture.md)
  export const DEFAULT_RETRY_ENABLED = true;
  export const DEFAULT_MAX_RETRIES = 3;
  export const DEFAULT_BASE_DELAY_MS = 1000;  // 1 second
  export const DEFAULT_MAX_DELAY_MS = 10000;   // 10 seconds
  export const DEFAULT_ENABLE_JITTER = true;
  export const DEFAULT_JITTER_FACTOR = 0.2;    // 20% variance
  ```

### Task 2: Add Retry Config Schema
- Description: Define Zod schema for retry configuration
- Files to modify: `src/config/schema.ts`
- Implementation:
  ```typescript
  export const RetryConfigSchema = z.object({
    enabled: z.boolean().default(DEFAULT_RETRY_ENABLED).describe('Enable retry logic'),
    maxRetries: z.number().int().min(0).max(10).default(DEFAULT_MAX_RETRIES).describe('Maximum retry attempts'),
    baseDelayMs: z.number().int().positive().default(DEFAULT_BASE_DELAY_MS).describe('Base delay in milliseconds'),
    maxDelayMs: z.number().int().positive().default(DEFAULT_MAX_DELAY_MS).describe('Maximum delay in milliseconds'),
    enableJitter: z.boolean().default(DEFAULT_ENABLE_JITTER).describe('Add jitter to prevent thundering herd'),
  });
  ```
- Add `retry` field to `AppConfigSchema`

### Task 3: Add Retry Types
- Description: Define TypeScript types for retry operations
- Files to modify: `src/model/types.ts`
- Implementation:
  ```typescript
  // Error codes that are safe to retry
  export type RetryableErrorCode = 'RATE_LIMITED' | 'NETWORK_ERROR' | 'TIMEOUT';

  // Error codes that should fail immediately
  export type NonRetryableErrorCode =
    | 'AUTHENTICATION_ERROR'
    | 'MODEL_NOT_FOUND'
    | 'CONTEXT_LENGTH_EXCEEDED'
    | 'PROVIDER_NOT_CONFIGURED'
    | 'PROVIDER_NOT_SUPPORTED'
    | 'INVALID_RESPONSE';

  // Context passed to retry callbacks
  export interface RetryContext {
    attempt: number;
    maxRetries: number;
    delayMs: number;
    error: ModelErrorCode;
    message: string;
  }

  // Configuration for retry operations
  export interface RetryOptions {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    enableJitter?: boolean;
    onRetry?: (context: RetryContext) => void;
  }
  ```

### Task 4: Implement Retry Module
- Description: Create the core retry logic with exponential backoff and jitter
- Files to create: `src/model/retry.ts`
- Key functions:
  - `isRetryableError(code: ModelErrorCode): boolean`
  - `calculateDelay(attempt: number, baseDelay: number, maxDelay: number, enableJitter: boolean): number`
  - `withRetry<T>(operation: () => Promise<ModelResponse<T>>, options?: RetryOptions): Promise<ModelResponse<T>>`
  - `extractRetryAfter(error: unknown): number | undefined`

### Task 5: Add Retry Callback to LLMCallbacks
- Description: Add callback for retry events
- Files to modify: `src/model/types.ts`
- Implementation:
  ```typescript
  export interface LLMCallbacks {
    // ... existing callbacks
    /** Called when an operation is being retried */
    onRetry?: (context: RetryContext) => void;
  }
  ```

### Task 6: Integrate Retry with LLMClient
- Description: Wrap LLMClient.invoke() and stream() methods with retry logic
- Files to modify: `src/model/llm.ts`
- Integration pattern:
  ```typescript
  async invoke(input, options) {
    return withRetry(
      async () => {
        // existing invoke logic
      },
      {
        maxRetries: this.config.retry?.maxRetries,
        onRetry: (ctx) => this.callbacks?.onRetry?.(ctx),
      }
    );
  }
  ```

### Task 7: Write Comprehensive Tests
- Description: Create unit tests covering all retry scenarios
- Files to create: `src/model/__tests__/retry.test.ts`
- Test cases:
  - Successful operation (no retry needed)
  - Retry on RATE_LIMITED error
  - Retry on NETWORK_ERROR
  - Retry on TIMEOUT
  - No retry on AUTHENTICATION_ERROR
  - No retry on MODEL_NOT_FOUND
  - Maximum retries exceeded
  - Exponential backoff calculation
  - Jitter variance
  - Callback invocation on each retry
  - Respect retryAfter from rate limit response

### Task 8: Update Exports
- Description: Export retry module from model index
- Files to modify: `src/model/index.ts`
- Add exports for: `withRetry`, `isRetryableError`, `RetryContext`, `RetryOptions`

## Testing Strategy

### Unit Tests
- Test `isRetryableError()` with all error codes
- Test `calculateDelay()` with various attempt numbers
- Test jitter produces values within expected range
- Test `withRetry()` with mocked operations
- Use Jest fake timers to avoid actual delays

### Integration Tests
- Test retry behavior through LLMClient interface
- Verify callbacks are invoked correctly
- Test configuration loading and application

### Edge Cases
- Zero retries configured (retry disabled)
- Very large base delay values
- Operation succeeds on last retry attempt
- Error without retryAfter header vs with retryAfter header
- Concurrent retry operations (no shared state issues)

## Acceptance Criteria

- [x] Retry constants defined in `src/config/constants.ts`
- [x] RetryConfigSchema added to `src/config/schema.ts`
- [x] Retry types defined in `src/model/types.ts`
- [x] `src/model/retry.ts` implements:
  - [x] `isRetryableError()` correctly classifies all error codes
  - [x] `calculateDelay()` uses exponential backoff formula
  - [x] `calculateDelay()` applies jitter within configured bounds
  - [x] `calculateDelay()` caps delay at maxDelayMs
  - [x] `withRetry()` retries only retryable errors
  - [x] `withRetry()` stops after maxRetries
  - [x] `withRetry()` invokes onRetry callback
- [x] LLMClient.invoke() uses withRetry()
- [x] LLMClient.stream() uses withRetry()
- [x] All tests pass with 85%+ coverage (97.36% achieved)
- [x] No type errors (`bun run typecheck`)
- [x] Linting passes (`bun run lint`)

## Validation Commands

```bash
# Type checking
bun run typecheck

# Linting
bun run lint

# Run tests
bun run test

# Run specific test file
bun run test src/model/__tests__/retry.test.ts

# Build verification
bun run build
```

## Notes

### Design Decisions
1. **Generic wrapper pattern**: `withRetry<T>()` wraps any operation returning `ModelResponse<T>`, making it reusable beyond LLM calls
2. **No dependency on external retry libraries**: Simple implementation avoids additional dependencies
3. **Jitter implementation**: Full jitter (random value between 0 and calculated delay) is most effective at preventing thundering herd

### Exponential Backoff Formula
```
delay = min(baseDelay * 2^attempt, maxDelay)
with jitter: delay = delay * (1 + random(-jitterFactor, +jitterFactor))
```

### Rate Limit Header Handling
Some providers return `Retry-After` header. When present, use it instead of calculated delay:
```typescript
const retryAfter = extractRetryAfter(error);
const delay = retryAfter ?? calculateDelay(attempt, baseDelay, maxDelay, enableJitter);
```

### Future Considerations
- Circuit breaker pattern for sustained failures
- Per-provider retry configuration
- Retry statistics for observability dashboard

## Execution

This spec can be implemented using: `/sdlc:implement docs/specs/feature-13-retry-logic.md`
