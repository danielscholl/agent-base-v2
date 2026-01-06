# Agent Framework Architecture

> **Status:** Current
> This directory contains comprehensive architecture documentation for the TypeScript agent framework.

---

## Documentation Map

### Core Architecture

| Document | Description |
|----------|-------------|
| [System Layers](./layers.md) | **Start here** - Layer diagram and responsibilities |
| [Core Interfaces](./core-interfaces.md) | Callbacks, Tool Response, Model Response contracts |
| [Tools](./tools.md) | Tool system architecture and patterns |
| [Providers](./providers.md) | Multi-provider LLM abstraction deep dive |

### System Components

| Document | Description |
|----------|-------------|
| [Configuration](./configuration.md) | Config loading, validation, and hierarchy |
| [Error Handling](./error-handling.md) | Error types, retry strategy, graceful degradation |
| [Permissions](./permissions.md) | Permission model and scopes |
| [Sessions](./sessions.md) | Session lifecycle and persistence |
| [Context Storage](./context-storage.md) | Tool output storage strategy |
| [Skills](./skills.md) | Skill manifests and progressive disclosure |
| [Telemetry](./telemetry.md) | OpenTelemetry integration |

### Reference

| Document | Description |
|----------|-------------|
| [File Structure](./file-structure.md) | Source code organization |
| [Extension Points](./extension-points.md) | How to extend the framework |
| [Coding Styles](./styles.md) | Patterns and conventions |

---

## Quick Reference: Layer Summary

See [System Layers](./layers.md) for the detailed diagram.

| Layer | Responsibility |
|-------|----------------|
| CLI (React/Ink) | Terminal UI, React state, user input, command routing |
| Agent | Orchestration, Query→LLM→Tool→Response loop, callbacks |
| Tools | Zod validation, Tool.Result output, permissions |
| Model | Provider routing (7 providers), streaming with callbacks, retry with backoff, dual API support |
| Utils | Configuration, session persistence, message history; context storage planned |

---

## Key Design Principles

| Principle | Summary |
|-----------|---------|
| **Dependency Injection** | All components receive deps via constructor |
| **Callbacks over Events** | Typed callbacks replace Python's EventBus |
| **Structured Responses** | Tools return `Tool.Result`, never throw |
| **Validation at Boundaries** | Zod validates config and tool input |
| **Layer Isolation** | Only Agent calls Model; CLI never imports Agent internals |
| **Graceful Degradation** | Failures logged, agent continues |

See [CLAUDE.md](../../CLAUDE.md) for the complete list of principles and rules.

---

## LLM Access Rules

**Critical:** Only the Agent Layer may invoke the Model Layer.

- Tools must NOT call LLMs directly
- If a tool needs LLM assistance, return `Tool.Result` with an error message describing what help is needed
- The Agent Layer interprets and acts on this

---

## Document Status Legend

Each architecture document includes a status banner:

| Status | Meaning |
|--------|---------|
| **Current** | Accurately reflects implemented behavior |
| **Partial Implementation** | Some features documented are not yet implemented |
| **Planned** | Describes future functionality not yet built |

Each document also includes a "Source of truth" callout linking to the actual source files.

---

## Related Documentation

- [Tool Development Guide](../guides/tools.md) - How to write tools
- [Testing Guide](../guides/testing.md) - Mock patterns and test strategies
- [Prompt Customization](../guides/prompts.md) - System prompt loading
- [Architecture Decisions](../decisions/) - ADRs for key decisions
