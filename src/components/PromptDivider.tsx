/**
 * PromptDivider component for displaying path+branch and horizontal rule.
 * Shows before each input prompt to match agent-base styling.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
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
 */
function getGitStatus(cwd: string): GitStatus | null {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

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
      // No upstream configured
    }

    return { branch, ahead, behind };
  } catch {
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
 * Get status indicator.
 */
function getBranchIndicator(ahead: number, behind: number): string {
  if (ahead > 0 && behind > 0) {
    return '⎇'; // Diverged
  }
  if (ahead > 0 || behind > 0) {
    return '⎇'; // Has changes
  }
  return '⎇'; // Clean
}

/**
 * Props for PromptDivider component.
 */
export interface PromptDividerProps {
  /** Working directory path */
  cwd: string;
}

/**
 * PromptDivider component.
 * Shows right-justified path+branch and horizontal rule.
 */
export function PromptDivider({ cwd }: PromptDividerProps): React.ReactElement {
  const { stdout } = useStdout();
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [terminalWidth, setTerminalWidth] = useState(stdout.columns);

  useEffect(() => {
    const status = getGitStatus(cwd);
    setGitStatus(status);
  }, [cwd]);

  useEffect(() => {
    const handleResize = (): void => {
      setTerminalWidth(stdout.columns);
    };

    stdout.on('resize', handleResize);
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  const formattedPath = formatPath(cwd);
  const branchDisplay = gitStatus?.branch ?? null;
  const indicator = gitStatus !== null ? getBranchIndicator(gitStatus.ahead, gitStatus.behind) : '';

  // Create horizontal rule
  const hrWidth = Math.max(10, terminalWidth - 2);
  const horizontalRule = '─'.repeat(hrWidth);

  return (
    <Box flexDirection="column">
      {/* Right-justified path + branch */}
      <Box justifyContent="flex-end">
        <Text color="cyan">{formattedPath}</Text>
        {branchDisplay !== null && (
          <>
            <Text> </Text>
            <Text color="magenta">
              [{indicator} {branchDisplay}]
            </Text>
          </>
        )}
      </Box>
      {/* Horizontal rule */}
      <Text dimColor>{horizontalRule}</Text>
    </Box>
  );
}
