/**
 * Unit tests for GitHub provider factory.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock @langchain/openai before importing
interface MockOpenAIConfig {
  model: string;
  openAIApiKey?: string;
  configuration?: { baseURL?: string };
}

const mockChatOpenAI = jest
  .fn<(config: MockOpenAIConfig) => { model: string; _type: string }>()
  .mockImplementation((config) => ({
    model: config.model,
    _type: 'chat_model',
  }));

jest.unstable_mockModule('@langchain/openai', () => ({
  ChatOpenAI: mockChatOpenAI,
}));

// Mock child_process to prevent gh CLI fallback in tests
const mockSpawnSync = jest.fn().mockReturnValue({
  status: 1, // Non-zero exit code means no token
  stdout: '',
  stderr: 'not logged in',
});

jest.unstable_mockModule('node:child_process', () => ({
  spawnSync: mockSpawnSync,
}));

// Import after mocking
const { createGitHubClient } = await import('../providers/github.js');

describe('createGitHubClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('success cases', () => {
    it('creates ChatOpenAI with token and default model', async () => {
      const result = await createGitHubClient({
        token: 'ghp_xxxxxxxxxxxx',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBeDefined();
        expect(result.message).toContain('gpt-4o');
      }
    });

    it('creates ChatOpenAI with custom model', async () => {
      const result = await createGitHubClient({
        token: 'ghp_xxxxxxxxxxxx',
        model: 'gpt-4o-mini',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('gpt-4o-mini');
      }
    });

    it('creates ChatOpenAI with custom endpoint', async () => {
      const result = await createGitHubClient({
        token: 'ghp_xxxxxxxxxxxx',
        endpoint: 'https://custom.models.example.com/inference',
      });

      expect(result.success).toBe(true);
      expect(mockChatOpenAI).toHaveBeenCalledWith({
        model: 'gpt-4o',
        openAIApiKey: 'ghp_xxxxxxxxxxxx',
        configuration: { baseURL: 'https://custom.models.example.com/inference' },
      });
    });

    it('creates ChatOpenAI with org parameter', async () => {
      const result = await createGitHubClient({
        token: 'ghp_xxxxxxxxxxxx',
        org: 'my-organization',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('gpt-4o');
        expect(result.message).toContain('org: my-organization');
      }
      expect(mockChatOpenAI).toHaveBeenCalledWith({
        model: 'gpt-4o',
        openAIApiKey: 'ghp_xxxxxxxxxxxx',
        configuration: { baseURL: 'https://models.github.ai/orgs/my-organization/inference' },
      });
    });

    it('handles Record<string, unknown> config type', async () => {
      const config: Record<string, unknown> = {
        token: 'ghp_xxxxxxxxxxxx',
        model: 'gpt-4o-mini',
      };

      const result = await createGitHubClient(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('gpt-4o-mini');
      }
    });

    it('uses default model when model is undefined', async () => {
      const config: Record<string, unknown> = {
        token: 'ghp_xxxxxxxxxxxx',
      };

      const result = await createGitHubClient(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('gpt-4o');
      }
      expect(mockChatOpenAI).toHaveBeenCalledWith({
        model: 'gpt-4o',
        openAIApiKey: 'ghp_xxxxxxxxxxxx',
        configuration: { baseURL: 'https://models.github.ai/inference' },
      });
    });

    it('uses default endpoint when endpoint is undefined', async () => {
      const result = await createGitHubClient({
        token: 'ghp_xxxxxxxxxxxx',
      });

      expect(result.success).toBe(true);
      expect(mockChatOpenAI).toHaveBeenCalledWith({
        model: 'gpt-4o',
        openAIApiKey: 'ghp_xxxxxxxxxxxx',
        configuration: { baseURL: 'https://models.github.ai/inference' },
      });
    });
  });

  describe('gh CLI fallback', () => {
    it('uses token from gh CLI when no token provided', async () => {
      // Mock spawnSync calls in order:
      // 1. getGitHubCLIOrg() - return no org (empty)
      // 2. getGitHubCLIToken() - return token
      mockSpawnSync
        .mockReturnValueOnce({
          status: 0,
          stdout: '', // No org
          stderr: '',
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'gho_cli_token_12345\n',
          stderr: '',
        });

      const result = await createGitHubClient({
        model: 'gpt-4o',
      });

      expect(result.success).toBe(true);
      expect(mockSpawnSync).toHaveBeenCalledWith('gh', ['auth', 'token'], expect.any(Object));
      expect(mockChatOpenAI).toHaveBeenCalledWith({
        model: 'gpt-4o',
        openAIApiKey: 'gho_cli_token_12345',
        configuration: { baseURL: 'https://models.github.ai/inference' },
      });
    });

    it('uses org from gh CLI and constructs org-specific endpoint', async () => {
      // Mock spawnSync calls in order:
      // 1. getGitHubCLIOrg() - return org
      // 2. getGitHubCLIToken() - return token
      mockSpawnSync
        .mockReturnValueOnce({
          status: 0,
          stdout: 'myorg\n', // Org detected
          stderr: '',
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'gho_cli_token_12345\n',
          stderr: '',
        });

      const result = await createGitHubClient({
        model: 'gpt-4o',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('gpt-4o');
        expect(result.message).toContain('org: myorg');
      }
      expect(mockChatOpenAI).toHaveBeenCalledWith({
        model: 'gpt-4o',
        openAIApiKey: 'gho_cli_token_12345',
        configuration: { baseURL: 'https://models.github.ai/orgs/myorg/inference' },
      });
    });
  });

  describe('validation errors', () => {
    it('returns error when token is missing and gh CLI not logged in', async () => {
      const result = await createGitHubClient({
        model: 'gpt-4o',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
        expect(result.message).toContain('GitHub Models requires authentication');
      }
    });

    it('returns error when token is empty string and gh CLI not logged in', async () => {
      const result = await createGitHubClient({
        token: '',
        model: 'gpt-4o',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
        expect(result.message).toContain('GitHub Models requires authentication');
      }
    });

    it('returns error when token is undefined in Record config', async () => {
      const config: Record<string, unknown> = {
        model: 'gpt-4o',
      };

      const result = await createGitHubClient(config);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
      }
    });
  });

  describe('constructor errors', () => {
    it('returns error when ChatOpenAI constructor throws', async () => {
      mockChatOpenAI.mockImplementationOnce(() => {
        throw new Error('Invalid API key provided');
      });

      const result = await createGitHubClient({
        token: 'ghp_invalid',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('AUTHENTICATION_ERROR');
        expect(result.message).toBe('Invalid API key provided');
      }
    });

    it('handles non-Error thrown objects', async () => {
      mockChatOpenAI.mockImplementationOnce(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'string error';
      });

      const result = await createGitHubClient({
        token: 'ghp_xxxxxxxxxxxx',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toBe('Failed to create GitHub client');
      }
    });
  });

  describe('edge cases', () => {
    it('treats empty string org as no org', async () => {
      const result = await createGitHubClient({
        token: 'ghp_xxxxxxxxxxxx',
        org: '',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).not.toContain('org:');
      }
      expect(mockChatOpenAI).toHaveBeenCalledWith({
        model: 'gpt-4o',
        openAIApiKey: 'ghp_xxxxxxxxxxxx',
        configuration: { baseURL: 'https://models.github.ai/inference' },
      });
    });

    it('treats empty string endpoint as unset and uses default', async () => {
      const result = await createGitHubClient({
        token: 'ghp_xxxxxxxxxxxx',
        endpoint: '',
      });

      expect(result.success).toBe(true);
      expect(mockChatOpenAI).toHaveBeenCalledWith({
        model: 'gpt-4o',
        openAIApiKey: 'ghp_xxxxxxxxxxxx',
        configuration: { baseURL: 'https://models.github.ai/inference' },
      });
    });

    it('treats empty string model as unset and uses default', async () => {
      const result = await createGitHubClient({
        token: 'ghp_xxxxxxxxxxxx',
        model: '',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('gpt-4o');
      }
      expect(mockChatOpenAI).toHaveBeenCalledWith({
        model: 'gpt-4o',
        openAIApiKey: 'ghp_xxxxxxxxxxxx',
        configuration: { baseURL: 'https://models.github.ai/inference' },
      });
    });

    it('modifies custom endpoint correctly with org parameter', async () => {
      const result = await createGitHubClient({
        token: 'ghp_xxxxxxxxxxxx',
        endpoint: 'https://custom.example.com/v1',
        org: 'my-org',
      });

      expect(result.success).toBe(true);
      expect(mockChatOpenAI).toHaveBeenCalledWith({
        model: 'gpt-4o',
        openAIApiKey: 'ghp_xxxxxxxxxxxx',
        configuration: { baseURL: 'https://custom.example.com/orgs/my-org/inference' },
      });
    });

    it('passes correct parameters with all options', async () => {
      await createGitHubClient({
        token: 'ghp_xxxxxxxxxxxx',
        model: 'DeepSeek-R1',
        endpoint: 'https://models.github.ai/inference',
        org: 'enterprise-org',
      });

      expect(mockChatOpenAI).toHaveBeenCalledWith({
        model: 'DeepSeek-R1',
        openAIApiKey: 'ghp_xxxxxxxxxxxx',
        configuration: { baseURL: 'https://models.github.ai/orgs/enterprise-org/inference' },
      });
    });
  });
});
