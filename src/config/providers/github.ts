/**
 * GitHub Models provider setup wizard.
 */

import type { CommandContext } from '../../cli/commands/types.js';
import type { ProviderSetupResult } from './index.js';
import { DEFAULT_GITHUB_MODEL, DEFAULT_GITHUB_ENDPOINT } from '../constants.js';

/**
 * Interactive setup wizard for GitHub Models provider.
 * Prompts for GitHub token and model.
 */
export async function setupGitHub(context: CommandContext): Promise<ProviderSetupResult> {
  context.onOutput('\nGitHub Models Setup', 'success');
  context.onOutput('─────────────────────', 'info');
  context.onOutput('Generate a token at: https://github.com/settings/tokens', 'info');
  context.onOutput('Required scope: models:read\n', 'info');

  if (!context.onPrompt) {
    return { success: false, message: 'Interactive prompts not available' };
  }

  // Prompt for GitHub token
  const token = await context.onPrompt('GitHub Token (ghp_... or github_pat_...):');

  if (!token || (!token.startsWith('ghp_') && !token.startsWith('github_pat_'))) {
    context.onOutput('Invalid token format. Expected "ghp_" or "github_pat_" prefix.', 'error');
    return { success: false, message: 'Invalid token format' };
  }

  // Prompt for model with default
  const modelInput = await context.onPrompt(`Model (default: ${DEFAULT_GITHUB_MODEL}):`);
  const model = modelInput.trim() || DEFAULT_GITHUB_MODEL;

  // Prompt for optional org
  const org = await context.onPrompt('GitHub Organization (optional, press Enter to skip):');

  context.onOutput('\nConfiguration ready', 'success');

  return {
    success: true,
    config: {
      token,
      model,
      endpoint: DEFAULT_GITHUB_ENDPOINT,
      org: org || undefined,
    },
    message: 'GitHub Models configured successfully',
  };
}
