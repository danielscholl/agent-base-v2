---
provider: local
models: [llama3, llama3.1, codellama, mistral, phi-3, qwen2-7b]
note: Local models via Ollama or Docker Model Runner
---

# Local Model Guidelines

## Constraints

Local models typically have:
- Smaller context windows than cloud models
- Variable tool calling support
- Different capability levels

## Best Practices

- Keep instructions explicit and simple
- Avoid complex multi-step reasoning in single prompts
- Use shorter context when possible
- Provide clear examples when helpful

## Tool Usage

- Tool calling support varies by model
- Some models may not support function calling
- Test tool interactions with specific model being used

## Communication

- Be direct and explicit
- Avoid ambiguous requests
- Break complex tasks into smaller steps
