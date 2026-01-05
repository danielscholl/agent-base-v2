/**
 * Skill plugin installer.
 * Handles git clone, update, and removal of plugin skills.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, rm, access, readdir, rename } from 'node:fs/promises';
import { parseSkillMd } from './parser.js';
import { readFile } from 'node:fs/promises';

const execFileAsync = promisify(execFile);

/**
 * Options for installing a skill from git.
 */
export interface InstallOptions {
  /** Git repository URL */
  url: string;
  /** Branch/tag/commit to checkout */
  ref?: string;
  /** Override skill name (defaults to repo name) */
  name?: string;
  /** Base directory for plugins (defaults to ~/.agent/plugins) */
  baseDir?: string;
}

/**
 * Result of a skill installation operation.
 */
export interface InstallResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Skill name (from manifest or derived) */
  skillName: string;
  /** Path to installed skill directory */
  path: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Result of a skill update operation.
 */
export interface UpdateResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Skill name */
  skillName: string;
  /** Whether any changes were pulled */
  updated: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Get the default plugins directory.
 * Plugins are stored separately from user skills for clear semantics.
 */
export function getPluginsDir(baseDir?: string): string {
  return baseDir ?? join(homedir(), '.agent', 'plugins');
}

/**
 * Extract repository name from git URL.
 */
export function extractRepoName(url: string): string {
  // Handle HTTPS git URL formats:
  // https://github.com/user/repo.git
  // https://github.com/user/repo
  const match = url.match(/\/([^/]+?)(\.git)?$/);
  return match?.[1] ?? 'unknown-skill';
}

/**
 * Check if a path exists.
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate URL format.
 * Only HTTPS URLs are supported to ensure config schema compatibility.
 * SSH URLs (git@) are not supported because z.url() validation rejects them.
 */
function isValidGitUrl(url: string): boolean {
  // Only allow https:// URLs (SSH git@ URLs don't pass z.url() schema validation)
  return /^https:\/\/[\w.-]+/.test(url);
}

/**
 * Validate ref to prevent shell injection.
 */
function isValidRef(ref: string): boolean {
  // Allow alphanumeric, dots, dashes, underscores, slashes (for branch names)
  return /^[\w./-]+$/.test(ref);
}

/**
 * Validate skill name to prevent path traversal attacks.
 * Skill names must:
 * - Start with alphanumeric character
 * - Only contain alphanumeric, hyphens, and underscores
 * - Be 1-64 characters long
 * - Not contain path separators (/, \, ..)
 */
function isValidSkillName(name: string): boolean {
  // Only allow alphanumeric, hyphens, and underscores
  // Must start with alphanumeric, max 64 characters
  return /^[a-z0-9][a-z0-9-_]{0,63}$/i.test(name);
}

/**
 * Install a skill plugin from a git repository.
 *
 * @param options - Installation options
 * @returns Installation result
 */
export async function installSkill(options: InstallOptions): Promise<InstallResult> {
  const { url, ref, name } = options;
  const pluginsDir = getPluginsDir(options.baseDir);
  const repoName = name ?? extractRepoName(url);
  const targetDir = join(pluginsDir, repoName);

  // Validate inputs to prevent shell injection
  if (!isValidGitUrl(url)) {
    return {
      success: false,
      skillName: repoName,
      path: targetDir,
      error: `Invalid git URL format. Only HTTPS URLs are supported (e.g., https://github.com/user/repo).`,
    };
  }

  if (ref !== undefined && ref !== '' && !isValidRef(ref)) {
    return {
      success: false,
      skillName: repoName,
      path: targetDir,
      error: `Invalid ref format. Only alphanumeric, dots, dashes, underscores, and slashes allowed.`,
    };
  }

  try {
    // Check if already installed
    if (await pathExists(targetDir)) {
      return {
        success: false,
        skillName: repoName,
        path: targetDir,
        error: `Skill "${repoName}" already exists at ${targetDir}. Use update to refresh or remove first.`,
      };
    }

    // Ensure base directory exists
    await mkdir(pluginsDir, { recursive: true });

    // Clone repository using execFile to avoid shell injection
    const cloneArgs = ['clone', '--depth', '1'];
    if (ref !== undefined && ref !== '') {
      // For tags and branches, use --branch
      // For commit SHAs, we'll checkout after clone
      const isCommitSha = /^[a-f0-9]{7,40}$/i.test(ref);
      if (!isCommitSha) {
        cloneArgs.push('--branch', ref);
      }
    }
    cloneArgs.push(url, targetDir);

    await execFileAsync('git', cloneArgs, { timeout: 60000 });

    // If ref is a commit SHA, checkout after clone
    if (ref !== undefined && ref !== '' && /^[a-f0-9]{7,40}$/i.test(ref)) {
      // Need to fetch the specific commit first (shallow clone may not have it)
      await execFileAsync('git', ['fetch', '--depth', '1', 'origin', ref], {
        cwd: targetDir,
        timeout: 60000,
      });
      await execFileAsync('git', ['checkout', ref], { cwd: targetDir });
    }

    // Validate SKILL.md exists
    const skillMdPath = join(targetDir, 'SKILL.md');
    if (!(await pathExists(skillMdPath))) {
      // Rollback: remove cloned directory
      await rm(targetDir, { recursive: true, force: true });
      return {
        success: false,
        skillName: repoName,
        path: targetDir,
        error: `Repository does not contain a 'SKILL.md' file. Not a valid skill package.`,
      };
    }

    // Validate SKILL.md content (skip name match - we'll rename if needed)
    const content = await readFile(skillMdPath, 'utf-8');
    const parseResult = parseSkillMd(content, repoName, { skipNameValidation: true });

    if (!parseResult.success) {
      // Rollback: remove cloned directory
      await rm(targetDir, { recursive: true, force: true });
      return {
        success: false,
        skillName: repoName,
        path: targetDir,
        error: `Invalid 'SKILL.md': ${parseResult.error}`,
      };
    }

    // Use the name from the manifest
    const actualName = parseResult.content.manifest.name;

    // Validate skill name to prevent path traversal attacks
    if (!isValidSkillName(actualName)) {
      // Rollback: remove cloned directory
      await rm(targetDir, { recursive: true, force: true });
      return {
        success: false,
        skillName: repoName,
        path: targetDir,
        error: `Invalid skill name in 'SKILL.md': "${actualName}". Must start with alphanumeric and contain only alphanumeric, hyphens, and underscores (max 64 chars).`,
      };
    }

    // If manifest name differs from directory name, rename the directory
    if (actualName !== repoName) {
      const newTargetDir = join(pluginsDir, actualName);
      if (await pathExists(newTargetDir)) {
        // Rollback: remove cloned directory
        await rm(targetDir, { recursive: true, force: true });
        return {
          success: false,
          skillName: actualName,
          path: newTargetDir,
          error: `Skill "${actualName}" already exists. Choose a different name with '--name' option.`,
        };
      }
      // Use fs.rename instead of shell mv for portability
      await rename(targetDir, newTargetDir);
      return {
        success: true,
        skillName: actualName,
        path: newTargetDir,
      };
    }

    return {
      success: true,
      skillName: actualName,
      path: targetDir,
    };
  } catch (error) {
    // Cleanup on error
    try {
      await rm(targetDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      skillName: repoName,
      path: targetDir,
      error: `Failed to install: ${message}`,
    };
  }
}

/**
 * Update an installed skill plugin by pulling latest changes.
 *
 * @param skillName - Name of the skill to update
 * @param baseDir - Base directory for plugins
 * @returns Update result
 */
export async function updateSkill(skillName: string, baseDir?: string): Promise<UpdateResult> {
  // Validate skill name to prevent path traversal attacks
  if (!isValidSkillName(skillName)) {
    return {
      success: false,
      skillName,
      updated: false,
      error: `Invalid skill name: "${skillName}". Must start with alphanumeric and contain only alphanumeric, hyphens, and underscores (max 64 chars).`,
    };
  }

  const pluginsDir = getPluginsDir(baseDir);
  const targetDir = join(pluginsDir, skillName);

  try {
    // Check if skill exists
    if (!(await pathExists(targetDir))) {
      return {
        success: false,
        skillName,
        updated: false,
        error: `Skill "${skillName}" not found at ${targetDir}`,
      };
    }

    // Check if it's a git repository
    const gitDir = join(targetDir, '.git');
    if (!(await pathExists(gitDir))) {
      return {
        success: false,
        skillName,
        updated: false,
        error: `Skill "${skillName}" is not a git repository`,
      };
    }

    // Check if we're on a detached HEAD (tag/commit install)
    const { stdout: headRef } = await execFileAsync('git', ['symbolic-ref', '-q', 'HEAD'], {
      cwd: targetDir,
    }).catch(() => ({ stdout: '' }));

    if (headRef.trim() === '') {
      // Detached HEAD - can't pull, but can fetch and show if outdated
      return {
        success: true,
        skillName,
        updated: false,
        error: `Skill "${skillName}" is pinned to a specific ref. Remove and reinstall to update.`,
      };
    }

    // Get current HEAD before pull
    const { stdout: beforeHash } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: targetDir,
    });

    // Pull latest changes
    await execFileAsync('git', ['pull', '--ff-only'], { cwd: targetDir, timeout: 60000 });

    // Get HEAD after pull
    const { stdout: afterHash } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: targetDir,
    });

    const updated = beforeHash.trim() !== afterHash.trim();

    return {
      success: true,
      skillName,
      updated,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      skillName,
      updated: false,
      error: `Failed to update: ${message}`,
    };
  }
}

/**
 * Remove an installed skill plugin.
 *
 * @param skillName - Name of the skill to remove
 * @param baseDir - Base directory for plugins
 * @returns Whether removal succeeded
 */
export async function removeSkill(skillName: string, baseDir?: string): Promise<boolean> {
  // Validate skill name to prevent path traversal attacks
  if (!isValidSkillName(skillName)) {
    return false;
  }

  const pluginsDir = getPluginsDir(baseDir);
  const targetDir = join(pluginsDir, skillName);

  try {
    // Check if skill exists
    if (!(await pathExists(targetDir))) {
      return false;
    }

    // Remove directory
    await rm(targetDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * List installed plugin skills (git-tracked only).
 *
 * @param baseDir - Base directory for plugins
 * @returns Array of installed skill names
 */
export async function listInstalledPlugins(baseDir?: string): Promise<string[]> {
  const pluginsDir = getPluginsDir(baseDir);

  try {
    if (!(await pathExists(pluginsDir))) {
      return [];
    }

    const entries = await readdir(pluginsDir, { withFileTypes: true });
    const plugins: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Must be a git repo with SKILL.md to be a plugin
        const gitPath = join(pluginsDir, entry.name, '.git');
        const skillMdPath = join(pluginsDir, entry.name, 'SKILL.md');
        if ((await pathExists(gitPath)) && (await pathExists(skillMdPath))) {
          plugins.push(entry.name);
        }
      }
    }

    return plugins.sort();
  } catch {
    return [];
  }
}
