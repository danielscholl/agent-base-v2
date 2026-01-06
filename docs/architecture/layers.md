# System Layers

> **Status:** Current
> **Source of truth:** Actual source directory structure in `src/`

This document describes the layered architecture of the TypeScript agent framework.

---

## Layer Diagram

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
│  • Tool.Result output │       │  • Streaming support            │
│  • Permission checks  │       │  • Retry with backoff           │
│  • No LLM calls       │       │  • ModelResponse union          │
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

## Layer Descriptions

### CLI Layer

**Location:** `src/components/`, `src/cli.tsx`, `src/index.tsx`

The CLI layer handles all user interaction through React/Ink terminal components.

**Responsibilities:**
- Render terminal UI (prompts, spinners, answer display)
- Handle keyboard input and command parsing
- Manage React component state
- Route slash commands (`/help`, `/telemetry`, `/session`)
- Subscribe to agent callbacks for UI updates

**Key Patterns:**
- Uses React hooks for state management
- Receives `AgentCallbacks` interface for event-driven updates
- Never imports agent internals or calls LLM directly

**Key Files:**
- `src/cli.tsx` - Main CLI component
- `src/components/` - Reusable UI components

---

### Agent Layer

**Location:** `src/agent/`

The Agent layer orchestrates the core agentic loop: query → LLM → tool → response.

**Responsibilities:**
- Execute the main agent loop
- Assemble message history for LLM context
- Bind and execute tools via LangChain
- Emit callbacks to UI layer
- Manage telemetry spans
- Handle tool result processing

**Key Patterns:**
- Dependency injection for all external dependencies
- Only layer that invokes the Model Layer
- Emits typed callbacks for all lifecycle events
- Uses `SpanContext` for telemetry correlation

**Key Files:**
- `src/agent/agent.ts` - Core Agent class
- `src/agent/callbacks.ts` - AgentCallbacks interface
- `src/agent/prompts.ts` - System prompt loading
- `src/agent/types.ts` - Message and option types

**Critical Rule:** Only the Agent Layer may invoke the Model Layer. Tools must never call LLMs directly.

---

### Tools Layer

**Location:** `src/tools/`

The Tools layer provides LLM-callable functions with validated inputs and structured outputs.

**Responsibilities:**
- Define tool schemas with Zod
- Validate input parameters
- Execute tool logic
- Return structured `Tool.Result` responses
- Request permissions for side effects
- Stream metadata updates during execution

**Key Patterns:**
- `Tool.define()` factory for creating tools
- `Tool.Result` for standardized responses (never throw)
- `Tool.Context` for session info and abort handling
- Zod schemas with `.describe()` for parameter docs

**Key Files:**
- `src/tools/tool.ts` - Tool namespace and `Tool.define()`
- `src/tools/registry.ts` - ToolRegistry for management
- `src/tools/types.ts` - ToolErrorCode and types
- Individual tool files (read.ts, write.ts, bash.ts, etc.)

See [Tools Architecture](./tools.md) for details.

---

### Model Layer

**Location:** `src/model/`

The Model layer provides a unified interface to multiple LLM providers.

**Responsibilities:**
- Route to correct provider based on configuration
- Create and cache LangChain chat clients
- Handle streaming responses with callback semantics
- Implement retry with exponential backoff
- Extract token usage across provider formats
- Return structured `ModelResponse` (never throw)
- Auto-detect API variants (e.g., Azure Chat Completions vs Responses API)

**Key Patterns:**
- Provider registry with factory functions
- Lazy client initialization with caching
- `ModelResponse<T>` discriminated union for results
- Retry-aware error classification
- Dual API support for reasoning models (Azure Responses API)
- Provider-aware model name resolution

**Key Files:**
- `src/model/llm.ts` - LLMClient orchestrator
- `src/model/registry.ts` - Provider registry
- `src/model/retry.ts` - Exponential backoff logic
- `src/model/base.ts` - Response factories, error mapping, token extraction
- `src/model/types.ts` - ModelResponse, ModelErrorCode, callbacks
- `src/model/providers/` - Provider-specific factories (7 providers)

See [Providers Architecture](./providers.md) for details.

---

### Utils Layer

**Location:** `src/utils/`, `src/config/`

The Utils layer provides shared infrastructure services.

**Responsibilities:**
- Load, validate, and merge configuration
- Manage message history
- Handle session persistence
- Provide environment helpers
 - Context storage (planned; ContextManager exists but is not wired into agent loop)

**Key Files:**
- `src/config/schema.ts` - Zod schemas for configuration
- `src/config/manager.ts` - Config loading and merging
- `src/utils/context.ts` - Context storage
- `src/utils/message-history.ts` - Conversation memory
- `src/utils/session.ts` - Session persistence

See [Configuration Architecture](./configuration.md) for details.

---

### Telemetry Layer

**Location:** `src/telemetry/`

The Telemetry layer provides observability through OpenTelemetry.

**Responsibilities:**
- Initialize OpenTelemetry SDK
- Create spans with GenAI semantic conventions
- Export traces via OTLP
- Integrate with callbacks for automatic instrumentation

**Key Patterns:**
- Cross-cutting concern (touches all layers)
- Opt-in activation (no-op when disabled)
- GenAI semantic conventions for LLM operations
- SpanContext passed through callbacks

**Key Files:**
- `src/telemetry/setup.ts` - OTel initialization
- `src/telemetry/spans.ts` - GenAI span helpers
- `src/telemetry/types.ts` - TelemetryHelpers interface

See [Telemetry Architecture](./telemetry.md) for details.

---

## Layer Dependencies

```
CLI Layer
    ↓ depends on
Agent Layer
    ↓ depends on
Tools Layer, Model Layer
    ↓ depend on
Utils Layer

Telemetry Layer (cross-cutting, used by all)
```

**Dependency Rules:**
- Layers may only depend on layers below them
- CLI never imports Agent internals
- Tools never call Model Layer directly
- All layers may use Utils
- Telemetry integrates via callbacks, not direct imports

---

## Inter-Layer Communication

### CLI ↔ Agent

Communication via **typed callbacks**:

```typescript
interface AgentCallbacks {
  onAgentStart?(ctx: SpanContext, query: string): void;
  onLLMStart?(ctx: SpanContext, model: string, messages: Message[]): void;
  onLLMStream?(ctx: SpanContext, chunk: string): void;
  onLLMEnd?(ctx: SpanContext, response: string, usage: TokenUsage): void;
  onToolStart?(ctx: SpanContext, toolName: string, args: unknown): void;
  onToolEnd?(ctx: SpanContext, toolName: string, result: ToolResponse, executionResult?: ToolExecutionResult): void;
  onAgentEnd?(ctx: SpanContext, answer: string): void;
}
```

### Agent ↔ Tools

Communication via **LangChain tool binding** (ToolRegistry is default):

- Agent binds tools to LLM via `bindTools()`
- LLM generates tool calls in responses
- Agent executes tools via `ToolRegistry.execute()` (default) or direct invocation (legacy)
- Tools return `Tool.Result` with metadata; errors set `metadata.error` (return-not-throw pattern)
- `onToolEnd` receives optional `executionResult` with full metadata including error detection

### Agent ↔ Model

Communication via **LLMClient API**:

```typescript
const client = new LLMClient({ config, callbacks });
const result = await client.invoke(messages);
// or
const stream = await client.stream(messages);
```

---

## Related Documentation

- [Core Interfaces](./core-interfaces.md) - Callback and response contracts
- [Tools Architecture](./tools.md) - Tool system details
- [Providers Architecture](./providers.md) - LLM provider details
