# Telemetry Architecture

This document describes the OpenTelemetry integration for observability.

---

## Overview

The telemetry system provides:

- **OpenTelemetry SDK** for tracing
- **GenAI semantic conventions** for LLM operations
- **OTLP export** to various backends
- **Opt-in activation** with graceful degradation

---

## Span Hierarchy

```
agent.run (root span)
├── gen_ai.chat (LLM call)
│   ├── gen_ai.provider.name: "openai"
│   ├── gen_ai.request.model: "gpt-4o"
│   ├── gen_ai.usage.input_tokens: 150
│   └── gen_ai.usage.output_tokens: 50
│
├── tool.execute (tool call)
│   ├── tool.name: "read_file"
│   ├── tool.result.success: true
│   └── duration_ms: 23
│
└── gen_ai.chat (final response)
    └── ...
```

---

## Integration Points

```
AgentCallbacks
     │
     ├─► onLLMStart   ──► startLLMSpan()
     ├─► onLLMEnd     ──► recordTokenUsage(), span.end()
     ├─► onToolStart  ──► startToolSpan()
     └─► onToolEnd    ──► recordToolResult(), span.end()
```

---

## GenAI Semantic Conventions

Standard attributes for LLM operations:

| Attribute | Description |
|-----------|-------------|
| `gen_ai.system` | AI system (e.g., "openai") |
| `gen_ai.request.model` | Model identifier |
| `gen_ai.request.max_tokens` | Max tokens requested |
| `gen_ai.request.temperature` | Temperature setting |
| `gen_ai.usage.input_tokens` | Prompt tokens |
| `gen_ai.usage.output_tokens` | Completion tokens |
| `gen_ai.response.finish_reasons` | Why generation stopped |

---

## Configuration

```typescript
{
  telemetry: {
    enabled: boolean,              // Default: false
    endpoint: string,              // OTLP endpoint
    enableSensitiveData: boolean   // Default: false
  }
}
```

### Sensitive Data

When `enableSensitiveData: false` (default):
- Prompt content is NOT logged
- Response content is NOT logged
- Only metadata and token counts are recorded

When `enableSensitiveData: true`:
- Full prompts and responses are logged
- Use only in development/debugging

---

## OTLP Export

Telemetry exports to any OTLP-compatible backend:

| Backend | Use Case |
|---------|----------|
| Aspire Dashboard | Local development |
| Jaeger | Self-hosted tracing |
| Grafana Tempo | Production tracing |
| Azure Monitor | Azure deployments |

---

## Aspire Dashboard Integration

For local development with .NET Aspire:

```bash
# Start Aspire dashboard
docker run --rm -p 18888:18888 -p 4317:18889 \
  -d --name aspire-dashboard \
  mcr.microsoft.com/dotnet/aspire-dashboard:latest
```

Configure endpoint:

```json
{
  "telemetry": {
    "enabled": true,
    "endpoint": "http://localhost:4317"
  }
}
```

---

## TelemetryHelpers Interface

```typescript
interface TelemetryHelpers {
  // Start LLM span with GenAI conventions
  startLLMSpan(
    model: string,
    provider: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Span;

  // Record token usage on span
  recordTokenUsage(span: Span, usage: TokenUsage): void;

  // Start tool execution span
  startToolSpan(toolName: string): Span;

  // Record tool result on span
  recordToolResult(span: Span, success: boolean): void;

  // Get current trace context
  getContext(): SpanContext;
}
```

---

## Graceful Degradation

When telemetry is disabled or fails:

- No-op implementations used
- No performance overhead
- Agent continues normally

```typescript
const helpers = telemetry.enabled
  ? createTelemetryHelpers(config)
  : createNoopHelpers();
```

---

## SpanContext Propagation

All callbacks receive `SpanContext` for correlation:

```typescript
onLLMStart(ctx: SpanContext, model: string, messages: Message[]): void;
```

This enables:
- Distributed tracing across services
- Correlation of LLM calls with tool executions
- Parent-child span relationships

---

## Related Documentation

- [Core Interfaces](./core-interfaces.md) - Callback interface
- [Configuration](./configuration.md) - Telemetry settings
