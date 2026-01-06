/**
 * Unit tests for system prompt utilities.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { getDefaultConfig } from '../../config/schema.js';
import type { AppConfig } from '../../config/schema.js';

// Create mock functions that we can reference
const mockReadFile = jest.fn<(path: string, encoding: BufferEncoding) => Promise<string>>();
const mockAccess = jest.fn<(path: string, mode?: number) => Promise<void>>();
const mockReaddir = jest.fn<() => Promise<never[]>>();
const mockStat = jest.fn<() => Promise<{ isDirectory: () => boolean }>>();
const mockRealpath = jest.fn<(path: string) => Promise<string>>();
const mockMkdir = jest.fn<() => Promise<void>>();
const mockRm = jest.fn<() => Promise<void>>();
const mockRename = jest.fn<() => Promise<void>>();

// Mock fs/promises BEFORE any imports that use it
// Note: mockReaddir, mockStat, mockRealpath, mockMkdir, mockRm, mockRename are required because
// the skills module imports from node:fs/promises, and Jest's module mocking requires all exports
// to be present. These tests focus on prompt loading which doesn't exercise these functions
// directly - they return empty/failing results which is the expected behavior for the prompt tests.
jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: mockReadFile,
  access: mockAccess,
  readdir: mockReaddir,
  stat: mockStat,
  realpath: mockRealpath,
  mkdir: mockMkdir,
  rm: mockRm,
  rename: mockRename,
  constants: { R_OK: 4 },
}));

// Mock os for homedir - must return string directly
jest.unstable_mockModule('node:os', () => ({
  homedir: () => '/home/testuser',
}));

// Create mock functions for environment module
const mockDetectEnvironment = jest.fn();
const mockFormatEnvironmentSection = jest.fn();

// Mock environment module to avoid git commands in tests
jest.unstable_mockModule('../environment.js', () => ({
  detectEnvironment: mockDetectEnvironment,
  formatEnvironmentSection: mockFormatEnvironmentSection,
}));

// Import after mocks are set up
const {
  loadSystemPrompt,
  replacePlaceholders,
  stripYamlFrontMatter,
  loadBasePrompt,
  loadProviderLayer,
  assembleSystemPrompt,
} = await import('../prompts.js');

describe('prompts', () => {
  let config: AppConfig;

  beforeEach(() => {
    config = getDefaultConfig();
    config.providers.openai = { apiKey: 'test-key', model: 'gpt-4o' };
    config.providers.default = 'openai';
    jest.clearAllMocks();

    // Reset environment mocks with default values
    mockDetectEnvironment.mockResolvedValue({
      workingDir: '/test/working/dir',
      gitRepo: true,
      gitBranch: 'main',
      gitClean: true,
      platform: 'macOS',
      osVersion: 'Darwin 24.1.0',
      date: '2025-12-24',
    });
    mockFormatEnvironmentSection.mockReturnValue(
      '# Environment\n\nWorking directory: /test/working/dir\nGit repository: Yes (branch: main, clean)\nPlatform: macOS (Darwin 24.1.0)\nDate: 2025-12-24'
    );
  });

  describe('stripYamlFrontMatter', () => {
    it('strips YAML front matter from content', () => {
      const content = `---
name: test
version: 1.0.0
---
This is the main content.`;

      const result = stripYamlFrontMatter(content);
      expect(result).toBe('This is the main content.');
    });

    it('returns original content if no front matter', () => {
      const content = 'This is plain content without front matter.';
      const result = stripYamlFrontMatter(content);
      expect(result).toBe(content);
    });

    it('handles content with only opening delimiter', () => {
      const content = '---\nname: test\nThis has no closing delimiter.';
      const result = stripYamlFrontMatter(content);
      expect(result).toBe(content);
    });

    it('handles whitespace before front matter', () => {
      const content = `   ---
name: test
---
Content here.`;

      const result = stripYamlFrontMatter(content);
      expect(result).toBe('Content here.');
    });

    it('handles empty content after front matter', () => {
      const content = `---
name: test
---`;

      const result = stripYamlFrontMatter(content);
      expect(result).toBe('');
    });

    it('does not match --- inside YAML values', () => {
      const content = `---
name: test
description: "contains --- separator --- in value"
---
Actual content here.`;

      const result = stripYamlFrontMatter(content);
      expect(result).toBe('Actual content here.');
    });

    it('requires opening delimiter to be on its own line', () => {
      const content = '---something\nname: test\n---\nContent';
      const result = stripYamlFrontMatter(content);
      // Should return original since opening --- is not on its own line
      expect(result).toBe(content);
    });
  });

  describe('replacePlaceholders', () => {
    it('replaces all placeholder types', () => {
      const content =
        'Model: {{MODEL}}, Provider: {{PROVIDER}}, Dir: {{DATA_DIR}}, Memory: {{MEMORY_ENABLED}}';

      const result = replacePlaceholders(content, {
        MODEL: 'gpt-4o',
        PROVIDER: 'openai',
        DATA_DIR: '/data',
        MEMORY_ENABLED: 'true',
      });

      expect(result).toBe('Model: gpt-4o, Provider: openai, Dir: /data, Memory: true');
    });

    it('replaces multiple occurrences of same placeholder', () => {
      const content = '{{MODEL}} is the best. I love {{MODEL}}!';

      const result = replacePlaceholders(content, {
        MODEL: 'gpt-4o',
        PROVIDER: 'openai',
        DATA_DIR: '/data',
        MEMORY_ENABLED: 'false',
      });

      expect(result).toBe('gpt-4o is the best. I love gpt-4o!');
    });

    it('leaves unknown placeholders unchanged', () => {
      const content = '{{MODEL}} and {{UNKNOWN}}';

      const result = replacePlaceholders(content, {
        MODEL: 'gpt-4o',
        PROVIDER: 'openai',
        DATA_DIR: '/data',
        MEMORY_ENABLED: 'true',
      });

      expect(result).toBe('gpt-4o and {{UNKNOWN}}');
    });

    it('handles empty content', () => {
      const result = replacePlaceholders('', {
        MODEL: 'gpt-4o',
        PROVIDER: 'openai',
        DATA_DIR: '/data',
        MEMORY_ENABLED: 'true',
      });

      expect(result).toBe('');
    });

    it('handles undefined values in placeholder values', () => {
      const content = '{{MODEL}} {{SESSION_DIR}}';

      const result = replacePlaceholders(content, {
        MODEL: 'gpt-4o',
        PROVIDER: 'openai',
        DATA_DIR: '/data',
        MEMORY_ENABLED: 'true',
        SESSION_DIR: undefined,
      });

      expect(result).toBe('gpt-4o {{SESSION_DIR}}');
    });
  });

  describe('loadSystemPrompt', () => {
    it('loads from config.agent.systemPromptFile first', async () => {
      config.agent.systemPromptFile = '/custom/prompt.md';
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('---\nname: custom\n---\nCustom prompt for {{MODEL}}');

      const result = await loadSystemPrompt({
        config,
        model: 'gpt-4o',
        provider: 'openai',
      });

      expect(result).toBe('Custom prompt for gpt-4o');
      expect(mockReadFile).toHaveBeenCalledWith('/custom/prompt.md', 'utf-8');
    });

    it('falls back to user default when config path not found', async () => {
      config.agent.systemPromptFile = '/nonexistent/prompt.md';

      // First call (config path) fails, second call (user path) succeeds
      mockAccess.mockRejectedValueOnce(new Error('ENOENT')).mockResolvedValueOnce(undefined);

      mockReadFile.mockResolvedValue('User default prompt for {{MODEL}}');

      const result = await loadSystemPrompt({
        config,
        model: 'gpt-4o',
        provider: 'openai',
      });

      expect(result).toBe('User default prompt for gpt-4o');
      expect(mockReadFile).toHaveBeenCalledWith('/home/testuser/.agent/system.md', 'utf-8');
    });

    it('falls back to package default when user path not found', async () => {
      // No config.agent.systemPromptFile set, so only user and package paths checked
      // User path fails, package path succeeds
      mockAccess
        .mockRejectedValueOnce(new Error('ENOENT')) // user path
        .mockResolvedValueOnce(undefined); // package path

      mockReadFile.mockResolvedValue('---\nname: default\n---\nPackage default for {{MODEL}}');

      const result = await loadSystemPrompt({
        config,
        model: 'gpt-4o',
        provider: 'openai',
      });

      expect(result).toBe('Package default for gpt-4o');
    });

    it('uses inline default when all files fail', async () => {
      // All file access fails
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await loadSystemPrompt({
        config,
        model: 'gpt-4o',
        provider: 'openai',
      });

      // Should get inline default
      expect(result).toContain('gpt-4o');
      expect(result).toContain('openai');
    });

    it('replaces all placeholders in loaded prompt', async () => {
      config.agent.systemPromptFile = '/test/prompt.md';
      config.agent.dataDir = '/my/data';
      config.memory.enabled = true;

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(
        'Model: {{MODEL}}, Provider: {{PROVIDER}}, Data: {{DATA_DIR}}, Memory: {{MEMORY_ENABLED}}'
      );

      const result = await loadSystemPrompt({
        config,
        model: 'gpt-4o',
        provider: 'openai',
      });

      expect(result).toBe('Model: gpt-4o, Provider: openai, Data: /my/data, Memory: enabled');
    });

    it('strips YAML front matter from loaded prompt', async () => {
      config.agent.systemPromptFile = '/test/prompt.md';

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(`---
name: test-prompt
version: 1.0.0
---

Hello {{MODEL}}!`);

      const result = await loadSystemPrompt({
        config,
        model: 'gpt-4o',
        provider: 'openai',
      });

      expect(result).toBe('Hello gpt-4o!');
      expect(result).not.toContain('name:');
      expect(result).not.toContain('version:');
    });

    it('emits warning when configured prompt file does not exist', async () => {
      const onDebug = jest.fn<(message: string, data?: Record<string, unknown>) => void>();
      config.agent.systemPromptFile = '/nonexistent/custom-prompt.md';

      // Config path fails, user path succeeds
      mockAccess.mockRejectedValueOnce(new Error('ENOENT')).mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValue('User fallback prompt');

      await loadSystemPrompt({
        config,
        model: 'gpt-4o',
        provider: 'openai',
        onDebug,
      });

      expect(onDebug).toHaveBeenCalledWith(
        'Configured system prompt file not found at path "/nonexistent/custom-prompt.md". Falling back to default prompts.',
        { configPath: '/nonexistent/custom-prompt.md', fallbackTier: 'user-default' }
      );
    });
  });

  describe('loadBasePrompt', () => {
    it('loads base prompt and replaces placeholders', async () => {
      // base.md exists
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValue('---\nname: base\n---\nYou are {{MODEL}} via {{PROVIDER}}.');

      const result = await loadBasePrompt({
        config,
        model: 'gpt-4o',
        provider: 'openai',
      });

      expect(result).toBe('You are gpt-4o via openai.');
    });

    it('falls back to inline default when no files exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await loadBasePrompt({
        config,
        model: 'claude-3-opus',
        provider: 'anthropic',
      });

      expect(result).toContain('claude-3-opus');
      expect(result).toContain('anthropic');
    });

    it('loads from config.agent.systemPromptFile first (tier 1)', async () => {
      config.agent.systemPromptFile = '/custom/base-prompt.md';
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('---\nname: custom\n---\nCustom base for {{MODEL}}');

      const result = await loadBasePrompt({
        config,
        model: 'gpt-4o',
        provider: 'openai',
      });

      expect(result).toBe('Custom base for gpt-4o');
      expect(mockReadFile).toHaveBeenCalledWith('/custom/base-prompt.md', 'utf-8');
    });

    it('falls back to user default when config path not found (tier 2)', async () => {
      config.agent.systemPromptFile = '/nonexistent/prompt.md';

      // First call (config path) fails, second call (user path) succeeds
      mockAccess.mockRejectedValueOnce(new Error('ENOENT')).mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValue('User base prompt for {{MODEL}}');

      const result = await loadBasePrompt({
        config,
        model: 'gpt-4o',
        provider: 'openai',
      });

      expect(result).toBe('User base prompt for gpt-4o');
      expect(mockReadFile).toHaveBeenCalledWith('/home/testuser/.agent/system.md', 'utf-8');
    });

    it('falls back to package default when user path not found (tier 3)', async () => {
      // No systemPromptFile set, user path fails, package path succeeds
      mockAccess
        .mockRejectedValueOnce(new Error('ENOENT')) // user path
        .mockResolvedValueOnce(undefined); // package base.md

      mockReadFile.mockResolvedValue('---\nname: default\n---\nPackage base for {{MODEL}}');

      const result = await loadBasePrompt({
        config,
        model: 'gpt-4o',
        provider: 'openai',
      });

      expect(result).toBe('Package base for gpt-4o');
    });

    it('emits warning when configured prompt file does not exist', async () => {
      const onDebug = jest.fn<(message: string, data?: Record<string, unknown>) => void>();
      config.agent.systemPromptFile = '/nonexistent/custom-prompt.md';

      // Config path fails, user path succeeds
      mockAccess.mockRejectedValueOnce(new Error('ENOENT')).mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValue('User fallback prompt');

      await loadBasePrompt({
        config,
        model: 'gpt-4o',
        provider: 'openai',
        onDebug,
      });

      expect(onDebug).toHaveBeenCalledWith(
        'Configured system prompt file not found at path "/nonexistent/custom-prompt.md". Falling back to default prompts.',
        { configPath: '/nonexistent/custom-prompt.md', fallbackTier: 'user-default' }
      );
    });
  });

  describe('loadProviderLayer', () => {
    it('loads provider layer when file exists', async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValue(
        '---\nprovider: anthropic\n---\n# Claude Guidelines\nUse XML.'
      );

      const result = await loadProviderLayer('anthropic');

      expect(result).toBe('# Claude Guidelines\nUse XML.');
    });

    it('returns empty string when provider layer not found', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await loadProviderLayer('unknown-provider');

      expect(result).toBe('');
    });

    it('loads mode-specific provider file when mode is provided', async () => {
      // Mode-specific file exists (foundry.local.md)
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValue(
        '---\nprovider: foundry\nmode: local\n---\n# Local Foundry Instructions\nUse local endpoint.'
      );

      const result = await loadProviderLayer('foundry', 'local');

      expect(result).toBe('# Local Foundry Instructions\nUse local endpoint.');
    });

    it('falls back to generic provider file when mode-specific file does not exist', async () => {
      // Mode-specific file (foundry.cloud.md) does not exist
      mockAccess
        .mockRejectedValueOnce(new Error('ENOENT')) // foundry.cloud.md not found
        .mockResolvedValueOnce(undefined); // foundry.md exists

      mockReadFile.mockResolvedValue(
        '---\nprovider: foundry\n---\n# Generic Foundry Instructions\nFoundry provider guidance.'
      );

      const result = await loadProviderLayer('foundry', 'cloud');

      expect(result).toBe('# Generic Foundry Instructions\nFoundry provider guidance.');
    });

    it('returns empty string when both mode-specific and generic files do not exist', async () => {
      // Both files do not exist
      mockAccess
        .mockRejectedValueOnce(new Error('ENOENT')) // foundry.local.md not found
        .mockRejectedValueOnce(new Error('ENOENT')); // foundry.md not found

      const result = await loadProviderLayer('foundry', 'local');

      expect(result).toBe('');
    });

    it('loads generic provider file when mode is undefined', async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValue(
        '---\nprovider: foundry\n---\n# Generic Foundry Instructions\nNo mode specified.'
      );

      const result = await loadProviderLayer('foundry', undefined);

      expect(result).toBe('# Generic Foundry Instructions\nNo mode specified.');
    });

    it('loads generic provider file when mode is empty string', async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValue(
        '---\nprovider: foundry\n---\n# Generic Foundry Instructions\nEmpty mode.'
      );

      const result = await loadProviderLayer('foundry', '');

      expect(result).toBe('# Generic Foundry Instructions\nEmpty mode.');
    });

    it('strips YAML front matter from mode-specific provider layer', async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValue(`---
provider: foundry
mode: local
version: 2.0.0
---

# Mode-Specific Provider Layer
This is mode-specific guidance.`);

      const result = await loadProviderLayer('foundry', 'local');

      expect(result).toBe('# Mode-Specific Provider Layer\nThis is mode-specific guidance.');
      expect(result).not.toContain('provider:');
      expect(result).not.toContain('mode:');
      expect(result).not.toContain('version:');
    });
  });

  describe('assembleSystemPrompt', () => {
    it('assembles prompt with all layers', async () => {
      // base.md exists
      mockAccess.mockImplementation((path) => {
        if (path.includes('base.md') || path.includes('anthropic.md')) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error('ENOENT'));
      });

      mockReadFile.mockImplementation((path) => {
        if (path.includes('base.md')) {
          return Promise.resolve('Base prompt for {{MODEL}}.');
        }
        if (path.includes('anthropic.md')) {
          return Promise.resolve('---\nprovider: anthropic\n---\nClaude specific.');
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await assembleSystemPrompt({
        config,
        model: 'claude-3-opus',
        provider: 'anthropic',
        includeEnvironment: true,
        includeProviderLayer: true,
      });

      expect(result).toContain('Base prompt for claude-3-opus.');
      expect(result).toContain('Claude specific.');
      expect(result).toContain('# Environment');
    });

    it('skips provider layer when includeProviderLayer is false', async () => {
      mockAccess.mockImplementation((path) => {
        if (path.includes('base.md')) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error('ENOENT'));
      });

      mockReadFile.mockResolvedValue('Base only.');

      const result = await assembleSystemPrompt({
        config,
        model: 'gpt-4o',
        provider: 'openai',
        includeEnvironment: false,
        includeProviderLayer: false,
      });

      expect(result).toBe('Base only.');
      expect(result).not.toContain('# Environment');
    });

    it('skips environment when includeEnvironment is false', async () => {
      mockAccess.mockImplementation((path) => {
        if (path.includes('base.md')) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error('ENOENT'));
      });

      mockReadFile.mockResolvedValue('Base prompt.');

      const result = await assembleSystemPrompt({
        config,
        model: 'gpt-4o',
        provider: 'openai',
        includeEnvironment: false,
        includeProviderLayer: false,
      });

      expect(result).not.toContain('Environment');
      expect(result).not.toContain('Working directory');
    });

    it('adds user override when provided', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await assembleSystemPrompt({
        config,
        model: 'gpt-4o',
        provider: 'openai',
        includeEnvironment: false,
        includeProviderLayer: false,
        userOverride: 'My custom instructions.',
      });

      expect(result).toContain('# User Instructions');
      expect(result).toContain('My custom instructions.');
    });

    it('calls onDebug callback during assembly', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const debugMessages: string[] = [];
      const onDebug = (msg: string): void => {
        debugMessages.push(msg);
      };

      await assembleSystemPrompt({
        config,
        model: 'gpt-4o',
        provider: 'openai',
        includeEnvironment: true,
        includeProviderLayer: true,
        onDebug,
      });

      expect(debugMessages).toContain('Loaded base prompt');
      expect(debugMessages.some((m) => m.includes('environment'))).toBe(true);
    });
  });
});
