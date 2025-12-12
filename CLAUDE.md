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
- Add complete type annotations on all public functions and interfaces
- Use async/await with proper error handling and graceful degradation
- Run quality checks before committing: type checking, linting, tests
- Follow conventional commit format: `<type>(<scope>): <description>`
- Write tests alongside features - maintain 85% coverage minimum

**NEVER:**
- Make real LLM API calls in tests (mock all providers)
- Import React/Ink in agent classes - maintain strict presentation/logic separation
- Skip Zod validation for LLM structured outputs
- Use `console.log` for debugging - use `onDebug` callback instead
- Log credentials, API keys, or sensitive data
- Write verbose tool docstrings - keep under 40 tokens
- Guess missing parameters - ask for clarification
- Have tools call LLMs directly - only the Agent Layer invokes the Model Layer

---

## Core Principles

### 0. CONTROLLED COMPLEXITY
This is a general-purpose agent framework, not a minimal LLM shell:
- The Agent Layer orchestrates multi-provider access, skills, and memory
- We accept more structure than a minimal shell requires
- Delete scaffolding when LLM improvements make it unnecessary
- Each layer must justify its existence with clear value

### 1. DEPENDENCY INJECTION
All components receive dependencies via constructor parameters. This enables testing with mock clients, allows multiple configurations to coexist, and ensures clear dependency chains without initialization order issues.

### 2. CALLBACK-DRIVEN ARCHITECTURE
Agent logic communicates with UI through typed callbacks, not direct state manipulation or imports. This replaces Python's EventBus pattern with better React integration and type safety.

### 3. STRUCTURED TOOL RESPONSES
Tools return dictionaries with `success`, `result`/`error`, and `message` fields rather than raising exceptions. This provides uniform error handling, predictable LLM consumption, and testable validation.

### 4. CONTEXT STORAGE
- **Small outputs** (< 32KB): Keep in memory for the current session
- **Large outputs** (> 32KB, multi-file results, search results): Persist to `context/`
- **All contexts**: Garbage-collected on session end
- Never keep unbounded lists of tool outputs in memory

### 5. PROGRESSIVE SKILL DISCLOSURE
Skills inject documentation only when triggers match user queries. This minimizes context window usage while keeping capabilities available when relevant.

### 6. GRACEFUL DEGRADATION
All LLM calls and external API calls include fallback handling. If summarization fails, use truncated text. If history selection fails, proceed without context. Never let a single failure crash the agent.

---

## Tech Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| Language | TypeScript 5.x | Strict mode required |
| Runtime | Bun 1.x | Development and runtime |
| UI Framework | React 19 + Ink 6 | Terminal UI rendering |
| LLM Integration | LangChain.js 1.x | Multi-provider abstraction |
| Schema Validation | Zod 4.x | Runtime validation + type inference |
| Testing | Jest + ts-jest | Run via `bun run test` |
| Linting | ESLint + Prettier | Consistent code style |

### Runtime Notes
- **Development**: Bun 1.x for fast TS execution and bundling
- **Runtime**: Bun 1.x (users must have Bun installed)
- We chose Bun-only runtime for native TypeScript execution without transpilation

---

## Architecture

### Layers
```
CLI Layer (React/Ink)
    ↓ callbacks
Agent Layer (orchestration) ←──── LLM calls ────→ Model Layer (provider abstraction)
    ↓ tool calls
Tools Layer (LangChain StructuredTool)
    ↓ file I/O
Utils Layer (context, memory, config)
```

Note: Only the Agent Layer invokes the Model Layer. Tools and Utils never call LLMs directly.

### LLM Access Rules
- Only the Agent Layer may invoke the Model Layer
- Tools must NOT call LLMs directly
- If a tool needs LLM assistance, return a request for the Agent to handle

### Key Patterns

| Pattern | Purpose | Location |
|---------|---------|----------|
| Callback Interface | Agent→UI communication | `agent/callbacks.ts` |
| Provider Routing | Multi-model support via prefix | `model/llm.ts` |
| Tool Wrapper | Zod schema + structured response | `tools/base.ts` |
| Context Manager | Size-aware tool output storage | `utils/context.ts` |
| Skill Registry | Progressive disclosure index | `skills/registry.ts` |

---

## Permissions System

### Principle
The agent must never modify user state without explicit permission.

### Permission Scopes
- `fs-read`: Read files in working directory
- `fs-write`: Create/modify files
- `fs-delete`: Delete files
- `shell-run`: Execute shell commands

### Configuration Hierarchy
1. `./.agent-ts/settings.json` (project - can be committed)
2. `~/.agent-ts/settings.json` (user - never committed)
3. Interactive prompt (one-time or remember)

### Tool Requirements
Tools with side effects must:
- Declare required capabilities in metadata
- Check permissions before execution
- Support dry-run mode where applicable

### Permission Flow
1. Tool requests permission via callback (`onPermissionRequest`)
2. Agent checks settings hierarchy for existing rule
3. If no rule: prompt user ("once" / "always for project" / "never")
4. Log all permission decisions to session file

---

## Code Patterns

### Callback Interface
Agent-to-UI communication uses typed callbacks. The specific callbacks evolve with implementation, but follow this pattern:

```typescript
// Core callback pattern - extend as features require
interface AgentCallbacks {
  // LLM lifecycle
  onLLMRequest?(model: string, messages: Message[]): void;
  onLLMResponse?(response: string, usage: TokenUsage): void;

  // Tool lifecycle
  onToolStart?(toolName: string, args: Record<string, unknown>): void;
  onToolComplete?(toolName: string, result: ToolResponse): void;

  // Debugging
  onDebug?(message: string): void;
}
```

Additional callbacks (streaming, permissions, task lifecycle) are added as features require them.

### Tool Response Format
```typescript
type ToolErrorCode =
  | 'VALIDATION_ERROR'
  | 'IO_ERROR'
  | 'CONFIG_ERROR'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'UNKNOWN';

interface SuccessResponse {
  success: true;
  result: unknown;
  message: string;
}

interface ErrorResponse {
  success: false;
  error: ToolErrorCode;
  message: string;
}

type ToolResponse = SuccessResponse | ErrorResponse;
```

### Tool Error Handling
- **Public interface**: Tools MUST return `ToolResponse`, never throw
- **Internal implementation**: MAY throw `ToolError`/`AgentError` - catch at boundary
- **Agent/Model layers**: MAY throw `AgentError` subclasses - CLI handles them

### Tool Definition (LangChain + Zod)
```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const HelloInputSchema = z.object({
  name: z.string().describe('Name to greet'),
});

export const helloTool = tool(
  async (input): Promise<ToolResponse> => {
    try {
      return {
        success: true,
        result: { greeting: `Hello, ${input.name}!` },
        message: `Greeted ${input.name}`,
      };
    } catch (e) {
      return {
        success: false,
        error: 'UNKNOWN',
        message: e instanceof Error ? e.message : 'Unknown error',
      };
    }
  },
  {
    name: 'hello',
    description: 'Greet a user by name',  // Keep under 40 tokens
    schema: HelloInputSchema,
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

### Test Runner
- **Framework**: Jest + ts-jest
- **Command**: `bun run test` (aliased in package.json to run Jest)
- **DO NOT** use Bun's native `bun test` runner - we use Jest for mocking and coverage

### Test Organization
Tests are co-located with source files in `__tests__` directories:
```
src/
├── agent/
│   ├── agent.ts
│   └── __tests__/
│       └── agent.test.ts
├── tools/
│   ├── hello.ts
│   └── __tests__/
│       └── hello.test.ts
```
- **Integration tests** spanning multiple modules: `tests/integration/`
- **Shared fixtures**: `tests/fixtures/`

### Rules
- Mock all LLM providers - no real API calls in CI
- Use factory functions for test objects with sensible defaults
- Clear mocks in `beforeEach` for test isolation
- Coverage minimum: 85% (enforced in CI)

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
export class PermissionError extends AgentError { /* permission denied */ }
```

### Rules
- Tools return error responses at their public boundary, never propagate exceptions
- Tools MAY throw internally - catch at the tool boundary and convert to `ErrorResponse`
- External API calls: retry with exponential backoff
- LLM parsing failures: fallback to simple text extraction
- Non-critical operations: log and continue
- User-facing errors: display actionable message and reset cleanly

---

## Configuration

### Priority Order
1. Environment variables (highest) - via `dotenv`
2. Project settings (`./.agent-ts/settings.json`)
3. User settings (`~/.agent-ts/settings.json`)
4. Default values in Zod schemas (lowest)

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
- **Project config**: `./.agent-ts/settings.json` (committed, team-shared)
- **User config**: `~/.agent-ts/settings.json` (personal, never committed)
- **Sessions**: `~/.agent-ts/sessions/`
- **Context**: `~/.agent-ts/context/` (cleaned per session)

---

## Session Logging

Each agent run is logged to `~/.agent-ts/sessions/` for debugging and auditability.

**Logged events**: session lifecycle, LLM calls, tool calls, errors.

**Redaction required**: API keys, tokens, and large file contents must never appear in logs.

---

## Skills System

### Skill Manifest
Skills use `skill.json` manifests validated with Zod schemas.
- **Required fields**: name, version, description, triggers
- **Optional fields**: defined per implementation needs (e.g., capabilities, priority)
- **Triggers**: lowercase substrings matched against user queries (case-insensitive)

### Skill Activation
- Match any trigger present in user query
- Limit injected skills per turn to avoid context bloat
- Rank by: explicit mention > exact phrase match > recent usage

### Skill Context Injection
Skills contribute prompt fragments and tools via callback layer based on trigger matching. This preserves progressive disclosure without a global event bus.

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
3. **Tests** - `bun run test` (Jest, 85% coverage minimum)
4. **Build** - `bun run build` (produces working bundle)

CI will block merges that fail any gate.

---

## Project-Specific Context

### This is a Rewrite Project
We are porting `agent-base` (Python/Microsoft Agent Framework) to TypeScript. Key migrations:

| Python | TypeScript |
|--------|------------|
| Microsoft Agent Framework | LangChain.js 1.x |
| Pydantic | Zod 4.x |
| EventBus singleton | Callback interface |
| pytest | Jest |
| Rich + Typer | React 19 + Ink 6 |
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
