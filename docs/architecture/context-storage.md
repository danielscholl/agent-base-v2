# Context Storage Architecture

> **Status:** Partial Implementation
> **Source of truth:** [`src/utils/context.ts`](../../src/utils/context.ts)

This document describes the context storage strategy for managing tool outputs.

---

## Overview

**Problem:** Tool outputs can be very large (search results, file contents). Keeping all outputs in memory causes unbounded growth.

**Solution:** Filesystem-backed storage with lazy loading and keyword-based relevance matching.

---

## Implementation Status

> **Note:** The `ContextManager` class is fully implemented in `src/utils/context.ts`, but is **not yet integrated** into the Agent's tool execution loop. Tool outputs are currently kept in message history only.
>
> **Planned integration point:** After tool execution in `Agent.run()`, before the next LLM call. The agent will call `contextManager.saveContext()` for large tool outputs.

---

## Planned Implementation

### Persistence Strategy

**All tool outputs are persisted to disk** as JSON files with metadata. The `persistThreshold` option (32KB default) is reserved for future size-aware caching but is not currently used - all outputs go to disk regardless of size.

```
Tool executes
     |
     v
Save to filesystem (always)
     |
     v
Store pointer in memory (lightweight metadata)
     |
     v
Later: Load by filepath when needed
```

### Storage Location

```
~/.agent/context/
|-- readFile_a1b2c3_1735012345678_0_x9k2.json
|-- search_code_d4e5f6_1735012346789_1_m3n4.json
+-- grep_g7h8i9_1735012347890_2_p5q6.json
```

Filenames include: `{toolName}_{argsHash}_{timestamp}_{counter}_{random}.json`

### Stored Context Format

```typescript
interface StoredContext {
  toolName: string;           // Tool that generated this context
  toolDescription: string;    // Human-readable description
  args: Record<string, unknown>;  // Tool input arguments
  timestamp: string;          // ISO 8601 timestamp
  taskId?: number;           // Optional task ID for grouping
  queryId?: string;          // Query ID for filtering
  result: unknown;           // The tool execution result
}
```

### Context Pointer (In-Memory)

```typescript
interface ContextPointer {
  filepath: string;           // Full path to context file
  filename: string;           // Just the filename
  toolName: string;          // Tool that generated this
  toolDescription: string;   // Human-readable description
  args: Record<string, unknown>;
  taskId?: number;
  queryId?: string;
}
```

---

## ContextManager API

```typescript
class ContextManager {
  constructor(options?: {
    contextDir?: string;        // Default: ~/.agent/context
    persistThreshold?: number;  // Reserved for future (default: 32KB)
    fileSystem?: IFileSystem;   // For testing
    onDebug?: (msg: string, data?: unknown) => void;
  });

  // Save tool output to storage (always persists to disk)
  async saveContext(
    toolName: string,
    args: Record<string, unknown>,
    result: unknown,
    taskId?: number,
    queryId?: string
  ): Promise<string>;  // Returns filepath

  // Get all stored pointers
  getAllPointers(): ContextPointer[];

  // Get pointers for a specific query
  getPointersForQuery(queryId: string): ContextPointer[];

  // Get pointers for a specific task
  getPointersForTask(taskId: number): ContextPointer[];

  // Load full context data from disk
  async loadContexts(filepaths: string[]): Promise<StoredContext[]>;

  // Select relevant contexts using keyword matching
  selectRelevantContexts(query: string, pointers: ContextPointer[]): string[];

  // Generate deterministic query ID from query string
  static hashQuery(query: string): string;

  // Clear pointers (in-memory only)
  clearPointers(): void;

  // Clear context directory (filesystem)
  async clearContextDir(): Promise<void>;

  // Full cleanup (both pointers and filesystem)
  async clear(): Promise<void>;

  // Get number of stored pointers
  get size(): number;

  // Get context directory path
  getContextDir(): string;
}
```

---

## Relevance Selection

The `selectRelevantContexts()` method uses keyword matching to find relevant contexts:

1. Extract keywords from search query (words > 2 chars)
2. Extract keywords from each pointer's `toolDescription`
3. Score by keyword overlap
4. Return filepaths sorted by score (highest first)
5. If no matches, return all pointers

```typescript
// Example usage
const pointers = manager.getPointersForQuery(queryId);
const relevantPaths = manager.selectRelevantContexts('authentication error', pointers);
const contexts = await manager.loadContexts(relevantPaths);
```

> **Note:** This is a simple heuristic-based approach. LLM-based selection is a potential future enhancement.

---

## Lifecycle and Cleanup

### When to Call clear()

Context cleanup is **not automatic**. You must explicitly call `clear()`:

```typescript
// At session end
await contextManager.clear();  // Deletes files AND clears pointers
```

### Session Resume Behavior

**Important:** Context is NOT restored on session resume.

When a session is resumed:
- Conversation history is restored (from SessionManager)
- Context pointers are empty
- Context files may still exist on disk (not auto-cleaned)

**Rationale:** Context can be very large (hundreds of MB). Auto-loading would cause memory issues.

**Implication:** Resumed sessions may need to re-execute tools to regenerate context.

---

## Memory vs Disk Trade-offs

| Aspect | Memory | Disk |
|--------|--------|------|
| Access speed | Fast | Slower (disk I/O) |
| Size limits | Limited by RAM | Limited by disk |
| Session resume | Lost (pointers cleared) | Files persist |
| Concurrency | Simple | Handled by unique filenames |

---

## Memory Considerations

**Pointer list growth:** The in-memory pointer list grows with each `saveContext()` call. Pointers are lightweight (~200 bytes each), but for very long sessions with many tool executions, memory usage scales linearly. Call `clearPointers()` periodically or at session boundaries to reclaim memory.

---

## Planned Enhancements

The following features may be added in future versions:

- **Size-aware caching**: Use `persistThreshold` to keep small outputs in memory
- **LLM-based selection**: Replace keyword matching with LLM relevance scoring
- **Auto-cleanup on session end**: Integrate with SessionManager for automatic cleanup

---

## Related Documentation

- [Sessions Architecture](./sessions.md) - Session lifecycle
- [Tools Architecture](./tools.md) - Tool output handling
