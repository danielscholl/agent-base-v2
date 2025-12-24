# Feature: Compositional Prompt System

## Overview

This specification defines a compositional system prompt architecture that assembles prompts from modular layers: base instructions, provider-specific guidance, environment context, and skills. This replaces the current single-file prompt approach with a more maintainable and provider-aware system.

---

## Goals

1. **Provider-aware prompts**: Tailor prompts to model strengths (Claude's XML handling, GPT's JSON preference)
2. **Environment injection**: Include working directory, git status, platform info
3. **Maintainability**: Avoid full prompt duplication across providers
4. **Backward compatibility**: Preserve existing three-tier override system
5. **Skills integration**: Maintain progressive skill disclosure

---

## Architecture

### Prompt Assembly Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SYSTEM PROMPT ASSEMBLY                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. BASE PROMPT (base.md)                                                   │
│     └─ Core identity, role, guidelines (model-agnostic)                     │
│                                                                              │
│  2. PROVIDER LAYER (providers/{provider}.md) [optional]                     │
│     └─ Provider-specific preferences and quirks                             │
│                                                                              │
│  3. ENVIRONMENT SECTION (dynamically generated)                             │
│     └─ Working directory, git status, platform, date                        │
│                                                                              │
│  4. SKILLS SECTION (existing <available_skills> XML)                        │
│     └─ Progressive skill disclosure                                         │
│                                                                              │
│  5. USER OVERRIDE (existing three-tier fallback)                            │
│     └─ Config override → ~/.agent/system.md → package default               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    [ Final assembled system prompt ]
```

### Assembly Order

```typescript
systemPrompt = [
  basePrompt,              // Core instructions
  providerLayer,           // Provider-specific (if exists)
  environmentSection,      // Runtime context
  skillsXml,               // Available skills
  userOverride,            // User customizations (if exists)
].filter(Boolean).join('\n\n');
```

---

## File Structure

```
src/prompts/
├── base.md                    # Core agent identity and guidelines
├── providers/                 # Provider-specific layers
│   ├── anthropic.md          # Claude-specific guidance
│   ├── openai.md             # GPT/O1 guidance
│   ├── gemini.md             # Gemini guidance
│   ├── azure.md              # Azure OpenAI (may share with openai.md)
│   ├── github.md             # GitHub Models (may share with openai.md)
│   └── local.md              # Local model guidance (Ollama, Foundry)
├── sections/                  # Composable sections
│   └── environment.template.md  # Template for environment injection
└── system.md                  # [DEPRECATED] Legacy single-file prompt
```

---

## Prompt Content Design

### 1. Base Prompt (`base.md`)

Core agent behavior that applies to all models:

```markdown
---
name: base-system-prompt
version: 2.0.0
---

You are an AI assistant powered by {{MODEL}} via {{PROVIDER}}.

# Core Principles

- Be concise and direct in responses
- Use tools when they help accomplish tasks
- Explain reasoning when helpful
- Ask for clarification if requests are ambiguous
- Handle errors gracefully and inform the user

# Tool Usage

You have access to tools that can help accomplish tasks. Use them proactively when relevant.

## Tool Guidelines

- Use specialized tools instead of bash when available
- Execute independent tool calls in parallel
- Never guess missing parameters—ask for clarification
- Read files before editing to understand context

# Code Style

When working with code:
- Follow existing project conventions
- Verify libraries/frameworks are available before using
- Mimic naming, formatting, and architectural patterns
- Add comments sparingly, focusing on "why" not "what"

# Professional Standards

- Prioritize technical accuracy over validation
- Provide direct, objective guidance
- Disagree respectfully when necessary
- Investigate uncertainty before confirming assumptions
```

### 2. Provider Layers

#### `providers/anthropic.md` (Claude)

```markdown
---
provider: anthropic
models: [claude-3-opus, claude-3-sonnet, claude-3-haiku, claude-3.5-sonnet]
---

# Claude-Specific Guidelines

## Format Preferences

- Use XML tags for structured data when helpful
- Prefer explicit section markers for complex responses
- Think step-by-step for multi-part problems

## Strengths to Leverage

- Long context understanding (use full context when available)
- Nuanced instruction following
- Code generation with proper typing
```

#### `providers/openai.md` (GPT)

```markdown
---
provider: openai
models: [gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, o1-mini, o3]
---

# OpenAI Model Guidelines

## Format Preferences

- Use JSON for structured data output
- Prefer markdown formatting for responses
- Be direct and concise

## O1 Model Notes

When using reasoning models (o1, o1-mini):
- O1 models support system prompts but process them differently than chat models
- System prompts influence the internal reasoning chain rather than direct output
- Keep instructions clear and focused on task objectives
- Avoid overly prescriptive formatting instructions
```

#### `providers/gemini.md` (Google)

```markdown
---
provider: gemini
models: [gemini-pro, gemini-1.5-pro, gemini-1.5-flash]
---

# Gemini Guidelines

## Format Preferences

- Use markdown formatting
- Structure responses clearly
- Leverage large context window efficiently

## Strengths

- Multi-modal understanding
- Long document analysis
- Code understanding
```

#### `providers/local.md` (Ollama, Foundry)

```markdown
---
provider: local
models: [llama3, codellama, mistral, phi-3]
---

# Local Model Guidelines

## Constraints

- Keep instructions explicit and simple
- Avoid complex multi-step reasoning chains
- Use shorter context when possible

## Best Practices

- Be direct with tool usage instructions
- Provide clear examples when possible
- Avoid ambiguous requests
```

### 3. Environment Section

Generated dynamically at runtime:

```markdown
# Environment

Working directory: {{WORKING_DIR}}
Git repository: {{GIT_STATUS}}
Platform: {{PLATFORM}} ({{OS_VERSION}})
Date: {{DATE}}
```

### 4. User Override Section

When user provides custom instructions via config or `~/.agent/system.md`:

```markdown
# User Instructions

{{USER_OVERRIDE_CONTENT}}
```

---

## Implementation Plan

### Phase 1: Foundation (ADR + Base Structure)

**Tasks:**

1. Create ADR `0008-compositional-prompt-system.md`
2. Create new file structure:
   - `src/prompts/base.md`
   - `src/prompts/providers/` directory
   - `src/prompts/sections/` directory
3. Add placeholder provider files

**Files Changed:**
- `docs/decisions/0008-compositional-prompt-system.md` (new)
- `src/prompts/base.md` (new)
- `src/prompts/providers/*.md` (new)

### Phase 2: Environment Injection

**Tasks:**

1. Create `EnvironmentContext` interface in `src/agent/environment.ts`
2. Implement environment detection:
   - Working directory
   - Git status (branch, clean/dirty)
   - Platform and OS version
   - Current date
3. Create `generateEnvironmentSection()` function
4. Add tests for environment detection

**Files Changed:**
- `src/agent/environment.ts` (new)
- `src/agent/__tests__/environment.test.ts` (new)

### Phase 3: Prompt Composition Engine

**Tasks:**

1. Refactor `src/agent/prompts.ts`:
   - Add `loadBasePrompt()` function
   - Add `loadProviderLayer(provider: string)` function
   - Add `assembleSystemPrompt(options)` function
   - Maintain backward compatibility with `loadSystemPrompt()`
2. Add provider layer loading with graceful fallback
3. Update placeholder system to support new values
4. Add comprehensive tests

**New Placeholders:**

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{MODEL}}` | Current model name | `gpt-4o` |
| `{{PROVIDER}}` | Provider name | `openai` |
| `{{WORKING_DIR}}` | Current working directory | `/Users/dev/project` |
| `{{GIT_STATUS}}` | Git repository status | `Yes (branch: main, clean)` |
| `{{PLATFORM}}` | Platform name | `darwin` |
| `{{OS_VERSION}}` | OS version | `macOS 14.0` |
| `{{DATE}}` | Current date | `2025-12-24` |
| `{{DATA_DIR}}` | Data directory | `~/.agent-data` |
| `{{MEMORY_ENABLED}}` | Memory status | `enabled` |

**Files Changed:**
- `src/agent/prompts.ts` (major refactor)
- `src/agent/__tests__/prompts.test.ts` (update)

### Phase 4: Agent Integration

**Tasks:**

1. Update `Agent.initialize()` to use new composition system
2. Pass provider name to prompt assembly
3. Add environment context to assembly
4. Maintain skills integration
5. Update integration tests

**Files Changed:**
- `src/agent/agent.ts` (update)
- `tests/integration/agent-integration.test.ts` (update)

### Phase 5: Prompt Content Migration

**Tasks:**

1. Write comprehensive `base.md` content (adapted from OpenCode analysis)
2. Write provider-specific layers
3. Deprecate `src/prompts/system.md` (keep for backward compat)
4. Update documentation

**Files Changed:**
- `src/prompts/base.md` (content)
- `src/prompts/providers/*.md` (content)
- `docs/guides/prompts.md` (update)

### Phase 6: Testing & Polish

**Tasks:**

1. Add unit tests for all new functions
2. Add integration tests for prompt assembly
3. Test with multiple providers
4. Update CLAUDE.md if needed
5. Performance testing (prompt assembly time)

---

## API Changes

### New Functions

```typescript
// src/agent/prompts.ts

interface PromptAssemblyOptions extends PromptOptions {
  /** Include environment context section */
  includeEnvironment?: boolean;
  /** Include provider-specific layer */
  includeProviderLayer?: boolean;
  /** User override content (from config or file) */
  userOverride?: string;
  /** Working directory for environment context */
  workingDir?: string;
}

/**
 * Assemble a complete system prompt from all layers.
 */
export async function assembleSystemPrompt(
  options: PromptAssemblyOptions
): Promise<string>;

/**
 * Load the base prompt (core agent instructions).
 */
export async function loadBasePrompt(options: PromptOptions): Promise<string>;

/**
 * Load provider-specific layer if it exists.
 * Returns empty string if no layer exists for the provider.
 */
export async function loadProviderLayer(provider: string): Promise<string>;

/**
 * Generate environment context section.
 */
export async function generateEnvironmentSection(
  workingDir?: string
): Promise<string>;
```

### New Types

```typescript
// src/agent/environment.ts

interface EnvironmentContext {
  workingDir: string;
  gitRepo: boolean;
  gitBranch?: string;
  gitClean?: boolean;
  platform: string;
  osVersion: string;
  date: string;
}

/**
 * Detect current environment context.
 */
export async function detectEnvironment(
  workingDir?: string
): Promise<EnvironmentContext>;
```

---

## Backward Compatibility

1. **Existing `loadSystemPrompt()`**: Continues to work, internally calls `assembleSystemPrompt()`
2. **User overrides**: Still respected via three-tier fallback
3. **Skills integration**: Unchanged—skills XML appended after composition
4. **`system.md`**: Kept but deprecated; base.md + layers preferred

---

## Testing Strategy

### Unit Tests

- `loadBasePrompt()` - file loading, placeholder replacement
- `loadProviderLayer()` - graceful fallback when file missing
- `generateEnvironmentSection()` - all environment fields
- `assembleSystemPrompt()` - correct ordering and composition
- `detectEnvironment()` - git detection, platform detection

### Integration Tests

- Full agent initialization with different providers
- Prompt assembly with skills enabled
- User override integration
- Environment section accuracy

---

## Success Criteria

1. **Provider awareness**: Different prompts for Claude vs GPT vs local models
2. **Environment context**: Working directory, git status visible to model
3. **No breaking changes**: Existing configs continue to work
4. **Test coverage**: 85%+ coverage for new code
5. **Performance**: Prompt assembly < 50ms

---

## Open Questions

1. **O1 handling**: Should we customize system prompts for reasoning models differently?
2. **Provider detection**: Should we auto-detect provider from model name?
3. **File tree inclusion**: OpenCode includes file tree (200 files max)—do we want this?

---

## References

- OpenCode prompts: `packages/opencode/src/session/prompt/`
- Existing prompts: `src/prompts/system.md`
- Prompt guide: `docs/guides/prompts.md`
- ADR template: `docs/decisions/adr-template.md`
