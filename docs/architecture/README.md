# Agent Framework Architecture

> **Status:** Current
> Architecture documentation for the TypeScript agent framework (execution model, layering, contracts, and extension points).

---

## Start here (pick your path)

- **Understand the system quickly** → [System Layers](./layers.md) → [Core Interfaces](./core-interfaces.md)
- **Add a tool** → [Tools](./tools.md) → [Permissions](./permissions.md) → [Tool Development Guide](../guides/tools.md)
- **Add or debug an LLM provider** → [Providers](./providers.md) → [Error Handling](./error-handling.md) → [Telemetry](./telemetry.md)
- **Debug memory/session behavior** → [Sessions](./sessions.md) → [Configuration](./configuration.md)
- **Extend the framework** → [Extension Points](./extension-points.md) → [Coding Styles](./styles.md)

---

## System at a glance

### Execution flow

```
User
  ↓
CLI (React/Ink)
  ↓ callbacks
Agent (orchestrates loop, assembles response)
  ↓              ↓
Model            Tools
(LLM calls)      (validated execution)
  ↓              ↓
  └──────────────┘
         ↓
CLI displays answer
```

**Callbacks:**
- Agent → CLI: streaming updates, lifecycle events
- Model → Agent: tokens, tool calls

### Layer summary

See [System Layers](./layers.md) for the detailed diagram and responsibilities.

| Layer | Responsibility |
|-------|----------------|
| CLI (React/Ink) | Terminal UI, state, user input, command routing |
| Agent | Orchestration: Query→LLM→Tool→Response loop, callbacks |
| Tools | Zod validation, `Tool.Result` outputs, permissions |
| Model | Provider routing, streaming callbacks, retry/backoff |
| Utils | Config, sessions, message history, context storage (planned) |

---

## Documentation map

### Core architecture (recommended reading order)

| [System Layers](./layers.md) | **Start here** - layer diagram and responsibilities |
|----------|-------------|
| [System Layers](./layers.md) | **Start here** — layer diagram and responsibilities |
| [Core Interfaces](./core-interfaces.md) | Callbacks, `Tool.Result`, `ModelResponse` contracts |
| [Tools](./tools.md) | Tool system architecture and patterns |
| [Providers](./providers.md) | Multi-provider LLM abstraction deep dive |

### System components

| Document | Description |
|----------|-------------|
| [Configuration](./configuration.md) | Loading, validation, and hierarchy |
| [Error Handling](./error-handling.md) | Error types, retries, graceful degradation |
| [Permissions](./permissions.md) | Permission model and scopes |
| [Sessions](./sessions.md) | Session lifecycle and persistence |
| [Context Storage](./context-storage.md) | Tool output storage strategy (Planned) |
| [Skills](./skills.md) | Skill manifests and progressive disclosure |
| [Telemetry](./telemetry.md) | OpenTelemetry integration |

### Reference

| Document | Description |
|----------|-------------|
| [File Structure](./file-structure.md) | Source code organization |
| [Extension Points](./extension-points.md) | How to extend the framework |
| [Coding Styles](./styles.md) | Patterns and conventions |

---

## Key design principles

| Principle | Summary |
|-----------|---------|
| **Dependency Injection** | All components receive deps via constructor |
| **Callbacks over Events** | Typed callbacks replace EventBus-style patterns |
| **Structured Results** | Tools return `Tool.Result` (avoid throwing for control flow) |
| **Validation at Boundaries** | Zod validates config + tool inputs |
| **Layer Isolation** | Only Agent calls Model; CLI never imports Agent internals |
| **Graceful Degradation** | Failures logged; agent continues where safe |

Full principles and rules: [CLAUDE.md](../../CLAUDE.md)

---

## LLM access rules (hard constraint)

**Only the Agent layer may invoke the Model layer.**

- Tools must **not** call LLMs directly
- If a tool needs LLM assistance, return a `Tool.Result` where output contains an `LLMAssistRequest`:
  ```typescript
  { action: 'LLM_ASSIST_REQUIRED', prompt: string, message: string, description?: string }
  ```
  See `src/agent/agent.ts` for the authoritative type definition.
- The Agent detects this in tool output and may fulfill, transform, or reject the request based on policy

**Why this matters:** Centralizing LLM access keeps cost tracking, observability, retry policies, and safety guardrails in one place. It also simplifies testing (mock one layer) and enables consistent rate limiting across all tool executions.

---

## Stability contract

| API / Contract | Stability | Notes |
|----------------|-----------|-------|
| `AgentCallbacks` interface | **Stable** | May add optional methods |
| `Tool.Result` response format | **Stable** | Core contract for tools |
| `ModelResponse` union | **Stable** | May add new error codes |
| Tool parameter schemas | **Stable** | Breaking changes versioned |
| Internal folder structure | Evolving | May reorganize `src/` |
| Provider factory signatures | Semi-stable | New providers may change patterns |

- **Stable** — Breaking changes require major version bump
- **Semi-stable** — May change in minor versions; migration guide provided
- **Evolving** — Internal detail; may change without notice

---

## Document status and source of truth

Each architecture document includes:

- **Status:** Current / Partial Implementation / Planned
- **Source of truth:** Links to the relevant `src/...` files (code wins over docs)

| Status | Meaning |
|--------|---------|
| **Current** | Accurately reflects implemented behavior |
| **Partial Implementation** | Some documented features not yet implemented |
| **Planned** | Describes future functionality not yet built |

---

## Key decisions (ADR summary)

Architecture Decision Records live in [`docs/decisions/`](../decisions/). Key decisions:

| ADR | Decision |
|-----|----------|
| [0001](../decisions/0001-skills-execution-model.md) | Skills use SKILL.md manifests; bundled in-process, plugins as subprocess |
| [0002](../decisions/0002-llm-integration-langchain.md) | LangChain.js for multi-provider LLM abstraction |
| [0003](../decisions/0003-runtime-bun.md) | Bun-only runtime for native TypeScript execution |
| [0004](../decisions/0004-validation-zod.md) | Zod 4.x for runtime validation and type inference |
| [0007](../decisions/0007-callbacks-over-eventbus.md) | Typed callbacks replace Python's EventBus pattern |

See the full list for decisions on testing (Jest), terminal UI (React/Ink), and more.

---

## Related documentation

- [Tool Development Guide](../guides/tools.md) — How to write tools
- [Testing Guide](../guides/testing.md) — Mock patterns and test strategies
- [Prompt Customization](../guides/prompts.md) — System prompt loading
- [Architecture Decisions](../decisions/) — All ADRs
