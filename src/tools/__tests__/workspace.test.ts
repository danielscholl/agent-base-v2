/**
 * Tests for workspace utilities.
 * Tests path resolution, validation, and system error mapping.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  resolveWorkspacePath,
  resolveWorkspacePathSafe,
  getWorkspaceRoot,
  isFilesystemWritesEnabled,
  mapSystemErrorToToolError,
} from '../workspace.js';

// Test directory management
let testDir: string;
let originalWorkspaceRoot: string | undefined;

beforeEach(async () => {
  // Save original workspace root
  originalWorkspaceRoot = process.env['AGENT_WORKSPACE_ROOT'];

  // Create temp directory for tests
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-test-'));

  // Set workspace root to test directory
  process.env['AGENT_WORKSPACE_ROOT'] = testDir;
});

afterEach(async () => {
  // Restore original workspace root
  if (originalWorkspaceRoot !== undefined) {
    process.env['AGENT_WORKSPACE_ROOT'] = originalWorkspaceRoot;
  } else {
    delete process.env['AGENT_WORKSPACE_ROOT'];
  }

  // Clean up temp directory
  try {
    await fs.rm(testDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe('getWorkspaceRoot', () => {
  it('returns AGENT_WORKSPACE_ROOT when set', () => {
    expect(getWorkspaceRoot()).toBe(testDir);
  });

  it('returns cwd when AGENT_WORKSPACE_ROOT is not set', () => {
    delete process.env['AGENT_WORKSPACE_ROOT'];
    expect(getWorkspaceRoot()).toBe(process.cwd());
  });

  it('expands ~ in path', () => {
    process.env['AGENT_WORKSPACE_ROOT'] = '~/testdir';
    expect(getWorkspaceRoot()).toBe(path.join(os.homedir(), 'testdir'));
  });
});

describe('resolveWorkspacePath', () => {
  it('resolves relative paths within workspace', () => {
    const result = resolveWorkspacePath('subdir/file.txt');
    expect(result).toBe(path.join(testDir, 'subdir/file.txt'));
  });

  it('rejects paths with .. components', () => {
    const result = resolveWorkspacePath('../outside.txt');
    expect(typeof result).not.toBe('string');
    if (typeof result !== 'string') {
      expect(result.error).toBe('PERMISSION_DENIED');
      expect(result.message).toContain('..');
    }
  });

  it('rejects absolute paths outside workspace', () => {
    const result = resolveWorkspacePath('/etc/passwd');
    expect(typeof result).not.toBe('string');
    if (typeof result !== 'string') {
      expect(result.error).toBe('PERMISSION_DENIED');
    }
  });

  it('allows workspace root itself', () => {
    const result = resolveWorkspacePath('.');
    expect(result).toBe(testDir);
  });
});

describe('resolveWorkspacePathSafe', () => {
  it('resolves existing paths to real path', async () => {
    // Create a file
    const filePath = path.join(testDir, 'test.txt');
    await fs.writeFile(filePath, 'test');

    const resolved = await resolveWorkspacePathSafe('test.txt');
    expect(typeof resolved).toBe('string');
    // On macOS, temp dirs may be symlinks (/var -> /private/var)
    // Just verify the file name is in the resolved path
    if (typeof resolved === 'string') {
      expect(resolved.endsWith('test.txt')).toBe(true);
    }
  });

  it('detects symlink escape attempts', async () => {
    // Create a symlink pointing outside workspace
    const symlinkPath = path.join(testDir, 'escape');
    await fs.symlink('/tmp', symlinkPath);

    const resolved = await resolveWorkspacePathSafe('escape', undefined, true);
    expect(typeof resolved).not.toBe('string');
    if (typeof resolved !== 'string') {
      expect(resolved.error).toBe('PERMISSION_DENIED');
      expect(resolved.message).toContain('Symlink resolves outside workspace');
    }
  });

  it('allows symlinks within workspace', async () => {
    // Create a file and symlink to it
    const targetPath = path.join(testDir, 'target.txt');
    await fs.writeFile(targetPath, 'content');
    const symlinkPath = path.join(testDir, 'link.txt');
    await fs.symlink(targetPath, symlinkPath);

    const resolved = await resolveWorkspacePathSafe('link.txt', undefined, true);
    expect(typeof resolved).toBe('string');
    if (typeof resolved === 'string') {
      // Resolved path should be the real target
      expect(resolved.endsWith('target.txt')).toBe(true);
    }
  });

  it('returns error for non-existent path when requireExists is true', async () => {
    const resolved = await resolveWorkspacePathSafe('nonexistent.txt', undefined, true);
    expect(typeof resolved).not.toBe('string');
    if (typeof resolved !== 'string') {
      expect(resolved.error).toBe('NOT_FOUND');
    }
  });

  it('allows non-existent path when requireExists is false', async () => {
    const resolved = await resolveWorkspacePathSafe('new-file.txt');
    expect(typeof resolved).toBe('string');
  });

  it('checks parent directory for new files in symlinked directory', async () => {
    // Create a symlink to a directory outside workspace
    const symlinkPath = path.join(testDir, 'escape-dir');
    await fs.symlink('/tmp', symlinkPath);

    const resolved = await resolveWorkspacePathSafe('escape-dir/newfile.txt');
    expect(typeof resolved).not.toBe('string');
    if (typeof resolved !== 'string') {
      expect(resolved.error).toBe('PERMISSION_DENIED');
    }
  });
});

describe('isFilesystemWritesEnabled', () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    originalValue = process.env['AGENT_FILESYSTEM_WRITES_ENABLED'];
  });

  afterEach(() => {
    if (originalValue !== undefined) {
      process.env['AGENT_FILESYSTEM_WRITES_ENABLED'] = originalValue;
    } else {
      delete process.env['AGENT_FILESYSTEM_WRITES_ENABLED'];
    }
  });

  it('returns true when not set', () => {
    delete process.env['AGENT_FILESYSTEM_WRITES_ENABLED'];
    expect(isFilesystemWritesEnabled()).toBe(true);
  });

  it('returns true for "true"', () => {
    process.env['AGENT_FILESYSTEM_WRITES_ENABLED'] = 'true';
    expect(isFilesystemWritesEnabled()).toBe(true);
  });

  it('returns false for "false"', () => {
    process.env['AGENT_FILESYSTEM_WRITES_ENABLED'] = 'false';
    expect(isFilesystemWritesEnabled()).toBe(false);
  });

  it('returns false for "0"', () => {
    process.env['AGENT_FILESYSTEM_WRITES_ENABLED'] = '0';
    expect(isFilesystemWritesEnabled()).toBe(false);
  });
});

describe('mapSystemErrorToToolError', () => {
  it('maps ENOENT to NOT_FOUND', () => {
    const error = { code: 'ENOENT', message: 'File not found' };
    const result = mapSystemErrorToToolError(error);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('maps EACCES to PERMISSION_DENIED', () => {
    const error = { code: 'EACCES', message: 'Permission denied' };
    const result = mapSystemErrorToToolError(error);
    expect(result.code).toBe('PERMISSION_DENIED');
  });

  it('maps EPERM to PERMISSION_DENIED', () => {
    const error = { code: 'EPERM', message: 'Operation not permitted' };
    const result = mapSystemErrorToToolError(error);
    expect(result.code).toBe('PERMISSION_DENIED');
  });

  it('maps EISDIR to VALIDATION_ERROR', () => {
    const error = { code: 'EISDIR', message: 'Is a directory' };
    const result = mapSystemErrorToToolError(error);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('maps ENOSPC to IO_ERROR', () => {
    const error = { code: 'ENOSPC', message: 'No space left on device' };
    const result = mapSystemErrorToToolError(error);
    expect(result.code).toBe('IO_ERROR');
  });

  it('returns UNKNOWN for non-object errors', () => {
    const result = mapSystemErrorToToolError('some error');
    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('some error');
  });

  it('extracts error code from message as fallback', () => {
    const error = new Error('ENOENT: no such file or directory');
    const result = mapSystemErrorToToolError(error);
    expect(result.code).toBe('NOT_FOUND');
  });
});
