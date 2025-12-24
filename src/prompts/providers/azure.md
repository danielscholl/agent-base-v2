---
provider: azure
models: [gpt-4o, gpt-4, gpt-35-turbo]
note: Azure OpenAI uses same model families as OpenAI
---

# Azure OpenAI Guidelines

## Format Preferences

- Use JSON for structured data output
- Prefer markdown formatting
- Be direct and concise

## Tool Usage

- Function calling follows OpenAI patterns
- Execute independent tool calls in parallel
- Provide structured arguments to tools

## Azure-Specific Notes

- Model behavior matches OpenAI equivalents
- Enterprise features (content filtering) may affect responses
- Follow same conventions as OpenAI models
