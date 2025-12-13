/**
 * Model module - Multi-provider LLM abstraction layer.
 *
 * This module provides:
 * - LLMClient class for invoking and streaming LLM responses
 * - Provider registry for config-based provider selection
 * - Type definitions for model operations
 *
 * Provider selection is based on config.providers.default, not model prefix parsing.
 *
 * @module model
 *
 * @example
 * ```typescript
 * import { LLMClient } from './model/index.js';
 * import { loadConfig } from './config/index.js';
 *
 * const configResult = await loadConfig();
 * if (!configResult.success) throw new Error(configResult.message);
 *
 * const client = new LLMClient({ config: configResult.result });
 * const result = await client.invoke('Hello!');
 *
 * if (result.success) {
 *   console.log(result.result.content);
 * }
 * ```
 */

// -----------------------------------------------------------------------------
// Type Exports
// -----------------------------------------------------------------------------
export type {
  ModelResponse,
  ModelSuccessResponse,
  ModelErrorResponse,
  ModelErrorCode,
  TokenUsage,
  InvokeResult,
  LLMCallbacks,
  LLMCallOptions,
  ProviderFactory,
  StreamResult,
} from './types.js';

// Type guards
export { isModelSuccess, isModelError } from './types.js';

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------
export { successResponse, errorResponse, mapErrorToCode, extractTokenUsage } from './base.js';

// -----------------------------------------------------------------------------
// Registry Functions
// -----------------------------------------------------------------------------
export {
  getProviderFactory,
  isProviderSupported,
  getSupportedProviders,
  PROVIDER_REGISTRY,
} from './registry.js';

// -----------------------------------------------------------------------------
// Main Client
// -----------------------------------------------------------------------------
export { LLMClient } from './llm.js';
export type { LLMClientOptions } from './llm.js';

// -----------------------------------------------------------------------------
// Provider Factories
// -----------------------------------------------------------------------------
export { createOpenAIClient } from './providers/openai.js';
export { createAnthropicClient } from './providers/anthropic.js';
export { createGeminiClient } from './providers/gemini.js';
export { createAzureOpenAIClient } from './providers/azure-openai.js';
