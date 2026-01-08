/**
 * Centralized path resolution for agent assets.
 *
 * Handles cross-platform asset resolution for:
 * - Development: `bun run dev` (assets in src/)
 * - Bundled: `bun dist/index.js` (assets in dist/)
 * - Compiled binary: installed agent executable
 *
 * Resolution order:
 * 1. $AGENT_HOME or ~/.agent/ (installed location)
 * 2. Next to executable (legacy compiled binary)
 * 3. Relative to module (dev/bundled)
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

/**
 * Get workspace root from environment or current directory.
 * Priority: AGENT_WORKSPACE_ROOT env var > process.cwd()
 *
 * This is a local implementation to avoid circular dependencies with tools/workspace.ts.
 */
function getWorkspaceRootLocal(): string {
  const envRoot = process.env['AGENT_WORKSPACE_ROOT'];
  if (envRoot !== undefined && envRoot !== '') {
    // Expand ~ to home directory
    const expanded = envRoot.startsWith('~') ? join(homedir(), envRoot.slice(1)) : envRoot;
    return resolve(expanded);
  }
  return process.cwd();
}

/**
 * Get the agent home directory.
 * This is the canonical location for all agent data (config, sessions, assets).
 *
 * @returns Path to agent home ($AGENT_HOME or ~/.agent/)
 */
export function getAgentHome(): string {
  const envHome = process.env.AGENT_HOME;
  if (envHome !== undefined && envHome !== '') {
    return envHome;
  }
  return join(homedir(), '.agent');
}

/**
 * Get the prompts directory.
 *
 * Resolution order:
 * 1. $AGENT_HOME/prompts or ~/.agent/prompts (installed)
 * 2. Next to executable (legacy compiled binary)
 * 3. Same dir as module (bundled dist/)
 * 4. Parent dir of module (development src/)
 *
 * @returns Path to prompts directory
 */
export function getPromptsDir(): string {
  // 1. Installed location (~/.agent/prompts/)
  const installedPath = join(getAgentHome(), 'prompts');
  if (existsSync(installedPath)) {
    return installedPath;
  }

  // 2. Next to executable (compiled binary with bundled assets)
  const execRelativePath = join(dirname(process.execPath), 'prompts');
  if (existsSync(execRelativePath)) {
    return execRelativePath;
  }

  // 3. Relative to module (dev/bundled)
  const moduleDir = dirname(fileURLToPath(import.meta.url));

  // Bundled: dist/index.js -> dist/prompts/
  const sameDirPath = join(moduleDir, 'prompts');
  if (existsSync(sameDirPath)) {
    return sameDirPath;
  }

  // Dev: src/utils/paths.ts -> src/prompts/
  const parentDirPath = join(moduleDir, '..', 'prompts');
  if (existsSync(parentDirPath)) {
    return parentDirPath;
  }

  // Fallback to installed path (will fail but gives meaningful error)
  return installedPath;
}

/**
 * Get the bundled skills directory.
 *
 * Resolution order:
 * 1. $AGENT_HOME/_bundled_skills or ~/.agent/_bundled_skills (installed)
 * 2. Next to executable (legacy compiled binary)
 * 3. Same dir as module (bundled dist/)
 * 4. Parent dir of module (development src/)
 *
 * @returns Path to bundled skills directory
 */
export function getBundledSkillsDir(): string {
  // 1. Installed location (~/.agent/_bundled_skills/)
  const installedPath = join(getAgentHome(), '_bundled_skills');
  if (existsSync(installedPath)) {
    return installedPath;
  }

  // 2. Next to executable (compiled binary with bundled assets)
  const execRelativePath = join(dirname(process.execPath), '_bundled_skills');
  if (existsSync(execRelativePath)) {
    return execRelativePath;
  }

  // 3. Relative to module (dev/bundled)
  const moduleDir = dirname(fileURLToPath(import.meta.url));

  // Bundled: dist/index.js -> dist/_bundled_skills/
  const sameDirPath = join(moduleDir, '_bundled_skills');
  if (existsSync(sameDirPath)) {
    return sameDirPath;
  }

  // Dev: src/utils/paths.ts -> src/_bundled_skills/
  const parentDirPath = join(moduleDir, '..', '_bundled_skills');
  if (existsSync(parentDirPath)) {
    return parentDirPath;
  }

  // Fallback to installed path (will fail but gives meaningful error)
  return installedPath;
}

/**
 * Get the bundled commands directory.
 *
 * Resolution order:
 * 1. $AGENT_HOME/_bundled_commands or ~/.agent/_bundled_commands (installed)
 * 2. Next to executable (legacy compiled binary)
 * 3. Same dir as module (bundled dist/)
 * 4. Parent dir of module (development src/)
 *
 * @returns Path to bundled commands directory
 */
export function getBundledCommandsDir(): string {
  // 1. Installed location (~/.agent/_bundled_commands/)
  const installedPath = join(getAgentHome(), '_bundled_commands');
  if (existsSync(installedPath)) {
    return installedPath;
  }

  // 2. Next to executable (compiled binary with bundled assets)
  const execRelativePath = join(dirname(process.execPath), '_bundled_commands');
  if (existsSync(execRelativePath)) {
    return execRelativePath;
  }

  // 3. Relative to module (dev/bundled)
  const moduleDir = dirname(fileURLToPath(import.meta.url));

  // Bundled: dist/index.js -> dist/_bundled_commands/
  const sameDirPath = join(moduleDir, '_bundled_commands');
  if (existsSync(sameDirPath)) {
    return sameDirPath;
  }

  // Dev: src/utils/paths.ts -> src/_bundled_commands/
  const parentDirPath = join(moduleDir, '..', '_bundled_commands');
  if (existsSync(parentDirPath)) {
    return parentDirPath;
  }

  // Fallback to installed path (will fail but gives meaningful error)
  return installedPath;
}

/**
 * Get the Claude directory path (.claude/) for Claude Code compatibility.
 * Respects AGENT_WORKSPACE_ROOT environment variable for proper sandbox support.
 *
 * @param workspaceRoot - Workspace root directory (defaults to AGENT_WORKSPACE_ROOT or cwd)
 * @returns Path to .claude directory
 */
export function getClaudeDir(workspaceRoot?: string): string {
  return join(workspaceRoot ?? getWorkspaceRootLocal(), '.claude');
}

/**
 * Get the Claude skills directory path (.claude/skills/).
 *
 * @param workspaceRoot - Workspace root directory (defaults to cwd)
 * @returns Path to .claude/skills directory
 */
export function getClaudeSkillsDir(workspaceRoot?: string): string {
  return join(getClaudeDir(workspaceRoot), 'skills');
}

/**
 * Get the Claude commands directory path (.claude/commands/).
 *
 * @param workspaceRoot - Workspace root directory (defaults to cwd)
 * @returns Path to .claude/commands directory
 */
export function getClaudeCommandsDir(workspaceRoot?: string): string {
  return join(getClaudeDir(workspaceRoot), 'commands');
}
