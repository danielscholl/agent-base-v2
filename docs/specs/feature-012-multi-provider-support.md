# Feature 12: Multi-Provider Support (Anthropic, Gemini, Azure OpenAI)

## Feature Description

This feature implements three additional LLM provider factories following the OpenAI pattern established in Feature 4:

1. **Anthropic** (`model/providers/anthropic.ts`): Claude models via `@langchain/anthropic`
2. **Gemini** (`model/providers/gemini.ts`): Google Gemini models via `@langchain/google-genai`
3. **Azure OpenAI** (`model/providers/azure-openai.ts`): Azure-hosted OpenAI models via `@langchain/openai`

Each provider factory:
- Creates LangChain `BaseChatModel` instances from provider configuration
- Returns `ModelResponse<BaseChatModel>` following the structured response contract
- Supports streaming and token usage reporting
- Handles provider-specific configuration options
- Maps errors to standardized `ModelErrorCode` values

This expands provider coverage from 1 to 4 providers, enabling users to choose between OpenAI, Anthropic, Google Gemini, and Azure OpenAI.

## User Story

As an agent framework user
I want to use Anthropic, Google Gemini, or Azure OpenAI as my LLM provider
So that I can choose the best provider for my use case without changing my application code

## Problem Statement

Currently, the framework only supports OpenAI as an LLM provider. Users who prefer:
- Anthropic Claude models (for longer context, different reasoning style)
- Google Gemini models (for multimodal capabilities, Google Cloud integration)
- Azure OpenAI (for enterprise compliance, data residency, Azure integration)

...cannot use the framework without implementing their own provider support.

## Solution Statement

Implement three provider factory functions following the established OpenAI pattern:

1. **createAnthropicClient**: Uses `@langchain/anthropic` ChatAnthropic class
2. **createGeminiClient**: Uses `@langchain/google-genai` ChatGoogleGenerativeAI (with optional Vertex AI support)
3. **createAzureOpenAIClient**: Uses `@langchain/openai` AzureChatOpenAI class

Each factory:
- Accepts typed provider config or `Record<string, unknown>`
- Extracts config fields with type assertions and defaults
- Creates the appropriate LangChain chat model
- Returns `ModelResponse<BaseChatModel>`

## Related Documentation

### Requirements
- Feature defined in: `docs/plans/typescript-rewrite-features.md` (Feature 12)
- Phase: 2 (Multi-Provider + CLI)
- Dependencies: Feature 4 (OpenAI provider pattern established)

### Architecture Decisions
- ADR-0002: LangChain.js for LLM Integration - defines provider packages to use
- ADR-0004: Zod for Validation - config schema validation
- ADR-0007: Callbacks over EventBus - streaming callbacks

### Reference Documents
- `docs/architecture.md`: Provider Architecture section (lines 137-206)
- `docs/specs/feature-004-multi-provider-llm-abstraction.md`: OpenAI pattern reference
- LangChain.js documentation for each provider package

## Codebase Analysis Findings

### Architecture Patterns

**Provider Factory Pattern** (from `src/model/providers/openai.ts`):
```typescript
export function create<Provider>Client(
  config: <Provider>Config | Record<string, unknown>
): ModelResponse<BaseChatModel> {
  try {
    // 1. Extract config with defaults
    const apiKey = config.apiKey as string | undefined;
    const model = (config.model as string | undefined) ?? DEFAULT_<PROVIDER>_MODEL;

    // 2. Create provider-specific client
    const client = new Chat<Provider>({ model, ... });

    // 3. Return success response
    return successResponse(client as BaseChatModel, `<Provider> client created with model: ${model}`);
  } catch (error) {
    // 4. Error handling
    const errorCode = mapErrorToCode(error);
    const message = error instanceof Error ? error.message : 'Failed to create <Provider> client';
    return errorResponse(errorCode, message);
  }
}
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Provider factory | `create<Provider>Client` | `createAnthropicClient` |
| Config type | `<Provider>ProviderConfig` | `AnthropicProviderConfig` |
| Test file | `<provider>.test.ts` | `anthropic.test.ts` |
| Provider file | `<provider>.ts` | `azure-openai.ts` |
| Default constants | `DEFAULT_<PROVIDER>_<FIELD>` | `DEFAULT_ANTHROPIC_MODEL` |

### Existing Config Schemas (in `src/config/schema.ts`)

**Anthropic** (lines 59-66):
```typescript
export const AnthropicProviderConfigSchema = z.object({
  apiKey: z.string().optional().describe('Anthropic API key'),
  model: z.string().default(DEFAULT_ANTHROPIC_MODEL).describe('Model name'),
});
```

**Gemini** (lines 91-107):
```typescript
export const GeminiProviderConfigSchema = z.object({
  apiKey: z.string().optional().describe('Gemini API key'),
  model: z.string().default(DEFAULT_GEMINI_MODEL).describe('Model name'),
  useVertexai: z.boolean().default(false).describe('Use Vertex AI instead'),
  projectId: z.string().optional().describe('Google Cloud project ID'),
  location: z.string().default(DEFAULT_GEMINI_LOCATION).describe('Google Cloud location'),
});
```

**Azure OpenAI** (lines 69-78):
```typescript
export const AzureOpenAIProviderConfigSchema = z.object({
  endpoint: z.url().optional().describe('Azure OpenAI endpoint URL'),
  deployment: z.string().optional().describe('Deployment name'),
  apiVersion: z.string().default(DEFAULT_AZURE_API_VERSION).describe('API version'),
  apiKey: z.string().optional().describe('Azure OpenAI API key'),
});
```

### Default Constants (in `src/config/constants.ts`)

```typescript
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash-exp';
export const DEFAULT_GEMINI_LOCATION = 'us-central1';
export const DEFAULT_GEMINI_USE_VERTEXAI = false;
export const DEFAULT_AZURE_API_VERSION = '2024-06-01';
```

### Testing Pattern (from `src/model/__tests__/openai.test.ts`)

```typescript
// 1. Define mock config interface
interface Mock<Provider>Config { ... }

// 2. Create mock constructor
const mockChat<Provider> = jest.fn<...>().mockImplementation((config) => ({
  model: config.model,
  _type: 'chat_model',
}));

// 3. Mock module before import
jest.unstable_mockModule('@langchain/<package>', () => ({
  Chat<Provider>: mockChat<Provider>,
}));

// 4. Dynamic import after mocking
const { create<Provider>Client } = await import('../providers/<provider>.js');
```

## Relevant Files

### Existing Files
- `src/model/providers/openai.ts`: Reference implementation (follow this pattern exactly)
- `src/model/registry.ts`: Add new providers to `PROVIDER_REGISTRY`
- `src/model/index.ts`: Export new provider factories
- `src/config/schema.ts`: Config schemas already defined
- `src/config/constants.ts`: Default values already defined
- `src/model/base.ts`: `successResponse`, `errorResponse`, `mapErrorToCode` helpers
- `src/model/__tests__/openai.test.ts`: Test pattern reference
- `package.json`: Add new LangChain provider packages

### New Files
- `src/model/providers/anthropic.ts`: Anthropic provider factory
- `src/model/providers/gemini.ts`: Gemini provider factory
- `src/model/providers/azure-openai.ts`: Azure OpenAI provider factory
- `src/model/__tests__/anthropic.test.ts`: Anthropic tests
- `src/model/__tests__/gemini.test.ts`: Gemini tests
- `src/model/__tests__/azure-openai.test.ts`: Azure OpenAI tests

## Implementation Plan

### Phase 1: Dependencies
Install required LangChain provider packages.

### Phase 2: Anthropic Provider
Implement the simplest provider (similar to OpenAI) first.

### Phase 3: Gemini Provider
Implement with dual-mode support (Gemini API vs Vertex AI).

### Phase 4: Azure OpenAI Provider
Implement with Azure-specific configuration handling.

### Phase 5: Registry Integration
Register all providers and update exports.

### Phase 6: Tests and Validation
Write comprehensive tests following the OpenAI test pattern.

## Step by Step Tasks

### Task 1: Install LangChain provider packages

**Description**: Add `@langchain/anthropic` and `@langchain/google-genai` dependencies. Azure uses existing `@langchain/openai`.

**Commands**:
```bash
bun add @langchain/anthropic @langchain/google-genai
```

**Verification**: Packages appear in `package.json` dependencies.

---

### Task 2: Create Anthropic provider factory

**Description**: Implement `createAnthropicClient` following the OpenAI pattern.

**Files to create**: `src/model/providers/anthropic.ts`

**Implementation**:

```typescript
/**
 * Anthropic provider factory.
 * Creates ChatAnthropic instances from provider configuration.
 */

import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { AnthropicProviderConfig } from '../../config/schema.js';
import type { ModelResponse } from '../types.js';
import { successResponse, errorResponse, mapErrorToCode } from '../base.js';
import { DEFAULT_ANTHROPIC_MODEL } from '../../config/constants.js';

/**
 * Create a ChatAnthropic instance from provider config.
 *
 * @param config - Anthropic provider configuration
 * @returns ModelResponse with ChatAnthropic or error
 */
export function createAnthropicClient(
  config: AnthropicProviderConfig | Record<string, unknown>
): ModelResponse<BaseChatModel> {
  try {
    // API key can come from config or ANTHROPIC_API_KEY env var
    const apiKey = config.apiKey as string | undefined;
    // Model has a default from schema, but we handle Record<string,unknown> input too
    const model = (config.model as string | undefined) ?? DEFAULT_ANTHROPIC_MODEL;

    // Create ChatAnthropic instance
    const client = new ChatAnthropic({
      model,
      anthropicApiKey: apiKey,
    });

    return successResponse(client as BaseChatModel, `Anthropic client created with model: ${model}`);
  } catch (error) {
    const errorCode = mapErrorToCode(error);
    const message = error instanceof Error ? error.message : 'Failed to create Anthropic client';
    return errorResponse(errorCode, message);
  }
}
```

---

### Task 3: Create Gemini provider factory

**Description**: Implement `createGeminiClient` with support for both Gemini API and Vertex AI modes.

**Files to create**: `src/model/providers/gemini.ts`

**Implementation**:

```typescript
/**
 * Gemini provider factory.
 * Creates ChatGoogleGenerativeAI instances from provider configuration.
 * Supports both direct Gemini API and Vertex AI modes.
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { GeminiProviderConfig } from '../../config/schema.js';
import type { ModelResponse } from '../types.js';
import { successResponse, errorResponse, mapErrorToCode } from '../base.js';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_LOCATION,
  DEFAULT_GEMINI_USE_VERTEXAI,
} from '../../config/constants.js';

/**
 * Create a ChatGoogleGenerativeAI instance from provider config.
 *
 * @param config - Gemini provider configuration
 * @returns ModelResponse with ChatGoogleGenerativeAI or error
 */
export function createGeminiClient(
  config: GeminiProviderConfig | Record<string, unknown>
): ModelResponse<BaseChatModel> {
  try {
    // Extract config with defaults
    const apiKey = config.apiKey as string | undefined;
    const model = (config.model as string | undefined) ?? DEFAULT_GEMINI_MODEL;
    const useVertexai = (config.useVertexai as boolean | undefined) ?? DEFAULT_GEMINI_USE_VERTEXAI;
    const projectId = config.projectId as string | undefined;
    const location = (config.location as string | undefined) ?? DEFAULT_GEMINI_LOCATION;

    // Validate Vertex AI requirements
    if (useVertexai && !projectId) {
      return errorResponse(
        'PROVIDER_NOT_CONFIGURED',
        'Vertex AI mode requires projectId to be configured'
      );
    }

    // Create ChatGoogleGenerativeAI instance
    // Note: @langchain/google-genai uses the same class for both modes
    // Vertex AI is enabled by setting credentials/project instead of API key
    const clientConfig: Record<string, unknown> = {
      model,
    };

    if (useVertexai) {
      // Vertex AI mode - uses application default credentials
      // projectId and location are used by the underlying Google Cloud client
      clientConfig.projectId = projectId;
      clientConfig.location = location;
    } else {
      // Direct Gemini API mode
      clientConfig.apiKey = apiKey;
    }

    const client = new ChatGoogleGenerativeAI(clientConfig);

    const modeLabel = useVertexai ? `Vertex AI (${location})` : 'Gemini API';
    return successResponse(
      client as BaseChatModel,
      `Gemini client created with model: ${model} via ${modeLabel}`
    );
  } catch (error) {
    const errorCode = mapErrorToCode(error);
    const message = error instanceof Error ? error.message : 'Failed to create Gemini client';
    return errorResponse(errorCode, message);
  }
}
```

---

### Task 4: Create Azure OpenAI provider factory

**Description**: Implement `createAzureOpenAIClient` using AzureChatOpenAI from @langchain/openai.

**Files to create**: `src/model/providers/azure-openai.ts`

**Implementation**:

```typescript
/**
 * Azure OpenAI provider factory.
 * Creates AzureChatOpenAI instances from provider configuration.
 */

import { AzureChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { AzureOpenAIProviderConfig } from '../../config/schema.js';
import type { ModelResponse } from '../types.js';
import { successResponse, errorResponse, mapErrorToCode } from '../base.js';
import { DEFAULT_AZURE_API_VERSION } from '../../config/constants.js';

/**
 * Create an AzureChatOpenAI instance from provider config.
 *
 * @param config - Azure OpenAI provider configuration
 * @returns ModelResponse with AzureChatOpenAI or error
 */
export function createAzureOpenAIClient(
  config: AzureOpenAIProviderConfig | Record<string, unknown>
): ModelResponse<BaseChatModel> {
  try {
    // Extract config fields
    const endpoint = config.endpoint as string | undefined;
    const deployment = config.deployment as string | undefined;
    const apiVersion = (config.apiVersion as string | undefined) ?? DEFAULT_AZURE_API_VERSION;
    const apiKey = config.apiKey as string | undefined;

    // Validate required fields for Azure
    if (!endpoint) {
      return errorResponse(
        'PROVIDER_NOT_CONFIGURED',
        'Azure OpenAI requires endpoint to be configured'
      );
    }

    if (!deployment) {
      return errorResponse(
        'PROVIDER_NOT_CONFIGURED',
        'Azure OpenAI requires deployment name to be configured'
      );
    }

    // Create AzureChatOpenAI instance
    // Note: API key can come from config or AZURE_OPENAI_API_KEY env var
    const client = new AzureChatOpenAI({
      azureOpenAIEndpoint: endpoint,
      azureOpenAIApiDeploymentName: deployment,
      azureOpenAIApiVersion: apiVersion,
      azureOpenAIApiKey: apiKey,
    });

    return successResponse(
      client as BaseChatModel,
      `Azure OpenAI client created with deployment: ${deployment}`
    );
  } catch (error) {
    const errorCode = mapErrorToCode(error);
    const message = error instanceof Error ? error.message : 'Failed to create Azure OpenAI client';
    return errorResponse(errorCode, message);
  }
}
```

---

### Task 5: Update provider registry

**Description**: Register all three new providers in `PROVIDER_REGISTRY`.

**Files to modify**: `src/model/registry.ts`

**Changes**:
1. Import new provider factory functions
2. Add entries to `PROVIDER_REGISTRY`

**Updated code**:
```typescript
import { createOpenAIClient } from './providers/openai.js';
import { createAnthropicClient } from './providers/anthropic.js';
import { createGeminiClient } from './providers/gemini.js';
import { createAzureOpenAIClient } from './providers/azure-openai.js';

export const PROVIDER_REGISTRY: Partial<Record<ProviderName, ProviderFactory>> = {
  openai: createOpenAIClient,
  anthropic: createAnthropicClient,
  gemini: createGeminiClient,
  azure: createAzureOpenAIClient,
  // Future providers:
  // github: createGitHubClient,
  // local: createLocalClient,
  // foundry: createFoundryClient,
};
```

---

### Task 6: Update module exports

**Description**: Export new provider factories from `src/model/index.ts`.

**Files to modify**: `src/model/index.ts`

**Changes**: Add exports for new providers:
```typescript
// Provider Factories
export { createOpenAIClient } from './providers/openai.js';
export { createAnthropicClient } from './providers/anthropic.js';
export { createGeminiClient } from './providers/gemini.js';
export { createAzureOpenAIClient } from './providers/azure-openai.js';
```

---

### Task 7: Create Anthropic provider tests

**Description**: Write comprehensive tests for `createAnthropicClient`.

**Files to create**: `src/model/__tests__/anthropic.test.ts`

**Implementation**:
```typescript
/**
 * Unit tests for Anthropic provider factory.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock @langchain/anthropic before importing
interface MockAnthropicConfig {
  model: string;
  anthropicApiKey?: string;
}

const mockChatAnthropic = jest
  .fn<(config: MockAnthropicConfig) => { model: string; _type: string }>()
  .mockImplementation((config) => ({
    model: config.model,
    _type: 'chat_model',
  }));

jest.unstable_mockModule('@langchain/anthropic', () => ({
  ChatAnthropic: mockChatAnthropic,
}));

// Import after mocking
const { createAnthropicClient } = await import('../providers/anthropic.js');

describe('createAnthropicClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates ChatAnthropic with model from config', () => {
    const result = createAnthropicClient({
      model: 'claude-sonnet-4-20250514',
      apiKey: 'test-key',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toBeDefined();
      expect(result.message).toContain('claude-sonnet-4-20250514');
    }
  });

  it('creates ChatAnthropic without apiKey (uses env var)', () => {
    const result = createAnthropicClient({
      model: 'claude-sonnet-4-20250514',
    });

    expect(result.success).toBe(true);
  });

  it('uses default model when not specified', () => {
    const config: Record<string, unknown> = {
      apiKey: 'test-key',
    };

    const result = createAnthropicClient(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain('claude-sonnet-4-20250514');
    }
  });

  it('handles Record<string, unknown> config type', () => {
    const config: Record<string, unknown> = {
      model: 'claude-opus-4-20250514',
      apiKey: 'test-key',
    };

    const result = createAnthropicClient(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain('claude-opus-4-20250514');
    }
  });

  it('passes correct parameters to ChatAnthropic', () => {
    createAnthropicClient({
      model: 'claude-sonnet-4-20250514',
      apiKey: 'test-key',
    });

    expect(mockChatAnthropic).toHaveBeenCalledWith({
      model: 'claude-sonnet-4-20250514',
      anthropicApiKey: 'test-key',
    });
  });

  it('returns error when ChatAnthropic constructor throws', () => {
    mockChatAnthropic.mockImplementationOnce(() => {
      throw new Error('Invalid API key provided');
    });

    const result = createAnthropicClient({
      model: 'claude-sonnet-4-20250514',
      apiKey: 'invalid-key',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('AUTHENTICATION_ERROR');
      expect(result.message).toBe('Invalid API key provided');
    }
  });

  it('handles non-Error thrown objects', () => {
    mockChatAnthropic.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'string error';
    });

    const result = createAnthropicClient({
      model: 'claude-sonnet-4-20250514',
      apiKey: 'test-key',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe('Failed to create Anthropic client');
    }
  });
});
```

---

### Task 8: Create Gemini provider tests

**Description**: Write comprehensive tests for `createGeminiClient`.

**Files to create**: `src/model/__tests__/gemini.test.ts`

**Implementation**:
```typescript
/**
 * Unit tests for Gemini provider factory.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock @langchain/google-genai before importing
interface MockGeminiConfig {
  model: string;
  apiKey?: string;
  projectId?: string;
  location?: string;
}

const mockChatGoogleGenerativeAI = jest
  .fn<(config: MockGeminiConfig) => { model: string; _type: string }>()
  .mockImplementation((config) => ({
    model: config.model,
    _type: 'chat_model',
  }));

jest.unstable_mockModule('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: mockChatGoogleGenerativeAI,
}));

// Import after mocking
const { createGeminiClient } = await import('../providers/gemini.js');

describe('createGeminiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Gemini API mode', () => {
    it('creates ChatGoogleGenerativeAI with model from config', () => {
      const result = createGeminiClient({
        model: 'gemini-2.0-flash-exp',
        apiKey: 'test-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBeDefined();
        expect(result.message).toContain('gemini-2.0-flash-exp');
        expect(result.message).toContain('Gemini API');
      }
    });

    it('creates client without apiKey (uses env var)', () => {
      const result = createGeminiClient({
        model: 'gemini-2.0-flash-exp',
      });

      expect(result.success).toBe(true);
    });

    it('uses default model when not specified', () => {
      const config: Record<string, unknown> = {
        apiKey: 'test-key',
      };

      const result = createGeminiClient(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('gemini-2.0-flash-exp');
      }
    });

    it('passes apiKey for Gemini API mode', () => {
      createGeminiClient({
        model: 'gemini-2.0-flash-exp',
        apiKey: 'test-key',
        useVertexai: false,
      });

      expect(mockChatGoogleGenerativeAI).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash-exp',
        apiKey: 'test-key',
      });
    });
  });

  describe('Vertex AI mode', () => {
    it('creates client with Vertex AI configuration', () => {
      const result = createGeminiClient({
        model: 'gemini-2.0-flash-exp',
        useVertexai: true,
        projectId: 'my-project',
        location: 'us-central1',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('Vertex AI');
        expect(result.message).toContain('us-central1');
      }
    });

    it('returns error when Vertex AI mode without projectId', () => {
      const result = createGeminiClient({
        model: 'gemini-2.0-flash-exp',
        useVertexai: true,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
        expect(result.message).toContain('projectId');
      }
    });

    it('uses default location for Vertex AI', () => {
      createGeminiClient({
        model: 'gemini-2.0-flash-exp',
        useVertexai: true,
        projectId: 'my-project',
      });

      expect(mockChatGoogleGenerativeAI).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash-exp',
        projectId: 'my-project',
        location: 'us-central1',
      });
    });
  });

  describe('error handling', () => {
    it('returns error when constructor throws', () => {
      mockChatGoogleGenerativeAI.mockImplementationOnce(() => {
        throw new Error('Invalid API key');
      });

      const result = createGeminiClient({
        model: 'gemini-2.0-flash-exp',
        apiKey: 'invalid-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('AUTHENTICATION_ERROR');
      }
    });

    it('handles non-Error thrown objects', () => {
      mockChatGoogleGenerativeAI.mockImplementationOnce(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'string error';
      });

      const result = createGeminiClient({
        model: 'gemini-2.0-flash-exp',
        apiKey: 'test-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toBe('Failed to create Gemini client');
      }
    });
  });

  describe('config type handling', () => {
    it('handles Record<string, unknown> config type', () => {
      const config: Record<string, unknown> = {
        model: 'gemini-1.5-pro',
        apiKey: 'test-key',
      };

      const result = createGeminiClient(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('gemini-1.5-pro');
      }
    });
  });
});
```

---

### Task 9: Create Azure OpenAI provider tests

**Description**: Write comprehensive tests for `createAzureOpenAIClient`.

**Files to create**: `src/model/__tests__/azure-openai.test.ts`

**Implementation**:
```typescript
/**
 * Unit tests for Azure OpenAI provider factory.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock @langchain/openai before importing
interface MockAzureOpenAIConfig {
  azureOpenAIEndpoint: string;
  azureOpenAIApiDeploymentName: string;
  azureOpenAIApiVersion: string;
  azureOpenAIApiKey?: string;
}

const mockAzureChatOpenAI = jest
  .fn<(config: MockAzureOpenAIConfig) => { deployment: string; _type: string }>()
  .mockImplementation((config) => ({
    deployment: config.azureOpenAIApiDeploymentName,
    _type: 'chat_model',
  }));

jest.unstable_mockModule('@langchain/openai', () => ({
  AzureChatOpenAI: mockAzureChatOpenAI,
}));

// Import after mocking
const { createAzureOpenAIClient } = await import('../providers/azure-openai.js');

describe('createAzureOpenAIClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates AzureChatOpenAI with full config', () => {
    const result = createAzureOpenAIClient({
      endpoint: 'https://my-resource.openai.azure.com/',
      deployment: 'gpt-4o',
      apiVersion: '2024-06-01',
      apiKey: 'test-key',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toBeDefined();
      expect(result.message).toContain('gpt-4o');
    }
  });

  it('creates AzureChatOpenAI without apiKey (uses env var)', () => {
    const result = createAzureOpenAIClient({
      endpoint: 'https://my-resource.openai.azure.com/',
      deployment: 'gpt-4o',
      apiVersion: '2024-06-01',
    });

    expect(result.success).toBe(true);
  });

  it('uses default apiVersion when not specified', () => {
    const config: Record<string, unknown> = {
      endpoint: 'https://my-resource.openai.azure.com/',
      deployment: 'gpt-4o',
      apiKey: 'test-key',
    };

    const result = createAzureOpenAIClient(config);

    expect(result.success).toBe(true);
    expect(mockAzureChatOpenAI).toHaveBeenCalledWith({
      azureOpenAIEndpoint: 'https://my-resource.openai.azure.com/',
      azureOpenAIApiDeploymentName: 'gpt-4o',
      azureOpenAIApiVersion: '2024-06-01',
      azureOpenAIApiKey: 'test-key',
    });
  });

  it('returns error when endpoint is missing', () => {
    const result = createAzureOpenAIClient({
      deployment: 'gpt-4o',
      apiKey: 'test-key',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
      expect(result.message).toContain('endpoint');
    }
  });

  it('returns error when deployment is missing', () => {
    const result = createAzureOpenAIClient({
      endpoint: 'https://my-resource.openai.azure.com/',
      apiKey: 'test-key',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
      expect(result.message).toContain('deployment');
    }
  });

  it('handles Record<string, unknown> config type', () => {
    const config: Record<string, unknown> = {
      endpoint: 'https://my-resource.openai.azure.com/',
      deployment: 'my-gpt4',
      apiVersion: '2024-08-01',
      apiKey: 'test-key',
    };

    const result = createAzureOpenAIClient(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain('my-gpt4');
    }
  });

  it('passes correct parameters to AzureChatOpenAI', () => {
    createAzureOpenAIClient({
      endpoint: 'https://my-resource.openai.azure.com/',
      deployment: 'gpt-4o',
      apiVersion: '2024-06-01',
      apiKey: 'test-key',
    });

    expect(mockAzureChatOpenAI).toHaveBeenCalledWith({
      azureOpenAIEndpoint: 'https://my-resource.openai.azure.com/',
      azureOpenAIApiDeploymentName: 'gpt-4o',
      azureOpenAIApiVersion: '2024-06-01',
      azureOpenAIApiKey: 'test-key',
    });
  });

  it('returns error when AzureChatOpenAI constructor throws', () => {
    mockAzureChatOpenAI.mockImplementationOnce(() => {
      throw new Error('Invalid API key provided');
    });

    const result = createAzureOpenAIClient({
      endpoint: 'https://my-resource.openai.azure.com/',
      deployment: 'gpt-4o',
      apiKey: 'invalid-key',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('AUTHENTICATION_ERROR');
      expect(result.message).toBe('Invalid API key provided');
    }
  });

  it('handles non-Error thrown objects', () => {
    mockAzureChatOpenAI.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'string error';
    });

    const result = createAzureOpenAIClient({
      endpoint: 'https://my-resource.openai.azure.com/',
      deployment: 'gpt-4o',
      apiKey: 'test-key',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe('Failed to create Azure OpenAI client');
    }
  });
});
```

---

### Task 10: Update registry tests

**Description**: Update registry tests to verify new providers are registered.

**Files to modify**: `src/model/__tests__/registry.test.ts`

**Changes**: Add tests for new providers:
```typescript
describe('isProviderSupported', () => {
  it('returns true for openai', () => {
    expect(isProviderSupported('openai')).toBe(true);
  });

  it('returns true for anthropic', () => {
    expect(isProviderSupported('anthropic')).toBe(true);
  });

  it('returns true for gemini', () => {
    expect(isProviderSupported('gemini')).toBe(true);
  });

  it('returns true for azure', () => {
    expect(isProviderSupported('azure')).toBe(true);
  });

  it('returns false for github (not yet implemented)', () => {
    expect(isProviderSupported('github')).toBe(false);
  });
});

describe('getSupportedProviders', () => {
  it('returns array with all supported providers', () => {
    const providers = getSupportedProviders();
    expect(providers).toContain('openai');
    expect(providers).toContain('anthropic');
    expect(providers).toContain('gemini');
    expect(providers).toContain('azure');
  });
});
```

---

### Task 11: Run validation and fix any issues

**Description**: Run all quality checks and ensure everything passes.

**Commands**:
```bash
# Run all validation commands
bun run typecheck && bun run lint && bun run test && bun run build
```

**Acceptance**:
- TypeScript compiles without errors
- ESLint passes with no warnings
- All tests pass (including new provider tests)
- Coverage meets 85% threshold for model module
- Build succeeds

## Testing Strategy

### Unit Tests

Tests organized in `src/model/__tests__/`:
- `anthropic.test.ts`: Anthropic provider factory tests
- `gemini.test.ts`: Gemini provider factory tests (including Vertex AI mode)
- `azure-openai.test.ts`: Azure OpenAI provider factory tests
- `registry.test.ts`: Updated to verify new providers

### Mock Patterns

All tests follow the established pattern from `openai.test.ts`:
1. Define mock config interface
2. Create mock constructor with `jest.fn()`
3. Mock module using `jest.unstable_mockModule()` before import
4. Dynamic import after mocking
5. Clear mocks in `beforeEach`

### Edge Cases

**Anthropic:**
- Missing apiKey (should use env var)
- Default model fallback
- Constructor errors

**Gemini:**
- Gemini API mode (default)
- Vertex AI mode with projectId
- Vertex AI mode without projectId (error)
- Default location for Vertex AI

**Azure OpenAI:**
- Missing endpoint (error)
- Missing deployment (error)
- Default apiVersion
- Full config with all fields

## Acceptance Criteria

- [x] `@langchain/anthropic` and `@langchain/google-genai` packages installed
- [x] `createAnthropicClient()` factory creates ChatAnthropic from config
- [x] `createGeminiClient()` factory creates ChatGoogleGenerativeAI from config
- [x] `createGeminiClient()` supports Gemini API mode (Vertex AI deferred - requires separate `@langchain/google-vertexai` package)
- [x] `createAzureOpenAIClient()` factory creates AzureChatOpenAI from config
- [x] All three providers registered in `PROVIDER_REGISTRY`
- [x] All three providers exported from `src/model/index.ts`
- [x] `isProviderSupported()` returns true for anthropic, gemini, azure
- [x] All tests pass with 85%+ coverage for new files (achieved 100%)
- [x] All quality gates pass (typecheck, lint, test, build)

## Validation Commands

```bash
# Install dependencies
bun add @langchain/anthropic @langchain/google-genai

# Run all validation commands before committing
bun run typecheck && bun run lint && bun run test && bun run build

# Run just the model tests
bun run test src/model

# Run with coverage
bun run test --coverage src/model
```

## Notes

### Provider-Specific Considerations

**Anthropic:**
- Simple implementation, similar to OpenAI
- Uses `anthropicApiKey` parameter name (not `apiKey`)
- Falls back to `ANTHROPIC_API_KEY` env var

**Gemini:**
- Dual mode: Gemini API vs Vertex AI
- Gemini API: Uses `apiKey`, falls back to `GOOGLE_API_KEY` env var
- Vertex AI: Uses `projectId` and `location`, relies on ADC (Application Default Credentials)
- Both modes use the same `ChatGoogleGenerativeAI` class

**Azure OpenAI:**
- Uses `AzureChatOpenAI` class from `@langchain/openai` package
- Requires `endpoint` and `deployment` (not optional like model)
- Parameter names are Azure-prefixed: `azureOpenAIEndpoint`, `azureOpenAIApiKey`, etc.
- Uses `deployment` instead of `model` (LLMClient.getModelName already handles this)

### Error Mapping

The existing `mapErrorToCode()` function handles common errors. Provider-specific error patterns to watch:
- **Anthropic:** "overloaded_error", "invalid_request_error"
- **Gemini:** "quota_exceeded", "resource_exhausted"
- **Azure:** "DeploymentNotFound", "InvalidTemplate"

These can be added to `mapErrorToCode()` if needed during implementation.

### LLMClient Compatibility

No changes to `LLMClient` are required. The class already:
- Uses `getProviderFactory()` to get the factory function
- Handles `deployment` field for Azure in `getModelName()`
- Works generically with any `BaseChatModel`

## Execution

This spec can be implemented using: `/sdlc:implement docs/specs/feature-012-multi-provider-support.md`
