# Agent Base v2

A TypeScript agent framework for building AI agents with multi-provider LLM support and built-in observability.

[![Bun 1.3.4+](https://img.shields.io/badge/bun-1.3.4+-black.svg)](https://bun.sh/)
[![TypeScript 5.x](https://img.shields.io/badge/typescript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Overview

Build conversational AI agents with enterprise-grade features: session persistence, conversation memory, observability, and extensible toolsets.

```bash
agent

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

## Installation

```bash
# macOS / Linux / WSL
curl -fsSL https://raw.githubusercontent.com/danielscholl/agent-base-v2/main/install.sh | bash

# Windows PowerShell
irm https://raw.githubusercontent.com/danielscholl/agent-base-v2/main/install.ps1 | iex
```


## Quick Start

```bash
# Initialize configuration (first run)
agent config init

# Start interactive mode
agent

# Get help
agent --help
```

## Upgrade and Uninstall

```bash
# Or use built-in update (source installs only)
agent update
```

```bash
# macOS / Linux / WSL
rm -f ~/.local/bin/agent
rm -rf ~/.agent/repo ~/.agent/bin

# Windows PowerShell
Remove-Item "$env:LOCALAPPDATA\Microsoft\WindowsApps\agent.exe" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\Microsoft\WindowsApps\agent.cmd" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\Programs\agent-base-v2" -Recurse -Force

# Clean up configuration (optional)
rm -rf ~/.agent
```

### Configuration

Agent uses a YAML configuration file at `~/.agent/config.yaml` for managing providers, memory, and observability settings.

**Configuration Commands:**

```bash
# Interactive setup wizard
agent config init

# View current configuration
agent config show

# Manage providers
agent config provider local       # Enable/configure local (Docker)
agent config provider github      # Enable/configure GitHub Models
agent config provider openai      # Enable/configure OpenAI

# Configure memory backend
agent config memory               # Switch between in_memory and mem0
```

See [docs/architecture/configuration.md](docs/architecture/configuration.md) for complete configuration options.

## Usage

```bash
# Interactive chat mode
agent

# Check the agent configuration
agent --check

# Check the tools being exposed to the agent
agent --tools

# Single query (clean output for scripting)
agent -p "Say hello to Alice"

# Single query with verbose execution details
agent -p "Analyze this text" --verbose

# Switch providers on the fly
agent --provider openai -p "Hello"

# Switch models on the fly
agent --provider anthropic --model claude-sonnet-4-5-20250929 -p "Hello"
```

**Note:** Single prompt mode (`-p`) outputs clean text by default, perfect for piping or scripting. Use `--verbose` to see execution details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code quality guidelines, and contribution workflow.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
