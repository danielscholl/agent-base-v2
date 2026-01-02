# Tool Development Guide

This guide provides patterns and examples for implementing tools using the `Tool.define()` pattern. For governing rules, see [CLAUDE.md](../../CLAUDE.md).

---

## Tool Result Contract

All tools return a structured `Tool.Result` type. This provides uniform output format and enables metadata streaming.

### Type Definitions

```typescript
interface Result<M extends Metadata = Metadata> {
  /** Short title describing what was done */
  title: string;
  /** Tool-specific metadata */
  metadata: M;
  /** Text output (consumed by LLM) */
  output: string;
  /** Optional binary attachments */
  attachments?: Attachment[];
}
```

### Error Handling

Tools throw errors for failure cases. The registry catches these and formats them appropriately:

```typescript
execute: async (args, ctx) => {
  if (!fileExists(args.path)) {
    throw new Error(`File not found: ${args.path}`);
  }
  // ... success path
}
```

---

## Basic Tool Implementation

Tools use the `Tool.define()` factory from `src/tools`:

```typescript
import { z } from 'zod';
import { Tool } from '../tools/index.js';

// Define metadata type for type safety
interface ReadMetadata extends Tool.Metadata {
  path: string;
  bytes: number;
}

// Define the tool
export const readTool = Tool.define<ReadSchema, ReadMetadata>('read', {
  description: 'Read file contents with line numbers',
  parameters: z.object({
    path: z.string().describe('Absolute file path to read'),
    offset: z.number().optional().describe('Line offset to start from'),
    limit: z.number().optional().describe('Maximum lines to read'),
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

**Tool.define(id, definition)** - Factory that creates a `Tool.Info` object:
- `id`: Unique tool identifier
- `definition`: Object with description, parameters, and execute function

**Tool.Context** - Execution context provided to every tool:
- `sessionID`: Current session identifier
- `messageID`: Current message turn
- `agent`: Agent name executing the tool
- `abort`: AbortSignal for cancellation
- `metadata()`: Stream progress updates to UI

**Tool.Result** - Standardized return type:
- `title`: Short summary for UI display
- `metadata`: Tool-specific structured data
- `output`: Text content for LLM consumption

---

## Error Handling Patterns

### Throwing Errors

For failures, throw an Error with a descriptive message:

```typescript
import { z } from 'zod';
import { Tool } from '../tools/index.js';

interface FileMetadata extends Tool.Metadata {
  path: string;
}

export const readFileTool = Tool.define<ReadSchema, FileMetadata>('read_file', {
  description: 'Read contents of a file',
  parameters: z.object({
    path: z.string().describe('File path to read'),
  }),
  execute: async (args, ctx) => {
    ctx.metadata({ title: `Reading ${args.path}...` });

    try {
      const content = await readFileInternal(args.path);
      return {
        title: `Read ${args.path}`,
        metadata: { path: args.path },
        output: content,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to read file';
      if (message.includes('ENOENT')) {
        throw new Error(`File not found: ${args.path}`);
      }
      if (message.includes('EACCES')) {
        throw new Error(`Permission denied: ${args.path}`);
      }
      throw new Error(`IO error: ${message}`);
    }
  },
});
```

### Async Initialization

For tools that need setup before execution:

```typescript
export const taskTool = Tool.define('task', async (ctx) => {
  // Async initialization - discover available agents
  const agents = await discoverAgents(ctx?.workingDir);

  return {
    description: `Spawn subagent. Available: ${agents.join(', ')}`,
    parameters: z.object({
      agent: z.enum(agents as [string, ...string[]]),
      prompt: z.string(),
    }),
    execute: async (args, toolCtx) => {
      // Execute with initialized resources
      return {
        title: `Spawned ${args.agent}`,
        metadata: { agent: args.agent },
        output: await runAgent(args.agent, args.prompt),
      };
    },
  };
});
```

---

## Permission-Aware Tools

Tools with side effects use the permission system:

```typescript
import { z } from 'zod';
import { Tool } from '../tools/index.js';

interface WriteMetadata extends Tool.Metadata {
  path: string;
  bytes: number;
}

export const writeFileTool = Tool.define<WriteSchema, WriteMetadata>('write_file', {
  description: 'Write content to a file (requires write permission)',
  parameters: z.object({
    path: z.string().describe('File path to write'),
    content: z.string().describe('Content to write'),
  }),
  execute: async (args, ctx) => {
    ctx.metadata({ title: `Writing ${args.path}...` });

    await writeFile(args.path, args.content);

    return {
      title: `Wrote ${args.path}`,
      metadata: { path: args.path, bytes: args.content.length },
      output: `Wrote ${args.content.length} bytes to ${args.path}`,
    };
  },
});
```

Register with permissions in `index.ts`:

```typescript
const builtinTools = [
  { tool: writeFileTool, permissions: { required: ['write'] } },
];
```

---

## Tool Documentation Standards

### Description Guidelines

- **Simple tools**: 10-20 tokens - what it does in one sentence
- **Complex tools**: 25-40 tokens - purpose, constraints, defaults
- **Include**: what it does, critical constraints, prerequisites
- **Exclude**: code examples, response structures, detailed parameter docs

### Using Zod Descriptions

Parameter documentation goes in Zod `.describe()`:

```typescript
import { z } from 'zod';
import { Tool } from '../tools/index.js';

export const searchTool = Tool.define('search', {
  description: 'Search codebase for matching content',  // Brief, under 40 tokens
  parameters: z.object({
    query: z.string().describe('Search query string'),
    limit: z.number().min(1).max(100).default(10).describe('Max results (1-100)'),
    caseSensitive: z.boolean().default(false).describe('Case-sensitive matching'),
  }),
  execute: async (args, ctx) => {
    const results = await performSearch(args);
    return {
      title: `Search: ${args.query}`,
      metadata: { query: args.query, count: results.length },
      output: results.map((r) => r.snippet).join('\n'),
    };
  },
});
```

---

## Context Storage

Tools producing large outputs should return summaries with previews:

```typescript
import { z } from 'zod';
import { Tool } from '../tools/index.js';

interface SearchMetadata extends Tool.Metadata {
  query: string;
  totalMatches: number;
}

export const searchCodeTool = Tool.define<SearchSchema, SearchMetadata>('search_code', {
  description: 'Search codebase with regex pattern',
  parameters: z.object({
    query: z.string().describe('Regex pattern to search'),
  }),
  execute: async (args, ctx) => {
    ctx.metadata({ title: `Searching for "${args.query}"...` });

    const results = await performSearch(args.query);

    // For large results, return summary with preview
    if (results.length > 50) {
      return {
        title: `Found ${results.length} matches`,
        metadata: { query: args.query, totalMatches: results.length },
        output: [
          `Found ${results.length} matches for "${args.query}"`,
          '',
          'Top 10 matches:',
          ...results.slice(0, 10).map((r) => `  ${r.file}:${r.line}: ${r.snippet}`),
          '',
          `... and ${results.length - 10} more matches`,
        ].join('\n'),
      };
    }

    return {
      title: `Found ${results.length} matches`,
      metadata: { query: args.query, totalMatches: results.length },
      output: results.map((r) => `${r.file}:${r.line}: ${r.snippet}`).join('\n'),
    };
  },
});
```

---

## Testing Tools

See [testing.md](./testing.md) for complete testing patterns. Quick example:

```typescript
import { readTool } from '../read.js';
import { Tool } from '../tool.js';

describe('readTool', () => {
  it('reads file contents', async () => {
    const ctx = Tool.createNoopContext();
    const initialized = readTool.init();
    const result = await initialized.execute({ path: '/tmp/test.txt' }, ctx);

    expect(result.title).toContain('Read');
    expect(result.output).toBeDefined();
  });

  it('handles missing files', async () => {
    const ctx = Tool.createNoopContext();
    const initialized = readTool.init();

    await expect(
      initialized.execute({ path: '/nonexistent' }, ctx)
    ).rejects.toThrow('not found');
  });
});
```

---

## Checklist

Before submitting a new tool:

- [ ] Uses `Tool.define()` factory from `src/tools/index.js`
- [ ] Returns `Tool.Result` with title, metadata, and output
- [ ] Uses descriptive error messages for failures
- [ ] Zod schema with `.describe()` on all parameters
- [ ] Description under 40 tokens
- [ ] Permissions declared in registration
- [ ] Large outputs use summary/preview pattern
- [ ] Unit tests with `Tool.createNoopContext()`
- [ ] No direct LLM calls (tools never call LLMs directly)
