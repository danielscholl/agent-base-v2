# Agent Framework Architecture

This document defines the architectural concepts, component relationships, and structural patterns for the TypeScript agent framework.

**Governance:** See [CLAUDE.md](../CLAUDE.md) for implementation rules.
**Implementation:** See [guides/](guides/) for code patterns.
**Features:** See [plans/typescript-rewrite-features.md](plans/typescript-rewrite-features.md) for build order.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                           User                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CLI Layer (React/Ink)                      │
│                                                                 │
│  Responsibilities:                                              │
│  • Terminal UI rendering                                        │
│  • User input handling                                          │
│  • State management (React hooks)                               │
│  • Command routing (/help, /telemetry, etc.)                    │
│                                                                 │
│  Receives: AgentCallbacks (lifecycle events)                    │
│  Never: Calls LLM directly, imports agent internals             │
└─────────────────────────────────────────────────────────────────┘
                              │ callbacks
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Agent Layer (Orchestration)                   │
│                                                                 │
│  Responsibilities:                                              │
│  • Query → LLM → Tool → Response loop                           │
│  • Message history assembly                                     │
│  • Tool binding and execution                                   │
│  • Callback emission to UI                                      │
│  • Telemetry span management                                    │
│                                                                 │
│  Owns: The only layer that calls Model Layer                    │
└─────────────────────────────────────────────────────────────────┘
          │                                    │
          │ tool calls                         │ LLM calls
          ▼                                    ▼
┌───────────────────────┐       ┌─────────────────────────────────┐
│     Tools Layer       │       │         Model Layer             │
│                       │       │                                 │
│  • Zod input schemas  │       │  • Provider routing             │
│  • ToolResponse output│       │  • Streaming support            │
│  • Permission checks  │       │  • Retry with backoff           │
│  • No LLM calls       │       │  • Structured output (Zod)      │
└───────────────────────┘       └─────────────────────────────────┘
          │                                    │
          └──────────────┬─────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Utils Layer                               │
│                                                                 │
│  • Configuration (load, validate, save)                         │
│  • Context storage (tool outputs → filesystem)                  │
│  • Message history (conversation memory)                        │
│  • Session persistence                                          │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Telemetry Layer (Cross-cutting)                 │
│                                                                 │
│  • OpenTelemetry spans for all operations                       │
│  • GenAI semantic conventions                                   │
│  • OTLP export to Aspire/Jaeger/etc.                            │
│  • Integrated via callbacks (SpanContext)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Interfaces

### Interface Map

| Interface | Layer | Purpose |
|-----------|-------|---------|
| `AgentCallbacks` | Agent→CLI | Lifecycle events (LLM, tools, agent) with SpanContext |
| `ToolResponse<T>` | Tools | Structured success/error return (never throw) |
| `ModelFactory` | Model | Creates LangChain model from name + options |
| `AppConfig` | Utils | Root configuration type (Zod-inferred) |
| `IContextManager` | Utils | Tool output storage and retrieval |
| `TelemetryHelpers` | Telemetry | Span creation with GenAI conventions |

### Callback Flow

```
Agent.run(query)
    │
    ├─► onAgentStart(ctx, query)
    │
    ├─► onLLMStart(ctx, model, messages)
    │       │
    │       └─► onLLMStream(ctx, chunk)  [if streaming]
    │       │
    │       └─► onLLMEnd(ctx, response, usage)
    │
    ├─► onToolStart(ctx, toolName, args)
    │       │
    │       └─► onToolEnd(ctx, toolName, result)
    │
    └─► onAgentEnd(ctx, answer)
```

All callbacks receive `SpanContext` for telemetry correlation.

### Tool Response Contract

```
ToolResponse<T>
├── success: true
│   ├── result: T
│   └── message: string
│
└── success: false
    ├── error: ToolErrorCode
    └── message: string

ToolErrorCode:
  VALIDATION_ERROR | IO_ERROR | CONFIG_ERROR | PERMISSION_DENIED |
  RATE_LIMITED | NOT_FOUND | LLM_ASSIST_REQUIRED | TIMEOUT | UNKNOWN
```

Tools return this structure - never throw exceptions at public boundaries.

---

## Provider Architecture

### Routing Strategy

Providers are selected by model name prefix:

```
Model Name              Provider
──────────────────────  ─────────────────
gpt-4o                  → OpenAI
gpt-4-turbo             → OpenAI
claude-3-opus           → Anthropic
claude-3-5-sonnet       → Anthropic
gemini-pro              → Google
gemini-1.5-flash        → Google
llama-3.1-70b           → Ollama (local)
(no match)              → Default (OpenAI)
```

### Provider Registry

```
┌─────────────────────────────────────────────┐
│           Provider Registry                 │
│                                             │
│  'gpt-'     ──► OpenAI Factory              │
│  'claude-'  ──► Anthropic Factory           │
│  'gemini-'  ──► Google Factory              │
│  'azure-'   ──► Azure OpenAI Factory        │
│  'github-'  ──► GitHub Models Factory       │
│  'llama-'   ──► Ollama Factory              │
│                                             │
│  registerProvider(prefix, factory)          │
│  getChatModel(name, options) → BaseChatModel│
└─────────────────────────────────────────────┘
```

New providers added by registering a prefix and factory function.

---

## Configuration Architecture

### Hierarchy (Highest to Lowest Priority)

```
1. Environment Variables     ─► OPENAI_API_KEY, AGENT_MODEL, etc.
         │
         ▼
2. Project Config            ─► ./<config-dir>/settings.json
         │                       (committable, team-shared)
         ▼
3. User Config               ─► ~/.<config-dir>/settings.json
         │                       (personal, never committed)
         ▼
4. Schema Defaults           ─► Zod schema .default() values
```

### Config Schema Structure

```
AppConfig
├── providers
│   ├── default: string
│   ├── openai?: { apiKey, model, baseUrl }
│   ├── anthropic?: { apiKey, model }
│   ├── azure?: { apiKey, endpoint, deployment, apiVersion }
│   └── ... (7 providers total)
│
├── agent
│   ├── systemPrompt?: string
│   ├── maxTokens: number
│   └── temperature: number
│
├── telemetry
│   ├── enabled: boolean
│   ├── endpoint: string
│   └── enableSensitiveData: boolean
│
└── skills
    ├── enabled: string[]
    └── pluginDir?: string
```

All schemas defined with Zod. Types inferred via `z.infer<>`.

---

## Context Storage Strategy

### Problem
Tool outputs can be large (search results, file contents). Keeping all outputs in memory causes unbounded growth.

### Solution
Filesystem-backed storage with lazy loading.

```
Execution Phase                    Answer Phase
───────────────                    ────────────

Tool executes                      Select relevant contexts
     │                                  │
     ▼                                  ▼
Save to filesystem              Load only selected data
     │                                  │
     ▼                                  ▼
Store pointer in memory         Build answer prompt
(lightweight metadata)
```

### Storage Layout

```
~/<config-dir>/context/
├── AAPL_get_financials_a1b2c3.json
├── search_code_d4e5f6.json
└── read_file_g7h8i9.json

Each file contains:
{
  toolName, args, result,
  timestamp, queryId
}
```

### Lifecycle

1. **During execution:** Tool outputs saved, pointers tracked
2. **During answer:** LLM selects relevant pointers, full data loaded
3. **End of session:** Context directory cleared

---

## Telemetry Architecture

### Span Hierarchy

```
agent.run (root span)
├── gen_ai.chat (LLM call)
│   ├── gen_ai.system: "openai"
│   ├── gen_ai.request.model: "gpt-4o"
│   ├── gen_ai.usage.input_tokens: 150
│   └── gen_ai.usage.output_tokens: 50
│
├── tool.execute (tool call)
│   ├── tool.name: "read_file"
│   ├── tool.result.success: true
│   └── duration_ms: 23
│
└── gen_ai.chat (final response)
    └── ...
```

### Integration Points

```
AgentCallbacks
     │
     ├─► onLLMStart   ──► startLLMSpan()
     ├─► onLLMEnd     ──► recordTokenUsage(), span.end()
     ├─► onToolStart  ──► startToolSpan()
     └─► onToolEnd    ──► recordToolResult(), span.end()
```

Telemetry is opt-in. When disabled, no-op implementations used.

---

## File Structure

```
src/
├── index.tsx                 # Entry point, CLI bootstrap
├── cli.tsx                   # Main CLI component
│
├── agent/
│   ├── agent.ts              # Core Agent class
│   ├── callbacks.ts          # AgentCallbacks interface
│   ├── types.ts              # Message, AgentOptions
│   └── prompts.ts            # System prompt loading
│
├── model/
│   ├── llm.ts                # Provider routing, getChatModel()
│   ├── types.ts              # ModelFactory, LLMCallOptions
│   ├── retry.ts              # Exponential backoff
│   └── providers/            # Provider-specific implementations
│
├── tools/
│   ├── types.ts              # ToolResponse, ToolErrorCode
│   ├── base.ts               # Tool creation helpers
│   └── [tool-name].ts        # Individual tools
│
├── config/
│   ├── schema.ts             # Zod schemas, AppConfig
│   ├── manager.ts            # Load/save/merge logic
│   └── providers/            # Setup wizards (Phase 5)
│
├── telemetry/
│   ├── setup.ts              # OTel initialization
│   ├── types.ts              # TelemetryHelpers
│   ├── spans.ts              # GenAI span helpers
│   └── aspire.ts             # Docker dashboard commands
│
├── utils/
│   ├── context.ts            # IContextManager implementation
│   ├── message-history.ts    # Conversation memory
│   ├── session.ts            # Session persistence
│   └── env.ts                # Environment helpers
│
├── components/               # React/Ink UI components
│   ├── Input.tsx
│   ├── Spinner.tsx
│   └── AnswerBox.tsx
│
├── skills/                   # Phase 4
│   ├── loader.ts
│   ├── registry.ts
│   └── scripts.ts
│
├── commands/                 # Phase 5
│   ├── config.tsx
│   ├── skills.tsx
│   └── session.tsx
│
└── errors/
    └── index.ts              # AgentError hierarchy
```

---

## Extension Points

### Adding a Provider

1. Create factory in `model/providers/<name>.ts`
2. Register prefix in provider registry
3. Add config schema section
4. (Phase 5) Add setup wizard

### Adding a Tool

1. Define Zod input schema
2. Implement tool returning `ToolResponse<T>`
3. Export from tools index
4. Tool auto-receives callbacks via LangChain config

### Adding a Callback

1. Add method signature to `AgentCallbacks`
2. Emit from appropriate Agent lifecycle point
3. Subscribe in CLI component

### Adding a Skill (Phase 4)

1. Create `skill.json` manifest
2. Implement toolsets in `toolsets/index.ts`
3. (Optional) Add scripts in `scripts/`
4. Register triggers for progressive disclosure

---

## Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Dependency Injection** | All components receive deps via constructor |
| **Callbacks over Events** | Typed callbacks replace Python's EventBus |
| **Structured Responses** | Tools return `ToolResponse`, never throw |
| **Validation at Boundaries** | Zod validates config, LLM output, tool input |
| **Lazy Loading** | Context loaded only when needed |
| **Graceful Degradation** | Failures logged, agent continues |
| **Layer Isolation** | Only Agent calls Model; CLI never imports Agent internals |

---

## References

| Source | Pattern |
|--------|---------|
| `agent-base/src/agent/agent.py` | Orchestration, DI |
| `agent-base/src/agent/middleware.py` | Callback/event patterns |
| `agent-base/src/agent/observability.py` | OTel integration |
| `dexter/src/agent/agent.ts` | TypeScript agent structure |
| `dexter/src/model/llm.ts` | Provider routing |
| `dexter/src/utils/context.ts` | Context storage |
