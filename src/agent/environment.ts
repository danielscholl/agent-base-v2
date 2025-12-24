/**
 * Environment context detection for system prompt injection.
 *
 * Detects working directory, git status, platform info, and current date
 * to provide runtime context to the LLM.
 *
 * @module agent/environment
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { platform, release } from 'node:os';
import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';

const execAsync = promisify(exec);

/**
 * Environment context for system prompt injection.
 */
export interface EnvironmentContext {
  /** Current working directory */
  workingDir: string;
  /** Whether this is a git repository */
  gitRepo: boolean;
  /** Current git branch (if git repo) */
  gitBranch?: string;
  /** Whether the working tree is clean (no uncommitted changes) */
  gitClean?: boolean;
  /** Platform name (darwin, linux, win32) */
  platform: string;
  /** OS version string */
  osVersion: string;
  /** Current date in ISO format (YYYY-MM-DD) */
  date: string;
}

/**
 * Check if a directory is a git repository.
 */
async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await access(join(dir, '.git'), constants.F_OK);
    return true;
  } catch {
    // Try git rev-parse as fallback (handles worktrees, submodules)
    try {
      await execAsync('git rev-parse --git-dir', { cwd: dir });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Get the current git branch name.
 */
async function getGitBranch(dir: string): Promise<string | undefined> {
  try {
    const { stdout } = await execAsync('git branch --show-current', { cwd: dir });
    const branch = stdout.trim();
    // If empty, might be detached HEAD
    if (!branch) {
      const { stdout: refStdout } = await execAsync('git rev-parse --short HEAD', { cwd: dir });
      return `HEAD detached at ${refStdout.trim()}`;
    }
    return branch;
  } catch {
    return undefined;
  }
}

/**
 * Check if the git working tree is clean (no uncommitted changes).
 */
async function isGitClean(dir: string): Promise<boolean | undefined> {
  try {
    const { stdout } = await execAsync('git status --porcelain', { cwd: dir });
    return stdout.trim() === '';
  } catch {
    return undefined;
  }
}

/**
 * Get a human-readable platform name.
 */
function getPlatformName(plat: string): string {
  switch (plat) {
    case 'darwin':
      return 'macOS';
    case 'linux':
      return 'Linux';
    case 'win32':
      return 'Windows';
    case 'freebsd':
      return 'FreeBSD';
    default:
      return plat;
  }
}

/**
 * Get OS version string.
 */
function getOsVersion(): string {
  const plat = platform();
  const rel = release();

  switch (plat) {
    case 'darwin':
      // Darwin kernel version maps to macOS version
      // Darwin 23.x = macOS 14 (Sonoma), Darwin 24.x = macOS 15 (Sequoia)
      return `Darwin ${rel}`;
    case 'linux':
      return `Linux ${rel}`;
    case 'win32':
      return `Windows ${rel}`;
    default:
      return `${plat} ${rel}`;
  }
}

/**
 * Detect current environment context.
 *
 * @param workingDir - Working directory (defaults to process.cwd())
 * @returns Environment context for prompt injection
 *
 * @example
 * ```typescript
 * const env = await detectEnvironment();
 * console.log(env.workingDir);  // '/Users/dev/project'
 * console.log(env.gitBranch);   // 'main'
 * console.log(env.gitClean);    // true
 * ```
 */
export async function detectEnvironment(workingDir?: string): Promise<EnvironmentContext> {
  const dir = workingDir ?? process.cwd();
  const isRepo = await isGitRepo(dir);

  const context: EnvironmentContext = {
    workingDir: dir,
    gitRepo: isRepo,
    platform: getPlatformName(platform()),
    osVersion: getOsVersion(),
    date: new Date().toISOString().split('T')[0] ?? new Date().toISOString().substring(0, 10),
  };

  // Add git details if this is a repo
  if (isRepo) {
    const [branch, clean] = await Promise.all([getGitBranch(dir), isGitClean(dir)]);
    context.gitBranch = branch;
    context.gitClean = clean;
  }

  return context;
}

/**
 * Format environment context as a markdown section for prompt injection.
 *
 * @param context - Environment context to format
 * @returns Markdown-formatted environment section
 *
 * @example
 * ```typescript
 * const env = await detectEnvironment();
 * const section = formatEnvironmentSection(env);
 * // Returns:
 * // # Environment
 * //
 * // Working directory: /Users/dev/project
 * // Git repository: Yes (branch: main, clean)
 * // Platform: macOS (Darwin 24.1.0)
 * // Date: 2025-12-24
 * ```
 */
export function formatEnvironmentSection(context: EnvironmentContext): string {
  const lines: string[] = ['# Environment', ''];

  lines.push(`Working directory: ${context.workingDir}`);

  if (context.gitRepo) {
    const branchInfo = context.gitBranch ?? 'unknown';
    const cleanStatus =
      context.gitClean === true ? 'clean' : context.gitClean === false ? 'dirty' : '';
    const gitDetails = cleanStatus
      ? `branch: ${branchInfo}, ${cleanStatus}`
      : `branch: ${branchInfo}`;
    lines.push(`Git repository: Yes (${gitDetails})`);
  } else {
    lines.push('Git repository: No');
  }

  lines.push(`Platform: ${context.platform} (${context.osVersion})`);
  lines.push(`Date: ${context.date}`);

  return lines.join('\n');
}

/**
 * Generate environment section for system prompt.
 * Combines detection and formatting in one call.
 *
 * @param workingDir - Working directory (defaults to process.cwd())
 * @returns Markdown-formatted environment section
 */
export async function generateEnvironmentSection(workingDir?: string): Promise<string> {
  const context = await detectEnvironment(workingDir);
  return formatEnvironmentSection(context);
}
