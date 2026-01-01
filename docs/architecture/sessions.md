# Session Architecture

This document describes the session lifecycle, persistence, and storage strategies.

---

## Overview

Sessions provide:

- **Conversation persistence** across agent restarts
- **Event logging** for debugging and analysis
- **Context isolation** per conversation
- **Resume capability** for continuing work

---

## Session Lifecycle

```
Session Start                    During Session                 Session End
─────────────                    ──────────────                 ───────────

Create session ID                Log events:                    Save session file
       │                         • LLM calls                    Clear context dir
       ▼                         • Tool calls                          │
Initialize context dir           • Errors                              ▼
       │                                │                        Sessions stored in
       ▼                                ▼                        ~/.agent/sessions/
Begin logging              Persist large outputs to
                           ~/.agent/context/
```

---

## Session Storage

| Location | Purpose | Lifecycle |
|----------|---------|-----------|
| `~/.agent/sessions/` | Conversation history, event logs | Persisted |
| `~/.agent/context/` | Tool outputs, large results | Cleared per session |

---

## Session File Format

```json
{
  "id": "session-abc123",
  "startTime": "2024-01-15T10:30:00Z",
  "endTime": "2024-01-15T11:45:00Z",
  "messages": [
    {
      "role": "user",
      "content": "Help me debug this code",
      "timestamp": "2024-01-15T10:30:05Z"
    },
    {
      "role": "assistant",
      "content": "I'll help you debug...",
      "timestamp": "2024-01-15T10:30:15Z"
    }
  ],
  "events": [
    {
      "type": "llm_call",
      "model": "gpt-4o",
      "usage": { "promptTokens": 150, "completionTokens": 50 },
      "latencyMs": 1200
    },
    {
      "type": "tool_call",
      "name": "read_file",
      "success": true,
      "durationMs": 23
    }
  ]
}
```

---

## Logged Events

| Event Type | Fields |
|------------|--------|
| Session lifecycle | start, end, duration |
| LLM calls | model, token usage, latency |
| Tool calls | name, args, result status, duration |
| Errors | type, message, sanitized context |

**Redaction Required:** API keys, tokens, and sensitive file contents must never appear in logs.

---

## Session Resume

When resuming a session (`--continue`):

**Restored:**
- Conversation history (messages, timestamps)
- Event logs (LLM calls, tool calls)

**Not Restored:**
- Context data (large tool outputs)
- In-memory state

**Implication:** Resumed sessions may need to re-execute tools to regenerate context.

---

## Session ID Generation

```typescript
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `session-${timestamp}-${random}`;
}
```

---

## Context Storage Integration

Large tool outputs are stored in the context directory and referenced by session:

```
~/.agent/context/
├── session-abc123-read_file-a1b2c3.json
├── session-abc123-search_code-d4e5f6.json
└── session-def456-grep-g7h8i9.json
```

---

## Related Documentation

- [Context Storage](./context-storage.md) - Tool output persistence
- [Configuration](./configuration.md) - Session settings
