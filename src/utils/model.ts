/**
 * Model utility functions.
 * Shared helpers for resolving and working with model configurations.
 */

import type { ProviderName } from '../config/constants.js';

/**
 * Resolve model name from provider configuration.
 * Handles different providers with different config fields.
 *
 * @param providerName - The provider name (e.g., 'azure', 'foundry', 'openai')
 * @param providerConfig - The provider configuration object
 * @returns The resolved model name, or 'unknown' if it cannot be determined
 */
export function resolveModelName(
  providerName: string,
  providerConfig: Record<string, unknown> | undefined
): string {
  if (providerConfig === undefined) return 'unknown';

  if (providerName === 'azure') {
    return (providerConfig.deployment as string | undefined) ?? 'unknown';
  }

  if (providerName === 'foundry') {
    const mode = providerConfig.mode as string | undefined;
    if (mode === 'local') {
      return (providerConfig.modelAlias as string | undefined) ?? 'unknown';
    }
    return (providerConfig.modelDeployment as string | undefined) ?? 'unknown';
  }

  return (providerConfig.model as string | undefined) ?? 'unknown';
}

/**
 * Check if a provider has meaningful configuration beyond schema defaults.
 * A provider is "configured" if it has credentials or explicitly set values.
 *
 * @param providerName - The provider name
 * @param providerConfig - The provider configuration object
 * @returns True if the provider has required configuration, false otherwise
 */
export function isProviderConfigured(
  providerName: ProviderName,
  providerConfig: Record<string, unknown> | undefined
): boolean {
  if (providerConfig === undefined) return false;

  switch (providerName) {
    case 'openai':
      // OpenAI needs an API key, custom baseUrl, or model set via wizard (key from env var)
      return (
        (typeof providerConfig.apiKey === 'string' && providerConfig.apiKey !== '') ||
        (typeof providerConfig.baseUrl === 'string' && providerConfig.baseUrl !== '') ||
        (typeof providerConfig.model === 'string' && providerConfig.model !== '')
      );

    case 'anthropic':
      // Anthropic needs an API key or model set via wizard (key from env var)
      return (
        (typeof providerConfig.apiKey === 'string' && providerConfig.apiKey !== '') ||
        (typeof providerConfig.model === 'string' && providerConfig.model !== '')
      );

    case 'azure':
      // Azure is configured if endpoint or deployment is set
      // (both can come from env vars AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT_NAME)
      return (
        (typeof providerConfig.endpoint === 'string' && providerConfig.endpoint !== '') ||
        (typeof providerConfig.deployment === 'string' && providerConfig.deployment !== '')
      );

    case 'foundry':
      // Foundry cloud needs projectEndpoint, local mode is always available
      if (providerConfig.mode === 'local') {
        return true; // Local mode doesn't need credentials
      }
      return (
        typeof providerConfig.projectEndpoint === 'string' && providerConfig.projectEndpoint !== ''
      );

    case 'gemini':
      // Gemini needs an API key or model set via wizard (key from env var)
      return (
        (typeof providerConfig.apiKey === 'string' && providerConfig.apiKey !== '') ||
        (typeof providerConfig.model === 'string' && providerConfig.model !== '')
      );

    case 'github':
      // GitHub needs a token or model set via wizard (token from env var)
      return (
        (typeof providerConfig.token === 'string' && providerConfig.token !== '') ||
        (typeof providerConfig.model === 'string' && providerConfig.model !== '')
      );

    case 'local':
      // Local provider is configured if baseUrl is set
      return typeof providerConfig.baseUrl === 'string' && providerConfig.baseUrl !== '';

    default:
      return false;
  }
}
