/**
 * Azure OpenAI provider setup wizard.
 */

import type { CommandContext } from '../../cli/commands/types.js';
import type { ProviderSetupResult } from './index.js';
import { DEFAULT_AZURE_API_VERSION, DEFAULT_AZURE_MODEL } from '../constants.js';

/**
 * Interactive setup wizard for Azure OpenAI provider.
 * Prompts for endpoint, deployment, and API key.
 */
export async function setupAzure(context: CommandContext): Promise<ProviderSetupResult> {
  context.onOutput('\nAzure OpenAI Setup', 'success');
  context.onOutput('─────────────────────', 'info');
  context.onOutput('You need your Azure OpenAI resource endpoint and deployment name.', 'info');
  context.onOutput('Find these in the Azure Portal under your OpenAI resource.\n', 'info');

  if (!context.onPrompt) {
    return { success: false, message: 'Interactive prompts not available' };
  }

  // Prompt for endpoint
  const endpoint = await context.onPrompt('Azure OpenAI Endpoint (https://...openai.azure.com/):');

  if (!endpoint || !endpoint.includes('openai.azure.com')) {
    context.onOutput('Invalid endpoint. Expected URL containing "openai.azure.com"', 'error');
    return { success: false, message: 'Invalid endpoint format' };
  }

  // Prompt for deployment name
  const deployment = await context.onPrompt(`Deployment Name (default: ${DEFAULT_AZURE_MODEL}):`);
  const deploymentName = deployment.trim() || DEFAULT_AZURE_MODEL;

  // Prompt for API key
  const apiKey = await context.onPrompt('API Key (or press Enter to use Azure CLI auth):');

  // Prompt for API version
  const apiVersionInput = await context.onPrompt(
    `API Version (default: ${DEFAULT_AZURE_API_VERSION}):`
  );
  const apiVersion = apiVersionInput.trim() || DEFAULT_AZURE_API_VERSION;

  context.onOutput('\nConfiguration ready', 'success');
  if (!apiKey) {
    context.onOutput('Note: Using Azure CLI authentication', 'info');
  }

  return {
    success: true,
    config: {
      endpoint,
      deployment: deploymentName,
      apiKey: apiKey.trim() || undefined,
      apiVersion,
    },
    message: 'Azure OpenAI configured successfully',
  };
}
