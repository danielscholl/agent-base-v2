# Extension Points

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

2. **Register in index** (`src/tools/index.ts`):

```typescript
import { myTool } from './<name>.js';

registerBuiltinTools(TOOLS_DIR, [
  // ... existing tools
  { tool: myTool, permissions: { required: ['read'] } },
]);
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
└── toolsets/
    └── index.ts
```

2. **Write manifest** (`SKILL.md`):

```yaml
---
name: my-skill
description: My custom skill
version: 1.0.0
toolsets:
  - "toolsets/index:MyToolset"
triggers:
  keywords: ["custom", "my"]
---

# My Skill

Instructions for using this skill...
```

3. **Implement toolset** (`toolsets/index.ts`):

```typescript
import { z } from 'zod';
import { Tool } from '@agent/tools';

export const customTool = Tool.define('custom-tool', {
  description: 'Does something custom',
  parameters: z.object({
    input: z.string(),
  }),
  execute: async (args, ctx) => ({
    title: 'Custom result',
    metadata: {},
    output: `Processed: ${args.input}`,
  }),
});

export const MyToolset = [customTool];
```

---

## Adding a Command

For slash commands in the CLI:

1. **Create command file** (`src/commands/<name>.tsx`):

```typescript
import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  args: string[];
}

export function MyCommand({ args }: Props): React.ReactElement {
  return (
    <Box>
      <Text>Command output...</Text>
    </Box>
  );
}

export const command = {
  name: '<name>',
  description: 'Command description',
  usage: '/<name> [args]',
  component: MyCommand,
};
```

2. **Register in CLI** (`src/cli.tsx`):

```typescript
import { command as myCommand } from './commands/<name>.js';

const commands = [
  // ... existing commands
  myCommand,
];
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
- [ ] Valid SKILL.md manifest
- [ ] Toolsets export array of tools
- [ ] Triggers defined for progressive disclosure
- [ ] Instructions clear for LLM use

---

## Related Documentation

- [Tools Architecture](./tools.md) - Tool patterns
- [Providers Architecture](./providers.md) - Provider patterns
- [Skills Architecture](./skills.md) - Skill patterns
