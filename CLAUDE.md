# CLAUDE.md

This file provides governance and guidance for AI coding assistants building the TypeScript agent framework (v2). This is a full rewrite of `agent-base` (Python) using the Claude Code tech stack.

**Reference Documents:**
- `docs/plans/typescript-rewrite.md` - Architecture plan and phase breakdown
- `docs/plans/typescript-rewrite-features.md` - Ordered feature list (42 MVP features)
- `agent-base/` - Python source (patterns to port)
- `dexter/` - TypeScript reference implementation

---

## Critical Rules

**ALWAYS:**
- Use TypeScript strict mode - no `any` types without explicit justification comment
- Validate all LLM outputs with Zod schemas before use
- Inject dependencies via constructors - no global mutable state
- Return structured responses from tools: `{ success, result|error, message }`
- Use callback patterns for agent-to-UI communication
- Save tool outputs to filesystem, load only when needed for answers
- Add complete type annotations on all public functions and interfaces
- Use async/await with proper error handling and graceful degradation
- Run quality checks before committing: type checking, linting, tests
- Follow conventional commit format: `<type>(<scope>): <description>`
- Write tests alongside features - maintain 85% coverage minimum

**NEVER:**
- Make real LLM API calls in tests (mock all providers)
- Store large tool outputs in memory - use filesystem-backed context
- Import React/Ink in agent classes - maintain strict presentation/logic separation
- Skip Zod validation for LLM structured outputs
- Use `console.log` for debugging - use `onDebug` callback instead
- Create tools that raise exceptions - return error responses
- Log credentials, API keys, or sensitive data
- Write verbose tool docstrings - keep under 40 tokens
- Guess missing parameters - ask for clarification

---

## Core Principles

### 1. DEPENDENCY INJECTION
All components receive dependencies via constructor parameters. This enables testing with mock clients, allows multiple configurations to coexist, and ensures clear dependency chains without initialization order issues.

### 2. CALLBACK-DRIVEN ARCHITECTURE
Agent logic communicates with UI through typed callbacks, not direct state manipulation or imports. This replaces Python's EventBus pattern with better React integration and type safety.

### 3. STRUCTURED TOOL RESPONSES
Tools return dictionaries with `success`, `result`/`error`, and `message` fields rather than raising exceptions. This provides uniform error handling, predictable LLM consumption, and testable validation.

### 4. FILESYSTEM-BACKED CONTEXT
Tool outputs are saved to disk with metadata pointers. At answer time, LLM selects relevant contexts by ID, which are then loaded. This prevents memory bloat with many tool calls.

### 5. PROGRESSIVE SKILL DISCLOSURE
Skills inject documentation only when triggers match user queries. This minimizes context window usage while keeping capabilities available when relevant.

### 6. GRACEFUL DEGRADATION
All LLM calls and external API calls include fallback handling. If summarization fails, use truncated text. If history selection fails, proceed without context. Never let a single failure crash the agent.

---

## Tech Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| Language | TypeScript 5.x | Strict mode required |
| Runtime | Bun 1.x | Fast startup, native TypeScript |
| UI Framework | React 19 + Ink 6 | Terminal UI rendering |
| LLM Integration | LangChain.js | Multi-provider abstraction |
| Schema Validation | Zod 3.x | Runtime validation + type inference |
| Testing | Jest + ts-jest | 85% coverage minimum |
| Linting | ESLint + Prettier | Consistent code style |

---

## Architecture

### Layers
```
CLI Layer (React/Ink)
    ↓ callbacks
Agent Layer (orchestration)
    ↓ tool calls
Tools Layer (LangChain StructuredTool)
    ↓ file I/O
Utils Layer (context, memory, config)
    ↓ LLM calls
Model Layer (provider abstraction)
```

### Key Patterns

| Pattern | Purpose | Location |
|---------|---------|----------|
| Callback Interface | Agent→UI communication | `agent/callbacks.ts` |
| Provider Routing | Multi-model support via prefix | `model/llm.ts` |
| Tool Wrapper | Zod schema + structured response | `tools/base.ts` |
| Context Manager | Filesystem-backed tool outputs | `utils/context.ts` |
| Skill Registry | Progressive disclosure index | `skills/registry.ts` |

---

## Code Patterns

### Callback Interface
```typescript
interface AgentCallbacks {
  onLLMRequest?: (model: string, messages: Message[]) => void;
  onLLMResponse?: (response: string, usage: TokenUsage) => void;
  onToolStart?: (toolName: string, args: Record<string, unknown>) => void;
  onToolComplete?: (toolName: string, result: ToolResult) => void;
  onTaskStart?: (taskId: string) => void;
  onTaskComplete?: (taskId: string, success: boolean) => void;
  onDebug?: (message: string) => void;
}
```

### Tool Response Format
```typescript
// Success response
interface SuccessResponse {
  success: true;
  result: unknown;
  message: string;
}

// Error response
interface ErrorResponse {
  success: false;
  error: string;  // error code
  message: string;  // human-readable description
}

type ToolResponse = SuccessResponse | ErrorResponse;
```

### Tool Definition (LangChain + Zod)
```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const helloTool = tool(
  async (input) => {
    return {
      success: true,
      result: `Hello, ${input.name}!`,
      message: `Greeted ${input.name}`,
    };
  },
  {
    name: 'hello',
    description: 'Greet a user by name',  // Keep under 40 tokens
    schema: z.object({
      name: z.string().describe('Name to greet'),
    }),
  }
);
```

### Provider Routing
```typescript
const MODEL_PROVIDERS: Record<string, ModelFactory> = {
  'gpt-': (name, opts) => new ChatOpenAI({ model: name, ...opts }),
  'claude-': (name, opts) => new ChatAnthropic({ model: name, ...opts }),
  'gemini-': (name, opts) => new ChatGoogleGenerativeAI({ model: name, ...opts }),
};

export function getChatModel(modelName: string, options: ModelOptions): BaseChatModel {
  const prefix = Object.keys(MODEL_PROVIDERS).find(p => modelName.startsWith(p));
  const factory = prefix ? MODEL_PROVIDERS[prefix] : DEFAULT_PROVIDER;
  return factory(modelName, options);
}
```

### Zod Schema for LLM Output
```typescript
const TaskPlanSchema = z.object({
  tasks: z.array(z.object({
    id: z.number().describe('Unique task identifier'),
    description: z.string().describe('What to accomplish'),
    subtasks: z.array(z.string()).describe('Specific steps'),
  })),
});

// Force structured output from LLM
const response = await llm.withStructuredOutput(TaskPlanSchema).invoke(prompt);
```

---

## Testing

### Organization
```
tests/
├── unit/           # Fast, isolated, mocked dependencies
├── integration/    # Component interaction with mock LLM
└── fixtures/       # Shared test data and mock factories
```

### Rules
- Mock all LLM providers - no real API calls in CI
- Use factory functions for test objects with sensible defaults
- Clear mocks in `beforeEach` for test isolation
- Coverage minimum: 85% (enforced in CI)
- Co-locate tests with source in `__tests__` directories

### Markers/Tags
```typescript
describe('Agent', () => {
  describe('[unit]', () => {
    it('should initialize with callbacks', () => { /* ... */ });
  });

  describe('[integration]', () => {
    it('should complete full run loop', () => { /* ... */ });
  });
});
```

### Mock Pattern
```typescript
jest.mock('../../model/llm.js');

const MockChatModel = ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>;

beforeEach(() => {
  jest.clearAllMocks();
  MockChatModel.mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({ content: 'mock response' }),
  }));
});
```

---

## Error Handling

### Error Types
```typescript
// Base error with context
export class AgentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

// Specific error types
export class ProviderError extends AgentError { /* rate limits, auth, etc. */ }
export class ConfigError extends AgentError { /* validation failures */ }
export class ToolError extends AgentError { /* tool execution failures */ }
```

### Rules
- Tools return error responses, never throw exceptions
- External API calls: retry with exponential backoff
- LLM parsing failures: fallback to simple text extraction
- Non-critical operations: log and continue
- User-facing errors: display actionable message and reset cleanly

---

## Configuration

### Priority Order
1. Environment variables (highest) - via `dotenv`
2. Settings file (`~/.agent-ts/settings.json`)
3. Default values in Zod schemas (lowest)

### Schema Pattern
```typescript
const ProviderConfigSchema = z.object({
  enabled: z.array(z.string()).default(['openai']),
  openai: z.object({
    apiKey: z.string().optional(),
    model: z.string().default('gpt-4o'),
  }).optional(),
  // ... other providers
});

type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
```

### Storage Locations
- Config: `~/.agent-ts/settings.json`
- Sessions: `~/.agent-ts/sessions/`
- Context: `~/.agent-ts/context/` (cleaned per query)

---

## Documentation Standards

### Tool Docstrings
- **Simple tools**: 10-20 tokens - what it does in one sentence
- **Complex tools**: 25-40 tokens - purpose, constraints, defaults
- Include: what it does, critical constraints, prerequisites
- Exclude: code examples, response structures, detailed parameter docs
- Use Zod `.describe()` for parameter documentation

### JSDoc
```typescript
/**
 * Core agent orchestrating LLM calls, tool execution, and answer generation.
 *
 * @example
 * const agent = new Agent({ callbacks, model: 'gpt-4o' });
 * const answer = await agent.run('What is the weather?');
 */
export class Agent {
  // ...
}
```

---

## Commits and PRs

### Conventional Commits
Format: `<type>(<scope>): <description>`

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`

**Scopes:** `agent`, `tools`, `skills`, `config`, `cli`, `model`, `utils`, `tests`

### Examples
```
feat(agent): add callback system for UI updates
fix(model): handle rate limit errors with retry
test(tools): add unit tests for hello tool
docs(readme): update installation instructions
```

### Rules
- Lowercase type with colon and space
- Imperative mood ("add" not "added")
- No emojis or special characters
- Max 100 characters in subject line
- Breaking changes: use `!` after type or `BREAKING CHANGE:` in footer

---

## Quality Gates

Before committing, all code must pass:

1. **TypeScript** - `bun run typecheck` (strict mode, no errors)
2. **Linting** - `bun run lint` (ESLint + Prettier)
3. **Tests** - `bun test` (85% coverage minimum)
4. **Build** - `bun run build` (produces working bundle)

CI will block merges that fail any gate.

---

## Project-Specific Context

### This is a Rewrite Project
We are porting `agent-base` (Python/Microsoft Agent Framework) to TypeScript. Key migrations:

| Python | TypeScript |
|--------|------------|
| Microsoft Agent Framework | LangChain.js |
| Pydantic | Zod |
| EventBus singleton | Callback interface |
| pytest | Jest |
| Rich + Typer | React + Ink |
| PEP 723 scripts | Bun subprocess |

### Feature Implementation Order
Follow the phase-ordered features in `docs/plans/typescript-rewrite-features.md`. Each feature should be implementable independently after its dependencies are complete.

### When Porting from Python
1. Read the Python source first to understand behavior
2. Check if dexter has a similar pattern to reference
3. Adapt to TypeScript idioms (callbacks vs events, Zod vs Pydantic)
4. Write tests alongside the implementation
5. Update the feature checklist when complete

---

## Architecture Decision Records

Create an ADR in `docs/decisions/` when:
- Adding new architectural patterns
- Choosing between design alternatives
- Making technology/library selections
- Changing core system behaviors

ADR Format:
```markdown
# ADR-XXXX: Title

## Status
Proposed | Accepted | Deprecated | Superseded

## Context
Why this decision is needed.

## Decision
What we decided.

## Consequences
Trade-offs and implications.
```

---

## References

- `docs/plans/typescript-rewrite.md` - Master plan with phases
- `docs/plans/typescript-rewrite-features.md` - Feature breakdown
- `agent-base/CLAUDE.md` - Python patterns to port
- `agent-base/docs/decisions/` - Existing ADRs for context
- `dexter/` - TypeScript reference implementation
