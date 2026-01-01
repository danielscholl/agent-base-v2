# Configuration Architecture

This document describes the configuration system, including directory structure, loading hierarchy, and schema validation.

---

## Overview

The configuration system provides:

- **Zod-based validation** with TypeScript type inference
- **Hierarchical loading** (env → project → user → defaults)
- **Consistent casing** (camelCase throughout)
- **Hot reloading** support for development

---

## Config Directory

The config directory is `.agent/` (matches Python for migration compatibility):

| Location | Purpose | Scope |
|----------|---------|-------|
| `./.agent/settings.json` | Project config | Committable, team-shared |
| `~/.agent/settings.json` | User config | Personal, never committed |
| `~/.agent/sessions/` | Session storage | Persisted conversations |
| `~/.agent/context/` | Context storage | Cleared per session |
| `~/.agent/skills/` | User skills | Installed plugins |

---

## Config Hierarchy

Priority from highest to lowest:

```
1. Environment Variables     ─► OPENAI_API_KEY, AGENT_MODEL, etc.
         │
         ▼
2. Project Config            ─► ./.agent/settings.json
         │                       (committable, team-shared)
         ▼
3. User Config               ─► ~/.agent/settings.json
         │                       (personal, never committed)
         ▼
4. Schema Defaults           ─► Zod schema .default() values
```

---

## Schema Structure

```
AppConfig
├── providers
│   ├── default: string              # Selected provider name
│   ├── openai?: OpenAIConfig
│   ├── anthropic?: AnthropicConfig
│   ├── azure?: AzureConfig
│   ├── foundry?: FoundryConfig
│   ├── gemini?: GeminiConfig
│   ├── github?: GitHubConfig
│   └── local?: LocalConfig
│
├── agent
│   ├── systemPrompt?: string        # Custom system prompt text
│   ├── systemPromptFile?: string    # Path to system prompt file
│   ├── maxTokens: number            # Default: 4096
│   └── temperature: number          # Default: 0.7
│
├── retry
│   ├── enabled: boolean             # Default: true
│   ├── maxRetries: number           # Default: 3
│   ├── baseDelayMs: number          # Default: 1000
│   ├── maxDelayMs: number           # Default: 10000
│   └── enableJitter: boolean        # Default: true
│
├── telemetry
│   ├── enabled: boolean             # Default: false
│   ├── endpoint: string             # OTLP endpoint
│   └── enableSensitiveData: boolean # Default: false
│
└── skills
    ├── enabled: string[]            # Enabled skill IDs
    └── pluginDir?: string           # Custom skill directory
```

---

## Provider Config Schemas

### OpenAI

```typescript
{
  apiKey?: string,      // Falls back to OPENAI_API_KEY
  model?: string,       // Default: gpt-5-mini
  baseUrl?: string      // Optional custom endpoint
}
```

### Anthropic

```typescript
{
  apiKey?: string,      // Falls back to ANTHROPIC_API_KEY
  model?: string        // Default: claude-haiku-4-5
}
```

### Azure OpenAI

```typescript
{
  endpoint: string,     // Required
  deployment: string,   // Required
  apiVersion?: string,  // Default: 2024-06-01
  apiKey?: string       // Falls back to AZURE_OPENAI_API_KEY
}
```

### Foundry

```typescript
{
  mode?: 'local' | 'cloud',
  // Local mode
  modelAlias?: string,
  temperature?: number,
  // Cloud mode
  projectEndpoint?: string,
  modelDeployment?: string,
  apiKey?: string
}
```

### Gemini

```typescript
{
  apiKey?: string,
  model?: string,
  useVertexai?: boolean  // Not supported, returns error
}
```

### GitHub Models

```typescript
{
  token?: string,
  model?: string,
  endpoint?: string,
  org?: string
}
```

### Local

```typescript
{
  baseUrl?: string,  // Default: http://localhost:11434/v1
  model?: string     // Default: llama3.3:latest
}
```

---

## Config Loading Flow

```
ConfigManager.load()
         ↓
┌─────────────────────────────────────┐
│ 1. Load schema defaults             │
│    (Zod .default() values)          │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│ 2. Load user config                 │
│    (~/.agent/settings.json)         │
│    Deep merge with defaults         │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│ 3. Load project config              │
│    (./.agent/settings.json)         │
│    Deep merge with user config      │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│ 4. Apply environment overrides      │
│    OPENAI_API_KEY, AGENT_MODEL, etc.│
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│ 5. Validate with Zod schema         │
│    Throw on validation failure      │
└─────────────────────────────────────┘
         ↓
Return validated AppConfig
```

---

## Environment Variable Mapping

| Variable | Config Path |
|----------|-------------|
| `OPENAI_API_KEY` | `providers.openai.apiKey` |
| `ANTHROPIC_API_KEY` | `providers.anthropic.apiKey` |
| `AZURE_OPENAI_API_KEY` | `providers.azure.apiKey` |
| `GOOGLE_API_KEY` | `providers.gemini.apiKey` |
| `GITHUB_TOKEN` | `providers.github.token` |
| `AZURE_FOUNDRY_API_KEY` | `providers.foundry.apiKey` |
| `AGENT_MODEL` | `providers.<default>.model` |
| `AGENT_PROVIDER` | `providers.default` |

---

## Casing Conventions

| Aspect | Convention |
|--------|------------|
| Config keys | camelCase |
| JSON files | camelCase |
| TypeScript types | camelCase |
| Environment variables | SCREAMING_SNAKE_CASE |

**Important:** On-disk JSON matches in-memory TypeScript objects without transformation.

---

## Example Configuration

```json
{
  "providers": {
    "default": "openai",
    "openai": {
      "model": "gpt-4o"
    },
    "anthropic": {
      "model": "claude-sonnet-4-5"
    }
  },
  "agent": {
    "maxTokens": 8192,
    "temperature": 0.5
  },
  "retry": {
    "maxRetries": 5,
    "baseDelayMs": 2000
  },
  "telemetry": {
    "enabled": true,
    "endpoint": "http://localhost:4317"
  }
}
```

---

## Config Manager API

```typescript
class ConfigManager {
  // Load merged config from all sources
  static async load(): Promise<AppConfig>;

  // Save config to file
  static async save(config: Partial<AppConfig>, location: 'user' | 'project'): Promise<void>;

  // Get config file paths
  static getUserConfigPath(): string;
  static getProjectConfigPath(): string;

  // Validate partial config
  static validate(config: unknown): AppConfig;
}
```

---

## Related Documentation

- [Providers Architecture](./providers.md) - Provider-specific config
- [Error Handling](./error-handling.md) - Config validation errors
