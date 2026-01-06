# Core Interfaces

> **Status:** Current
> **Source of truth:** [`src/agent/callbacks.ts`](../../src/agent/callbacks.ts), [`src/tools/tool.ts`](../../src/tools/tool.ts), [`src/model/types.ts`](../../src/model/types.ts)

This document describes the key interfaces and contracts used throughout the agent framework.

---

## Interface Map

| Interface | Layer | Purpose |
|-----------|-------|---------|
| `AgentCallbacks` | Agent->CLI | Lifecycle events (LLM, tools, agent) with SpanContext |
| `Tool.Result<M>` | Tools | Structured tool execution result |
| `Tool.Context<M>` | Tools | Execution context with session info and abort |
| `ToolResponse<T>` | Tools | Legacy success/error union (backward compat) |
| `ModelResponse<T>` | Model | Structured success/error return (never throw) |
| `ProviderFactory` | Model | Creates LangChain model from provider config |
| `AppConfig` | Utils | Root configuration type (Zod-inferred) |
| `TelemetryHelpers` | Telemetry | Access to OTel tracer/meter instances |

---

## AgentCallbacks Interface

The callback system enables the Agent layer to communicate with the CLI layer without tight coupling.

### Callback Flow

```
Agent.run(query)
    |
    +-> onAgentStart(ctx, query)
    |
    +-> onSpinnerStart(message)
    |
    +-> onLLMStart(ctx, model, messages)
    |       |
    |       +-> onLLMStream(ctx, chunk)  [if streaming]
    |       |
    |       +-> onLLMEnd(ctx, response, usage)
    |
    +-> onToolStart(ctx, toolName, args)
    |       |
    |       +-> onToolEnd(ctx, toolName, result, executionResult?)
    |
    +-> onSpinnerStop()
    |
    +-> onAgentEnd(ctx, answer)
    |
    +-> onError(ctx, error)  [on failure]
```

### Interface Definition

```typescript
interface AgentCallbacks {
  // ─── Agent Lifecycle ─────────────────────────────────────────────────
  /** Called when agent starts processing a query */
  onAgentStart?(ctx: SpanContext, query: string): void;
  /** Called when agent finishes with final answer */
  onAgentEnd?(ctx: SpanContext, answer: string): void;

  // ─── LLM Interaction ─────────────────────────────────────────────────
  /** Called before LLM invocation */
  onLLMStart?(ctx: SpanContext, model: string, messages: Message[]): void;
  /** Called for each streamed chunk */
  onLLMStream?(ctx: SpanContext, chunk: string): void;
  /** Called after LLM invocation completes */
  onLLMEnd?(ctx: SpanContext, response: string, usage?: TokenUsage): void;

  // ─── Tool Execution ──────────────────────────────────────────────────
  /** Called before tool execution */
  onToolStart?(ctx: SpanContext, toolName: string, args: Record<string, unknown>): void;
  /** Called after tool execution (executionResult includes metadata.error detection) */
  onToolEnd?(ctx: SpanContext, toolName: string, result: ToolResponse, executionResult?: ToolExecutionResult): void;

  // ─── UI Feedback ─────────────────────────────────────────────────────
  /** Called to show loading indicator */
  onSpinnerStart?(message: string): void;
  /** Called to hide loading indicator */
  onSpinnerStop?(): void;
  /** Called with streaming answer generator (for CLI shell integration) */
  onAnswerStream?(stream: AsyncGenerator<string>): void;

  // ─── Error Handling ────────────────────────────────────────────────────
  /** Called when an error occurs during agent execution */
  onError?(ctx: SpanContext, error: AgentErrorResponse): void;

  // ─── Debug/Logging ───────────────────────────────────────────────────
  /** Debug-level logging */
  onDebug?(message: string, data?: unknown): void;
  /** Trace-level logging (verbose) */
  onTrace?(message: string, data?: unknown): void;
}
```

### Key Points

- All callbacks receive `SpanContext` for telemetry correlation (except UI feedback)
- All callbacks are optional (no-op if not provided)
- Callbacks are synchronous
- The CLI layer implements callbacks to update UI state
- `onToolEnd` receives the legacy `ToolResponse` (converted from `Tool.Result`) plus optional `ToolExecutionResult` with full metadata including error detection

---

## Tool Response Types

The framework uses two response patterns: the modern `Tool.Result` pattern and the legacy `ToolResponse` union.

### Tool.Result Type (Modern Pattern)

```typescript
interface Tool.Result<M extends Tool.Metadata = Tool.Metadata> {
  /** Short title describing what was done */
  title: string;
  /** Tool-specific metadata */
  metadata: M;
  /** Text output (consumed by LLM) */
  output: string;
  /** Optional binary attachments */
  attachments?: Attachment[];
}
```

### Tool.Context Type

```typescript
interface Tool.Context<M extends Tool.Metadata = Tool.Metadata> {
  /** Session ID for the current conversation */
  sessionID: string;
  /** Message ID for the current turn */
  messageID: string;
  /** Agent name executing the tool */
  agent: string;
  /** Abort signal for cancellation support */
  abort: AbortSignal;
  /** Optional tool call ID (for parallel execution tracking) */
  callID?: string;
  /** Extra context data passed from agent */
  extra?: Record<string, unknown>;
  /** Stream metadata updates during execution */
  metadata(input: { title?: string; metadata?: Partial<M> }): void;
}
```

### Design Principles

- **Never throw at boundaries**: Tools return `Tool.Result`, never throw exceptions
- **Structured metadata**: Each tool defines its own metadata type extending `Tool.Metadata`
- **Streaming updates**: Use `ctx.metadata()` for progress during long operations
- **Abort support**: Check `ctx.abort.aborted` for cancellation

### Usage Example

```typescript
const readTool = Tool.define<ReadSchema, ReadMetadata>('read', {
  description: 'Read file contents',
  parameters: z.object({ path: z.string() }),
  execute: async (args, ctx) => {
    // Stream progress
    ctx.metadata({ title: `Reading ${args.path}...` });

    const content = await fs.readFile(args.path, 'utf-8');

    return {
      title: `Read ${args.path}`,
      metadata: { path: args.path, bytes: content.length },
      output: content,
    };
  },
});
```

---

## Legacy ToolResponse Contract

The original `ToolResponse` type is still used in callbacks for backward compatibility.

### ToolResponse Type

```typescript
type ToolErrorCode =
  | 'VALIDATION_ERROR'
  | 'IO_ERROR'
  | 'CONFIG_ERROR'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'LLM_ASSIST_REQUIRED'
  | 'TIMEOUT'
  | 'UNKNOWN';

interface SuccessResponse<T = unknown> {
  success: true;
  result: T;
  message: string;
}

interface ErrorResponse {
  success: false;
  error: ToolErrorCode;
  message: string;
}

type ToolResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;
```

### Special Error Code: LLM_ASSIST_REQUIRED

When a tool cannot complete its task without LLM help, it should return a `Tool.Result` with `metadata.error` set:

```typescript
return {
  title: 'LLM Assistance Required',
  metadata: { error: 'LLM_ASSIST_REQUIRED' },
  output: JSON.stringify({
    action: 'LLM_ASSIST_REQUIRED',
    prompt: 'Summarize this content...',
    message: 'Content too large for processing',
  }),
};
```

The Agent Layer detects `metadata.error === 'LLM_ASSIST_REQUIRED'` and takes appropriate action.

**Note:** The legacy `ToolResponse` with `error: 'LLM_ASSIST_REQUIRED'` is still recognized in callbacks for backward compatibility, but new tools should use the `Tool.Result` pattern above.

---

## Model Response Contract

The Model layer uses a discriminated union for results, enabling type-safe error handling.

### ModelResponse Type

```typescript
type ModelResponse<T> = ModelSuccessResponse<T> | ModelErrorResponse;

interface ModelSuccessResponse<T> {
  success: true;
  result: T;
  message: string;
}

interface ModelErrorResponse {
  success: false;
  error: ModelErrorCode;
  message: string;
  retryAfterMs?: number;  // Provider-specified retry delay
}
```

### ModelErrorCode Types

```typescript
type ModelErrorCode =
  | 'PROVIDER_NOT_CONFIGURED'    // Config missing/invalid
  | 'PROVIDER_NOT_SUPPORTED'     // Unknown provider name
  | 'AUTHENTICATION_ERROR'       // Invalid API key
  | 'RATE_LIMITED'               // Rate limit exceeded (RETRYABLE)
  | 'MODEL_NOT_FOUND'            // Invalid model name
  | 'CONTEXT_LENGTH_EXCEEDED'    // Prompt too long
  | 'NETWORK_ERROR'              // Connection issues (RETRYABLE)
  | 'TIMEOUT'                    // Request timeout (RETRYABLE)
  | 'INVALID_RESPONSE'           // Malformed API response
  | 'UNKNOWN';                   // Unexpected errors
```

### Retryable vs Non-Retryable

| Category | Error Codes | Action |
|----------|-------------|--------|
| **Retryable** | `RATE_LIMITED`, `NETWORK_ERROR`, `TIMEOUT` | Retry with backoff |
| **Non-Retryable** | All others | Fail immediately |

### Type Guards

```typescript
// Check if response succeeded
function isModelSuccess<T>(response: ModelResponse<T>): response is ModelSuccessResponse<T>;

// Check if response is an error
function isModelError(response: ModelResponse<T>): response is ModelErrorResponse;
```

### Usage Example

```typescript
const result = await client.invoke(messages);

if (result.success) {
  console.log(result.result.content);
  console.log(result.result.usage);
} else {
  console.error(`Error: ${result.error} - ${result.message}`);
  if (result.retryAfterMs) {
    // Provider specified retry delay
    await delay(result.retryAfterMs);
  }
}
```

---

## Token Usage Type

Standardized token usage across providers:

```typescript
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}
```

The Model layer normalizes provider-specific formats:
- **OpenAI**: `{ usage: { prompt_tokens, completion_tokens, total_tokens } }`
- **Anthropic**: `{ usage: { input_tokens, output_tokens } }` (calculates total)
- **Others**: Various formats normalized to `TokenUsage`

---

## SpanContext Type

Used for telemetry correlation across callbacks:

```typescript
interface SpanContext {
  traceId: string;     // 128-bit trace ID (hex)
  spanId: string;      // 64-bit span ID (hex)
  parentSpanId?: string;  // Parent span for nested operations
}
```

---

## Related Documentation

- [System Layers](./layers.md) - Layer responsibilities
- [Tools Architecture](./tools.md) - Tool patterns
- [Error Handling](./error-handling.md) - Error strategies
