/**
 * Azure AI Foundry provider setup wizard.
 */

import type { CommandContext } from '../../cli/commands/types.js';
import type { ProviderSetupResult } from './index.js';
import {
  DEFAULT_FOUNDRY_MODE,
  DEFAULT_FOUNDRY_LOCAL_MODEL,
  DEFAULT_FOUNDRY_MODEL,
} from '../constants.js';

/**
 * Interactive setup wizard for Azure AI Foundry provider.
 * Supports both local (Docker) and cloud modes.
 */
export async function setupFoundry(context: CommandContext): Promise<ProviderSetupResult> {
  context.onOutput('\nAzure AI Foundry Setup', 'success');
  context.onOutput('────────────────────────', 'info');
  context.onOutput('Foundry supports two modes:', 'info');
  context.onOutput('  1. Local  - Run models on your machine via Docker', 'info');
  context.onOutput('  2. Cloud  - Use Azure AI Foundry managed endpoints\n', 'info');

  if (!context.onPrompt) {
    return { success: false, message: 'Interactive prompts not available' };
  }

  // Prompt for mode
  const modeChoice = await context.onPrompt(
    `Mode (1=local, 2=cloud, default: ${DEFAULT_FOUNDRY_MODE}):`
  );

  const mode = modeChoice === '1' ? 'local' : modeChoice === '2' ? 'cloud' : DEFAULT_FOUNDRY_MODE;

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
    context.onOutput('You need your Azure AI Foundry project endpoint.\n', 'info');

    const projectEndpoint = await context.onPrompt(
      'Project Endpoint (https://...services.ai.azure.com/):'
    );

    if (!projectEndpoint || !projectEndpoint.includes('azure')) {
      context.onOutput('Invalid endpoint format', 'error');
      return { success: false, message: 'Invalid project endpoint' };
    }

    const deploymentInput = await context.onPrompt(
      `Model Deployment (default: ${DEFAULT_FOUNDRY_MODEL}):`
    );
    const modelDeployment = deploymentInput.trim() || DEFAULT_FOUNDRY_MODEL;

    const apiKey = await context.onPrompt('API Key (or press Enter to use Azure CLI auth):');

    context.onOutput('\nConfiguration ready', 'success');
    if (!apiKey) {
      context.onOutput('Note: Using Azure CLI authentication', 'info');
    }

    return {
      success: true,
      config: {
        mode: 'cloud',
        projectEndpoint,
        modelDeployment,
        apiKey: apiKey || undefined,
      },
      message: 'Foundry (cloud) configured successfully',
    };
  }
}
