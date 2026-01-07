# Agent Harness

**The rig. Not the driver.**

A TypeScript runtime for building, running, and composing AI agents with any LLM.

[![Bun 1.3.4+](https://img.shields.io/badge/bun-1.3.4+-black.svg)](https://bun.sh/)
[![TypeScript 5.x](https://img.shields.io/badge/typescript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## What is a Harness?

A harness is infrastructure — it constrains, orchestrates, and connects an AI model to tools, policies, and workflows. It is not intelligent on its own; it channels intelligence safely and repeatably.

| | Harness (this project) | Agent (the LLM) |
|---|------------------------|-----------------|
| Decides actions | No | Yes |
| Enforces safety | Yes | No |
| Has goals | No | Yes (when configured) |
| Ships with behavior | No | Yes (when configured) |

**Agent Harness is the rig that runs agents. The LLM is the driver.**

---

## What You Get

**The harness provides:**

- **Multi-provider LLM support** — swap between local and cloud models at runtime
- **Tool execution pipeline** — filesystem, shell, search, and custom tools
- **Session persistence** — conversation memory across interactions
- **Observability** — tracing, timing, and execution logs via OpenTelemetry
- **Extension points** — skills, commands, and workflows
- **CLI-first interface** — interactive use and scripting

**The harness does NOT provide:**

- Goals or objectives
- Domain-specific behavior
- Autonomous planning out of the box

The power comes when you configure it: add AGENTS.md, custom commands, and skills. Then it becomes whatever you need.

---

## Demo

```bash
agent

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

## Install

**macOS / Linux / WSL**

```bash
curl -fsSL https://raw.githubusercontent.com/danielscholl/agent-harness/main/install.sh | bash
```

**Windows PowerShell**

```powershell
irm https://raw.githubusercontent.com/danielscholl/agent-harness/main/install.ps1 | iex
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

The harness uses `~/.agent/config.yaml` to manage providers, memory, and observability.

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
| Azure AI Foundry | Both | Azure CLI (`az login`) |
| GitHub Models | Cloud | GitHub CLI (`gh auth login`) |
| Azure OpenAI | Cloud | Azure CLI (`az login`) |
| OpenAI | Cloud | API Key |
| Anthropic | Cloud | API Key |
| Google Gemini | Cloud | API Key |

---

## Security Model

Agent Harness provides two layers of security:

| Layer | Mechanism | Protection |
|-------|-----------|------------|
| **Application** | Workspace root constraints | Prevents tools from accessing files outside the designated workspace |
| **OS (with --sandbox)** | Docker container isolation | Provides OS-level process and filesystem isolation |

### Sandbox Mode

Run the agent inside a Docker container for enhanced isolation:

```bash
# Run with sandbox isolation (image auto-pulled on first use)
agent --sandbox -p "Analyze this codebase"
```

When `--sandbox` is passed, the harness automatically pulls the sandbox image from the registry (if needed) and re-executes itself inside a Docker container with your workspace mounted and credentials passed through securely.

See [docs/guides/sandbox.md](docs/guides/sandbox.md) for complete sandbox documentation.

---

## Making it Yours

Agent Harness ships neutral. Here's how to configure it:

### AGENTS.md

Create an `AGENTS.md` file in your workspace root to define agent behavior, goals, and constraints. The harness discovers and injects this into the system prompt.

### Custom Commands

Add slash commands in `~/.agent/commands/` to create reusable workflows. Commands are markdown files with YAML frontmatter.

### Skills

Install skills to add capabilities. Skills use progressive disclosure — they inject documentation only when relevant to the user's query.

See [Architecture](docs/architecture/README.md) for details.

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
Remove-Item "$env:LOCALAPPDATA\Programs\agent-harness" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:USERPROFILE\.agent" -Recurse -Force -ErrorAction SilentlyContinue  # removes config, assets, and sessions
```

---

## Architecture

See [Architecture](docs/architecture/README.md).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code quality guidelines, and contribution workflow.

---

## License

MIT — see [LICENSE](LICENSE).
