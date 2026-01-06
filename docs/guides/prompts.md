# System Prompts Guide

This guide covers the compositional system prompt architecture and customization options.

---

## Design Philosophy

The prompt system is designed around a **specificity gradient**—from universal instructions down to personal preferences:

```
┌─────────────────────────────────────────────────────────────────┐
│                     SPECIFICITY GRADIENT                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   UNIVERSAL ──────────────────────────────────────► PERSONAL    │
│                                                                 │
│   Base        Provider     Environment   Project      User      │
│   Prompt   →  Layer     →  Context    →  (AGENTS.md)→ Override  │
│                                                                 │
│   "Be concise" "Use XML"  "On macOS"   "Run bun test" "I prefer │
│                                                       functional│
│                                                       patterns" │
└─────────────────────────────────────────────────────────────────┘
```

### Why Compositional?

| Problem | Solution |
|---------|----------|
| Duplicating prompts per provider is unmaintainable | Single base prompt + thin provider layers |
| Static prompts can't know runtime context | Dynamic environment section injected at startup |
| Generic agents don't know project conventions | AGENTS.md provides repository-specific guidance |
| Users have personal preferences | User override layer has final say |
| Loading all capabilities wastes tokens | Skills use progressive disclosure |

### Mental Model

Think of prompt assembly as **layered refinement**:

1. **Base** establishes defaults everyone agrees on
2. **Provider** optimizes for the specific LLM's strengths
3. **Environment** grounds the agent in reality (where am I? what date?)
4. **Project** teaches local conventions (how do I build? test? deploy?)
5. **Skills** add capabilities on-demand (not everything, just what's relevant)
6. **User** gets the final word on preferences

Each layer **adds context** later layers don't replace earlier ones, they refine them.

---

## Layer Reference

| Layer | Source | Size | Purpose |
|-------|--------|------|---------|
| **Base** | `src/prompts/base.md` | ~85 tokens | Agent identity, universal rules |
| **Provider** | `src/prompts/providers/{provider}.md` | ~10-25 tokens | Format/reasoning hints for specific LLMs |
| **Environment** | Generated at runtime | ~50 tokens | Working dir, git status, platform, date |
| **AGENTS.md** | `{workspaceRoot}/AGENTS.md` | varies | Project-specific conventions |
| **Skills** | Discovered from skill directories | varies | On-demand capabilities |
| **User** | `~/.agent/system.md` | varies | Personal preferences |

---

### 1. Base Prompt

**What it is:** Core instructions that apply to all providers and all projects.

**Why it exists:** Without a shared base, every provider would need its own complete prompt, leading to duplication and drift. When you fix a bug or add a guideline, it should propagate everywhere.

**Contains:**
- Agent role and identity
- Universal behavioral rules (be concise, no secrets, read before edit)
- Tool usage preferences (prefer Read over cat, Edit over sed)

**Source priority:**
1. `config.agent.systemPromptFile` (explicit override)
2. `~/.agent/system.md` (user's global default)
3. `src/prompts/base.md` (package default)

---

### 2. Provider Layer

**What it is:** Minimal additions (1-2 sentences) that optimize for a specific LLM's behavior.

**Why it exists:** Different LLMs respond better to different formats and reasoning styles. Claude handles XML well; GPT prefers JSON. Local models need simpler instructions.

**Contains only:**
- Format preferences (XML vs JSON)
- Reasoning hints (step-by-step for some models)
- Constraint awareness (for limited models)

**Current provider layers:**
- **Anthropic:** "Use XML tags for structured data. Think step-by-step for complex problems."
- **OpenAI:** "Prefer JSON for structured data."
- **Local:** "Context and tool support varies by model. Keep instructions simple. Break complex tasks into steps."

**Guidelines:**
- **Minimal:** 1-2 sentences, under 30 tokens
- **Behavioral:** Only include what changes model behavior
- **No redundancy:** Don't repeat what's in base prompt
- **Optional:** Missing layer = graceful fallback (Azure, GitHub, Gemini use underlying model defaults)

---

### 3. Environment Section

**What it is:** Runtime context dynamically generated when the agent starts.

**Why it exists:** Static prompts can't include information that's only known at runtime. The agent needs to know where it's operating, what platform it's on, and what the current state is.

**Contains:**
- Working directory (absolute path)
- Git repository status (branch, clean/dirty)
- Platform and OS version
- Current date

**Output example:**
```markdown
# Environment

Working directory: /Users/dev/my-project
Git repository: Yes (branch: main, clean)
Platform: macOS (Darwin 25.2.0)
Date: 2026-01-06
```

**Why each field matters:**
| Field | Why the agent needs it |
|-------|------------------------|
| Working directory | Absolute paths for file operations |
| Git status | Informs commit, branch, and PR decisions |
| Platform | Determines valid commands (macOS vs Windows) |
| Date | Temporal awareness for docs, logging, time-sensitive tasks |

---

### 4. AGENTS.md (Project Context)

**What it is:** A standardized file where repositories provide AI-specific instructions.

**Why it exists:** README.md is for humans. AGENTS.md is for AI agents. Every project has unique conventions—build commands, test patterns, coding standards—that a generic agent can't know.

**Spec:** [agents.md](https://agents.md/)

**Discovery order:**
1. `{workspaceRoot}/AGENTS.md`
2. `{workspaceRoot}/.agent/AGENTS.md`

**Example:**
```markdown
# Build & Test
- Run tests: `bun run test`
- Type check: `bun run typecheck`

# Conventions
- Use conventional commits
- 85% test coverage minimum
- No `any` types without justification
```

**Key behavior:** Always loads from **workspace root**, not current directory. This ensures AGENTS.md is found even when invoked from a subdirectory.

---

### 5. Skills Section

**What it is:** XML listing of available capabilities, injected based on relevance.

**Why it exists:** Loading full documentation for every possible skill wastes context tokens. Progressive disclosure means: load GitHub CLI docs only when the user mentions PRs or issues.

**Output example:**
```xml
<available_skills>
<skill>
<name>gh</name>
<description>GitHub CLI integration</description>
</skill>
</available_skills>
```

See the [Skills documentation](../architecture/skills.md) for details on trigger matching.

---

### 6. User Override

**What it is:** Personal customizations that apply across all projects.

**Why it exists:** Users have preferences the agent should respect. They shouldn't need to fork the agent or modify core prompts to express "I prefer functional patterns" or "always run tests first."

**Location:** `~/.agent/system.md`

**Example:**
```markdown
## My Preferences
- Prefer functional programming patterns
- Always run tests before suggesting commits
- Use TypeScript strict mode
```

**Comes last:** User instructions are appended at the end, giving them effective priority.

---

## Prompt Assembly Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROMPT ASSEMBLY ORDER                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. BASE PROMPT (src/prompts/base.md)                           │
│     └─ Core identity, role, guidelines                          │
│                                                                 │
│  2. PROVIDER LAYER (src/prompts/providers/{provider}.md)        │
│     └─ Provider-specific preferences (optional)                 │
│                                                                 │
│  3. ENVIRONMENT SECTION (dynamically generated)                 │
│     └─ Working directory, git status, platform, date            │
│                                                                 │
│  4. AGENTS.md ({workspaceRoot}/AGENTS.md)                       │
│     └─ Project-specific agent instructions (optional)           │
│                                                                 │
│  5. SKILLS SECTION (<available_skills> XML)                     │
│     └─ Progressive skill disclosure                             │
│                                                                 │
│  6. USER OVERRIDE (config or ~/.agent/system.md)                │
│     └─ Custom user instructions                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/prompts/
├── base.md                    # Core agent instructions (all providers)
└── providers/                 # Provider-specific layers (minimal)
    ├── anthropic.md          # Claude: XML tags, step-by-step reasoning
    ├── foundry.local.md      # Foundry local: simpler instructions
    ├── local.md              # Ollama/Docker: context constraints
    └── openai.md             # OpenAI: JSON preference
```

**Note:** Azure OpenAI, GitHub Models, and Gemini use their underlying model behaviors and don't require separate provider layers. The framework gracefully falls back when no provider layer exists.

---

## Customizing Prompts

### User Default Location

Create a file at `~/.agent/system.md` to add custom instructions that append to the base prompt:

```markdown
---
title: My Custom Instructions
version: 1.0
---

## Additional Guidelines

- Focus on TypeScript and JavaScript
- Prefer functional programming patterns
- Always run tests before committing
```

### Config Override

Set a specific system prompt file in your configuration (`~/.agent/config.yaml` or `./config.yaml`):

```yaml
agent:
  systemPromptFile: /path/to/my-prompt.md
```

When set, this file replaces the entire base prompt (provider layers and environment still apply).

---

## Placeholder Substitution

Prompts support `{{PLACEHOLDER}}` syntax for dynamic values:

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{MODEL}}` | Current LLM model name | `gpt-4o` |
| `{{PROVIDER}}` | Current provider name | `openai` |
| `{{DATA_DIR}}` | Agent data directory | `~/.agent-data` |
| `{{MEMORY_ENABLED}}` | Memory feature status | `enabled` or `disabled` |
| `{{WORKING_DIR}}` | Current working directory | `/Users/dev/project` |
| `{{GIT_STATUS}}` | Git repository status | `Yes (branch: main, clean)` |
| `{{PLATFORM}}` | Platform name | `macOS` |
| `{{OS_VERSION}}` | OS version | `Darwin 24.1.0` |
| `{{DATE}}` | Current date | `2025-12-24` |

### Example Usage

```markdown
You are an AI assistant using {{MODEL}} from {{PROVIDER}}.

# Environment
Working directory: {{WORKING_DIR}}
Git: {{GIT_STATUS}}
Platform: {{PLATFORM}}
```

---

## YAML Front Matter

Prompt files can include YAML front matter for metadata:

```markdown
---
name: my-prompt
version: 2.0.0
description: Custom agent prompt
---

You are a helpful assistant...
```

The front matter is automatically stripped before use.

---

## Best Practices

### Keep It Concise

System prompts consume context tokens. Be direct and avoid redundancy.

```markdown
# Good
You are a TypeScript development assistant. Use tools to help with coding tasks.

# Avoid
You are a very helpful and knowledgeable TypeScript development assistant
who is always ready to help with any coding tasks...
```

### Use Placeholders

Dynamic content should use placeholders rather than hardcoded values:

```markdown
# Good
Model: {{MODEL}}

# Avoid
Model: gpt-4o
```

### Structure with Headings

For longer prompts, use markdown structure:

```markdown
# Role
You are a development assistant.

# Capabilities
- Code analysis
- Testing
- Documentation

# Guidelines
- Be concise
- Explain reasoning
```

### Provider Layers Are Minimal

Provider layers should be 1-2 sentences that change behavior, not documentation:

```markdown
# Good (minimal, behavioral)
Use XML tags for structured data. Think step-by-step for complex problems.

# Avoid (verbose, redundant with base)
## Format Preferences
- Use XML tags for structured data when organizing complex information
- Prefer explicit section markers for multi-part responses

## Tool Usage
- Execute independent tool calls in parallel in a single response
- For file operations, always prefer dedicated tools over bash commands
```

