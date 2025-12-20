/**
 * Tests for skill command handlers.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { CommandContext } from '../types.js';
import type { DiscoveredSkill } from '../../../skills/loader.js';

// Mock the SkillLoader
jest.unstable_mockModule('../../../skills/loader.js', () => ({
  SkillLoader: jest.fn().mockImplementation(() => ({
    discover: jest.fn().mockResolvedValue({
      skills: [
        {
          manifest: {
            name: 'test-skill',
            description: 'A test skill for testing',
            license: 'MIT',
          },
          path: '/path/to/test-skill/SKILL.md',
          directory: '/path/to/test-skill',
          source: 'bundled',
        },
        {
          manifest: {
            name: 'user-skill',
            description: 'A user-defined skill',
          },
          path: '/home/user/.agent/skills/user-skill/SKILL.md',
          directory: '/home/user/.agent/skills/user-skill',
          source: 'user',
        },
      ] as DiscoveredSkill[],
      errors: [],
    }),
  })),
}));

// Mock the parser
jest.unstable_mockModule('../../../skills/parser.js', () => ({
  parseSkillMd: jest.fn().mockReturnValue({
    success: true,
    content: {
      manifest: {
        name: 'validated-skill',
        description: 'A validated skill',
        license: 'Apache-2.0',
      },
      body: '# Skill body',
    },
  }),
}));

// Mock fs/promises
jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(`---
name: validated-skill
description: A validated skill
license: Apache-2.0
---

# Skill body
This is the skill content.
`),
}));

interface OutputEntry {
  content: string;
  type?: string;
}

function createMockContext(): CommandContext & {
  outputs: OutputEntry[];
  exitCalled: boolean;
} {
  const outputs: OutputEntry[] = [];

  return {
    config: null,
    onOutput: (content: string, type?: string) => {
      outputs.push({ content, type });
    },
    exit: () => {
      // noop for test
    },
    outputs,
    exitCalled: false,
  };
}

describe('skill command handlers', () => {
  let parseSkillMd: jest.MockedFunction<(content: string, dirName: string) => unknown>;
  let readFile: jest.MockedFunction<(path: string, encoding: string) => Promise<string>>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const parser = await import('../../../skills/parser.js');
    parseSkillMd = parser.parseSkillMd as typeof parseSkillMd;
    const fs = await import('node:fs/promises');
    readFile = fs.readFile as typeof readFile;
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('skillHandler', () => {
    it('routes to skillListHandler by default', async () => {
      const { skillHandler } = await import('../skills.js');
      const context = createMockContext();
      const result = await skillHandler('', context);

      expect(result.success).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Discovered Skills'))).toBe(true);
    });

    it('routes to list subcommand', async () => {
      const { skillHandler } = await import('../skills.js');
      const context = createMockContext();
      const result = await skillHandler('list', context);

      expect(result.success).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Discovered Skills'))).toBe(true);
    });

    it('routes to info subcommand', async () => {
      const { skillHandler } = await import('../skills.js');
      const context = createMockContext();
      const result = await skillHandler('info test-skill', context);

      expect(result.success).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Skill: test-skill'))).toBe(true);
    });

    it('routes to validate subcommand', async () => {
      const { skillHandler } = await import('../skills.js');
      const context = createMockContext();
      const result = await skillHandler('validate /path/to/SKILL.md', context);

      expect(result.success).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Validation PASSED'))).toBe(true);
    });

    it('shows error for unknown subcommand', async () => {
      const { skillHandler } = await import('../skills.js');
      const context = createMockContext();
      const result = await skillHandler('unknown', context);

      expect(result.success).toBe(false);
      expect(context.outputs.some((o) => o.content.includes('Unknown subcommand'))).toBe(true);
    });
  });

  describe('skillListHandler', () => {
    it('shows discovered skills grouped by source', async () => {
      const { skillListHandler } = await import('../skills.js');
      const context = createMockContext();
      const result = await skillListHandler('', context);

      expect(result.success).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('[Bundled Skills]'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('[User Skills]'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('test-skill'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('user-skill'))).toBe(true);
    });

    it('returns data with discovered skills', async () => {
      const { skillListHandler } = await import('../skills.js');
      const context = createMockContext();
      const result = await skillListHandler('', context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data as { skills: unknown[]; errors: unknown[] };
      expect(data.skills.length).toBe(2);
      expect(data.errors.length).toBe(0);
    });
  });

  describe('skillInfoHandler', () => {
    it('requires skill name', async () => {
      const { skillInfoHandler } = await import('../skills.js');
      const context = createMockContext();
      const result = await skillInfoHandler('', context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Skill name required');
      expect(context.outputs.some((o) => o.content.includes('Usage: /skill info'))).toBe(true);
    });

    it('shows skill details when found', async () => {
      const { skillInfoHandler } = await import('../skills.js');
      const context = createMockContext();
      const result = await skillInfoHandler('test-skill', context);

      expect(result.success).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Skill: test-skill'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Description'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Source: bundled'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('License: MIT'))).toBe(true);
    });

    it('shows error when skill not found', async () => {
      const { skillInfoHandler } = await import('../skills.js');
      const context = createMockContext();
      const result = await skillInfoHandler('nonexistent', context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Skill not found');
      expect(context.outputs.some((o) => o.content.includes('Skill not found'))).toBe(true);
    });
  });

  describe('skillValidateHandler', () => {
    it('requires path argument', async () => {
      const { skillValidateHandler } = await import('../skills.js');
      const context = createMockContext();
      const result = await skillValidateHandler('', context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Path required');
      expect(context.outputs.some((o) => o.content.includes('Usage: /skill validate'))).toBe(true);
    });

    it('validates a valid SKILL.md file', async () => {
      const { skillValidateHandler } = await import('../skills.js');
      const context = createMockContext();
      const result = await skillValidateHandler('/path/to/validated-skill/SKILL.md', context);

      expect(result.success).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Validation PASSED'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('validated-skill'))).toBe(true);
    });

    it('reports validation errors', async () => {
      parseSkillMd.mockReturnValueOnce({
        success: false,
        error: 'Missing required field: name',
        type: 'VALIDATION_ERROR',
      });

      const { skillValidateHandler } = await import('../skills.js');
      const context = createMockContext();
      const result = await skillValidateHandler('/path/to/invalid/SKILL.md', context);

      expect(result.success).toBe(false);
      expect(context.outputs.some((o) => o.content.includes('Validation FAILED'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Missing required field'))).toBe(true);
    });

    it('handles file read errors', async () => {
      readFile.mockRejectedValueOnce(new Error('File not found'));

      const { skillValidateHandler } = await import('../skills.js');
      const context = createMockContext();
      const result = await skillValidateHandler('/path/to/missing/SKILL.md', context);

      expect(result.success).toBe(false);
      expect(context.outputs.some((o) => o.content.includes('Failed to read file'))).toBe(true);
    });
  });
});
