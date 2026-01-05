# Provider Architecture

> **Status:** Current
> **Source of truth:** [`src/config/constants.ts`](../../src/config/constants.ts), [`src/model/registry.ts`](../../src/model/registry.ts)

This document provides comprehensive documentation for the Model Layer (`src/model/`), explaining how providers, registry, LLMClient, retry logic, and response contracts work together to create a robust multi-provider LLM abstraction.

---

## Overview

The Model Layer provides a unified interface to 7 LLM providers:

| Provider | Description | Default Model |
|----------|-------------|---------------|
| `openai` | OpenAI API | gpt-5-mini |
| `anthropic` | Anthropic API | claude-sonnet-4-20250514 |
| `azure` | Azure OpenAI | (deployment name) |
| `foundry` | Azure AI Foundry | gpt-4o (cloud mode) |
| `gemini` | Google Gemini | gemini-2.0-flash-exp |
| `github` | GitHub Models | gpt-4o |
| `local` | Ollama/Docker Model Runner | qwen3:latest |

**Common Feature:** All providers include `supportsFunctionCalling?: boolean` (optional, undefined = assume true) for tool use capability.

---

## Directory Structure

```
src/model/
├── types.ts           # Core type definitions and interfaces
├── base.ts            # Response factories and error mapping utilities
├── llm.ts             # LLMClient - main orchestrator
├── registry.ts        # Provider registry and lookup functions
├── retry.ts           # Exponential backoff retry logic
├── index.ts           # Public module exports
└── providers/         # Provider-specific factory implementations
    ├── openai.ts
    ├── anthropic.ts
    ├── azure-openai.ts
    ├── gemini.ts
    ├── github.ts
    ├── local.ts
    └── foundry.ts
```

---

## Provider Selection

Providers are selected by **name** in configuration, not by model prefix:

```yaml
providers:
  default: openai
  openai:
    model: gpt-4o
  anthropic:
    model: claude-sonnet-4-20250514
```

**Note:** Config uses camelCase consistently (TypeScript convention).

---

## Provider Registry

```
┌─────────────────────────────────────────────┐
│           Provider Registry                 │
│                                             │
│  'openai'    ──► OpenAI Factory             │
│  'anthropic' ──► Anthropic Factory          │
│  'azure'     ──► Azure OpenAI Factory       │
│  'foundry'   ──► Azure AI Foundry Factory   │
│  'gemini'    ──► Google Gemini Factory      │
│  'github'    ──► GitHub Models Factory      │
│  'local'     ──► Local (OpenAI-compatible)  │
│                                             │
│  getProviderSetup(name) → ProviderFactory   │
│  createChatClient(provider) → BaseChatModel │
└─────────────────────────────────────────────┘
```

### Registry Functions

```typescript
// Get factory for a provider (undefined if not registered)
getProviderFactory(providerName: ProviderName): ProviderFactory | undefined

// Check if provider has a registered factory
isProviderSupported(providerName: ProviderName): boolean

// Get array of supported provider names
getSupportedProviders(): ProviderName[]
```

---

## Provider Implementations

### OpenAI Provider

**Package:** `@langchain/openai` (ChatOpenAI)

```typescript
{
  apiKey?: string,                 // Falls back to OPENAI_API_KEY
  model: string,                   // Default: "gpt-5-mini"
  baseUrl?: string,                // Optional custom endpoint
  supportsFunctionCalling?: boolean // Optional (undefined = assume true)
}
```

### Anthropic Provider

**Package:** `@langchain/anthropic` (ChatAnthropic)

```typescript
{
  apiKey?: string,                 // Falls back to ANTHROPIC_API_KEY
  model: string,                   // Default: "claude-sonnet-4-20250514"
  supportsFunctionCalling?: boolean // Optional (undefined = assume true)
}
```

### Azure OpenAI Provider

**Package:** `@langchain/openai` (AzureChatOpenAI)

```typescript
{
  endpoint?: string,               // Required - Azure endpoint URL
  deployment?: string,             // Required - Deployment name (NOT model)
  apiVersion: string,              // Default: "2024-06-01"
  apiKey?: string,                 // Falls back to AZURE_OPENAI_API_KEY
  supportsFunctionCalling?: boolean // Optional (undefined = assume true)
}
```

**Note:** Azure uses `deployment` not `model`. The deployment name maps to a model in Azure portal.

### Azure AI Foundry Provider

**Package:** `@langchain/openai` + optional `foundry-local-sdk`

```typescript
{
  mode: "local" | "cloud",         // Default: "cloud"

  // Cloud mode:
  projectEndpoint?: string,        // Required for cloud
  modelDeployment?: string,        // e.g., "claude-sonnet-4-5"
  apiKey?: string,                 // Falls back to AZURE_FOUNDRY_API_KEY

  // Local mode:
  modelAlias: string,              // Default: "qwen2.5-coder-14b"
  temperature?: number,

  supportsFunctionCalling?: boolean // Optional (undefined = assume true)
}
```

**Mode Behaviors:**
- **Cloud (default):** Uses Azure AI Foundry OpenAI v1-compatible API
- **Local:** Uses `foundry-local-sdk` for on-device model execution

### Google Gemini Provider

**Package:** `@langchain/google-genai` (ChatGoogleGenerativeAI)

```typescript
{
  apiKey?: string,                 // Falls back to GEMINI_API_KEY
  model: string,                   // Default: "gemini-2.0-flash-exp"
  useVertexai: boolean,            // Default: false (RESERVED)
  projectId?: string,              // RESERVED for future Vertex AI
  location: string,                // Default: "us-central1" (RESERVED)
  supportsFunctionCalling?: boolean // Optional (undefined = assume true)
}
```

**Important:** Vertex AI (`useVertexai: true`) is **not implemented**. Setting it returns an error. The `projectId` and `location` fields are reserved for future implementation.

### GitHub Models Provider

**Package:** `@langchain/openai` (ChatOpenAI with custom endpoint)

```typescript
{
  token?: string,                  // Falls back to GITHUB_TOKEN or gh CLI
  model: string,                   // Default: "gpt-4o"
  endpoint: string,                // Default: "https://models.github.ai/inference"
  org?: string,                    // Optional org name for enterprise
  supportsFunctionCalling?: boolean // Optional (undefined = assume true)
}
```

**Authentication Flow:**
```
config.token → GITHUB_TOKEN env var → `gh auth token` command → ERROR
```

### Local Provider

**Package:** `@langchain/openai` (ChatOpenAI with custom endpoint)

```typescript
{
  baseUrl: string,                 // Default: "http://localhost:11434/v1" (Ollama)
  model: string,                   // Default: "qwen3:latest"
  supportsFunctionCalling?: boolean // Optional (undefined = assume true)
}
```

**Supported Backends:**
- **Ollama** (default): `http://localhost:11434/v1`
- **Docker Model Runner**: `http://model-runner.docker.internal/engines/llama.cpp/v1`
- **LM Studio**: `http://localhost:1234/v1`
- Any OpenAI-compatible server

---

## LLMClient

The main orchestrator for all LLM operations.

### Constructor

```typescript
const client = new LLMClient({
  config: AppConfig,         // Full app configuration
  callbacks?: LLMCallbacks,  // Streaming + error callbacks
  retryConfig?: RetryConfig, // Override config.retry
});
```

### Public Methods

```typescript
// Complete response with retry
async invoke(input: string | BaseMessage[]): Promise<ModelResponse<InvokeResult>>

// Streaming response with retry
async stream(input: string | BaseMessage[]): Promise<ModelResponse<StreamResult>>

// Get current provider name
getProviderName(): ProviderName

// Get current model name (handles Azure deployment)
getModelName(): string
```

### Client Lifecycle

```
new LLMClient({ config })
        ↓
Store config + callbacks (client = null)
        ↓
First invoke() or stream() call
        ↓
    getClient()
        ↓
┌───────────────────┐
│ Client cached?    │ Yes → Return cached client
└────────┬──────────┘
         │ No
         ↓
Extract providerName from config.providers.default
         ↓
Check isProviderSupported(providerName)
         ↓
Get providerConfig from config.providers[providerName]
         ↓
Get factory from getProviderFactory(providerName)
         ↓
await factory(providerConfig)
         ↓
Cache client + providerName
         ↓
Return client
```

---

## Retry Logic

### Configuration

```typescript
{
  enabled: boolean,          // Default: true
  maxRetries: number,        // Default: 3
  baseDelayMs: number,       // Default: 1000 (1 second)
  maxDelayMs: number,        // Default: 10000 (10 seconds)
  enableJitter: boolean      // Default: true
}
```

### Retry Strategy

- **Exponential backoff**: `delay = baseDelay * 2^attempt` (capped at maxDelay)
- **Jitter**: Random variation ±20% to avoid thundering herd
- **Provider-aware**: Respects `Retry-After` headers from providers

### Retryable Error Codes

| Error Code | Description | Retry? |
|------------|-------------|--------|
| `RATE_LIMITED` | Rate limit exceeded | Yes |
| `NETWORK_ERROR` | Connection issues | Yes |
| `TIMEOUT` | Request timeout | Yes |
| All others | Permanent failures | No |

---

## Error Mapping

Keyword-based error classification:

| Keywords | Error Code |
|----------|------------|
| `api key`, `authentication`, `unauthorized` | `AUTHENTICATION_ERROR` |
| `rate limit`, `429` | `RATE_LIMITED` |
| `model` + `not found` | `MODEL_NOT_FOUND` |
| `context length`, `too long`, `token limit` | `CONTEXT_LENGTH_EXCEEDED` |
| `timeout`, `timed out` | `TIMEOUT` |
| `network`, `econnrefused`, `fetch failed`, `500`, `502`, `503` | `NETWORK_ERROR` |
| Everything else | `UNKNOWN` |

---

## Token Usage Extraction

Handles multiple provider formats:

| Provider | Format |
|----------|--------|
| OpenAI | `{ usage: { prompt_tokens, completion_tokens, total_tokens } }` |
| Anthropic | `{ usage: { input_tokens, output_tokens } }` (calculates total) |
| Generic | `{ token_usage: { ... } }` |

Falls back to camelCase variants (`promptTokens`, `completionTokens`).

---

## Provider-Specific Notes

| Provider | Authentication | Notes |
|----------|----------------|-------|
| `openai` | API key | Standard OpenAI API |
| `anthropic` | API key | Anthropic Claude API |
| `azure` | API key (Azure CLI planned) | Azure CLI fallback is planned; current implementation uses API keys |
| `foundry` | API key (cloud) / foundry-local-sdk (local) | Azure CLI auth is planned; cloud mode is default |
| `gemini` | API key | Vertex AI reserved, not implemented |
| `github` | GitHub token | Falls back to `gh` CLI token |
| `local` | None | Placeholder key used internally |

---

## Adding a New Provider

1. **Create Factory** (`src/model/providers/<provider>.ts`):

```typescript
import { Chat<Provider> } from '@langchain/<package>';
import { successResponse, errorResponse, mapErrorToCode } from '../base.js';

export function create<Provider>Client(
  config: Record<string, unknown>
): Promise<ModelResponse<BaseChatModel>> {
  try {
    // Validate config
    // Create LangChain client
    return successResponse(client, 'Created <Provider> client');
  } catch (error) {
    return errorResponse(mapErrorToCode(error), error.message);
  }
}
```

2. **Add to Registry** (`src/model/registry.ts`):

```typescript
import { create<Provider>Client } from './providers/<provider>.js';

export const PROVIDER_REGISTRY = {
  // ... existing
  <provider>: create<Provider>Client,
};
```

3. **Export from Module** (`src/model/index.ts`)

4. **Define Config Schema** (`src/config/schema.ts`)

5. **Write Tests** (`src/model/__tests__/<provider>.test.ts`)

---

## Related Documentation

- [Core Interfaces](./core-interfaces.md) - ModelResponse, TokenUsage
- [Error Handling](./error-handling.md) - Retry strategies
- [Configuration](./configuration.md) - Provider config schemas
