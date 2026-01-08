# Skills Architecture

> **Status:** Current
> **Source of truth:** [`src/skills/manifest.ts`](../../src/skills/manifest.ts), [`src/skills/context-provider.ts`](../../src/skills/context-provider.ts), [`src/skills/installer.ts`](../../src/skills/installer.ts)

This document describes the skills system, including manifests, progressive disclosure, and plugin management.

---

## Overview

Skills extend the agent's capabilities through:

- **SKILL.md manifests** with YAML front matter (Agent Skills spec)
- **Progressive disclosure** for efficient context usage (3-tier model)
- **Resource directories** for scripts, references, and assets
- **Plugin installation** from git repositories
- **Skill management** (enable/disable/update/remove)

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

### Metadata Fields

The `metadata` field supports arbitrary key-value strings. The following keys have special meaning:

| Key | Description |
|-----|-------------|
| `author` | Skill author name |
| `version` | Skill version |
| `tags` | Space-delimited keywords for search |
| `requires` | Space-delimited CLI commands required for the skill (see [Dependency Validation](#dependency-validation)) |

**Validation Rules:**
- `name` must match directory name
- `name` pattern: `^[a-z0-9]+(-[a-z0-9]+)*$` (no leading/trailing/consecutive hyphens)
- Schema is **strict** - unknown fields are rejected (including planned fields like `toolsets` and `triggers`)

**Example bundled skill:** See [`src/_bundled_skills/gh/SKILL.md`](../../src/_bundled_skills/gh/SKILL.md) for a real-world example.

---

## Progressive Disclosure (3-Tier Model)

The context provider implements a 3-tier disclosure model to minimize context window usage:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Three-Tier Disclosure                        │
│                                                                 │
│  Tier 1: Metadata (~100 tokens/skill)                           │
│  ├── When: System prompt injection at startup                   │
│  └── Shows: <available_skills> XML with names + descriptions    │
│                                                                 │
│  Tier 2: Instructions (<5000 tokens)                            │
│  ├── When: Agent activates a skill                              │
│  └── Shows: Full SKILL.md content                               │
│                                                                 │
│  Tier 3: Resources (as needed)                                  │
│  ├── When: Agent requests specific resource                     │
│  └── Shows: Content from scripts/, references/, assets/         │
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
| Plugin | `~/.agent/plugins/` | Installed via `agent skill install` |
| User | `~/.agent/skills/` | Manually created by user |
| Claude | `./.claude/skills/` | Claude Code compatible (project-specific) |
| Project | `./.agent/skills/` | Project-specific |

**Priority:** When skills have the same name, later sources override earlier ones: `plugin > project > claude > user > bundled`

### Claude Code Compatibility

The `.claude/skills/` directory provides compatibility with [Claude Code](https://claude.ai/code)'s project customization conventions. This allows users to maintain a single set of workspace customizations that work across both Claude Code and Agent Harness.

**Directory structure:**
```
<workspace-root>/.claude/
├── skills/           # Claude Code compatible skills
│   └── my-skill/
│       ├── SKILL.md
│       ├── scripts/
│       └── references/
└── commands/         # Claude Code compatible commands
    └── deploy.md
```

**Behavior:**
- Skills in `.claude/skills/` are automatically discovered alongside `.agent/skills/`
- `.agent/skills/` takes priority over `.claude/skills/` (allows project-specific overrides)
- Missing `.claude/` directory is handled gracefully (no errors)
- Same symlink security validation applies to `.claude/` directories

---

## CLI Commands

The skill CLI provides commands for viewing and managing skills:

```bash
# Show all skills with status
agent skill show

# Install a plugin from git
agent skill install https://github.com/user/my-skill
agent skill install https://github.com/user/my-skill --ref v1.0.0
agent skill install https://github.com/user/my-skill --name custom-name

# Manage skills
agent skill manage                    # Show available actions
agent skill manage disable gh         # Disable a bundled skill
agent skill manage enable gh          # Re-enable a skill
agent skill manage update my-plugin   # Update a plugin (git pull)
agent skill manage remove my-plugin   # Remove a plugin
agent skill manage list               # List installed plugins
```

---

## Plugin Installation

Plugins are skills installed from git repositories. The installer:

1. **Clones** the repository with `--depth 1` for efficiency
2. **Validates** that SKILL.md exists and is valid
3. **Renames** the directory to match the manifest name
4. **Tracks** the plugin in `~/.agent/config.yaml`

```typescript
// Installation API
interface InstallOptions {
  url: string;           // Git repository URL
  ref?: string;          // Branch/tag/commit
  name?: string;         // Override skill name
}

interface InstallResult {
  success: boolean;
  skillName: string;
  path: string;
  error?: string;
}
```

**Error Handling:**
- Invalid git URL: Clear error message
- Missing SKILL.md: Rollback (remove cloned directory)
- Invalid manifest: Rollback with validation errors
- Name conflict: Prompt to rename or skip
- Network failure: Clean up partial clone

---

## Configuration

Skills are configured in `~/.agent/config.yaml`:

```yaml
skills:
  # Installed plugins (tracked automatically)
  plugins:
    - url: "https://github.com/user/my-skill"
      name: "my-skill"
      enabled: true
      installedAt: "2024-01-05T10:30:00Z"
    - url: "https://github.com/user/another-skill"
      ref: "v1.0.0"
      enabled: false
      installedAt: "2024-01-04T15:20:00Z"

  # Custom plugins directory (default: ~/.agent/plugins)
  pluginsDir: "~/.agent/plugins"

  # Custom user skills directory (default: ~/.agent/skills)
  userDir: "~/.agent/skills"

  # Disable bundled skills by name
  disabledBundled:
    - "gh"

  # Only enable specific bundled skills (overrides defaults)
  enabledBundled: []

  # Script execution timeout (planned)
  scriptTimeout: 30000
```

### Plugin Schema

```typescript
interface PluginDefinition {
  url: string;           // Git repository URL (required)
  ref?: string;          // Branch/tag/commit
  name?: string;         // Override skill name
  enabled?: boolean;     // Default: true
  installedAt?: string;  // ISO timestamp
}
```

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

> **Warning:** Adding `toolsets` to your SKILL.md will currently fail validation. The strict schema rejects unknown fields.

```yaml
---
name: my-skill
description: Skill with custom tools
toolsets:
  - "toolsets/index:MyToolset"
---
```

### Trigger-Based Activation (Planned)

> **Warning:** Adding `triggers` to your SKILL.md will currently fail validation. The strict schema rejects unknown fields.

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

## Dependency Validation

Skills can declare CLI command dependencies using the `metadata.requires` field. The framework checks if these commands are available on the system during skill discovery.

### How It Works

1. **Declaration**: Add `requires: command1 command2` to your skill's metadata
2. **Discovery**: During skill loading, the framework checks command availability
3. **Marking**: Skills with missing dependencies are marked `unavailable: true`
4. **Filtering**: Unavailable skills are excluded from the LLM system prompt

### Example

```yaml
---
name: gh
description: GitHub CLI skill
metadata:
  author: Agent Framework Team
  version: 1.0.0
  requires: gh
---
```

### Command Checking

- Uses `which` on Unix/macOS and `where` on Windows
- Timeout: 5 seconds per command
- Multiple commands can be specified (space-delimited)

### Skill Status in CLI

The `agent skill show` command displays skill status:

| Symbol | Status | Meaning |
|--------|--------|---------|
| `✓` | enabled | Skill is available and active |
| `○` | disabled | Skill is disabled by configuration |
| `✗` | unavailable | Missing required CLI commands |

**Example output:**
```
[Bundled Skills]
  ✓ hello-world
      A simple greeting skill (enabled)
  ✗ gh
      Expert guidance for using the GitHub CLI... (unavailable)
      missing commands: gh
```

### SkillLoaderOptions

```typescript
interface SkillLoaderOptions {
  // ... other options ...
  includeDisabled?: boolean;    // Include disabled skills (default: false)
  includeUnavailable?: boolean; // Include unavailable skills (default: false)
}
```

### DiscoveredSkill Fields

```typescript
interface DiscoveredSkill {
  // ... other fields ...
  disabled?: boolean;           // Disabled by configuration
  unavailable?: boolean;        // Missing dependencies
  unavailableReason?: string;   // e.g., "missing commands: gh, docker"
}
```

---

## Related Documentation

- [Tools Architecture](./tools.md) - Tool definition patterns
- [Configuration](./configuration.md) - Skills configuration
