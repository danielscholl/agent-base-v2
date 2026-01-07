# Project Constitution

This file provides governance and guidance for AI coding assistants working on the Agent Harness — a TypeScript runtime for building, running, and composing AI agents.

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
This is an agent harness (runtime infrastructure), not a minimal LLM shell:
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
| Language | TypeScript 5.9+ | Strict mode required |
| Runtime | Bun 1.3.x | Development and runtime (Node 24 APIs) |
| Node Engine | >=24.0.0 | Bun 1.3.4 implements Node 24.3.0 |
| UI Framework | React 19 + Ink 6 | Terminal UI rendering |
| LLM Integration | LangChain.js 1.x | Multi-provider abstraction (@langchain/core, @langchain/openai) |
| Schema Validation | Zod 4.x | Runtime validation + type inference |
| Observability | OpenTelemetry 2.x | OTLP export, GenAI semantic conventions |
| Testing | Jest 30 + ts-jest | Run via `bun run test` |
| Linting | ESLint 9 + Prettier 3 | Flat config, consistent code style |

### Runtime Notes
- **Development**: Bun 1.x for fast TS execution and bundling
- **Runtime**: Bun 1.x (users must have Bun installed)
- We chose Bun-only runtime for native TypeScript execution without transpilation

**Version Authority**: `package.json` is the source of truth for exact versions.

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
- If a tool needs LLM assistance, return `ToolResponse` with `error: 'LLM_ASSIST_REQUIRED'` and a `message` describing what help is needed; the Agent Layer interprets and acts on this

### Key Patterns

| Pattern | Purpose | Location |
|---------|---------|----------|
| Callback Interface | Agent→UI communication | `agent/callbacks.ts` |
| Provider Routing | Multi-model support via config name | `model/llm.ts` |
| Tool Wrapper | Zod schema + structured response | `tools/base.ts` |
| System Prompts | Three-tier fallback + placeholders | `agent/prompts.ts` |
| Skill Loader | Progressive disclosure discovery | `skills/loader.ts` |
| Telemetry Spans | GenAI semantic conventions | `telemetry/spans.ts` |

- **Architecture**: [`docs/architecture/`](docs/architecture/README.md) - Component relationships, interfaces

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
```
- **Integration tests**: `tests/integration/`
- **Shared fixtures**: `tests/fixtures/`

### Rules
- Mock all LLM providers - no real API calls in CI
- Use factory functions for test objects with sensible defaults
- Clear mocks in `beforeEach` for test isolation
- Coverage minimum: 85% (enforced in CI)

See [`docs/guides/testing.md`](docs/guides/testing.md) for mock patterns, factory functions, and integration test examples.

### Shared Test Fixtures

The `tests/fixtures/` directory provides reusable test utilities:

| File | Purpose |
|------|---------|
| `llm-responses.ts` | Mock LLM responses, tool calls, streaming |
| `factories.ts` | Factory functions for configs, callbacks, models |
| `mock-providers.ts` | Provider mocking helpers |
| `index.ts` | Central exports |

---

## System Prompts

System prompts use a three-tier loading system with placeholder substitution:

1. **Config override**: `config.agent.systemPromptFile`
2. **User default**: `~/.agent/system.md`
3. **Package default**: Bundled `src/prompts/base.md`

See [`docs/guides/prompts.md`](docs/guides/prompts.md) for customization and placeholders.

---

## Skills System

Skills use SKILL.md manifests with YAML front matter for metadata and markdown instructions. Skills inject documentation and tools based on trigger matching (progressive disclosure).

See [`docs/architecture/skills.md`](docs/architecture/skills.md) for manifest format, trigger matching, and skill sources.

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

---

## Architecture Decision Records

Create an ADR in [`docs/decisions/`](docs/decisions/) when:
- Adding new architectural patterns
- Choosing between design alternatives
- Making technology/library selections
- Changing core system behaviors

See [`docs/decisions/README.md`](docs/decisions/README.md) for templates and process.

