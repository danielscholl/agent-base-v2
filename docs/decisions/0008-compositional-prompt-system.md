---
status: proposed
date: 2025-12-24
deciders: [Daniel Scholl]
---

# Compositional System Prompt Architecture

## Context and Problem Statement

Our current system uses a single `system.md` file for all LLM providers. Analysis of OpenCode's architecture revealed they maintain separate prompt files for different model families (Claude, GPT, Gemini, local models). This raises the question: should we adopt provider-specific prompts, and if so, how do we balance customization with maintainability?

Different LLM providers have distinct characteristics:
- **Claude** excels with XML-structured content and explicit reasoning
- **GPT models** prefer JSON and direct formatting
- **O1/O3 models** have limited system prompt support
- **Local models** need simpler, more explicit instructions

Additionally, OpenCode injects environment context (working directory, git status, platform) into prompts, which provides useful grounding for the model.

## Decision Drivers

- **Provider optimization**: Different models respond better to different prompt structures
- **Maintainability**: Avoid duplicating entire prompts across providers
- **Environment awareness**: Models benefit from knowing working directory, git status
- **Backward compatibility**: Existing user overrides must continue to work
- **Skills integration**: Must work with our progressive skill disclosure system
- **Token efficiency**: Smaller models need terser prompts

## Considered Options

1. **Single prompt (status quo)**: Keep one `system.md` for all providers
2. **Full duplication**: Separate complete prompt files per provider (OpenCode approach)
3. **Compositional layers**: Assemble prompts from modular components

## Decision Outcome

Chosen option: **Compositional layers**, because it provides provider-specific optimization without the maintenance burden of full duplication. We assemble prompts from:

1. **Base prompt**: Core instructions applicable to all models
2. **Provider layer**: Optional provider-specific guidance
3. **Environment section**: Dynamic runtime context
4. **Skills section**: Existing `<available_skills>` XML
5. **User override**: Existing three-tier fallback system

### Consequences

**Good:**
- Provider-specific optimization without full duplication
- Environment context improves model grounding
- Easy to add new providers (just add a layer file)
- Shared base prompt ensures consistent core behavior
- Backward compatible with existing user overrides

**Bad:**
- More complex prompt assembly logic
- Additional files to maintain
- Slight increase in initialization time

**Neutral:**
- Requires updating documentation
- May need tuning per provider over time

## Validation

- Unit tests for each assembly function
- Integration tests with multiple providers
- Performance testing for assembly time (< 50ms target)
- Manual testing with Claude, GPT, and local models

## Pros and Cons of the Options

### Single Prompt (Status Quo)

- Good, because simple and easy to maintain
- Good, because single source of truth
- Bad, because cannot optimize for provider differences
- Bad, because no environment context injection

### Full Duplication (OpenCode Approach)

- Good, because complete control per provider
- Good, because can radically differ between providers
- Bad, because high maintenance burden (prompts drift out of sync)
- Bad, because changes must be applied to multiple files
- Bad, because ~5x more prompt content to manage

### Compositional Layers (Chosen)

- Good, because shared base ensures consistency
- Good, because provider layers are small and focused
- Good, because easy to add/remove provider customization
- Good, because environment section adds useful context
- Neutral, because slightly more complex assembly logic
- Bad, because requires understanding the composition system

## More Information

### Assembly Order

```
Base Prompt → Provider Layer → Environment → Skills → User Override
```

### File Structure

```
src/prompts/
├── base.md                # Core agent instructions
├── providers/
│   ├── anthropic.md      # Claude-specific
│   ├── openai.md         # GPT-specific
│   ├── gemini.md         # Gemini-specific
│   └── local.md          # Local model guidance
└── sections/
    └── environment.template.md
```

### Provider Layer Guidelines

Provider layers should be:
- **Additive**: Enhance, don't contradict base prompt
- **Focused**: Address provider-specific quirks only
- **Small**: 50-200 tokens typical
- **Optional**: Missing layer = no provider customization

### Related Decisions

- [ADR-0002: LLM Integration with LangChain](0002-llm-integration-langchain.md)
- [ADR-0001: Skills Execution Model](0001-skills-execution-model.md)

### Implementation Spec

See `docs/specs/feature-compositional-prompt-system.md` for detailed implementation plan.
