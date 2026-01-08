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
  let claudeDir: string;
  let projectDir: string;

  beforeEach(async () => {
    // Create temporary directories for testing
    tempDir = await mkdtemp(join(tmpdir(), 'skills-test-'));
    bundledDir = join(tempDir, 'bundled');
    userDir = join(tempDir, 'user');
    claudeDir = join(tempDir, '.claude', 'skills');
    projectDir = join(tempDir, 'project');
  });

  afterEach(async () => {
    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  });

  async function createSkillDir(
    baseDir: string,
    skillName: string,
    manifest: {
      name: string;
      description: string;
      license?: string;
      metadata?: Record<string, string>;
    }
  ): Promise<void> {
    const skillDir = join(baseDir, skillName);
    await mkdir(skillDir, { recursive: true });

    const licenseField = manifest.license !== undefined ? `license: ${manifest.license}\n` : '';

    // Build metadata section if provided
    let metadataSection = '';
    if (manifest.metadata) {
      const entries = Object.entries(manifest.metadata)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n');
      metadataSection = `metadata:\n${entries}\n`;
    }

    const skillMd = `---
name: ${manifest.name}
description: ${manifest.description}
${licenseField}${metadataSection}---

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

    it('marks skills as unavailable when dependencies are missing', async () => {
      await createSkillDir(bundledDir, 'missing-dep-skill', {
        name: 'missing-dep-skill',
        description: 'Skill with missing dependency',
        metadata: { requires: 'nonexistent-command-12345' },
      });

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        projectDir,
        includeUnavailable: true,
      });

      const result = await loader.discover();

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.unavailable).toBe(true);
      expect(result.skills[0]?.unavailableReason).toContain('missing commands');
      expect(result.skills[0]?.unavailableReason).toContain('nonexistent-command-12345');
    });

    it('filters out unavailable skills by default', async () => {
      await createSkillDir(bundledDir, 'missing-dep-skill', {
        name: 'missing-dep-skill',
        description: 'Skill with missing dependency',
        metadata: { requires: 'nonexistent-command-12345' },
      });

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        projectDir,
        // includeUnavailable defaults to false
      });

      const result = await loader.discover();

      expect(result.skills).toHaveLength(0);
    });

    it('includes unavailable skills when includeUnavailable is true', async () => {
      await createSkillDir(bundledDir, 'missing-dep-skill', {
        name: 'missing-dep-skill',
        description: 'Skill with missing dependency',
        metadata: { requires: 'nonexistent-command-12345' },
      });

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        projectDir,
        includeUnavailable: true,
      });

      const result = await loader.discover();

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.unavailable).toBe(true);
    });

    it('does not mark skills as unavailable when dependencies exist', async () => {
      // Use a command that exists on all platforms
      const isWindows = process.platform === 'win32';
      const existingCmd = isWindows ? 'cmd' : 'ls';

      await createSkillDir(bundledDir, 'available-skill', {
        name: 'available-skill',
        description: 'Skill with existing dependency',
        metadata: { requires: existingCmd },
      });

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        projectDir,
      });

      const result = await loader.discover();

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.unavailable).toBeFalsy();
    });

    it('skills without requires metadata are not marked unavailable', async () => {
      await createSkillDir(bundledDir, 'no-deps-skill', {
        name: 'no-deps-skill',
        description: 'Skill without dependencies',
      });

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        projectDir,
      });

      const result = await loader.discover();

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.unavailable).toBeFalsy();
    });

    it('handles skills with both disabled and unavailable flags', async () => {
      await createSkillDir(bundledDir, 'both-flags-skill', {
        name: 'both-flags-skill',
        description: 'Skill that is both disabled and has missing deps',
        metadata: { requires: 'nonexistent-command-12345' },
      });

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        projectDir,
        disabledBundled: ['both-flags-skill'],
        includeDisabled: true,
        includeUnavailable: true,
      });

      const result = await loader.discover();

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.disabled).toBe(true);
      expect(result.skills[0]?.unavailable).toBe(true);
    });

    it('unavailable higher-priority skill does not let lower-priority surface', async () => {
      // Bundled skill (lower priority) - available
      await createSkillDir(bundledDir, 'same-name', {
        name: 'same-name',
        description: 'Bundled version - available',
      });
      // User skill (higher priority) - unavailable due to missing dep
      await createSkillDir(userDir, 'same-name', {
        name: 'same-name',
        description: 'User version - unavailable',
        metadata: { requires: 'nonexistent-command-12345' },
      });

      // Default behavior: filter unavailable, so skill shouldn't appear at all
      const loader = new SkillLoader({
        bundledDir,
        userDir,
        projectDir,
      });

      const result = await loader.discover();

      // The skill should NOT appear (user version wins but is unavailable, gets filtered)
      // The bundled version should NOT surface as a fallback
      expect(result.skills).toHaveLength(0);
    });

    it('unavailable higher-priority skill shows when includeUnavailable is true', async () => {
      // Bundled skill (lower priority) - available
      await createSkillDir(bundledDir, 'same-name', {
        name: 'same-name',
        description: 'Bundled version - available',
      });
      // User skill (higher priority) - unavailable due to missing dep
      await createSkillDir(userDir, 'same-name', {
        name: 'same-name',
        description: 'User version - unavailable',
        metadata: { requires: 'nonexistent-command-12345' },
      });

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        projectDir,
        includeUnavailable: true,
      });

      const result = await loader.discover();

      // Should show the user version (unavailable) not the bundled version
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.source).toBe('user');
      expect(result.skills[0]?.unavailable).toBe(true);
    });

    it('discovers skills from .claude/skills directory', async () => {
      await createSkillDir(claudeDir, 'claude-skill', {
        name: 'claude-skill',
        description: 'A Claude Code compatible skill',
      });

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        claudeDir,
        projectDir,
      });

      const result = await loader.discover();

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.manifest.name).toBe('claude-skill');
      expect(result.skills[0]?.source).toBe('claude');
      expect(result.errors).toHaveLength(0);
    });

    it('handles missing .claude/skills directory gracefully', async () => {
      // Don't create claude directory
      const loader = new SkillLoader({
        bundledDir,
        userDir,
        claudeDir: join(tempDir, 'nonexistent-claude', 'skills'),
        projectDir,
      });

      const result = await loader.discover();

      expect(result.skills).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('project skills override claude skills with same name', async () => {
      // Same skill name in claude and project
      await createSkillDir(claudeDir, 'same-skill', {
        name: 'same-skill',
        description: 'Claude version',
      });
      await createSkillDir(projectDir, 'same-skill', {
        name: 'same-skill',
        description: 'Project version',
      });

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        claudeDir,
        projectDir,
      });

      const result = await loader.discover();

      // Project skill should override claude
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.source).toBe('project');
      expect(result.skills[0]?.manifest.description).toBe('Project version');
    });

    it('claude skills override user skills with same name', async () => {
      // Same skill name in user and claude
      await createSkillDir(userDir, 'same-skill', {
        name: 'same-skill',
        description: 'User version',
      });
      await createSkillDir(claudeDir, 'same-skill', {
        name: 'same-skill',
        description: 'Claude version',
      });

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        claudeDir,
        projectDir,
      });

      const result = await loader.discover();

      // Claude skill should override user
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.source).toBe('claude');
      expect(result.skills[0]?.manifest.description).toBe('Claude version');
    });

    it('discovers skills from all four source types', async () => {
      await createSkillDir(bundledDir, 'bundled-skill', {
        name: 'bundled-skill',
        description: 'Bundled skill',
      });
      await createSkillDir(userDir, 'user-skill', {
        name: 'user-skill',
        description: 'User skill',
      });
      await createSkillDir(claudeDir, 'claude-skill', {
        name: 'claude-skill',
        description: 'Claude skill',
      });
      await createSkillDir(projectDir, 'project-skill', {
        name: 'project-skill',
        description: 'Project skill',
      });

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        claudeDir,
        projectDir,
      });

      const result = await loader.discover();

      expect(result.skills).toHaveLength(4);
      const sources = result.skills.map((s) => s.source);
      expect(sources).toContain('bundled');
      expect(sources).toContain('user');
      expect(sources).toContain('claude');
      expect(sources).toContain('project');
    });

    it('respects priority order: plugin > project > claude > user > bundled', async () => {
      // All sources have same skill name
      await createSkillDir(bundledDir, 'priority-skill', {
        name: 'priority-skill',
        description: 'Bundled version',
      });
      await createSkillDir(userDir, 'priority-skill', {
        name: 'priority-skill',
        description: 'User version',
      });
      await createSkillDir(claudeDir, 'priority-skill', {
        name: 'priority-skill',
        description: 'Claude version',
      });
      await createSkillDir(projectDir, 'priority-skill', {
        name: 'priority-skill',
        description: 'Project version',
      });

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        claudeDir,
        projectDir,
      });

      const result = await loader.discover();

      // Project should win (highest priority among the non-plugin sources)
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.source).toBe('project');
      expect(result.skills[0]?.manifest.description).toBe('Project version');
    });

    it('ignores symlink entries in .claude/skills directory (security protection)', async () => {
      const { symlink } = await import('node:fs/promises');

      // Create the claude directory and a target skill directory outside
      await mkdir(claudeDir, { recursive: true });
      const outsideSkillDir = join(tempDir, 'outside-skill');
      await mkdir(outsideSkillDir, { recursive: true });

      // Create a valid SKILL.md in the outside directory
      const manifest = { name: 'escape-skill', description: 'Malicious skill' };
      const skillMd = `---\nname: ${manifest.name}\ndescription: ${manifest.description}\n---\n\nInstructions`;
      await writeFile(join(outsideSkillDir, 'SKILL.md'), skillMd);

      // Create a symlink inside claudeDir that points to the outside skill
      const escapePath = join(claudeDir, 'escape-skill');
      try {
        await symlink(outsideSkillDir, escapePath);
      } catch {
        // Symlink creation may fail on some systems (e.g., Windows without admin)
        // Skip test in that case
        return;
      }

      const loader = new SkillLoader({
        bundledDir,
        userDir,
        claudeDir,
        projectDir,
      });

      const result = await loader.discover();

      // Symlinks are ignored by the loader (entry.isDirectory() returns false for symlinks)
      // This provides implicit security protection - no skills from symlinks are loaded
      expect(result.skills).toHaveLength(0);

      // No error is reported since symlinks are just skipped as non-directories
      // The security goal (no unauthorized skill loading) is still met
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
      claudeDir: '/custom/claude/skills',
      projectDir: '/custom/project',
    });
    expect(loader).toBeInstanceOf(SkillLoader);
  });
});
