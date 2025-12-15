# Feature: Message History Memory

## Feature Description

Implement a message history memory system for the TypeScript agent framework that enables multi-turn conversation context. This feature ports the memory management concepts from `agent-base/src/agent/memory/` into `src/utils/message-history.ts`, providing:

1. **Add messages** - Store user/assistant exchanges with timestamps
2. **Retrieve history** - Get conversation history (recency-based for MVP)
3. **Relevance selection** - Extract relevant context for new queries
4. **Size management** - Enforce history limits to prevent unbounded growth

The implementation starts with simple recency-based retrieval; semantic search (Mem0 integration) is deferred to post-MVP as specified in the rewrite plan.

## User Story

As an agent user,
I want the agent to remember our conversation history,
So that I can have contextual multi-turn conversations without repeating information.

## Problem Statement

Currently, the TypeScript agent framework accepts an optional `history?: Message[]` parameter in `Agent.run()` and `Agent.runStream()`, but there is no built-in mechanism to:
- Persist conversation messages between interactions
- Automatically manage history size limits
- Select relevant history for context injection
- Track conversation metadata (timestamps, turn counts)

This forces the CLI layer to manually manage all conversation state, leading to:
- Inconsistent history handling across CLI components
- No enforced size limits (potential memory growth)
- No relevance filtering for context-efficient prompts

## Solution Statement

Implement `MessageHistory` class in `src/utils/message-history.ts` that:

1. **Stores messages with metadata** - Each message includes role, content, timestamp, and optional turn ID
2. **Enforces size limits** - Respects `config.memory.historyLimit` (default: 100 messages)
3. **Provides retrieval methods**:
   - `getRecent(limit)` - Get N most recent messages (MVP primary method)
   - `getRelevant(query, limit)` - Extract messages relevant to a query (keyword-based for MVP)
   - `getAll()` - Get full history
4. **Integrates with Agent** - Works with existing `Message` type from `src/agent/types.ts`
5. **Supports CLI integration** - Easy to use from InteractiveShell for automatic history management

## Related Documentation

### Requirements
- `docs/plans/typescript-rewrite-features.md` - Feature 18 specification
- `docs/plans/typescript-rewrite.md` - Phase 3: Memory + Session

### Architecture Decisions
- `docs/decisions/0007-callbacks-over-eventbus.md` - Callback patterns (no global state)
- `docs/decisions/0004-validation-zod.md` - Zod validation for message schemas

### Python Reference
- `agent-base/src/agent/memory/manager.py` - Abstract base class interface
- `agent-base/src/agent/memory/store.py` - InMemoryStore implementation
- `agent-base/src/agent/memory/persistence.py` - Serialization utilities

## Codebase Analysis Findings

### Architecture Patterns
- **Dependency Injection**: All components receive dependencies via constructor
- **No Global State**: Following callbacks-over-eventbus decision
- **Discriminated Unions**: Return `ToolResponse<T>` pattern (success/error)
- **Callback-Driven**: Agent→UI communication via typed callbacks

### Naming Conventions
- Files: `camelCase.ts` (e.g., `message-history.ts`)
- Classes: `PascalCase` (e.g., `MessageHistory`)
- Types/Interfaces: `PascalCase` (e.g., `StoredMessage`, `HistoryOptions`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `DEFAULT_HISTORY_LIMIT`)

### Similar Implementations
- `src/cli/input/history.ts` - InputHistory class (navigation pattern, size limiting)
- `src/agent/types.ts` - `Message` interface (role, content, name, toolCallId)
- `src/agent/agent.ts` - `assembleMessages()` method shows history integration

### Integration Patterns
- Agent accepts `history?: Message[]` in `run()` and `runStream()`
- `convertMessages()` transforms `Message[]` to LangChain `BaseMessage[]`
- Config has `memory.historyLimit` setting (default: 100)

### Existing Config Structure
From `src/config/schema.ts` and `src/config/constants.ts`:
```typescript
// Memory config already exists but is not implemented
memory: {
  enabled: boolean;        // DEFAULT_MEMORY_ENABLED = false
  type: 'local' | 'mem0';  // DEFAULT_MEMORY_TYPE = 'local'
  historyLimit: number;    // DEFAULT_MEMORY_HISTORY_LIMIT = 100
  mem0?: Mem0Config;       // Reserved for post-MVP
}
```

## Archon Project

**Project ID:** `126b5863-fdbf-49e8-a86c-df1771442eba`
**Title:** Feature 18: Message History Memory

## Relevant Files

### Existing Files
- `src/agent/types.ts`: `Message` interface definition (lines 40-49)
- `src/agent/agent.ts`: Uses `history?: Message[]` parameter (lines 150-165, 271, 430)
- `src/agent/callbacks.ts`: `AgentCallbacks` interface
- `src/config/schema.ts`: `MemoryConfigSchema` already defined (lines 215-227)
- `src/config/constants.ts`: Memory defaults defined (lines 59-65)
- `src/cli/input/history.ts`: Reference pattern for history management
- `src/components/InteractiveShell.tsx`: Primary CLI integration point

### New Files
- `src/utils/message-history.ts`: MessageHistory class implementation
- `src/utils/__tests__/message-history.test.ts`: Unit tests

## Implementation Plan

### Phase 1: Foundation
Create the `MessageHistory` class with core storage and retrieval functionality.

### Phase 2: Core Implementation
Implement all history methods: add, getRecent, getRelevant, getAll, clear.

### Phase 3: Integration
Wire MessageHistory into InteractiveShell for automatic conversation tracking.

## Step by Step Tasks

### Task 1: Create utils directory and message-history file structure
- Description: Create `src/utils/` directory if needed and establish the message-history module
- Files to modify: `src/utils/message-history.ts` (new), `src/utils/index.ts` (new)
- Implementation details:
  - Create `src/utils/` directory if it doesn't exist
  - Create `src/utils/index.ts` for module exports
  - Create `src/utils/message-history.ts` with imports and type definitions
  - Define `StoredMessage` interface extending `Message` with metadata

### Task 2: Implement StoredMessage type and MessageHistoryOptions
- Description: Define the core types for stored messages and configuration
- Files to modify: `src/utils/message-history.ts`
- Implementation details:
  ```typescript
  interface StoredMessage extends Message {
    id: string;           // Unique message ID
    timestamp: string;    // ISO timestamp
    turnIndex?: number;   // Optional conversation turn number
  }

  interface MessageHistoryOptions {
    historyLimit?: number;  // Max messages (default from config)
    onDebug?: (msg: string, data?: unknown) => void;  // Debug callback
  }
  ```

### Task 3: Implement MessageHistory class constructor and add method
- Description: Create the class with constructor and add() method
- Files to modify: `src/utils/message-history.ts`
- Implementation details:
  - Constructor accepts `MessageHistoryOptions`
  - `add(message: Message)` - Add single message with auto-generated ID and timestamp
  - `addExchange(query: string, response: string)` - Convenience method for Q&A pairs
  - Enforce `historyLimit` by trimming oldest messages when limit exceeded
  - Skip duplicate consecutive messages (like InputHistory pattern)

### Task 4: Implement getRecent and getAll methods
- Description: Add retrieval methods for recent and all messages
- Files to modify: `src/utils/message-history.ts`
- Implementation details:
  - `getRecent(limit?: number): Message[]` - Get N most recent messages
  - `getAll(): Message[]` - Get full history as Message[] (strips metadata)
  - `getAllStored(): StoredMessage[]` - Get full history with metadata
  - Return copies to prevent external mutation

### Task 5: Implement getRelevant method (keyword-based MVP)
- Description: Add keyword-based relevance extraction
- Files to modify: `src/utils/message-history.ts`
- Implementation details:
  - `getRelevant(query: string, limit?: number): Message[]`
  - Extract keywords from query (split on whitespace, lowercase)
  - Score messages by keyword match count (similar to Python's InMemoryStore.search)
  - Return top N messages sorted by relevance + recency
  - Fall back to `getRecent()` if no matches found

### Task 6: Implement clear and utility methods
- Description: Add clear(), size getter, and helper methods
- Files to modify: `src/utils/message-history.ts`
- Implementation details:
  - `clear(): void` - Clear all history
  - `get size(): number` - Return current message count
  - `get isEmpty(): boolean` - Check if history is empty
  - `getLastUserMessage(): Message | undefined` - Get most recent user message
  - Private `generateId()` helper using crypto.randomUUID()

### Task 7: Export MessageHistory from utils index
- Description: Set up module exports
- Files to modify: `src/utils/index.ts`
- Implementation details:
  - Export `MessageHistory` class
  - Export `StoredMessage` and `MessageHistoryOptions` types
  - Export any utility functions

### Task 8: Write unit tests for MessageHistory
- Description: Create comprehensive test suite
- Files to modify: `src/utils/__tests__/message-history.test.ts` (new)
- Implementation details:
  - Test add() single message and exchange
  - Test getRecent() with various limits
  - Test getRelevant() keyword matching and fallback
  - Test history limit enforcement (FIFO trimming)
  - Test clear() and utility methods
  - Test duplicate consecutive message handling
  - Test edge cases (empty history, invalid inputs)
  - Target 90%+ coverage for this module

### Task 9: Integrate MessageHistory into InteractiveShell
- Description: Wire message history into the interactive CLI
- Files to modify: `src/components/InteractiveShell.tsx`
- Implementation details:
  - Import `MessageHistory` from `src/utils/`
  - Create `MessageHistory` instance with config-based limit
  - After each agent response, call `history.addExchange(query, response)`
  - Pass `history.getRecent()` to `agent.run(query, history)`
  - Add `/clear` command support to clear history
  - Add `/history` command to display conversation history

### Task 10: Add optional history to SinglePrompt component
- Description: Support history continuation in single-prompt mode
- Files to modify: `src/components/SinglePrompt.tsx`
- Implementation details:
  - Accept optional `initialHistory?: Message[]` prop
  - Pass history to agent.run() if provided
  - This enables future `--continue` flag for session resume

### Task 11: Integration testing and validation
- Description: Verify end-to-end functionality
- Files to modify: None (manual testing)
- Implementation details:
  - Test multi-turn conversation in InteractiveShell
  - Verify history is maintained across exchanges
  - Test /clear command clears history
  - Verify history limit is enforced
  - Test keyword relevance filtering
  - Run full validation suite

## Testing Strategy

### Unit Tests

**Constructor & Configuration:**
- Creates with default options
- Respects custom historyLimit
- Accepts debug callback

**add() method:**
- Adds single message with generated ID and timestamp
- Preserves all Message fields (role, content, name, toolCallId)
- Enforces history limit (FIFO trimming)
- Skips duplicate consecutive messages

**addExchange() method:**
- Adds user and assistant messages as pair
- Sets correct roles
- Generates unique IDs for both

**getRecent() method:**
- Returns N most recent messages
- Returns all if limit > size
- Returns empty array if empty history
- Returns copies (not references)

**getRelevant() method:**
- Finds messages with matching keywords
- Scores by keyword match count
- Falls back to getRecent() when no matches
- Case-insensitive matching
- Respects limit parameter

**getAll() and getAllStored():**
- Returns all messages
- getAll() strips metadata (returns Message[])
- getAllStored() includes metadata (returns StoredMessage[])

**clear() method:**
- Removes all messages
- Resets size to 0

**Utility methods:**
- size returns correct count
- isEmpty returns true/false correctly
- getLastUserMessage() finds last user message

### Integration Tests
- InteractiveShell maintains history across interactions
- History passed to Agent.run() includes previous context
- /clear command resets history
- History limit enforced over long conversations

### Edge Cases
- Empty query in getRelevant()
- All system messages (no user messages to find)
- Tool messages with toolCallId
- Unicode content
- Very long messages
- History at exactly limit boundary

## Acceptance Criteria

- [x] `MessageHistory` class implemented in `src/utils/message-history.ts`
- [x] Supports `add()`, `addExchange()`, `getRecent()`, `getRelevant()`, `getAll()`, `clear()`
- [x] Enforces `historyLimit` from config (default: 100)
- [x] `getRelevant()` implements keyword-based scoring with recency tiebreaker
- [x] Returns `Message[]` compatible with `Agent.run()` and `Agent.runStream()`
- [x] Integrated into `InteractiveShell` for automatic history management
- [x] `/clear` command clears conversation history
- [x] `/history` command displays conversation history
- [x] Unit tests with 90%+ coverage (98.68% achieved)
- [x] TypeScript strict mode passes
- [x] ESLint passes with no errors

## Validation Commands

```bash
# TypeScript type checking
bun run typecheck

# Linting
bun run lint

# Run all tests
bun run test

# Run message-history tests specifically
bun run test -- src/utils/__tests__/message-history.test.ts

# Run with coverage
bun run test:coverage

# Build
bun run build
```

## Notes

### MVP Scope

This implementation focuses on **recency-based** retrieval with simple **keyword-based** relevance filtering. More advanced features are deferred:

| Feature | MVP Status | Notes |
|---------|------------|-------|
| Recency retrieval | ✅ Included | `getRecent(limit)` |
| Keyword relevance | ✅ Included | `getRelevant(query)` with word matching |
| Size limits | ✅ Included | FIFO trimming at historyLimit |
| Semantic search | ❌ Deferred | Requires Mem0 or embedding model |
| Session persistence | ❌ Deferred | Part of Feature 20 |
| Cross-session memory | ❌ Deferred | Post-MVP (Mem0 integration) |

### Relationship to Context Manager

Feature 19 (Tool Context Persistence) handles **tool outputs** - large results from tool execution that need filesystem storage. This feature (18) handles **conversation messages** - user/assistant exchanges for multi-turn context. They are complementary but separate:

- `MessageHistory`: Conversation turns (user/assistant messages)
- `ContextManager`: Tool execution results (JSON data from tool calls)

### Config Integration

The existing `memory` config section will be used:
```json
{
  "memory": {
    "enabled": true,
    "type": "local",
    "historyLimit": 100
  }
}
```

When `memory.enabled` is false, the MessageHistory will still work but the CLI might skip automatic history management (TBD based on UX requirements).

### Thread Safety

JavaScript is single-threaded, so no explicit synchronization is needed. The class stores messages in a simple array and all operations are synchronous.

## Execution

This spec can be implemented using: `/sdlc:implement docs/specs/feature-018-message-history-memory.md`
