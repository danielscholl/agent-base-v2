/**
 * Tests for SKILL.md YAML frontmatter parser.
 */

import { describe, expect, it } from '@jest/globals';
import { parseSkillMd, hasYamlFrontmatter } from '../parser.js';

describe('parseSkillMd', () => {
  describe('valid SKILL.md content', () => {
    it('parses manifest with only required fields', () => {
      const content = `---
name: test-skill
description: A test skill
---

# Test Skill

This is the body content.`;

      const result = parseSkillMd(content, 'test-skill');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content.manifest.name).toBe('test-skill');
        expect(result.content.manifest.description).toBe('A test skill');
        expect(result.content.body).toContain('# Test Skill');
      }
    });

    it('parses manifest with all fields', () => {
      const content = `---
name: full-skill
description: A complete skill
license: MIT
compatibility: Node.js 18+
metadata:
  author: Test Author
  version: 1.0.0
allowed-tools: Bash Read
---

# Full Skill

Body content here.`;

      const result = parseSkillMd(content, 'full-skill');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content.manifest.name).toBe('full-skill');
        expect(result.content.manifest.license).toBe('MIT');
        expect(result.content.manifest.compatibility).toBe('Node.js 18+');
        expect(result.content.manifest.metadata?.author).toBe('Test Author');
        expect(result.content.manifest.allowedTools).toBe('Bash Read');
      }
    });

    it('extracts body content correctly', () => {
      const content = `---
name: body-test
description: Test body extraction
---

First paragraph.

Second paragraph with **markdown**.

- List item 1
- List item 2`;

      const result = parseSkillMd(content, 'body-test');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content.body).toContain('First paragraph.');
        expect(result.content.body).toContain('**markdown**');
        expect(result.content.body).toContain('- List item 1');
      }
    });

    it('handles empty body', () => {
      const content = `---
name: no-body
description: Skill with no body
---
`;

      const result = parseSkillMd(content, 'no-body');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content.body).toBe('');
      }
    });

    it('handles Windows line endings', () => {
      const content = `---\r\nname: windows-skill\r\ndescription: Windows line endings\r\n---\r\n\r\nBody content.\r\n`;

      const result = parseSkillMd(content, 'windows-skill');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content.manifest.name).toBe('windows-skill');
      }
    });
  });

  describe('parse errors', () => {
    it('rejects content without frontmatter', () => {
      const content = `# No Frontmatter

This is just markdown.`;

      const result = parseSkillMd(content, 'test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.type).toBe('PARSE_ERROR');
        expect(result.error).toContain('must start with YAML frontmatter');
      }
    });

    it('rejects unclosed frontmatter', () => {
      const content = `---
name: unclosed
description: No closing delimiter

This is body without closing.`;

      const result = parseSkillMd(content, 'unclosed');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.type).toBe('PARSE_ERROR');
        expect(result.error).toContain('not properly closed');
      }
    });

    it('rejects invalid YAML syntax', () => {
      const content = `---
name: bad-yaml
description: [invalid yaml
---

Body`;

      const result = parseSkillMd(content, 'bad-yaml');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.type).toBe('PARSE_ERROR');
        expect(result.error).toContain('YAML parse error');
      }
    });
  });

  describe('validation errors', () => {
    it('rejects invalid skill name', () => {
      const content = `---
name: INVALID_NAME
description: Has invalid name
---

Body`;

      const result = parseSkillMd(content, 'INVALID_NAME');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.type).toBe('VALIDATION_ERROR');
      }
    });

    it('rejects missing required fields', () => {
      const content = `---
name: missing-desc
---

Body`;

      const result = parseSkillMd(content, 'missing-desc');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.type).toBe('VALIDATION_ERROR');
      }
    });

    it('rejects name not matching directory', () => {
      const content = `---
name: skill-name
description: Valid skill
---

Body`;

      const result = parseSkillMd(content, 'different-directory');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.type).toBe('VALIDATION_ERROR');
        expect(result.error).toContain('does not match directory name');
      }
    });
  });

  describe('edge cases', () => {
    it('handles content with only frontmatter delimiters', () => {
      const content = `---
name: edge-case
description: Just frontmatter
---`;

      const result = parseSkillMd(content, 'edge-case');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content.body).toBe('');
      }
    });

    it('handles leading whitespace', () => {
      const content = `
---
name: whitespace
description: Has leading whitespace
---

Body`;

      const result = parseSkillMd(content, 'whitespace');
      expect(result.success).toBe(true);
    });

    it('preserves frontmatter content with colons', () => {
      const content = `---
name: colon-test
description: "A description: with a colon"
---

Body`;

      const result = parseSkillMd(content, 'colon-test');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content.manifest.description).toBe('A description: with a colon');
      }
    });
  });
});

describe('hasYamlFrontmatter', () => {
  it('returns true for valid frontmatter', () => {
    const content = `---
name: test
description: test
---

Body`;
    expect(hasYamlFrontmatter(content)).toBe(true);
  });

  it('returns false for no frontmatter', () => {
    const content = `# No Frontmatter

Just markdown.`;
    expect(hasYamlFrontmatter(content)).toBe(false);
  });

  it('returns false for unclosed frontmatter', () => {
    const content = `---
name: unclosed
description: no closing delimiter`;
    expect(hasYamlFrontmatter(content)).toBe(false);
  });

  it('handles leading whitespace', () => {
    const content = `   ---
name: test
description: test
---

Body`;
    expect(hasYamlFrontmatter(content)).toBe(true);
  });
});
