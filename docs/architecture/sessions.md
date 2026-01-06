# Sessions Architecture

> **Status:** Current
> **Source of truth:** [`src/utils/session.ts`](../../src/utils/session.ts)

This document describes the session persistence system for save/restore and conversation history.

---

## Overview

The session system provides:

- **Save/restore conversations** for continuity across CLI invocations
- **Session index** for fast listing without loading full sessions
- **Last session tracking** for `--continue` flag
- **Atomic file writes** to prevent corruption
- **Auto-purge** to enforce storage limits

---

## Storage Structure

```
~/.agent/sessions/
|-- index.json              # Session metadata index
|-- last_session            # ID of last active session
|-- 2025-01-04-14-32-15-001-abcd.json
|-- 2025-01-04-10-15-30-002-efgh.json
+-- my-custom-session.json
```

### Session File Format

```typescript
interface StoredSession {
  metadata: SessionMetadata;
  messages: StoredMessage[];     // Conversation history
  contextSummary?: string;       // Optional AI resume summary
}
```

**Note:** Sessions store only messages and metadata. Event logs and tool context are NOT included.

### Session Metadata

```typescript
interface SessionMetadata {
  id: string;                // Filename without extension
  name: string;              // Display name (may differ from ID)
  description?: string;      // Optional description
  createdAt: string;         // ISO 8601 timestamp
  lastActivityAt: string;    // ISO 8601 timestamp
  messageCount: number;      // Total message count
  firstMessage: string;      // Preview (first 200 chars)
  provider: string;          // LLM provider used
  model: string;             // Model used
}
```

### Session Index

```typescript
interface SessionIndex {
  version: string;                      // Schema version ("1.0")
  sessions: Record<string, SessionMetadata>;
  updatedAt: string;                    // Last update timestamp
}
```

**Note:** If the index file is missing or corrupt, it can be rebuilt by scanning existing session files in the sessions directory. The SessionManager will automatically regenerate the index on next startup.

---

## SessionManager API

```typescript
class SessionManager {
  constructor(options?: {
    sessionDir?: string;      // Default: ~/.agent/sessions
    maxSessions?: number;     // Default: 50
    fileSystem?: IFileSystem; // For testing
    onDebug?: (msg: string, data?: unknown) => void;
  });

  // Save session to disk
  async saveSession(
    messages: StoredMessage[],
    options?: {
      name?: string;          // Custom name (default: auto-generated)
      description?: string;
      provider?: string;
      model?: string;
    }
  ): Promise<SessionMetadata>;

  // Load session from disk
  async loadSession(sessionId: string): Promise<StoredSession | null>;

  // List all sessions (newest first)
  async listSessions(): Promise<SessionMetadata[]>;

  // Delete a session
  async deleteSession(sessionId: string): Promise<boolean>;

  // Get last session ID for --continue
  async getLastSession(): Promise<string | null>;

  // Delete old sessions beyond limit
  async purgeSessions(keepCount?: number): Promise<number>;

  // Restore session messages and context summary
  async restoreSession(sessionId: string): Promise<{
    messages: StoredMessage[];
    contextSummary: string | null;
  } | null>;

  // Check if session exists
  async sessionExists(sessionId: string): Promise<boolean>;
}
```

---

## Session Lifecycle

### New Session

```
User starts agent
       |
       v
[Generate session ID]
(timestamp + random suffix)
       |
       v
[Conversation happens]
       |
       v
[Auto-save on significant events]
(Tool execution, LLM response, user message)
       |
       v
[Update index and last_session]
```

### Resume Session

```
User runs: agent --continue
       |
       v
[Read last_session file]
       |
       v
[Load session by ID]
       |
       v
[Restore messages to history]
       |
       v
[Generate context summary]
       |
       v
[Continue conversation]
```

### Session Naming

Session IDs use a unique timestamp format:
```
{YYYY}-{MM}-{DD}-{HH}-{mm}-{ss}-{mmm}-{rand}
Example: 2025-01-04-14-32-15-001-abcd
```

Custom names are sanitized:
- Lowercase
- Replace invalid chars with `-`
- Remove consecutive/leading/trailing dashes
- Truncate to max length

---

## Atomic File Writes

Session files are written using temp-then-rename pattern:

```
Write to: session.json.tmp.{timestamp}-{random}
       |
       v
Rename to: session.json (atomic operation)
       |
       v
Delete temp on failure
```

This prevents corruption if write is interrupted.

---

## Context Summary Generation

When a session is resumed, a context summary is generated for **user display only**:

```
You are resuming a previous conversation session.
Session: my-session
Created: 2025-01-04T14:32:15.000Z
Last activity: 2025-01-04T15:45:30.000Z
Total messages: 24 (12 from user, 12 from assistant)
Description: Working on authentication feature
First topic: Help me implement JWT authentication...

The conversation history follows. Continue naturally from where you left off.
```

> **Note:** This summary is shown to the user in the UI (via `InteractiveShell` component) as a visual indicator of session resumption. It is **not injected into the LLM's message history**. The LLM receives the actual conversation history directly, which provides sufficient context for continuation. This design avoids duplicating information and keeps the context window focused on the real conversation.

---

## Storage Limits

### Max Sessions

Default limit: 50 sessions

When limit is exceeded:
1. List all sessions sorted by `lastActivityAt`
2. Delete oldest sessions beyond limit
3. Update index

### Reserved Names

Cannot be used as session names:
- `index`, `metadata`, `last_session`
- Windows reserved: `con`, `prn`, `aux`, `nul`, `com1-4`, `lpt1-4`

### Security

Path traversal prevention:
- Session IDs validated against `[a-zA-Z0-9_.-]+`
- Rejected: `..`, `/`, `\`, null bytes

---

## Session and Context Relationship

**Important:** Sessions do NOT store tool context.

| Data | Stored in Session | Restored on Resume |
|------|-------------------|-------------------|
| Messages | Yes | Yes |
| Session metadata | Yes | Yes |
| Context summary | Yes | Yes |
| Tool output context | No | No |
| Event logs | No | N/A |

**Implication:** After resuming, the agent has conversation history but not the tool outputs from the previous session. Tools may need to be re-executed if the conversation references specific outputs.

---

## Config Options

```yaml
session:
  autoSave: true         # Auto-save on significant events
  maxSessions: 50        # Max sessions to keep
```

Environment variables:
- None currently mapped for session config

---

## Related Documentation

- [Context Storage](./context-storage.md) - Tool output persistence
- [Configuration](./configuration.md) - Session config options
