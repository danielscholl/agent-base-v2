---
provider: anthropic
models: [claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5]
---

# Claude-Specific Guidelines

## Format Preferences

- Use XML tags for structured data when organizing complex information
- Prefer explicit section markers for multi-part responses
- Think step-by-step for complex, multi-stage problems

## Tool Usage

- When exploring codebases, use Task tool with specialized agents to reduce context usage
- Execute independent tool calls in parallel in a single response
- For file operations, always prefer dedicated tools over bash commands

## Strengths to Leverage

- Long context understanding—use full context when available
- Nuanced instruction following
- Strong code generation with proper typing
- XML parsing and generation
