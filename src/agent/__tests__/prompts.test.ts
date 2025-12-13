/**
 * Unit tests for system prompt utilities.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { getDefaultConfig } from '../../config/schema.js';
import type { AppConfig } from '../../config/schema.js';

// Create mock functions that we can reference
const mockReadFile = jest.fn<(path: string, encoding: BufferEncoding) => Promise<string>>();
const mockAccess = jest.fn<(path: string, mode?: number) => Promise<void>>();

// Mock fs/promises BEFORE any imports that use it
jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: mockReadFile,
  access: mockAccess,
  constants: { R_OK: 4 },
}));

// Mock os for homedir - must return string directly
jest.unstable_mockModule('node:os', () => ({
  homedir: () => '/home/testuser',
}));

// Import after mocks are set up
const { loadSystemPrompt, replacePlaceholders, stripYamlFrontMatter } =
  await import('../prompts.js');

describe('prompts', () => {
  let config: AppConfig;

  beforeEach(() => {
    config = getDefaultConfig();
    config.providers.openai = { apiKey: 'test-key', model: 'gpt-4o' };
    config.providers.default = 'openai';
    jest.clearAllMocks();
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
  });
});
