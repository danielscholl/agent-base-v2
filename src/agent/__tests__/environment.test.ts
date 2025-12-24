/**
 * Tests for environment detection module.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ChildProcess } from 'node:child_process';

// Create mock functions
const mockExec =
  jest.fn<
    (
      cmd: string,
      opts: object,
      callback?: (error: Error | null, result?: { stdout: string }) => void
    ) => ChildProcess
  >();
const mockAccess = jest.fn<(path: string, mode?: number) => Promise<void>>();
const mockPlatform = jest.fn<() => NodeJS.Platform>();
const mockRelease = jest.fn<() => string>();

// Mock modules BEFORE importing the module under test
jest.unstable_mockModule('node:child_process', () => ({
  exec: mockExec,
}));

jest.unstable_mockModule('node:fs/promises', () => ({
  access: mockAccess,
  constants: { F_OK: 0, R_OK: 4 },
}));

jest.unstable_mockModule('node:os', () => ({
  platform: mockPlatform,
  release: mockRelease,
}));

// Import after mocks are set up
const { detectEnvironment, formatEnvironmentSection, generateEnvironmentSection } =
  await import('../environment.js');
type EnvironmentContext = Awaited<ReturnType<typeof detectEnvironment>>;

describe('environment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: platform is darwin
    mockPlatform.mockReturnValue('darwin');
    mockRelease.mockReturnValue('24.1.0');
    // Default: not a git repo
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    // Default: git rev-parse fails
    mockExec.mockImplementation((_cmd, _opts, callback) => {
      if (callback) {
        (callback as (error: Error | null) => void)(new Error('Not a git repo'));
      }
      return {} as ChildProcess;
    });
  });

  describe('detectEnvironment', () => {
    it('detects non-git directory', async () => {
      const env = await detectEnvironment('/some/path');

      expect(env.workingDir).toBe('/some/path');
      expect(env.gitRepo).toBe(false);
      expect(env.gitBranch).toBeUndefined();
      expect(env.gitClean).toBeUndefined();
      expect(env.platform).toBe('macOS');
      expect(env.osVersion).toBe('Darwin 24.1.0');
      expect(env.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('detects git repository with .git folder', async () => {
      // .git folder exists
      mockAccess.mockResolvedValueOnce(undefined);

      // Mock git branch command
      mockExec.mockImplementation((cmd, _opts, callback) => {
        if (cmd.includes('branch --show-current')) {
          if (callback) {
            (callback as (error: Error | null, result: { stdout: string }) => void)(null, {
              stdout: 'main\n',
            });
          }
        } else if (cmd.includes('status --porcelain')) {
          if (callback) {
            (callback as (error: Error | null, result: { stdout: string }) => void)(null, {
              stdout: '',
            });
          }
        }
        return {} as ChildProcess;
      });

      const env = await detectEnvironment('/git/repo');

      expect(env.gitRepo).toBe(true);
      expect(env.gitBranch).toBe('main');
      expect(env.gitClean).toBe(true);
    });

    it('detects dirty git repository', async () => {
      mockAccess.mockResolvedValueOnce(undefined);

      mockExec.mockImplementation((cmd, _opts, callback) => {
        if (cmd.includes('branch --show-current')) {
          if (callback) {
            (callback as (error: Error | null, result: { stdout: string }) => void)(null, {
              stdout: 'feature-branch\n',
            });
          }
        } else if (cmd.includes('status --porcelain')) {
          if (callback) {
            (callback as (error: Error | null, result: { stdout: string }) => void)(null, {
              stdout: 'M src/file.ts\n',
            });
          }
        }
        return {} as ChildProcess;
      });

      const env = await detectEnvironment('/git/repo');

      expect(env.gitRepo).toBe(true);
      expect(env.gitBranch).toBe('feature-branch');
      expect(env.gitClean).toBe(false);
    });

    it('uses current working directory when not specified', async () => {
      const env = await detectEnvironment();

      expect(env.workingDir).toBe(process.cwd());
    });

    it('detects different platforms', async () => {
      mockPlatform.mockReturnValue('linux');
      mockRelease.mockReturnValue('5.15.0');

      const env = await detectEnvironment('/path');

      expect(env.platform).toBe('Linux');
      expect(env.osVersion).toBe('Linux 5.15.0');
    });

    it('detects Windows platform', async () => {
      mockPlatform.mockReturnValue('win32');
      mockRelease.mockReturnValue('10.0.19044');

      const env = await detectEnvironment('/path');

      expect(env.platform).toBe('Windows');
      expect(env.osVersion).toBe('Windows 10.0.19044');
    });
  });

  describe('formatEnvironmentSection', () => {
    it('formats non-git environment', () => {
      const context: EnvironmentContext = {
        workingDir: '/Users/dev/project',
        gitRepo: false,
        platform: 'macOS',
        osVersion: 'Darwin 24.1.0',
        date: '2025-12-24',
      };

      const section = formatEnvironmentSection(context);

      expect(section).toContain('# Environment');
      expect(section).toContain('Working directory: /Users/dev/project');
      expect(section).toContain('Git repository: No');
      expect(section).toContain('Platform: macOS (Darwin 24.1.0)');
      expect(section).toContain('Date: 2025-12-24');
    });

    it('formats git environment with clean status', () => {
      const context: EnvironmentContext = {
        workingDir: '/Users/dev/project',
        gitRepo: true,
        gitBranch: 'main',
        gitClean: true,
        platform: 'macOS',
        osVersion: 'Darwin 24.1.0',
        date: '2025-12-24',
      };

      const section = formatEnvironmentSection(context);

      expect(section).toContain('Git repository: Yes (branch: main, clean)');
    });

    it('formats git environment with dirty status', () => {
      const context: EnvironmentContext = {
        workingDir: '/Users/dev/project',
        gitRepo: true,
        gitBranch: 'feature',
        gitClean: false,
        platform: 'Linux',
        osVersion: 'Linux 5.15.0',
        date: '2025-12-24',
      };

      const section = formatEnvironmentSection(context);

      expect(section).toContain('Git repository: Yes (branch: feature, dirty)');
    });

    it('handles git repo without clean status', () => {
      const context: EnvironmentContext = {
        workingDir: '/path',
        gitRepo: true,
        gitBranch: 'main',
        gitClean: undefined,
        platform: 'macOS',
        osVersion: 'Darwin 24.1.0',
        date: '2025-12-24',
      };

      const section = formatEnvironmentSection(context);

      expect(section).toContain('Git repository: Yes (branch: main)');
      expect(section).not.toContain('clean');
      expect(section).not.toContain('dirty');
    });
  });

  describe('generateEnvironmentSection', () => {
    it('combines detection and formatting', async () => {
      const section = await generateEnvironmentSection('/some/path');

      expect(section).toContain('# Environment');
      expect(section).toContain('Working directory: /some/path');
      expect(section).toContain('Platform:');
      expect(section).toContain('Date:');
    });
  });
});
