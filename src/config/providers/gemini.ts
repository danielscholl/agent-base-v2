/**
 * Google Gemini provider setup wizard.
 */

import type { CommandContext } from '../../cli/commands/types.js';
import type { ProviderSetupResult } from './index.js';
import { DEFAULT_GEMINI_MODEL } from '../constants.js';

/**
 * Interactive setup wizard for Google Gemini provider.
 * Prompts for API key and model.
 */
export async function setupGemini(context: CommandContext): Promise<ProviderSetupResult> {
  context.onOutput('\nGoogle Gemini Setup', 'success');
  context.onOutput('─────────────────────', 'info');
  context.onOutput('Get your API key from: https://aistudio.google.com/apikey\n', 'info');

  if (!context.onPrompt) {
    return { success: false, message: 'Interactive prompts not available' };
  }

  // Prompt for API key
  const apiKey = await context.onPrompt('Gemini API Key (AIzaSy...):');

  if (!apiKey || !apiKey.startsWith('AIzaSy')) {
    context.onOutput('Invalid API key format. Expected key starting with "AIzaSy"', 'error');
    return { success: false, message: 'Invalid API key format' };
  }

  // Prompt for model with default
  const modelInput = await context.onPrompt(`Model (default: ${DEFAULT_GEMINI_MODEL}):`);
  const model = modelInput.trim() || DEFAULT_GEMINI_MODEL;

  context.onOutput('\nConfiguration ready', 'success');

  return {
    success: true,
    config: { apiKey, model },
    message: 'Gemini configured successfully',
  };
}
