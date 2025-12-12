/**
 * Tests for tool response types and helper functions.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
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

    it('handles empty object result', () => {
      const response = successResponse({}, 'Empty result');
      expect(response.success).toBe(true);
      expect(response.result).toEqual({});
    });

    it('handles null result', () => {
      const response = successResponse(null, 'Null result');
      expect(response.success).toBe(true);
      expect(response.result).toBeNull();
    });

    it('handles primitive result types', () => {
      const stringResponse = successResponse('hello', 'String result');
      expect(stringResponse.result).toBe('hello');

      const numberResponse = successResponse(42, 'Number result');
      expect(numberResponse.result).toBe(42);

      const boolResponse = successResponse(true, 'Boolean result');
      expect(boolResponse.result).toBe(true);
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
      expect(response.success).toBe(false);
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

      it('enables type narrowing for success path', () => {
        const response: ToolResponse<{ value: number }> = successResponse({ value: 42 }, 'OK');

        if (isSuccessResponse(response)) {
          // TypeScript should know response.result exists
          expect(response.result.value).toBe(42);
        }
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

      it('enables type narrowing for error path', () => {
        const response: ToolResponse<{ value: number }> = errorResponse('IO_ERROR', 'Failed');

        if (isErrorResponse(response)) {
          // TypeScript should know response.error exists
          expect(response.error).toBe('IO_ERROR');
        }
      });
    });
  });
});

describe('createTool', () => {
  const testSchema = z.object({
    name: z.string().describe('Name to process'),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a tool that returns success response', async () => {
    const tool = createTool({
      name: 'test_tool',
      description: 'A test tool',
      schema: testSchema,
      execute: (input) => {
        return Promise.resolve(
          successResponse({ processed: input.name }, `Processed ${input.name}`)
        );
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
      execute: () => {
        return Promise.resolve(errorResponse('NOT_FOUND', 'Resource not found'));
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
      execute: () => {
        return Promise.reject(new Error('Unexpected failure'));
      },
    });

    const result = await tool.invoke({ name: 'test' });

    expect(result).toEqual({
      success: false,
      error: 'UNKNOWN',
      message: 'Unexpected failure',
    });
  });

  it('handles non-Error throws with fallback message', async () => {
    const tool = createTool({
      name: 'string_throwing_tool',
      description: 'A tool that throws a non-Error value',
      schema: testSchema,
      execute: () => {
        // Test the non-Error path in the catch block
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject('string error value');
      },
    });

    const result = await tool.invoke({ name: 'test' });

    expect(result).toEqual({
      success: false,
      error: 'UNKNOWN',
      message: 'Unknown error occurred',
    });
  });

  it('catches ZodError thrown in execute and returns VALIDATION_ERROR', async () => {
    const innerSchema = z.object({
      value: z.number().positive(),
    });

    const tool = createTool({
      name: 'zod_throwing_tool',
      description: 'Tool that throws ZodError in execute',
      schema: testSchema,
      execute: () => {
        // Simulate a ZodError thrown during execute (e.g., validating nested data)
        innerSchema.parse({ value: -1 }); // This throws ZodError
        return Promise.resolve(successResponse({}, 'OK'));
      },
    });

    const result = await tool.invoke({ name: 'test' });

    expect(result).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
    });
  });

  it('passes config to execute function', async () => {
    const executeFn =
      jest.fn<
        (
          input: { name: string },
          config?: unknown
        ) => Promise<ReturnType<typeof successResponse<{ ok: boolean }>>>
      >();
    executeFn.mockResolvedValue(successResponse({ ok: true }, 'Done'));

    const tool = createTool({
      name: 'config_tool',
      description: 'Tool that uses config',
      schema: testSchema,
      execute: executeFn,
    });

    // Call without config - the execute function should still be called
    await tool.invoke({ name: 'test' });

    expect(executeFn).toHaveBeenCalledWith({ name: 'test' }, expect.anything());
  });

  it('has correct name and description', () => {
    const tool = createTool({
      name: 'named_tool',
      description: 'Description under 40 tokens',
      schema: testSchema,
      execute: () => Promise.resolve(successResponse({}, 'OK')),
    });

    expect(tool.name).toBe('named_tool');
    expect(tool.description).toBe('Description under 40 tokens');
  });

  it('works with complex schema', async () => {
    const complexSchema = z.object({
      query: z.string().describe('Search query'),
      limit: z.number().min(1).max(100).default(10).describe('Result limit'),
      filters: z
        .object({
          status: z.enum(['active', 'inactive']).optional(),
          tags: z.array(z.string()).optional(),
        })
        .optional()
        .describe('Optional filters'),
    });

    const tool = createTool({
      name: 'complex_tool',
      description: 'Tool with complex schema',
      schema: complexSchema,
      execute: (input) => {
        return Promise.resolve(
          successResponse({ query: input.query, limit: input.limit }, 'Search executed')
        );
      },
    });

    const result = await tool.invoke({
      query: 'test',
      limit: 20,
      filters: { status: 'active' },
    });

    expect(result).toEqual({
      success: true,
      result: { query: 'test', limit: 20 },
      message: 'Search executed',
    });
  });
});

describe('wrapWithToolResponse', () => {
  it('wraps successful async function execution', async () => {
    const originalFn = (input: { value: number }): Promise<number> =>
      Promise.resolve(input.value * 2);
    const wrapped = wrapWithToolResponse(originalFn, (result) => `Result: ${String(result)}`);

    const result = await wrapped({ value: 5 });

    expect(result).toEqual({
      success: true,
      result: 10,
      message: 'Result: 10',
    });
  });

  it('wraps successful sync function execution', async () => {
    // Sync function that returns directly (not a Promise)
    const syncFn = (input: { value: number }): number => input.value * 3;
    const wrapped = wrapWithToolResponse(syncFn, (result) => `Result: ${String(result)}`);

    const result = await wrapped({ value: 7 });

    expect(result).toEqual({
      success: true,
      result: 21,
      message: 'Result: 21',
    });
  });

  it('handles sync function that throws', async () => {
    const throwingSyncFn = (): number => {
      throw new Error('Sync failure');
    };
    const wrapped = wrapWithToolResponse(throwingSyncFn, (r) => `Result: ${String(r)}`);

    const result = await wrapped({});

    expect(result).toEqual({
      success: false,
      error: 'UNKNOWN',
      message: 'Sync failure',
    });
  });

  it('wraps failed function execution with default error code', async () => {
    const failingFn = (): Promise<number> => {
      return Promise.reject(new Error('Operation failed'));
    };
    const wrapped = wrapWithToolResponse(failingFn, (result) => `Result: ${String(result)}`);

    const result = await wrapped({});

    expect(result).toEqual({
      success: false,
      error: 'UNKNOWN',
      message: 'Operation failed',
    });
  });

  it('uses custom error code on failure', async () => {
    const failingFn = (): Promise<void> => {
      return Promise.reject(new Error('Access denied'));
    };
    const wrapped = wrapWithToolResponse(failingFn, () => 'Success', 'PERMISSION_DENIED');

    const result = await wrapped({});

    expect(result).toEqual({
      success: false,
      error: 'PERMISSION_DENIED',
      message: 'Access denied',
    });
  });

  it('handles non-Error rejection', async () => {
    const failingFn = (): Promise<void> => {
      // Simulate a non-Error rejection - eslint requires Error objects
      // but we need to test the catch path for non-Error throws
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      return Promise.reject('string rejection');
    };
    const wrapped = wrapWithToolResponse(failingFn, () => 'Success');

    const result = await wrapped({});

    expect(result).toEqual({
      success: false,
      error: 'UNKNOWN',
      message: 'Operation failed',
    });
  });

  it('preserves async behavior', async () => {
    const asyncFn = (input: { delay: number }): Promise<string> => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve('completed');
        }, input.delay);
      });
    };
    const wrapped = wrapWithToolResponse(asyncFn, (r) => `Status: ${r}`);

    const start = Date.now();
    const result = await wrapped({ delay: 50 });
    const elapsed = Date.now() - start;

    expect(result.success).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some timing variance
  });
});

describe('Type narrowing', () => {
  it('allows type narrowing on success path using discriminant', () => {
    const response: ToolResponse<{ value: number }> = successResponse({ value: 42 }, 'OK');

    // Use type guard for proper type narrowing in tests
    if (isSuccessResponse(response)) {
      expect(response.result.value).toBe(42);
    } else {
      throw new Error('Expected success response');
    }
  });

  it('allows type narrowing on error path using discriminant', () => {
    const response: ToolResponse<{ value: number }> = errorResponse('IO_ERROR', 'Failed');

    // Use type guard for proper type narrowing in tests
    if (isErrorResponse(response)) {
      expect(response.error).toBe('IO_ERROR');
    } else {
      throw new Error('Expected error response');
    }
  });

  it('works with switch statement pattern', () => {
    const processResponse = (response: ToolResponse<number>): string => {
      if (isSuccessResponse(response)) {
        return `Value: ${String(response.result)}`;
      } else {
        return `Error: ${response.error}`;
      }
    };

    expect(processResponse(successResponse(42, 'OK'))).toBe('Value: 42');
    expect(processResponse(errorResponse('NOT_FOUND', 'Missing'))).toBe('Error: NOT_FOUND');
  });
});
