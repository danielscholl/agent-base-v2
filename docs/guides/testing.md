# Testing Guide

This guide provides detailed patterns and examples for testing in the TypeScript agent framework. For the governing rules, see [CLAUDE.md](../../CLAUDE.md).

---

## Test Runner Configuration

- **Framework**: Jest + ts-jest
- **Command**: `bun run test` (aliased in package.json)
- **DO NOT** use Bun's native `bun test` runner - we use Jest for mocking and coverage

### Why Jest over Bun Test

- Mature mocking ecosystem
- Coverage reporting
- Snapshot testing
- Better IDE integration
- Consistent with existing patterns

---

## Test Organization

Tests are co-located with source files in `__tests__` directories:

```
src/
├── agent/
│   ├── agent.ts
│   └── __tests__/
│       └── agent.test.ts
├── tools/
│   ├── base.ts
│   ├── hello.ts
│   └── __tests__/
│       ├── base.test.ts
│       └── hello.test.ts
├── model/
│   ├── llm.ts
│   └── __tests__/
│       └── llm.test.ts
```

### Special Directories

- **Integration tests**: `tests/integration/` - Cross-module tests
- **Shared fixtures**: `tests/fixtures/` - Mock data and helpers

---

## Mocking LLM Providers

**Critical Rule**: Never make real API calls in tests. Mock all providers.

### Basic Provider Mock

```typescript
import { ChatOpenAI } from '@langchain/openai';

// Mock the module
jest.mock('@langchain/openai');

const MockChatOpenAI = ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>;

describe('Agent', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Set up mock implementation
    MockChatOpenAI.mockImplementation(() => ({
      invoke: jest.fn().mockResolvedValue({
        content: 'Mock response from LLM',
      }),
      bindTools: jest.fn().mockReturnThis(),
      withStructuredOutput: jest.fn().mockReturnThis(),
    }) as unknown as ChatOpenAI);
  });

  it('processes user query through LLM', async () => {
    const agent = new Agent({ model: 'gpt-4o' });
    const result = await agent.run('Hello');

    expect(MockChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o' })
    );
  });
});
```

### Mocking Streaming Responses

```typescript
import { AIMessageChunk } from '@langchain/core/messages';

function createMockStream(chunks: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield new AIMessageChunk({ content: chunk });
      }
    },
  };
}

MockChatOpenAI.mockImplementation(() => ({
  stream: jest.fn().mockResolvedValue(
    createMockStream(['Hello', ' ', 'World', '!'])
  ),
}) as unknown as ChatOpenAI);
```

### Mocking Tool Calls

```typescript
import { AIMessage } from '@langchain/core/messages';

const mockToolCallResponse = new AIMessage({
  content: '',
  tool_calls: [
    {
      id: 'call_123',
      name: 'hello',
      args: { name: 'World' },
    },
  ],
});

MockChatOpenAI.mockImplementation(() => ({
  invoke: jest.fn().mockResolvedValue(mockToolCallResponse),
  bindTools: jest.fn().mockReturnThis(),
}) as unknown as ChatOpenAI);
```

---

## Testing Tools

### Direct Tool Testing

```typescript
import { helloTool } from '../hello.js';

describe('helloTool', () => {
  it('returns success response for valid input', async () => {
    const result = await helloTool.invoke({ name: 'World' });

    expect(result).toEqual({
      success: true,
      result: { greeting: 'Hello, World!' },
      message: 'Greeted World',
    });
  });

  it('handles special characters in name', async () => {
    const result = await helloTool.invoke({ name: 'O\'Brien' });

    expect(result.success).toBe(true);
    expect(result.result.greeting).toContain('O\'Brien');
  });
});
```

### Testing Tool Error Handling

```typescript
import { readFileTool } from '../filesystem.js';
import * as fs from 'fs/promises';

jest.mock('fs/promises');

describe('readFileTool', () => {
  it('returns IO_ERROR when file not found', async () => {
    (fs.readFile as jest.Mock).mockRejectedValue(
      new Error('ENOENT: no such file')
    );

    const result = await readFileTool.invoke({ path: '/nonexistent' });

    expect(result).toEqual({
      success: false,
      error: 'IO_ERROR',
      message: expect.stringContaining('ENOENT'),
    });
  });

  it('returns PERMISSION_DENIED for restricted paths', async () => {
    const result = await readFileTool.invoke(
      { path: '~/.ssh/id_rsa' },
      { callbacks: { onPermissionRequest: () => false } }
    );

    expect(result.error).toBe('PERMISSION_DENIED');
  });
});
```

---

## Testing Callbacks

### Capturing Callback Invocations

```typescript
import { Agent } from '../agent.js';
import type { AgentCallbacks } from '../callbacks.js';

describe('Agent callbacks', () => {
  it('invokes onLLMStart before LLM call', async () => {
    const callbacks: AgentCallbacks = {
      onLLMStart: jest.fn(),
      onLLMEnd: jest.fn(),
    };

    const agent = new Agent({ model: 'gpt-4o', callbacks });
    await agent.run('Hello');

    expect(callbacks.onLLMStart).toHaveBeenCalledWith(
      expect.any(Object), // SpanContext
      'gpt-4o',
      expect.arrayContaining([
        expect.objectContaining({ role: 'user' }),
      ])
    );
  });

  it('invokes onToolStart and onToolEnd for tool calls', async () => {
    const callbacks: AgentCallbacks = {
      onToolStart: jest.fn(),
      onToolEnd: jest.fn(),
    };

    // Mock LLM to return tool call
    MockChatOpenAI.mockImplementation(() => ({
      invoke: jest.fn()
        .mockResolvedValueOnce(mockToolCallResponse)
        .mockResolvedValueOnce({ content: 'Done' }),
      bindTools: jest.fn().mockReturnThis(),
    }) as unknown as ChatOpenAI);

    const agent = new Agent({ model: 'gpt-4o', callbacks });
    await agent.run('Greet me');

    expect(callbacks.onToolStart).toHaveBeenCalledWith(
      expect.any(Object), // SpanContext
      'hello',
      { name: 'World' }
    );
    expect(callbacks.onToolEnd).toHaveBeenCalledWith(
      expect.any(Object), // SpanContext
      'hello',
      expect.objectContaining({ success: true })
    );
  });
});
```

---

## Testing Configuration

### Mocking Config Manager

```typescript
import { ConfigManager } from '../config/manager.js';
import type { AppConfig } from '../config/schema.js';

jest.mock('../config/manager.js');

const mockConfig: Partial<AppConfig> = {
  providers: {
    enabled: ['openai'],
    openai: { model: 'gpt-4o' },
  },
};

(ConfigManager.load as jest.Mock).mockResolvedValue(mockConfig);
```

### Testing with Different Configs

```typescript
describe('Agent with different providers', () => {
  it.each([
    ['openai', 'gpt-4o'],
    ['anthropic', 'claude-3-opus'],
    ['google', 'gemini-pro'],
  ])('initializes %s provider with model %s', async (provider, model) => {
    const config = createTestConfig({ provider, model });
    const agent = new Agent(config);

    expect(agent.modelName).toBe(model);
  });
});
```

---

## Factory Functions

Create factories for test objects with sensible defaults:

```typescript
// tests/fixtures/factories.ts

import type { AppConfig } from '../../src/config/schema.js';
import type { Message } from '../../src/types/messages.js';

export function createTestConfig(
  overrides: Partial<AppConfig> = {}
): AppConfig {
  return {
    providers: {
      enabled: ['openai'],
      openai: { apiKey: 'test-key', model: 'gpt-4o' },
    },
    memory: { enabled: false },
    skills: { enabled: [] },
    ...overrides,
  };
}

export function createTestMessage(
  overrides: Partial<Message> = {}
): Message {
  return {
    role: 'user',
    content: 'Test message',
    ...overrides,
  };
}

export function createTestToolResponse<T>(
  result: T,
  overrides: Partial<SuccessResponse<T>> = {}
): ToolResponse<T> {
  return {
    success: true,
    result,
    message: 'Test success',
    ...overrides,
  };
}
```

---

## Integration Tests

Integration tests live in `tests/integration/` and test cross-module flows:

```typescript
// tests/integration/agent-tool-flow.test.ts

import { Agent } from '../../src/agent/agent.js';
import { helloTool } from '../../src/tools/hello.js';
import { createTestConfig } from '../fixtures/factories.js';

describe('Agent tool execution flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMockProviders();
  });

  it('executes full query → LLM → tool → response cycle', async () => {
    const callbacks = createMockCallbacks();
    const agent = new Agent({
      ...createTestConfig(),
      callbacks,
      tools: [helloTool],
    });

    const result = await agent.run('Say hello to Alice');

    // Verify the full flow
    expect(callbacks.onLLMStart).toHaveBeenCalled();
    expect(callbacks.onToolStart).toHaveBeenCalledWith(
      expect.any(Object), // SpanContext
      'hello',
      { name: 'Alice' }
    );
    expect(callbacks.onToolEnd).toHaveBeenCalled();
    expect(callbacks.onLLMEnd).toHaveBeenCalled();
    expect(result).toContain('Hello');
  });
});
```

---

## Coverage Requirements

- **Minimum**: 85% coverage enforced in CI
- **Focus on**: Business logic, error paths, edge cases
- **Skip**: Generated code, type definitions, simple getters

### Running Coverage

```bash
bun run test --coverage
```

### Coverage Configuration

```javascript
// jest.config.js
module.exports = {
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
};
```

---

## Test Isolation

### Clear Mocks Between Tests

```typescript
beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

afterEach(() => {
  jest.restoreAllMocks();
});
```

### Isolate Filesystem Tests

```typescript
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Filesystem tools', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'agent-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('writes file to test directory', async () => {
    const path = join(testDir, 'test.txt');
    await writeFileTool.invoke({ path, content: 'Hello' });

    const content = await readFile(path, 'utf-8');
    expect(content).toBe('Hello');
  });
});
```

---

## Checklist

Before submitting tests:

- [ ] No real API calls - all providers mocked
- [ ] Mocks cleared in `beforeEach`
- [ ] Factory functions used for test objects
- [ ] Error paths tested, not just happy paths
- [ ] Integration tests for cross-module flows
- [ ] Coverage meets 85% threshold
- [ ] Tests are deterministic (no flaky tests)
