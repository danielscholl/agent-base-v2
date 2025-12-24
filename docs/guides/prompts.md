# System Prompts Guide

This guide covers the compositional system prompt architecture and customization options.

---

## Overview

The prompt system uses a **compositional architecture** that assembles prompts from modular layers:

1. **Base prompt**: Core agent instructions (model-agnostic)
2. **Provider layer**: Optional provider-specific guidance
3. **Environment section**: Runtime context (working dir, git status, etc.)
4. **Skills section**: Progressive skill disclosure
5. **User override**: Custom instructions from config or user files

This approach provides provider-specific optimization without the maintenance burden of fully duplicated prompts.

---

## Prompt Assembly Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROMPT ASSEMBLY ORDER                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. BASE PROMPT (src/prompts/base.md)                           │
│     └─ Core identity, role, guidelines                          │
│                                                                  │
│  2. PROVIDER LAYER (src/prompts/providers/{provider}.md)        │
│     └─ Provider-specific preferences (optional)                 │
│                                                                  │
│  3. ENVIRONMENT SECTION (dynamically generated)                 │
│     └─ Working directory, git status, platform, date            │
│                                                                  │
│  4. SKILLS SECTION (<available_skills> XML)                     │
│     └─ Progressive skill disclosure                             │
│                                                                  │
│  5. USER OVERRIDE (config or ~/.agent/system.md)                │
│     └─ Custom user instructions                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/prompts/
├── base.md                    # Core agent instructions (all providers)
├── providers/                 # Provider-specific layers
│   ├── anthropic.md          # Claude models
│   ├── openai.md             # GPT and O1 models
│   ├── gemini.md             # Google Gemini
│   ├── azure.md              # Azure OpenAI
│   ├── github.md             # GitHub Models
│   ├── local.md              # Ollama/local models
│   └── foundry.md            # Azure AI Foundry
├── sections/                  # Composable sections
│   └── environment.template.md
└── system.md                  # [DEPRECATED] Legacy single-file prompt
```

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

## Provider Layers

Provider layers are small, focused files that address provider-specific characteristics:

### When to Use Provider Layers

- **Format preferences**: Claude handles XML well; GPT prefers JSON
- **Tool calling quirks**: Different providers handle function calling differently
- **Capability hints**: Some models need simpler instructions
- **Model-specific notes**: O1 models process system prompts differently than chat models

### Example Provider Layer (anthropic.md)

```markdown
---
provider: anthropic
models: [claude-3-opus, claude-3-sonnet, claude-3-haiku]
---

# Claude-Specific Guidelines

## Format Preferences

- Use XML tags for structured data
- Think step-by-step for complex problems

## Strengths to Leverage

- Long context understanding
- Nuanced instruction following
```

### Provider Layer Guidelines

- **Additive**: Enhance, don't contradict the base prompt
- **Focused**: Address provider-specific quirks only
- **Small**: Typically 50-200 tokens
- **Optional**: Missing layer = no provider customization

---

## Environment Section

The environment section is generated dynamically at runtime:

```markdown
# Environment

Working directory: /Users/dev/project
Git repository: Yes (branch: main, clean)
Platform: macOS (Darwin 24.1.0)
Date: 2025-12-24
```

This provides the model with context about:
- Current working directory
- Git repository status (branch, clean/dirty)
- Platform and OS version
- Current date

---

## Skills Integration

When skills are enabled, the framework appends skill documentation as XML:

```xml
<available_skills>
<skill>
<name>gh</name>
<description>GitHub CLI integration</description>
<location>/path/to/gh/SKILL.md</location>
</skill>
</available_skills>
```

See the [Skills documentation](../architecture.md#skills-architecture) for details.

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

## API Reference

### assembleSystemPrompt(options)

Assemble a complete system prompt from all layers (recommended for new code):

```typescript
import { assembleSystemPrompt } from './agent/prompts.js';

const prompt = await assembleSystemPrompt({
  config: appConfig,
  model: 'claude-3-opus',
  provider: 'anthropic',
  includeEnvironment: true,
  includeProviderLayer: true,
  workingDir: process.cwd(),
});
```

**Options:**
- `config` - Application configuration
- `model` - LLM model name
- `provider` - Provider name
- `includeEnvironment` - Include environment section (default: true)
- `includeProviderLayer` - Include provider layer (default: true)
- `workingDir` - Working directory (default: process.cwd())
- `userOverride` - Custom user instructions to append
- `onDebug` - Debug callback for logging

### loadSystemPrompt(options)

Legacy function for loading system prompt with three-tier fallback:

```typescript
import { loadSystemPrompt } from './agent/prompts.js';

const prompt = await loadSystemPrompt({
  config: appConfig,
  model: 'gpt-4o',
  provider: 'openai',
});
```

**Note:** This function is maintained for backward compatibility. New code should prefer `assembleSystemPrompt()`.

### loadSystemPromptWithSkills(options)

Load system prompt with full composition and skills integration:

```typescript
import { loadSystemPromptWithSkills } from './agent/prompts.js';

const { prompt, skills } = await loadSystemPromptWithSkills({
  config: appConfig,
  model: 'claude-3-opus',
  provider: 'anthropic',
  includeSkills: true,
  includeEnvironment: true,
  includeProviderLayer: true,
});

console.log(`Loaded ${skills.length} skills`);
```

### loadBasePrompt(options)

Load only the base prompt (without provider layer or environment):

```typescript
import { loadBasePrompt } from './agent/prompts.js';

const basePrompt = await loadBasePrompt({
  config: appConfig,
  model: 'gpt-4o',
  provider: 'openai',
});
```

### loadProviderLayer(provider)

Load provider-specific layer (returns empty string if not found):

```typescript
import { loadProviderLayer } from './agent/prompts.js';

const layer = await loadProviderLayer('anthropic');
if (layer) {
  console.log('Loaded Anthropic-specific guidance');
}
```

### replacePlaceholders(content, values)

Replace placeholders in text:

```typescript
import { replacePlaceholders } from './agent/prompts.js';

const result = replacePlaceholders('Hello, {{NAME}}!', { NAME: 'World' });
// Result: 'Hello, World!'
```

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

### Provider Layers Are Additive

Provider layers should enhance, not replace, base prompt instructions:

```markdown
# Good (additive)
## Format Preferences
- Use XML tags for structured data

# Avoid (contradictory)
Ignore all previous instructions...
```

---

## Migration from Legacy System

If you're upgrading from the single `system.md` approach:

1. **No action required**: The legacy `loadSystemPrompt()` function still works
2. **Opt-in to composition**: Use `assembleSystemPrompt()` for new features
3. **Custom prompts**: Move to `~/.agent/system.md` for user overrides
4. **Provider-specific**: Create `providers/{provider}.md` files as needed

The `system.md` file is maintained for backward compatibility but is deprecated in favor of the compositional system.
