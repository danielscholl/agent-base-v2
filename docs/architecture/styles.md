# Coding Styles and Conventions

> **Status:** Current
> **Source of truth:** [`CLAUDE.md`](../../CLAUDE.md), ESLint/Prettier configs

This document describes the coding patterns, conventions, and style guidelines for the TypeScript agent framework.

---

## Overview

The framework follows consistent patterns to ensure:

- **Maintainability** through clear structure
- **Type safety** with strict TypeScript
- **Testability** via dependency injection
- **Reliability** through structured responses

---

## TypeScript Conventions

### Strict Mode

All code uses TypeScript strict mode:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

### No `any` Without Justification

```typescript
// Bad
function process(data: any) { ... }

// Good
function process(data: unknown) { ... }

// If any is truly needed, add justification comment
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function legacy(data: any) { /* Required for LangChain compatibility */ }
```

### Type Annotations on Public Functions

```typescript
// Always annotate public functions
export function createClient(config: AppConfig): LLMClient {
  // ...
}

// Private functions can use inference
function helper(x) { return x * 2; }
```

---

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Variables | camelCase | `userConfig` |
| Functions | camelCase | `loadConfig()` |
| Classes | PascalCase | `LLMClient` |
| Interfaces | PascalCase | `AgentCallbacks` |
| Types | PascalCase | `ModelResponse` |
| Constants | SCREAMING_SNAKE | `DEFAULT_MODEL` |
| Files | kebab-case | `message-history.ts` |
| Config keys | camelCase | `apiKey`, `maxTokens` |

---

## File Organization

### Module Structure

```typescript
// 1. External imports
import { z } from 'zod';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

// 2. Internal imports
import { successResponse } from '../base.js';
import type { ModelResponse } from '../types.js';

// 3. Type definitions
interface MyConfig {
  apiKey: string;
}

// 4. Constants
const DEFAULT_MODEL = 'gpt-4o';

// 5. Main exports
export function createClient(config: MyConfig): ModelResponse<BaseChatModel> {
  // ...
}

// 6. Helper functions (private)
function validateConfig(config: MyConfig): boolean {
  // ...
}
```

### Index Files

Each module has an `index.ts` that exports the public API:

```typescript
// src/model/index.ts
export { LLMClient, type LLMClientOptions } from './llm.js';
export type { ModelResponse, ModelErrorCode } from './types.js';
export { createOpenAIClient } from './providers/openai.js';
```

---

## Error Handling Patterns

### Structured Responses

Never throw at public boundaries:

```typescript
// Bad
export function getUser(id: string): User {
  const user = db.find(id);
  if (!user) throw new Error('Not found');
  return user;
}

// Good
export function getUser(id: string): ModelResponse<User> {
  const user = db.find(id);
  if (!user) return errorResponse('NOT_FOUND', `User ${id} not found`);
  return successResponse(user, 'User retrieved');
}
```

### Internal Error Handling

Use try/catch internally, convert at boundaries:

```typescript
export async function readFile(path: string): Promise<Tool.Result<ReadMetadata>> {
  try {
    const content = await fs.readFile(path, 'utf-8');
    return {
      title: `Read ${path}`,
      metadata: { path, bytes: content.length },
      output: content,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Read failed';
    return {
      title: 'Error',
      metadata: { path, error: message },
      output: `Error: ${message}`,
    };
  }
}
```

---

## Dependency Injection

### Constructor Injection

```typescript
// Good: Dependencies via constructor
class Agent {
  constructor(private readonly options: AgentOptions) {}
}

// Bad: Global state
const globalConfig = loadConfig(); // Don't do this
class Agent {
  private config = globalConfig; // Don't do this
}
```

### Factory Functions

```typescript
// Prefer factory functions for complex initialization
export function createAgent(options: AgentOptions): Agent {
  const config = validateConfig(options.config);
  const client = new LLMClient({ config });
  return new Agent({ ...options, client });
}
```

---

## Async/Await Patterns

### Proper Error Handling

```typescript
// Always use try/catch with async/await
async function fetchData(): Promise<ModelResponse<Data>> {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return successResponse(data, 'Fetched successfully');
  } catch (error) {
    return errorResponse('NETWORK_ERROR', 'Failed to fetch');
  }
}
```

### Parallel Operations

```typescript
// Use Promise.all for independent operations
const [user, settings] = await Promise.all([
  getUser(id),
  getSettings(id),
]);

// Use Promise.allSettled when some may fail
const results = await Promise.allSettled(urls.map(fetch));
```

---

## Zod Schema Patterns

### Schema Definition

```typescript
// Define schema with descriptions
const ConfigSchema = z.object({
  apiKey: z.string().describe('API key for authentication'),
  model: z.string().default('gpt-4o').describe('Model to use'),
  maxTokens: z.number().min(1).max(100000).default(4096),
});

// Infer type from schema
type Config = z.infer<typeof ConfigSchema>;
```

### Validation

```typescript
// Parse with error handling
function validateConfig(input: unknown): ModelResponse<Config> {
  const result = ConfigSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return errorResponse('VALIDATION_ERROR', issues);
  }
  return successResponse(result.data, 'Config valid');
}
```

---

## Callback Patterns

### Callback Interfaces

```typescript
// Define callback interface
interface Callbacks {
  onStart?(data: StartData): void;
  onProgress?(data: ProgressData): void;
  onComplete?(data: CompleteData): void;
  onError?(error: Error): void;
}

// Use optional chaining
function process(callbacks?: Callbacks): void {
  callbacks?.onStart?.({ timestamp: Date.now() });
  // ...
  callbacks?.onComplete?.({ result });
}
```

### Async Callbacks

```typescript
// For callbacks that need async handling
interface AsyncCallbacks {
  onPermissionRequest?(req: PermissionRequest): Promise<boolean>;
}

// Await async callbacks
const permitted = await callbacks?.onPermissionRequest?.(request) ?? false;
```

---

## Testing Patterns

### Mock Factory Functions

```typescript
// Create mock factories for test objects
function createMockConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    providers: { default: 'openai', openai: { model: 'gpt-4o' } },
    agent: { maxTokens: 4096, temperature: 0.7 },
    ...overrides,
  };
}
```

### Jest Mocking

```typescript
// Mock modules before import
jest.unstable_mockModule('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn(),
  })),
}));

const { createOpenAIClient } = await import('../providers/openai.js');
```

### Clear Mocks

```typescript
beforeEach(() => {
  jest.clearAllMocks();
});
```

---

## Documentation Patterns

### JSDoc for Public APIs

```typescript
/**
 * Create a new LLM client for the configured provider.
 *
 * @param options - Client configuration options
 * @returns LLMClient instance
 *
 * @example
 * ```typescript
 * const client = new LLMClient({ config });
 * const result = await client.invoke('Hello');
 * ```
 */
export class LLMClient {
  // ...
}
```

### Tool Descriptions

```typescript
// Keep under 40 tokens
description: 'Read file contents from specified path'

// Use Zod describe for parameters
parameters: z.object({
  path: z.string().describe('Absolute path to file'),
  encoding: z.string().default('utf-8').describe('File encoding'),
})
```

---

## Commit Conventions

### Format

```
<type>(<scope>): <description>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `refactor` | Code refactoring |
| `test` | Adding tests |
| `chore` | Maintenance |
| `ci` | CI/CD changes |

### Scopes

`agent`, `tools`, `skills`, `config`, `cli`, `model`, `utils`, `tests`

### Examples

```
feat(agent): add callback system for UI updates
fix(model): handle rate limit errors with retry
test(tools): add unit tests for hello tool
docs(readme): update installation instructions
```

---

## Anti-Patterns to Avoid

### Don't Use

```typescript
// Global mutable state
let globalClient: LLMClient;

// console.log for debugging
console.log('debug:', data);  // Use onDebug callback

// Throwing at boundaries
throw new Error('Failed');  // Return structured response

// Magic strings
if (error.includes('rate limit')) {  // Use error codes
```

### Do Use

```typescript
// Dependency injection
class Agent { constructor(private client: LLMClient) {} }

// Debug callbacks
callbacks.onDebug?.('debug', { data });

// Structured responses
return errorResponse('RATE_LIMITED', 'Rate limit exceeded');

// Error code constants
if (error === 'RATE_LIMITED') { ... }
```

---

## Related Documentation

- [CLAUDE.md](../../CLAUDE.md) - Complete rules and principles
- [Testing Guide](../guides/testing.md) - Test patterns
- [Tool Development](../guides/tools.md) - Tool conventions
