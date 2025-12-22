/**
 * Anthropic provider setup wizard.
 */

import type { CommandContext } from '../../cli/commands/types.js';
import type { ProviderSetupResult } from './index.js';
import { checkEnvVar } from './index.js';
import { DEFAULT_ANTHROPIC_MODEL } from '../constants.js';

/**
 * Interactive setup wizard for Anthropic provider.
 * Detects existing env vars, prompts for API key and model.
 */
export async function setupAnthropic(context: CommandContext): Promise<ProviderSetupResult> {
  context.onOutput('\nAnthropic Setup', 'success');
  context.onOutput('─────────────────', 'info');

  if (!context.onPrompt) {
    return { success: false, message: 'Interactive prompts not available' };
  }

  // Check for existing API key in environment
  const envApiKey = checkEnvVar(context, 'ANTHROPIC_API_KEY', 'API Key');

  if (envApiKey === undefined) {
    context.onOutput(
      'Get your API key from: https://console.anthropic.com/settings/keys\n',
      'info'
    );
  } else {
    context.onOutput('', 'info'); // Blank line after detection message
  }

  // Prompt for API key - optional if env var detected
  const promptText =
    envApiKey !== undefined
      ? 'API Key (press Enter to use detected key, or enter new):'
      : 'Anthropic API Key (sk-ant-...):';
  const apiKeyInput = await context.onPrompt(promptText);

  // Use input if provided, otherwise use env var
  const apiKey = apiKeyInput.trim() || envApiKey;

  // Validate - must have a key from somewhere
  if (apiKey === undefined || apiKey === '') {
    context.onOutput('API key is required. Set ANTHROPIC_API_KEY or enter a key.', 'error');
    return { success: false, message: 'API key required' };
  }

  // Validate format only for manually entered keys
  if (apiKeyInput.trim() !== '' && !apiKeyInput.startsWith('sk-ant-')) {
    context.onOutput('Invalid API key format. Expected key starting with "sk-ant-"', 'error');
    return { success: false, message: 'Invalid API key format' };
  }

  // Prompt for model with default
  const modelInput = await context.onPrompt(`Model (default: ${DEFAULT_ANTHROPIC_MODEL}):`);
  const model = modelInput.trim() || DEFAULT_ANTHROPIC_MODEL;

  context.onOutput('\nConfiguration ready', 'success');

  // Only include apiKey in config if manually entered (env var will be used at runtime)
  const config: Record<string, unknown> = { model };
  if (apiKeyInput.trim() !== '') {
    config.apiKey = apiKey;
  }

  return {
    success: true,
    config,
    message: 'Anthropic configured successfully',
  };
}
