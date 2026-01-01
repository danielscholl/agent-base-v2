# Error Handling Architecture

This document describes the error handling patterns, retry strategies, and graceful degradation approach used throughout the framework.

---

## Overview

The framework follows a **structured response** approach where:

- **Tools** return `Tool.Result`, never throw at boundaries
- **Model Layer** returns `ModelResponse<T>`, never throws at boundaries
- **Agent Layer** may throw `AgentError` subclasses for fatal errors
- **CLI Layer** catches all errors and displays user-friendly messages

---

## Error Type Hierarchy

```
AgentError (base)
├── ProviderError     ─► Rate limits, auth failures, network issues
├── ConfigError       ─► Validation failures, missing required fields
├── ToolError         ─► Tool execution failures
└── PermissionError   ─► Permission denied for operation
```

---

## Error Handling by Layer

### Tools Layer

**Strategy:** Return structured responses, never throw at public boundaries.

```typescript
// Tools return Tool.Result with error information
execute: async (args, ctx) => {
  try {
    const result = await doOperation(args);
    return {
      title: 'Success',
      metadata: {},
      output: result,
    };
  } catch (error) {
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
// Model layer returns ModelResponse
const result = await client.invoke(messages);

if (result.success) {
  console.log(result.result.content);
} else {
  console.error(`${result.error}: ${result.message}`);
}
```

### Agent Layer

**Strategy:** Handle tool errors gracefully, may throw for fatal issues.

```typescript
try {
  const answer = await agent.run(query);
} catch (error) {
  if (error instanceof ProviderError) {
    // Handle provider-specific error
  } else if (error instanceof ConfigError) {
    // Handle config error
  }
}
```

### CLI Layer

**Strategy:** Catch everything, display user-friendly messages.

```typescript
try {
  await agent.run(query);
} catch (error) {
  displayError(error);
  resetToCleanState();
}
```

---

## Error Flow Diagram

```
Tool Layer                    Agent Layer                   CLI Layer
──────────                    ───────────                   ─────────

try/catch internally          May throw AgentError          try {
       │                             │                        agent.run()
       ▼                             │                      } catch {
Return Tool.Result ─────────►  Handles tool errors           display error
  (never throw)                      │                        reset cleanly
                                     ▼                      }
                              Throws for fatal errors ─────►
```

---

## Model Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| `PROVIDER_NOT_CONFIGURED` | Config missing/invalid | No |
| `PROVIDER_NOT_SUPPORTED` | Unknown provider name | No |
| `AUTHENTICATION_ERROR` | Invalid API key | No |
| `RATE_LIMITED` | Rate limit exceeded | **Yes** |
| `MODEL_NOT_FOUND` | Invalid model name | No |
| `CONTEXT_LENGTH_EXCEEDED` | Prompt too long | No |
| `NETWORK_ERROR` | Connection issues | **Yes** |
| `TIMEOUT` | Request timeout | **Yes** |
| `INVALID_RESPONSE` | Malformed API response | No |
| `UNKNOWN` | Unexpected errors | No |

---

## Tool Error Codes

| Code | Description | When to Use |
|------|-------------|-------------|
| `VALIDATION_ERROR` | Invalid input parameters | Schema validation fails |
| `IO_ERROR` | File system or network errors | File operations fail |
| `CONFIG_ERROR` | Configuration issues | Missing required config |
| `PERMISSION_DENIED` | Access denied | User denies permission |
| `RATE_LIMITED` | Rate limiting hit | External API rate limit |
| `NOT_FOUND` | Resource not found | File/resource doesn't exist |
| `LLM_ASSIST_REQUIRED` | Tool needs LLM help | Content too large, etc. |
| `TIMEOUT` | Operation timed out | Long-running operation |
| `UNKNOWN` | Unexpected errors | Catch-all |

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

- [Core Interfaces](./core-interfaces.md) - ModelResponse, ToolResponse
- [Providers Architecture](./providers.md) - Provider-specific errors
