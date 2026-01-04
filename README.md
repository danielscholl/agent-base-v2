# Agent Base v2

A TypeScript agent framework for building AI agents with multi-provider LLM support and built-in observability.

[![Bun 1.3.4+](https://img.shields.io/badge/bun-1.3.4+-black.svg)](https://bun.sh/)
[![TypeScript 5.x](https://img.shields.io/badge/typescript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Overview

Build conversational AI agents with enterprise-grade features: session persistence, conversation memory, observability, and extensible toolsets.

Supports Local (Ollama), GitHub Models, OpenAI, Anthropic, Google Gemini, Azure OpenAI, and Azure AI Foundry.

```bash
bun run dev

# First run: Provider Setup (if no provider configured)
Provider Setup
══════════════

No providers configured. Select one to set up:

  1. OpenAI           GPT-4, GPT-4o, o1, and other OpenAI models
  2. Anthropic        Claude Sonnet, Claude Opus, and Claude Haiku models
  3. Azure OpenAI     Azure-hosted OpenAI models with enterprise security
  4. Azure AI Foundry Azure AI managed models (local or cloud)
  5. Google Gemini    Gemini Pro and Gemini Flash models
  6. GitHub Models    Models via GitHub Copilot infrastructure
  7. Local            Local models via Ollama, Docker, or LM Studio

# After provider configuration (or on subsequent runs)
Agent - Conversational Assistant
Version 0.1.0 • OpenAI/gpt-4o
──────────────────────────────────────────────────────────────────────────────
> Say hello to Alice

✓ Complete (2.9s) - msg:1 tool:0

Hello, Alice!

──────────────────────────────────────────────────────────────────────────────
> What was the name I just mentioned?

✓ Complete (1.2s) - msg:1 tool:0

You mentioned "Alice."

──────────────────────────────────────────────────────────────────────────────
> exit
Goodbye!
```

### Verbose Mode

Use `--verbose` for detailed execution phases:

```bash
# Single prompt mode with verbose
bun run dev -- -p "What is 2+2?" --verbose

● Phase 1
└── ● Thinking (2 messages)

2 + 2 = 4

# Interactive mode with verbose
bun run dev --verbose

Agent - Conversational Assistant
Version 0.1.0 • OpenAI/gpt-4o
──────────────────────────────────────────────────────────────────────────────
> Say hello to Alice

● Phase 1
└── ● Thinking (2 messages)

Hello, Alice!

# After completion (verbose shows phase history)
• Phase 1 (2.9s)
└── • Thinking (1 messages) - Response received
```

## Prerequisites

### Required

- [Bun](https://bun.sh/) 1.3.4+

### LLM Providers

**Local (Ollama/Docker)**
Requires [Ollama](https://ollama.ai/) or [Docker Desktop](https://www.docker.com/products/docker-desktop/) for local model serving.

**Hosted Providers**

| Provider | Auth Method |
|----------|-------------|
| GitHub Models | GitHub CLI (`gh auth login`) |
| OpenAI | API Key |
| Anthropic | API Key |
| Google Gemini | API Key |
| Azure OpenAI | Azure CLI (`az login`) |
| Azure AI Foundry | Azure CLI (`az login`) |

## Quick Setup

```bash
# 1. Clone and install
git clone https://github.com/danielscholl/agent-base-v2.git
cd agent-base-v2
bun install

# 2. Configure provider (example: OpenAI)
export OPENAI_API_KEY="your-api-key"

# 3. Start agent
bun run dev
```

### Configuration

Agent uses a YAML configuration file at `~/.agent/config.yaml` for managing providers, memory, and observability settings.

```yaml
version: "1.0"

providers:
  default: openai
  openai:
    apiKey: ${OPENAI_API_KEY}
    model: gpt-4o

telemetry:
  enabled: true
  otlpEndpoint: http://localhost:4318
```

See [docs/architecture.md](docs/architecture.md) for complete configuration options.

## Usage

```bash
# Interactive chat mode
bun run dev

# Type checking
bun run typecheck

# Run tests
bun run test

# Build
bun run build
```

### Observability

Monitor your agent's performance with OpenTelemetry:

```bash
# Traces are exported to configured OTLP endpoint
# Follows GenAI semantic conventions for LLM spans
```

See [docs/architecture.md](docs/architecture.md) for telemetry setup.

## Skills

Skills are lightweight extensions that add domain-specific capabilities to an agent without increasing the core footprint. They're automatically discovered at runtime and load only minimal metadata by default, with additional tools activated on demand to keep token usage low.

See [docs/architecture.md](docs/architecture.md#skills-architecture) for skill development details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code quality guidelines, and contribution workflow.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- TypeScript rewrite of [agent-base](https://github.com/danielscholl/agent-base)
- Built with [LangChain.js](https://js.langchain.com/) and [Ink](https://github.com/vadimdemedes/ink)
