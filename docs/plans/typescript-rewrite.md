# Agent Framework: Python to TypeScript Rewrite Plan

## Executive Summary

Full rewrite of `agent-base` (Python/Microsoft Agent Framework) to TypeScript using the Claude Code tech stack: **Bun runtime, React + Ink terminal UI, LangChain.js, Zod validation**. This will be a complete replacement of the Python version.

**Scope:** All 7 LLM providers, full skills system port
**Approach:** AI-assisted development in 6 phases

---

## Feasibility Assessment: GO

### Why This Makes Sense

| Factor | Assessment |
|--------|------------|
| Claude Code validation | Proven architecture for CLI agents (React/Ink/Bun) |
| LangChain.js maturity | Comparable to Microsoft Agent Framework, larger community |
| Dexter reference | Working TypeScript codebase to build upon |
| LLM compatibility | TypeScript/React are "on distribution" - models handle them well |
| Single runtime | Eliminates Python/Node split for agent tooling |

### Key Challenges

1. **Microsoft Agent Framework has no TS equivalent** → LangChain.js migration
2. **Skills system redesign** → PEP 723 scripts replaced with Bun subprocess
3. **7 providers** → Only 3 in dexter, need 4 more implementations
4. **Test coverage** → Rebuild 85% coverage standard with Jest

---

## Architecture Decisions

### 1. LLM Provider Layer

**From:** Microsoft Agent Framework `BaseChatClient`
**To:** LangChain.js `BaseChatModel` with config-based provider selection

```typescript
// Provider selected by config name, not model prefix
const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  'openai': (config) => new ChatOpenAI({ model: config.model, ...config }),
  'anthropic': (config) => new ChatAnthropic({ model: config.model, ...config }),
  'gemini': (config) => new ChatGoogleGenerativeAI({ model: config.model, ...config }),
  // ... 7 providers total
};

// Usage: config.providers.default determines which factory to use
const provider = config.providers.default; // e.g., "openai"
const model = PROVIDER_FACTORIES[provider](config.providers[provider]);
```

**New providers to implement:**
- Azure OpenAI → `@langchain/openai` with Azure config
- Azure AI Foundry → Custom implementation
- GitHub Models → OpenAI-compatible endpoint
- Local (Docker Model Runner) → OpenAI-compatible API

### 2. Event System

**From:** Singleton `EventBus` with observer pattern
**To:** Callback-driven architecture (from dexter)

```typescript
interface AgentCallbacks {
  onLLMStart?: (ctx: SpanContext, model: string, messages: Message[]) => void;
  onLLMStream?: (ctx: SpanContext, chunk: string) => void;
  onLLMEnd?: (ctx: SpanContext, response: string, usage: TokenUsage) => void;
  onToolStart?: (ctx: SpanContext, toolName: string, args: Record<string, unknown>) => void;
  onToolEnd?: (ctx: SpanContext, toolName: string, result: ToolResponse) => void;
  onAgentStart?: (ctx: SpanContext, query: string) => void;
  onAgentEnd?: (ctx: SpanContext, answer: string) => void;
}
```

**Rationale:** Better React integration, type-safe, easier testing

**Note:** `SpanContext` here is an internal correlation type, not the OTel type. See Section 7 (Observability System) for details on how telemetry maps these callbacks to OTel spans.

### 3. Tool System

**From:** Class-based `AgentToolset` with Pydantic annotations
**To:** LangChain.js `StructuredTool` with Zod schemas

```typescript
const myTool = tool(
  async (input: { name: string }) => {
    return { success: true, result: "...", message: "..." };
  },
  {
    name: 'my_tool',
    description: 'Tool description (10-40 tokens)',
    schema: z.object({ name: z.string().describe("Parameter description") }),
  }
);
```

**Keep:** Structured response format `{success, result/error, message}`

### 4. Configuration System

**From:** Pydantic v2 `BaseModel` with validators
**To:** Zod schemas with TypeScript inference

```typescript
const ProviderConfigSchema = z.object({
  enabled: z.array(z.string()),
  openai: OpenAIConfigSchema.optional(),
  anthropic: AnthropicConfigSchema.optional(),
  // ... all 7 providers
});

type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
```

### 5. Skills System (Ported from Python)

**From:** SKILL.md manifests + PEP 723 scripts + `uv run`
**To:** SKILL.md manifests (YAML frontmatter) + TypeScript toolsets

```
skills/
├── hello-extended/
│   ├── SKILL.md            # Manifest (YAML frontmatter + markdown instructions)
│   └── toolsets/
│       └── index.ts        # Exported tool classes
```

**MVP Scope:** Toolsets only. Scripts deferred to post-MVP.

**Toolsets vs Scripts:**
- **Toolsets**: TypeScript classes loaded into LLM context, low latency, testable
- **Scripts**: Subprocess execution with process isolation (post-MVP)

**Progressive disclosure preserved:**
1. Tier 0: Nothing (no skills)
2. Tier 1: Breadcrumb "[N skills available]"
3. Tier 2: Registry with brief descriptions
4. Tier 3: Full documentation for matched triggers

### 6. Memory System

**From:** `ContextProvider` hooks + Mem0 semantic
**To:** Callback-injected history + filesystem context

```typescript
class MessageHistory {
  async addMessage(query: string, answer: string): Promise<void>;
  async getRelevantHistory(query: string, limit?: number): Promise<Message[]>;
}

class ToolContextManager {
  saveContext(tool: string, args: object, result: unknown): string;
  selectRelevantContexts(query: string): Promise<ContextData[]>;
}
```

### 7. Observability System

**From:** `agent-base/src/agent/observability.py` + middleware instrumentation
**To:** OpenTelemetry-native callbacks with OTLP export

```typescript
// Internal correlation context for UI + logs
// SpanContext is NOT an OpenTelemetry type; telemetry maps it to OTel spans
interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  attributes: Record<string, string | number | boolean>;
}
```

**SpanContext Design:**
- `SpanContext` is an internal correlation context used by callbacks for UI updates and structured logging
- When telemetry is enabled (`ENABLE_OTEL=true`), the telemetry layer starts real OTel spans and optionally copies the OTel `traceId`/`spanId` into `SpanContext` for correlation
- This decouples callback-based event flow from OTel instrumentation

**Span Inference Strategy:**
- We infer spans from existing callbacks (`onAgentStart`, `onLLMStart`, `onToolStart`, etc.)
- No separate `onSpanStart`/`onSpanEnd` callbacks; the telemetry layer wraps lifecycle callbacks to create spans
- Example: `onAgentStart` → starts `agent.run` span; `onAgentEnd` → ends the span

**Key Features (ported from Python):**
- OTLP exporter for Aspire Dashboard / Jaeger / custom endpoints
- GenAI semantic conventions (model, tokens, tool calls)
- Auto-detection of local telemetry endpoint
- `/telemetry start|stop|status` commands (Docker-based Aspire)
- Sensitive data toggle (disabled by default)

---

## Component Migration Map

### Core Agent (`src/agent/`)

| Python File | TypeScript File | Complexity |
|-------------|-----------------|------------|
| `agent.py` | `agent/agent.ts` | Medium |
| `middleware.py` | `agent/callbacks.ts` | Low |
| `events.py` | (merged into callbacks) | Low |
| `exceptions.py` | `errors/index.ts` | Low |
| `persistence.py` | `utils/persistence.ts` | Low |

### Configuration (`src/config/`)

| Python File | TypeScript File | Complexity |
|-------------|-----------------|------------|
| `schema.py` | `config/schema.ts` | Medium |
| `manager.py` | `config/manager.ts` | Low |
| `providers/*.py` | `config/providers/*.ts` | Medium |

### Tools (`src/tools/`)

| Python File | TypeScript File | Complexity |
|-------------|-----------------|------------|
| `toolset.py` | `tools/base.ts` | Low |
| `hello.py` | `tools/hello.ts` | Low |
| `filesystem.py` | `tools/filesystem.ts` | Medium |

### Skills (`src/skills/`)

| Python File | TypeScript File | Complexity |
|-------------|-----------------|------------|
| `loader.py` | `skills/loader.ts` | High |
| `context_provider.py` | `skills/injector.ts` | Medium |
| `documentation_index.py` | `skills/registry.ts` | Medium |
| `script_tools.py` | `skills/scripts.ts` | High |

### Providers (`src/providers/`)

| Provider | Implementation | Source |
|----------|---------------|--------|
| OpenAI | `@langchain/openai` | Dexter reference |
| Anthropic | `@langchain/anthropic` | Dexter reference |
| Google Gemini | `@langchain/google-genai` | Dexter reference |
| Azure OpenAI | `@langchain/openai` (Azure config) | New |
| Azure AI Foundry | Custom `BaseChatModel` | New |
| GitHub Models | OpenAI-compatible | New |
| Local (Docker Model Runner) | OpenAI-compatible API | New |

### CLI (`src/cli/`)

| Python File | TypeScript File | Complexity |
|-------------|-----------------|------------|
| `app.py` (Typer) | `index.tsx` (Ink) | Medium |
| `interactive.py` | `cli.tsx` | Medium |
| `session.py` | `utils/session.ts` | Low |

### Display (`src/display/`)

| Python (Rich) | TypeScript (Ink) | Complexity |
|---------------|------------------|------------|
| Tree visualization | `components/TaskProgress.tsx` | Low |
| Streaming output | `components/AnswerBox.tsx` | Low |
| Status/spinners | `components/Spinner.tsx` | Low |

---

## MVP Scope (6 Phases)

### Phase 1a: Foundation (Core)

**Goal:** Establish core architecture and validate the agent loop

**Deliverables:**
- [ ] Project setup (Bun, TypeScript strict, Jest, ESLint)
- [ ] Configuration system with Zod (`config/schema.ts`)
- [ ] Tool base class and response format (`tools/base.ts`)
- [ ] OpenAI provider via LangChain.js (`model/llm.ts`)
- [ ] Basic agent orchestration (`agent/agent.ts`)
- [ ] Callback system (`agent/callbacks.ts`)
- [ ] Structured error types (`errors/index.ts`)
- [ ] Hello tool to validate the agent loop

### Phase 1b: Foundation (Observability)

**Goal:** Add telemetry instrumentation before expanding providers

**Bun Compatibility:**
- Manual spans only; no Node auto-instrumentation (incompatible with Bun)
- If `@opentelemetry/sdk-node` is incompatible with Bun, use `@opentelemetry/sdk-trace-base` + OTLP exporter instead

**Deliverables (ordered):**
1. [ ] **Bun + OTel smoke test** (acceptance criteria): With `ENABLE_OTEL=true` and `OTLP_ENDPOINT=http://localhost:4318/v1/traces`, running a single `Agent.run()` produces at least one exported trace
2. [ ] OpenTelemetry setup with OTLP exporter (`telemetry/`)
3. [ ] GenAI semantic conventions for LLM spans
4. [ ] Aspire Dashboard integration (`/telemetry start|stop|status`)

**Key Files:**
```
src/
├── index.tsx
├── agent/
│   ├── agent.ts
│   ├── callbacks.ts
│   └── schemas.ts
├── config/
│   ├── schema.ts
│   └── manager.ts
├── model/
│   └── llm.ts
├── telemetry/
│   ├── setup.ts              # OTel initialization
│   ├── spans.ts              # Span helpers with GenAI conventions
│   ├── exporters.ts          # OTLP, console exporters
│   └── aspire.ts             # Docker-based dashboard management
├── errors/
│   └── index.ts
└── tools/
    ├── base.ts
    └── hello.ts
```

### Phase 2: Multi-Provider + CLI

**Goal:** Provider parity for core 3, interactive shell, and essential tools

**Deliverables:**
- [ ] Anthropic provider
- [ ] Google Gemini provider
- [ ] Azure OpenAI provider
- [ ] Retry logic with exponential backoff
- [ ] React/Ink CLI shell (`cli.tsx`)
- [ ] Input handling and command parsing
- [ ] Basic display components
- [ ] FileSystem tools (`tools/filesystem.ts`)

**Key Files:**
```
src/
├── cli.tsx
├── components/
│   ├── Input.tsx
│   ├── Spinner.tsx
│   └── TaskProgress.tsx
├── tools/
│   └── filesystem.ts
└── model/
    └── providers/
        ├── openai.ts
        ├── anthropic.ts
        ├── gemini.ts
        └── azure.ts
```

### Phase 3: Memory + Session

**Goal:** Conversation persistence and remaining providers

**Deliverables:**
- [ ] Message history with conversation context
- [ ] Session persistence (filesystem)
- [ ] Tool context manager
- [ ] Answer streaming display
- [ ] Token counting/usage tracking
- [ ] GitHub Models provider
- [ ] Local (Docker Model Runner) provider

**Key Files:**
```
src/
├── utils/
│   ├── message-history.ts
│   ├── context.ts
│   ├── session.ts
│   ├── persistence.ts
│   └── tokens.ts
├── components/
│   └── AnswerBox.tsx
└── model/
    └── providers/
        ├── github.ts
        └── local.ts
```

### Phase 4: Skills System

**Goal:** Skills system with toolsets (scripts deferred to post-MVP)

**Deliverables:**
- [ ] SKILL.md manifest format with Zod validation
- [ ] Skill loader and discovery (3-state enablement)
- [ ] Skill registry with atomic persistence
- [ ] Progressive disclosure context injection (4-tier)
- [ ] Azure AI Foundry provider
- [ ] Bundled hello-extended skill (toolsets only)

**Key Files:**
```
src/
├── skills/
│   ├── manifest.ts         # Zod schemas, YAML parsing
│   ├── loader.ts           # Discovery, dynamic import
│   ├── registry.ts         # Persistent metadata
│   └── context-provider.ts # Progressive disclosure
└── _bundled_skills/
    └── hello-extended/
        ├── SKILL.md
        └── toolsets/
            └── index.ts
```

### Phase 5: CLI Completeness

**Goal:** Full CLI parity with Python version

**Deliverables:**
- [ ] Config subcommands (init, show, edit)
- [ ] Provider setup wizards
- [ ] Skill management (list, enable, disable)
- [ ] Memory/session commands (list, continue, purge)
- [ ] Help system and documentation

**Key Files:**
```
src/
├── commands/
│   ├── config.tsx
│   ├── skills.tsx
│   └── session.tsx
└── config/
    └── providers/
        ├── openai.ts
        ├── anthropic.ts
        └── ...
```

### Phase 6: Polish + Testing

**Goal:** Production readiness

**Deliverables:**
- [ ] 85% test coverage
- [ ] Error handling refinement
- [ ] Configuration migration tool (Python → TypeScript)
- [ ] System prompt template system (three-tier, placeholders)
- [x] CLAUDE.md for the new codebase (created pre-implementation)
- [ ] README and migration documentation

---

## Project Structure (Final)

```
agent-ts/
├── src/
│   ├── index.tsx                 # Entry point
│   ├── cli.tsx                   # Main CLI component
│   ├── agent/
│   │   ├── agent.ts              # Core orchestration
│   │   ├── callbacks.ts          # Event callbacks + trace logging
│   │   ├── schemas.ts            # Zod schemas for LLM outputs
│   │   └── prompts.ts            # System prompt templates (three-tier)
│   ├── model/
│   │   ├── llm.ts                # Multi-provider abstraction
│   │   ├── retry.ts              # Exponential backoff logic
│   │   └── providers/            # Provider implementations
│   │       ├── openai.ts
│   │       ├── anthropic.ts
│   │       ├── gemini.ts
│   │       ├── azure-openai.ts
│   │       ├── azure-foundry.ts
│   │       ├── github.ts
│   │       └── local.ts
│   ├── config/
│   │   ├── schema.ts             # Configuration Zod schemas
│   │   ├── manager.ts            # Load/save config
│   │   └── providers/            # Provider setup wizards
│   ├── commands/
│   │   ├── config.tsx            # Config subcommands
│   │   ├── skills.tsx            # Skill management
│   │   └── session.tsx           # Session commands
│   ├── tools/
│   │   ├── base.ts               # Tool response format
│   │   ├── hello.ts              # Example tools
│   │   └── filesystem.ts         # File system tools
│   ├── skills/
│   │   ├── loader.ts             # Skill discovery
│   │   ├── registry.ts           # Progressive disclosure index
│   │   ├── injector.ts           # Context injection
│   │   └── scripts.ts            # Script execution (Bun sandbox)
│   ├── utils/
│   │   ├── message-history.ts    # Conversation memory
│   │   ├── context.ts            # Tool context storage
│   │   ├── session.ts            # Session management
│   │   ├── persistence.ts        # File persistence
│   │   ├── tokens.ts             # Token counting utilities
│   │   └── env.ts                # API key management
│   ├── components/
│   │   ├── Input.tsx             # Terminal input
│   │   ├── Spinner.tsx           # Loading indicator
│   │   ├── TaskProgress.tsx      # Task visualization
│   │   ├── AnswerBox.tsx         # Streaming answer display
│   │   └── ModelSelector.tsx     # Provider selection
│   ├── telemetry/
│   │   ├── setup.ts              # OTel initialization + singleton
│   │   ├── spans.ts              # Span helpers with GenAI conventions
│   │   ├── exporters.ts          # OTLP, console exporters
│   │   └── aspire.ts             # Docker-based dashboard management
│   ├── errors/
│   │   └── index.ts              # Typed error hierarchy
│   └── _bundled_skills/          # Default skills
│       └── hello-extended/
│           ├── SKILL.md
│           └── toolsets/
│               └── index.ts
├── tests/
│   ├── integration/            # Cross-module integration tests
│   └── fixtures/               # Shared test fixtures and mocks
│   # Note: Unit tests are co-located in src/**/__tests__/
├── docs/
│   ├── decisions/                # TypeScript ADRs
│   └── migration.md              # Python → TypeScript guide
├── package.json
├── tsconfig.json
├── jest.config.js
└── CLAUDE.md
```

---

## Dependencies

Use latest stable versions per `CLAUDE.md` Tech Stack:
- **React 19** + **Ink 6** for terminal UI
- **Zod 4.x** for schema validation (see ADR-0004)
- **LangChain.js 1.x** for LLM integration
- **TypeScript 5.x** with strict mode

**Observability (Phase 1b):**
- `@opentelemetry/api` - Core OTel API
- `@opentelemetry/sdk-node` - Node SDK (primary); fallback to `@opentelemetry/sdk-trace-base` if Bun incompatible
- `@opentelemetry/exporter-trace-otlp-http` - OTLP export (works under Bun)
- `@opentelemetry/semantic-conventions` - Standard attributes

**Utilities:**
- `dotenv` - Environment variable loading
- `meow` - CLI argument parsing (pairs with Ink)
- `p-queue` - Concurrency/rate limiting

**Dev Dependencies:**
- `ink-testing-library` - CLI component testing

See `package.json` for exact versions (source of truth for dependencies).

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Skills system complexity | Start with toolsets only, add scripts in Phase 4 |
| Provider parity | Core 3 in Phase 2, add others incrementally |
| Test coverage gap | Establish patterns in Phase 1, enforce from start |
| Config migration | Provide migration script in Phase 6, document changes |
| Streaming consistency | Validate streaming works identically across all providers |
| Error surface differences | Map Python exceptions to TS error types early |

## Post-MVP Enhancements (Deferred)

| Feature | Rationale for Deferral |
|---------|------------------------|
| Skill script execution | Toolsets cover 80%+ of use cases; scripts add process isolation complexity |
| Git-based skill installation | Complex; bundled skills sufficient for MVP |
| Semantic memory (Mem0) | In-memory history sufficient for MVP |
| npm package publishing | Focus on functionality first |

**Script Execution Details (Post-MVP):**
When implemented, scripts will use Bun subprocess execution with:
- Process isolation via `Bun.spawn()`
- Timeout enforcement (60s default)
- Output size limits (1MB default)
- Argument validation (max 100 args, 4096 bytes total)
- JSON response format `{success, result|error, message}`

---

## Success Criteria (MVP)

1. **Functional:** Run interactive chat with any of 7 providers
2. **Parity:** Tools, skills, memory working equivalently to Python
3. **Quality:** 85% test coverage, TypeScript strict mode passes
4. **Performance:** Startup < 500ms (Bun advantage)
5. **Migration:** Existing Python users can migrate configs
6. **Streaming:** All providers support streaming responses
7. **Testable:** All components mockable without real LLM calls
8. **Observable:** Traces visible in Aspire Dashboard with GenAI attributes

---

## Reference Files

### From agent-base (Python source):
- `agent-base/src/agent/agent.py`
- `agent-base/src/agent/config/schema.py`
- `agent-base/src/agent/skills/loader.py`
- `agent-base/src/agent/tools/toolset.py`
- `agent-base/src/agent/observability.py` - OTel setup patterns
- `agent-base/src/agent/cli/commands.py` - Aspire dashboard commands
- `agent-base/docs/decisions/0014-observability-integration.md`
- `agent-base/docs/decisions/` (20 ADRs)

### From dexter (TypeScript reference):
- `dexter/src/agent/agent.ts`
- `dexter/src/model/llm.ts`
- `dexter/src/cli.tsx`
- `dexter/src/utils/context.ts`

---

## Next Steps

1. Initialize Bun project with TypeScript in repo root (`agent-base-v2/`)
2. Set up `src/` directory structure per Project Structure section
3. Begin Phase 1 foundation work
4. Port configuration schema first (validates Zod approach)

> **Note**: This plan references `agent-ts/` as the conceptual project name. The actual implementation lives in `agent-base-v2/` with `src/` at the repo root.
