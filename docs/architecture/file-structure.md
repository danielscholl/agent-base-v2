# File Structure

This document describes the source code organization of the TypeScript agent framework.

---

## Directory Layout

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
│   ├── llm.ts                # LLMClient orchestrator
│   ├── types.ts              # ModelResponse, ModelErrorCode
│   ├── base.ts               # Response helpers, error mapping
│   ├── registry.ts           # Provider registry
│   ├── retry.ts              # Exponential backoff
│   ├── index.ts              # Public exports
│   └── providers/            # Provider-specific implementations
│       ├── openai.ts
│       ├── anthropic.ts
│       ├── azure-openai.ts
│       ├── gemini.ts
│       ├── github.ts
│       ├── local.ts
│       └── foundry.ts
│
├── tools/
│   ├── tool.ts               # Tool namespace, Tool.define()
│   ├── registry.ts           # ToolRegistry
│   ├── base.ts               # Legacy createTool() factory
│   ├── types.ts              # Legacy ToolResponse types
│   ├── index.ts              # Public exports + auto-registration
│   ├── workspace.ts          # Workspace root detection
│   ├── hello.ts              # Reference implementation
│   ├── read.ts               # File reading
│   ├── write.ts              # File writing
│   ├── edit.ts               # File editing
│   ├── glob.ts               # Pattern matching
│   ├── grep.ts               # Content searching
│   ├── list.ts               # Directory listing
│   ├── bash.ts               # Shell execution
│   ├── task.ts               # Subagent spawning
│   ├── todo.ts               # Task tracking
│   └── webfetch.ts           # URL fetching
│
├── config/
│   ├── schema.ts             # Zod schemas, AppConfig
│   ├── manager.ts            # Load/save/merge logic
│   ├── constants.ts          # Default values
│   └── providers/            # Setup wizards (Phase 5)
│       └── github.ts         # GitHub CLI integration
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
├── prompts/
│   └── system.md             # Default system prompt
│
├── _bundled_skills/          # Shipped with agent
│   └── .gitkeep
│
└── errors/
    └── index.ts              # AgentError hierarchy
```

---

## Test Organization

Tests are co-located with source files:

```
src/
├── agent/
│   ├── agent.ts
│   └── __tests__/
│       └── agent.test.ts
├── tools/
│   ├── read.ts
│   └── __tests__/
│       └── read.test.ts
```

**Shared resources:**
- `tests/integration/` - Integration tests
- `tests/fixtures/` - Shared test utilities

---

## Config Files

```
project-root/
├── package.json              # Dependencies, scripts
├── tsconfig.json             # TypeScript config
├── eslint.config.mjs         # ESLint flat config
├── jest.config.mjs           # Jest configuration
├── .prettierrc               # Prettier config
├── CLAUDE.md                 # AI assistant rules
└── docs/                     # Documentation
    ├── architecture/         # Architecture docs
    ├── guides/               # Implementation guides
    ├── decisions/            # ADRs
    ├── plans/                # Feature plans
    └── specs/                # Feature specifications
```

---

## User Config Directories

```
~/.agent/
├── settings.json             # User configuration
├── sessions/                 # Persisted sessions
├── context/                  # Tool output cache
└── skills/                   # User plugins

./.agent/
├── settings.json             # Project configuration
└── skills/                   # Project-specific skills
```

---

## Key Entry Points

| File | Purpose |
|------|---------|
| `src/index.tsx` | CLI entry point |
| `src/agent/agent.ts` | Agent orchestrator |
| `src/model/llm.ts` | LLM client |
| `src/tools/registry.ts` | Tool management |
| `src/config/manager.ts` | Config loading |

---

## Module Boundaries

```
Public API (index.ts exports)
│
├── src/agent/index.ts        # Agent, AgentCallbacks
├── src/model/index.ts        # LLMClient, ModelResponse
├── src/tools/index.ts        # Tool, ToolRegistry
├── src/config/index.ts       # ConfigManager, AppConfig
└── src/telemetry/index.ts    # TelemetryHelpers
```

**Rule:** External code should only import from `index.ts` files.

---

## Related Documentation

- [Extension Points](./extension-points.md) - How to extend
- [Coding Styles](./styles.md) - Conventions
