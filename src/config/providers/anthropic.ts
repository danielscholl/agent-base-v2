/**
 * Anthropic provider setup wizard.
 */

import type { CommandContext } from '../../cli/commands/types.js';
import type { ProviderSetupResult } from './index.js';
import { DEFAULT_ANTHROPIC_MODEL } from '../constants.js';

/**
 * Interactive setup wizard for Anthropic provider.
 * Prompts for API key and model, validates format before returning.
 */
export async function setupAnthropic(context: CommandContext): Promise<ProviderSetupResult> {
  context.onOutput('\nAnthropic Setup', 'success');
  context.onOutput('─────────────────', 'info');
  context.onOutput('Get your API key from: https://console.anthropic.com/settings/keys\n', 'info');

  if (!context.onPrompt) {
    return { success: false, message: 'Interactive prompts not available' };
  }

  // Prompt for API key
  const apiKey = await context.onPrompt('Anthropic API Key (sk-ant-...):');

  if (!apiKey || !apiKey.startsWith('sk-ant-')) {
    context.onOutput('Invalid API key format. Expected key starting with "sk-ant-"', 'error');
    return { success: false, message: 'Invalid API key format' };
  }

  // Prompt for model with default
  const modelInput = await context.onPrompt(`Model (default: ${DEFAULT_ANTHROPIC_MODEL}):`);
  const model = modelInput.trim() || DEFAULT_ANTHROPIC_MODEL;

  context.onOutput('\nConfiguration ready', 'success');

  return {
    success: true,
    config: { apiKey, model },
    message: 'Anthropic configured successfully',
  };
}
