/**
 * Skill dependency checking utilities.
 * Cross-platform CLI command availability verification.
 */

import { spawnSync } from 'node:child_process';

/**
 * Check if a CLI command is available on the system.
 * Uses 'which' on Unix, 'where' on Windows.
 *
 * @param command - Command name to check
 * @returns true if command is available
 */
export function checkCommandAvailable(command: string): boolean {
  const isWindows = process.platform === 'win32';
  const checker = isWindows ? 'where' : 'which';

  try {
    const result = spawnSync(checker, [command], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Parse the requires string from skill metadata.
 * Format: space-delimited command names (e.g., "gh git")
 *
 * @param requires - Space-delimited command list from metadata
 * @returns Array of command names
 */
export function parseRequires(requires: string | undefined): string[] {
  if (requires === undefined || requires.trim() === '') {
    return [];
  }
  return requires.trim().split(/\s+/).filter(Boolean);
}

/**
 * Check all required commands and return missing ones.
 *
 * @param requires - Array of command names to check
 * @returns Array of missing command names
 */
export function findMissingCommands(requires: string[]): string[] {
  return requires.filter((cmd) => !checkCommandAvailable(cmd));
}

/**
 * Result of dependency check for a skill.
 */
export interface DependencyCheckResult {
  /** Whether all dependencies are satisfied */
  available: boolean;
  /** Missing command names (empty if available) */
  missingCommands: string[];
  /** Human-readable reason if unavailable */
  reason?: string;
}

/**
 * Check dependencies for a skill based on its metadata.requires field.
 *
 * @param requires - Space-delimited command list from metadata
 * @returns Dependency check result
 */
export function checkSkillDependencies(requires: string | undefined): DependencyCheckResult {
  const commands = parseRequires(requires);

  if (commands.length === 0) {
    return { available: true, missingCommands: [] };
  }

  const missing = findMissingCommands(commands);

  if (missing.length === 0) {
    return { available: true, missingCommands: [] };
  }

  return {
    available: false,
    missingCommands: missing,
    reason: `missing commands: ${missing.join(', ')}`,
  };
}
