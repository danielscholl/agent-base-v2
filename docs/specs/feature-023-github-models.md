# Feature 23: Implement GitHub Models Provider

## Feature Description

Add a GitHub Models provider that uses the OpenAI-compatible API at `https://models.github.ai/inference`. This enables the agent framework to use GitHub-hosted AI models including GPT-4o, DeepSeek, Phi-4, Llama 3.3, and other models available through GitHub's infrastructure.

The provider supports:
- **Personal tokens**: Standard GitHub personal access tokens with `models:read` scope
- **Organization-scoped tokens**: Enterprise rate limits via org endpoint (`/orgs/{org}/inference`)
- **OpenAI-compatible API**: Uses `ChatOpenAI` from LangChain with custom endpoint

## User Story

As a developer using the agent framework,
I want to use GitHub Models as my LLM provider,
So that I can access a variety of AI models through GitHub's infrastructure using my existing GitHub authentication.

## Problem Statement

Currently, the agent framework supports OpenAI, Anthropic, Gemini, Azure OpenAI, and Local (Docker) providers. GitHub Models provides:
- Free tier with rate limits for experimentation
- Paid tier with higher rate limits and larger context windows
- Access to multiple model families (OpenAI, Microsoft, Meta, DeepSeek)
- Enterprise features via organization-scoped endpoints

Without this provider, developers cannot:
- Use GitHub Models for AI inference
- Leverage existing GitHub authentication
- Access models exclusive to GitHub's platform

## Solution Statement

Implement a `github` provider in `model/providers/github.ts` that:
1. Uses `ChatOpenAI` from `@langchain/openai` with the GitHub Models endpoint
2. Requires a GitHub token for authentication
3. Supports optional organization parameter for enterprise rate limits
4. Follows the established provider factory pattern

## Related Documentation

### Requirements
- Feature defined in: `docs/plans/typescript-rewrite-features.md` (Feature 23, line 157-158)
- Phase: 3 (Memory + Session)
- Dependencies: Feature 4 (OpenAI provider), Feature 12 (Multi-provider support)

### Architecture Decisions
- ADR-0002: LangChain.js for LLM Integration - establishes provider factory pattern
- Provider Architecture section in `docs/architecture.md` (lines 137-206)

### External References
- [GitHub Models REST API](https://docs.github.com/en/rest/models/inference)
- [GitHub Blog: Solving the inference problem](https://github.blog/ai-and-ml/llms/solving-the-inference-problem-for-open-source-ai-projects-with-github-models/)
- [GitHub Models and Inference API](https://devopsjournal.io/blog/2024/09/29/GitHub-Models-API)

## Codebase Analysis Findings

### Architecture Patterns

**Provider Factory Pattern** (from `src/model/providers/openai.ts`):
```typescript
export function createGitHubClient(
  config: GitHubProviderConfig | Record<string, unknown>
): Promise<ModelResponse<BaseChatModel>> {
  try {
    // 1. Extract config with type assertions
    // 2. Validate required fields (token)
    // 3. Build endpoint URL with optional org
    // 4. Create ChatOpenAI instance
    // 5. Return Promise.resolve(successResponse(...))
  } catch (error) {
    // 6. Error handling with Promise.resolve(errorResponse(...))
  }
}
```

**Similar Implementation Reference** (`src/model/providers/local.ts`):
```typescript
// Local provider shows how to use ChatOpenAI with custom baseURL
const client = new ChatOpenAI({
  model,
  openAIApiKey: token,  // GitHub token goes here
  configuration: { baseURL: endpoint },
});
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Provider factory | `create[Provider]Client` | `createGitHubClient` |
| Config type | `[Provider]ProviderConfig` | `GitHubProviderConfig` |
| Test file | `[provider].test.ts` | `github.test.ts` |
| Provider file | `[provider].ts` | `github.ts` |
| Default constants | `DEFAULT_[PROVIDER]_[FIELD]` | `DEFAULT_GITHUB_MODEL` |

### Existing Configuration (Already Defined)

**Config Schema** (`src/config/schema.ts` lines 127-137):
```typescript
export const GitHubProviderConfigSchema = z.object({
  token: z.string().optional().describe('GitHub token'),
  model: z.string().default(DEFAULT_GITHUB_MODEL).describe('Model name to use'),
  endpoint: z.url().default(DEFAULT_GITHUB_ENDPOINT).describe('GitHub Models endpoint'),
  org: z.string().optional().describe('GitHub organization'),
});
```

**Constants** (`src/config/constants.ts` lines 50-51):
```typescript
export const DEFAULT_GITHUB_MODEL = 'gpt-4o';
export const DEFAULT_GITHUB_ENDPOINT = 'https://models.github.ai/inference';
```

### Integration Patterns

- Provider registered in `src/model/registry.ts`
- Config schema defined in `src/config/schema.ts`
- Constants defined in `src/config/constants.ts`
- Tests use mock-before-import pattern with `jest.unstable_mockModule`

## Archon Project

Project ID: `9ceef098-dc82-41d0-98c8-a59cdbaa58ae`

## Relevant Files

### Existing Files to Modify
- `src/config/constants.ts`: Update `DEFAULT_GITHUB_ENDPOINT` to new URL
- `src/model/registry.ts`: Add import and register `github` provider
- `src/config/env.ts`: Add `GITHUB_MODELS_ORG` environment variable mapping

### New Files to Create
- `src/model/providers/github.ts`: GitHub provider factory implementation
- `src/model/__tests__/github.test.ts`: Unit tests for GitHub provider

### Reference Files (Read Only)
- `src/model/providers/openai.ts`: Base OpenAI provider pattern
- `src/model/providers/local.ts`: Pattern for ChatOpenAI with custom baseURL
- `src/model/base.ts`: Response factories and error mapping
- `src/model/types.ts`: Type definitions
- `src/model/__tests__/openai.test.ts`: Test pattern template
- `src/config/schema.ts`: Existing GitHubProviderConfigSchema

## Implementation Plan

### Phase 1: Configuration Update
Update the default endpoint constant to the new GitHub Models API URL.

### Phase 2: Provider Implementation
Create the GitHub provider factory following the established patterns.

### Phase 3: Integration
Register the provider and create comprehensive tests.

## Step by Step Tasks

### Task 1: Update Default Endpoint Constant

**Description**: Update `DEFAULT_GITHUB_ENDPOINT` to the new GitHub Models API URL.

**Files to modify**: `src/config/constants.ts`

**Changes**:
```typescript
// OLD:
export const DEFAULT_GITHUB_ENDPOINT = 'https://models.inference.ai.azure.com';

// NEW:
export const DEFAULT_GITHUB_ENDPOINT = 'https://models.github.ai/inference';
```

**Rationale**: The Azure inference endpoint is being deprecated in favor of the new `models.github.ai` endpoint.

---

### Task 2: Create GitHub Provider Factory

**Description**: Implement `createGitHubClient` factory function.

**Files to create**: `src/model/providers/github.ts`

**Implementation**:
```typescript
/**
 * GitHub Models provider factory.
 * Creates ChatOpenAI instances for GitHub's OpenAI-compatible API.
 */

import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { GitHubProviderConfig } from '../../config/schema.js';
import type { ModelResponse } from '../types.js';
import { successResponse, errorResponse, mapErrorToCode } from '../base.js';
import { DEFAULT_GITHUB_MODEL, DEFAULT_GITHUB_ENDPOINT } from '../../config/constants.js';

/**
 * Create a ChatOpenAI instance for GitHub Models.
 * Uses the OpenAI-compatible API at models.github.ai/inference.
 *
 * @param config - GitHub provider configuration
 * @returns Promise<ModelResponse> with ChatOpenAI or error
 *
 * @example Personal token:
 * ```typescript
 * const result = await createGitHubClient({
 *   token: 'ghp_xxxxxxxxxxxx',
 *   model: 'gpt-4o',
 * });
 * ```
 *
 * @example Organization-scoped:
 * ```typescript
 * const result = await createGitHubClient({
 *   token: 'ghp_xxxxxxxxxxxx',
 *   model: 'gpt-4o',
 *   org: 'my-organization',
 * });
 * ```
 */
export function createGitHubClient(
  config: GitHubProviderConfig | Record<string, unknown>
): Promise<ModelResponse<BaseChatModel>> {
  try {
    // Extract config fields with empty string handling (treat '' as unset)
    const token = config.token as string | undefined;
    const configModel = config.model as string | undefined;
    const configEndpoint = config.endpoint as string | undefined;
    const model =
      configModel !== undefined && configModel !== '' ? configModel : DEFAULT_GITHUB_MODEL;
    const endpoint =
      configEndpoint !== undefined && configEndpoint !== '' ? configEndpoint : DEFAULT_GITHUB_ENDPOINT;
    const org = config.org as string | undefined;

    // GitHub Models requires authentication
    if (token === undefined || token === '') {
      return Promise.resolve(
        errorResponse(
          'PROVIDER_NOT_CONFIGURED',
          'GitHub Models requires token to be configured. ' +
            'Set providers.github.token in config or GITHUB_TOKEN environment variable.'
        )
      );
    }

    // Build endpoint URL with optional org parameter
    // Personal: https://models.github.ai/inference
    // Org: https://models.github.ai/orgs/{org}/inference
    let baseURL = endpoint;
    if (org !== undefined && org !== '') {
      // Insert org into the endpoint path
      // From: https://models.github.ai/inference
      // To: https://models.github.ai/orgs/{org}/inference
      const url = new URL(endpoint);
      url.pathname = `/orgs/${org}/inference`;
      baseURL = url.toString();
    }

    // Create ChatOpenAI instance with GitHub Models endpoint
    const client = new ChatOpenAI({
      model,
      openAIApiKey: token,
      configuration: { baseURL },
    });

    const locationMsg = org ? ` (org: ${org})` : '';
    return Promise.resolve(
      successResponse(
        client as BaseChatModel,
        `GitHub client created with model: ${model}${locationMsg}`
      )
    );
  } catch (error) {
    const errorCode = mapErrorToCode(error);
    const message = error instanceof Error ? error.message : 'Failed to create GitHub client';
    return Promise.resolve(errorResponse(errorCode, message));
  }
}
```

**Key Design Decisions**:
- Token is **required** (unlike OpenAI which falls back to env var via LangChain)
- Uses standard `ChatOpenAI` since GitHub Models is OpenAI-compatible
- Org parameter modifies the endpoint path for enterprise rate limits
- URL construction handles both default and custom endpoints correctly

---

### Task 3: Register Provider in Registry

**Description**: Add the GitHub provider to the provider registry.

**Files to modify**: `src/model/registry.ts`

**Changes**:
```typescript
// Add import
import { createGitHubClient } from './providers/github.js';

// Add to registry
export const PROVIDER_REGISTRY: Partial<Record<ProviderName, ProviderFactory>> = {
  openai: createOpenAIClient,
  anthropic: createAnthropicClient,
  gemini: createGeminiClient,
  azure: createAzureOpenAIClient,
  local: createLocalClient,
  github: createGitHubClient,  // ADD THIS LINE
  // Future providers:
  // foundry: createFoundryClient,
};
```

---

### Task 4: Create Unit Tests

**Description**: Write comprehensive unit tests for the GitHub provider.

**Files to create**: `src/model/__tests__/github.test.ts`

**Test Cases**:
1. Creates ChatOpenAI with token and default model
2. Creates ChatOpenAI with custom model
3. Creates ChatOpenAI with custom endpoint
4. Creates ChatOpenAI with org parameter (builds correct URL)
5. Returns error when token is missing
6. Returns error when token is empty string
7. Returns error when ChatOpenAI constructor throws
8. Handles `Record<string, unknown>` config type
9. Handles non-Error thrown objects
10. Uses default endpoint when not specified
11. Uses default model when not specified

---

### Task 5: Update Registry Tests

**Description**: Add tests verifying the GitHub provider is registered.

**Files to modify**: `src/model/__tests__/registry.test.ts`

**Changes**:
- Add test: `it('has github provider registered')`
- Add test: `it('returns factory for github provider')`
- Add test: `it('returns true for github')`
- Update `getSupportedProviders` count test from 6 to 7

---

### Task 6: Run Quality Checks

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

Tests in `src/model/__tests__/github.test.ts` covering:

1. **Success cases**:
   - Token only (uses defaults)
   - Custom model
   - Custom endpoint
   - Organization parameter
   - Record<string, unknown> config type

2. **Validation errors**:
   - Missing token
   - Empty string token

3. **Constructor errors**:
   - Error during ChatOpenAI creation
   - Non-Error thrown objects

4. **Mock verification**:
   - Correct parameters passed to ChatOpenAI
   - Correct baseURL construction for org parameter

### Mock Pattern

```typescript
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

interface MockOpenAIConfig {
  model: string;
  openAIApiKey?: string;
  configuration?: { baseURL?: string };
}

const mockChatOpenAI = jest
  .fn<(config: MockOpenAIConfig) => { model: string; _type: string }>()
  .mockImplementation((config) => ({
    model: config.model,
    _type: 'chat_model',
  }));

jest.unstable_mockModule('@langchain/openai', () => ({
  ChatOpenAI: mockChatOpenAI,
}));

const { createGitHubClient } = await import('../providers/github.js');
```

### Edge Cases

- Empty string org (should be treated as undefined)
- Custom endpoint with org (should modify custom endpoint correctly)
- URL without trailing slash (should work correctly)
- URL with trailing slash (should work correctly)

## Acceptance Criteria

- [x] `DEFAULT_GITHUB_ENDPOINT` updated to `https://models.github.ai/inference`
- [x] `createGitHubClient` factory function exists in `src/model/providers/github.ts`
- [x] Factory validates required `token` field
- [x] Factory supports optional `org` parameter for enterprise
- [x] Factory uses `ChatOpenAI` with correct configuration
- [x] Provider registered in `src/model/registry.ts` as `github`
- [x] All unit tests pass with 85%+ coverage
- [x] TypeScript strict mode passes
- [x] ESLint and Prettier pass
- [x] Build succeeds

## Validation Commands

```bash
# Run all quality checks
bun run typecheck && bun run lint && bun run test && bun run build

# Run specific tests
bun run test src/model/__tests__/github.test.ts

# Run registry tests
bun run test src/model/__tests__/registry.test.ts

# Type check only
bun run typecheck

# Lint only
bun run lint

# Build only
bun run build
```

## Notes

### GitHub Models API Details

**Endpoint URLs**:
- Personal: `https://models.github.ai/inference`
- Organization: `https://models.github.ai/orgs/{org}/inference`
- Legacy (deprecated): `https://models.inference.ai.azure.com`

**Authentication**:
- GitHub Personal Access Token (PAT) with `models:read` scope
- Fine-grained tokens also supported
- Token passed as `api_key` in OpenAI-compatible format

**Available Models** (as of December 2025):
- OpenAI: gpt-4o, gpt-4o-mini
- Microsoft: Phi-4
- Meta: Llama 3.3 70B Instruct
- DeepSeek: DeepSeek-R1
- And others

**Rate Limits**:
- Free tier: Limited RPM, standard context windows
- Paid tier: Higher RPM, 128k context on supported models, dedicated deployment

### Fallback Token Resolution

The current implementation requires the token in config. To support environment variable fallback:

```typescript
// Option 1: Check env var in factory (recommended)
const token = (config.token as string | undefined) ?? process.env.GITHUB_TOKEN;

// Option 2: Let user set it via config merge (current approach)
// User can set GITHUB_TOKEN env var and load it in config manager
```

For MVP, we require explicit token configuration to maintain consistency with other providers that require authentication (Azure OpenAI, etc.).

### Future Considerations

- Add token validation (check for PAT format)
- Support for model-specific endpoints if GitHub introduces them
- Rate limit handling with backoff
- Support for GitHub Apps authentication
- Token refresh for long-running sessions

## Execution

This spec can be implemented using: `/sdlc:implement docs/specs/feature-023-github-models.md`
