/**
 * PromptLine component for displaying path with git branch.
 * Shows working directory with git status indicator.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { execSync } from 'child_process';
import { homedir } from 'os';

/**
 * Git status information.
 */
interface GitStatus {
  /** Current branch name */
  branch: string | null;
  /** Whether ahead of remote */
  ahead: number;
  /** Whether behind remote */
  behind: number;
}

/**
 * Get git branch and status information.
 * Cached to avoid repeated git calls.
 */
function getGitStatus(cwd: string): GitStatus | null {
  try {
    // Get current branch
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // Get ahead/behind status
    let ahead = 0;
    let behind = 0;

    try {
      const status = execSync('git rev-list --left-right --count HEAD...@{upstream}', {
        cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      const [aheadStr, behindStr] = status.split('\t');
      ahead = parseInt(aheadStr ?? '0', 10);
      behind = parseInt(behindStr ?? '0', 10);
    } catch {
      // No upstream configured - that's fine
    }

    return { branch, ahead, behind };
  } catch {
    // Not a git repository or git not available
    return null;
  }
}

/**
 * Format path with home directory substitution.
 */
function formatPath(path: string): string {
  const home = homedir();
  if (path.startsWith(home)) {
    return '~' + path.slice(home.length);
  }
  return path;
}

/**
 * Get status indicator arrow.
 * ↗ = ahead only
 * ↙ = behind only
 * ↕ = both ahead and behind (diverged)
 * (none) = in sync or no upstream
 */
function getStatusArrow(ahead: number, behind: number): string {
  if (ahead > 0 && behind > 0) {
    return '↕'; // Diverged
  }
  if (ahead > 0) {
    return '↗'; // Ahead
  }
  if (behind > 0) {
    return '↙'; // Behind
  }
  return ''; // In sync
}

/**
 * Props for PromptLine component.
 */
export interface PromptLineProps {
  /** Working directory path */
  cwd: string;
  /** Optional custom color for path */
  pathColor?: string;
  /** Optional custom color for branch */
  branchColor?: string;
}

/**
 * PromptLine component.
 * Displays working directory with git branch and status.
 *
 * Example output:
 * ```
 * ~/source/project [↗ main]
 * ```
 */
export function PromptLine({
  cwd,
  pathColor = 'cyan',
  branchColor = 'magenta',
}: PromptLineProps): React.ReactElement {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);

  useEffect(() => {
    // Fetch git status on mount and when cwd changes
    const status = getGitStatus(cwd);
    setGitStatus(status);
  }, [cwd]);

  const formattedPath = formatPath(cwd);
  const arrow = gitStatus !== null ? getStatusArrow(gitStatus.ahead, gitStatus.behind) : '';
  const branchDisplay = gitStatus?.branch ?? null;

  return (
    <Box>
      <Text color={pathColor}>{formattedPath}</Text>
      {branchDisplay !== null && (
        <>
          <Text> </Text>
          <Text color={branchColor}>[</Text>
          {arrow !== '' && <Text color={branchColor}>{arrow} </Text>}
          <Text color={branchColor}>{branchDisplay}</Text>
          <Text color={branchColor}>]</Text>
        </>
      )}
    </Box>
  );
}
