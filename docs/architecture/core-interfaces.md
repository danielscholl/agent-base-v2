# Core Interfaces

This document describes the key interfaces and contracts used throughout the agent framework.

---

## Interface Map

| Interface | Layer | Purpose |
|-----------|-------|---------|
| `AgentCallbacks` | Agent→CLI | Lifecycle events (LLM, tools, agent) with SpanContext |
| `Tool.Result<M>` | Tools | Structured tool execution result |
| `Tool.Context<M>` | Tools | Execution context with session info and abort |
| `ModelResponse<T>` | Model | Structured success/error return (never throw) |
| `ModelFactory` | Model | Creates LangChain model from config |
| `AppConfig` | Utils | Root configuration type (Zod-inferred) |
| `TelemetryHelpers` | Telemetry | Span creation with GenAI conventions |

---

## AgentCallbacks Interface

The callback system enables the Agent layer to communicate with the CLI layer without tight coupling.

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

### Interface Definition

```typescript
interface AgentCallbacks {
  // Agent lifecycle
  onAgentStart?(ctx: SpanContext, query: string): void;
  onAgentEnd?(ctx: SpanContext, answer: string): void;

  // LLM lifecycle
  onLLMStart?(ctx: SpanContext, model: string, messages: Message[]): void;
  onLLMStream?(ctx: SpanContext, chunk: string): void;
  onLLMEnd?(ctx: SpanContext, response: string, usage: TokenUsage): void;

  // Tool lifecycle
  onToolStart?(ctx: SpanContext, toolName: string, args: unknown): void;
  onToolEnd?(ctx: SpanContext, toolName: string, result: Tool.Result): void;

  // Permission requests
  onPermissionRequest?(request: PermissionRequest): Promise<boolean>;

  // Debug output
  onDebug?(message: string, data?: Record<string, unknown>): void;
}
```

### Key Points

- All callbacks receive `SpanContext` for telemetry correlation
- All callbacks are optional (no-op if not provided)
- Callbacks are synchronous except `onPermissionRequest`
- The CLI layer implements callbacks to update UI state

---

## Tool Response Contract

Tools use a standardized response format that provides structure for both success and error cases.

### Tool.Result Type

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
  /** Optional tool call ID */
  callID?: string;
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

## Legacy ToolResponse Contract

The original `ToolResponse` type is still supported for backwards compatibility with `createTool()`.

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

When a tool cannot complete its task without LLM help:

```typescript
return errorResponse(
  'LLM_ASSIST_REQUIRED',
  'Content too large for processing. Requesting summarization.'
);
```

The Agent Layer interprets this and takes appropriate action.

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

## Permission Request Type

Used when tools need to request user permission:

```typescript
interface PermissionRequest {
  scope: PermissionScope;
  resource: string;
  action: string;
}

type PermissionScope = 'fs-read' | 'fs-write' | 'fs-delete' | 'shell-run';
```

---

## Related Documentation

- [System Layers](./layers.md) - Layer responsibilities
- [Tools Architecture](./tools.md) - Tool patterns
- [Error Handling](./error-handling.md) - Error strategies
