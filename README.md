# Agent Base v2

A TypeScript agent framework for building AI agents with multi-provider LLM support and built-in observability.

[![Bun 1.0+](https://img.shields.io/badge/bun-1.0+-black.svg)](https://bun.sh/)
[![TypeScript 5.x](https://img.shields.io/badge/typescript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Overview

Build conversational AI agents with enterprise-grade features: session persistence, conversation memory, observability, and extensible toolsets. Built with React + Ink for terminal UI.

```bash
bun run dev

 Agent Framework v2
 Hello, World!
 TypeScript + Bun + React + Ink
```

## Prerequisites

### Required

- [Bun](https://bun.sh/) 1.0+
- Node.js 20+ (for compatibility)

### LLM Providers

| Provider | Auth Method |
|----------|-------------|
| OpenAI | API Key |
| Anthropic | API Key |
| Google Gemini | API Key |
| Azure OpenAI | Azure CLI (`az login`) |
| Azure AI Foundry | Azure CLI (`az login`) |
| GitHub Models | GitHub CLI (`gh auth login`) |
| Local (Docker) | Docker Desktop |

## Quick Setup

```bash
# Install dependencies
bun install

# Run the agent
bun run dev
```

## Development

```bash
# Type checking
bun run typecheck

# Linting
bun run lint

# Run tests
bun run test

# Build
bun run build
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and contribution workflow.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- TypeScript rewrite of [agent-base](https://github.com/danielscholl/agent-base)
- Built with [LangChain.js](https://js.langchain.com/) and [Ink](https://github.com/vadimdemedes/ink)
