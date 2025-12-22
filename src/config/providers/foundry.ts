/**
 * Azure AI Foundry provider setup wizard.
 */

import type { CommandContext } from '../../cli/commands/types.js';
import type { ProviderSetupResult } from './index.js';
import { checkEnvVar } from './index.js';
import {
  DEFAULT_FOUNDRY_MODE,
  DEFAULT_FOUNDRY_LOCAL_MODEL,
  DEFAULT_FOUNDRY_MODEL,
} from '../constants.js';

/**
 * Interactive setup wizard for Azure AI Foundry provider.
 * Detects existing env vars, supports both local (Docker) and cloud modes.
 */
export async function setupFoundry(context: CommandContext): Promise<ProviderSetupResult> {
  context.onOutput('\nAzure AI Foundry Setup', 'success');
  context.onOutput('────────────────────────', 'info');

  if (!context.onPrompt) {
    return { success: false, message: 'Interactive prompts not available' };
  }

  // Check for existing env vars (cloud mode)
  const envEndpoint = checkEnvVar(context, 'AZURE_PROJECT_ENDPOINT', 'Project Endpoint');
  const envDeployment = checkEnvVar(context, 'AZURE_MODEL_DEPLOYMENT', 'Model Deployment');

  const hasCloudEnvVars = envEndpoint !== undefined || envDeployment !== undefined;

  context.onOutput('Foundry supports two modes:', 'info');
  context.onOutput('  1. Local  - Run models on your machine via Docker', 'info');
  context.onOutput('  2. Cloud  - Use Azure AI Foundry managed endpoints\n', 'info');

  // Prompt for mode - default to cloud if env vars detected
  const defaultMode = hasCloudEnvVars ? 'cloud' : DEFAULT_FOUNDRY_MODE;
  const modeChoice = await context.onPrompt(`Mode (1=local, 2=cloud, default: ${defaultMode}):`);

  const mode = modeChoice === '1' ? 'local' : modeChoice === '2' ? 'cloud' : defaultMode;

  if (mode === 'local') {
    // Local mode setup
    context.onOutput('\nLocal Mode Setup', 'info');
    context.onOutput('Ensure Docker Desktop is running with Model Runner enabled.\n', 'info');

    const modelInput = await context.onPrompt(
      `Model Alias (default: ${DEFAULT_FOUNDRY_LOCAL_MODEL}):`
    );
    const modelAlias = modelInput.trim() || DEFAULT_FOUNDRY_LOCAL_MODEL;

    context.onOutput('\nConfiguration ready', 'success');

    return {
      success: true,
      config: { mode: 'local', modelAlias },
      message: 'Foundry (local) configured successfully',
    };
  } else {
    // Cloud mode setup
    context.onOutput('\nCloud Mode Setup', 'info');

    if (envEndpoint === undefined) {
      context.onOutput('You need your Azure AI Foundry project endpoint.\n', 'info');
    }

    // Prompt for endpoint - optional if detected
    const endpointPrompt =
      envEndpoint !== undefined
        ? 'Endpoint (press Enter to use detected, or enter new):'
        : 'Project Endpoint (https://...services.ai.azure.com/):';
    const endpointInput = await context.onPrompt(endpointPrompt);
    const projectEndpoint = endpointInput.trim() || envEndpoint;

    // Validate endpoint if provided
    if (projectEndpoint !== undefined) {
      let isValidEndpoint = false;
      try {
        const url = new URL(projectEndpoint);
        isValidEndpoint = url.protocol === 'https:' && url.hostname.endsWith('.ai.azure.com');
      } catch {
        isValidEndpoint = false;
      }

      if (!isValidEndpoint) {
        context.onOutput('Invalid endpoint format. Expected: https://xxx.ai.azure.com/', 'error');
        return { success: false, message: 'Invalid project endpoint' };
      }
    } else {
      context.onOutput(
        'Endpoint is required. Set AZURE_PROJECT_ENDPOINT or enter an endpoint.',
        'error'
      );
      return { success: false, message: 'Endpoint required' };
    }

    // Prompt for deployment - optional if detected
    const deploymentPrompt =
      envDeployment !== undefined
        ? `Deployment (press Enter to use detected, default: ${DEFAULT_FOUNDRY_MODEL}):`
        : `Model Deployment (default: ${DEFAULT_FOUNDRY_MODEL}):`;
    const deploymentInput = await context.onPrompt(deploymentPrompt);
    const modelDeployment =
      deploymentInput.trim() !== ''
        ? deploymentInput.trim()
        : (envDeployment ?? DEFAULT_FOUNDRY_MODEL);

    const apiKey = await context.onPrompt('API Key (or press Enter to use Azure CLI auth):');

    context.onOutput('\nConfiguration ready', 'success');
    if (apiKey === '') {
      context.onOutput('Note: Using Azure CLI authentication', 'info');
    }

    // Build config - only include values that were manually entered
    const config: Record<string, unknown> = { mode: 'cloud' };

    if (endpointInput.trim() !== '') {
      config.projectEndpoint = projectEndpoint;
    }
    if (deploymentInput.trim() !== '') {
      config.modelDeployment = modelDeployment;
    } else if (envDeployment === undefined) {
      config.modelDeployment = modelDeployment; // Use default if nothing detected
    }
    if (apiKey.trim() !== '') {
      config.apiKey = apiKey.trim();
    }

    return {
      success: true,
      config,
      message: 'Foundry (cloud) configured successfully',
    };
  }
}
