# Provider Architecture

This document provides comprehensive documentation for the Model Layer (`src/model/`), explaining how providers, registry, LLMClient, retry logic, and response contracts work together to create a robust multi-provider LLM abstraction.

---

## Overview

The Model Layer provides a unified interface to 7 LLM providers:

| Provider | Description | Default Model |
|----------|-------------|---------------|
| `openai` | OpenAI API | gpt-5-mini |
| `anthropic` | Anthropic API | claude-haiku-4-5 |
| `azure` | Azure OpenAI | (deployment) |
| `foundry` | Azure AI Foundry | (deployment) |
| `gemini` | Google Gemini | gemini-2.0-flash-exp |
| `github` | GitHub Models | gpt-4o-mini |
| `local` | Docker Model Runner | llama3.3:latest |

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

## Module Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Model Module                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  types.ts                                                        │
│  ├─ ModelResponse<T> (discriminated union)                      │
│  ├─ ModelErrorCode (10 error types)                             │
│  ├─ InvokeResult, TokenUsage                                    │
│  ├─ LLMCallbacks (streaming + retry events)                     │
│  └─ ProviderFactory (factory function type)                     │
│                                                                  │
│  base.ts                                                         │
│  ├─ successResponse<T>()                                         │
│  ├─ errorResponse()                                              │
│  ├─ mapErrorToCode() (keyword-based error mapping)              │
│  └─ extractTokenUsage() (multi-provider format support)         │
│                                                                  │
│  registry.ts                                                     │
│  ├─ PROVIDER_REGISTRY (7 providers)                             │
│  ├─ getProviderFactory()                                         │
│  ├─ isProviderSupported()                                        │
│  └─ getSupportedProviders()                                      │
│                                                                  │
│  retry.ts                                                        │
│  ├─ withRetry() (exponential backoff wrapper)                   │
│  ├─ isRetryableError() (3 transient error types)                │
│  ├─ calculateDelay() (exponential + jitter)                     │
│  └─ extractRetryAfter() (provider Retry-After headers)          │
│                                                                  │
│  llm.ts                                                          │
│  └─ LLMClient (main orchestrator)                               │
│      ├─ invoke() (complete response with retry)                 │
│      ├─ stream() (async iterator with retry)                    │
│      └─ getClient() (lazy client initialization + caching)      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Provider Selection

Providers are selected by **name** in configuration, not by model prefix:

```json
{
  "providers": {
    "default": "openai",
    "openai": {
      "apiKey": "...",
      "model": "gpt-4o"
    },
    "anthropic": {
      "apiKey": "...",
      "model": "claude-sonnet-4-5"
    }
  }
}
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

## Invoke Flow

```
invoke(input)
    ↓
┌────────────────────┐
│ Retry enabled?     │ No → invokeOnce() → return
└─────────┬──────────┘
          │ Yes
          ↓
withRetry(() => invokeOnce(input))
    ↓
Loop: attempt 0 to maxRetries
    ↓
invokeOnce(input)
    ├─ getClient()
    ├─ toMessages(input)
    ├─ client.invoke(messages)
    ├─ Extract content + usage
    └─ Return ModelResponse
    ↓
If error && retryable && retries left:
    ├─ Calculate delay
    ├─ Fire onRetry callback
    ├─ Sleep(delay)
    └─ Loop
    ↓
Return final result
    ↓
If error: Fire onError callback
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
- **Jitter**: Random variation ±25% to avoid thundering herd
- **Provider-aware**: Respects `Retry-After` headers from providers

### Retryable Error Codes

| Error Code | Description | Retry? |
|------------|-------------|--------|
| `RATE_LIMITED` | Rate limit exceeded | Yes |
| `NETWORK_ERROR` | Connection issues | Yes |
| `TIMEOUT` | Request timeout | Yes |
| All others | Permanent failures | No |

### Retry Flow

```
Execute operation()
        ↓
┌─────────────┐
│ Success?    │ Yes → Return result
└──────┬──────┘
       │ No
       ↓
┌─────────────────┐
│ Retryable error?│ No → Return error immediately
└──────┬──────────┘
       │ Yes
       ↓
┌─────────────────┐
│ Retries left?   │ No → Return error
└──────┬──────────┘
       │ Yes
       ↓
Calculate delay (use Retry-After or exponential backoff)
       ↓
Fire onRetry callback
       ↓
Sleep(delay)
       ↓
attempt++
       ↓
(loop back to Execute)
```

---

## Provider Implementations

### OpenAI Provider

**Package:** `@langchain/openai` (ChatOpenAI)

```typescript
{
  apiKey?: string,      // Falls back to OPENAI_API_KEY
  model?: string,       // Default: gpt-5-mini
  baseUrl?: string      // Optional custom endpoint
}
```

### Anthropic Provider

**Package:** `@langchain/anthropic` (ChatAnthropic)

```typescript
{
  apiKey?: string,      // Falls back to ANTHROPIC_API_KEY
  model?: string        // Default: claude-sonnet-4-20250514
}
```

### Azure OpenAI Provider

**Package:** `@langchain/openai` (AzureChatOpenAI)

```typescript
{
  endpoint: string,         // Required: Azure endpoint URL
  deployment: string,       // Required: Deployment name
  apiVersion?: string,      // Default: '2024-06-01'
  apiKey?: string          // Falls back to AZURE_OPENAI_API_KEY
}
```

### Gemini Provider

**Package:** `@langchain/google-genai` (ChatGoogleGenerativeAI)

```typescript
{
  apiKey?: string,          // Falls back to GOOGLE_API_KEY
  model?: string,           // Default: gemini-2.0-flash-exp
  useVertexai?: boolean     // Default: false
}
```

**Note:** Vertex AI mode is NOT supported. Setting `useVertexai: true` returns an error.

### GitHub Models Provider

**Package:** `@langchain/openai` (ChatOpenAI with custom endpoint)

```typescript
{
  token?: string,           // Falls back to GITHUB_TOKEN or gh CLI
  model?: string,           // Default: gpt-4o-mini
  endpoint?: string,        // Default: https://models.github.ai/inference
  org?: string             // Optional org name for enterprise
}
```

**Authentication Flow:**
```
config.token → GITHUB_TOKEN env var → gh auth token → ERROR
```

### Local Provider

**Package:** `@langchain/openai` (ChatOpenAI with custom endpoint)

```typescript
{
  baseUrl?: string,         // Default: http://localhost:11434/v1 (Ollama)
  model?: string           // Default: llama3.3:latest
}
```

**Supported Backends:**
- **Ollama** (default): `http://localhost:11434/v1`
- **Docker Model Runner**: `http://model-runner.docker.internal/engines/llama.cpp/v1`
- **LM Studio**: `http://localhost:1234/v1`
- Any OpenAI-compatible server

### Azure AI Foundry Provider

**Package:** `@langchain/openai` + optional `foundry-local-sdk`

```typescript
{
  mode?: 'local' | 'cloud',    // Default: 'local'

  // Local mode:
  modelAlias?: string,          // Default: 'phi-4'
  temperature?: number,

  // Cloud mode:
  projectEndpoint?: string,     // Required
  modelDeployment?: string,     // Default: 'gpt-4o'
  apiKey?: string              // Falls back to AZURE_FOUNDRY_API_KEY
}
```

**Local Mode:** Uses `foundry-local-sdk` for on-device model execution.
**Cloud Mode:** Uses Azure AI Foundry OpenAI v1-compatible API.

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

## Provider-Specific Notes

| Provider | Authentication | Notes |
|----------|----------------|-------|
| `openai` | API key | Standard OpenAI API |
| `anthropic` | API key | Anthropic Claude API |
| `azure` | API key or Azure CLI | Supports AzureCliCredential fallback |
| `foundry` | Azure CLI (local) or API key (cloud) | Async credential required |
| `gemini` | API key | Vertex AI not supported |
| `github` | GitHub token | Supports org-scoped rate limits |
| `local` | None | Placeholder key used |

---

## Related Documentation

- [Core Interfaces](./core-interfaces.md) - ModelResponse, TokenUsage
- [Error Handling](./error-handling.md) - Retry strategies
- [Configuration](./configuration.md) - Provider config schemas
