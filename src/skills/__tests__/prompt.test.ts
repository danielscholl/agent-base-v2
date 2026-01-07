/**
 * Tests for skill prompt generation.
 */

import { describe, expect, it } from '@jest/globals';
import type { DiscoveredSkill } from '../types.js';
import {
  escapeXml,
  generateAvailableSkillsXml,
  estimateSkillTokens,
  formatSkillsSummary,
} from '../prompt.js';

// Helper to create test skills
function createTestSkill(overrides: Partial<DiscoveredSkill> = {}): DiscoveredSkill {
  return {
    manifest: {
      name: 'test-skill',
      description: 'A test skill for testing',
    },
    path: '/path/to/test-skill/SKILL.md',
    directory: '/path/to/test-skill',
    source: 'bundled',
    ...overrides,
  };
}

describe('escapeXml', () => {
  it('escapes ampersand', () => {
    expect(escapeXml('A & B')).toBe('A &amp; B');
  });

  it('escapes less than', () => {
    expect(escapeXml('A < B')).toBe('A &lt; B');
  });

  it('escapes greater than', () => {
    expect(escapeXml('A > B')).toBe('A &gt; B');
  });

  it('escapes double quotes', () => {
    expect(escapeXml('Say "hello"')).toBe('Say &quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeXml("It's here")).toBe('It&apos;s here');
  });

  it('handles multiple special characters', () => {
    expect(escapeXml('<tag attr="val">A & B</tag>')).toBe(
      '&lt;tag attr=&quot;val&quot;&gt;A &amp; B&lt;/tag&gt;'
    );
  });

  it('returns unchanged text without special chars', () => {
    expect(escapeXml('Hello World 123')).toBe('Hello World 123');
  });
});

describe('generateAvailableSkillsXml', () => {
  it('returns empty string for no skills', () => {
    expect(generateAvailableSkillsXml([])).toBe('');
  });

  it('filters out unavailable skills', () => {
    const skills = [
      createTestSkill({ manifest: { name: 'available', description: 'Available skill' } }),
      createTestSkill({
        manifest: { name: 'unavailable', description: 'Unavailable skill' },
        unavailable: true,
        unavailableReason: 'missing commands: gh',
      }),
    ];
    const xml = generateAvailableSkillsXml(skills);

    expect(xml).toContain('<name>available</name>');
    expect(xml).not.toContain('<name>unavailable</name>');
  });

  it('returns empty string when all skills are unavailable', () => {
    const skills = [
      createTestSkill({
        manifest: { name: 'unavailable1', description: 'Unavailable skill 1' },
        unavailable: true,
      }),
      createTestSkill({
        manifest: { name: 'unavailable2', description: 'Unavailable skill 2' },
        unavailable: true,
      }),
    ];
    expect(generateAvailableSkillsXml(skills)).toBe('');
  });

  it('generates valid XML for single skill', () => {
    const skill = createTestSkill();
    const xml = generateAvailableSkillsXml([skill]);

    expect(xml).toContain('<available_skills>');
    expect(xml).toContain('</available_skills>');
    expect(xml).toContain('<skill>');
    expect(xml).toContain('<name>test-skill</name>');
    expect(xml).toContain('<description>A test skill for testing</description>');
    expect(xml).toContain('<location>/path/to/test-skill/SKILL.md</location>');
    expect(xml).toContain('</skill>');
  });

  it('generates valid XML for multiple skills', () => {
    const skills = [
      createTestSkill({ manifest: { name: 'skill-1', description: 'First skill' } }),
      createTestSkill({ manifest: { name: 'skill-2', description: 'Second skill' } }),
    ];
    const xml = generateAvailableSkillsXml(skills);

    expect(xml).toContain('<name>skill-1</name>');
    expect(xml).toContain('<name>skill-2</name>');
    expect(xml).toContain('<description>First skill</description>');
    expect(xml).toContain('<description>Second skill</description>');
  });

  it('escapes special characters in skill content', () => {
    const skill = createTestSkill({
      manifest: {
        name: 'special-chars',
        description: 'Handles <tags> & "quotes"',
      },
      path: '/path/with spaces/SKILL.md',
    });
    const xml = generateAvailableSkillsXml([skill]);

    expect(xml).toContain('Handles &lt;tags&gt; &amp; &quot;quotes&quot;');
    expect(xml).not.toContain('<tags>');
    expect(xml).not.toContain('& "');
  });

  it('generates properly formatted XML structure', () => {
    const skill = createTestSkill();
    const xml = generateAvailableSkillsXml([skill]);

    // Check structure
    const lines = xml.split('\n');
    expect(lines[0]).toBe('<available_skills>');
    expect(lines[lines.length - 1]).toBe('</available_skills>');

    // Skill element should be properly nested
    expect(xml).toMatch(/<available_skills>\n<skill>/);
    expect(xml).toMatch(/<\/skill>\n<\/available_skills>/);
  });
});

describe('estimateSkillTokens', () => {
  it('returns 0 for no skills', () => {
    expect(estimateSkillTokens([])).toBe(0);
  });

  it('estimates ~100 tokens per skill', () => {
    const skills = [createTestSkill()];
    expect(estimateSkillTokens(skills)).toBe(100);
  });

  it('scales linearly with skill count', () => {
    const skills = [
      createTestSkill({ manifest: { name: 'skill-1', description: 'desc 1' } }),
      createTestSkill({ manifest: { name: 'skill-2', description: 'desc 2' } }),
      createTestSkill({ manifest: { name: 'skill-3', description: 'desc 3' } }),
    ];
    expect(estimateSkillTokens(skills)).toBe(300);
  });
});

describe('formatSkillsSummary', () => {
  it('returns message for no skills', () => {
    expect(formatSkillsSummary([])).toBe('No skills available');
  });

  it('formats single skill', () => {
    const skills = [createTestSkill()];
    const summary = formatSkillsSummary(skills);

    expect(summary).toContain('Available skills (1)');
    expect(summary).toContain('test-skill (bundled)');
    expect(summary).toContain('A test skill for testing');
  });

  it('formats multiple skills', () => {
    const skills = [
      createTestSkill({
        manifest: { name: 'skill-1', description: 'First skill' },
        source: 'bundled',
      }),
      createTestSkill({
        manifest: { name: 'skill-2', description: 'Second skill' },
        source: 'user',
      }),
    ];
    const summary = formatSkillsSummary(skills);

    expect(summary).toContain('Available skills (2)');
    expect(summary).toContain('skill-1 (bundled)');
    expect(summary).toContain('skill-2 (user)');
  });

  it('truncates long descriptions', () => {
    const longDescription =
      'This is a very long description that should be truncated to prevent the summary from being too long and taking up too much space';
    const skills = [
      createTestSkill({
        manifest: { name: 'long-desc', description: longDescription },
      }),
    ];
    const summary = formatSkillsSummary(skills);

    // Verify truncation occurred
    expect(summary).toContain('...');
    // Verify the full original description is not present (was actually shortened)
    expect(summary).not.toContain(longDescription);
    // Verify it starts with the beginning of the description
    expect(summary).toContain('This is a very long description');
  });

  it('shows skill source type', () => {
    const skills = [
      createTestSkill({ source: 'bundled' }),
      createTestSkill({ manifest: { name: 'skill-2', description: 'desc' }, source: 'user' }),
      createTestSkill({ manifest: { name: 'skill-3', description: 'desc' }, source: 'project' }),
    ];
    const summary = formatSkillsSummary(skills);

    expect(summary).toContain('(bundled)');
    expect(summary).toContain('(user)');
    expect(summary).toContain('(project)');
  });
});
