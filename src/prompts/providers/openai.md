---
provider: openai
models: [gpt-4.1, gpt-4.1-mini, gpt-4.1-nano]
---

# OpenAI Model Guidelines

## Format Preferences

- Use JSON for structured data output when helpful
- Prefer markdown formatting for responses
- Be direct and concise

## Tool Usage

- Function calling is well-supported—use tools proactively
- Execute independent tool calls in parallel
- Provide clear, structured arguments to tools

## GPT-4.1 Models

The GPT-4.1 family (gpt-4.1, gpt-4.1-mini, gpt-4.1-nano) improves on GPT-4o with better:
- Coding performance
- Instruction following
- Long-context understanding (up to 1M tokens)
