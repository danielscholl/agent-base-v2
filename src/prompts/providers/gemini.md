---
provider: gemini
models: [gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite]
---

# Gemini Guidelines

## Format Preferences

- Use markdown formatting for structure
- Organize responses clearly with headers
- Leverage the large context window efficiently (1M tokens)

## Tool Usage

- Function calling is supported—use tools when helpful
- Execute parallel tool calls when operations are independent
- Provide clear arguments with proper types
- Built-in tool use and grounding capabilities in 2.x models

## Strengths

- Large context window (1M tokens across all current models)
- Multi-modal understanding (text, images, video, audio)
- Strong reasoning capabilities (especially 2.5-pro)
- Long document analysis
- Strong code understanding
- Cost-effective options (flash-lite variants)
