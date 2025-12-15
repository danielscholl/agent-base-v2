/**
 * Provider registry for LLM providers.
 * Maps provider names to their factory functions.
 */

import type { ProviderName } from '../config/constants.js';
import type { ProviderFactory } from './types.js';
import { createOpenAIClient } from './providers/openai.js';
import { createAnthropicClient } from './providers/anthropic.js';
import { createGeminiClient } from './providers/gemini.js';
import { createAzureOpenAIClient } from './providers/azure-openai.js';
import { createLocalClient } from './providers/local.js';
import { createFoundryClient } from './providers/foundry.js';

/**
 * Registry mapping provider names to their factory functions.
 *
 * Providers are added incrementally:
 * - Feature 4: OpenAI
 * - Feature 12: Anthropic, Gemini, Azure OpenAI
 * - Feature 25: GitHub Models
 * - Feature 26: Local (Docker)
 * - Feature 31: Azure AI Foundry
 */
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

/**
 * Get the factory function for a provider.
 *
 * @param providerName - Name of the provider
 * @returns Factory function or undefined if not supported
 */
export function getProviderFactory(providerName: ProviderName): ProviderFactory | undefined {
  return PROVIDER_REGISTRY[providerName];
}

/**
 * Check if a provider is supported.
 *
 * @param providerName - Name of the provider
 * @returns true if the provider has a registered factory
 */
export function isProviderSupported(providerName: ProviderName): boolean {
  return PROVIDER_REGISTRY[providerName] !== undefined;
}

/**
 * Get list of supported provider names.
 */
export function getSupportedProviders(): ProviderName[] {
  return Object.keys(PROVIDER_REGISTRY) as ProviderName[];
}
