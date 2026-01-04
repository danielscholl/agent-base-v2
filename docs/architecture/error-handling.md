# Error Handling Architecture

> **Status:** Current
> **Source of truth:** [`src/errors/index.ts`](../../src/errors/index.ts), [`src/model/types.ts`](../../src/model/types.ts), [`src/tools/types.ts`](../../src/tools/types.ts)

This document describes the error handling patterns, retry strategies, and graceful degradation approach used throughout the framework.

---

## Overview

The framework follows a **structured response** pattern using discriminated unions:

- **Tools** return `Tool.Result` (always succeeds, errors in output field)
- **Model Layer** returns `ModelResponse<T>` discriminated union
- **Agent Layer** returns `AgentResponse<T>` discriminated union and emits errors via callbacks
- **CLI Layer** handles responses and displays user-friendly messages

**Key Principle:** Public boundaries use typed response objects, not thrown exceptions.

---

## Response Types

### AgentResponse (src/errors/index.ts)

```typescript
// Success case
interface AgentSuccessResponse<T> {
  success: true;
  result: T;
  message: string;
}

// Error case
interface AgentErrorResponse {
  success: false;
  error: AgentErrorCode;
  message: string;
  metadata?: ProviderErrorMetadata;
}

// Discriminated union
type AgentResponse<T> = AgentSuccessResponse<T> | AgentErrorResponse;
```

### ModelResponse (src/model/types.ts)

```typescript
interface ModelSuccessResponse<T> {
  success: true;
  result: T;
  message: string;
}

interface ModelErrorResponse {
  success: false;
  error: ModelErrorCode;
  message: string;
}

type ModelResponse<T> = ModelSuccessResponse<T> | ModelErrorResponse;
```

---

## Error Handling by Layer

### Tools Layer

**Strategy:** Return `Tool.Result` with error information in output field.

```typescript
execute: async (args, ctx) => {
  try {
    const result = await doOperation(args);
    return {
      title: 'Success',
      metadata: {},
      output: result,
    };
  } catch (error) {
    // Errors become part of the result, not thrown
    return {
      title: 'Error',
      metadata: { error: error.message },
      output: `Error: ${error.message}`,
    };
  }
}
```

### Model Layer

**Strategy:** Return `ModelResponse<T>` discriminated union.

```typescript
const result = await client.invoke(messages);

if (result.success) {
  console.log(result.result.content);
} else {
  // Handle typed error
  console.error(`${result.error}: ${result.message}`);
}
```

### Agent Layer

**Strategy:** Return `AgentResponse<T>` and emit errors via callbacks.

```typescript
// Agent.run() emits errors via callback
callbacks.onError?.(spanContext, {
  error: 'RATE_LIMITED',
  message: 'Rate limit exceeded',
  metadata: { provider: 'openai', retryAfter: 30 }
});

// Returns string result or error message
const answer = await agent.run(query);
```

### CLI Layer

**Strategy:** Handle responses, display user-friendly messages.

```typescript
const answer = await agent.run(query);
// Agent returns answer string or error message
// Errors are also emitted via onError callback for UI updates
```

---

## Error Flow Diagram

```
Tool Layer                    Agent Layer                   CLI Layer
──────────                    ───────────                   ─────────

try/catch internally          Returns AgentResponse         Subscribes to
       │                      Emits via callbacks           onError callback
       ▼                             │                           │
Return Tool.Result ─────────►  Handles tool results              │
  (never throw)                      │                           │
                                     ▼                           ▼
                              Emits onError callback ─────► Display error
                              Returns error message         Reset cleanly
```

---

## Error Codes

### AgentErrorCode (src/errors/index.ts)

| Code | Description | Source |
|------|-------------|--------|
| `PROVIDER_NOT_CONFIGURED` | Provider config missing | Model |
| `PROVIDER_NOT_SUPPORTED` | Unknown provider name | Model |
| `AUTHENTICATION_ERROR` | API key invalid | Model |
| `RATE_LIMITED` | Rate limit exceeded | Model/Tool |
| `MODEL_NOT_FOUND` | Model not available | Model |
| `CONTEXT_LENGTH_EXCEEDED` | Input too long | Model |
| `NETWORK_ERROR` | Connection failed | Model |
| `TIMEOUT` | Request timed out | Model/Tool |
| `INVALID_RESPONSE` | Malformed response | Model |
| `VALIDATION_ERROR` | Invalid parameters | Tool |
| `IO_ERROR` | File/network error | Tool |
| `CONFIG_ERROR` | Configuration issue | Tool |
| `PERMISSION_DENIED` | Access denied | Tool |
| `NOT_FOUND` | Resource not found | Tool |
| `LLM_ASSIST_REQUIRED` | Tool needs LLM help | Tool |
| `MAX_ITERATIONS_EXCEEDED` | Iteration limit | Agent |
| `TOOL_EXECUTION_ERROR` | Tool failed | Agent |
| `INITIALIZATION_ERROR` | Init failed | Agent |
| `UNKNOWN` | Unexpected error | Any |

### Retryable Errors

| Code | Retryable |
|------|-----------|
| `RATE_LIMITED` | **Yes** |
| `NETWORK_ERROR` | **Yes** |
| `TIMEOUT` | **Yes** |
| All others | No |

---

## Provider Error Metadata

Error responses can include provider context for debugging:

```typescript
interface ProviderErrorMetadata {
  provider?: string;      // e.g., 'openai', 'anthropic'
  model?: string;         // e.g., 'gpt-4o'
  statusCode?: number;    // HTTP status code
  retryAfter?: number;    // Seconds until retry allowed
  originalError?: unknown; // Original SDK error
}
```

---

## Helper Functions

```typescript
// Create success response
successResponse<T>(result: T, message: string): AgentSuccessResponse<T>

// Create error response
errorResponse(
  error: AgentErrorCode,
  message: string,
  metadata?: ProviderErrorMetadata
): AgentErrorResponse

// Type guards
isAgentSuccess<T>(response: AgentResponse<T>): response is AgentSuccessResponse<T>
isAgentError(response: AgentResponse): response is AgentErrorResponse

// Error code mapping
mapModelErrorCodeToAgentErrorCode(code: ModelErrorCode): AgentErrorCode
mapToolErrorCodeToAgentErrorCode(code: ToolErrorCode): AgentErrorCode

// User-friendly messages
getUserFriendlyMessage(error: AgentErrorCode, metadata?: ProviderErrorMetadata): string
```

---

## Retry Strategy

### Configuration

```typescript
{
  enabled: boolean,          // Default: true
  maxRetries: number,        // Default: 3
  baseDelayMs: number,       // Default: 1000
  maxDelayMs: number,        // Default: 10000
  enableJitter: boolean      // Default: true
}
```

### Exponential Backoff

```
Attempt 0: Immediate
Attempt 1: baseDelay * 2^0 = 1000ms
Attempt 2: baseDelay * 2^1 = 2000ms
Attempt 3: baseDelay * 2^2 = 4000ms
...
Capped at: maxDelay = 10000ms
```

### Jitter

Random variation (±25%) to prevent thundering herd:

```typescript
delay = baseDelay * (0.75 + Math.random() * 0.5);
```

### Retry-After Header

Provider-specified delays take precedence:

```typescript
if (response.retryAfterMs) {
  await delay(response.retryAfterMs);
} else {
  await delay(calculateExponentialBackoff(attempt));
}
```

---

## Error Mapping

Keyword-based classification for provider errors:

```typescript
function mapErrorToCode(error: unknown): ModelErrorCode {
  const message = (error?.message || '').toLowerCase();

  if (message.includes('api key') || message.includes('unauthorized')) {
    return 'AUTHENTICATION_ERROR';
  }
  if (message.includes('rate limit') || message.includes('429')) {
    return 'RATE_LIMITED';
  }
  if (message.includes('timeout')) {
    return 'TIMEOUT';
  }
  if (message.includes('network') || message.includes('econnrefused')) {
    return 'NETWORK_ERROR';
  }
  // ... more mappings
  return 'UNKNOWN';
}
```

---

## Graceful Degradation

When non-critical operations fail, the agent continues:

| Failure | Fallback |
|---------|----------|
| LLM parsing fails | Extract text content, skip structure |
| History selection fails | Proceed without context |
| Telemetry fails | Continue with no-op tracer |
| Summary generation fails | Use truncated text |
| Context storage fails | Keep in memory (may hit limits) |

### Implementation Pattern

```typescript
// Non-critical operation with fallback
try {
  const summary = await summarize(content);
  return summary;
} catch (error) {
  callbacks.onDebug?.('Summary failed, using truncation', { error });
  return truncate(content, maxLength);
}
```

---

## Error Messages

### User-Facing Messages

- Clear, actionable language
- No technical jargon
- Suggest next steps when possible

```typescript
// Good
"Cannot connect to OpenAI API. Check your API key in settings."

// Bad
"ECONNREFUSED: connection refused at 127.0.0.1:443"
```

### Debug Messages

- Full technical details via `onDebug` callback
- Include error stack traces
- Never shown to users by default

```typescript
callbacks.onDebug?.('Provider error', {
  error: error.message,
  stack: error.stack,
  provider: 'openai',
  attempt: 2,
});
```

---

## Related Documentation

- [Core Interfaces](./core-interfaces.md) - ModelResponse, Tool.Result
- [Providers Architecture](./providers.md) - Provider-specific errors
