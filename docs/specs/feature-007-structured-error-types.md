# Feature: Structured Error Types and Hierarchy

## Feature Description

Port the Python `../agent-base/src/agent/exceptions.py` error hierarchy to TypeScript, creating a comprehensive error type system in `src/errors/index.ts`. This establishes typed error classes for provider errors (rate limits, auth failures), tool failures, config validation, and user-facing messages. The errors integrate with the existing callback system to surface cleanly to the CLI layer while remaining distinguishable by type for programmatic handling.

## User Story

As a developer using the agent framework
I want structured, typed error responses with provider metadata
So that I can programmatically handle different error conditions and display actionable messages to users

## Problem Statement

The current agent layer returns plain string error messages (e.g., `"Error: ${errorMsg}"`), losing valuable metadata like:
- Which provider failed (OpenAI, Anthropic, etc.)
- HTTP status codes for API errors
- Retry-after hints for rate limits
- Original SDK exceptions for debugging

This makes it impossible for the CLI layer to:
- Display provider-specific guidance (e.g., "Check your OpenAI API key")
- Implement smart retry logic based on error type
- Log structured error data for debugging
- Distinguish between transient and permanent failures

## Solution Statement

Create a unified error response system at `src/errors/index.ts` that:
1. Defines `AgentErrorCode` enum covering all error categories
2. Provides `AgentErrorResponse` type with optional provider metadata
3. Adds `onError` callback to `AgentCallbacks` for structured error events
4. Updates the `Agent` class to emit structured errors instead of strings
5. Maintains consistency with existing `ToolResponse` and `ModelResponse` patterns

## Related Documentation

### Requirements
- Feature 7 in `docs/plans/typescript-rewrite-features.md` (lines 48-49)

### Architecture Decisions
- ADR-0007: Callbacks over EventBus (`docs/decisions/0007-callbacks-over-eventbus.md`)
- Error Handling Architecture in `docs/architecture.md` (lines 272-323)

### Reference Implementation
- Python error hierarchy: `../agent-base/src/agent/exceptions.py`

## Archon Project

- **Project ID**: `ac34a2a0-cc39-4778-be7b-c8668ec67387`
- **Tasks**: 5 implementation tasks created (todo → doing → review → done workflow)

## Codebase Analysis Findings

### Architecture Patterns
- **Discriminated union pattern**: All layers use `{ success: true, result } | { success: false, error }` pattern
- **Error code enums**: `UPPER_SNAKE_CASE` string literal union types (not TypeScript enums)
- **Response helpers**: Each layer has `successResponse()`, `errorResponse()`, and type guards
- **Callback integration**: All lifecycle events emit `SpanContext` for telemetry correlation

### Naming Conventions
- Types: `PascalCase` (e.g., `ToolErrorCode`, `ModelResponse`)
- Functions: `camelCase` (e.g., `successResponse`, `isErrorResponse`)
- Error codes: `UPPER_SNAKE_CASE` (e.g., `AUTHENTICATION_ERROR`, `RATE_LIMITED`)

### Existing Error Patterns

**Tools Layer** (`src/tools/types.ts`):
```typescript
export type ToolErrorCode =
  | 'VALIDATION_ERROR' | 'IO_ERROR' | 'CONFIG_ERROR' | 'PERMISSION_DENIED'
  | 'RATE_LIMITED' | 'NOT_FOUND' | 'LLM_ASSIST_REQUIRED' | 'TIMEOUT' | 'UNKNOWN';

export type ToolResponse<T> = SuccessResponse<T> | ErrorResponse;
```

**Model Layer** (`src/model/types.ts`):
```typescript
export type ModelErrorCode =
  | 'PROVIDER_NOT_CONFIGURED' | 'PROVIDER_NOT_SUPPORTED' | 'AUTHENTICATION_ERROR'
  | 'RATE_LIMITED' | 'MODEL_NOT_FOUND' | 'CONTEXT_LENGTH_EXCEEDED'
  | 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'UNKNOWN';

export type ModelResponse<T> = ModelSuccessResponse<T> | ModelErrorResponse;
```

**Config Layer** (`src/config/types.ts`):
- Uses hybrid approach: `ConfigError` class internally + `ConfigResponse` at boundaries
- Has `ConfigErrorCode` type for classification

### Integration Points
- `src/agent/callbacks.ts`: Add `onError` callback
- `src/agent/agent.ts`: Emit structured errors instead of string returns
- `src/agent/types.ts`: Export error types for consumers

### Testing Approaches
- `src/model/__tests__/base.test.ts`: Pattern for testing error response creation, type guards, error mapping
- Use `it.each` for comprehensive error code coverage
- Mock implementations for simulating error conditions

## Relevant Files

### Existing Files to Reference
- `src/tools/types.ts`: ToolResponse pattern to follow
- `src/model/types.ts`: ModelResponse pattern to follow
- `src/model/base.ts`: `mapErrorToCode()` helper pattern
- `src/agent/callbacks.ts`: Callback interface to extend
- `src/agent/agent.ts`: Agent class to update
- `src/config/types.ts`: ConfigError pattern (for reference)

### New Files to Create
- `src/errors/index.ts`: Main error types and helpers
- `src/errors/__tests__/index.test.ts`: Comprehensive test coverage

### Files to Modify
- `src/agent/callbacks.ts`: Add `onError` callback
- `src/agent/agent.ts`: Use structured errors
- `src/agent/index.ts`: Re-export error types

## Implementation Plan

### Phase 1: Foundation - Error Type Definitions

Create the core error type system following existing patterns:

1. Define `AgentErrorCode` union type covering all error categories
2. Create `AgentErrorResponse` interface with optional metadata
3. Create `AgentSuccessResponse<T>` interface for symmetry
4. Define `AgentResponse<T>` discriminated union
5. Add provider metadata interface for detailed error context
6. Create helper functions: `successResponse`, `errorResponse`
7. Create type guards: `isAgentSuccess`, `isAgentError`

### Phase 2: Core Implementation - Error Mapping and Wrapping

Implement error conversion and enrichment:

1. Create `mapModelErrorToAgentError()` to wrap model errors
2. Create `mapToolErrorToAgentError()` to wrap tool errors
3. Implement error metadata enrichment (provider, model, status code)
4. Add user-friendly message generation

### Phase 3: Integration - Callback and Agent Updates

Connect errors to the callback system:

1. Add `onError` callback to `AgentCallbacks` interface
2. Update `Agent.run()` to return `AgentResponse<string>`
3. Update `Agent.runStream()` to yield errors appropriately
4. Emit `onError` callback when errors occur
5. Update agent index exports

## Step by Step Tasks

### Task 1: Create Error Types Module

- Description: Create `src/errors/index.ts` with all error type definitions
- Files to create: `src/errors/index.ts`
- Details:
  - Define `AgentErrorCode` union type
  - Create success/error response interfaces
  - Add `ProviderErrorMetadata` interface
  - Implement helper functions
  - Implement type guards
  - Export all types and helpers

### Task 2: Add Error Callback to AgentCallbacks

- Description: Extend `AgentCallbacks` interface with `onError` callback
- Files to modify: `src/agent/callbacks.ts`
- Details:
  - Add `onError?: (ctx: SpanContext, error: AgentErrorResponse) => void`
  - Import `AgentErrorResponse` from errors module
  - Add JSDoc documentation

### Task 3: Create Comprehensive Test Suite

- Description: Write tests for error types, helpers, and type guards
- Files to create: `src/errors/__tests__/index.test.ts`
- Details:
  - Test all error code values are accepted
  - Test success/error response creation
  - Test type guards work correctly
  - Test error mapping functions
  - Test metadata preservation

### Task 4: Update Agent Class for Structured Errors

- Description: Modify Agent to use structured error responses
- Files to modify: `src/agent/agent.ts`
- Details:
  - Update return type of `run()` to `Promise<AgentResponse<string>>`
  - Convert error handling to use `errorResponse()`
  - Emit `onError` callback when errors occur
  - Preserve backward compatibility for `onAgentEnd`
  - Map model errors to agent errors with metadata

### Task 5: Update Agent Exports

- Description: Re-export error types from agent module
- Files to modify: `src/agent/index.ts`
- Details:
  - Re-export error types from `../errors/index.js`
  - Ensure all public types are accessible

### Task 6: Remove .gitkeep and Finalize

- Description: Clean up and verify implementation
- Files to modify: `src/errors/.gitkeep` (delete)
- Details:
  - Remove placeholder .gitkeep file
  - Run type checking
  - Run linting
  - Run all tests

## Testing Strategy

### Unit Tests

**Error Response Creation** (`src/errors/__tests__/index.test.ts`):
```typescript
describe('errorResponse', () => {
  it('creates error response with code and message', () => {
    const response = errorResponse('NETWORK_ERROR', 'API call failed');
    expect(response).toEqual({
      success: false,
      error: 'NETWORK_ERROR',
      message: 'API call failed',
    });
  });

  it('includes optional metadata when provided', () => {
    const response = errorResponse('RATE_LIMITED', 'Too many requests', {
      provider: 'openai',
      model: 'gpt-4o',
      statusCode: 429,
      retryAfter: 60,
    });
    expect(response.metadata?.retryAfter).toBe(60);
  });

  it.each<AgentErrorCode>([
    'NETWORK_ERROR',
    'AUTHENTICATION_ERROR',
    'RATE_LIMITED',
    // ... all error codes
  ])('accepts error code: %s', (code) => {
    const response = errorResponse(code, 'Test');
    expect(response.error).toBe(code);
  });
});
```

**Type Guards**:
```typescript
describe('type guards', () => {
  it('isAgentSuccess returns true for success responses', () => {
    const response = successResponse('result', 'OK');
    expect(isAgentSuccess(response)).toBe(true);
  });

  it('isAgentError returns true for error responses', () => {
    const response = errorResponse('UNKNOWN', 'Error');
    expect(isAgentError(response)).toBe(true);
  });
});
```

### Integration Tests

**Agent Error Callback**:
```typescript
it('emits onError callback when provider fails', async () => {
  const onError = jest.fn();
  const agent = new Agent({
    config: { /* invalid config */ },
    callbacks: { onError },
  });

  await agent.run('test query');

  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({ traceId: expect.any(String) }),
    expect.objectContaining({
      success: false,
      error: expect.any(String),
    })
  );
});
```

### Edge Cases
- Empty error messages
- Missing optional metadata
- Chain of wrapped errors (model → agent)
- Concurrent error emissions
- Error during streaming
- Max iterations exceeded error

## Acceptance Criteria

- [x] `AgentErrorCode` covers all error categories from Python `exceptions.py`
- [x] `AgentErrorResponse` includes optional provider metadata
- [x] Helper functions `successResponse()` and `errorResponse()` work correctly
- [x] Type guards `isAgentSuccess()` and `isAgentError()` correctly discriminate
- [x] `onError` callback added to `AgentCallbacks` interface
- [x] Agent emits `onError` callback when errors occur
- [x] Agent.run() returns structured response (or emits via callback)
- [x] All error types exported from `src/agent/index.ts`
- [x] Test coverage >= 85% for error module (achieved 100%)
- [x] All existing tests pass without regression (424/424 tests pass)
- [x] Type checking passes with no errors
- [x] Linting passes with no errors

## Validation Commands

```bash
# Type checking
bun run typecheck

# Linting
bun run lint

# Run all tests
bun run test

# Run error module tests specifically
bun run test src/errors

# Check test coverage
bun run test --coverage
```

## Notes

### Design Decisions

1. **Response pattern vs Exception classes**: Following the established pattern in Tools and Model layers, we use discriminated union responses rather than thrown exceptions at public boundaries. This aligns with ADR-0007 (callbacks over events) and maintains consistency.

2. **Metadata is optional**: Not all errors have provider context (e.g., max iterations exceeded). The `metadata` field is optional to handle this.

3. **Backward compatibility**: The `Agent.run()` method continues to return `Promise<string>` (not `Promise<AgentResponse<string>>`) to avoid breaking existing tests and CLI code. Structured errors are emitted via the `onError` callback. The `onAgentEnd` callback continues to receive the answer/error string for CLI display.

4. **Error emission pattern**: On errors, `emitError()` calls both `onError` (structured) and `onAgentEnd` (string). CLI consumers should use ONE of these paths:
   - Traditional: Use `onAgentEnd` callback OR return value (both contain the same string)
   - Structured: Use `onError` callback for programmatic handling

5. **Error code alignment**: `AgentErrorCode` combines relevant codes from `ModelErrorCode` and `ToolErrorCode` plus agent-specific codes like `MAX_ITERATIONS_EXCEEDED`.

6. **Explicit error mapping**: Mapping functions use explicit `Record<>` mappings rather than type casts, ensuring TypeScript will flag missing mappings if new error codes are added to source types.

7. **Metadata population**: Currently `statusCode` and `retryAfter` metadata fields are defined but not populated, as LangChain errors don't consistently expose HTTP status codes. Future enhancement: Extract these from known SDK error shapes when available.

### Future Considerations

- **Retry integration**: The `retryAfter` metadata could drive automatic retry logic in Phase 3 (Feature 15)
- **Error aggregation**: Multiple tool errors could be aggregated into a single response
- **Telemetry integration**: Error spans could include error metadata as span attributes
- **User-facing messages**: Consider i18n support for error messages in Phase 5

### Python Error Hierarchy Reference

From `../agent-base/src/agent/exceptions.py`:
```
AgentError (base)
├── ProviderAPIError (500, 503, 529)
├── ProviderAuthError (401, 403)
├── ProviderRateLimitError (429)
├── ProviderModelNotFoundError (404)
├── ProviderTimeoutError
└── AgentConfigError
```

Each Python error includes: `provider`, `status_code`, `model`, `original_error`, `message`

## Execution

This spec can be implemented using: `/sdlc:implement docs/specs/feature-007-structured-error-types.md`
