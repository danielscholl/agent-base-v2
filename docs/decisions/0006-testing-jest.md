---
status: accepted
contact: Project Team
date: 2025-01-15
deciders: Project Team
consulted: Claude Code architecture review
---

# Testing: Jest over Bun Test

## Context and Problem Statement

The agent framework needs a testing solution for unit tests, integration tests, and component tests. Bun includes a native test runner (`bun test`), but Jest is the established standard. Which should we use?

## Decision Drivers

- **Mocking capabilities**: Mock LLM providers, file system, network
- **Coverage reporting**: Track and enforce 85% coverage target
- **Snapshot testing**: Useful for CLI output testing
- **IDE integration**: Test discovery and debugging in editors
- **Community**: Documentation, examples, troubleshooting
- **Ink testing**: Component testing with ink-testing-library

## Considered Options

### Option 1: Jest + ts-jest (via Bun)

Run Jest through Bun for TypeScript execution.

**Pros:**
- Industry standard, massive ecosystem
- Excellent mocking with `jest.mock()`, `jest.fn()`, `jest.spyOn()`
- Built-in coverage with configurable thresholds
- Snapshot testing for output validation
- Best IDE integration (VS Code, WebStorm)
- Works with ink-testing-library
- Extensive documentation and examples

**Cons:**
- Additional dependency (Jest + ts-jest)
- Slightly slower than native Bun test
- Configuration needed (jest.config.js)

### Option 2: Bun's Native Test Runner

Use `bun test` directly.

**Pros:**
- Zero additional dependencies
- Faster execution
- Native TypeScript support
- Jest-compatible API (partial)

**Cons:**
- Less mature than Jest
- Limited mocking capabilities
- No built-in coverage thresholds
- Fewer IDE integrations
- Less documentation
- ink-testing-library compatibility uncertain

### Option 3: Vitest

Modern test runner built for Vite.

**Pros:**
- Fast, modern architecture
- Good TypeScript support
- Jest-compatible API
- Built-in coverage

**Cons:**
- Vite-centric (we use Bun)
- Smaller ecosystem than Jest
- Less documentation for non-Vite projects

## Decision Outcome

Chosen option: **"Jest + ts-jest (via Bun)"**, because:

1. **Mocking**: Jest's mocking is essential for testing without real LLM calls
2. **Coverage**: Built-in coverage with enforceable thresholds (85% target)
3. **Ecosystem**: Largest testing ecosystem, most examples
4. **IDE support**: Best integration with VS Code and other editors
5. **ink-testing-library**: Designed to work with Jest
6. **Stability**: Battle-tested, predictable behavior

We run Jest via `bun run test` (npm script) to keep Bun as the runtime while using Jest's test framework.

### Consequences

**Good:**
- Full-featured mocking for LLM provider isolation
- Enforceable coverage thresholds in CI
- Familiar to most TypeScript developers
- Excellent debugging experience
- Snapshot testing for CLI output

**Bad:**
- Additional dependencies in devDependencies
- Slightly slower than native Bun test
- Jest configuration file needed

**Mitigations:**
- Keep Jest config minimal
- Use `--watch` mode during development for faster feedback
- Document test patterns in guides/testing.md

### Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
};
```

### Test Organization

```
src/
├── agent/
│   ├── agent.ts
│   └── __tests__/
│       └── agent.test.ts      # Co-located unit tests
├── model/
│   └── __tests__/
│       └── llm.test.ts
tests/
├── integration/               # Cross-module integration tests
│   └── agent-flow.test.ts
└── fixtures/                  # Shared mock data
    └── llm-responses.ts
```

### Key Testing Patterns

```typescript
// Mock LLM provider - NEVER make real API calls in tests
jest.mock('@langchain/openai');

const MockChatOpenAI = ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>;

beforeEach(() => {
  jest.clearAllMocks();
  MockChatOpenAI.mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({ content: 'Hello!' }),
    bindTools: jest.fn().mockReturnThis(),
  }) as unknown as ChatOpenAI);
});

// Test with mock
it('calls LLM and returns response', async () => {
  const agent = new Agent({ model: 'gpt-4o' });
  const result = await agent.run('Hello');
  expect(result).toContain('Hello');
});
```

### Package.json Scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

Run via: `bun run test`
