# Tools Architecture

> **Status:** Current
> **Source of truth:** [`src/tools/index.ts`](../../src/tools/index.ts), [`src/tools/registry.ts`](../../src/tools/registry.ts)

This document describes the tool system architecture using the `Tool.define()` pattern.

---

## Overview

Tools are LLM-callable functions that extend the agent's capabilities. The framework provides:

- **Zod-based input validation**
- **Structured result format** (`Tool.Result`)
- **Streaming metadata updates**
- **Permission-aware execution**
- **LangChain integration** via `DynamicStructuredTool`

---

## Directory Structure

```
src/tools/
├── tool.ts            # Tool namespace (define, Context, Result)
├── registry.ts        # ToolRegistry for centralized management
├── types.ts           # ToolResponse types (for backward compatibility)
├── index.ts           # Public exports + auto-registration
├── workspace.ts       # Workspace root detection and path utilities
│
├── read.ts            # File reading with line numbers
├── write.ts           # File creation/overwriting
├── edit.ts            # In-place file editing
├── glob.ts            # File pattern matching
├── grep.ts            # Content searching with regex
├── list.ts            # Directory listing
├── bash.ts            # Shell command execution
├── task.ts            # Subagent spawning (planned)
├── todo.ts            # Task tracking (todowrite, todoread)
├── webfetch.ts        # URL fetching with HTML sanitization
│
└── __tests__/         # Unit tests for each tool
```

---

## Tool Definition Patterns

### Modern Pattern: Tool.define()

The recommended pattern uses the `Tool` namespace:

```typescript
import { z } from 'zod';
import { Tool } from './tool.js';

// Define metadata type
interface ReadMetadata extends Tool.Metadata {
  path: string;
  bytes: number;
}

// Define the tool
export const readTool = Tool.define<ReadSchema, ReadMetadata>('read', {
  description: 'Read file contents',
  parameters: z.object({
    path: z.string().describe('File path to read'),
  }),
  execute: async (args, ctx) => {
    // Stream progress updates
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

### Key Components

#### Tool.define()

Factory function that creates a `Tool.Info` object:

```typescript
function define<P extends z.ZodType, M extends Metadata>(
  id: string,
  definition: Definition<P, M>
): Info<P, M>;
```

Supports two definition styles:

1. **Static definition** - Object with description, parameters, execute
2. **Async initialization** - Function returning the definition (for dynamic setup)

#### Tool.Context

Execution context provided to every tool:

```typescript
interface Context<M extends Metadata = Metadata> {
  sessionID: string;     // Current session
  messageID: string;     // Current message turn
  agent: string;         // Agent name
  abort: AbortSignal;    // Cancellation support
  callID?: string;       // Parallel execution tracking
  metadata(input): void; // Stream updates
}
```

#### Tool.Result

Standardized return type:

```typescript
interface Result<M extends Metadata = Metadata> {
  title: string;         // Short summary (for UI)
  metadata: M;           // Tool-specific data
  output: string;        // Text for LLM consumption
  attachments?: Attachment[];  // Optional binary content
}
```

---

## Tool Registry

The `ToolRegistry` namespace provides centralized tool management:

### Registration

```typescript
import { ToolRegistry } from './registry.js';
import { readTool } from './read.js';

// Register a tool
ToolRegistry.register(readTool, {
  permissions: { required: ['read'] },
  descriptionPath: 'src/tools/read.txt',  // Optional external description
});
```

### Initialization

```typescript
// Initialize and get LangChain tools
const tools = await ToolRegistry.tools({
  initCtx: { workingDir: '/project' },
  createContext: (toolId, callId) => myContext,
  onToolResult: (result) => console.log(result),
});
```

### Key Functions

| Function | Description |
|----------|-------------|
| `register(info, options)` | Register a tool definition |
| `unregister(id)` | Remove a tool |
| `tools(options)` | Get initialized LangChain tools |
| `execute(id, args, ctx)` | Execute a tool directly |
| `get(id)` | Get tool info by ID |
| `enabled(permissions)` | Filter by permission set |

### Permission System

Tools declare required and optional permissions:

```typescript
interface ToolPermissions {
  required: ToolPermission[];  // Must have all
  optional?: ToolPermission[]; // Enhance if available
}

type ToolPermission = 'read' | 'write' | 'execute' | 'network';
```

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                     Tool Registration                        │
│                                                              │
│  Tool.define('read', { ... })                                │
│         │                                                    │
│         ▼                                                    │
│  ToolRegistry.register(readTool, { permissions })            │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                   ToolRegistry                          │ │
│  │                                                         │ │
│  │ Map<id, { info, permissions, initialized?, langchain? }>│ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    Tool Initialization                       │
│                                                              │
│  ToolRegistry.tools({ initCtx, createContext })              │
│         │                                                    │
│         ▼                                                    │
│  For each tool:                                              │
│    1. Call info.init(initCtx)                                │
│    2. Load external description (if configured)              │
│    3. Create DynamicStructuredTool wrapper                   │
│    4. Cache for reuse                                        │
│         │                                                    │
│         ▼                                                    │
│  Return StructuredToolInterface[]                            │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    Tool Execution                            │
│                                                              │
│  LangChain Agent calls tool.invoke(args)                     │
│         │                                                    │
│         ▼                                                    │
│  DynamicStructuredTool.func():                               │
│    1. Create Tool.Context                                    │
│    2. Call initialized.execute(args, ctx)                    │
│    3. Capture Tool.Result                                    │
│    4. Store in lastResults                                   │
│    5. Emit via onToolResult callback                         │
│    6. Serialize result.output for LLM consumption            │
│       (string passed directly; objects JSON-stringified)     │
└──────────────────────────────────────────────────────────────┘
```

---

## Execution Flow

### Tool Call Lifecycle

```
Agent receives tool call from LLM
         │
         ▼
ToolRegistry.execute(id, args, ctx)
         │
         ▼
┌─────────────────────────────────────┐
│ 1. Lookup tool in registry          │
│ 2. Ensure initialized               │
│ 3. Create execution context         │
└─────────────────────────────────────┘
         │
         ▼
initialized.execute(args, ctx)
         │
         ├──► ctx.metadata({ title: '...' })  [progress updates]
         │
         ▼
Return Tool.Result
         │
         ▼
┌─────────────────────────────────────┐
│ Store result in lastResults         │
│ Emit via onToolResult callback      │
│ Format output string for LLM        │
└─────────────────────────────────────┘
```

### Result Streaming

Tools can stream metadata updates during execution:

```typescript
execute: async (args, ctx) => {
  ctx.metadata({ title: 'Starting...' });

  for (const file of files) {
    ctx.metadata({ title: `Processing ${file}...` });
    await processFile(file);
  }

  return {
    title: 'Completed processing',
    metadata: { processedCount: files.length },
    output: 'All files processed successfully',
  };
}
```

---

## External Descriptions

Tools can load descriptions from external files for longer documentation:

```
src/tools/
├── read.ts       # Tool implementation
└── read.txt      # External description (loaded at init)
```

**Template Variables:**
- `${workspace}` - Resolves to `AGENT_WORKSPACE_ROOT` env var if set, otherwise falls back to `process.cwd()`
- `${directory}`, `${cwd}` - Current working directory

---

## Built-in Tools

| Tool | Permission | Description |
|------|------------|-------------|
| `read` | read | Read file contents with line numbers, offset/limit |
| `write` | write | Create or overwrite files with workspace validation |
| `edit` | write | In-place file editing with search/replace patterns |
| `glob` | read | Find files matching glob patterns |
| `grep` | read | Search file contents with regex, context lines |
| `list` | read | List directory contents with entry limit (truncates) |
| `bash` | execute | Execute shell commands with timeout/abort |
| `task` | execute | Spawn subagent for complex tasks (planned) |
| `todowrite` | read | Write/update task list for tracking |
| `todoread` | read | Read current task list |
| `webfetch` | network | Fetch URL contents with HTML sanitization |

**Note:** Subagent execution is planned; current `task` tool returns a `Tool.Result` with `metadata.error: 'LLM_ASSIST_REQUIRED'` for the Agent layer to handle.

---

## Adding a New Tool

1. **Create tool file** (`src/tools/mytool.ts`):

```typescript
import { z } from 'zod';
import { Tool } from './tool.js';

interface MyMetadata extends Tool.Metadata {
  // tool-specific fields
}

export const myTool = Tool.define<MySchema, MyMetadata>('mytool', {
  description: 'Brief description (under 40 tokens)',
  parameters: z.object({
    param: z.string().describe('Parameter description'),
  }),
  execute: async (args, ctx) => {
    return {
      title: 'Result title',
      metadata: { /* ... */ },
      output: 'Result text',
    };
  },
});
```

2. **Register in index** (`src/tools/index.ts`):

```typescript
import { myTool } from './mytool.js';

registerBuiltinTools(TOOLS_DIR, [
  // ... existing tools
  { tool: myTool, permissions: { required: ['read'] } },
]);
```

3. **Add tests** (`src/tools/__tests__/mytool.test.ts`)

4. **Optional: Add external description** (`src/tools/mytool.txt`)

---

## Tool Documentation Standards

### Description Guidelines

| Complexity | Token Limit | Content |
|------------|-------------|---------|
| Simple | 10-20 | What it does in one sentence |
| Complex | 25-40 | Purpose, constraints, defaults |

**Include:** What it does, critical constraints, prerequisites
**Exclude:** Code examples, response structures, detailed param docs

### Parameter Documentation

Use Zod `.describe()` for parameter docs:

```typescript
z.object({
  path: z.string().describe('Absolute file path'),
  encoding: z.string().default('utf-8').describe('File encoding'),
})
```

---

## Related Documentation

- [Tool Development Guide](../guides/tools.md) - Implementation patterns
- [Core Interfaces](./core-interfaces.md) - Tool.Result, Tool.Context
- [Permissions Architecture](./permissions.md) - Permission model
