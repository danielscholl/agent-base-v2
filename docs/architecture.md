# Agent Framework Architecture

This document defines the architectural concepts, component relationships, and structural patterns for the TypeScript agent framework.

**Governance:** See [CLAUDE.md](../CLAUDE.md) for implementation rules.
**Implementation:** See [guides/](guides/) for code patterns.
**Features:** See [plans/typescript-rewrite-features.md](plans/typescript-rewrite-features.md) for build order.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                           User                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CLI Layer (React/Ink)                      │
│                                                                 │
│  Responsibilities:                                              │
│  • Terminal UI rendering                                        │
│  • User input handling                                          │
│  • State management (React hooks)                               │
│  • Command routing (/help, /telemetry, etc.)                    │
│                                                                 │
│  Receives: AgentCallbacks (lifecycle events)                    │
│  Never: Calls LLM directly, imports agent internals             │
└─────────────────────────────────────────────────────────────────┘
                              │ callbacks
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Agent Layer (Orchestration)                   │
│                                                                 │
│  Responsibilities:                                              │
│  • Query → LLM → Tool → Response loop                           │
│  • Message history assembly                                     │
│  • Tool binding and execution                                   │
│  • Callback emission to UI                                      │
│  • Telemetry span management                                    │
│                                                                 │
│  Owns: The only layer that calls Model Layer                    │
└─────────────────────────────────────────────────────────────────┘
          │                                    │
          │ tool calls                         │ LLM calls
          ▼                                    ▼
┌───────────────────────┐       ┌─────────────────────────────────┐
│     Tools Layer       │       │         Model Layer             │
│                       │       │                                 │
│  • Zod input schemas  │       │  • Provider routing             │
│  • ToolResponse output│       │  • Streaming support            │
│  • Permission checks  │       │  • Retry with backoff           │
│  • No LLM calls       │       │  • Structured output (Zod)      │
└───────────────────────┘       └─────────────────────────────────┘
          │                                    │
          └──────────────┬─────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Utils Layer                               │
│                                                                 │
│  • Configuration (load, validate, save)                         │
│  • Context storage (tool outputs → filesystem)                  │
│  • Message history (conversation memory)                        │
│  • Session persistence                                          │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Telemetry Layer (Cross-cutting)                 │
│                                                                 │
│  • OpenTelemetry spans for all operations                       │
│  • GenAI semantic conventions                                   │
│  • OTLP export to Aspire/Jaeger/etc.                            │
│  • Integrated via callbacks (SpanContext)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Interfaces

### Interface Map

| Interface | Layer | Purpose |
|-----------|-------|---------|
| `AgentCallbacks` | Agent→CLI | Lifecycle events (LLM, tools, agent) with SpanContext |
| `ToolResponse<T>` | Tools | Structured success/error return (never throw) |
| `ModelFactory` | Model | Creates LangChain model from name + options |
| `AppConfig` | Utils | Root configuration type (Zod-inferred) |
| `IContextManager` | Utils | Tool output storage and retrieval |
| `TelemetryHelpers` | Telemetry | Span creation with GenAI conventions |

### Callback Flow

```
Agent.run(query)
    │
    ├─► onAgentStart(ctx, query)
    │
    ├─► onLLMStart(ctx, model, messages)
    │       │
    │       └─► onLLMStream(ctx, chunk)  [if streaming]
    │       │
    │       └─► onLLMEnd(ctx, response, usage)
    │
    ├─► onToolStart(ctx, toolName, args)
    │       │
    │       └─► onToolEnd(ctx, toolName, result)
    │
    └─► onAgentEnd(ctx, answer)
```

All callbacks receive `SpanContext` for telemetry correlation.

### Tool Response Contract

```
ToolResponse<T>
├── success: true
│   ├── result: T
│   └── message: string
│
└── success: false
    ├── error: ToolErrorCode
    └── message: string

ToolErrorCode:
  VALIDATION_ERROR | IO_ERROR | CONFIG_ERROR | PERMISSION_DENIED |
  RATE_LIMITED | NOT_FOUND | LLM_ASSIST_REQUIRED | TIMEOUT | UNKNOWN
```

Tools return this structure - never throw exceptions at public boundaries.

---

## Provider Architecture

### Supported Providers (7)

| Provider | Description | Default Model | Example Models |
|----------|-------------|---------------|----------------|
| `openai` | OpenAI API | gpt-5-mini | gpt-4o, gpt-5-mini |
| `anthropic` | Anthropic API | claude-haiku-4-5 | claude-sonnet-4-5, claude-opus-4 |
| `azure` | Azure OpenAI | (deployment) | gpt-5-codex, gpt-4o |
| `foundry` | Azure AI Foundry | (deployment) | Managed models |
| `gemini` | Google Gemini | gemini-2.0-flash-exp | gemini-2.5-pro |
| `github` | GitHub Models | gpt-4o-mini | phi-4, llama-3.3-70b-instruct |
| `local` | Docker Model Runner | ai/phi4 | Local models via OpenAI-compatible API |

### Provider Selection

Providers are selected by **name** in configuration, not by model prefix:

```
settings.json
─────────────
{
  "providers": {
    "default": "openai",                  ← Selected provider
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

Note: Config uses camelCase consistently (TypeScript convention).
On-disk JSON matches in-memory TypeScript objects without transformation.
```

### Provider Registry

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

### Provider-Specific Notes

| Provider | Authentication | Notes |
|----------|----------------|-------|
| `openai` | API key | Standard OpenAI API |
| `anthropic` | API key | Anthropic Claude API |
| `azure` | API key or Azure CLI credential | Supports AzureCliCredential fallback |
| `foundry` | Azure CLI credential | Async credential required |
| `gemini` | API key or Vertex AI | Supports both direct API and Vertex AI |
| `github` | GitHub token | Supports org-scoped enterprise rate limits |
| `local` | None | Docker Desktop Model Runner (OpenAI-compatible) |

### Model Layer Deep Dive

*Contributed with GitHub Copilot*

This section provides comprehensive documentation for the entire Model Layer (`src/model/`), explaining how providers, registry, LLMClient, retry logic, and response contracts work together to create a robust multi-provider LLM abstraction.

#### Model Directory Structure

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

#### Module Architecture Overview

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
│  ├─ LLMClient (main orchestrator)                               │
│  │   ├─ invoke() (complete response with retry)                 │
│  │   ├─ stream() (async iterator with retry)                    │
│  │   ├─ getClient() (lazy client initialization + caching)      │
│  │   └─ wrapStreamWithCallbacks() (chunk + usage callbacks)     │
│  │                                                               │
│  providers/                                                      │
│  ├─ createOpenAIClient()                                         │
│  ├─ createAnthropicClient()                                      │
│  ├─ createAzureOpenAIClient()                                    │
│  ├─ createGeminiClient()                                         │
│  ├─ createGitHubClient()                                         │
│  ├─ createLocalClient()                                          │
│  └─ createFoundryClient()                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Core Types and Response Contract (`types.ts`)

**ModelResponse Discriminated Union**:
```typescript
type ModelResponse<T> = ModelSuccessResponse<T> | ModelErrorResponse

interface ModelSuccessResponse<T> {
  success: true;
  result: T;
  message: string;
}

interface ModelErrorResponse {
  success: false;
  error: ModelErrorCode;
  message: string;
  retryAfterMs?: number;  // Provider-specified retry delay
}
```

**Design Principles**:
- **Never throw at boundaries**: All public functions return `ModelResponse<T>`
- **Type-safe discrimination**: Use `success` boolean to narrow types
- **Retry metadata**: `retryAfterMs` field carries provider-specified delays
- **Human-readable messages**: Both success and error include descriptive messages

**ModelErrorCode Types** (10 codes):
```typescript
type ModelErrorCode =
  | 'PROVIDER_NOT_CONFIGURED'    // Config missing/invalid
  | 'PROVIDER_NOT_SUPPORTED'     // Unknown provider name
  | 'AUTHENTICATION_ERROR'       // Invalid API key
  | 'RATE_LIMITED'               // Rate limit exceeded (RETRYABLE)
  | 'MODEL_NOT_FOUND'            // Invalid model name
  | 'CONTEXT_LENGTH_EXCEEDED'    // Prompt too long
  | 'NETWORK_ERROR'              // Connection issues (RETRYABLE)
  | 'TIMEOUT'                    // Request timeout (RETRYABLE)
  | 'INVALID_RESPONSE'           // Malformed API response
  | 'UNKNOWN';                   // Unexpected errors
```

**Retryable vs Non-Retryable**:
- **Retryable** (3): `RATE_LIMITED`, `NETWORK_ERROR`, `TIMEOUT` → transient failures
- **Non-Retryable** (7): All others → permanent failures (don't waste time retrying)

**Other Key Types**:
```typescript
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface InvokeResult {
  content: string;
  usage?: TokenUsage;
}

interface LLMCallbacks {
  onStreamStart?: () => void;
  onStreamChunk?: (chunk: string) => void;
  onStreamEnd?: (usage?: TokenUsage) => void;
  onError?: (error: ModelErrorCode, message: string) => void;
  onRetry?: (context: RetryContext) => void;
}

type ProviderFactory = (
  config: Record<string, unknown>
) => Promise<ModelResponse<BaseChatModel>>;
```

#### Response Helpers (`base.ts`)

**Factory Functions**:
```typescript
// Create success response
successResponse<T>(result: T, message: string): ModelSuccessResponse<T>

// Create error response (with optional retry delay)
errorResponse(
  error: ModelErrorCode, 
  message: string, 
  retryAfterMs?: number
): ModelErrorResponse
```

**Error Mapping**:
```typescript
function mapErrorToCode(error: unknown): ModelErrorCode
```

Uses keyword matching on error messages to categorize errors:
- `"api key"`, `"authentication"`, `"unauthorized"` → `AUTHENTICATION_ERROR`
- `"rate limit"`, `"429"` → `RATE_LIMITED`
- `"model"` + `"not found"` → `MODEL_NOT_FOUND`
- `"context length"`, `"too long"`, `"token limit"` → `CONTEXT_LENGTH_EXCEEDED`
- `"timeout"`, `"timed out"` → `TIMEOUT`
- `"network"`, `"econnrefused"`, `"fetch failed"`, `"500"`, `"502"`, `"503"` → `NETWORK_ERROR`
- Everything else → `UNKNOWN`

**Token Usage Extraction**:
```typescript
function extractTokenUsage(
  metadata: Record<string, unknown> | undefined
): TokenUsage | undefined
```

Handles multiple provider formats:
- **OpenAI**: `{ usage: { prompt_tokens, completion_tokens, total_tokens } }`
- **Anthropic**: `{ usage: { input_tokens, output_tokens } }` (no total, calculated)
- **Generic**: `{ token_usage: { prompt_tokens, completion_tokens, total_tokens } }`
- Falls back to camelCase variants (`promptTokens`, `completionTokens`)

#### Provider Registry (`registry.ts`)

**Registry Constant**:
```typescript
export const PROVIDER_REGISTRY: Partial<Record<ProviderName, ProviderFactory>> = {
  openai: createOpenAIClient,
  anthropic: createAnthropicClient,
  gemini: createGeminiClient,
  azure: createAzureOpenAIClient,
  local: createLocalClient,
  foundry: createFoundryClient,
  github: createGitHubClient,
};
```

**Registry Functions**:
```typescript
// Get factory for a provider (returns undefined if not registered)
getProviderFactory(providerName: ProviderName): ProviderFactory | undefined

// Check if provider has a registered factory
isProviderSupported(providerName: ProviderName): boolean

// Get array of supported provider names
getSupportedProviders(): ProviderName[]
```

**Usage Pattern**:
1. User sets `config.providers.default = "anthropic"`
2. LLMClient calls `isProviderSupported("anthropic")` → `true`
3. LLMClient calls `getProviderFactory("anthropic")` → `createAnthropicClient`
4. LLMClient invokes factory: `await createAnthropicClient(config.providers.anthropic)`
5. Factory returns `ModelResponse<BaseChatModel>`

#### Retry Logic (`retry.ts`)

**Retry Strategy**:
- **Exponential backoff**: `delay = baseDelay * 2^attempt` (capped at maxDelay)
- **Jitter**: Random variation to avoid thundering herd (±25% by default)
- **Provider-aware**: Respects `Retry-After` headers from providers
- **Selective**: Only retries transient errors (rate limits, network, timeout)

**Configuration** (from `config.retry`):
```typescript
{
  enabled: boolean,          // Default: true
  maxRetries: number,        // Default: 3
  baseDelayMs: number,       // Default: 1000 (1 second)
  maxDelayMs: number,        // Default: 10000 (10 seconds)
  enableJitter: boolean      // Default: true
}
```

**Core Functions**:

```typescript
// Wrap operation with retry logic
async function withRetry<T>(
  operation: () => Promise<ModelResponse<T>>,
  options: RetryOptions
): Promise<ModelResponse<T>>
```

**Retry Flow**:
```
attempt = 0
  ↓
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
(loop back to Execute operation)
```

**Helper Functions**:
```typescript
// Check if error code is retryable
isRetryableError(code: ModelErrorCode): boolean

// Calculate exponential backoff delay with jitter
calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  enableJitter: boolean
): number

// Extract Retry-After from provider error metadata
extractRetryAfter(error: unknown): number | undefined
```

**Retry-After Parsing**:
- Numeric string (seconds): `"60"` → 60000ms
- HTTP-date: `"Wed, 21 Oct 2015 07:28:00 GMT"` → delay until that time
- Number field: `{ retryAfter: 30 }` → 30000ms

#### LLMClient Orchestrator (`llm.ts`)

**Primary Class**:
```typescript
class LLMClient {
  constructor(options: LLMClientOptions)
  
  // Public methods
  async invoke(input: string | BaseMessage[]): Promise<ModelResponse<InvokeResult>>
  async stream(input: string | BaseMessage[]): Promise<ModelResponse<StreamResult>>
  getProviderName(): ProviderName
  getModelName(): string
  
  // Private methods
  private async getClient(): Promise<ModelResponse<BaseChatModel>>
  private async invokeOnce(input: string | BaseMessage[]): Promise<ModelResponse<InvokeResult>>
  private async streamOnce(input: string | BaseMessage[]): Promise<ModelResponse<StreamResult>>
  private wrapStreamWithCallbacks(stream): AsyncIterable<AIMessageChunk>
}
```

**Constructor Options**:
```typescript
interface LLMClientOptions {
  config: AppConfig;              // Full app configuration
  callbacks?: LLMCallbacks;       // Streaming + error callbacks
  retryConfig?: RetryConfig;      // Override config.retry
}
```

**Client Lifecycle**:

```
new LLMClient({ config, callbacks })
        ↓
Store config + callbacks
        ↓
client = null (lazy initialization)
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

**Invoke Flow** (with retry):
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

**Stream Flow** (with retry on stream start only):
```
stream(input)
    ↓
Fire onStreamStart callback (ONCE)
    ↓
┌────────────────────┐
│ Retry enabled?     │ No → streamOnce() → return
└─────────┬──────────┘
          │ Yes
          ↓
withRetry(() => streamOnce(input))
    ↓
Loop: attempt 0 to maxRetries (on stream START errors only)
    ↓
streamOnce(input)
    ├─ getClient()
    ├─ toMessages(input)
    ├─ await client.stream(messages)
    ├─ wrapStreamWithCallbacks(stream)
    └─ Return ModelResponse<StreamResult>
    ↓
If success: Return stream
    ↓
Consumer iterates stream:
    for await (chunk of stream) {
        onStreamChunk(chunk.content)
    }
    ↓
    onStreamEnd(usage)
```

**Key Design Decisions**:

1. **Lazy Client Initialization**: Client is created on first use, not in constructor
2. **Client Caching**: Client is cached and reused until provider changes
3. **Async Factories**: All factories return `Promise` for consistency (e.g., Foundry local mode needs async init)
4. **Callback Semantics**:
   - `onStreamStart`: Fires ONCE before retry loop
   - `onRetry`: Fires for each retry attempt
   - `onStreamChunk`: Fires for successful stream only
   - `onStreamEnd`: Fires once at successful stream completion
   - `onError`: Fires ONCE after all retries exhausted
5. **Stream Retry Limitation**: Only the `stream()` call is retried, not iteration errors
6. **No Runtime Options**: LangChain 1.x removed `bind()` support for temperature/maxTokens at runtime

**Public Utility Methods**:
```typescript
// Get current provider name from config
getProviderName(): ProviderName

// Get current model/deployment name (handles Azure deployment field)
getModelName(): string
```

#### Complete Invocation Flow

From user code to LLM response:

```
USER CODE
    ↓
const client = new LLMClient({ config, callbacks })
const result = await client.invoke('Hello')
    ↓
─────────────────────────────────────
LLMCLIENT
    ↓
invoke('Hello')
    ↓
withRetry(() => invokeOnce('Hello'))
    ↓
invokeOnce('Hello')
    ↓
getClient()
    ↓
─────────────────────────────────────
REGISTRY
    ↓
isProviderSupported('anthropic') → true
    ↓
getProviderFactory('anthropic') → createAnthropicClient
    ↓
─────────────────────────────────────
PROVIDER FACTORY
    ↓
await createAnthropicClient(config.providers.anthropic)
    ↓
Extract: apiKey, model with defaults
    ↓
new ChatAnthropic({ model, anthropicApiKey })
    ↓
return successResponse(client, message)
    ↓
─────────────────────────────────────
LLMCLIENT (continued)
    ↓
Cache client + provider name
    ↓
Convert 'Hello' to [HumanMessage('Hello')]
    ↓
─────────────────────────────────────
LANGCHAIN
    ↓
await client.invoke(messages)
    ↓
HTTP POST to api.anthropic.com
    ↓
Response: { content: 'Hi there!', usage: {...} }
    ↓
─────────────────────────────────────
LLMCLIENT (continued)
    ↓
Extract content: 'Hi there!'
    ↓
extractTokenUsage(response.response_metadata)
    ↓
return successResponse({ content, usage }, message)
    ↓
─────────────────────────────────────
USER CODE
    ↓
if (result.success) {
  console.log(result.result.content)  // 'Hi there!'
  console.log(result.result.usage)    // { promptTokens: 8, ... }
}
```

#### Error Handling Flow

```
Provider throws error (e.g., rate limit)
    ↓
catch (error) in invokeOnce()
    ↓
mapErrorToCode(error) → 'RATE_LIMITED'
    ↓
extractRetryAfter(error) → 30000ms (if provider specifies)
    ↓
return errorResponse('RATE_LIMITED', message, 30000)
    ↓
withRetry checks: isRetryableError('RATE_LIMITED') → true
    ↓
Calculate delay: use 30000ms (Retry-After) or exponential backoff
    ↓
Fire onRetry({ attempt: 1, maxRetries: 3, delayMs: 30000, ... })
    ↓
Sleep 30 seconds
    ↓
Retry invokeOnce() (attempt 2)
    ↓
If still fails: repeat up to maxRetries times
    ↓
Final failure: return error response
    ↓
invoke() fires onError('RATE_LIMITED', message)
    ↓
Return error to user
```

#### Module Exports (`index.ts`)

The `src/model/index.ts` file provides a clean public API:

**Types**:
```typescript
ModelResponse, ModelSuccessResponse, ModelErrorResponse
ModelErrorCode, TokenUsage, InvokeResult
LLMCallbacks, LLMCallOptions, ProviderFactory, StreamResult
RetryableErrorCode, NonRetryableErrorCode, RetryContext, RetryOptions
```

**Type Guards**:
```typescript
isModelSuccess<T>(response): response is ModelSuccessResponse<T>
isModelError(response): response is ModelErrorResponse
```

**Helpers**:
```typescript
successResponse<T>(result, message)
errorResponse(error, message, retryAfterMs?)
mapErrorToCode(error)
extractTokenUsage(metadata)
```

**Registry**:
```typescript
PROVIDER_REGISTRY
getProviderFactory(providerName)
isProviderSupported(providerName)
getSupportedProviders()
```

**Client**:
```typescript
LLMClient, LLMClientOptions
```

**Retry**:
```typescript
withRetry(operation, options)
isRetryableError(code)
calculateDelay(attempt, baseDelayMs, maxDelayMs, enableJitter)
extractRetryAfter(error)
```

**Provider Factories**:
```typescript
createOpenAIClient(config)
createAnthropicClient(config)
createGeminiClient(config)
createAzureOpenAIClient(config)
// Note: Other providers exported but not listed in index.ts
```

### Provider System Deep Dive

*Continued from Model Layer Deep Dive above*

This section provides detailed documentation for the Provider architecture implementation in `src/model/providers/`.

#### Provider Factory Pattern

All providers implement a unified factory pattern that creates LangChain `BaseChatModel` instances from configuration:

```typescript
export function create<Provider>Client(
  config: <Provider>Config | Record<string, unknown>
): Promise<ModelResponse<BaseChatModel>>
```

**Key Characteristics:**
- **Async Factory Functions**: All factories return `Promise<ModelResponse<BaseChatModel>>` to support providers requiring async initialization (e.g., Foundry local mode)
- **Type-Safe Configuration**: Accepts typed config from Zod schemas OR generic `Record<string, unknown>` for flexibility
- **Structured Responses**: Returns `ModelResponse<T>` discriminated union (never throws at public boundaries)
- **Environment Fallback**: All providers support environment variable fallback for API keys
- **Validation First**: Required fields are validated before attempting client creation

#### Provider Implementation Details

##### OpenAI Provider (`src/model/providers/openai.ts`)

**Package**: `@langchain/openai` (ChatOpenAI)

**Configuration**:
```typescript
{
  apiKey?: string,      // Falls back to OPENAI_API_KEY env var
  model?: string,       // Default: gpt-5-mini
  baseUrl?: string      // Optional custom endpoint
}
```

**Features**:
- Simplest provider implementation (reference pattern for others)
- Supports custom base URLs for OpenAI-compatible APIs
- Empty string `baseUrl` treated as unset

**Authentication Flow**:
```
config.apiKey → OPENAI_API_KEY env var → LangChain default
```

##### Anthropic Provider (`src/model/providers/anthropic.ts`)

**Package**: `@langchain/anthropic` (ChatAnthropic)

**Configuration**:
```typescript
{
  apiKey?: string,      // Falls back to ANTHROPIC_API_KEY env var
  model?: string        // Default: claude-sonnet-4-20250514
}
```

**Features**:
- Similar to OpenAI but uses `anthropicApiKey` parameter
- Supports all Claude model families (Haiku, Sonnet, Opus)
- Long context windows (200K+ tokens for Claude 3.5+)

**Authentication Flow**:
```
config.apiKey → ANTHROPIC_API_KEY env var → LangChain default
```

##### Azure OpenAI Provider (`src/model/providers/azure-openai.ts`)

**Package**: `@langchain/openai` (AzureChatOpenAI)

**Configuration**:
```typescript
{
  endpoint: string,         // Required: Azure OpenAI endpoint URL
  deployment: string,       // Required: Deployment name (not model)
  apiVersion?: string,      // Default: '2024-06-01'
  apiKey?: string          // Falls back to AZURE_OPENAI_API_KEY env var
}
```

**Features**:
- Uses Azure-specific endpoints and deployments
- Deployment name replaces model name in configuration
- Supports multiple API versions
- `LLMClient.getModelName()` returns deployment for Azure

**Validation**:
- Both `endpoint` and `deployment` are required
- Returns `PROVIDER_NOT_CONFIGURED` error if either is missing
- Empty strings treated as missing values

**Authentication Flow**:
```
config.apiKey → AZURE_OPENAI_API_KEY env var → Azure CLI credentials
```

##### Gemini Provider (`src/model/providers/gemini.ts`)

**Package**: `@langchain/google-genai` (ChatGoogleGenerativeAI)

**Configuration**:
```typescript
{
  apiKey?: string,          // Falls back to GOOGLE_API_KEY env var
  model?: string,           // Default: gemini-2.0-flash-exp
  useVertexai?: boolean     // Default: false (Gemini API mode)
}
```

**Features**:
- Uses Gemini Developer API (direct Google AI API)
- Vertex AI mode is NOT supported (requires separate `@langchain/google-vertexai` package)
- Setting `useVertexai: true` returns `PROVIDER_NOT_CONFIGURED` error with guidance

**Authentication Flow (Gemini API)**:
```
config.apiKey → GOOGLE_API_KEY env var → LangChain default
```

**Vertex AI Note**: If Vertex AI support is needed, users must install `@langchain/google-vertexai` and use a custom provider setup.

##### GitHub Models Provider (`src/model/providers/github.ts`)

**Package**: `@langchain/openai` (ChatOpenAI with custom endpoint)

**Configuration**:
```typescript
{
  token?: string,           // Falls back to GITHUB_TOKEN env var or gh CLI
  model?: string,           // Default: gpt-4o-mini
  endpoint?: string,        // Default: https://models.github.ai/inference
  org?: string             // Optional: Organization name for enterprise
}
```

**Features**:
- Uses OpenAI-compatible GitHub Models API
- Three-tier authentication fallback: config → env var → GitHub CLI
- Supports personal and organization-scoped access
- Automatic endpoint modification for org mode

**Authentication Flow**:
```
config.token → GITHUB_TOKEN env var → gh auth token → ERROR
```

**GitHub CLI Integration** (`src/config/providers/github.ts`):
```typescript
function getGitHubCLIToken(): string | undefined {
  // Executes: gh auth token --secure-storage
  // Returns token if authenticated, undefined otherwise
}
```

**Endpoint Construction**:
- **Personal**: `https://models.github.ai/inference`
- **Organization**: `https://models.github.ai/orgs/{org}/inference`

**Validation**:
- Token is required (no anonymous access)
- Returns `PROVIDER_NOT_CONFIGURED` with multi-option guidance if token unavailable

##### Local Provider (`src/model/providers/local.ts`)

**Package**: `@langchain/openai` (ChatOpenAI with custom endpoint)

**Configuration**:
```typescript
{
  baseUrl?: string,         // Default: http://localhost:11434/v1 (Ollama)
  model?: string           // Default: llama3.3:latest
}
```

**Features**:
- Supports any OpenAI-compatible local server
- Defaults to Ollama endpoint
- No authentication required (uses placeholder key)

**Supported Backends**:
1. **Ollama** (default): `http://localhost:11434/v1`
2. **Docker Model Runner**: `http://model-runner.docker.internal/engines/llama.cpp/v1` (Docker-only)
3. **LM Studio**: `http://localhost:1234/v1`
4. **Any OpenAI-compatible server**

**Authentication**:
- Uses placeholder: `openAIApiKey: 'not-needed'`
- Local servers typically don't require authentication

##### Azure AI Foundry Provider (`src/model/providers/foundry.ts`)

**Package**: `@langchain/openai` (ChatOpenAI) + optional `foundry-local-sdk`

**Configuration**:
```typescript
{
  mode?: 'local' | 'cloud',    // Default: 'local'
  
  // Local mode fields:
  modelAlias?: string,          // Default: 'phi-4'
  temperature?: number,
  
  // Cloud mode fields:
  projectEndpoint?: string,     // Required for cloud mode
  modelDeployment?: string,     // Default: 'gpt-4o'
  apiKey?: string              // Falls back to AZURE_FOUNDRY_API_KEY env var
}
```

**Features**:
- **Dual-mode provider**: local (on-device) or cloud (Azure-hosted)
- Local mode uses `foundry-local-sdk` for model management
- Cloud mode uses Azure AI Foundry OpenAI v1-compatible API
- Async initialization for local mode (service startup + model loading)

**Local Mode** (`createLocalFoundryClient`):
1. Dynamic import of `foundry-local-sdk` to avoid dependency when unused
2. Initialize `FoundryLocalManager`
3. Check if service is running, start if needed
4. Initialize model by alias (e.g., "phi-4" → actual model ID)
5. Extract endpoint and API key from manager
6. Create ChatOpenAI with local endpoint

**Local Mode Flow**:
```
FoundryLocalManager.init(modelAlias)
        ↓
Service running check → Start service if needed
        ↓
Model initialization (may download model)
        ↓
Extract endpoint + apiKey
        ↓
ChatOpenAI with local config
```

**Cloud Mode** (`createCloudFoundryClient`):
1. Validate `projectEndpoint` and `apiKey` are provided
2. Construct OpenAI v1-compatible endpoint: `{projectEndpoint}/openai/v1`
3. Configure `api-key` header (Azure uses header auth, not Bearer tokens)
4. Create ChatOpenAI with Azure AI Foundry endpoint

**Cloud Mode Authentication**:
- Uses `api-key` header instead of Bearer token
- `openAIApiKey` parameter set to placeholder value
- Actual authentication via `defaultHeaders: { 'api-key': apiKey }`

**Error Handling**:
- Local mode: `MODEL_NOT_FOUND` if model fails to initialize
- Cloud mode: `PROVIDER_NOT_CONFIGURED` if endpoint or apiKey missing

#### Provider Registry Architecture

**File**: `src/model/registry.ts`

**Registry Structure**:
```typescript
export const PROVIDER_REGISTRY: Partial<Record<ProviderName, ProviderFactory>> = {
  openai: createOpenAIClient,
  anthropic: createAnthropicClient,
  gemini: createGeminiClient,
  azure: createAzureOpenAIClient,
  local: createLocalClient,
  foundry: createFoundryClient,
  github: createGitHubClient,
};
```

**Registry Functions**:

```typescript
// Get factory for a provider
getProviderFactory(providerName: ProviderName): ProviderFactory | undefined

// Check if provider is supported
isProviderSupported(providerName: ProviderName): boolean

// Get list of supported providers
getSupportedProviders(): ProviderName[]
```

**Usage in LLMClient**:
1. Extract `config.providers.default` (e.g., "anthropic")
2. Call `isProviderSupported(providerName)` → returns true/false
3. Call `getProviderFactory(providerName)` → returns factory function
4. Invoke factory with `config.providers[providerName]` → returns `ModelResponse<BaseChatModel>`
5. Cache client for reuse across invocations

#### Provider Lifecycle in LLMClient

**File**: `src/model/llm.ts`

**Initialization Flow**:
```
User creates LLMClient({ config })
        ↓
First invoke/stream call
        ↓
getClient() (private async method)
        ↓
┌──────────────────────────────┐
│ Is client cached?            │
│ And provider unchanged?      │
└──────┬───────────────────────┘
       │
   ┌───┴──┐
   │ Yes  │ → Return cached client
   └──────┘
       │
   ┌───┴──┐
   │ No   │
   └───┬──┘
       ↓
Check if provider supported
       ↓
Get provider config
       ↓
Get provider factory from registry
       ↓
await factory(providerConfig)
       ↓
Cache client + provider name
       ↓
Return client
```

**Caching Strategy**:
- Client is cached after first successful creation
- Cache is invalidated if `config.providers.default` changes
- No TTL or max-age (client lives for LLMClient instance lifetime)

**Error Propagation**:
- Factory errors (e.g., invalid API key) return `ModelResponse` with `success: false`
- LLMClient propagates error responses without throwing
- Callbacks receive error notifications via `onError(errorCode, message)`

#### Provider Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                      User Configuration                          │
│                                                                  │
│  providers: {                                                    │
│    default: "anthropic"                                          │
│    anthropic: { apiKey: "...", model: "claude-sonnet-4-5" }     │
│  }                                                               │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                         LLMClient                                │
│                                                                  │
│  constructor({ config }) ────► Store config + callbacks          │
│                                                                  │
│  invoke(prompt) ──────────────┐                                 │
│  stream(prompt) ──────────────┤                                 │
└───────────────────────────────┼──────────────────────────────────┘
                                │
                                ▼
                        getClient() (private)
                                │
                ┌───────────────┼───────────────┐
                │               │               │
                ▼               ▼               ▼
        Check cached    Get provider    Call factory
            client          name           function
                │               │               │
                └───────────────┴───────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Provider Registry                           │
│                                                                  │
│  PROVIDER_REGISTRY['anthropic'] ──► createAnthropicClient        │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│              createAnthropicClient(config)                       │
│                                                                  │
│  1. Extract config fields with defaults                          │
│  2. new ChatAnthropic({ model, anthropicApiKey })               │
│  3. Return successResponse(client, message)                      │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                   LangChain BaseChatModel                        │
│                                                                  │
│  invoke(messages) ───► API call ───► Response                    │
│  stream(messages) ───► API call ───► Async Iterator             │
└──────────────────────────────────────────────────────────────────┘
```

#### Error Handling by Provider

All providers follow the same error handling pattern:

```typescript
try {
  // Validate config
  // Create LangChain client
  return successResponse(client, message);
} catch (error) {
  const errorCode = mapErrorToCode(error);
  const message = error instanceof Error ? error.message : 'Failed to create <Provider> client';
  return errorResponse(errorCode, message);
}
```

**Error Mapping** (`src/model/base.ts`):

```typescript
function mapErrorToCode(error: unknown): ModelErrorCode {
  // Keyword matching on error messages
  // Returns one of: AUTHENTICATION_ERROR, RATE_LIMITED, MODEL_NOT_FOUND,
  //                 CONTEXT_LENGTH_EXCEEDED, TIMEOUT, NETWORK_ERROR, UNKNOWN
}
```

**Common Error Patterns by Provider**:

| Provider | Error Type | Trigger | ErrorCode |
|----------|-----------|---------|-----------|
| OpenAI | Invalid API key | Bad `apiKey` | `AUTHENTICATION_ERROR` |
| Anthropic | Rate limit | Too many requests | `RATE_LIMITED` |
| Azure | Deployment not found | Invalid `deployment` | `MODEL_NOT_FOUND` |
| Foundry Local | Model initialization fails | Missing model files | `MODEL_NOT_FOUND` |
| Foundry Cloud | Missing projectEndpoint | Config validation | `PROVIDER_NOT_CONFIGURED` |
| Gemini | Vertex AI mode | `useVertexai: true` | `PROVIDER_NOT_CONFIGURED` |
| GitHub | No authentication | Missing token sources | `PROVIDER_NOT_CONFIGURED` |
| Local | Connection refused | Server not running | `NETWORK_ERROR` |

#### Adding a New Provider

To add a new provider to the framework:

**1. Create Provider Factory** (`src/model/providers/<provider>.ts`):
```typescript
import { Chat<Provider> } from '@langchain/<package>';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { <Provider>Config } from '../../config/schema.js';
import type { ModelResponse } from '../types.js';
import { successResponse, errorResponse, mapErrorToCode } from '../base.js';

export function create<Provider>Client(
  config: <Provider>Config | Record<string, unknown>
): Promise<ModelResponse<BaseChatModel>> {
  try {
    // Extract config with defaults
    // Validate required fields
    // Create LangChain client
    // Return success response
  } catch (error) {
    // Map error and return error response
  }
}
```

**2. Add to Registry** (`src/model/registry.ts`):
```typescript
import { create<Provider>Client } from './providers/<provider>.js';

export const PROVIDER_REGISTRY = {
  // ... existing providers
  <provider>: create<Provider>Client,
};
```

**3. Export from Module** (`src/model/index.ts`):
```typescript
export { create<Provider>Client } from './providers/<provider>.js';
```

**4. Define Config Schema** (`src/config/schema.ts`):
```typescript
export const <Provider>ProviderConfigSchema = z.object({
  // Provider-specific fields
});

export type <Provider>ProviderConfig = z.infer<typeof <Provider>ProviderConfigSchema>;
```

**5. Add Constants** (`src/config/constants.ts`):
```typescript
export const DEFAULT_<PROVIDER>_MODEL = 'model-name';
// Other provider-specific constants
```

**6. Write Tests** (`src/model/__tests__/<provider>.test.ts`):
- Mock the LangChain provider class
- Test factory with various configs
- Test error handling
- Test environment variable fallback

**7. Update Documentation**:
- Add provider to supported providers table
- Document authentication methods
- Add provider-specific notes

#### Provider Testing Patterns

All provider tests follow a consistent pattern using Jest mocks:

```typescript
// 1. Define mock config interface
interface Mock<Provider>Config { /* ... */ }

// 2. Create mock constructor
const mockChat<Provider> = jest
  .fn<(config: Mock<Provider>Config) => { model: string; _type: string }>()
  .mockImplementation((config) => ({
    model: config.model,
    _type: 'chat_model',
  }));

// 3. Mock module before import
jest.unstable_mockModule('@langchain/<package>', () => ({
  Chat<Provider>: mockChat<Provider>,
}));

// 4. Dynamic import after mocking
const { create<Provider>Client } = await import('../providers/<provider>.js');

// 5. Test success cases
it('creates client with valid config', () => {
  const result = create<Provider>Client({ /* ... */ });
  expect(result.success).toBe(true);
});

// 6. Test error cases
it('returns error when field missing', () => {
  const result = create<Provider>Client({ /* incomplete config */ });
  expect(result.success).toBe(false);
  expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
});
```

**Test Coverage Requirements**:
- ✅ Valid config creates client successfully
- ✅ Missing optional fields use defaults
- ✅ Missing required fields return errors
- ✅ Environment variable fallback works
- ✅ Constructor errors are caught and mapped
- ✅ Non-Error throws are handled
- ✅ `Record<string, unknown>` config type works

---

## Configuration Architecture

### Config Directory

The config directory is `.agent/` (matches Python for easier migration):
- **Project config**: `./.agent/settings.json` (committable, team-shared)
- **User config**: `~/.agent/settings.json` (personal, never committed)
- **Sessions**: `~/.agent/sessions/`
- **Context**: `~/.agent/context/` (cleared per session)
- **Skills**: `~/.agent/skills/` (user plugins)

### Config Conventions

- **Casing**: camelCase for all keys (TypeScript convention)
- **On-disk format**: JSON matches in-memory objects (no transformation)
- **Validation**: Zod schemas with TypeScript type inference

### Hierarchy (Highest to Lowest Priority)

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

### Config Schema Structure

```
AppConfig
├── providers
│   ├── default: string
│   ├── openai?: { apiKey, model, baseUrl }
│   ├── anthropic?: { apiKey, model }
│   ├── azure?: { apiKey, endpoint, deployment, apiVersion }
│   └── ... (7 providers total)
│
├── agent
│   ├── systemPrompt?: string
│   ├── maxTokens: number
│   └── temperature: number
│
├── telemetry
│   ├── enabled: boolean
│   ├── endpoint: string
│   └── enableSensitiveData: boolean
│
└── skills
    ├── enabled: string[]
    └── pluginDir?: string
```

All schemas defined with Zod. Types inferred via `z.infer<>`.

---

## Error Handling Architecture

### Error Type Hierarchy

```
AgentError (base)
├── ProviderError     ─► Rate limits, auth failures, network issues
├── ConfigError       ─► Validation failures, missing required fields
├── ToolError         ─► Tool execution failures
└── PermissionError   ─► Permission denied for operation
```

### Error Handling by Layer

| Layer | Strategy |
|-------|----------|
| **Tools** | Return `ToolResponse` at boundary, never throw |
| **Agent/Model** | May throw `AgentError` subclasses |
| **CLI** | Catches all errors, displays user-friendly messages |

### Error Flow

```
Tool Layer                    Agent Layer                   CLI Layer
──────────                    ───────────                   ─────────

try/catch internally          May throw AgentError          try {
       │                             │                        agent.run()
       ▼                             │                      } catch {
Return ToolResponse ─────────►  Handles tool errors           display error
  (never throw)                      │                        reset cleanly
                                     ▼                      }
                              Throws for fatal errors ─────►
```

### Retry Strategy

External API calls use exponential backoff with jitter:
- Base delay: 1 second
- Max delay: 10 seconds
- Max retries: 3
- Retryable: rate limits, transient network errors
- Non-retryable: auth failures, validation errors

### Graceful Degradation

| Failure | Fallback |
|---------|----------|
| LLM parsing fails | Extract text content, skip structure |
| History selection fails | Proceed without context |
| Telemetry fails | Continue with no-op tracer |
| Non-critical operations | Log and continue |

---

## Permissions Architecture

### Permission Model

```
┌─────────────────────────────────────────────────────────┐
│                    Permission Check                      │
│                                                          │
│  Tool requests permission ──► Check settings hierarchy   │
│                                      │                   │
│                    ┌─────────────────┼─────────────────┐ │
│                    ▼                 ▼                 ▼ │
│              Project rules     User rules      Interactive│
│              (committed)       (personal)       prompt    │
│                    │                 │              │     │
│                    └─────────────────┴──────────────┘     │
│                                      │                    │
│                                      ▼                    │
│                              Allow / Deny                 │
└─────────────────────────────────────────────────────────┘
```

### Permission Scopes

| Scope | Description | Default |
|-------|-------------|---------|
| `fs-read` | Read files in working directory | Allowed within project |
| `fs-write` | Create/modify files | Denied |
| `fs-delete` | Delete files | Denied |
| `shell-run` | Execute shell commands | Denied |

### Sensitive Paths (Always Prompt)

Even with `fs-read` allowed, these paths require explicit per-session approval:
- `~/.ssh/*`, `~/.gnupg/*` - Credentials and keys
- `.env*`, `*credentials*`, `*secret*` - Environment secrets
- OS keychains and credential stores

### Permission Callback Flow

```
Tool.execute(input)
       │
       ▼
callbacks.onPermissionRequest({
  scope: 'fs-write',
  resource: '/path/to/file',
  action: 'write file'
})
       │
       ▼
┌──────┴──────┐
│   Allowed?  │
└──────┬──────┘
       │
  ┌────┴────┐
  ▼         ▼
true      false
  │         │
  ▼         ▼
Proceed   Return PermissionDenied
```

---

## Session Architecture

### Session Lifecycle

```
Session Start                    During Session                 Session End
─────────────                    ──────────────                 ───────────

Create session ID                Log events:                    Save session file
       │                         • LLM calls                    Clear context dir
       ▼                         • Tool calls                          │
Initialize context dir           • Errors                              ▼
       │                                │                        Sessions stored in
       ▼                                ▼                        ~/<config-dir>/sessions/
Begin logging              Persist large outputs to
                           ~/<config-dir>/context/
```

### Session Storage

| Location | Purpose | Lifecycle |
|----------|---------|-----------|
| `~/<config-dir>/sessions/` | Conversation history, event logs | Persisted |
| `~/<config-dir>/context/` | Tool outputs, large results | Cleared per session |

### Logged Events

- Session lifecycle (start, end, duration)
- LLM calls (model, token usage, latency)
- Tool calls (name, args, result status, duration)
- Errors (type, message, sanitized context)

**Redaction Required:** API keys, tokens, and sensitive file contents must never appear in logs.

---

## Context Storage Strategy

### Problem
Tool outputs can be large (search results, file contents). Keeping all outputs in memory causes unbounded growth.

### Solution
Filesystem-backed storage with lazy loading.

```
Execution Phase                    Answer Phase
───────────────                    ────────────

Tool executes                      Select relevant contexts
     │                                  │
     ▼                                  ▼
Save to filesystem              Load only selected data
     │                                  │
     ▼                                  ▼
Store pointer in memory         Build answer prompt
(lightweight metadata)
```

### Storage Layout

```
~/<config-dir>/context/
├── AAPL_get_financials_a1b2c3.json
├── search_code_d4e5f6.json
└── read_file_g7h8i9.json

Each file contains:
{
  toolName, args, result,
  timestamp, queryId
}
```

### Lifecycle

1. **During execution:** Tool outputs saved, pointers tracked
2. **During answer:** LLM selects relevant pointers, full data loaded
3. **End of session:** Context directory cleared

### Session Resume and Context

**Important:** Context is ephemeral and not preserved across session resume.

When a session is resumed (`--continue`):
- **Conversation history** is restored (messages, timestamps)
- **Event logs** are available (LLM calls, tool calls)
- **Context data is NOT restored** (large tool outputs are lost)

This is a deliberate trade-off:
- **Rationale:** Context can be very large (search results, file contents)
- **Implication:** Resumed sessions may need to re-execute tools to regenerate context
- **Future consideration:** Post-MVP could add context summaries stored with session

For MVP, users should understand that resuming a session provides conversation continuity but not full context restoration.

---

## Skills Architecture

### Skill Structure

```
skills/
└── hello-extended/
    ├── SKILL.md              # Manifest (YAML front matter + instructions)
    └── toolsets/
        └── index.ts          # Exported tool classes
```

**MVP Scope:** Toolsets only. Script execution deferred to post-MVP.

**Toolsets vs Scripts:**
| Aspect | Toolsets | Scripts (Post-MVP) |
|--------|----------|-------------------|
| Context | Loaded into LLM | Not loaded |
| Latency | Low (in-process) | Higher (subprocess) |
| Dependencies | Shared with agent | Isolated per-script |
| Testing | Synchronous, mockable | Async subprocess |
| MVP Status | **Included** | Deferred |

### Manifest Format (SKILL.md)

```yaml
---
name: hello-extended
description: Extended greeting capabilities
version: 1.0.0
toolsets:
  - "toolsets/index:HelloToolset"     # path:Class format
triggers:
  keywords: ["hello", "greet", "greeting"]
  verbs: ["say", "wave"]
  patterns: ["greet\\s+\\w+"]
default_enabled: true                  # For bundled skills
---

# Hello Extended Skill

Instructions for using this skill...
```

### Manifest Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Skill identifier (alphanumeric, hyphens, max 64 chars) |
| `description` | Yes | Brief description (max 500 chars) |
| `version` | No | Semantic version (e.g., "1.0.0") |
| `toolsets` | No | TypeScript toolset classes ("path:Class" format) |
| `scripts` | No | Script list (parsed but not executed in MVP) |
| `triggers.keywords` | No | Direct keyword matches (word boundary) |
| `triggers.verbs` | No | Action verbs (word boundary) |
| `triggers.patterns` | No | Regex patterns |
| `default_enabled` | No | For bundled skills (default: true) |
| `brief_description` | No | Auto-generated from first sentence if omitted |

### Progressive Disclosure

```
┌─────────────────────────────────────────────────────────────────┐
│                    Four-Tier Disclosure                          │
│                                                                  │
│  Tier 0: Nothing                                                │
│  └── When: No skills loaded or no match                         │
│                                                                  │
│  Tier 1: Breadcrumb (~10 tokens)                                │
│  ├── When: Skills exist with triggers but don't match query     │
│  └── Shows: "[N skills available]"                              │
│                                                                  │
│  Tier 2: Registry (~15 tokens/skill)                            │
│  ├── When: User asks "what can you do?" / "list skills"         │
│  │   OR skills have no triggers defined                         │
│  └── Shows: Skill names + brief descriptions                    │
│                                                                  │
│  Tier 3: Full Documentation (hundreds of tokens)                │
│  ├── When: Triggers match user query                            │
│  └── Shows: Complete skill instructions from SKILL.md           │
└─────────────────────────────────────────────────────────────────┘
```

### Trigger Matching Flow

```
User Query
    │
    ▼
┌─────────────────────────────┐
│  Match against all skills:  │
│  • Keywords (exact match)   │
│  • Verbs (action words)     │
│  • Patterns (regex)         │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│  Rank matches by:           │
│  1. Explicit mention        │
│  2. Exact phrase match      │
│  3. Recent usage            │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│  Inject top N skills        │
│  (max_skills default: 3)    │
└─────────────────────────────┘
```

### Skill Sources

| Source | Location | Lifecycle |
|--------|----------|-----------|
| Bundled | `src/_bundled_skills/` | Shipped with agent |
| User plugins | `~/<config-dir>/skills/` | Installed by user |
| Project | `./<config-dir>/skills/` | Project-specific |

### Script Execution (Post-MVP)

Scripts will run as isolated Bun subprocesses with safety limits:
- Process isolation via `Bun.spawn()` (not true sandboxing)
- Timeout enforcement: 60s default, configurable
- Output size limits: 1MB default
- Argument validation: max 100 args, 4096 bytes total
- Working directory: restricted to skill directory
- Returns structured `ToolResponse` format via JSON

**Note:** Script execution is deferred to post-MVP. Toolsets provide the primary extensibility mechanism.

---

## Telemetry Architecture

### Span Hierarchy

```
agent.run (root span)
├── gen_ai.chat (LLM call)
│   ├── gen_ai.provider.name: "openai"
│   ├── gen_ai.request.model: "gpt-4o"
│   ├── gen_ai.usage.input_tokens: 150
│   └── gen_ai.usage.output_tokens: 50
│
├── tool.execute (tool call)
│   ├── tool.name: "read_file"
│   ├── tool.result.success: true
│   └── duration_ms: 23
│
└── gen_ai.chat (final response)
    └── ...
```

### Integration Points

```
AgentCallbacks
     │
     ├─► onLLMStart   ──► startLLMSpan()
     ├─► onLLMEnd     ──► recordTokenUsage(), span.end()
     ├─► onToolStart  ──► startToolSpan()
     └─► onToolEnd    ──► recordToolResult(), span.end()
```

Telemetry is opt-in. When disabled, no-op implementations used.

---

## File Structure

```
src/
├── index.tsx                 # Entry point, CLI bootstrap
├── cli.tsx                   # Main CLI component
│
├── agent/
│   ├── agent.ts              # Core Agent class
│   ├── callbacks.ts          # AgentCallbacks interface
│   ├── types.ts              # Message, AgentOptions
│   └── prompts.ts            # System prompt loading
│
├── model/
│   ├── llm.ts                # Provider routing, getChatModel()
│   ├── types.ts              # ModelFactory, LLMCallOptions
│   ├── retry.ts              # Exponential backoff
│   └── providers/            # Provider-specific implementations
│
├── tools/
│   ├── types.ts              # ToolResponse, ToolErrorCode
│   ├── base.ts               # Tool creation helpers
│   └── [tool-name].ts        # Individual tools
│
├── config/
│   ├── schema.ts             # Zod schemas, AppConfig
│   ├── manager.ts            # Load/save/merge logic
│   └── providers/            # Setup wizards (Phase 5)
│
├── telemetry/
│   ├── setup.ts              # OTel initialization
│   ├── types.ts              # TelemetryHelpers
│   ├── spans.ts              # GenAI span helpers
│   └── aspire.ts             # Docker dashboard commands
│
├── utils/
│   ├── context.ts            # IContextManager implementation
│   ├── message-history.ts    # Conversation memory
│   ├── session.ts            # Session persistence
│   └── env.ts                # Environment helpers
│
├── components/               # React/Ink UI components
│   ├── Input.tsx
│   ├── Spinner.tsx
│   └── AnswerBox.tsx
│
├── skills/                   # Phase 4
│   ├── manifest.ts           # Zod schemas, YAML parsing
│   ├── loader.ts             # Discovery, dynamic import
│   ├── registry.ts           # Persistent metadata
│   └── context-provider.ts   # Progressive disclosure
│
├── commands/                 # Phase 5
│   ├── config.tsx
│   ├── skills.tsx
│   └── session.tsx
│
└── errors/
    └── index.ts              # AgentError hierarchy
```

---

## Extension Points

### Adding a Provider

1. Create factory in `model/providers/<name>.ts`
2. Register factory in `PROVIDER_FACTORIES` by config name
3. Add config schema section for provider-specific options
4. (Phase 5) Add setup wizard

### Adding a Tool

1. Define Zod input schema
2. Implement tool returning `ToolResponse<T>`
3. Export from tools index
4. Tool auto-receives callbacks via LangChain config

### Adding a Callback

1. Add method signature to `AgentCallbacks`
2. Emit from appropriate Agent lifecycle point
3. Subscribe in CLI component

### Adding a Skill (Phase 4)

1. Create `SKILL.md` manifest (YAML frontmatter + instructions)
2. Implement toolsets in `toolsets/index.ts`
3. (Optional) Add scripts in `scripts/`
4. Register triggers for progressive disclosure

---

## Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Dependency Injection** | All components receive deps via constructor |
| **Callbacks over Events** | Typed callbacks replace Python's EventBus |
| **Structured Responses** | Tools return `ToolResponse`, never throw |
| **Validation at Boundaries** | Zod validates config, LLM output, tool input |
| **Lazy Loading** | Context loaded only when needed |
| **Graceful Degradation** | Failures logged, agent continues |
| **Layer Isolation** | Only Agent calls Model; CLI never imports Agent internals |
