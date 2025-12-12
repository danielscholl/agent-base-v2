# Feature 3: LangChain Tool Wrapper and Response Contract

## Feature Description

This feature introduces `src/tools/base.ts` that standardizes the `{ success, result|error, message }` response shape for all tools in the TypeScript agent framework. It provides type-safe helpers to convert internal tools into LangChain `StructuredTool` instances via Zod schemas.

This is a foundational feature that establishes the contract all built-in tools and skill-provided tools must follow. It replaces the Python `AgentToolset` class with Pydantic annotations, adapting the pattern for TypeScript and LangChain.js integration.

## User Story

As an agent framework developer
I want a standardized tool response contract and helper functions
So that I can create type-safe tools that integrate seamlessly with LangChain.js and provide consistent error handling

## Problem Statement

The agent framework needs:
1. A uniform response format that tools return (not throw) at public boundaries
2. Type-safe error codes for categorizing tool failures
3. Helper functions to create LangChain-compatible tools with minimal boilerplate
4. Discriminated union types for TypeScript type narrowing on success/error paths

Without this foundation:
- Tools may have inconsistent error handling patterns
- LLMs receive unpredictable response formats
- Testing becomes harder due to lack of uniformity
- Integration with LangChain.js tool binding would require repetitive boilerplate

## Solution Statement

Implement a `tools/` module with:
1. **Type definitions** (`types.ts`): `ToolResponse<T>`, `ToolErrorCode`, helper types
2. **Base helpers** (`base.ts`): `successResponse()`, `errorResponse()`, `createTool()` factory
3. **Index exports** (`index.ts`): Clean public API for the module
4. **Comprehensive tests** (`__tests__/base.test.ts`): 85% coverage minimum

The solution follows the existing `ConfigResponse<T>` pattern from `src/config/types.ts` and aligns with the tool patterns documented in `docs/guides/tools.md`.

## Related Documentation

### Requirements
- Feature defined in: `docs/plans/typescript-rewrite-features.md` (Feature 3)
- Phase: 1a (Foundation - Core)

### Architecture Decisions
- ADR-0002: LangChain.js for LLM Integration
- ADR-0004: Zod for Validation
- ADR-0007: Callbacks over EventBus (tools receive callbacks via `RunnableConfig`)

### Reference Documents
- `docs/architecture.md`: Tool Response Contract section (lines 116-133)
- `docs/guides/tools.md`: Complete tool development patterns
- `docs/guides/testing.md`: Testing patterns for tools

## Codebase Analysis Findings

### Architecture Patterns
- **Layer Separation**: Tools Layer sits between Agent Layer and Utils Layer
- **Key Rule**: Only Agent Layer invokes Model Layer; tools MUST NOT call LLMs directly
- **Response Contract**: Tools return `ToolResponse`, never throw at public boundaries
- **Callback Access**: Tools receive callbacks via LangChain's `RunnableConfig` parameter

### Coding Conventions
- **File Organization**: Types in `types.ts`, implementation in `base.ts`, exports in `index.ts`
- **Naming**: `PascalCase` for types/interfaces, `camelCase` for functions, `SCREAMING_SNAKE_CASE` for constants
- **Test Location**: Co-located in `__tests__/` directories
- **Extensions**: Use `.js` in imports for ESM compatibility

### Existing Patterns to Follow
- `src/config/types.ts`: `ConfigResponse<T>` is the template for `ToolResponse<T>`
- `src/config/schema.ts`: Zod schema patterns with `.describe()` for documentation
- `src/config/manager.ts`: Dependency injection via constructor options

### Integration Patterns
- LangChain's `tool()` function from `@langchain/core/tools`
- Zod schemas passed to `schema` option
- `RunnableConfig` provides access to callbacks

## Archon Project

**Project ID**: `85988143-465d-4765-ac99-9f2020a4c727`

## Relevant Files

### Existing Files
- `src/config/types.ts`: Template for response pattern (lines 164-183)
- `src/config/schema.ts`: Zod schema patterns to follow
- `docs/guides/tools.md`: Complete tool development guide
- `docs/guides/testing.md`: Testing patterns
- `package.json`: Dependencies (`@langchain/core: ^0.3.0`, `zod: ^3.24.0`)

### New Files
- `src/tools/types.ts`: Type definitions for ToolResponse, ToolErrorCode
- `src/tools/base.ts`: Helper functions and createTool factory
- `src/tools/index.ts`: Public API exports
- `src/tools/__tests__/base.test.ts`: Unit tests for helpers and factories

## Implementation Plan

### Phase 1: Type Definitions
Create type definitions that establish the tool response contract.

### Phase 2: Helper Functions
Implement helper functions for creating success and error responses.

### Phase 3: Tool Factory
Create the `createTool` factory function that wraps LangChain's `tool()` function.

### Phase 4: Tests and Validation
Write comprehensive tests and validate all quality gates pass.

## Step by Step Tasks

### Task 1: Create types.ts with ToolResponse and ToolErrorCode

**Description**: Define the core type definitions for the tool response contract.

**Files to modify**: Create `src/tools/types.ts`

**Implementation Details**:

```typescript
// src/tools/types.ts

/**
 * Error codes for tool failures.
 * Used for categorizing errors in a type-safe manner.
 */
export type ToolErrorCode =
  | 'VALIDATION_ERROR'   // Invalid input parameters
  | 'IO_ERROR'          // File system or network errors
  | 'CONFIG_ERROR'      // Configuration issues
  | 'PERMISSION_DENIED' // Access denied
  | 'RATE_LIMITED'      // Rate limiting hit
  | 'NOT_FOUND'         // Resource not found
  | 'LLM_ASSIST_REQUIRED' // Tool needs LLM help
  | 'TIMEOUT'           // Operation timed out
  | 'UNKNOWN';          // Unexpected errors

/**
 * Success response from a tool execution.
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  result: T;
  message: string;
}

/**
 * Error response from a tool execution.
 */
export interface ErrorResponse {
  success: false;
  error: ToolErrorCode;
  message: string;
}

/**
 * Discriminated union for tool responses.
 * Tools MUST return this type at public boundaries, never throw.
 */
export type ToolResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

/**
 * Type guard to check if response is successful.
 */
export function isSuccessResponse<T>(
  response: ToolResponse<T>
): response is SuccessResponse<T> {
  return response.success === true;
}

/**
 * Type guard to check if response is an error.
 */
export function isErrorResponse(
  response: ToolResponse<unknown>
): response is ErrorResponse {
  return response.success === false;
}
```

**Archon task**: Will be created during implementation

---

### Task 2: Create base.ts with helper functions

**Description**: Implement helper functions for creating responses and the createTool factory.

**Files to modify**: Create `src/tools/base.ts`

**Implementation Details**:

```typescript
// src/tools/base.ts

import { tool } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import type {
  ToolResponse,
  ToolErrorCode,
  SuccessResponse,
  ErrorResponse,
} from './types.js';

/**
 * Create a success response.
 * @param result - The result data
 * @param message - Human-readable success message
 */
export function successResponse<T>(result: T, message: string): SuccessResponse<T> {
  return { success: true, result, message };
}

/**
 * Create an error response.
 * @param error - The error code
 * @param message - Human-readable error message
 */
export function errorResponse(error: ToolErrorCode, message: string): ErrorResponse {
  return { success: false, error, message };
}

/**
 * Options for creating a tool.
 */
export interface CreateToolOptions<
  TInput extends z.ZodRawShape,
  TResult,
> {
  /** Tool name (used for LangChain binding) */
  name: string;
  /** Tool description (keep under 40 tokens for LLM consumption) */
  description: string;
  /** Zod schema for input validation */
  schema: z.ZodObject<TInput>;
  /** Tool execution function */
  execute: (
    input: z.infer<z.ZodObject<TInput>>,
    config?: RunnableConfig
  ) => Promise<ToolResponse<TResult>>;
}

/**
 * Create a LangChain-compatible tool with the ToolResponse contract.
 *
 * This factory wraps LangChain's tool() function to enforce:
 * - Zod schema validation for inputs
 * - ToolResponse return type
 * - Error catching at boundaries
 *
 * @example
 * ```typescript
 * const helloTool = createTool({
 *   name: 'hello',
 *   description: 'Greet a user by name',
 *   schema: z.object({ name: z.string().describe('Name to greet') }),
 *   execute: async (input) => {
 *     return successResponse(
 *       { greeting: `Hello, ${input.name}!` },
 *       `Greeted ${input.name}`
 *     );
 *   },
 * });
 * ```
 */
export function createTool<
  TInput extends z.ZodRawShape,
  TResult,
>(
  options: CreateToolOptions<TInput, TResult>
): StructuredToolInterface {
  const { name, description, schema, execute } = options;

  return tool(
    async (
      input: z.infer<z.ZodObject<TInput>>,
      config?: RunnableConfig
    ): Promise<ToolResponse<TResult>> => {
      try {
        return await execute(input, config);
      } catch (e) {
        // Catch any uncaught errors and convert to error response
        const message = e instanceof Error ? e.message : 'Unknown error occurred';
        return errorResponse('UNKNOWN', message);
      }
    },
    {
      name,
      description,
      schema,
    }
  );
}

/**
 * Wrap an existing async function to return ToolResponse.
 * Useful for converting existing functions to tool-compatible format.
 *
 * @param fn - Async function to wrap
 * @param errorCode - Error code to use on failure (default: 'UNKNOWN')
 */
export function wrapWithToolResponse<TInput, TResult>(
  fn: (input: TInput) => Promise<TResult>,
  successMessage: (result: TResult) => string,
  errorCode: ToolErrorCode = 'UNKNOWN'
): (input: TInput) => Promise<ToolResponse<TResult>> {
  return async (input: TInput): Promise<ToolResponse<TResult>> => {
    try {
      const result = await fn(input);
      return successResponse(result, successMessage(result));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Operation failed';
      return errorResponse(errorCode, message);
    }
  };
}
```

---

### Task 3: Create index.ts with public exports

**Description**: Create the module's public API with clean exports.

**Files to modify**: Create `src/tools/index.ts`

**Implementation Details**:

```typescript
// src/tools/index.ts

/**
 * Tools module - LangChain tool wrapper and response contract.
 *
 * This module provides:
 * - ToolResponse<T> type for uniform tool responses
 * - Helper functions for creating success/error responses
 * - createTool factory for LangChain-compatible tools
 */

// Type exports
export type {
  ToolErrorCode,
  ToolResponse,
  SuccessResponse,
  ErrorResponse,
} from './types.js';

// Type guards
export { isSuccessResponse, isErrorResponse } from './types.js';

// Helper functions
export {
  successResponse,
  errorResponse,
  createTool,
  wrapWithToolResponse,
} from './base.js';

// Types for tool creation
export type { CreateToolOptions } from './base.js';
```

---

### Task 4: Create unit tests for types and helpers

**Description**: Write comprehensive tests for the types module and base helpers.

**Files to modify**: Create `src/tools/__tests__/base.test.ts`

**Implementation Details**:

```typescript
// src/tools/__tests__/base.test.ts

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { z } from 'zod';
import {
  successResponse,
  errorResponse,
  createTool,
  wrapWithToolResponse,
  isSuccessResponse,
  isErrorResponse,
} from '../index.js';
import type { ToolResponse, ToolErrorCode } from '../index.js';

describe('Tool Response Types', () => {
  describe('successResponse', () => {
    it('creates a success response with result and message', () => {
      const result = { greeting: 'Hello!' };
      const response = successResponse(result, 'Greeting created');

      expect(response).toEqual({
        success: true,
        result: { greeting: 'Hello!' },
        message: 'Greeting created',
      });
    });

    it('preserves generic type in result', () => {
      interface CustomResult {
        count: number;
        items: string[];
      }
      const result: CustomResult = { count: 2, items: ['a', 'b'] };
      const response = successResponse<CustomResult>(result, 'Items found');

      expect(response.result.count).toBe(2);
      expect(response.result.items).toHaveLength(2);
    });
  });

  describe('errorResponse', () => {
    it('creates an error response with code and message', () => {
      const response = errorResponse('IO_ERROR', 'File not found');

      expect(response).toEqual({
        success: false,
        error: 'IO_ERROR',
        message: 'File not found',
      });
    });

    it.each<ToolErrorCode>([
      'VALIDATION_ERROR',
      'IO_ERROR',
      'CONFIG_ERROR',
      'PERMISSION_DENIED',
      'RATE_LIMITED',
      'NOT_FOUND',
      'LLM_ASSIST_REQUIRED',
      'TIMEOUT',
      'UNKNOWN',
    ])('accepts error code: %s', (errorCode) => {
      const response = errorResponse(errorCode, 'Test error');
      expect(response.error).toBe(errorCode);
    });
  });

  describe('type guards', () => {
    describe('isSuccessResponse', () => {
      it('returns true for success responses', () => {
        const response = successResponse({ data: 1 }, 'OK');
        expect(isSuccessResponse(response)).toBe(true);
      });

      it('returns false for error responses', () => {
        const response = errorResponse('IO_ERROR', 'Failed');
        expect(isSuccessResponse(response)).toBe(false);
      });
    });

    describe('isErrorResponse', () => {
      it('returns true for error responses', () => {
        const response = errorResponse('UNKNOWN', 'Error');
        expect(isErrorResponse(response)).toBe(true);
      });

      it('returns false for success responses', () => {
        const response = successResponse('result', 'OK');
        expect(isErrorResponse(response)).toBe(false);
      });
    });
  });
});

describe('createTool', () => {
  const testSchema = z.object({
    name: z.string().describe('Name to process'),
  });

  it('creates a tool that returns success response', async () => {
    const tool = createTool({
      name: 'test_tool',
      description: 'A test tool',
      schema: testSchema,
      execute: async (input) => {
        return successResponse({ processed: input.name }, `Processed ${input.name}`);
      },
    });

    const result = await tool.invoke({ name: 'Alice' });

    expect(result).toEqual({
      success: true,
      result: { processed: 'Alice' },
      message: 'Processed Alice',
    });
  });

  it('creates a tool that returns error response', async () => {
    const tool = createTool({
      name: 'failing_tool',
      description: 'A tool that fails',
      schema: testSchema,
      execute: async () => {
        return errorResponse('NOT_FOUND', 'Resource not found');
      },
    });

    const result = await tool.invoke({ name: 'test' });

    expect(result).toEqual({
      success: false,
      error: 'NOT_FOUND',
      message: 'Resource not found',
    });
  });

  it('catches uncaught exceptions and returns error response', async () => {
    const tool = createTool({
      name: 'throwing_tool',
      description: 'A tool that throws',
      schema: testSchema,
      execute: async () => {
        throw new Error('Unexpected failure');
      },
    });

    const result = await tool.invoke({ name: 'test' });

    expect(result).toEqual({
      success: false,
      error: 'UNKNOWN',
      message: 'Unexpected failure',
    });
  });

  it('handles non-Error throws', async () => {
    const tool = createTool({
      name: 'string_throwing_tool',
      description: 'A tool that throws a string',
      schema: testSchema,
      execute: async () => {
        throw 'String error'; // eslint-disable-line @typescript-eslint/only-throw-error
      },
    });

    const result = await tool.invoke({ name: 'test' });

    expect(result).toEqual({
      success: false,
      error: 'UNKNOWN',
      message: 'Unknown error occurred',
    });
  });

  it('passes config to execute function', async () => {
    const executeFn = jest.fn().mockResolvedValue(
      successResponse({ ok: true }, 'Done')
    );

    const tool = createTool({
      name: 'config_tool',
      description: 'Tool that uses config',
      schema: testSchema,
      execute: executeFn,
    });

    const mockConfig = { callbacks: { onToolStart: jest.fn() } };
    await tool.invoke({ name: 'test' }, mockConfig);

    expect(executeFn).toHaveBeenCalledWith(
      { name: 'test' },
      expect.objectContaining(mockConfig)
    );
  });

  it('has correct name and description', () => {
    const tool = createTool({
      name: 'named_tool',
      description: 'Description under 40 tokens',
      schema: testSchema,
      execute: async () => successResponse({}, 'OK'),
    });

    expect(tool.name).toBe('named_tool');
    expect(tool.description).toBe('Description under 40 tokens');
  });
});

describe('wrapWithToolResponse', () => {
  it('wraps successful function execution', async () => {
    const originalFn = async (input: { value: number }) => input.value * 2;
    const wrapped = wrapWithToolResponse(
      originalFn,
      (result) => `Result: ${result}`
    );

    const result = await wrapped({ value: 5 });

    expect(result).toEqual({
      success: true,
      result: 10,
      message: 'Result: 10',
    });
  });

  it('wraps failed function execution with default error code', async () => {
    const failingFn = async (): Promise<number> => {
      throw new Error('Operation failed');
    };
    const wrapped = wrapWithToolResponse(
      failingFn,
      (result) => `Result: ${result}`
    );

    const result = await wrapped({});

    expect(result).toEqual({
      success: false,
      error: 'UNKNOWN',
      message: 'Operation failed',
    });
  });

  it('uses custom error code on failure', async () => {
    const failingFn = async (): Promise<void> => {
      throw new Error('Access denied');
    };
    const wrapped = wrapWithToolResponse(
      failingFn,
      () => 'Success',
      'PERMISSION_DENIED'
    );

    const result = await wrapped({});

    expect(result).toEqual({
      success: false,
      error: 'PERMISSION_DENIED',
      message: 'Access denied',
    });
  });

  it('handles non-Error throws', async () => {
    const failingFn = async (): Promise<void> => {
      throw null;
    };
    const wrapped = wrapWithToolResponse(failingFn, () => 'Success');

    const result = await wrapped({});

    expect(result).toEqual({
      success: false,
      error: 'UNKNOWN',
      message: 'Operation failed',
    });
  });
});

describe('Type narrowing', () => {
  it('allows type narrowing on success path', () => {
    const response: ToolResponse<{ value: number }> = successResponse(
      { value: 42 },
      'OK'
    );

    if (response.success) {
      // TypeScript should know response.result exists
      expect(response.result.value).toBe(42);
    }
  });

  it('allows type narrowing on error path', () => {
    const response: ToolResponse<{ value: number }> = errorResponse(
      'IO_ERROR',
      'Failed'
    );

    if (!response.success) {
      // TypeScript should know response.error exists
      expect(response.error).toBe('IO_ERROR');
    }
  });
});
```

---

### Task 5: Run validation and fix any issues

**Description**: Run all quality checks and ensure everything passes.

**Commands**:
```bash
# Run all validation commands
bun run typecheck && bun run lint && bun run test && bun run build
```

**Acceptance**:
- TypeScript compiles without errors
- ESLint passes with no warnings
- All tests pass
- Coverage meets 85% threshold
- Build succeeds

---

### Task 6: Update documentation if needed

**Description**: Ensure the implementation aligns with `docs/guides/tools.md` and make any necessary updates.

**Files to review**:
- `docs/guides/tools.md` - Verify examples match implementation
- `docs/architecture.md` - Verify Tool Response Contract section is accurate

## Testing Strategy

### Unit Tests
Tests for `src/tools/__tests__/base.test.ts`:
- `successResponse()` creates correct structure
- `errorResponse()` creates correct structure with all error codes
- Type guards work correctly
- `createTool()` creates functional LangChain tools
- `createTool()` catches uncaught exceptions
- `createTool()` passes config to execute function
- `wrapWithToolResponse()` wraps sync/async functions
- Discriminated union type narrowing works

### Integration Tests
Not required for this feature - unit tests suffice. Integration testing will occur in Feature 8 (Hello tool) which uses these primitives.

### Edge Cases
- Empty result objects
- Large result payloads
- Non-Error throws (strings, null, undefined)
- Async functions that never resolve (timeout scenarios - deferred to later feature)
- Schema validation failures (handled by LangChain/Zod)

## Acceptance Criteria

- [x] `ToolResponse<T>` type defined as discriminated union
- [x] `ToolErrorCode` includes all 9 error codes from architecture.md
- [x] `successResponse()` helper creates correct structure
- [x] `errorResponse()` helper creates correct structure
- [x] `createTool()` factory produces LangChain-compatible tools
- [x] `createTool()` catches uncaught exceptions at boundary
- [x] Type guards `isSuccessResponse()` and `isErrorResponse()` work
- [x] `wrapWithToolResponse()` utility for converting existing functions
- [x] All exports available from `src/tools/index.ts`
- [x] Unit tests achieve 85%+ coverage
- [x] All quality gates pass (typecheck, lint, test, build)

## Validation Commands

```bash
# Run all validation commands before committing
bun run typecheck && bun run lint && bun run test && bun run build

# Run just the tools tests
bun run test src/tools

# Run with coverage
bun run test --coverage src/tools
```

## Notes

### Pattern Consistency
The `ToolResponse<T>` pattern directly mirrors `ConfigResponse<T>` from `src/config/types.ts`. This ensures consistency across the codebase and makes the pattern familiar to developers.

### LangChain Integration
The `createTool()` factory wraps LangChain's `tool()` function from `@langchain/core/tools`. This provides:
- Automatic Zod schema validation
- LangChain tool binding compatibility
- Access to `RunnableConfig` for callbacks

### Error Code Usage
Each error code has a specific purpose:
- `VALIDATION_ERROR`: Invalid input parameters (usually caught by Zod)
- `IO_ERROR`: File system or network errors
- `CONFIG_ERROR`: Configuration issues
- `PERMISSION_DENIED`: Access denied (for permission-aware tools)
- `RATE_LIMITED`: External API rate limiting
- `NOT_FOUND`: Resource not found
- `LLM_ASSIST_REQUIRED`: Tool needs LLM help (Agent Layer interprets this)
- `TIMEOUT`: Operation timed out
- `UNKNOWN`: Unexpected errors (catch-all)

### Future Considerations
- Feature 8 (Hello tool) will be the first consumer of these primitives
- Feature 19 (FileSystem tools) will demonstrate permission-aware patterns
- Skills system (Phase 4) will use `createTool()` for dynamic tool loading

## Execution

This spec can be implemented using: `/sdlc:implement docs/specs/feature-003-langchain-tool-wrapper.md`
