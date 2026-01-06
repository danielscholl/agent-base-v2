/**
 * Skill discovery and loading.
 * Scans configured directories for valid skills.
 */

import { readFile, readdir, stat, access, constants, realpath } from 'node:fs/promises';
import { join, dirname, relative, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import type {
  SkillLoaderOptions,
  SkillDiscoveryResult,
  DiscoveredSkill,
  SkillError,
  SkillSource,
} from './types.js';
import { parseSkillMd } from './parser.js';
import { extractRepoName } from './installer.js';
import { getBundledSkillsDir } from '../utils/paths.js';

// Default directories
const DEFAULT_BUNDLED_DIR = getBundledSkillsDir();
const DEFAULT_USER_DIR = join(homedir(), '.agent', 'skills');
const DEFAULT_PLUGINS_DIR = join(homedir(), '.agent', 'plugins');
const DEFAULT_PROJECT_DIR = join(process.cwd(), '.agent', 'skills');

/**
 * Skill loader that discovers and validates skills from configured directories.
 */
export class SkillLoader {
  private readonly bundledDir: string;
  private readonly userDir: string;
  private readonly projectDir: string;
  private readonly pluginsDir: string;
  private readonly plugins: SkillLoaderOptions['plugins'];
  private readonly disabledBundled: string[];
  private readonly enabledBundled: string[];
  private readonly includeDisabled: boolean;
  private readonly onDebug?: (msg: string, data?: unknown) => void;

  constructor(options: SkillLoaderOptions = {}) {
    this.bundledDir = options.bundledDir ?? DEFAULT_BUNDLED_DIR;
    this.userDir = options.userDir ?? DEFAULT_USER_DIR;
    this.projectDir = options.projectDir ?? DEFAULT_PROJECT_DIR;
    this.pluginsDir = options.pluginsDir ?? DEFAULT_PLUGINS_DIR;
    this.plugins = options.plugins;
    this.disabledBundled = options.disabledBundled ?? [];
    this.enabledBundled = options.enabledBundled ?? [];
    this.includeDisabled = options.includeDisabled ?? false;
    this.onDebug = options.onDebug;
  }

  private debug(msg: string, data?: unknown): void {
    this.onDebug?.(msg, data);
  }

  /**
   * Discover all skills from configured directories.
   * Scans bundled, user, project, and plugin directories in order.
   * Respects enabled/disabled configuration.
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

    // Scan plugins if configured
    if (this.plugins && this.plugins.length > 0) {
      const pluginResult = await this.scanPlugins();
      skills.push(...pluginResult.skills);
      errors.push(...pluginResult.errors);
    }

    // Mark and optionally filter bundled skills based on enabled/disabled lists
    const filteredSkills = skills
      .map((skill) => {
        if (skill.source === 'bundled') {
          // Check if explicitly disabled
          if (this.disabledBundled.includes(skill.manifest.name)) {
            this.debug(`Bundled skill disabled by config`, { name: skill.manifest.name });
            return { ...skill, disabled: true };
          }
          // Check if enabledBundled is specified and skill not in list
          if (
            this.enabledBundled.length > 0 &&
            !this.enabledBundled.includes(skill.manifest.name)
          ) {
            this.debug(`Bundled skill not in enabledBundled list`, { name: skill.manifest.name });
            return { ...skill, disabled: true };
          }
        }
        // Preserve disabled status if already set (e.g., for plugins from scanPlugins)
        // Otherwise default to enabled
        return { ...skill, disabled: skill.disabled ?? false };
      })
      .filter((skill) => {
        // If includeDisabled is true, keep all skills
        if (this.includeDisabled) return true;
        // Otherwise, filter out disabled skills
        return !skill.disabled;
      });

    // Check for duplicate skill names - effective priority: plugin > project > user > bundled
    // Skills are scanned in order: bundled, user, project, plugins
    // Later sources override earlier ones (Map.set replaces duplicates), so plugins win
    const seen = new Map<string, DiscoveredSkill>();
    for (const skill of filteredSkills) {
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
   * Scan installed plugins from config.
   * Loads plugins and marks disabled ones appropriately.
   *
   * Plugin disabled flag handling:
   * - If plugin.enabled === false AND includeDisabled === false: skip entirely (not loaded)
   * - If plugin.enabled === false AND includeDisabled === true: load with disabled: true
   * - If plugin.enabled !== false: load normally with disabled: false
   */
  private async scanPlugins(): Promise<SkillDiscoveryResult> {
    const skills: DiscoveredSkill[] = [];
    const errors: SkillError[] = [];

    if (!this.plugins) {
      return { skills, errors };
    }

    for (const plugin of this.plugins) {
      const isDisabled = plugin.enabled === false;

      // Skip disabled plugins unless includeDisabled is true
      // This implements the first case: plugin.enabled === false AND includeDisabled === false
      if (isDisabled && !this.includeDisabled) {
        this.debug(`Plugin disabled, skipping`, { name: plugin.name, url: plugin.url });
        continue;
      }

      // Determine skill name from plugin config or extract from URL
      const skillName = plugin.name ?? extractRepoName(plugin.url);
      const skillDir = join(this.pluginsDir, skillName);
      const skillMdPath = join(skillDir, 'SKILL.md');

      this.debug(`Loading plugin skill`, { name: skillName, dir: skillDir, disabled: isDisabled });

      // Check if skill directory exists
      if (!(await this.directoryExists(skillDir))) {
        errors.push({
          path: skillDir,
          message: `Plugin directory not found. Run 'agent skill install <url>' to install.`,
          type: 'NOT_FOUND',
        });
        continue;
      }

      // Load skill from directory
      const result = await this.loadSkill(skillMdPath, skillName, 'plugin');
      if (result.success) {
        // Mark disabled status based on plugin.enabled flag
        // If we reached here, either plugin is enabled OR includeDisabled is true
        skills.push({ ...result.skill, disabled: isDisabled });
      } else {
        errors.push(result.error);
      }
    }

    return { skills, errors };
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

          // Check for escape attempts:
          // - Unix: relativePath starting with ".." indicates parent traversal
          // - Windows: cross-drive symlinks (C:\ -> D:\malicious) return absolute paths
          //   from relative(), which isAbsolute() catches consistently
          // This provides uniform security protection across all platforms
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
