/**
 * Azure OpenAI provider setup wizard.
 */

import type { CommandContext } from '../../cli/commands/types.js';
import type { ProviderSetupResult } from './index.js';
import { checkEnvVar } from './index.js';
import { DEFAULT_AZURE_API_VERSION, DEFAULT_AZURE_MODEL } from '../constants.js';

/**
 * Interactive setup wizard for Azure OpenAI provider.
 * Detects existing env vars, prompts for endpoint, deployment, and API key.
 */
export async function setupAzure(context: CommandContext): Promise<ProviderSetupResult> {
  context.onOutput('\nAzure OpenAI Setup', 'success');
  context.onOutput('─────────────────────', 'info');

  if (!context.onPrompt) {
    return { success: false, message: 'Interactive prompts not available' };
  }

  // Check for existing env vars
  const envEndpoint = checkEnvVar(context, 'AZURE_OPENAI_ENDPOINT', 'Endpoint');
  const envDeployment = checkEnvVar(context, 'AZURE_OPENAI_DEPLOYMENT_NAME', 'Deployment');
  const envApiKey = checkEnvVar(context, 'AZURE_OPENAI_API_KEY', 'API Key');
  const envApiVersion = checkEnvVar(context, 'AZURE_OPENAI_API_VERSION', 'API Version');

  const hasAnyEnvVar =
    envEndpoint !== undefined || envDeployment !== undefined || envApiKey !== undefined;

  if (!hasAnyEnvVar) {
    context.onOutput('You need your Azure OpenAI resource endpoint and deployment name.', 'info');
    context.onOutput('Find these in the Azure Portal under your OpenAI resource.\n', 'info');
  } else {
    context.onOutput('', 'info'); // Blank line after detection messages
  }

  // Prompt for endpoint - optional if detected
  const endpointPrompt =
    envEndpoint !== undefined
      ? 'Endpoint (press Enter to use detected, or enter new):'
      : 'Azure OpenAI Endpoint (https://...openai.azure.com/):';
  const endpointInput = await context.onPrompt(endpointPrompt);
  const endpoint = endpointInput.trim() || envEndpoint;

  // Validate endpoint if provided
  if (endpoint !== undefined) {
    let isValidEndpoint = false;
    try {
      const url = new URL(endpoint);
      isValidEndpoint = url.protocol === 'https:' && url.hostname.endsWith('.openai.azure.com');
    } catch {
      isValidEndpoint = false;
    }

    if (!isValidEndpoint) {
      context.onOutput(
        'Invalid endpoint. Expected URL like "https://xxx.openai.azure.com/"',
        'error'
      );
      return { success: false, message: 'Invalid endpoint format' };
    }
  } else {
    context.onOutput(
      'Endpoint is required. Set AZURE_OPENAI_ENDPOINT or enter an endpoint.',
      'error'
    );
    return { success: false, message: 'Endpoint required' };
  }

  // Prompt for deployment name - optional if detected
  const deploymentPrompt =
    envDeployment !== undefined
      ? `Deployment (press Enter to use detected, default: ${DEFAULT_AZURE_MODEL}):`
      : `Deployment Name (default: ${DEFAULT_AZURE_MODEL}):`;
  const deploymentInput = await context.onPrompt(deploymentPrompt);
  const deploymentName =
    deploymentInput.trim() !== '' ? deploymentInput.trim() : (envDeployment ?? DEFAULT_AZURE_MODEL);

  // Prompt for API key - optional (can use Azure CLI auth)
  const apiKeyPrompt =
    envApiKey !== undefined
      ? 'API Key (press Enter to use detected, or enter new, or blank for Azure CLI):'
      : 'API Key (or press Enter to use Azure CLI auth):';
  const apiKeyInput = await context.onPrompt(apiKeyPrompt);
  const apiKey = apiKeyInput.trim() || envApiKey;

  // Prompt for API version
  const defaultVersion = envApiVersion ?? DEFAULT_AZURE_API_VERSION;
  const apiVersionPrompt =
    envApiVersion !== undefined
      ? `API Version (press Enter to use detected: ${envApiVersion}):`
      : `API Version (default: ${DEFAULT_AZURE_API_VERSION}):`;
  const apiVersionInput = await context.onPrompt(apiVersionPrompt);
  const apiVersion = apiVersionInput.trim() || defaultVersion;

  context.onOutput('\nConfiguration ready', 'success');
  if (apiKey === undefined || apiKey === '') {
    context.onOutput('Note: Using Azure CLI authentication', 'info');
  }

  // Build config - only include values that were manually entered
  const config: Record<string, unknown> = { apiVersion };

  if (endpointInput.trim() !== '') {
    config.endpoint = endpoint;
  }
  if (deploymentInput.trim() !== '') {
    config.deployment = deploymentName;
  } else if (envDeployment === undefined) {
    config.deployment = deploymentName; // Use default if nothing detected
  }
  if (apiKeyInput.trim() !== '') {
    config.apiKey = apiKey;
  }

  return {
    success: true,
    config,
    message: 'Azure OpenAI configured successfully',
  };
}
