# Agent Framework Architecture

> **Status:** Current
> This document has been refactored into a comprehensive multi-file architecture documentation. See the [architecture/](./architecture/) directory for detailed documentation.

---

## Quick Navigation

### Core Architecture

| Document | Description |
|----------|-------------|
| [System Layers](./architecture/layers.md) | Layer diagram and responsibilities |
| [Core Interfaces](./architecture/core-interfaces.md) | Callbacks, Tool Response, Model Response contracts |
| [Tools](./architecture/tools.md) | Tool system architecture and patterns |
| [Providers](./architecture/providers.md) | Multi-provider LLM abstraction deep dive |

### System Components

| Document | Description |
|----------|-------------|
| [Configuration](./architecture/configuration.md) | Config loading, validation, and hierarchy |
| [Error Handling](./architecture/error-handling.md) | Error types, retry strategy, graceful degradation |
| [Permissions](./architecture/permissions.md) | Permission model and scopes |
| [Sessions](./architecture/sessions.md) | Session lifecycle and persistence |
| [Context Storage](./architecture/context-storage.md) | Tool output storage strategy |
| [Skills](./architecture/skills.md) | Skill manifests and progressive disclosure |
| [Telemetry](./architecture/telemetry.md) | OpenTelemetry integration |

### Reference

| Document | Description |
|----------|-------------|
| [File Structure](./architecture/file-structure.md) | Source code organization |
| [Extension Points](./architecture/extension-points.md) | How to extend the framework |
| [Coding Styles](./architecture/styles.md) | Patterns and conventions |

---

## System Overview

See [System Layers](./architecture/layers.md) for the detailed layer diagram and component responsibilities.

**Layer Summary:**

```
User → CLI Layer (React/Ink) → Agent Layer → Tools Layer + Model Layer → Utils Layer
```

| Layer | Responsibility |
|-------|----------------|
| CLI | Terminal UI, React state, user input |
| Agent | Orchestration, LLM→Tool→Response loop |
| Tools | Zod validation, Tool.Result output |
| Model | Provider routing, streaming, retry |
| Utils | Config, context, sessions, memory |

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

---

## Related Documentation

- **Governance:** [CLAUDE.md](../CLAUDE.md) - Implementation rules
- **Guides:** [guides/](./guides/) - Code patterns and examples
- **Decisions:** [decisions/](./decisions/) - Architecture decision records
- **Plans:** [plans/](./plans/) - Feature implementation plans
