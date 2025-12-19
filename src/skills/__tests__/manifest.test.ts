/**
 * Tests for SKILL.md manifest schema validation.
 */

import { describe, expect, it } from '@jest/globals';
import {
  SkillManifestSchema,
  SkillNameSchema,
  SkillDescriptionSchema,
  validateManifest,
  validateNameMatchesDirectory,
  formatValidationErrors,
  MAX_SKILL_NAME_LENGTH,
  MAX_SKILL_DESCRIPTION_LENGTH,
  MAX_COMPATIBILITY_LENGTH,
  SKILL_NAME_PATTERN,
} from '../manifest.js';

describe('SkillNameSchema', () => {
  describe('valid names', () => {
    it('accepts lowercase alphanumeric', () => {
      expect(SkillNameSchema.safeParse('hello').success).toBe(true);
      expect(SkillNameSchema.safeParse('skill123').success).toBe(true);
    });

    it('accepts names with single hyphens', () => {
      expect(SkillNameSchema.safeParse('hello-world').success).toBe(true);
      expect(SkillNameSchema.safeParse('my-cool-skill').success).toBe(true);
    });

    it('accepts minimum length name', () => {
      expect(SkillNameSchema.safeParse('a').success).toBe(true);
    });

    it('accepts maximum length name', () => {
      const maxName = 'a'.repeat(MAX_SKILL_NAME_LENGTH);
      expect(SkillNameSchema.safeParse(maxName).success).toBe(true);
    });
  });

  describe('invalid names', () => {
    it('rejects empty string', () => {
      const result = SkillNameSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('rejects names exceeding max length', () => {
      const tooLong = 'a'.repeat(MAX_SKILL_NAME_LENGTH + 1);
      const result = SkillNameSchema.safeParse(tooLong);
      expect(result.success).toBe(false);
    });

    it('rejects uppercase letters', () => {
      expect(SkillNameSchema.safeParse('Hello').success).toBe(false);
      expect(SkillNameSchema.safeParse('SKILL').success).toBe(false);
    });

    it('rejects leading hyphens', () => {
      expect(SkillNameSchema.safeParse('-hello').success).toBe(false);
    });

    it('rejects trailing hyphens', () => {
      expect(SkillNameSchema.safeParse('hello-').success).toBe(false);
    });

    it('rejects consecutive hyphens', () => {
      expect(SkillNameSchema.safeParse('hello--world').success).toBe(false);
    });

    it('rejects special characters', () => {
      expect(SkillNameSchema.safeParse('hello_world').success).toBe(false);
      expect(SkillNameSchema.safeParse('hello.world').success).toBe(false);
      expect(SkillNameSchema.safeParse('hello@world').success).toBe(false);
    });

    it('rejects spaces', () => {
      expect(SkillNameSchema.safeParse('hello world').success).toBe(false);
    });
  });
});

describe('SkillDescriptionSchema', () => {
  it('accepts valid descriptions', () => {
    expect(SkillDescriptionSchema.safeParse('A simple skill').success).toBe(true);
  });

  it('rejects empty description', () => {
    expect(SkillDescriptionSchema.safeParse('').success).toBe(false);
  });

  it('accepts maximum length description', () => {
    const maxDesc = 'a'.repeat(MAX_SKILL_DESCRIPTION_LENGTH);
    expect(SkillDescriptionSchema.safeParse(maxDesc).success).toBe(true);
  });

  it('rejects description exceeding max length', () => {
    const tooLong = 'a'.repeat(MAX_SKILL_DESCRIPTION_LENGTH + 1);
    expect(SkillDescriptionSchema.safeParse(tooLong).success).toBe(false);
  });
});

describe('SkillManifestSchema', () => {
  const validManifest = {
    name: 'test-skill',
    description: 'A test skill for validation',
  };

  describe('required fields', () => {
    it('accepts manifest with only required fields', () => {
      const result = SkillManifestSchema.safeParse(validManifest);
      expect(result.success).toBe(true);
    });

    it('rejects missing name', () => {
      const result = SkillManifestSchema.safeParse({ description: 'Test' });
      expect(result.success).toBe(false);
    });

    it('rejects missing description', () => {
      const result = SkillManifestSchema.safeParse({ name: 'test' });
      expect(result.success).toBe(false);
    });
  });

  describe('optional fields', () => {
    it('accepts license field', () => {
      const result = SkillManifestSchema.safeParse({
        ...validManifest,
        license: 'MIT',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.license).toBe('MIT');
      }
    });

    it('accepts compatibility field', () => {
      const result = SkillManifestSchema.safeParse({
        ...validManifest,
        compatibility: 'Requires Node.js 18+',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.compatibility).toBe('Requires Node.js 18+');
      }
    });

    it('rejects compatibility exceeding max length', () => {
      const result = SkillManifestSchema.safeParse({
        ...validManifest,
        compatibility: 'a'.repeat(MAX_COMPATIBILITY_LENGTH + 1),
      });
      expect(result.success).toBe(false);
    });

    it('accepts metadata field', () => {
      const result = SkillManifestSchema.safeParse({
        ...validManifest,
        metadata: {
          author: 'Test Author',
          version: '1.0.0',
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata?.author).toBe('Test Author');
      }
    });

    it('accepts allowed-tools field', () => {
      const result = SkillManifestSchema.safeParse({
        ...validManifest,
        'allowed-tools': 'Bash(git:*) Read',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data['allowed-tools']).toBe('Bash(git:*) Read');
      }
    });
  });

  describe('full manifest', () => {
    it('accepts manifest with all fields', () => {
      const fullManifest = {
        name: 'full-skill',
        description: 'A complete skill with all fields',
        license: 'MIT',
        compatibility: 'All platforms',
        metadata: {
          author: 'Test',
          version: '1.0.0',
        },
        'allowed-tools': 'Bash Read Write',
      };
      const result = SkillManifestSchema.safeParse(fullManifest);
      expect(result.success).toBe(true);
    });
  });

  describe('strict mode', () => {
    it('rejects unknown fields', () => {
      const result = SkillManifestSchema.safeParse({
        ...validManifest,
        unknownField: 'should fail',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('Unrecognized key');
      }
    });

    it('rejects multiple unknown fields', () => {
      const result = SkillManifestSchema.safeParse({
        ...validManifest,
        foo: 'bar',
        baz: 'qux',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('validateManifest', () => {
  it('returns success for valid manifest', () => {
    const result = validateManifest({
      name: 'test-skill',
      description: 'Test description',
    });
    expect(result.success).toBe(true);
  });

  it('returns failure for invalid manifest', () => {
    const result = validateManifest({
      name: 'INVALID',
      description: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('validateNameMatchesDirectory', () => {
  it('returns undefined when names match', () => {
    const result = validateNameMatchesDirectory('hello-world', 'hello-world');
    expect(result).toBeUndefined();
  });

  it('returns error when names do not match', () => {
    const result = validateNameMatchesDirectory('skill-name', 'different-dir');
    expect(result).toBe('Skill name "skill-name" does not match directory name "different-dir"');
  });
});

describe('formatValidationErrors', () => {
  it('formats single error', () => {
    const result = SkillManifestSchema.safeParse({ name: '', description: 'test' });
    if (!result.success) {
      const errors = formatValidationErrors(result.error);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('name');
    } else {
      throw new Error('Expected validation to fail');
    }
  });

  it('formats multiple errors', () => {
    const result = SkillManifestSchema.safeParse({});
    if (!result.success) {
      const errors = formatValidationErrors(result.error);
      expect(errors.length).toBe(2); // name and description both missing
    } else {
      throw new Error('Expected validation to fail');
    }
  });
});

describe('SKILL_NAME_PATTERN', () => {
  it('matches valid patterns', () => {
    expect(SKILL_NAME_PATTERN.test('hello')).toBe(true);
    expect(SKILL_NAME_PATTERN.test('hello-world')).toBe(true);
    expect(SKILL_NAME_PATTERN.test('my-cool-skill-123')).toBe(true);
  });

  it('rejects invalid patterns', () => {
    expect(SKILL_NAME_PATTERN.test('-hello')).toBe(false);
    expect(SKILL_NAME_PATTERN.test('hello-')).toBe(false);
    expect(SKILL_NAME_PATTERN.test('hello--world')).toBe(false);
    expect(SKILL_NAME_PATTERN.test('Hello')).toBe(false);
  });
});
