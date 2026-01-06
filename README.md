# Agent Base v2

A TypeScript agent framework + CLI for building conversational AI agents with **multi-provider LLM support**, **memory**, and **built-in observability**.

[![Bun 1.3.4+](https://img.shields.io/badge/bun-1.3.4+-black.svg)](https://bun.sh/)
[![TypeScript 5.x](https://img.shields.io/badge/typescript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## Why Agent Base v2?

- **Multi-provider LLM support** — local + cloud with runtime switching
- **Session persistence + conversation memory** — in-memory or Mem0 backend
- **Observability built in** — trace execution, tools, and timing
- **Extensible toolsets** — add agent capabilities easily
- **CLI-first workflow** — interactive use and scripting

> Run the same agent across OpenAI, Anthropic, Azure, GitHub Models, or local providers with consistent memory and tracing.

---

## Demo

```bash
agent

# After provider configuration
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

---

## Requirements

- **Bun 1.3.4+**
- **Supported OS:** macOS, Linux, WSL, Windows

---

## Install

**macOS / Linux / WSL**

```bash
curl -fsSL https://raw.githubusercontent.com/danielscholl/agent-base-v2/main/install.sh | bash
```

**Windows PowerShell**

```powershell
irm https://raw.githubusercontent.com/danielscholl/agent-base-v2/main/install.ps1 | iex
```

Verify installation:

```bash
agent --help
```

---

## Quick Start

**1. Initialize configuration**

```bash
agent config init
```

**2. Run interactive chat**

```bash
agent
```

**3. Run a single prompt** (great for scripts)

```bash
agent -p "Say hello to Alice"
```

> **Tip:** `-p` prints clean text by default. Add `--verbose` for traces and execution detail.

---

## Configuration

Agent uses `~/.agent/config.yaml` to manage providers, memory, and observability.

```bash
# View current configuration
agent config show

# Provider setup
agent config provider local       # Docker/Ollama
agent config provider github      # GitHub Models
agent config provider openai      # OpenAI

# Memory backend
agent config memory               # Switch between in_memory and mem0
```

See [docs/architecture/configuration.md](docs/architecture/configuration.md) for complete options.

---

## Usage

```bash
# Interactive chat
agent

# Validate config
agent --check

# Show exposed tools
agent --tools

# Single prompt
agent -p "Analyze this text"

# Single prompt with verbose execution
agent -p "Analyze this text" --verbose

# Switch providers/models on the fly
agent --provider openai -p "Hello"
agent --provider anthropic --model claude-sonnet-4-5-20250929 -p "Hello"
```

---

## Supported LLM Providers

| Provider | Type | Auth Method |
|----------|------|-------------|
| Ollama | Local | None |
| Docker | Local | None |
| GitHub Models | Cloud | GitHub CLI (`gh auth login`) |
| OpenAI | Cloud | API Key |
| Anthropic | Cloud | API Key |
| Google Gemini | Cloud | API Key |
| Azure OpenAI | Cloud | Azure CLI (`az login`) |
| Azure AI Foundry | Both | Azure CLI (`az login`) |

---

## Upgrade

```bash
agent update
```

---

## Uninstall

**macOS / Linux / WSL**

```bash
rm -f ~/.local/bin/agent
rm -rf ~/.agent/repo ~/.agent/bin
rm -rf ~/.agent  # optional: remove config
```

**Windows PowerShell**

```powershell
Remove-Item "$env:LOCALAPPDATA\Microsoft\WindowsApps\agent.exe" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\Microsoft\WindowsApps\agent.cmd" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\Programs\agent-base-v2" -Recurse -Force
Remove-Item "$HOME\.agent" -Recurse -Force -ErrorAction SilentlyContinue  # optional: remove config
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code quality guidelines, and contribution workflow.

---

## License

MIT — see [LICENSE](LICENSE).
