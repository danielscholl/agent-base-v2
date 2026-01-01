# Skills Architecture

This document describes the skills system, including manifests, progressive disclosure, and toolset loading.

---

## Overview

Skills extend the agent's capabilities through:

- **SKILL.md manifests** with YAML front matter
- **Toolsets** for adding new tools
- **Progressive disclosure** for efficient context usage
- **Trigger matching** for automatic activation

---

## Skill Structure

```
skills/
└── hello-extended/
    ├── SKILL.md              # Manifest (YAML front matter + instructions)
    └── toolsets/
        └── index.ts          # Exported tool classes
```

---

## MVP Scope

| Feature | Status |
|---------|--------|
| Toolsets | **Included** |
| Script execution | Deferred to post-MVP |

**Toolsets vs Scripts:**

| Aspect | Toolsets | Scripts (Post-MVP) |
|--------|----------|-------------------|
| Context | Loaded into LLM | Not loaded |
| Latency | Low (in-process) | Higher (subprocess) |
| Dependencies | Shared with agent | Isolated per-script |
| Testing | Synchronous, mockable | Async subprocess |

---

## Manifest Format (SKILL.md)

```yaml
---
name: hello-extended
description: Extended greeting capabilities
version: 1.0.0
toolsets:
  - "toolsets/index:HelloToolset"     # path:Class format
triggers:
  keywords: ["hello", "greet", "greeting"]
  verbs: ["say", "wave"]
  patterns: ["greet\\s+\\w+"]
default_enabled: true
---

# Hello Extended Skill

Instructions for using this skill...
```

---

## Manifest Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Skill identifier (alphanumeric, hyphens, max 64 chars) |
| `description` | Yes | Brief description (max 500 chars) |
| `version` | No | Semantic version (e.g., "1.0.0") |
| `toolsets` | No | TypeScript toolset classes ("path:Class" format) |
| `scripts` | No | Script list (parsed but not executed in MVP) |
| `triggers.keywords` | No | Direct keyword matches (word boundary) |
| `triggers.verbs` | No | Action verbs (word boundary) |
| `triggers.patterns` | No | Regex patterns |
| `default_enabled` | No | For bundled skills (default: true) |
| `brief_description` | No | Auto-generated from first sentence if omitted |

---

## Progressive Disclosure

```
┌─────────────────────────────────────────────────────────────────┐
│                    Four-Tier Disclosure                          │
│                                                                  │
│  Tier 0: Nothing                                                │
│  └── When: No skills loaded or no match                         │
│                                                                  │
│  Tier 1: Breadcrumb (~10 tokens)                                │
│  ├── When: Skills exist with triggers but don't match query     │
│  └── Shows: "[N skills available]"                              │
│                                                                  │
│  Tier 2: Registry (~15 tokens/skill)                            │
│  ├── When: User asks "what can you do?" / "list skills"         │
│  │   OR skills have no triggers defined                         │
│  └── Shows: Skill names + brief descriptions                    │
│                                                                  │
│  Tier 3: Full Documentation (hundreds of tokens)                │
│  ├── When: Triggers match user query                            │
│  └── Shows: Complete skill instructions from SKILL.md           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Trigger Matching Flow

```
User Query
    │
    ▼
┌─────────────────────────────┐
│  Match against all skills:  │
│  • Keywords (exact match)   │
│  • Verbs (action words)     │
│  • Patterns (regex)         │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│  Rank matches by:           │
│  1. Explicit mention        │
│  2. Exact phrase match      │
│  3. Recent usage            │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│  Inject top N skills        │
│  (max_skills default: 3)    │
└─────────────────────────────┘
```

---

## Skill Sources

| Source | Location | Lifecycle |
|--------|----------|-----------|
| Bundled | `src/_bundled_skills/` | Shipped with agent |
| User plugins | `~/.agent/skills/` | Installed by user |
| Project | `./.agent/skills/` | Project-specific |

---

## Toolset Loading

```typescript
// SKILL.md specifies:
// toolsets:
//   - "toolsets/index:HelloToolset"

// Skill loader parses this and:
// 1. Resolves path relative to skill directory
// 2. Dynamic import of the module
// 3. Gets the named export (HelloToolset)
// 4. Registers tools with ToolRegistry
```

---

## Script Execution (Post-MVP)

Scripts will run as isolated Bun subprocesses with safety limits:

| Limit | Default |
|-------|---------|
| Timeout | 60 seconds |
| Output size | 1MB |
| Max arguments | 100 |
| Argument bytes | 4096 |
| Working directory | Skill directory |

---

## Creating a Skill

1. **Create skill directory:**

```
~/.agent/skills/my-skill/
├── SKILL.md
└── toolsets/
    └── index.ts
```

2. **Write manifest (SKILL.md):**

```yaml
---
name: my-skill
description: My custom skill
toolsets:
  - "toolsets/index:MyToolset"
triggers:
  keywords: ["my", "custom"]
---

# My Skill

Instructions for the LLM on how to use this skill.
```

3. **Implement toolset:**

```typescript
import { z } from 'zod';
import { Tool } from '@agent/tools';

export const myTool = Tool.define('my-tool', {
  description: 'Does something useful',
  parameters: z.object({
    input: z.string(),
  }),
  execute: async (args, ctx) => ({
    title: 'Completed',
    metadata: {},
    output: `Processed: ${args.input}`,
  }),
});

export const MyToolset = [myTool];
```

---

## Related Documentation

- [Tools Architecture](./tools.md) - Tool definition patterns
- [Configuration](./configuration.md) - Skills configuration
