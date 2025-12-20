/**
 * Provider setup wizards.
 * Guided setup flows for each LLM provider.
 */

import type { CommandContext } from '../../cli/commands/types.js';

/**
 * Result of a provider setup wizard.
 */
export interface ProviderSetupResult {
  success: boolean;
  config?: Record<string, unknown>;
  message: string;
}

/**
 * Provider setup wizard function signature.
 */
export type ProviderSetupWizard = (context: CommandContext) => Promise<ProviderSetupResult>;

/**
 * Provider information for display.
 */
export interface ProviderInfo {
  name: string;
  displayName: string;
  description: string;
  authMethod: string;
  wizard: ProviderSetupWizard;
}

// Import all provider wizards
import { setupOpenAI } from './openai.js';
import { setupAnthropic } from './anthropic.js';
import { setupAzure } from './azure.js';
import { setupFoundry } from './foundry.js';
import { setupGemini } from './gemini.js';
import { setupGitHub } from './github.js';
import { setupLocal } from './local.js';

// Re-export individual wizards
export {
  setupOpenAI,
  setupAnthropic,
  setupAzure,
  setupFoundry,
  setupGemini,
  setupGitHub,
  setupLocal,
};

/**
 * Get all available provider wizards.
 */
export function getProviderWizards(): ProviderInfo[] {
  return [
    {
      name: 'openai',
      displayName: 'OpenAI',
      description: 'GPT-4, GPT-4o, o1, and other OpenAI models',
      authMethod: 'API Key',
      wizard: setupOpenAI,
    },
    {
      name: 'anthropic',
      displayName: 'Anthropic',
      description: 'Claude Sonnet, Claude Opus, and Claude Haiku models',
      authMethod: 'API Key',
      wizard: setupAnthropic,
    },
    {
      name: 'azure',
      displayName: 'Azure OpenAI',
      description: 'Azure-hosted OpenAI models with enterprise security',
      authMethod: 'API Key or Azure CLI',
      wizard: setupAzure,
    },
    {
      name: 'foundry',
      displayName: 'Azure AI Foundry',
      description: 'Azure AI managed models (local or cloud)',
      authMethod: 'Azure CLI',
      wizard: setupFoundry,
    },
    {
      name: 'gemini',
      displayName: 'Google Gemini',
      description: 'Gemini Pro and Gemini Flash models',
      authMethod: 'API Key',
      wizard: setupGemini,
    },
    {
      name: 'github',
      displayName: 'GitHub Models',
      description: 'Models via GitHub Copilot infrastructure',
      authMethod: 'GitHub Token',
      wizard: setupGitHub,
    },
    {
      name: 'local',
      displayName: 'Local (Docker)',
      description: 'Local models via Docker Model Runner',
      authMethod: 'None (local)',
      wizard: setupLocal,
    },
  ];
}
