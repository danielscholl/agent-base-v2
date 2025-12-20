/**
 * Local (Docker) provider setup wizard.
 */

import type { CommandContext } from '../../cli/commands/types.js';
import type { ProviderSetupResult } from './index.js';
import { DEFAULT_LOCAL_BASE_URL, DEFAULT_LOCAL_MODEL } from '../constants.js';

/**
 * Interactive setup wizard for Local (Docker) provider.
 * Prompts for base URL and model.
 */
export async function setupLocal(context: CommandContext): Promise<ProviderSetupResult> {
  context.onOutput('\nLocal (Docker) Setup', 'success');
  context.onOutput('──────────────────────', 'info');
  context.onOutput('This uses Docker Desktop Model Runner for local AI models.', 'info');
  context.onOutput('Ensure Docker Desktop is running with Model Runner enabled.\n', 'info');

  if (!context.onPrompt) {
    return { success: false, message: 'Interactive prompts not available' };
  }

  // Prompt for base URL with default
  const urlInput = await context.onPrompt(`Base URL (default: ${DEFAULT_LOCAL_BASE_URL}):`);
  const baseUrl = urlInput.trim() || DEFAULT_LOCAL_BASE_URL;

  // Prompt for model with default
  const modelInput = await context.onPrompt(`Model (default: ${DEFAULT_LOCAL_MODEL}):`);
  const model = modelInput.trim() || DEFAULT_LOCAL_MODEL;

  context.onOutput('\nConfiguration ready', 'success');
  context.onOutput('Note: Ensure Docker Desktop is running before using this provider.', 'info');

  return {
    success: true,
    config: { baseUrl, model },
    message: 'Local provider configured successfully',
  };
}
