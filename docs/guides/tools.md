# Tool Development Guide

This guide provides detailed patterns and examples for implementing tools in the TypeScript agent framework. For the governing rules, see [CLAUDE.md](../../CLAUDE.md).

---

## Tool Response Contract

All tools return a structured `ToolResponse` type. This provides uniform error handling and predictable LLM consumption.

### Type Definitions

```typescript
type ToolErrorCode =
  | 'VALIDATION_ERROR'
  | 'IO_ERROR'
  | 'CONFIG_ERROR'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'LLM_ASSIST_REQUIRED'
  | 'TIMEOUT'
  | 'UNKNOWN';

interface SuccessResponse<T = unknown> {
  success: true;
  result: T;
  message: string;
}

interface ErrorResponse {
  success: false;
  error: ToolErrorCode;
  message: string;
}

type ToolResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;
```

### Usage Notes

- **Public interface**: Tools MUST return `ToolResponse`, never throw
- **Internal implementation**: MAY throw `ToolError`/`AgentError` - catch at boundary
- **Type safety**: Prefer `ToolResponse<SpecificType>` over plain `ToolResponse`
- **LLM assist**: Return `error: 'LLM_ASSIST_REQUIRED'` when tool needs LLM help

---

## Basic Tool Implementation

Tools use the `createTool` factory from `src/tools` which wraps LangChain's `tool` function with automatic error handling and validation.

```typescript
import { z } from 'zod';
import { createTool, successResponse } from '../tools/index.js';

// Define input schema with descriptions
const HelloInputSchema = z.object({
  name: z.string().describe('Name to greet'),
});

// Define result type for type safety
interface HelloResult {
  greeting: string;
}

export const helloTool = createTool({
  name: 'hello',
  description: 'Greet a user by name',  // Keep under 40 tokens
  schema: HelloInputSchema,
  execute: async (input) => {
    return successResponse<HelloResult>(
      { greeting: `Hello, ${input.name}!` },
      `Greeted ${input.name}`
    );
  },
});
```

The `createTool` factory automatically:
- Validates input against the Zod schema (returns `VALIDATION_ERROR` on failure)
- Catches uncaught exceptions at the boundary (returns `UNKNOWN` error)
- Never throws at public boundaries

---

## Error Handling Patterns

### Catching Internal Errors

With `createTool`, uncaught exceptions are automatically converted to error responses. For explicit error handling with specific error codes:

```typescript
import { z } from 'zod';
import { createTool, successResponse, errorResponse } from '../tools/index.js';

const ReadFileInputSchema = z.object({
  path: z.string().describe('File path to read'),
});

interface FileContent {
  content: string;
  path: string;
}

export const readFileTool = createTool({
  name: 'read_file',
  description: 'Read contents of a file',
  schema: ReadFileInputSchema,
  execute: async (input) => {
    try {
      const content = await readFileInternal(input.path);
      return successResponse<FileContent>(
        { content, path: input.path },
        `Read ${input.path}`
      );
    } catch (e) {
      // Return specific error codes for known error types
      const message = e instanceof Error ? e.message : 'Failed to read file';
      if (message.includes('ENOENT')) {
        return errorResponse('NOT_FOUND', `File not found: ${input.path}`);
      }
      if (message.includes('EACCES')) {
        return errorResponse('PERMISSION_DENIED', `Cannot read: ${input.path}`);
      }
      return errorResponse('IO_ERROR', message);
    }
  },
});
```

### Requesting LLM Assistance

When a tool needs LLM help to complete its task:

```typescript
import { z } from 'zod';
import { createTool, successResponse, errorResponse } from '../tools/index.js';

const SummarizeInputSchema = z.object({
  url: z.string().url().describe('URL to fetch and summarize'),
});

const MAX_PROCESSABLE_LENGTH = 10000;

// Security: Allowlist of domains that can be fetched
// In production, configure this via environment or config file
const ALLOWED_DOMAINS = [
  'docs.example.com',
  'api.example.com',
  // Add trusted domains here
];

export const summarizeTool = createTool({
  name: 'summarize',
  description: 'Summarize content from a URL',
  schema: SummarizeInputSchema,
  execute: async (input) => {
    // Security: Validate URL scheme to prevent SSRF attacks
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(input.url);
    } catch {
      return errorResponse('VALIDATION_ERROR', 'Invalid URL format');
    }

    // Security: Only allow HTTPS to prevent credential leakage
    if (parsedUrl.protocol !== 'https:') {
      return errorResponse('VALIDATION_ERROR', 'Only HTTPS URLs are allowed');
    }

    // Security: Check domain allowlist to prevent internal network probing
    if (!ALLOWED_DOMAINS.includes(parsedUrl.hostname)) {
      return errorResponse(
        'PERMISSION_DENIED',
        `Domain ${parsedUrl.hostname} is not in the allowlist`
      );
    }

    let content: string;
    try {
      content = await fetchContent(input.url);
    } catch (e) {
      // Security: Do not expose raw error details that might leak internal info
      return errorResponse('IO_ERROR', 'Failed to fetch content from URL');
    }

    if (content.length > MAX_PROCESSABLE_LENGTH) {
      // Tool cannot handle this alone - request LLM help
      // Security: Pass content via structured field, not in error message
      return errorResponse(
        'LLM_ASSIST_REQUIRED',
        `Content too large (${content.length} chars). Requesting summarization.`
      );
    }

    return successResponse(
      { summary: processContent(content) },
      'Content processed'
    );
  },
});
```

The Agent Layer interprets `LLM_ASSIST_REQUIRED` and takes appropriate action.

---

## Permission-Aware Tools

Tools with side effects must check permissions via callbacks:

```typescript
import { z } from 'zod';
import { createTool, successResponse, errorResponse } from '../tools/index.js';
import type { PermissionScope } from '../types/permissions.js';

const WriteFileInputSchema = z.object({
  path: z.string().describe('File path to write'),
  content: z.string().describe('Content to write'),
});

export const writeFileTool = createTool({
  name: 'write_file',
  description: 'Write content to a file (requires permission)',
  schema: WriteFileInputSchema,
  execute: async (input, config) => {
    const callbacks = config?.callbacks;

    // Request permission via callback
    const permitted = await callbacks?.onPermissionRequest?.({
      scope: 'fs-write' as PermissionScope,
      resource: input.path,
      action: 'write file',
    });

    if (!permitted) {
      return errorResponse('PERMISSION_DENIED', `Write permission denied for ${input.path}`);
    }

    try {
      await writeFile(input.path, input.content);
      return successResponse(
        { path: input.path, bytes: input.content.length },
        `Wrote ${input.content.length} bytes to ${input.path}`
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Write failed';
      return errorResponse('IO_ERROR', message);
    }
  },
});
```

---

## Tool Documentation Standards

### Description Guidelines

- **Simple tools**: 10-20 tokens - what it does in one sentence
- **Complex tools**: 25-40 tokens - purpose, constraints, defaults
- **Include**: what it does, critical constraints, prerequisites
- **Exclude**: code examples, response structures, detailed parameter docs

### Using Zod Descriptions

Parameter documentation goes in Zod `.describe()`:

```typescript
import { z } from 'zod';
import { createTool, successResponse } from '../tools/index.js';

const SearchInputSchema = z.object({
  query: z.string().describe('Search query string'),
  limit: z.number().min(1).max(100).default(10).describe('Max results (1-100)'),
  caseSensitive: z.boolean().default(false).describe('Case-sensitive matching'),
});

export const searchTool = createTool({
  name: 'search',
  description: 'Search codebase for matching content',  // Brief, under 40 tokens
  schema: SearchInputSchema,
  execute: async (input) => {
    const results = await performSearch(input);
    return successResponse(results, `Found ${results.length} matches`);
  },
});
```

---

## Context Storage

Tools producing large outputs should use context storage:

```typescript
import { z } from 'zod';
import { createTool, successResponse } from '../tools/index.js';
import type { ContextManager } from '../utils/context.js';

const SearchCodeInputSchema = z.object({
  query: z.string().describe('Regex pattern to search'),
});

export const searchCodeTool = createTool({
  name: 'search_code',
  description: 'Search codebase with regex pattern',
  schema: SearchCodeInputSchema,
  execute: async (input, config) => {
    const results = await performSearch(input.query);
    const contextManager = config?.configurable?.contextManager as ContextManager;

    // Small results: return directly
    if (JSON.stringify(results).length < 32 * 1024) {
      return successResponse(results, `Found ${results.length} matches`);
    }

    // Large results: persist to context
    const contextId = await contextManager.save({
      tool: 'search_code',
      args: input,
      result: results,
    });

    return successResponse(
      {
        contextId,
        summary: `Found ${results.length} matches`,
        preview: results.slice(0, 5),
      },
      `Results saved to context ${contextId}`
    );
  },
});
```

---

## Testing Tools

See [testing.md](./testing.md) for complete testing patterns. Quick example:

```typescript
import { helloTool } from '../hello.js';

describe('helloTool', () => {
  it('returns greeting for valid name', async () => {
    const result = await helloTool.invoke({ name: 'World' });

    expect(result).toEqual({
      success: true,
      result: { greeting: 'Hello, World!' },
      message: 'Greeted World',
    });
  });

  it('handles empty name gracefully', async () => {
    const result = await helloTool.invoke({ name: '' });

    expect(result.success).toBe(true);
  });
});
```

---

## Checklist

Before submitting a new tool:

- [ ] Uses `createTool()` factory from `src/tools/index.js`
- [ ] Returns `ToolResponse<SpecificType>` via `successResponse()`/`errorResponse()`
- [ ] Uses specific error codes (not just `UNKNOWN`) where appropriate
- [ ] Zod schema with `.describe()` on all parameters
- [ ] Description under 40 tokens
- [ ] Permissions requested for side effects
- [ ] Large outputs use context storage
- [ ] Unit tests with mocked dependencies
- [ ] No direct LLM calls (use `LLM_ASSIST_REQUIRED` if needed)
