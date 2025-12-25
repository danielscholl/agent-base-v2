/**
 * Model utility functions.
 * Shared helpers for resolving and working with model configurations.
 */

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
