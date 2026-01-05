# File Structure

> **Status:** Current
> **Source of truth:** Actual directory contents in `src/`

This document describes the source code organization of the TypeScript agent framework. This is a **curated key modules** view, not an exhaustive listing.

---

## Directory Layout

```
src/
├── index.tsx                 # Entry point, CLI bootstrap
├── cli.tsx                   # Main CLI component (React/Ink)
│
├── agent/                    # Agent layer (orchestration)
│   ├── agent.ts              # Core Agent class
│   ├── callbacks.ts          # AgentCallbacks interface
│   ├── types.ts              # Message, AgentOptions
│   └── prompts.ts            # System prompt loading
│
├── model/                    # Model layer (LLM providers)
│   ├── llm.ts                # LLMClient orchestrator
│   ├── types.ts              # ModelResponse, ModelErrorCode
│   ├── base.ts               # Response helpers, error mapping
│   ├── registry.ts           # Provider registry
│   ├── retry.ts              # Exponential backoff
│   └── providers/            # Provider implementations
│       ├── openai.ts
│       ├── anthropic.ts
│       ├── azure-openai.ts
│       ├── gemini.ts
│       ├── github.ts
│       ├── local.ts
│       └── foundry.ts
│
├── cli/                      # CLI layer
│   ├── callbacks.ts          # Callback implementations
│   ├── cli-context.ts        # CLI context management
│   ├── constants.ts          # CLI constants
│   └── commands/             # Slash command handlers
│       ├── index.ts          # Command registry
│       ├── types.ts          # CommandHandler, CommandResult
│       ├── help.ts           # /help command
│       ├── config.ts         # /config command
│       ├── session.ts        # /session command
│       └── ...               # Other commands
│
├── components/               # React/Ink UI components
│   ├── InteractiveShell.tsx  # Interactive shell
│   ├── SinglePrompt.tsx      # Single prompt mode
│   ├── ToolsInfo.tsx         # Tools listing display
│   ├── HealthCheck.tsx       # Startup diagnostics
│   └── ...                   # Other components
│
├── tools/
│   ├── tool.ts               # Tool namespace, Tool.define()
│   ├── registry.ts           # ToolRegistry
│   ├── types.ts              # ToolErrorCode, ToolResponse types
│   ├── index.ts              # Public exports + auto-registration
│   ├── workspace.ts          # Workspace root detection
│   ├── read.ts               # File reading
│   ├── write.ts              # File writing
│   ├── edit.ts               # File editing
│   ├── glob.ts               # Pattern matching
│   ├── grep.ts               # Content searching
│   ├── list.ts               # Directory listing
│   ├── bash.ts               # Shell execution
│   ├── task.ts               # Subagent spawning (planned)
│   ├── todo.ts               # Task tracking (todowrite, todoread)
│   └── webfetch.ts           # URL fetching
│
├── config/
│   ├── schema.ts             # Zod schemas, AppConfig
│   ├── manager.ts            # Load/save/merge logic
│   ├── constants.ts          # Default values
│   └── providers/            # Setup wizards
│       ├── openai.ts
│       ├── anthropic.ts
│       ├── azure.ts
│       ├── foundry.ts
│       ├── gemini.ts
│       ├── github.ts
│       └── local.ts
│
├── telemetry/
│   ├── setup.ts              # OTel initialization
│   ├── types.ts              # TelemetryHelpers interface
│   ├── spans.ts              # GenAI span helpers
│   └── aspire.ts             # Docker dashboard commands
│
├── utils/
│   ├── context.ts            # Context storage manager (not yet wired to agent)
│   ├── message-history.ts    # Conversation memory
│   ├── model.ts              # Model selection helpers
│   ├── session.ts            # Session persistence
│   └── tokens.ts             # Token utilities
│
├── skills/
│   ├── manifest.ts           # Zod schemas, YAML parsing
│   ├── parser.ts             # SKILL.md parsing
│   ├── loader.ts             # Discovery and filtering
│   ├── context-provider.ts   # Progressive disclosure (3-tier)
│   ├── prompt.ts             # XML generation for skills
│   ├── installer.ts          # Plugin installation/update/remove
│   └── types.ts              # DiscoveredSkill types
│
├── errors/
│   └── index.ts              # AgentErrorCode, AgentResponse
│
├── prompts/
│   └── base.md               # Default system prompt
│
└── _bundled_skills/          # Shipped with agent
    ├── gh/
    └── glab/
```

---

## Test Organization

Tests are co-located with source files in `__tests__` directories:

```
src/
├── agent/
│   └── __tests__/
│       └── agent.test.ts
├── model/
│   └── __tests__/
│       └── providers.test.ts
├── cli/
│   └── commands/
│       └── __tests__/
│           └── handlers.test.ts
├── tools/
│   └── __tests__/
│       └── read.test.ts
├── config/
│   └── __tests__/
│       └── schema.test.ts
```

**Shared resources:**
- `tests/integration/` - Integration tests
- `tests/fixtures/` - Shared test utilities (mock responses, factories)

---

## Config Files

```
project-root/
├── package.json              # Dependencies, scripts
├── tsconfig.json             # TypeScript config
├── eslint.config.js          # ESLint flat config
├── jest.config.js            # Jest configuration
├── bun.lock                  # Bun lockfile
├── CLAUDE.md                 # AI assistant rules
└── docs/                     # Documentation
    ├── architecture/         # Architecture docs
    ├── guides/               # Implementation guides
    └── decisions/            # ADRs
```

---

## User Config Directories

```
~/.agent/
├── config.yaml             # User configuration
├── sessions/                 # Persisted sessions
├── context/                  # Tool output cache
├── skills/                   # User skills
└── plugins/                  # Installed plugin skills

./.agent/
├── config.yaml             # Project configuration
└── skills/                   # Project-specific skills
```

---

## Key Entry Points

| File | Purpose |
|------|---------|
| `src/index.tsx` | CLI entry point |
| `src/cli.tsx` | Main CLI component |
| `src/agent/agent.ts` | Core Agent class |
| `src/model/llm.ts` | LLMClient orchestrator |
| `src/tools/registry.ts` | Tool management |
| `src/config/manager.ts` | Config loading |
| `src/cli/commands/index.ts` | Command registry |

---

## Module Boundaries

```
Public API (index.ts exports)
│
├── src/agent/index.ts        # Agent, AgentCallbacks
├── src/model/index.ts        # LLMClient, ModelResponse
├── src/tools/index.ts        # Tool, ToolRegistry
├── src/config/index.ts       # ConfigManager, AppConfig
├── src/telemetry/index.ts    # TelemetryHelpers
├── src/cli/index.ts          # CLI exports
└── src/errors/index.ts       # AgentResponse, AgentErrorCode
```

**Rule:** External code should only import from `index.ts` files.

---

## Related Documentation

- [Extension Points](./extension-points.md) - How to extend
- [Coding Styles](./styles.md) - Conventions
