/**
 * Local provider setup wizard.
 * Supports Ollama, Docker Model Runner, and other OpenAI-compatible servers.
 */

import type { CommandContext } from '../../cli/commands/types.js';
import type { ProviderSetupResult } from './index.js';

/**
 * Backend configurations for local LLM servers.
 */
const LOCAL_BACKENDS = [
  {
    name: 'ollama',
    displayName: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen3-coder:latest',
    description: 'Popular local LLM runner',
    note: 'Ensure Ollama is running: ollama serve',
  },
  {
    name: 'docker',
    displayName: 'Docker Model Runner',
    baseUrl: 'http://localhost:12434/engines/llama.cpp/v1',
    defaultModel: 'ai/phi4',
    description: 'Docker Desktop AI models',
    note: 'Enable with: docker desktop enable model-runner --tcp=12434',
  },
  {
    name: 'lmstudio',
    displayName: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    description: 'GUI-based local LLM app',
    note: 'Start server in LM Studio before using',
  },
  {
    name: 'custom',
    displayName: 'Custom Server',
    baseUrl: '',
    defaultModel: '',
    description: 'Any OpenAI-compatible server',
    note: 'Enter your own endpoint URL',
  },
] as const;

/**
 * Interactive setup wizard for Local provider.
 * Lets users select from common backends.
 */
export async function setupLocal(context: CommandContext): Promise<ProviderSetupResult> {
  context.onOutput('\nLocal Provider Setup', 'success');
  context.onOutput('─────────────────────\n', 'info');

  if (!context.onPrompt) {
    return { success: false, message: 'Interactive prompts not available' };
  }

  // Show backend options
  context.onOutput('Select your local LLM backend:\n', 'info');
  for (let i = 0; i < LOCAL_BACKENDS.length; i++) {
    const backend = LOCAL_BACKENDS[i];
    if (backend) {
      context.onOutput(
        `  ${String(i + 1)}. ${backend.displayName.padEnd(20)} ${backend.description}`,
        'info'
      );
    }
  }
  context.onOutput('', 'info');

  // Get backend choice
  const choice = await context.onPrompt('Select backend (1-4):');
  const backendIndex = parseInt(choice, 10) - 1;

  if (isNaN(backendIndex) || backendIndex < 0 || backendIndex >= LOCAL_BACKENDS.length) {
    context.onOutput('Invalid selection.', 'error');
    return { success: false, message: 'Invalid backend selection' };
  }

  // Bounds check above guarantees valid index
  const selectedBackend = LOCAL_BACKENDS[backendIndex] as (typeof LOCAL_BACKENDS)[number];

  context.onOutput(`\nConfiguring ${selectedBackend.displayName}...`, 'success');

  let baseUrl: string;
  let model: string;

  if (selectedBackend.name === 'custom') {
    // Custom backend - prompt for URL
    const urlInput = await context.onPrompt('Enter base URL (e.g., http://localhost:8080/v1):');
    baseUrl = urlInput.trim();
    if (baseUrl === '') {
      context.onOutput('Base URL is required for custom backend.', 'error');
      return { success: false, message: 'Base URL required' };
    }

    const modelInput = await context.onPrompt('Enter model name:');
    model = modelInput.trim();
    if (model === '') {
      context.onOutput('Model name is required.', 'error');
      return { success: false, message: 'Model name required' };
    }
  } else {
    // Pre-configured backend
    baseUrl = selectedBackend.baseUrl;
    context.onOutput(`  Endpoint: ${baseUrl}`, 'info');

    // Prompt for model with default
    const modelInput = await context.onPrompt(
      `Model name (default: ${selectedBackend.defaultModel}):`
    );
    model = modelInput.trim() || selectedBackend.defaultModel;
  }

  context.onOutput('\n✓ Configuration ready', 'success');
  context.onOutput(`  Backend: ${selectedBackend.displayName}`, 'info');
  context.onOutput(`  Endpoint: ${baseUrl}`, 'info');
  context.onOutput(`  Model: ${model}`, 'info');

  context.onOutput(`\nNote: ${selectedBackend.note}`, 'warning');

  return {
    success: true,
    config: { baseUrl, model },
    message: 'Local provider configured successfully',
  };
}
