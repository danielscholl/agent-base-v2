# Extension Points

> **Status:** Current
> **Source of truth:** Various source files (see individual sections)

This document describes how to extend the agent framework with new capabilities.

---

## Overview

The framework provides several extension points:

| Extension | Purpose |
|-----------|---------|
| Providers | Add new LLM providers |
| Tools | Add new tool capabilities |
| Skills | Package tools with documentation |
| Callbacks | Add custom lifecycle hooks |

---

## Adding a Provider

1. **Create factory** (`src/model/providers/<name>.ts`):

```typescript
import { Chat<Provider> } from '@langchain/<package>';
import { successResponse, errorResponse, mapErrorToCode } from '../base.js';
import type { ModelResponse } from '../types.js';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export function create<Provider>Client(
  config: Record<string, unknown>
): Promise<ModelResponse<BaseChatModel>> {
  try {
    const apiKey = (config.apiKey as string) || process.env.<PROVIDER>_API_KEY;
    const model = (config.model as string) || 'default-model';

    const client = new Chat<Provider>({
      model,
      apiKey,
    });

    return Promise.resolve(
      successResponse(client, `Created ${model} client`)
    );
  } catch (error) {
    const code = mapErrorToCode(error);
    const message = error instanceof Error ? error.message : 'Failed to create client';
    return Promise.resolve(errorResponse(code, message));
  }
}
```

2. **Register factory** (`src/model/registry.ts`):

```typescript
import { create<Provider>Client } from './providers/<name>.js';

export const PROVIDER_REGISTRY = {
  // ... existing providers
  <name>: create<Provider>Client,
};
```

3. **Export from module** (`src/model/index.ts`):

```typescript
export { create<Provider>Client } from './providers/<name>.js';
```

4. **Add config schema** (`src/config/schema.ts`):

```typescript
export const <Provider>ConfigSchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().default('default-model'),
});
```

5. **Write tests** (`src/model/__tests__/<name>.test.ts`)

---

## Adding a Tool

1. **Create tool file** (`src/tools/<name>.ts`):

```typescript
import { z } from 'zod';
import { Tool } from './tool.js';

interface MyMetadata extends Tool.Metadata {
  // Tool-specific metadata fields
}

export const myTool = Tool.define<MySchema, MyMetadata>('<name>', {
  description: 'Brief description (under 40 tokens)',
  parameters: z.object({
    param: z.string().describe('Parameter description'),
  }),
  execute: async (args, ctx) => {
    // Stream progress
    ctx.metadata({ title: 'Working...' });

    // Do work
    const result = await doSomething(args);

    return {
      title: 'Completed',
      metadata: { /* tool-specific */ },
      output: result,
    };
  },
});
```

2. **Register the tool** (`src/tools/index.ts`):

```typescript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ToolRegistry } from './registry.js';
import { myTool } from './<name>.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Add to toolPermissions map
const toolPermissions: Record<string, ToolPermissions> = {
  // ... existing tools
  mytool: { required: ['read'] },
};

// Add to builtinTools array
const builtinTools = [
  // ... existing tools
  { tool: myTool, permissions: toolPermissions.mytool },
];

// Registration happens in the existing loop:
for (const { tool, permissions } of builtinTools) {
  const descriptionPath = path.join(__dirname, `${tool.id}.txt`);
  ToolRegistry.register(tool, { permissions, descriptionPath });
}
```

3. **Optional: Add external description** (`src/tools/<name>.txt`)

4. **Write tests** (`src/tools/__tests__/<name>.test.ts`)

---

## Adding a Callback

1. **Add method to interface** (`src/agent/callbacks.ts`):

```typescript
export interface AgentCallbacks {
  // ... existing callbacks

  /** Called when custom event occurs */
  onCustomEvent?(ctx: SpanContext, data: CustomData): void;
}
```

2. **Emit from Agent** (`src/agent/agent.ts`):

```typescript
// At appropriate point in Agent lifecycle
this.callbacks.onCustomEvent?.(spanContext, { ... });
```

3. **Subscribe in CLI** (`src/cli.tsx`):

```typescript
const callbacks: AgentCallbacks = {
  onCustomEvent: (ctx, data) => {
    // Update UI state
  },
};
```

---

## Adding a Skill

1. **Create skill directory:**

```
~/.agent/skills/my-skill/
├── SKILL.md
└── references/
    └── examples.md
```

2. **Write manifest** (`SKILL.md`):

```yaml
---
name: my-skill
description: My custom skill for doing useful things
license: MIT
compatibility: Requires Node.js 18+
---

# My Skill

Instructions for using this skill...
```

**Note:** Toolsets and triggers are planned features not yet implemented. See [Skills Architecture](./skills.md) for the current manifest schema.

---

## Adding a Command

Commands use a handler-based pattern (not React components).

**Source of truth:** [`src/cli/commands/types.ts`](../../src/cli/commands/types.ts)

1. **Create command file** (`src/cli/commands/<name>.ts`):

```typescript
import type { CommandHandler, CommandResult, CommandDefinition } from './types.js';

const handler: CommandHandler = async (args, context): Promise<CommandResult> => {
  // Access config, output callbacks, etc.
  const { config, onOutput } = context;

  // Do command work
  onOutput('Command output...', 'info');

  return {
    success: true,
    message: 'Command completed',
  };
};

export const myCommand: CommandDefinition = {
  aliases: ['mycommand', 'mc'] as const,
  description: 'Brief description for help',
  handler,
  usage: '/mycommand [args]',
};
```

2. **Register in index** (`src/cli/commands/index.ts`):

```typescript
import { myCommand } from './mycommand.js';

export const COMMANDS: CommandDefinition[] = [
  // ... existing commands
  myCommand,
];
```

### CommandResult Options

```typescript
interface CommandResult {
  success: boolean;
  message?: string;
  shouldExit?: boolean;           // Exit shell after command
  shouldClear?: boolean;          // Clear screen
  shouldClearHistory?: boolean;   // Clear conversation
  shouldSaveSession?: boolean;    // Save current session
  sessionName?: string;           // Session name for save
  sessionToResume?: string;       // Session ID to resume
  data?: unknown;                 // Additional data
}
```

---

## Extension Checklist

### Provider
- [ ] Factory function in `src/model/providers/`
- [ ] Registered in `PROVIDER_REGISTRY`
- [ ] Exported from `src/model/index.ts`
- [ ] Config schema in `src/config/schema.ts`
- [ ] Tests with mocked LangChain client

### Tool
- [ ] Tool file in `src/tools/`
- [ ] Registered in `registerBuiltinTools()`
- [ ] Description under 40 tokens
- [ ] Zod schema with `.describe()` on params
- [ ] Returns `Tool.Result`, never throws
- [ ] Tests covering success and error cases

### Skill
- [ ] Valid SKILL.md manifest (name, description required)
- [ ] Skill name matches directory name
- [ ] Name follows pattern: lowercase alphanumeric + hyphens
- [ ] Instructions clear for LLM use in markdown body

---

## Related Documentation

- [Tools Architecture](./tools.md) - Tool patterns
- [Providers Architecture](./providers.md) - Provider patterns
- [Skills Architecture](./skills.md) - Skill patterns
