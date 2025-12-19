/**
 * Tests for skill discovery and loading.
 */

import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { SkillLoader, createSkillLoader } from '../loader.js';

describe('SkillLoader', () => {
  let tempDir: string;
  let bundledDir: string;
  let userDir: string;
  let projectDir: string;

  beforeEach(async () => {
    // Create temporary directories for testing
    tempDir = await mkdtemp(join(tmpdir(), 'skills-test-'));
    bundledDir = join(tempDir, 'bundled');
    userDir = join(tempDir, 'user');
    projectDir = join(tempDir, 'project');
  });

  afterEach(async () => {
    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  });

  async function createSkillDir(
    baseDir: string,
    skillName: string,
    manifest: { name: string; description: string; license?: string }
  ): Promise<void> {
    const skillDir = join(baseDir, skillName);
    await mkdir(skillDir, { recursive: true });

    const licenseField = manifest.license !== undefined ? `license: ${manifest.license}\n` : '';
    const skillMd = `---
name: ${manifest.name}
description: ${manifest.description}
${licenseField}---

# ${manifest.name}

Skill body content.`;

    await writeFile(join(skillDir, 'SKILL.md'), skillMd);
  }

  describe('discover', () => {
    it('discovers skills from bundled directory', async () => {
      await createSkillDir(bundledDir, 'test-skill', {
        name: 'test-skill',
        description: 'A test skill',
      });

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        projectDir,
      });

      const result = await loader.discover();

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.manifest.name).toBe('test-skill');
      expect(result.skills[0]?.source).toBe('bundled');
      expect(result.errors).toHaveLength(0);
    });

    it('discovers skills from multiple directories', async () => {
      await createSkillDir(bundledDir, 'bundled-skill', {
        name: 'bundled-skill',
        description: 'Bundled skill',
      });
      await createSkillDir(userDir, 'user-skill', {
        name: 'user-skill',
        description: 'User skill',
      });
      await createSkillDir(projectDir, 'project-skill', {
        name: 'project-skill',
        description: 'Project skill',
      });

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        projectDir,
      });

      const result = await loader.discover();

      expect(result.skills).toHaveLength(3);
      const sources = result.skills.map((s) => s.source);
      expect(sources).toContain('bundled');
      expect(sources).toContain('user');
      expect(sources).toContain('project');
    });

    it('handles missing directories gracefully', async () => {
      // Don't create any directories
      const loader = new SkillLoader({
        bundledDir: join(tempDir, 'nonexistent-bundled'),
        userDir: join(tempDir, 'nonexistent-user'),
        projectDir: join(tempDir, 'nonexistent-project'),
      });

      const result = await loader.discover();

      expect(result.skills).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('skips directories without SKILL.md', async () => {
      // Create directory without SKILL.md
      await mkdir(join(bundledDir, 'no-skill-md'), { recursive: true });
      await writeFile(join(bundledDir, 'no-skill-md', 'README.md'), '# Not a skill');

      // Create valid skill
      await createSkillDir(bundledDir, 'valid-skill', {
        name: 'valid-skill',
        description: 'Valid skill',
      });

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        projectDir,
      });

      const result = await loader.discover();

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.manifest.name).toBe('valid-skill');
    });

    it('collects parse errors without failing', async () => {
      // Create invalid skill
      const invalidDir = join(bundledDir, 'invalid-skill');
      await mkdir(invalidDir, { recursive: true });
      await writeFile(join(invalidDir, 'SKILL.md'), 'Not valid frontmatter');

      // Create valid skill
      await createSkillDir(bundledDir, 'valid-skill', {
        name: 'valid-skill',
        description: 'Valid skill',
      });

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        projectDir,
      });

      const result = await loader.discover();

      expect(result.skills).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.type).toBe('PARSE_ERROR');
    });

    it('handles duplicate skill names (later wins)', async () => {
      // Same skill name in bundled and user
      await createSkillDir(bundledDir, 'same-skill', {
        name: 'same-skill',
        description: 'Bundled version',
      });
      await createSkillDir(userDir, 'same-skill', {
        name: 'same-skill',
        description: 'User version',
      });

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        projectDir,
      });

      const result = await loader.discover();

      // User skill should override bundled
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.source).toBe('user');
      expect(result.skills[0]?.manifest.description).toBe('User version');
    });

    it('calls debug callback', async () => {
      await createSkillDir(bundledDir, 'debug-skill', {
        name: 'debug-skill',
        description: 'Debug test',
      });

      const debugMessages: string[] = [];
      const loader = new SkillLoader({
        bundledDir,
        userDir,
        projectDir,
        onDebug: (msg) => debugMessages.push(msg),
      });

      await loader.discover();

      expect(debugMessages.length).toBeGreaterThan(0);
      expect(debugMessages.some((m) => m.includes('Scanning'))).toBe(true);
      expect(debugMessages.some((m) => m.includes('Discovery complete'))).toBe(true);
    });
  });

  describe('getSkillContent', () => {
    it('returns skill content for valid path', async () => {
      await createSkillDir(bundledDir, 'content-skill', {
        name: 'content-skill',
        description: 'Content test',
      });

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        projectDir,
      });

      const result = await loader.discover();
      const skillPath = result.skills[0]?.path;
      expect(skillPath).toBeDefined();

      if (skillPath === undefined) {
        throw new Error('Expected skillPath to be defined');
      }
      const content = await loader.getSkillContent(skillPath);
      expect(content).toContain('name: content-skill');
    });

    it('returns null for invalid path', async () => {
      const loader = new SkillLoader({
        bundledDir,
        userDir,
        projectDir,
      });

      const content = await loader.getSkillContent('/nonexistent/path/SKILL.md');
      expect(content).toBeNull();
    });
  });
});

describe('createSkillLoader', () => {
  it('creates loader with default options', () => {
    const loader = createSkillLoader();
    expect(loader).toBeInstanceOf(SkillLoader);
  });

  it('creates loader with custom options', () => {
    const loader = createSkillLoader({
      bundledDir: '/custom/bundled',
      userDir: '/custom/user',
      projectDir: '/custom/project',
    });
    expect(loader).toBeInstanceOf(SkillLoader);
  });
});
