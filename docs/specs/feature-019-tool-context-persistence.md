# Feature: Tool Context Persistence

## Feature Description

Implement a tool context persistence system for the TypeScript agent framework that enables memory-efficient handling of tool outputs. This feature recreates the behavior from `../dexter/src/utils/context.ts` as `src/utils/context.ts`, providing:

1. **Save tool outputs** - Persist tool inputs/outputs to filesystem with metadata
2. **Index by query/task** - Associate contexts with specific queries or task IDs
3. **Relevant context retrieval** - Select which stored contexts are relevant for answer generation
4. **Size-aware storage** - Small outputs stay in memory, large outputs persist to disk
5. **Session-scoped lifecycle** - Context is garbage-collected at session end

This replaces Python's context provider hooks and enables memory-efficient tool use by avoiding unbounded in-memory storage of tool results.

## User Story

As an agent developer,
I want tool outputs to be automatically persisted and indexed,
So that large tool results don't consume memory while remaining available for answer generation.

## Problem Statement

The TypeScript agent framework currently has no mechanism to:
- Store tool execution results (inputs/outputs) for later reference
- Handle large tool outputs (>32KB) without unbounded memory growth
- Associate tool outputs with specific queries or tasks
- Select relevant tool outputs when generating answers
- Clean up tool output storage at session end

Without this, the agent must either:
- Keep all tool outputs in memory (unbounded growth)
- Lose tool context between turns (poor answer quality)
- Manually manage context in every tool (inconsistent)

## Solution Statement

Implement `ContextManager` class in `src/utils/context.ts` that:

1. **Stores tool outputs with metadata** - Each context includes tool name, args, result, timestamp, and query/task association
2. **Size-aware persistence** - Outputs below threshold stay in memory; large outputs persist to filesystem
3. **Pointer-based access** - Lightweight `ContextPointer` objects track what's stored without loading full data
4. **Query-based filtering** - Get pointers for a specific query ID
5. **Relevant context selection** - LLM-assisted or heuristic selection of relevant contexts for answer generation
6. **Session lifecycle** - Clear context directory at session end

Storage layout:
```
~/.agent/context/
├── AAPL_get_financials_a1b2c3.json
├── search_code_d4e5f6.json
└── read_file_g7h8i9.json
```

## Related Documentation

### Requirements
- `docs/plans/typescript-rewrite-features.md` - Feature 19 specification
- `docs/plans/typescript-rewrite.md` - Phase 3: Memory + Session
- `docs/architecture.md` - Context Storage Strategy section (lines 427-486)

### Architecture Decisions
- `docs/decisions/0007-callbacks-over-eventbus.md` - Callback patterns (no global state)
- `docs/decisions/0004-validation-zod.md` - Zod validation for schemas

### Reference Implementation
- `../dexter/src/utils/context.ts` - TypeScript reference implementation (ToolContextManager)
- `agent-base/src/agent/context/` - Python context provider patterns

## Codebase Analysis Findings

### Architecture Patterns
- **Dependency Injection**: Components receive dependencies via constructor options object
- **No Global State**: Following callbacks-over-eventbus decision
- **Structured Responses**: Tools return `ToolResponse<T>` pattern
- **File System Abstraction**: Use `IFileSystem` interface for testability
- **Callback-Driven**: Optional debug callbacks `onDebug?: (msg: string, data?: unknown) => void`

### Naming Conventions
- Files: `kebab-case.ts` (e.g., `context.ts`)
- Classes: `PascalCase` (e.g., `ContextManager`)
- Types/Interfaces: `PascalCase` (e.g., `ContextPointer`, `StoredContext`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `DEFAULT_PERSIST_THRESHOLD`)

### Similar Implementations
- `src/utils/message-history.ts` - Reference pattern for utils module structure
- `src/config/manager.ts` - Dependency injection via options, IFileSystem interface
- `src/config/types.ts` - IFileSystem interface definition
- `src/tools/types.ts` - ToolResponse pattern

### Integration Patterns
- Agent Layer coordinates context storage during tool execution
- Tools return results to Agent, which stores via ContextManager
- Answer generation phase loads relevant contexts
- Session management triggers context cleanup

### Context Storage Strategy (from architecture.md)
```
CONTEXT STORAGE:
- Small outputs (< 32KB): Keep in memory for the current session
- Large outputs (> 32KB, multi-file results, search results): Persist to context/
- All contexts: Garbage-collected on session end
- Never keep unbounded lists of tool outputs in memory
```

## Archon Project

**Project ID:** `241d90f7-1dbf-4178-bd58-afe34b5b866f`
**Title:** Feature 19: Tool Context Persistence

## Relevant Files

### Existing Files
- `src/utils/message-history.ts`: Reference pattern for utils module structure
- `src/utils/index.ts`: Utils module exports (needs update)
- `src/config/types.ts`: `IFileSystem` interface definition (lines 19-72)
- `src/config/manager.ts`: `NodeFileSystem` implementation (lines 86-137)
- `src/config/constants.ts`: Default configuration values pattern
- `src/tools/types.ts`: `ToolResponse` type definitions
- `src/agent/agent.ts`: Integration point for context storage (callbacks)
- `src/agent/callbacks.ts`: `AgentCallbacks` interface (onToolEnd is relevant)

### New Files
- `src/utils/context.ts`: ContextManager class implementation
- `src/utils/__tests__/context.test.ts`: Unit tests

## Implementation Plan

### Phase 1: Foundation
Create the `ContextManager` class with core types, constructor, and dependency injection.

### Phase 2: Core Implementation
Implement save, load, and pointer management methods.

### Phase 3: Retrieval
Implement relevant context selection (heuristic-based for MVP, LLM-assisted optional).

### Phase 4: Integration
Wire ContextManager into Agent callbacks for automatic context storage.

## Step by Step Tasks

### Task 1: Define types and interfaces for context storage
- Description: Create the core type definitions for stored contexts and pointers
- Files to modify: `src/utils/context.ts` (new)
- Implementation details:
  ```typescript
  /**
   * Lightweight pointer to stored context (kept in memory).
   */
  interface ContextPointer {
    /** Full path to context file on disk */
    filepath: string;
    /** Just the filename (for display) */
    filename: string;
    /** Tool that generated this context */
    toolName: string;
    /** Human-readable description of what the tool did */
    toolDescription: string;
    /** Tool input arguments */
    args: Record<string, unknown>;
    /** Optional task ID for grouping */
    taskId?: number;
    /** Query ID that triggered this tool call */
    queryId?: string;
  }

  /**
   * Full context data stored on disk (or in memory for small outputs).
   */
  interface StoredContext {
    toolName: string;
    toolDescription: string;
    args: Record<string, unknown>;
    timestamp: string;
    taskId?: number;
    queryId?: string;
    result: unknown;
  }

  /**
   * Options for ContextManager constructor.
   */
  interface ContextManagerOptions {
    /** Directory for context storage (default: ~/.agent/context) */
    contextDir?: string;
    /** Threshold in bytes for persisting to disk (default: 32KB) */
    persistThreshold?: number;
    /** File system implementation for testing */
    fileSystem?: IFileSystem;
    /** Debug callback for logging */
    onDebug?: (msg: string, data?: unknown) => void;
  }
  ```

### Task 2: Implement ContextManager class constructor and helpers
- Description: Create the class skeleton with constructor and private helpers
- Files to modify: `src/utils/context.ts`
- Implementation details:
  - Constructor accepts `ContextManagerOptions` with defaults
  - Store `contextDir`, `persistThreshold`, `fileSystem`, `onDebug` as private fields
  - Maintain `pointers: ContextPointer[]` array in memory
  - Private `hashArgs()` method for generating unique filenames
  - Private `hashQuery()` method for query ID generation
  - Private `generateFilename()` method combining tool name and args hash
  - Private `getToolDescription()` method to create human-readable descriptions
  - Private `debug()` helper for optional debug logging
  - Use `NodeFileSystem` as default file system implementation

### Task 3: Implement saveContext method
- Description: Save tool execution results with metadata
- Files to modify: `src/utils/context.ts`
- Implementation details:
  ```typescript
  async saveContext(
    toolName: string,
    args: Record<string, unknown>,
    result: unknown,
    taskId?: number,
    queryId?: string
  ): Promise<string>
  ```
  - Generate unique filename using `generateFilename()`
  - Create `StoredContext` object with all metadata
  - Serialize to JSON and write to `contextDir`
  - Create `ContextPointer` and add to `pointers` array
  - Return filepath for reference
  - Create context directory if it doesn't exist

### Task 4: Implement pointer retrieval methods
- Description: Methods to get stored context pointers
- Files to modify: `src/utils/context.ts`
- Implementation details:
  ```typescript
  /** Get all stored pointers */
  getAllPointers(): ContextPointer[]

  /** Get pointers for a specific query */
  getPointersForQuery(queryId: string): ContextPointer[]

  /** Get pointers for a specific task */
  getPointersForTask(taskId: number): ContextPointer[]
  ```
  - Return copies to prevent external mutation
  - Filter by queryId or taskId as appropriate

### Task 5: Implement loadContexts method
- Description: Load full context data from disk
- Files to modify: `src/utils/context.ts`
- Implementation details:
  ```typescript
  async loadContexts(filepaths: string[]): Promise<StoredContext[]>
  ```
  - Read each file from disk
  - Parse JSON to `StoredContext`
  - Handle file read errors gracefully (log warning, skip file)
  - Return array of loaded contexts

### Task 6: Implement selectRelevantContexts method (heuristic-based MVP)
- Description: Select which contexts are relevant for a query
- Files to modify: `src/utils/context.ts`
- Implementation details:
  ```typescript
  selectRelevantContexts(
    query: string,
    availablePointers: ContextPointer[]
  ): string[]
  ```
  - MVP: Use keyword matching between query and tool descriptions
  - Score each pointer by relevance (keyword overlap)
  - Return filepaths of relevant contexts (sorted by score)
  - Fall back to returning all pointers if no matches
  - NOTE: LLM-assisted selection deferred to post-MVP (requires callLlm dependency)

### Task 7: Implement clear and cleanup methods
- Description: Methods to clear context storage
- Files to modify: `src/utils/context.ts`
- Implementation details:
  ```typescript
  /** Clear all pointers (in-memory) */
  clearPointers(): void

  /** Clear context directory (filesystem) */
  async clearContextDir(): Promise<void>

  /** Full cleanup (both) - call at session end */
  async clear(): Promise<void>
  ```
  - `clearPointers()` resets the pointers array
  - `clearContextDir()` removes all files in context directory
  - `clear()` calls both for complete cleanup

### Task 8: Export ContextManager from utils index
- Description: Update module exports
- Files to modify: `src/utils/index.ts`
- Implementation details:
  - Export `ContextManager` class
  - Export `ContextPointer`, `StoredContext`, `ContextManagerOptions` types
  - Maintain existing exports (MessageHistory)

### Task 9: Write unit tests for ContextManager
- Description: Comprehensive test suite with mocked file system
- Files to modify: `src/utils/__tests__/context.test.ts` (new)
- Test cases:
  - **Constructor**: Default options, custom options, debug callback
  - **saveContext**: Creates file, generates pointer, handles missing dir
  - **getAllPointers**: Returns all pointers, returns copies
  - **getPointersForQuery**: Filters by queryId correctly
  - **getPointersForTask**: Filters by taskId correctly
  - **loadContexts**: Loads multiple files, handles missing files gracefully
  - **selectRelevantContexts**: Keyword matching, empty results fallback
  - **clearPointers**: Resets pointer array
  - **clearContextDir**: Removes files (mock verification)
  - **clear**: Calls both cleanup methods
  - **Edge cases**: Empty contexts, special characters, unicode, very large results

### Task 10: Integration testing and validation
- Description: Verify end-to-end functionality
- Implementation details:
  - Create temporary context directory for integration tests
  - Test save → load → select flow
  - Verify file format matches expected JSON structure
  - Test with realistic tool output sizes
  - Run full validation suite (typecheck, lint, test)

## Testing Strategy

### Unit Tests

**Constructor & Configuration:**
- Creates with default options (uses ~/.agent/context)
- Accepts custom contextDir path
- Accepts custom persistThreshold
- Accepts mock fileSystem for testing
- Accepts debug callback

**saveContext() method:**
- Creates context directory if missing
- Generates unique filename from tool name and args
- Writes valid JSON with all metadata fields
- Creates pointer with correct filepath
- Handles special characters in args (escaping)
- Returns filepath for reference

**getAllPointers() method:**
- Returns all stored pointers
- Returns empty array when no contexts
- Returns copies (not references)

**getPointersForQuery() method:**
- Returns pointers matching queryId
- Returns empty array for non-existent queryId
- Handles undefined queryId values

**getPointersForTask() method:**
- Returns pointers matching taskId
- Returns empty array for non-existent taskId
- Handles undefined taskId values

**loadContexts() method:**
- Loads single context file
- Loads multiple context files
- Skips non-existent files with warning
- Handles malformed JSON gracefully
- Returns parsed StoredContext objects

**selectRelevantContexts() method:**
- Returns empty array for empty pointers
- Matches query keywords to tool descriptions
- Scores by keyword overlap
- Returns filepaths sorted by relevance
- Falls back to all pointers when no matches

**clear methods:**
- clearPointers() resets array to empty
- clearContextDir() removes all files in directory
- clear() calls both methods

### Integration Tests
- Save context → load context → verify data integrity
- Save multiple contexts → filter by queryId → verify filtering
- Context survives across multiple saveContext calls
- clearContextDir removes files from actual filesystem (temp dir)

### Edge Cases
- Empty result from tool
- Very large result (>32KB) - verify file written
- Special characters in tool name or args
- Unicode content in results
- Concurrent saves (single-threaded, should be fine)
- Non-existent context directory (auto-create)
- Missing file during load (graceful skip)

## Acceptance Criteria

- [ ] `ContextManager` class implemented in `src/utils/context.ts`
- [ ] Supports `saveContext()`, `loadContexts()`, `getAllPointers()`, `getPointersForQuery()`
- [ ] Implements `selectRelevantContexts()` with keyword-based scoring (MVP)
- [ ] Creates context directory if it doesn't exist
- [ ] Generates unique filenames using tool name and args hash
- [ ] Includes human-readable tool descriptions for context selection
- [ ] `clear()` method removes all contexts (memory + filesystem)
- [ ] Uses `IFileSystem` interface for testability
- [ ] Exported from `src/utils/index.ts`
- [ ] Unit tests with 90%+ coverage
- [ ] TypeScript strict mode passes
- [ ] ESLint passes with no errors

## Validation Commands

```bash
# TypeScript type checking
bun run typecheck

# Linting
bun run lint

# Run all tests
bun run test

# Run context tests specifically
bun run test -- src/utils/__tests__/context.test.ts

# Run with coverage
bun run test:coverage

# Build
bun run build
```

## Notes

### MVP Scope

This implementation focuses on **filesystem persistence** with **keyword-based** relevance selection. More advanced features are deferred:

| Feature | MVP Status | Notes |
|---------|------------|-------|
| Filesystem storage | Included | JSON files in ~/.agent/context/ |
| Pointer tracking | Included | Lightweight in-memory pointers |
| Query-based filtering | Included | `getPointersForQuery()` |
| Keyword relevance | Included | Heuristic matching in descriptions |
| LLM-assisted selection | Deferred | Requires callLlm integration |
| Size-threshold memory caching | Deferred | All outputs go to disk for simplicity |
| Compression | Deferred | Not needed for MVP |

### Relationship to Message History

Feature 18 (Message History Memory) handles **conversation messages** - user/assistant exchanges for multi-turn context. Feature 19 (this feature) handles **tool outputs** - results from tool execution that need filesystem storage:

- `MessageHistory`: Conversation turns (user/assistant messages, in-memory)
- `ContextManager`: Tool execution results (JSON data, filesystem-backed)

They are complementary and may both be used in a single session.

### Dexter Reference Implementation

The implementation is based on `../dexter/src/utils/context.ts` which provides:
- `ToolContextManager` class with same basic structure
- `hashArgs()` and `hashQuery()` for unique identifiers
- `getToolDescription()` for human-readable context descriptions
- `saveContext()` and `loadContexts()` methods
- `selectRelevantContexts()` with LLM-assisted selection

The MVP differs from Dexter by using keyword-based selection instead of LLM-assisted selection, avoiding the dependency on callLlm in the utils layer.

### Agent Integration (Future Task)

Integration with the Agent Layer is deferred to a separate task. The integration points are:
1. `onToolEnd` callback - Call `contextManager.saveContext()` after tool execution
2. Answer generation phase - Call `selectRelevantContexts()` and `loadContexts()`
3. Session end - Call `contextManager.clear()`

This keeps the ContextManager focused and testable as a standalone utility.

### Thread Safety

JavaScript is single-threaded, so no explicit synchronization is needed. All operations are async but execute sequentially within the event loop.

## Execution

This spec can be implemented using: `/sdlc:implement docs/specs/feature-019-tool-context-persistence.md`
