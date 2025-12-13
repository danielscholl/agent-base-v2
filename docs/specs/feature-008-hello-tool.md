# Feature 8: Port the Built-in Hello Tool

## Feature Description

This feature reimplements `../agent-base/src/agent/tools/hello.py` in TypeScript using the new tool base infrastructure from Feature 3. The Hello tool serves as the first concrete tool implementation in the TypeScript agent framework, validating the `createTool()` factory pattern and providing a simple test case for the agent loop.

The Python version provides two functions:
- `hello_world(name: str = "World")`: Simple greeting that always succeeds
- `greet_user(name: str, language: str = "en")`: Multi-language greeting with error handling for unsupported languages

## User Story

As an agent framework developer
I want a reference Hello tool implementation
So that I can validate the tool wrapper pattern, have a simple test case for the agent loop, and reference a working example when building new tools

## Problem Statement

The tool infrastructure (Feature 3) is complete with `createTool()`, `successResponse()`, `errorResponse()`, and the `ToolResponse<T>` contract. However:
1. There are no concrete tools demonstrating the pattern
2. The agent loop (Feature 5) needs a tool for end-to-end testing
3. Developers need a reference implementation to follow when building new tools
4. The migration from Python needs validation of pattern parity

## Solution Statement

Port the Python `HelloTools` class to TypeScript as two standalone tool functions:
1. **`helloWorldTool`**: Demonstrates simple success responses
2. **`greetUserTool`**: Demonstrates error handling for unsupported inputs

Both tools use the `createTool()` factory and follow all established patterns from the codebase analysis.

## Related Documentation

### Requirements
- Feature defined in: `docs/plans/typescript-rewrite-features.md` (Feature 8)
- Phase: 1a (Foundation - Core)
- Dependencies: Feature 3 (LangChain Tool Wrapper) - COMPLETED

### Architecture Decisions
- ADR-0002: LangChain.js for LLM Integration
- ADR-0004: Zod for Validation (use `.describe()` on all parameters)
- ADR-0007: Callbacks over EventBus (tools receive callbacks via `RunnableConfig`)

### Reference Documents
- `docs/architecture.md`: Tool Response Contract section
- `docs/guides/tools.md`: Tool development patterns
- Source Python file: `../agent-base/src/agent/tools/hello.py`

## Codebase Analysis Findings

### Architecture Patterns
- **Tool Factory**: Use `createTool()` from `src/tools/index.js`
- **Response Contract**: Return `ToolResponse<T>` via `successResponse()`/`errorResponse()`
- **Schema Definition**: Define Zod schemas with `.describe()` for all parameters
- **Result Types**: Define explicit interfaces for type-safe results
- **No LLM Calls**: Tools MUST NOT call LLMs directly

### Coding Conventions
- **File Naming**: `hello.ts` for implementation
- **Test Location**: `__tests__/hello.test.ts` co-located with source
- **Imports**: Use `.js` extensions for ESM compatibility
- **Exports**: Add to `src/tools/index.ts` barrel export
- **JSDoc**: Include `@example` showing usage

### Similar Implementations
- No existing concrete tools yet - this is the first
- Test patterns in `src/tools/__tests__/base.test.ts` show how to test tools
- The `createTool()` usage in tests provides examples of the factory pattern

### Integration Patterns
- Tools are invoked via `tool.invoke({ ...params })`
- LangChain handles Zod validation before execute() is called
- Callbacks accessible via `RunnableConfig` second parameter

## Relevant Files

### Existing Files
- `src/tools/base.ts`: `createTool()`, `successResponse()`, `errorResponse()`
- `src/tools/types.ts`: `ToolResponse<T>`, `ToolErrorCode`
- `src/tools/index.ts`: Public API (add new exports here)
- `src/tools/__tests__/base.test.ts`: Test patterns to follow
- `../agent-base/src/agent/tools/hello.py`: Source Python implementation

### New Files
- `src/tools/hello.ts`: Hello tool implementations
- `src/tools/__tests__/hello.test.ts`: Unit tests for Hello tools

## Implementation Plan

### Phase 1: Tool Implementation
Create `src/tools/hello.ts` with both tools following established patterns.

### Phase 2: Unit Tests
Create comprehensive tests in `src/tools/__tests__/hello.test.ts`.

### Phase 3: Export and Integration
Add exports to `src/tools/index.ts` and validate quality gates.

## Step by Step Tasks

### Task 1: Create hello.ts with helloWorldTool

**Description**: Implement the `helloWorldTool` that greets a user by name.

**Files to create**: `src/tools/hello.ts`

**Implementation Details**:

```typescript
/**
 * Hello tools - reference implementation for tool development.
 * Demonstrates the createTool pattern with success and error responses.
 */

import { z } from 'zod';
import { createTool, successResponse } from './index.js';
import type { ToolResponse } from './types.js';

// === Hello World Tool ===

const HelloWorldInputSchema = z.object({
  name: z.string().default('World').describe('Name to greet'),
});

interface HelloWorldResult {
  greeting: string;
}

/**
 * Hello World tool - greets a user by name.
 * Demonstrates basic tool pattern with success responses.
 *
 * @example
 * const result = await helloWorldTool.invoke({ name: 'Alice' });
 * // { success: true, result: { greeting: 'Hello, Alice!' }, message: 'Greeted Alice' }
 */
export const helloWorldTool = createTool<typeof HelloWorldInputSchema.shape, HelloWorldResult>({
  name: 'hello_world',
  description: 'Say hello to someone. Returns greeting message.',
  schema: HelloWorldInputSchema,
  execute: async (input): Promise<ToolResponse<HelloWorldResult>> => {
    const greeting = `Hello, ${input.name}!`;
    return successResponse<HelloWorldResult>(
      { greeting },
      `Greeted ${input.name}`
    );
  },
});
```

**Archon task**: Will be created during implementation

---

### Task 2: Add greetUserTool with error handling

**Description**: Implement the `greetUserTool` that demonstrates error responses for unsupported languages.

**Files to modify**: `src/tools/hello.ts`

**Implementation Details**:

```typescript
// === Greet User Tool ===

const GreetUserInputSchema = z.object({
  name: z.string().describe("User's name"),
  language: z.string().default('en').describe('Language code (en, es, fr)'),
});

interface GreetUserResult {
  greeting: string;
  language: string;
}

const GREETINGS: Record<string, string> = {
  en: 'Hello',
  es: '¡Hola',
  fr: 'Bonjour',
};

const SUPPORTED_LANGUAGES = Object.keys(GREETINGS);

/**
 * Greet User tool - greets in different languages with error handling.
 * Demonstrates error responses for invalid input scenarios.
 *
 * @example
 * // Success case
 * const result = await greetUserTool.invoke({ name: 'Alice', language: 'es' });
 * // { success: true, result: { greeting: '¡Hola, Alice!', language: 'es' }, message: 'Greeted Alice in es' }
 *
 * @example
 * // Error case - unsupported language
 * const result = await greetUserTool.invoke({ name: 'Bob', language: 'de' });
 * // { success: false, error: 'VALIDATION_ERROR', message: "Language 'de' not supported. Use: en, es, fr" }
 */
export const greetUserTool = createTool<typeof GreetUserInputSchema.shape, GreetUserResult>({
  name: 'greet_user',
  description: 'Greet user in different languages (en, es, fr). Returns localized greeting or error if language unsupported.',
  schema: GreetUserInputSchema,
  execute: async (input): Promise<ToolResponse<GreetUserResult>> => {
    const { name, language } = input;

    if (!SUPPORTED_LANGUAGES.includes(language)) {
      return errorResponse(
        'VALIDATION_ERROR',
        `Language '${language}' not supported. Use: ${SUPPORTED_LANGUAGES.join(', ')}`
      );
    }

    const greeting = `${GREETINGS[language]}, ${name}!`;
    return successResponse<GreetUserResult>(
      { greeting, language },
      `Greeted ${name} in ${language}`
    );
  },
});
```

**Note**: Add the `errorResponse` import at the top of the file.

---

### Task 3: Create unit tests for helloWorldTool

**Description**: Write comprehensive tests for the `helloWorldTool`.

**Files to create**: `src/tools/__tests__/hello.test.ts`

**Implementation Details**:

```typescript
/**
 * Tests for Hello tools.
 */

import { describe, it, expect } from '@jest/globals';
import { helloWorldTool, greetUserTool } from '../hello.js';
import { isSuccessResponse, isErrorResponse } from '../index.js';

describe('helloWorldTool', () => {
  it('returns greeting for provided name', async () => {
    const result = await helloWorldTool.invoke({ name: 'Alice' });

    expect(result).toEqual({
      success: true,
      result: { greeting: 'Hello, Alice!' },
      message: 'Greeted Alice',
    });
  });

  it('uses default name when not provided', async () => {
    const result = await helloWorldTool.invoke({});

    expect(result).toEqual({
      success: true,
      result: { greeting: 'Hello, World!' },
      message: 'Greeted World',
    });
  });

  it('handles empty string name', async () => {
    const result = await helloWorldTool.invoke({ name: '' });

    expect(result.success).toBe(true);
    if (isSuccessResponse(result)) {
      expect(result.result.greeting).toBe('Hello, !');
    }
  });

  it('handles special characters in name', async () => {
    const result = await helloWorldTool.invoke({ name: "O'Brien" });

    expect(result.success).toBe(true);
    if (isSuccessResponse(result)) {
      expect(result.result.greeting).toContain("O'Brien");
    }
  });

  it('handles unicode characters in name', async () => {
    const result = await helloWorldTool.invoke({ name: '日本語' });

    expect(result.success).toBe(true);
    if (isSuccessResponse(result)) {
      expect(result.result.greeting).toBe('Hello, 日本語!');
    }
  });

  it('has correct tool metadata', () => {
    expect(helloWorldTool.name).toBe('hello_world');
    expect(helloWorldTool.description).toBe('Say hello to someone. Returns greeting message.');
  });
});
```

---

### Task 4: Add unit tests for greetUserTool

**Description**: Write comprehensive tests for the `greetUserTool` including error scenarios.

**Files to modify**: `src/tools/__tests__/hello.test.ts`

**Implementation Details**:

```typescript
describe('greetUserTool', () => {
  describe('success cases', () => {
    it('greets in English (default)', async () => {
      const result = await greetUserTool.invoke({ name: 'Alice' });

      expect(result).toEqual({
        success: true,
        result: { greeting: 'Hello, Alice!', language: 'en' },
        message: 'Greeted Alice in en',
      });
    });

    it('greets in Spanish', async () => {
      const result = await greetUserTool.invoke({ name: 'Carlos', language: 'es' });

      expect(result).toEqual({
        success: true,
        result: { greeting: '¡Hola, Carlos!', language: 'es' },
        message: 'Greeted Carlos in es',
      });
    });

    it('greets in French', async () => {
      const result = await greetUserTool.invoke({ name: 'Marie', language: 'fr' });

      expect(result).toEqual({
        success: true,
        result: { greeting: 'Bonjour, Marie!', language: 'fr' },
        message: 'Greeted Marie in fr',
      });
    });

    it.each(['en', 'es', 'fr'])('supports language: %s', async (language) => {
      const result = await greetUserTool.invoke({ name: 'Test', language });

      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.result.language).toBe(language);
      }
    });
  });

  describe('error cases', () => {
    it('returns error for unsupported language', async () => {
      const result = await greetUserTool.invoke({ name: 'Hans', language: 'de' });

      expect(result).toEqual({
        success: false,
        error: 'VALIDATION_ERROR',
        message: "Language 'de' not supported. Use: en, es, fr",
      });
    });

    it('returns error for empty language code', async () => {
      const result = await greetUserTool.invoke({ name: 'Test', language: '' });

      expect(result.success).toBe(false);
      if (isErrorResponse(result)) {
        expect(result.error).toBe('VALIDATION_ERROR');
      }
    });

    it('returns error for invalid language code', async () => {
      const result = await greetUserTool.invoke({ name: 'Test', language: 'xyz' });

      expect(result.success).toBe(false);
      if (isErrorResponse(result)) {
        expect(result.error).toBe('VALIDATION_ERROR');
        expect(result.message).toContain('xyz');
        expect(result.message).toContain('en, es, fr');
      }
    });
  });

  describe('edge cases', () => {
    it('handles empty name', async () => {
      const result = await greetUserTool.invoke({ name: '', language: 'en' });

      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.result.greeting).toBe('Hello, !');
      }
    });

    it('handles special characters in name', async () => {
      const result = await greetUserTool.invoke({ name: "José María", language: 'es' });

      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.result.greeting).toContain('José María');
      }
    });
  });

  it('has correct tool metadata', () => {
    expect(greetUserTool.name).toBe('greet_user');
    expect(greetUserTool.description).toBe(
      'Greet user in different languages (en, es, fr). Returns localized greeting or error if language unsupported.'
    );
  });
});
```

---

### Task 5: Update index.ts with exports

**Description**: Add Hello tool exports to the tools module public API.

**Files to modify**: `src/tools/index.ts`

**Implementation Details**:

Add after the existing exports:

```typescript
// Hello tools (reference implementation)
export { helloWorldTool, greetUserTool } from './hello.js';
```

---

### Task 6: Run validation and fix any issues

**Description**: Run all quality checks and ensure everything passes.

**Commands**:
```bash
# Run all validation commands
bun run typecheck && bun run lint && bun run test && bun run build

# Run just the hello tool tests
bun run test src/tools/__tests__/hello.test.ts

# Run all tools tests with coverage
bun run test:coverage src/tools
```

**Acceptance**:
- TypeScript compiles without errors
- ESLint passes with no warnings
- All tests pass (both base.test.ts and hello.test.ts)
- Coverage meets 85% threshold
- Build succeeds

## Testing Strategy

### Unit Tests

Tests for `src/tools/__tests__/hello.test.ts`:

**helloWorldTool**:
- Returns greeting for provided name
- Uses default name ("World") when not provided
- Handles empty string name
- Handles special characters in name
- Handles unicode characters in name
- Has correct tool metadata

**greetUserTool**:
- Greets in English (default)
- Greets in Spanish
- Greets in French
- Returns error for unsupported language
- Returns error for empty language code
- Handles empty name
- Handles special characters in name
- Has correct tool metadata

### Integration Tests
Not required for this feature - integration testing will occur when testing the full agent loop (Feature 5 integration tests).

### Edge Cases
- Empty string names (valid but produces "Hello, !")
- Special characters (`O'Brien`, `José María`)
- Unicode characters (Japanese, emoji)
- Unsupported language codes
- Empty language code
- Case sensitivity of language codes (enforced as lowercase)

## Acceptance Criteria

- [ ] `helloWorldTool` created using `createTool()` factory
- [ ] `helloWorldTool` returns success response with greeting
- [ ] `helloWorldTool` uses default name "World" when not provided
- [ ] `greetUserTool` created using `createTool()` factory
- [ ] `greetUserTool` supports en, es, fr languages
- [ ] `greetUserTool` returns `VALIDATION_ERROR` for unsupported languages
- [ ] Both tools exported from `src/tools/index.ts`
- [ ] Zod schemas use `.describe()` on all parameters
- [ ] Tool descriptions are under 40 tokens
- [ ] JSDoc includes `@example` on both tools
- [ ] Unit tests achieve 85%+ coverage
- [ ] All quality gates pass (typecheck, lint, test, build)

## Validation Commands

```bash
# Run all validation commands before committing
bun run typecheck && bun run lint && bun run test && bun run build

# Run just the hello tool tests
bun run test src/tools/__tests__/hello.test.ts

# Run with coverage
bun run test:coverage src/tools

# Verify exports work
bun -e "import { helloWorldTool, greetUserTool } from './src/tools/index.js'; console.log(helloWorldTool.name, greetUserTool.name)"
```

## Notes

### Pattern Differences from Python

| Python Pattern | TypeScript Pattern |
|---------------|-------------------|
| `AgentToolset` class | Standalone tool functions |
| `self._create_success_response()` | `successResponse()` helper |
| `self._create_error_response()` | `errorResponse()` helper |
| Pydantic `Field(description=...)` | Zod `.describe()` |
| Class with `get_tools()` method | Direct exports from module |
| `async def` methods | `execute: async (input) => ...` |

### Kaomoji in Greetings

The Python implementation includes kaomoji (`◉‿◉`) in greetings. For simplicity and cross-platform compatibility, the TypeScript version omits these. If desired, they can be added later.

### Language Support

Currently supports only three languages (en, es, fr) to match the Python implementation. Additional languages can be added post-MVP by extending the `GREETINGS` record.

### Tool Registration

Unlike Python's `AgentToolset.get_tools()` pattern, TypeScript tools are exported directly. The agent loop will collect tools by importing from `src/tools/index.ts`:

```typescript
import { helloWorldTool, greetUserTool } from './tools/index.js';
const tools = [helloWorldTool, greetUserTool];
```

### Future Considerations
- Feature 19 (FileSystem tools) will follow this same pattern
- Skills system (Phase 4) will dynamically load tools using the same factory
- The `RunnableConfig` parameter enables callback access for future instrumentation

## Execution

This spec can be implemented using: `/sdlc:implement docs/specs/feature-008-hello-tool.md`
