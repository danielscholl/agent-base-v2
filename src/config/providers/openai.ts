/**
 * OpenAI provider setup wizard.
 */

import type { CommandContext } from '../../cli/commands/types.js';
import type { ProviderSetupResult } from './index.js';
import { DEFAULT_OPENAI_MODEL } from '../constants.js';

/**
 * Interactive setup wizard for OpenAI provider.
 * Prompts for API key and model, validates format before returning.
 */
export async function setupOpenAI(context: CommandContext): Promise<ProviderSetupResult> {
  context.onOutput('\nOpenAI Setup', 'success');
  context.onOutput('─────────────────', 'info');
  context.onOutput('Get your API key from: https://platform.openai.com/api-keys\n', 'info');

  if (!context.onPrompt) {
    return { success: false, message: 'Interactive prompts not available' };
  }

  // Prompt for API key
  const apiKey = await context.onPrompt('OpenAI API Key (sk-...):');

  if (!apiKey || !apiKey.startsWith('sk-')) {
    context.onOutput('Invalid API key format. Expected key starting with "sk-"', 'error');
    return { success: false, message: 'Invalid API key format' };
  }

  // Prompt for model with default
  const modelInput = await context.onPrompt(`Model (default: ${DEFAULT_OPENAI_MODEL}):`);
  const model = modelInput.trim() || DEFAULT_OPENAI_MODEL;

  context.onOutput('\nConfiguration ready', 'success');

  return {
    success: true,
    config: { apiKey, model },
    message: 'OpenAI configured successfully',
  };
}
