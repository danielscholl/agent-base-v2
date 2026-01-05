# Configuration Architecture

> **Status:** Current
> **Source of truth:** [`src/config/schema.ts`](../../src/config/schema.ts), [`src/config/constants.ts`](../../src/config/constants.ts), [`src/config/env.ts`](../../src/config/env.ts)

This document describes the configuration system, including directory structure, loading hierarchy, and schema validation.

---

## Overview

The configuration system provides:

- **Zod-based validation** with TypeScript type inference
- **Hierarchical loading** (env -> project -> user -> defaults)
- **Consistent casing** (camelCase throughout)
- **YAML configuration files** for human readability

---

## Config Directory

The config directory is `.agent/` (matches Python for migration compatibility):

| Location | Purpose | Scope |
|----------|---------|-------|
| `./.agent/config.yaml` | Project config | Committable, team-shared |
| `~/.agent/config.yaml` | User config | Personal, never committed |
| `~/.agent/sessions/` | Session storage | Persisted conversations |
| `~/.agent/context/` | Context storage | Tool output persistence |
| `~/.agent/skills/` | User skills | User-created skills |
| `~/.agent/plugins/` | Plugin skills | Installed from git |

---

## Config Hierarchy

Priority from highest to lowest:

```
1. Environment Variables     -> OPENAI_API_KEY, LLM_PROVIDER, etc.
         |
         v
2. Project Config            -> ./.agent/config.yaml
         |                       (committable, team-shared)
         v
3. User Config               -> ~/.agent/config.yaml
         |                       (personal, never committed)
         v
4. Schema Defaults           -> Zod schema .default() values
```

---

## Workspace Root Precedence

The workspace root controls where tools can read/write files. For security (sandbox/container scenarios), precedence follows a "narrow only" rule:

```
1. AGENT_WORKSPACE_ROOT env var     -> Authoritative hard cap (if set)
         |
         v
2. config.agent.workspaceRoot       -> Applies only if:
         |                              - env var is unset, OR
         |                              - config path is WITHIN env var path
         v
3. process.cwd()                    -> Fallback if neither is set
```

### Security Rules

| Env Var | Config | Behavior |
|---------|--------|----------|
| Not set | Not set | Use `cwd` |
| Not set | Set | Use config, set env var for tools |
| Set | Not set | Use env var (authoritative) |
| Set | Set (inside env) | Use config (narrowing allowed) |
| Set | Set (outside env) | **Ignore config**, warn, use env var |

### Example Scenarios

```yaml
# Config in ~/.agent/config.yaml
agent:
  workspaceRoot: /home/user/projects/myapp
```

**Scenario 1:** Container sets `AGENT_WORKSPACE_ROOT=/sandbox`
- Config `/home/user/projects/myapp` is outside `/sandbox`
- Config ignored with warning, workspace = `/sandbox`

**Scenario 2:** Container sets `AGENT_WORKSPACE_ROOT=/home/user/projects`
- Config `/home/user/projects/myapp` is inside `/home/user/projects`
- Config applies (narrowing), workspace = `/home/user/projects/myapp`

**Scenario 3:** No env var set
- Config applies, workspace = `/home/user/projects/myapp`
- Env var is set for tools to use

---

## Schema Structure

```
AppConfig
|-- version: string                    # Default: "1.0"
|
|-- providers
|   |-- default: ProviderName          # Default: "openai"
|   |-- openai?: OpenAIConfig
|   |-- anthropic?: AnthropicConfig
|   |-- azure?: AzureOpenAIConfig
|   |-- foundry?: FoundryConfig
|   |-- gemini?: GeminiConfig
|   |-- github?: GitHubConfig
|   +-- local?: LocalConfig
|
|-- agent
|   |-- dataDir: string                # Default: "~/.agent"
|   |-- logLevel: LogLevel             # Default: "info" (debug|info|warn|error)
|   |-- systemPromptFile?: string      # Path to custom system prompt
|   |-- workspaceRoot?: string         # Root for workspace operations
|   +-- filesystemWritesEnabled: bool  # Default: true
|
|-- telemetry
|   |-- enabled: boolean               # Default: false
|   |-- enableSensitiveData: boolean   # Default: false
|   |-- otlpEndpoint?: string          # OTLP endpoint URL
|   +-- applicationinsightsConnectionString?: string
|
|-- memory
|   |-- enabled: boolean               # Default: true
|   |-- type: MemoryType               # Default: "local" (local|mem0)
|   |-- historyLimit: number           # Default: 100
|   +-- mem0?
|       |-- storagePath?: string
|       |-- apiKey?: string
|       |-- orgId?: string
|       |-- userId?: string
|       +-- projectId?: string
|
|-- skills
|   |-- plugins: PluginDefinition[]    # Default: [] (accepts legacy string URLs)
|   |-- pluginsDir?: string            # Directory for installed plugins
|   |-- disabledBundled: string[]      # Default: []
|   |-- enabledBundled: string[]       # Default: []
|   |-- userDir?: string               # Custom skill directory
|   +-- scriptTimeout: number          # Default: 30000 (ms)
|
|-- retry
|   |-- enabled: boolean               # Default: true
|   |-- maxRetries: number             # Default: 3
|   |-- baseDelayMs: number            # Default: 1000
|   |-- maxDelayMs: number             # Default: 10000
|   +-- enableJitter: boolean          # Default: true
|
+-- session
    |-- autoSave: boolean              # Default: true
    +-- maxSessions: number            # Default: 50
```

---

## Provider Config Schemas

### OpenAI

```typescript
{
  apiKey?: string,      // Falls back to OPENAI_API_KEY
  model: string,        // Default: "gpt-5-mini"
  baseUrl?: string,     // Optional custom endpoint
  supportsFunctionCalling?: boolean  // Optional (undefined = assume true)
}
```

### Anthropic

```typescript
{
  apiKey?: string,      // Falls back to ANTHROPIC_API_KEY
  model: string,        // Default: "claude-sonnet-4-20250514"
  supportsFunctionCalling?: boolean  // Optional (undefined = assume true)
}
```

### Azure OpenAI

```typescript
{
  endpoint?: string,    // Required - Azure endpoint URL
  deployment?: string,  // Required - Deployment name
  apiVersion: string,   // Default: "2024-06-01"
  apiKey?: string,      // Falls back to AZURE_OPENAI_API_KEY
  supportsFunctionCalling?: boolean  // Optional (undefined = assume true)
}
```

### Azure AI Foundry

```typescript
{
  mode: "local" | "cloud",       // Default: "cloud"
  // Cloud mode
  projectEndpoint?: string,       // Required for cloud
  modelDeployment?: string,       // e.g., "claude-sonnet-4-5"
  apiKey?: string,                // Falls back to AZURE_FOUNDRY_API_KEY
  // Local mode
  modelAlias: string,             // Default: "qwen2.5-coder-14b"
  temperature?: number,
  supportsFunctionCalling?: boolean  // Optional (undefined = assume true)
}
```

### Google Gemini

```typescript
{
  apiKey?: string,       // Falls back to GEMINI_API_KEY
  model: string,         // Default: "gemini-2.0-flash-exp"
  useVertexai: boolean,  // Default: false (RESERVED - not implemented)
  projectId?: string,    // RESERVED for future Vertex AI
  location: string,      // Default: "us-central1" (RESERVED)
  supportsFunctionCalling?: boolean  // Optional (undefined = assume true)
}
```

**Note:** Vertex AI (`useVertexai: true`) is reserved for future implementation. Setting it returns an error.

### GitHub Models

```typescript
{
  token?: string,       // Falls back to GITHUB_TOKEN or `gh auth token`
  model: string,        // Default: "gpt-4o"
  endpoint: string,     // Default: "https://models.github.ai/inference"
  org?: string,         // Optional org for enterprise
  supportsFunctionCalling?: boolean  // Optional (undefined = assume true)
}
```

### Local (Ollama/Docker Model Runner)

```typescript
{
  baseUrl: string,      // Default: "http://localhost:11434/v1"
  model: string,        // Default: "qwen3:latest"
  supportsFunctionCalling?: boolean  // Optional (undefined = assume true)
}
```

**Supported backends:**
- **Ollama** (default): `http://localhost:11434/v1`
- **Docker Model Runner**: `http://model-runner.docker.internal/engines/llama.cpp/v1`
- **LM Studio**: `http://localhost:1234/v1`
- Any OpenAI-compatible server

---

## Config Loading Flow

```
ConfigManager.load()
         |
         v
+-------------------------------------+
| 1. Load schema defaults             |
|    (Zod .default() values)          |
+-------------------------------------+
         |
         v
+-------------------------------------+
| 2. Load user config                 |
|    (~/.agent/config.yaml)           |
|    Deep merge with defaults         |
+-------------------------------------+
         |
         v
+-------------------------------------+
| 3. Load project config              |
|    (./.agent/config.yaml)           |
|    Deep merge with user config      |
+-------------------------------------+
         |
         v
+-------------------------------------+
| 4. Apply environment overrides      |
|    (see env var mapping below)      |
+-------------------------------------+
         |
         v
+-------------------------------------+
| 5. Validate with Zod schema         |
|    Throw on validation failure      |
+-------------------------------------+
         |
         v
Return validated AppConfig
```

---

## Environment Variable Mapping

| Variable | Config Path | Notes |
|----------|-------------|-------|
| `OPENAI_API_KEY` | `providers.openai.apiKey` | |
| `OPENAI_BASE_URL` | `providers.openai.baseUrl` | Validated as URL |
| `ANTHROPIC_API_KEY` | `providers.anthropic.apiKey` | |
| `AZURE_OPENAI_ENDPOINT` | `providers.azure.endpoint` | Validated as URL |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | `providers.azure.deployment` | |
| `AZURE_OPENAI_API_KEY` | `providers.azure.apiKey` | |
| `AZURE_OPENAI_API_VERSION` | `providers.azure.apiVersion` | |
| `AZURE_PROJECT_ENDPOINT` | `providers.foundry.projectEndpoint` | Validated as URL |
| `AZURE_MODEL_DEPLOYMENT` | `providers.foundry.modelDeployment` | |
| `GEMINI_API_KEY` | `providers.gemini.apiKey` | |
| `GEMINI_USE_VERTEXAI` | `providers.gemini.useVertexai` | Boolean coercion |
| `GEMINI_PROJECT_ID` | `providers.gemini.projectId` | |
| `GEMINI_LOCATION` | `providers.gemini.location` | |
| `GITHUB_TOKEN` | `providers.github.token` | |
| `GITHUB_MODELS_ENDPOINT` | `providers.github.endpoint` | Validated as URL |
| `GITHUB_MODELS_ORG` | `providers.github.org` | |
| `LLM_PROVIDER` | `providers.default` | Must be valid provider |
| `AGENT_MODEL` | `providers.<default>.model` | Applied after merge |
| `AGENT_DATA_DIR` | `agent.dataDir` | |
| `AGENT_LOG_LEVEL` | `agent.logLevel` | Must be debug/info/warn/error |
| `AGENT_WORKSPACE_ROOT` | `agent.workspaceRoot` | |
| `ENABLE_OTEL` | `telemetry.enabled` | Boolean coercion |
| `OTLP_ENDPOINT` | `telemetry.otlpEndpoint` | Validated as URL |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | `telemetry.applicationinsightsConnectionString` | |
| `MEMORY_ENABLED` | `memory.enabled` | Boolean coercion |
| `MEMORY_TYPE` | `memory.type` | Must be local/mem0 |
| `MEMORY_HISTORY_LIMIT` | `memory.historyLimit` | Positive integer |

**Note:** `AGENT_FILESYSTEM_WRITES_ENABLED` is read by write-capable tools at runtime.
It is not part of the config merge pipeline, but it can override write behavior when set.

---

## Casing Conventions

| Aspect | Convention |
|--------|------------|
| Config keys | camelCase |
| YAML files | camelCase |
| TypeScript types | camelCase |
| Environment variables | SCREAMING_SNAKE_CASE |

**Important:** On-disk YAML matches in-memory TypeScript objects without transformation.

---

## Example Configuration

```yaml
version: "1.0"

providers:
  default: openai
  openai:
    model: gpt-4o
  anthropic:
    model: claude-sonnet-4-20250514

agent:
  dataDir: ~/.agent
  logLevel: info
  filesystemWritesEnabled: true

telemetry:
  enabled: true
  otlpEndpoint: http://localhost:4318/v1/traces

memory:
  enabled: true
  type: local
  historyLimit: 100

skills:
  plugins: []
  disabledBundled: []

retry:
  enabled: true
  maxRetries: 3

session:
  autoSave: true
  maxSessions: 50
```

---

## Config Manager API

```typescript
class ConfigManager {
  constructor(options?: ConfigManagerOptions);

  // Load merged config from all sources (env > project > user > defaults)
  async load(projectPath?: string): Promise<ConfigResponse<AppConfig>>;

  // Save config to file (produces minimal YAML with only non-default values)
  async save(config: AppConfig, filePath?: string): Promise<ConfigResponse<void>>;

  // Get config file paths
  getUserConfigPath(): string;
  getProjectConfigPath(projectPath?: string): string;

  // Validate config against schema
  validate(config: unknown): ConfigResponse<AppConfig>;

  // Get default configuration
  getDefaults(): AppConfig;
}

// Response wrapper for all operations
interface ConfigResponse<T> {
  success: boolean;
  result?: T;
  error?: string;
  message: string;
}
```

---

## Related Documentation

- [Providers Architecture](./providers.md) - Provider-specific config details
- [Error Handling](./error-handling.md) - Config validation errors
