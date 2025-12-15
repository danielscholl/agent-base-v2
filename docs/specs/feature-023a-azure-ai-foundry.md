# Feature 23a: Support Azure AI Foundry (Local or Cloud)

## Feature Description

Add Azure AI Foundry support that can be configured to target either:
- **Foundry Local** (on-device models) via the `foundry-local-sdk`, using its OpenAI-compatible endpoint + API key (LangChain `ChatOpenAI` with `baseURL` and `apiKey` from `FoundryLocalManager`).
- **Azure AI Foundry (cloud)** via the Anthropic-style `@anthropic-ai/foundry-sdk` or via a custom endpoint using LangChain `ChatOpenAI` with Azure-compatible settings.

The implementation provides a unified `foundry` provider that automatically selects the appropriate mode based on configuration, abstracting away the complexity of switching between local and cloud deployments.

## User Story

As a developer using the agent framework,
I want to use Azure AI Foundry for LLM inference with the ability to switch between local (on-device) and cloud modes,
So that I can develop and test locally with fast, free inference while deploying to production with Azure-managed models without changing my application code.

## Problem Statement

Currently, developers face challenges when working with Azure AI Foundry:
- **Local development**: No provider for Foundry Local (on-device models via Docker/foundry-local-sdk)
- **Cloud deployment**: Existing `foundry` config schema exists but no implementation
- **Mode switching**: No unified interface to switch between local and cloud without reconfiguration

This creates friction in the development workflow where developers need to:
- Use different providers/configs for local vs. cloud
- Manually manage endpoint URLs and authentication
- Maintain separate codepaths for development and production

## Solution Statement

Implement a single `foundry` provider that:
1. Supports two modes: `"local"` and `"cloud"`
2. **Local mode**: Uses `foundry-local-sdk` to get endpoint/apiKey from `FoundryLocalManager`, then creates `ChatOpenAI` with that configuration
3. **Cloud mode**: Uses Azure AI Foundry cloud endpoints (either via custom LangChain adapter or OpenAI-compatible API)
4. Exposes a `mode` field in the config schema (`providers.foundry.mode`)
5. Handles automatic model initialization for local mode
6. Supports streaming out of the box via LangChain

## Related Documentation

### Requirements
- Feature defined in: `docs/plans/typescript-rewrite-features.md` (Feature 23a, lines 160-167)
- Phase: 3 (Memory + Session)
- Dependencies: Feature 4 (OpenAI provider pattern), Feature 24 (Local Docker Model Runner pattern)

### Architecture Decisions
- ADR-0002: LangChain.js for LLM Integration - establishes provider factory pattern
- Provider Architecture section in `docs/architecture.md` (lines 137-206)

### Reference Documentation
- [Azure AI Foundry Local + LangChain (JavaScript)](https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-local/how-to/how-to-use-langchain-with-foundry-local?view=foundry-classic&pivots=programming-language-javascript)
- [Anthropic Foundry SDK](https://www.npmjs.com/package/@anthropic-ai/foundry-sdk)

## Codebase Analysis Findings

### Architecture Patterns

**Provider Factory Pattern** (from `src/model/providers/openai.ts`):
```typescript
export function createFoundryClient(
  config: FoundryProviderConfig | Record<string, unknown>
): ModelResponse<BaseChatModel> {
  try {
    // 1. Extract config with defaults and determine mode
    const mode = (config.mode as 'local' | 'cloud') ?? 'cloud';

    // 2. Branch on mode for appropriate client creation
    if (mode === 'local') {
      // Use foundry-local-sdk to get endpoint/apiKey
    } else {
      // Use cloud endpoint configuration
    }

    // 3. Return success response
    return successResponse(client as BaseChatModel, 'Foundry client created');
  } catch (error) {
    // 4. Error handling
    const errorCode = mapErrorToCode(error);
    return errorResponse(errorCode, message);
  }
}
```

**Local Provider Pattern** (from `src/model/providers/local.ts`):
```typescript
// The local provider shows how to use ChatOpenAI with custom baseURL
const client = new ChatOpenAI({
  model,
  openAIApiKey: apiKey,  // From foundry-local-sdk in our case
  configuration: { baseURL: endpoint },  // From FoundryLocalManager
});
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Provider factory | `create[Provider]Client` | `createFoundryClient` |
| Config type | `[Provider]ProviderConfig` | `FoundryProviderConfig` |
| Test file | `[provider].test.ts` | `foundry.test.ts` |
| Provider file | `[provider].ts` | `foundry.ts` |
| Default constants | `DEFAULT_[PROVIDER]_[FIELD]` | `DEFAULT_FOUNDRY_MODE` |

### Existing Config Schema (in `src/config/schema.ts` lines 87-95)

```typescript
/**
 * Azure AI Foundry provider configuration.
 */
export const FoundryProviderConfigSchema = z.object({
  projectEndpoint: z.url().optional().describe('Azure AI Foundry project endpoint'),
  modelDeployment: z.string().optional().describe('Model deployment name'),
});

export type FoundryProviderConfig = z.infer<typeof FoundryProviderConfigSchema>;
```

This schema needs to be extended to support the `mode` field and local configuration.

### Existing Constants (in `src/config/constants.ts`)

```typescript
export const DEFAULT_FOUNDRY_MODEL = 'gpt-4o';
```

### Similar Implementations

- **Local Provider** (`src/model/providers/local.ts`): Shows pattern for `ChatOpenAI` with custom baseURL
- **OpenAI Provider** (`src/model/providers/openai.ts`): Base pattern with optional baseUrl
- **Azure OpenAI Provider** (`src/model/providers/azure-openai.ts`): Shows Azure-specific validation

### Integration Patterns

- Provider registered in `src/model/registry.ts`
- Config schema defined in `src/config/schema.ts`
- Constants defined in `src/config/constants.ts`
- Tests use mock-before-import pattern with `jest.unstable_mockModule`

## Archon Project

Project ID: `067fd825-fd2a-4247-86ae-390ef8fee7a1`

## Relevant Files

### Existing Files to Modify
- `src/config/schema.ts`: Extend `FoundryProviderConfigSchema` with mode and local config
- `src/config/constants.ts`: Add `DEFAULT_FOUNDRY_MODE` and local-specific defaults
- `src/model/registry.ts`: Add import and register `foundry` provider

### New Files to Create
- `src/model/providers/foundry.ts`: Foundry provider factory implementation
- `src/model/__tests__/foundry.test.ts`: Unit tests for foundry provider

### Reference Files (Read Only)
- `src/model/providers/local.ts`: Pattern for ChatOpenAI with custom baseURL
- `src/model/providers/openai.ts`: Base provider factory pattern
- `src/model/base.ts`: Response factories and error mapping
- `src/model/types.ts`: Type definitions
- `src/model/__tests__/local.test.ts`: Test pattern template

## Implementation Plan

### Phase 1: Dependencies
Install `foundry-local-sdk` for local mode support.

### Phase 2: Configuration
Extend the config schema and constants to support dual-mode operation.

### Phase 3: Provider Implementation
Create the foundry provider factory with mode-based branching.

### Phase 4: Integration
Register the provider and create comprehensive tests.

## Step by Step Tasks

### Task 1: Install foundry-local-sdk Package

**Description**: Add the `foundry-local-sdk` package for local Foundry support.

**Commands**:
```bash
bun add foundry-local-sdk
```

**Verification**: Package appears in `package.json` dependencies.

---

### Task 2: Update Configuration Constants

**Description**: Add new constants for Foundry provider modes and defaults.

**Files to modify**: `src/config/constants.ts`

**Changes**:
```typescript
// Foundry-specific defaults
export const DEFAULT_FOUNDRY_MODE = 'cloud' as const;
export const DEFAULT_FOUNDRY_LOCAL_MODEL = 'phi-3-mini-4k';  // Common Foundry Local model alias
export const DEFAULT_FOUNDRY_MODEL = 'gpt-4o';  // Already exists, keep as cloud default

// Foundry modes
export const FOUNDRY_MODES = ['local', 'cloud'] as const;
export type FoundryMode = (typeof FOUNDRY_MODES)[number];
```

---

### Task 3: Extend Configuration Schema

**Description**: Update `FoundryProviderConfigSchema` to support both local and cloud modes.

**Files to modify**: `src/config/schema.ts`

**Changes**:
```typescript
import {
  // ... existing imports
  DEFAULT_FOUNDRY_MODE,
  DEFAULT_FOUNDRY_LOCAL_MODEL,
  FOUNDRY_MODES,
} from './constants.js';

/**
 * Azure AI Foundry provider configuration.
 * Supports both local (on-device) and cloud modes.
 *
 * Local mode: Uses foundry-local-sdk to run models on-device via Docker.
 * Cloud mode: Uses Azure AI Foundry managed endpoints.
 */
export const FoundryProviderConfigSchema = z.object({
  mode: z.enum(FOUNDRY_MODES).default(DEFAULT_FOUNDRY_MODE).describe(
    'Foundry mode: "local" for on-device models, "cloud" for Azure-managed'
  ),
  // Cloud mode configuration
  projectEndpoint: z.url().optional().describe(
    '[Cloud] Azure AI Foundry project endpoint (e.g., https://my-resource.services.ai.azure.com/)'
  ),
  modelDeployment: z.string().optional().describe(
    '[Cloud] Model deployment name (e.g., claude-sonnet-4-5)'
  ),
  apiKey: z.string().optional().describe(
    '[Cloud] Azure API key (falls back to AZURE_FOUNDRY_API_KEY env var)'
  ),
  // Local mode configuration
  modelAlias: z.string().default(DEFAULT_FOUNDRY_LOCAL_MODEL).describe(
    '[Local] Model alias for foundry-local-sdk (e.g., phi-3-mini-4k)'
  ),
  // Shared configuration
  temperature: z.number().min(0).max(2).optional().describe('Temperature for generation'),
});

export type FoundryProviderConfig = z.infer<typeof FoundryProviderConfigSchema>;
```

---

### Task 4: Create Foundry Provider Factory

**Description**: Implement `createFoundryClient` with dual-mode support.

**Files to create**: `src/model/providers/foundry.ts`

**Implementation**:
```typescript
/**
 * Azure AI Foundry provider factory.
 * Creates LangChain chat models for both local and cloud Foundry modes.
 *
 * Local mode: Uses foundry-local-sdk to get endpoint/apiKey, then ChatOpenAI.
 * Cloud mode: Uses Azure AI Foundry cloud endpoint with ChatOpenAI.
 */

import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { FoundryProviderConfig } from '../../config/schema.js';
import type { ModelResponse } from '../types.js';
import { successResponse, errorResponse, mapErrorToCode } from '../base.js';
import {
  DEFAULT_FOUNDRY_MODE,
  DEFAULT_FOUNDRY_LOCAL_MODEL,
  DEFAULT_FOUNDRY_MODEL,
} from '../../config/constants.js';

/**
 * Internal: Create client for local Foundry mode.
 * Uses foundry-local-sdk to initialize model and get endpoint/apiKey.
 */
async function createLocalFoundryClient(
  config: FoundryProviderConfig | Record<string, unknown>
): Promise<ModelResponse<BaseChatModel>> {
  try {
    // Dynamic import to avoid requiring foundry-local-sdk when not in local mode
    const { FoundryLocalManager } = await import('foundry-local-sdk');

    const modelAlias = (config.modelAlias as string | undefined) ?? DEFAULT_FOUNDRY_LOCAL_MODEL;
    const temperature = config.temperature as number | undefined;

    // Initialize the Foundry Local Manager
    const foundryLocalManager = new FoundryLocalManager();
    const modelInfo = await foundryLocalManager.init(modelAlias);

    // Get endpoint and API key from the manager
    const endpoint = foundryLocalManager.endpoint;
    const apiKey = foundryLocalManager.apiKey;

    // Create ChatOpenAI with Foundry Local endpoint
    const clientConfig: Record<string, unknown> = {
      model: modelInfo.id,
      openAIApiKey: apiKey,
      configuration: { baseURL: endpoint },
    };

    if (temperature !== undefined) {
      clientConfig.temperature = temperature;
    }

    const client = new ChatOpenAI(clientConfig);

    return successResponse(
      client as BaseChatModel,
      `Foundry Local client created with model: ${modelInfo.id} (alias: ${modelAlias})`
    );
  } catch (error) {
    const errorCode = mapErrorToCode(error);
    const message = error instanceof Error
      ? error.message
      : 'Failed to create Foundry Local client';
    return errorResponse(errorCode, message);
  }
}

/**
 * Internal: Create client for cloud Foundry mode.
 * Uses Azure AI Foundry cloud endpoints.
 */
function createCloudFoundryClient(
  config: FoundryProviderConfig | Record<string, unknown>
): ModelResponse<BaseChatModel> {
  try {
    const projectEndpoint = config.projectEndpoint as string | undefined;
    const modelDeployment = (config.modelDeployment as string | undefined) ?? DEFAULT_FOUNDRY_MODEL;
    const apiKey = config.apiKey as string | undefined;
    const temperature = config.temperature as number | undefined;

    // Validate required fields for cloud mode
    if (projectEndpoint === undefined || projectEndpoint === '') {
      return errorResponse(
        'PROVIDER_NOT_CONFIGURED',
        'Azure AI Foundry cloud mode requires projectEndpoint to be configured'
      );
    }

    // Construct the OpenAI-compatible endpoint
    // Azure AI Foundry uses: https://{resource}.services.ai.azure.com/
    // We need to add the OpenAI-compatible path
    let baseUrl = projectEndpoint;
    if (!baseUrl.endsWith('/')) {
      baseUrl += '/';
    }
    // Azure AI Foundry uses OpenAI-compatible API at /openai/deployments/{deployment}
    // But for simplicity, we use the base URL and let ChatOpenAI handle it
    baseUrl += 'openai/deployments/' + modelDeployment;

    // Create ChatOpenAI with Azure AI Foundry endpoint
    const clientConfig: Record<string, unknown> = {
      model: modelDeployment,
      openAIApiKey: apiKey,
      configuration: {
        baseURL: baseUrl,
        defaultHeaders: {
          'api-key': apiKey ?? '',
        },
      },
    };

    if (temperature !== undefined) {
      clientConfig.temperature = temperature;
    }

    const client = new ChatOpenAI(clientConfig);

    return successResponse(
      client as BaseChatModel,
      `Foundry Cloud client created with deployment: ${modelDeployment}`
    );
  } catch (error) {
    const errorCode = mapErrorToCode(error);
    const message = error instanceof Error
      ? error.message
      : 'Failed to create Foundry Cloud client';
    return errorResponse(errorCode, message);
  }
}

/**
 * Create an Azure AI Foundry client from provider config.
 * Supports both local (on-device) and cloud modes.
 *
 * @param config - Foundry provider configuration
 * @returns ModelResponse with BaseChatModel or error
 *
 * @example Local mode:
 * ```typescript
 * const result = await createFoundryClient({
 *   mode: 'local',
 *   modelAlias: 'phi-3-mini-4k',
 * });
 * ```
 *
 * @example Cloud mode:
 * ```typescript
 * const result = createFoundryClient({
 *   mode: 'cloud',
 *   projectEndpoint: 'https://my-resource.services.ai.azure.com/',
 *   modelDeployment: 'gpt-4o',
 *   apiKey: 'my-api-key',
 * });
 * ```
 */
export function createFoundryClient(
  config: FoundryProviderConfig | Record<string, unknown>
): ModelResponse<BaseChatModel> | Promise<ModelResponse<BaseChatModel>> {
  const mode = (config.mode as 'local' | 'cloud' | undefined) ?? DEFAULT_FOUNDRY_MODE;

  if (mode === 'local') {
    // Local mode is async due to foundry-local-sdk initialization
    return createLocalFoundryClient(config);
  }

  // Cloud mode is synchronous
  return createCloudFoundryClient(config);
}

/**
 * Async wrapper for createFoundryClient.
 * Use this when you need to ensure the result is always a Promise.
 */
export async function createFoundryClientAsync(
  config: FoundryProviderConfig | Record<string, unknown>
): Promise<ModelResponse<BaseChatModel>> {
  return createFoundryClient(config);
}
```

---

### Task 5: Update Registry to Support Async Factory

**Description**: The Foundry provider needs async initialization for local mode. Update the registry and LLMClient to support this.

**Files to modify**: `src/model/registry.ts`, `src/model/types.ts`, `src/model/llm.ts`

**Changes to `src/model/types.ts`**:
```typescript
/**
 * Provider factory function type.
 * Creates a LangChain BaseChatModel from provider config.
 * Can be sync or async to support providers that need initialization.
 */
export type ProviderFactory = (
  config: Record<string, unknown>
) => ModelResponse<BaseChatModel> | Promise<ModelResponse<BaseChatModel>>;
```

**Changes to `src/model/registry.ts`**:
```typescript
import { createFoundryClient } from './providers/foundry.js';

export const PROVIDER_REGISTRY: Partial<Record<ProviderName, ProviderFactory>> = {
  openai: createOpenAIClient,
  anthropic: createAnthropicClient,
  gemini: createGeminiClient,
  azure: createAzureOpenAIClient,
  local: createLocalClient,
  foundry: createFoundryClient,
  // Future providers:
  // github: createGitHubClient,
};
```

**Changes to `src/model/llm.ts`** (getClient method):
```typescript
/**
 * Get or create the LangChain chat model client.
 * Now async to support providers that need initialization.
 */
private async getClientAsync(): Promise<ModelResponse<BaseChatModel>> {
  const providerName = this.config.providers.default;

  // Return cached client if provider hasn't changed
  if (this.client && this.currentProvider === providerName) {
    return successResponse(this.client, 'Using cached client');
  }

  // ... existing validation code ...

  // Get factory and create client (may be async)
  const factory = getProviderFactory(providerName);
  if (!factory) {
    return errorResponse(
      'PROVIDER_NOT_SUPPORTED',
      `No factory registered for provider '${providerName}'`
    );
  }

  const result = await factory(providerConfig);
  if (result.success) {
    this.client = result.result;
    this.currentProvider = providerName;
  }

  return result;
}
```

---

### Task 6: Create Unit Tests

**Description**: Write comprehensive unit tests for the foundry provider.

**Files to create**: `src/model/__tests__/foundry.test.ts`

**Test cases**:
- Creates client in cloud mode with full config
- Creates client in cloud mode with default model
- Returns error in cloud mode when projectEndpoint is missing
- Creates client in local mode with model alias
- Creates client in local mode with default alias
- Returns error in local mode when foundry-local-sdk fails
- Defaults to cloud mode when mode not specified
- Handles `Record<string, unknown>` config type
- Handles non-Error thrown objects

---

### Task 7: Update Registry Tests

**Description**: Add tests verifying the foundry provider is registered.

**Files to modify**: `src/model/__tests__/registry.test.ts`

**Changes**:
- Add test: `it('returns true for foundry', () => { expect(isProviderSupported('foundry')).toBe(true); })`
- Update `getSupportedProviders` test to include 'foundry'

---

### Task 8: Run Quality Checks

**Description**: Verify implementation passes all quality gates.

**Commands**:
```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

## Testing Strategy

### Unit Tests

Tests in `src/model/__tests__/foundry.test.ts` covering:

1. **Cloud mode tests**:
   - Full configuration with endpoint, deployment, apiKey
   - Default model when not specified
   - Missing projectEndpoint error
   - Temperature parameter passing

2. **Local mode tests**:
   - Model alias configuration
   - Default model alias
   - FoundryLocalManager initialization
   - SDK initialization errors

3. **Mode selection**:
   - Default mode is 'cloud'
   - Explicit mode='local' uses local factory
   - Explicit mode='cloud' uses cloud factory

4. **Error handling**:
   - Constructor failures
   - Network errors
   - Authentication errors
   - Non-Error thrown objects

### Mock Patterns

```typescript
// Mock foundry-local-sdk for local mode tests
const mockFoundryLocalManager = {
  init: jest.fn().mockResolvedValue({ id: 'phi-3-mini-4k-instruct' }),
  endpoint: 'http://localhost:5272/v1',
  apiKey: 'local-key',
};

jest.unstable_mockModule('foundry-local-sdk', () => ({
  FoundryLocalManager: jest.fn().mockImplementation(() => mockFoundryLocalManager),
}));

// Mock @langchain/openai for ChatOpenAI
const mockChatOpenAI = jest.fn().mockImplementation((config) => ({
  model: config.model,
  _type: 'chat_model',
}));

jest.unstable_mockModule('@langchain/openai', () => ({
  ChatOpenAI: mockChatOpenAI,
}));
```

### Integration Tests

Manual testing with Azure AI Foundry:

1. **Local mode**:
   - Ensure Docker Desktop is running with Foundry Local enabled
   - The `foundry-local-sdk` NPM package is already installed as a dependency
   - Configure `providers.default: 'foundry'` and `providers.foundry.mode: 'local'`
   - Run agent and verify model responses

2. **Cloud mode**:
   - Configure Azure AI Foundry resource in Azure portal
   - Set `providers.foundry.projectEndpoint` and `providers.foundry.modelDeployment`
   - Run agent and verify model responses

### Edge Cases

- Empty string projectEndpoint (should use error)
- Undefined modelDeployment (should use default)
- Network errors (Foundry Local not running)
- Model not found errors
- API key missing in cloud mode

## Acceptance Criteria

- [ ] `foundry-local-sdk` package installed
- [ ] `FoundryProviderConfigSchema` extended with mode, modelAlias fields
- [ ] `createFoundryClient` factory function exists in `src/model/providers/foundry.ts`
- [ ] Factory supports both `local` and `cloud` modes
- [ ] Local mode uses `FoundryLocalManager` from `foundry-local-sdk`
- [ ] Cloud mode validates required `projectEndpoint` field
- [ ] Provider registered in `src/model/registry.ts` as `foundry`
- [ ] All unit tests pass with 85%+ coverage
- [ ] TypeScript strict mode passes
- [ ] ESLint and Prettier pass
- [ ] Build succeeds

## Validation Commands

```bash
# Run all quality checks
bun run typecheck && bun run lint && bun run test && bun run build

# Run specific tests
bun run test src/model/__tests__/foundry.test.ts

# Type check only
bun run typecheck

# Lint only
bun run lint

# Build only
bun run build
```

## Notes

### Foundry Local Details

- **foundry-local-sdk**: NPM package that manages local model lifecycle
- **FoundryLocalManager.init(alias)**: Initializes model, returns model info with ID
- **FoundryLocalManager.endpoint**: Returns OpenAI-compatible endpoint URL
- **FoundryLocalManager.apiKey**: Returns API key for local server
- **Model aliases**: e.g., `phi-3-mini-4k`, `qwen2.5-0.5b`
- **Hardware selection**: SDK automatically selects GPU/NPU/CPU variant

### Azure AI Foundry Cloud Details

- **Endpoint format**: `https://{resource}.services.ai.azure.com/`
- **Authentication**: API key via `api-key` header or Azure Entra ID
- **Deployments**: Custom deployment names or default model IDs
- **Supported models**: Claude models (claude-sonnet-4-5, etc.), GPT models

### Alternative Cloud Implementation

If the OpenAI-compatible approach doesn't work well with Azure AI Foundry cloud:
- Consider using `@anthropic-ai/foundry-sdk` for Claude models
- May need custom `BaseChatModel` adapter (post-MVP)

### Future Considerations

- Health check tool to verify Foundry Local is running
- Model discovery endpoint integration
- Automatic fallback from local to cloud if local unavailable
- Support for Azure Entra ID authentication in cloud mode

## Execution

This spec can be implemented using: `/sdlc:implement docs/specs/feature-023a-azure-ai-foundry.md`
