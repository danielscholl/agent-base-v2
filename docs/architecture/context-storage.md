# Context Storage Architecture

This document describes the context storage strategy for managing large tool outputs.

---

## Overview

**Problem:** Tool outputs can be very large (search results, file contents). Keeping all outputs in memory causes unbounded growth.

**Solution:** Filesystem-backed storage with lazy loading.

---

## Strategy

```
Execution Phase                    Answer Phase
───────────────                    ────────────

Tool executes                      Select relevant contexts
     │                                  │
     ▼                                  ▼
Save to filesystem              Load only selected data
     │                                  │
     ▼                                  ▼
Store pointer in memory         Build answer prompt
(lightweight metadata)
```

---

## Storage Thresholds

| Size | Strategy |
|------|----------|
| < 32KB | Keep in memory for session |
| > 32KB | Persist to filesystem |

---

## Storage Layout

```
~/.agent/context/
├── session-abc123-read_file-a1b2c3.json
├── session-abc123-search_code-d4e5f6.json
└── session-def456-grep-g7h8i9.json
```

### File Contents

```json
{
  "toolName": "search_code",
  "args": { "query": "TODO" },
  "result": { /* full tool result */ },
  "timestamp": "2024-01-15T10:30:00Z",
  "queryId": "query-abc123",
  "sessionId": "session-abc123"
}
```

---

## Lifecycle

1. **During execution:** Tool outputs saved, pointers tracked
2. **During answer:** LLM selects relevant pointers, full data loaded
3. **End of session:** Context directory cleared

---

## ContextManager Interface

```typescript
interface IContextManager {
  // Save tool output to storage
  saveContext(
    toolName: string,
    args: Record<string, unknown>,
    result: unknown,
    taskId?: string,
    queryId?: string
  ): Promise<string>;  // Returns filepath

  // Load context from storage
  loadContext(filepath: string): Promise<unknown>;

  // List available contexts for session
  listContexts(sessionId: string): Promise<ContextPointer[]>;

  // Clear all contexts (session end)
  clearContexts(): Promise<void>;

  // Generate deterministic query ID
  static hashQuery(query: string): string;
}
```

---

## Context Pointer

```typescript
interface ContextPointer {
  filepath: string;
  toolName: string;
  timestamp: number;
  sizeBytes: number;
  queryId?: string;
}
```

---

## Session Resume and Context

**Important:** Context is ephemeral and not preserved across session resume.

When a session is resumed:
- ✅ Conversation history is restored
- ✅ Event logs are available
- ❌ Context data is NOT restored

**Rationale:** Context can be very large (hundreds of MB in some cases).

**Implication:** Resumed sessions may need to re-execute tools to regenerate context.

---

## Context Selection

The Agent uses LLM to select which contexts are relevant for answering:

```
Available contexts:
1. search_code: Found 150 matches for "TODO"
2. read_file: Contents of src/main.ts (2KB)
3. grep: 45 matches for "error" in logs

LLM selects: [1, 2]

Only load selected contexts into answer prompt.
```

---

## Memory vs Disk Trade-offs

| Aspect | Memory | Disk |
|--------|--------|------|
| Access speed | Fast | Slower |
| Size limits | Limited by RAM | Limited by disk |
| Session resume | Lost | Cleared anyway |
| Concurrency | Simple | Needs locking |

---

## Related Documentation

- [Sessions Architecture](./sessions.md) - Session lifecycle
- [Tools Architecture](./tools.md) - Tool output handling
