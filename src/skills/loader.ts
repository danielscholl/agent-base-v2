/**
 * Skill discovery and loading.
 * Scans configured directories for valid skills.
 */

import { readFile, readdir, stat, access, constants, realpath } from 'node:fs/promises';
import { join, dirname, relative, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type {
  SkillLoaderOptions,
  SkillDiscoveryResult,
  DiscoveredSkill,
  SkillError,
  SkillSource,
} from './types.js';
import { parseSkillMd } from './parser.js';

// Default directories
// Bundled skills location depends on execution context:
// - In bundled dist: dist/index.js -> look for dist/_bundled_skills (same dir)
// - In source dev: src/skills/loader.ts -> look for src/_bundled_skills (parent dir)
function getBundledDir(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));

  // Try same directory first (for bundled dist/index.js)
  const sameDirPath = join(moduleDir, '_bundled_skills');

  // Try parent directory (for source src/skills/loader.ts)
  const parentDirPath = join(moduleDir, '..', '_bundled_skills');

  // We can't check synchronously which exists, so return both with priority
  // The loader will handle missing directories gracefully
  return sameDirPath.includes('dist') ? sameDirPath : parentDirPath;
}

const DEFAULT_BUNDLED_DIR = getBundledDir();
const DEFAULT_USER_DIR = join(homedir(), '.agent', 'skills');
const DEFAULT_PROJECT_DIR = join(process.cwd(), '.agent', 'skills');

/**
 * Skill loader that discovers and validates skills from configured directories.
 */
export class SkillLoader {
  private readonly bundledDir: string;
  private readonly userDir: string;
  private readonly projectDir: string;
  private readonly onDebug?: (msg: string, data?: unknown) => void;

  constructor(options: SkillLoaderOptions = {}) {
    this.bundledDir = options.bundledDir ?? DEFAULT_BUNDLED_DIR;
    this.userDir = options.userDir ?? DEFAULT_USER_DIR;
    this.projectDir = options.projectDir ?? DEFAULT_PROJECT_DIR;
    this.onDebug = options.onDebug;
  }

  private debug(msg: string, data?: unknown): void {
    this.onDebug?.(msg, data);
  }

  /**
   * Discover all skills from configured directories.
   * Scans bundled, user, and project directories in order.
   *
   * @returns Discovery result with skills and errors
   */
  async discover(): Promise<SkillDiscoveryResult> {
    const skills: DiscoveredSkill[] = [];
    const errors: SkillError[] = [];

    // Scan each directory with appropriate source type
    const sources: Array<{ dir: string; source: SkillSource }> = [
      { dir: this.bundledDir, source: 'bundled' },
      { dir: this.userDir, source: 'user' },
      { dir: this.projectDir, source: 'project' },
    ];

    for (const { dir, source } of sources) {
      this.debug(`Scanning ${source} skills directory`, { dir });

      // Check if directory exists
      const exists = await this.directoryExists(dir);
      if (!exists) {
        this.debug(`Directory does not exist, skipping`, { dir });
        continue;
      }

      // Scan directory for skills
      const result = await this.scanDirectory(dir, source);
      skills.push(...result.skills);
      errors.push(...result.errors);
    }

    // Check for duplicate skill names (later sources win)
    const seen = new Map<string, DiscoveredSkill>();
    for (const skill of skills) {
      if (seen.has(skill.manifest.name)) {
        this.debug(`Duplicate skill name, later definition wins`, {
          name: skill.manifest.name,
          previous: seen.get(skill.manifest.name)?.path,
          current: skill.path,
        });
      }
      seen.set(skill.manifest.name, skill);
    }

    const uniqueSkills = Array.from(seen.values());

    this.debug(`Discovery complete`, {
      total: uniqueSkills.length,
      errors: errors.length,
    });

    return { skills: uniqueSkills, errors };
  }

  /**
   * Scan a single directory for skills.
   * Includes symlink security validation.
   */
  private async scanDirectory(dir: string, source: SkillSource): Promise<SkillDiscoveryResult> {
    const skills: DiscoveredSkill[] = [];
    const errors: SkillError[] = [];

    try {
      // Resolve the base directory to its real path
      const resolvedBaseDir = await realpath(dir);
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillDir = join(dir, entry.name);
        const skillMdPath = join(skillDir, 'SKILL.md');

        // Security: Verify skill directory doesn't escape via symlink
        try {
          const resolvedSkillDir = await realpath(skillDir);
          const relativePath = relative(resolvedBaseDir, resolvedSkillDir);

          // Check for escape: starts with "..", starts with "/", or is absolute (Windows: D:\...)
          if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
            this.debug('Rejected skill directory symlink escape attempt', {
              skillDir,
              resolvedSkillDir,
            });
            errors.push({
              path: skillDir,
              message: 'Skill directory symlink escapes base directory',
              type: 'SECURITY_ERROR',
            });
            continue;
          }
        } catch {
          // realpath failed - directory may not exist or be accessible
          continue;
        }

        // Check for SKILL.md
        const hasMd = await this.fileExists(skillMdPath);
        if (!hasMd) {
          this.debug(`No SKILL.md found, skipping`, { dir: skillDir });
          continue;
        }

        // Load and parse SKILL.md
        const result = await this.loadSkill(skillMdPath, entry.name, source);
        if (result.success) {
          skills.push(result.skill);
        } else {
          errors.push(result.error);
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to scan directory';
      errors.push({
        path: dir,
        message,
        type: 'IO_ERROR',
      });
    }

    return { skills, errors };
  }

  /**
   * Load a single skill from SKILL.md path.
   */
  private async loadSkill(
    skillMdPath: string,
    directoryName: string,
    source: SkillSource
  ): Promise<{ success: true; skill: DiscoveredSkill } | { success: false; error: SkillError }> {
    try {
      const content = await readFile(skillMdPath, 'utf-8');
      const result = parseSkillMd(content, directoryName);

      if (!result.success) {
        return {
          success: false,
          error: {
            path: skillMdPath,
            message: result.error,
            type: result.type,
          },
        };
      }

      this.debug(`Loaded skill`, { name: result.content.manifest.name, path: skillMdPath });

      return {
        success: true,
        skill: {
          manifest: result.content.manifest,
          path: skillMdPath,
          directory: dirname(skillMdPath),
          source,
        },
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to read SKILL.md';
      return {
        success: false,
        error: {
          path: skillMdPath,
          message,
          type: 'IO_ERROR',
        },
      };
    }
  }

  /**
   * Get the full content of a skill (for progressive disclosure tier 2).
   *
   * @param skillPath - Absolute path to SKILL.md
   * @returns Full skill content including body
   */
  async getSkillContent(skillPath: string): Promise<string | null> {
    try {
      return await readFile(skillPath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Check if a directory exists.
   */
  private async directoryExists(path: string): Promise<boolean> {
    try {
      const stats = await stat(path);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if a file exists and is readable.
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a skill loader with default options.
 */
export function createSkillLoader(options?: SkillLoaderOptions): SkillLoader {
  return new SkillLoader(options);
}
