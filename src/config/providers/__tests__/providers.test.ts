/**
 * Tests for provider setup wizards.
 */

import { describe, it, expect } from '@jest/globals';
import type { CommandContext } from '../../../cli/commands/types.js';

interface OutputEntry {
  content: string;
  type?: string;
}

function createMockContext(promptResponses: string[] = []): CommandContext & {
  outputs: OutputEntry[];
  promptCalls: string[];
} {
  const outputs: OutputEntry[] = [];
  const promptCalls: string[] = [];
  let promptIndex = 0;

  return {
    config: null,
    onOutput: (content: string, type?: string) => {
      outputs.push({ content, type });
    },
    onPrompt: (question: string) => {
      promptCalls.push(question);
      return Promise.resolve(promptResponses[promptIndex++] ?? '');
    },
    exit: () => {
      // noop
    },
    outputs,
    promptCalls,
  };
}

function createNonInteractiveContext(): CommandContext & { outputs: OutputEntry[] } {
  const outputs: OutputEntry[] = [];
  return {
    config: null,
    onOutput: (content: string, type?: string) => {
      outputs.push({ content, type });
    },
    exit: () => {},
    outputs,
  };
}

describe('Provider Setup Wizards', () => {
  describe('setupOpenAI', () => {
    it('requires interactive mode', async () => {
      const { setupOpenAI } = await import('../openai.js');
      const context = createNonInteractiveContext();
      const result = await setupOpenAI(context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Interactive prompts not available');
    });

    it('validates API key format', async () => {
      const { setupOpenAI } = await import('../openai.js');
      const context = createMockContext(['invalid-key']);
      const result = await setupOpenAI(context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid API key format');
      expect(
        context.outputs.some((o) => o.content.includes('Expected key starting with "sk-"'))
      ).toBe(true);
    });

    it('accepts valid API key and default model', async () => {
      const { setupOpenAI } = await import('../openai.js');
      const context = createMockContext(['sk-test-key-123', '']);
      const result = await setupOpenAI(context);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.config?.apiKey).toBe('sk-test-key-123');
      expect(result.config?.model).toBe('gpt-4o');
    });

    it('accepts custom model', async () => {
      const { setupOpenAI } = await import('../openai.js');
      const context = createMockContext(['sk-test-key-123', 'gpt-4-turbo']);
      const result = await setupOpenAI(context);

      expect(result.success).toBe(true);
      expect(result.config?.model).toBe('gpt-4-turbo');
    });
  });

  describe('setupAnthropic', () => {
    it('requires interactive mode', async () => {
      const { setupAnthropic } = await import('../anthropic.js');
      const context = createNonInteractiveContext();
      const result = await setupAnthropic(context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Interactive prompts not available');
    });

    it('validates API key format', async () => {
      const { setupAnthropic } = await import('../anthropic.js');
      const context = createMockContext(['invalid-key']);
      const result = await setupAnthropic(context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid API key format');
      expect(
        context.outputs.some((o) => o.content.includes('Expected key starting with "sk-ant-"'))
      ).toBe(true);
    });

    it('accepts valid API key', async () => {
      const { setupAnthropic } = await import('../anthropic.js');
      const context = createMockContext(['sk-ant-test-key', '']);
      const result = await setupAnthropic(context);

      expect(result.success).toBe(true);
      expect(result.config?.apiKey).toBe('sk-ant-test-key');
    });
  });

  describe('setupAzure', () => {
    it('requires interactive mode', async () => {
      const { setupAzure } = await import('../azure.js');
      const context = createNonInteractiveContext();
      const result = await setupAzure(context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Interactive prompts not available');
    });

    it('validates endpoint format', async () => {
      const { setupAzure } = await import('../azure.js');
      const context = createMockContext(['https://invalid.azure.com']);
      const result = await setupAzure(context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid endpoint format');
    });

    it('accepts valid configuration', async () => {
      const { setupAzure } = await import('../azure.js');
      const context = createMockContext([
        'https://myresource.openai.azure.com/',
        'my-deployment',
        'azure-api-key',
        '2024-02-01',
      ]);
      const result = await setupAzure(context);

      expect(result.success).toBe(true);
      expect(result.config?.endpoint).toBe('https://myresource.openai.azure.com/');
      expect(result.config?.deployment).toBe('my-deployment');
      expect(result.config?.apiKey).toBe('azure-api-key');
      expect(result.config?.apiVersion).toBe('2024-02-01');
    });

    it('allows Azure CLI auth when API key is empty', async () => {
      const { setupAzure } = await import('../azure.js');
      const context = createMockContext(['https://myresource.openai.azure.com/', '', '', '']);
      const result = await setupAzure(context);

      expect(result.success).toBe(true);
      expect(result.config?.apiKey).toBeUndefined();
      expect(context.outputs.some((o) => o.content.includes('Azure CLI authentication'))).toBe(
        true
      );
    });
  });

  describe('setupFoundry', () => {
    it('requires interactive mode', async () => {
      const { setupFoundry } = await import('../foundry.js');
      const context = createNonInteractiveContext();
      const result = await setupFoundry(context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Interactive prompts not available');
    });

    it('validates endpoint format in cloud mode', async () => {
      const { setupFoundry } = await import('../foundry.js');
      // '2' selects cloud mode, then invalid endpoint
      const context = createMockContext(['2', 'invalid-endpoint']);
      const result = await setupFoundry(context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid project endpoint');
    });

    it('accepts valid cloud configuration', async () => {
      const { setupFoundry } = await import('../foundry.js');
      const context = createMockContext([
        '2', // cloud mode
        'https://myproject.services.ai.azure.com/',
        'test-deployment',
        'foundry-key',
      ]);
      const result = await setupFoundry(context);

      expect(result.success).toBe(true);
      expect(result.config?.projectEndpoint).toBe('https://myproject.services.ai.azure.com/');
    });

    it('accepts local mode configuration', async () => {
      const { setupFoundry } = await import('../foundry.js');
      const context = createMockContext([
        '1', // local mode
        'llama3.2',
      ]);
      const result = await setupFoundry(context);

      expect(result.success).toBe(true);
      expect(result.config?.mode).toBe('local');
      expect(result.config?.modelAlias).toBe('llama3.2');
    });
  });

  describe('setupGemini', () => {
    it('requires interactive mode', async () => {
      const { setupGemini } = await import('../gemini.js');
      const context = createNonInteractiveContext();
      const result = await setupGemini(context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Interactive prompts not available');
    });

    it('validates API key length', async () => {
      const { setupGemini } = await import('../gemini.js');
      const context = createMockContext(['short']);
      const result = await setupGemini(context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid API key format');
    });

    it('accepts valid API key (20+ chars)', async () => {
      const { setupGemini } = await import('../gemini.js');
      // API key must be at least 20 chars
      const context = createMockContext(['AIzaSyAbcdefghij1234567890', '']);
      const result = await setupGemini(context);

      expect(result.success).toBe(true);
      expect(result.config?.apiKey).toBe('AIzaSyAbcdefghij1234567890');
    });
  });

  describe('setupGitHub', () => {
    it('requires interactive mode', async () => {
      const { setupGitHub } = await import('../github.js');
      const context = createNonInteractiveContext();
      const result = await setupGitHub(context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Interactive prompts not available');
    });

    it('validates token format', async () => {
      const { setupGitHub } = await import('../github.js');
      const context = createMockContext(['invalid-token']);
      const result = await setupGitHub(context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid token format');
    });

    it('accepts valid GitHub token', async () => {
      const { setupGitHub } = await import('../github.js');
      const context = createMockContext(['ghp_validtoken123', '']);
      const result = await setupGitHub(context);

      expect(result.success).toBe(true);
      expect(result.config?.token).toBe('ghp_validtoken123');
    });

    it('accepts github_pat format', async () => {
      const { setupGitHub } = await import('../github.js');
      const context = createMockContext(['github_pat_token123', '']);
      const result = await setupGitHub(context);

      expect(result.success).toBe(true);
      expect(result.config?.token).toBe('github_pat_token123');
    });
  });

  describe('setupLocal', () => {
    it('requires interactive mode', async () => {
      const { setupLocal } = await import('../local.js');
      const context = createNonInteractiveContext();
      const result = await setupLocal(context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Interactive prompts not available');
    });

    it('accepts custom base URL', async () => {
      const { setupLocal } = await import('../local.js');
      const context = createMockContext(['http://localhost:11434', 'llama2']);
      const result = await setupLocal(context);

      expect(result.success).toBe(true);
      expect(result.config?.baseUrl).toBe('http://localhost:11434');
      expect(result.config?.model).toBe('llama2');
    });

    it('uses default base URL when not provided', async () => {
      const { setupLocal } = await import('../local.js');
      const context = createMockContext(['', '']);
      const result = await setupLocal(context);

      expect(result.success).toBe(true);
      expect(result.config?.baseUrl).toBeDefined();
      expect(result.config?.model).toBeDefined();
    });

    it('uses default model when not provided', async () => {
      const { setupLocal } = await import('../local.js');
      const context = createMockContext(['http://localhost:11434', '']);
      const result = await setupLocal(context);

      expect(result.success).toBe(true);
      expect(result.config?.model).toBeDefined();
    });
  });

  describe('getProviderWizards', () => {
    it('returns all 7 providers', async () => {
      const { getProviderWizards } = await import('../index.js');
      const wizards = getProviderWizards();

      expect(wizards.length).toBe(7);
      expect(wizards.map((w) => w.name)).toEqual([
        'openai',
        'anthropic',
        'azure',
        'foundry',
        'gemini',
        'github',
        'local',
      ]);
    });

    it('each provider has required fields', async () => {
      const { getProviderWizards } = await import('../index.js');
      const wizards = getProviderWizards();

      for (const wizard of wizards) {
        expect(wizard.name).toBeDefined();
        expect(wizard.displayName).toBeDefined();
        expect(wizard.description).toBeDefined();
        expect(wizard.authMethod).toBeDefined();
        expect(typeof wizard.wizard).toBe('function');
      }
    });
  });
});
