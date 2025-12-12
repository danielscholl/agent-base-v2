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

### Supported Providers (7)

| Provider | Description | Default Model | Example Models |
|----------|-------------|---------------|----------------|
| `openai` | OpenAI API | gpt-5-mini | gpt-4o, gpt-5-mini |
| `anthropic` | Anthropic API | claude-haiku-4-5 | claude-sonnet-4-5, claude-opus-4 |
| `azure` | Azure OpenAI | (deployment) | gpt-5-codex, gpt-4o |
| `foundry` | Azure AI Foundry | (deployment) | Managed models |
| `gemini` | Google Gemini | gemini-2.0-flash-exp | gemini-2.5-pro |
| `github` | GitHub Models | gpt-4o-mini | phi-4, llama-3.3-70b-instruct |
| `local` | Docker Model Runner | ai/phi4 | Local models via OpenAI-compatible API |

### Provider Selection

Providers are selected by **name** in configuration, not by model prefix:

```
settings.json
─────────────
{
  "providers": {
    "default": "openai",                  ← Selected provider
    "openai": {
      "apiKey": "...",
      "model": "gpt-4o"
    },
    "anthropic": {
      "apiKey": "...",
      "model": "claude-sonnet-4-5"
    }
  }
}

Note: Config uses camelCase consistently (TypeScript convention).
On-disk JSON matches in-memory TypeScript objects without transformation.
```

### Provider Registry

```
┌─────────────────────────────────────────────┐
│           Provider Registry                 │
│                                             │
│  'openai'    ──► OpenAI Factory             │
│  'anthropic' ──► Anthropic Factory          │
│  'azure'     ──► Azure OpenAI Factory       │
│  'foundry'   ──► Azure AI Foundry Factory   │
│  'gemini'    ──► Google Gemini Factory      │
│  'github'    ──► GitHub Models Factory      │
│  'local'     ──► Local (OpenAI-compatible)  │
│                                             │
│  getProviderSetup(name) → ProviderFactory   │
│  createChatClient(provider) → BaseChatModel │
└─────────────────────────────────────────────┘
```

### Provider-Specific Notes

| Provider | Authentication | Notes |
|----------|----------------|-------|
| `openai` | API key | Standard OpenAI API |
| `anthropic` | API key | Anthropic Claude API |
| `azure` | API key or Azure CLI credential | Supports AzureCliCredential fallback |
| `foundry` | Azure CLI credential | Async credential required |
| `gemini` | API key or Vertex AI | Supports both direct API and Vertex AI |
| `github` | GitHub token | Supports org-scoped enterprise rate limits |
| `local` | None | Docker Desktop Model Runner (OpenAI-compatible) |

---

## Configuration Architecture

### Config Directory

The config directory is `.agent/` (matches Python for easier migration):
- **Project config**: `./.agent/settings.json` (committable, team-shared)
- **User config**: `~/.agent/settings.json` (personal, never committed)
- **Sessions**: `~/.agent/sessions/`
- **Context**: `~/.agent/context/` (cleared per session)
- **Skills**: `~/.agent/skills/` (user plugins)

### Config Conventions

- **Casing**: camelCase for all keys (TypeScript convention)
- **On-disk format**: JSON matches in-memory objects (no transformation)
- **Validation**: Zod schemas with TypeScript type inference

### Hierarchy (Highest to Lowest Priority)

```
1. Environment Variables     ─► OPENAI_API_KEY, AGENT_MODEL, etc.
         │
         ▼
2. Project Config            ─► ./.agent/settings.json
         │                       (committable, team-shared)
         ▼
3. User Config               ─► ~/.agent/settings.json
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

## Error Handling Architecture

### Error Type Hierarchy

```
AgentError (base)
├── ProviderError     ─► Rate limits, auth failures, network issues
├── ConfigError       ─► Validation failures, missing required fields
├── ToolError         ─► Tool execution failures
└── PermissionError   ─► Permission denied for operation
```

### Error Handling by Layer

| Layer | Strategy |
|-------|----------|
| **Tools** | Return `ToolResponse` at boundary, never throw |
| **Agent/Model** | May throw `AgentError` subclasses |
| **CLI** | Catches all errors, displays user-friendly messages |

### Error Flow

```
Tool Layer                    Agent Layer                   CLI Layer
──────────                    ───────────                   ─────────

try/catch internally          May throw AgentError          try {
       │                             │                        agent.run()
       ▼                             │                      } catch {
Return ToolResponse ─────────►  Handles tool errors           display error
  (never throw)                      │                        reset cleanly
                                     ▼                      }
                              Throws for fatal errors ─────►
```

### Retry Strategy

External API calls use exponential backoff with jitter:
- Base delay: 1 second
- Max delay: 10 seconds
- Max retries: 3
- Retryable: rate limits, transient network errors
- Non-retryable: auth failures, validation errors

### Graceful Degradation

| Failure | Fallback |
|---------|----------|
| LLM parsing fails | Extract text content, skip structure |
| History selection fails | Proceed without context |
| Telemetry fails | Continue with no-op tracer |
| Non-critical operations | Log and continue |

---

## Permissions Architecture

### Permission Model

```
┌─────────────────────────────────────────────────────────┐
│                    Permission Check                      │
│                                                          │
│  Tool requests permission ──► Check settings hierarchy   │
│                                      │                   │
│                    ┌─────────────────┼─────────────────┐ │
│                    ▼                 ▼                 ▼ │
│              Project rules     User rules      Interactive│
│              (committed)       (personal)       prompt    │
│                    │                 │              │     │
│                    └─────────────────┴──────────────┘     │
│                                      │                    │
│                                      ▼                    │
│                              Allow / Deny                 │
└─────────────────────────────────────────────────────────┘
```

### Permission Scopes

| Scope | Description | Default |
|-------|-------------|---------|
| `fs-read` | Read files in working directory | Allowed within project |
| `fs-write` | Create/modify files | Denied |
| `fs-delete` | Delete files | Denied |
| `shell-run` | Execute shell commands | Denied |

### Sensitive Paths (Always Prompt)

Even with `fs-read` allowed, these paths require explicit per-session approval:
- `~/.ssh/*`, `~/.gnupg/*` - Credentials and keys
- `.env*`, `*credentials*`, `*secret*` - Environment secrets
- OS keychains and credential stores

### Permission Callback Flow

```
Tool.execute(input)
       │
       ▼
callbacks.onPermissionRequest({
  scope: 'fs-write',
  resource: '/path/to/file',
  action: 'write file'
})
       │
       ▼
┌──────┴──────┐
│   Allowed?  │
└──────┬──────┘
       │
  ┌────┴────┐
  ▼         ▼
true      false
  │         │
  ▼         ▼
Proceed   Return PermissionDenied
```

---

## Session Architecture

### Session Lifecycle

```
Session Start                    During Session                 Session End
─────────────                    ──────────────                 ───────────

Create session ID                Log events:                    Save session file
       │                         • LLM calls                    Clear context dir
       ▼                         • Tool calls                          │
Initialize context dir           • Errors                              ▼
       │                                │                        Sessions stored in
       ▼                                ▼                        ~/<config-dir>/sessions/
Begin logging              Persist large outputs to
                           ~/<config-dir>/context/
```

### Session Storage

| Location | Purpose | Lifecycle |
|----------|---------|-----------|
| `~/<config-dir>/sessions/` | Conversation history, event logs | Persisted |
| `~/<config-dir>/context/` | Tool outputs, large results | Cleared per session |

### Logged Events

- Session lifecycle (start, end, duration)
- LLM calls (model, token usage, latency)
- Tool calls (name, args, result status, duration)
- Errors (type, message, sanitized context)

**Redaction Required:** API keys, tokens, and sensitive file contents must never appear in logs.

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

### Session Resume and Context

**Important:** Context is ephemeral and not preserved across session resume.

When a session is resumed (`--continue`):
- **Conversation history** is restored (messages, timestamps)
- **Event logs** are available (LLM calls, tool calls)
- **Context data is NOT restored** (large tool outputs are lost)

This is a deliberate trade-off:
- **Rationale:** Context can be very large (search results, file contents)
- **Implication:** Resumed sessions may need to re-execute tools to regenerate context
- **Future consideration:** Post-MVP could add context summaries stored with session

For MVP, users should understand that resuming a session provides conversation continuity but not full context restoration.

---

## Skills Architecture

### Skill Structure

```
skills/
└── hello-extended/
    ├── SKILL.md              # Manifest (YAML front matter + instructions)
    └── toolsets/
        └── index.ts          # Exported tool classes
```

**MVP Scope:** Toolsets only. Script execution deferred to post-MVP.

**Toolsets vs Scripts:**
| Aspect | Toolsets | Scripts (Post-MVP) |
|--------|----------|-------------------|
| Context | Loaded into LLM | Not loaded |
| Latency | Low (in-process) | Higher (subprocess) |
| Dependencies | Shared with agent | Isolated per-script |
| Testing | Synchronous, mockable | Async subprocess |
| MVP Status | **Included** | Deferred |

### Manifest Format (SKILL.md)

```yaml
---
name: hello-extended
description: Extended greeting capabilities
version: 1.0.0
toolsets:
  - "toolsets/index:HelloToolset"     # path:Class format
triggers:
  keywords: ["hello", "greet", "greeting"]
  verbs: ["say", "wave"]
  patterns: ["greet\\s+\\w+"]
default_enabled: true                  # For bundled skills
---

# Hello Extended Skill

Instructions for using this skill...
```

### Manifest Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Skill identifier (alphanumeric, hyphens, max 64 chars) |
| `description` | Yes | Brief description (max 500 chars) |
| `version` | No | Semantic version (e.g., "1.0.0") |
| `toolsets` | No | TypeScript toolset classes ("path:Class" format) |
| `scripts` | No | Script list (parsed but not executed in MVP) |
| `triggers.keywords` | No | Direct keyword matches (word boundary) |
| `triggers.verbs` | No | Action verbs (word boundary) |
| `triggers.patterns` | No | Regex patterns |
| `default_enabled` | No | For bundled skills (default: true) |
| `brief_description` | No | Auto-generated from first sentence if omitted |

### Progressive Disclosure

```
┌─────────────────────────────────────────────────────────────────┐
│                    Four-Tier Disclosure                          │
│                                                                  │
│  Tier 0: Nothing                                                │
│  └── When: No skills loaded or no match                         │
│                                                                  │
│  Tier 1: Breadcrumb (~10 tokens)                                │
│  ├── When: Skills exist with triggers but don't match query     │
│  └── Shows: "[N skills available]"                              │
│                                                                  │
│  Tier 2: Registry (~15 tokens/skill)                            │
│  ├── When: User asks "what can you do?" / "list skills"         │
│  │   OR skills have no triggers defined                         │
│  └── Shows: Skill names + brief descriptions                    │
│                                                                  │
│  Tier 3: Full Documentation (hundreds of tokens)                │
│  ├── When: Triggers match user query                            │
│  └── Shows: Complete skill instructions from SKILL.md           │
└─────────────────────────────────────────────────────────────────┘
```

### Trigger Matching Flow

```
User Query
    │
    ▼
┌─────────────────────────────┐
│  Match against all skills:  │
│  • Keywords (exact match)   │
│  • Verbs (action words)     │
│  • Patterns (regex)         │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│  Rank matches by:           │
│  1. Explicit mention        │
│  2. Exact phrase match      │
│  3. Recent usage            │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│  Inject top N skills        │
│  (max_skills default: 3)    │
└─────────────────────────────┘
```

### Skill Sources

| Source | Location | Lifecycle |
|--------|----------|-----------|
| Bundled | `src/_bundled_skills/` | Shipped with agent |
| User plugins | `~/<config-dir>/skills/` | Installed by user |
| Project | `./<config-dir>/skills/` | Project-specific |

### Script Execution (Post-MVP)

Scripts will run as isolated Bun subprocesses with safety limits:
- Process isolation via `Bun.spawn()` (not true sandboxing)
- Timeout enforcement: 60s default, configurable
- Output size limits: 1MB default
- Argument validation: max 100 args, 4096 bytes total
- Working directory: restricted to skill directory
- Returns structured `ToolResponse` format via JSON

**Note:** Script execution is deferred to post-MVP. Toolsets provide the primary extensibility mechanism.

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
│   ├── manifest.ts           # Zod schemas, YAML parsing
│   ├── loader.ts             # Discovery, dynamic import
│   ├── registry.ts           # Persistent metadata
│   └── context-provider.ts   # Progressive disclosure
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
2. Register factory in `PROVIDER_FACTORIES` by config name
3. Add config schema section for provider-specific options
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

1. Create `SKILL.md` manifest (YAML frontmatter + instructions)
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
