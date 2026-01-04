# File Structure

> **Status:** Current
> **Source of truth:** Actual directory contents in `src/`

This document describes the source code organization of the TypeScript agent framework.

---

## Directory Layout

```
src/
├── index.tsx                 # Entry point, CLI bootstrap
│
├── cli/                      # CLI layer
│   ├── index.ts              # CLI exports
│   ├── types.ts              # CLI types
│   ├── callbacks.ts          # Callback implementations
│   ├── cli-context.ts        # CLI context management
│   ├── constants.ts          # CLI constants
│   ├── version.ts            # Version info
│   ├── input/                # Input handling
│   └── commands/             # Slash command handlers
│       ├── index.ts          # Command registry
│       ├── types.ts          # CommandHandler, CommandResult
│       ├── help.ts           # /help command
│       ├── config.ts         # /config command
│       ├── session.ts        # /session command
│       ├── skills.ts         # /skills command
│       ├── telemetry.ts      # /telemetry command
│       ├── shell.ts          # Shell command handler
│       ├── clear.ts          # /clear command
│       └── exit.ts           # /exit command
│
├── runtime/                  # Runtime components
│   └── ...                   # Agent runtime
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
│   ├── task.ts               # Subagent spawning
│   ├── todo.ts               # Task tracking (todowrite, todoread)
│   └── webfetch.ts           # URL fetching
│
├── config/
│   ├── schema.ts             # Zod schemas, AppConfig
│   ├── manager.ts            # Load/save/merge logic
│   ├── constants.ts          # Default values
│   └── providers/            # Setup wizards
│       └── github.ts         # GitHub CLI integration
│
├── telemetry/
│   ├── setup.ts              # OTel initialization
│   ├── types.ts              # TelemetryHelpers interface
│   ├── spans.ts              # GenAI span helpers
│   └── aspire.ts             # Docker dashboard commands
│
├── utils/
│   ├── context.ts            # IContextManager implementation
│   ├── message-history.ts    # Conversation memory
│   ├── session.ts            # Session persistence
│   └── env.ts                # Environment helpers
│
├── skills/
│   ├── manifest.ts           # Zod schemas, YAML parsing
│   ├── loader.ts             # Discovery, dynamic import
│   ├── registry.ts           # Persistent metadata
│   ├── context-provider.ts   # Progressive disclosure (3-tier)
│   ├── prompt.ts             # XML generation for skills
│   └── types.ts              # DiscoveredSkill types
│
├── errors/
│   └── index.ts              # AgentErrorCode, AgentResponse
│
├── prompts/
│   └── system.md             # Default system prompt
│
└── _bundled_skills/          # Shipped with agent
    └── .gitkeep
```

---

## Test Organization

Tests are co-located with source files:

```
src/
├── cli/
│   └── __tests__/
│       └── commands.test.ts
├── tools/
│   ├── read.ts
│   └── __tests__/
│       └── read.test.ts
├── config/
│   └── __tests__/
│       └── schema.test.ts
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
├── config.yaml             # User configuration
├── sessions/                 # Persisted sessions
├── context/                  # Tool output cache
└── skills/                   # User plugins

./.agent/
├── config.yaml             # Project configuration
└── skills/                   # Project-specific skills
```

---

## Key Entry Points

| File | Purpose |
|------|---------|
| `src/index.tsx` | CLI entry point |
| `src/runtime/` | Agent runtime |
| `src/tools/registry.ts` | Tool management |
| `src/config/manager.ts` | Config loading |
| `src/cli/commands/index.ts` | Command registry |

---

## Module Boundaries

```
Public API (index.ts exports)
│
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
