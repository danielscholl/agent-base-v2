# Agent Base v2

A TypeScript agent framework for building AI agents with multi-provider LLM support and built-in observability.

[![Bun 1.3.4+](https://img.shields.io/badge/bun-1.3.4+-black.svg)](https://bun.sh/)
[![TypeScript 5.x](https://img.shields.io/badge/typescript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Overview

Build conversational AI agents with enterprise-grade features:

- **Multi-Provider Support**: OpenAI, Anthropic, Azure, Google Gemini, GitHub Models, local models
- **Observability**: OpenTelemetry integration with GenAI semantic conventions
- **Skills System**: Progressive disclosure of capabilities based on context
- **Session Persistence**: Save and restore conversation state
- **Extensible Tools**: Type-safe tool creation with Zod schemas
- **Terminal UI**: React + Ink for rich terminal interfaces

## Prerequisites

### Required

- [Bun](https://bun.sh/) 1.3.4+
- Node.js 24+ (Bun 1.3.4 implements Node 24.3.0)

### LLM Providers

| Provider | Auth Method | Environment Variable |
|----------|-------------|---------------------|
| OpenAI | API Key | `OPENAI_API_KEY` |
| Anthropic | API Key | `ANTHROPIC_API_KEY` |
| Google Gemini | API Key | `GOOGLE_API_KEY` |
| Azure OpenAI | Azure CLI (`az login`) | Auto-detected |
| Azure AI Foundry | Azure CLI (`az login`) | Auto-detected |
| GitHub Models | GitHub CLI (`gh auth login`) | `GITHUB_TOKEN` |
| Local (Ollama) | Docker Desktop | N/A |

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/danielscholl/agent-base-v2.git
cd agent-base-v2

# Install dependencies
bun install

# Configure your provider (example: OpenAI)
export OPENAI_API_KEY="your-api-key"

# Run the agent
bun run dev
```

### Basic Usage

```typescript
import { Agent } from './src/agent/agent.js';
import { getDefaultConfig } from './src/config/schema.js';
import { readTool, writeTool } from './src/tools/index.js';

// Load configuration
const config = getDefaultConfig();
config.providers.openai = { apiKey: process.env.OPENAI_API_KEY };
config.providers.default = 'openai';

// Create agent with tools
const agent = new Agent({
  config,
  tools: [readTool, writeTool],
  callbacks: {
    onAgentStart: (ctx, query) => console.log(`Processing: ${query}`),
    onAgentEnd: (ctx, answer) => console.log(`Answer: ${answer}`),
  },
});

// Run a query
const answer = await agent.run('Read the contents of README.md');
console.log(answer);
```

## Configuration

### Configuration File

Create a `config.yaml` in your working directory or `~/.agent/config.yaml`:

```yaml
version: "1.0"

providers:
  default: openai
  openai:
    apiKey: ${OPENAI_API_KEY}
    model: gpt-4o
  anthropic:
    apiKey: ${ANTHROPIC_API_KEY}
    model: claude-3-opus

agent:
  dataDir: ~/.agent-data
  logLevel: info
  systemPromptFile: ~/.agent/system.md

memory:
  enabled: true
  type: local
  historyLimit: 100

telemetry:
  enabled: true
  otlpEndpoint: http://localhost:4318

retry:
  enabled: true
  maxRetries: 3
  baseDelayMs: 1000
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GOOGLE_API_KEY` | Google Gemini API key |
| `GITHUB_TOKEN` | GitHub token for GitHub Models |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint URL |
| `AZURE_OPENAI_DEPLOYMENT` | Azure OpenAI deployment name |
| `AGENT_DATA_DIR` | Override data directory |
| `AGENT_LOG_LEVEL` | Log level (debug, info, warn, error) |

## Provider Examples

### OpenAI

```typescript
config.providers.default = 'openai';
config.providers.openai = {
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o', // or 'gpt-4o-mini', 'gpt-4-turbo'
};
```

### Anthropic

```typescript
config.providers.default = 'anthropic';
config.providers.anthropic = {
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-opus', // or 'claude-3-sonnet', 'claude-3-haiku'
};
```

### Azure OpenAI

```typescript
config.providers.default = 'azure';
config.providers.azure = {
  endpoint: 'https://your-resource.openai.azure.com',
  deployment: 'your-deployment-name',
  apiVersion: '2024-06-01',
};
// Uses Azure CLI authentication by default
```

### Google Gemini

```typescript
config.providers.default = 'gemini';
config.providers.gemini = {
  apiKey: process.env.GOOGLE_API_KEY,
  model: 'gemini-pro',
};
```

### Local (Ollama)

```typescript
config.providers.default = 'local';
config.providers.local = {
  baseUrl: 'http://localhost:11434/v1',
  model: 'llama3.2',
};
```

### Local (Docker Model Runner)

Docker Model Runner is only accessible from inside Docker containers:

```typescript
config.providers.default = 'local';
config.providers.local = {
  baseUrl: 'http://model-runner.docker.internal/engines/llama.cpp/v1',
  model: 'ai/qwen3:8B-Q4_K_M',
};
```

## Creating Tools

Tools are the primary way to extend agent capabilities. Use `Tool.define()` to create type-safe tools:

```typescript
import { z } from 'zod';
import { Tool } from './src/tools/index.js';

// Define metadata type for type safety
interface WeatherMetadata extends Tool.Metadata {
  city: string;
  temperature: number;
}

// Define the tool using Tool.define()
const weatherTool = Tool.define<
  z.ZodObject<{ city: z.ZodString; units: z.ZodDefault<z.ZodEnum<['celsius', 'fahrenheit']>> }>,
  WeatherMetadata
>('get_weather', {
  description: 'Get current weather for a city',
  parameters: z.object({
    city: z.string().describe('City name to get weather for'),
    units: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  }),
  execute: async (args, ctx) => {
    // Stream progress updates
    ctx.metadata({ title: `Fetching weather for ${args.city}...` });

    // Your implementation here
    const temperature = 22;

    return {
      title: `Weather for ${args.city}`,
      metadata: { city: args.city, temperature },
      output: `Temperature in ${args.city}: ${temperature}°${args.units === 'celsius' ? 'C' : 'F'}`,
    };
  },
});

// Use with agent
const agent = new Agent({
  config,
  tools: [weatherTool],
});
```

## Observability

### OpenTelemetry Integration

The framework exports traces following GenAI semantic conventions:

```typescript
import { initializeTelemetry } from './src/telemetry/index.js';

await initializeTelemetry({
  config: {
    enabled: true,
    otlpEndpoint: 'http://localhost:4318',
  },
  serviceName: 'my-agent',
});
```

### Span Types

| Span | Operation | Attributes |
|------|-----------|------------|
| Agent | `invoke_agent` | Provider, model, conversation ID |
| LLM | `chat` | Model, tokens, temperature |
| Tool | `execute_tool` | Tool name, arguments, result |

## Development

### Commands

```bash
# Type checking
bun run typecheck

# Linting and formatting
bun run lint
bun run format

# Run tests
bun run test

# Run tests with coverage
bun run test --coverage

# Build
bun run build

# Development mode
bun run dev
```

### Project Structure

```
src/
├── agent/          # Agent orchestration and callbacks
├── cli/            # React + Ink terminal UI
├── config/         # Configuration schema and loading
├── errors/         # Error types and handling
├── model/          # LLM provider abstraction
├── skills/         # Progressive skill disclosure
├── telemetry/      # OpenTelemetry integration
├── tools/          # Tool definitions and base
└── utils/          # Shared utilities

tests/
├── fixtures/       # Shared test utilities
└── integration/    # Cross-module tests
```

## Documentation

| Guide | Description |
|-------|-------------|
| [Architecture](docs/architecture.md) | System design and component relationships |
| [Testing Guide](docs/guides/testing.md) | Testing patterns and fixtures |
| [Prompts Guide](docs/guides/prompts.md) | System prompt customization |
| [Tools Guide](docs/guides/tools.md) | Creating custom tools |
| [CLAUDE.md](CLAUDE.md) | Project governance and AI assistant guidance |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and contribution workflow.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- TypeScript rewrite of [agent-base](https://github.com/danielscholl/agent-base)
- Built with [LangChain.js](https://js.langchain.com/) and [Ink](https://github.com/vadimdemedes/ink)
- Observability powered by [OpenTelemetry](https://opentelemetry.io/)
