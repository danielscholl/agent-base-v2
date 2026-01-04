# Skills Architecture

> **Status:** Partial Implementation
> **Source of truth:** [`src/skills/manifest.ts`](../../src/skills/manifest.ts), [`src/skills/context-provider.ts`](../../src/skills/context-provider.ts)

This document describes the skills system, including manifests and progressive disclosure.

---

## Overview

Skills extend the agent's capabilities through:

- **SKILL.md manifests** with YAML front matter (Agent Skills spec)
- **Progressive disclosure** for efficient context usage (3-tier model)
- **Resource directories** for scripts, references, and assets

> **Note:** The following features are **planned but not yet implemented**:
> - Toolsets (dynamic tool loading from skill directories)
> - Trigger-based automatic activation
> - Script execution

---

## Skill Structure

```
skills/
└── my-skill/
    ├── SKILL.md              # Manifest (YAML front matter + instructions)
    ├── scripts/              # Tier 3 resources (planned)
    ├── references/           # Tier 3 resources
    └── assets/               # Tier 3 resources
```

---

## Manifest Format (SKILL.md)

The manifest follows the [Agent Skills specification](https://agentskills.io/specification):

```yaml
---
name: my-skill
description: Brief description of what this skill does and when to use it
license: MIT
compatibility: Requires Node.js 18+
metadata:
  author: Your Name
  version: "1.0.0"
allowed-tools: "Bash(git:*) Read"
---

# My Skill

Instructions for the LLM on how to use this skill.

## Usage

Detailed usage examples and guidance...
```

---

## Manifest Fields (SkillManifestSchema)

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Skill identifier (1-64 chars, lowercase alphanumeric + hyphens) |
| `description` | Yes | Brief description (1-1024 chars) |
| `license` | No | License name or file reference |
| `compatibility` | No | Environment requirements (1-500 chars) |
| `metadata` | No | Arbitrary key-value string mapping |
| `allowed-tools` | No | Space-delimited tool patterns (experimental) |

**Validation Rules:**
- `name` must match directory name
- `name` pattern: `^[a-z0-9]+(-[a-z0-9]+)*$` (no leading/trailing/consecutive hyphens)
- Schema is **strict** - unknown fields are rejected

---

## Progressive Disclosure (3-Tier Model)

The context provider implements a 3-tier disclosure model to minimize context window usage:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Three-Tier Disclosure                        │
│                                                                 │
│  Tier 1: Metadata (~100 tokens/skill)                          │
│  ├── When: System prompt injection at startup                  │
│  └── Shows: <available_skills> XML with names + descriptions   │
│                                                                 │
│  Tier 2: Instructions (<5000 tokens)                           │
│  ├── When: Agent activates a skill                             │
│  └── Shows: Full SKILL.md content                              │
│                                                                 │
│  Tier 3: Resources (as needed)                                 │
│  ├── When: Agent requests specific resource                    │
│  └── Shows: Content from scripts/, references/, assets/        │
└─────────────────────────────────────────────────────────────────┘
```

---

## SkillContextProvider API

```typescript
class SkillContextProvider {
  // Tier 1: Get metadata for all skills (injected in system prompt)
  getTier1Context(): string;

  // Tier 2: Get full instructions for a specific skill
  async getTier2Context(skillName: string): Promise<string | null>;

  // Tier 3: List available resources for a skill
  async getTier3ResourceList(
    skillName: string,
    resourceType: 'scripts' | 'references' | 'assets'
  ): Promise<string[]>;

  // Tier 3: Get specific resource content
  async getTier3Resource(
    skillName: string,
    resourcePath: string
  ): Promise<string | null>;

  // Utility methods
  getSkill(name: string): DiscoveredSkill | undefined;
  getSkillNames(): string[];
}
```

---

## Tier 1 XML Format

The `getTier1Context()` method generates an `<available_skills>` XML block:

```xml
<available_skills>
<skill>
<name>my-skill</name>
<description>Brief description of what this skill does</description>
<location>/path/to/my-skill/SKILL.md</location>
</skill>
<skill>
<name>another-skill</name>
<description>Another skill description</description>
<location>/path/to/another-skill/SKILL.md</location>
</skill>
</available_skills>
```

**Note:** Each `<skill>` element contains nested `<name>`, `<description>`, and `<location>` elements.

---

## Skill Sources

| Source | Location | Lifecycle |
|--------|----------|-----------|
| Bundled | `src/_bundled_skills/` | Shipped with agent |
| User plugins | `~/.agent/skills/` | Installed by user |
| Project | `./.agent/skills/` | Project-specific |

---

## Security: Path Traversal Protection

Tier 3 resource access includes defense-in-depth protection:

1. **Pre-check**: Rejects obvious path traversal (`../`, absolute paths)
2. **Post-check**: Resolves symlinks via `realpath()` and validates containment

```typescript
// Rejected: ../../../etc/passwd
// Rejected: /etc/passwd
// Rejected: symlink -> ../../sensitive
```

---

## Creating a Skill

1. **Create skill directory:**

```
~/.agent/skills/my-skill/
├── SKILL.md
└── references/
    └── examples.md
```

2. **Write manifest (SKILL.md):**

```yaml
---
name: my-skill
description: My custom skill for doing useful things
---

# My Skill

Instructions for the LLM on how to use this skill.
```

---

## Planned Features

The following features are documented for future implementation:

### Toolsets (Planned)

```yaml
---
name: my-skill
description: Skill with custom tools
toolsets:
  - "toolsets/index:MyToolset"
---
```

### Trigger-Based Activation (Planned)

```yaml
---
name: my-skill
description: Skill with triggers
triggers:
  keywords: ["hello", "greet"]
  verbs: ["say", "wave"]
  patterns: ["greet\\s+\\w+"]
---
```

### Script Execution (Planned)

Scripts will run as isolated Bun subprocesses with safety limits:

| Limit | Default |
|-------|---------|
| Timeout | 60 seconds |
| Output size | 1MB |
| Working directory | Skill directory |

---

## Related Documentation

- [Tools Architecture](./tools.md) - Tool definition patterns
- [Configuration](./configuration.md) - Skills configuration
