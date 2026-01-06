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
  initializeWorkspaceRoot,
  getWorkspaceInfo,
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

describe('initializeWorkspaceRoot', () => {
  it('uses env var when only env var is set', async () => {
    process.env['AGENT_WORKSPACE_ROOT'] = testDir;

    const result = await initializeWorkspaceRoot(undefined);

    expect(result.source).toBe('env');
    expect(result.workspaceRoot).toBe(testDir);
    expect(result.warning).toBeUndefined();
  });

  it('uses config when only config is set', async () => {
    delete process.env['AGENT_WORKSPACE_ROOT'];
    const configPath = path.join(os.tmpdir(), 'config-workspace');

    const result = await initializeWorkspaceRoot(configPath);

    expect(result.source).toBe('config');
    expect(result.workspaceRoot).toBe(path.resolve(configPath));
    // Should have set the env var
    expect(process.env['AGENT_WORKSPACE_ROOT']).toBe(path.resolve(configPath));
  });

  it('uses cwd when neither is set', async () => {
    delete process.env['AGENT_WORKSPACE_ROOT'];

    const result = await initializeWorkspaceRoot(undefined);

    expect(result.source).toBe('cwd');
    expect(result.workspaceRoot).toBe(process.cwd());
    expect(result.warning).toBeUndefined();
  });

  it('allows config to narrow env root (config inside env)', async () => {
    process.env['AGENT_WORKSPACE_ROOT'] = testDir;
    const narrowedPath = path.join(testDir, 'subdir');

    const result = await initializeWorkspaceRoot(narrowedPath);

    expect(result.source).toBe('config');
    // Workspace is pinned to real path (handles macOS /var -> /private/var symlinks)
    // The result should end with 'subdir' and be within the real testDir
    expect(result.workspaceRoot.endsWith('subdir')).toBe(true);
    // Env var should be updated to the effective (real) root
    expect(process.env['AGENT_WORKSPACE_ROOT']).toBe(result.workspaceRoot);
    expect(result.warning).toBeUndefined();
  });

  it('ignores config outside env root with warning', async () => {
    process.env['AGENT_WORKSPACE_ROOT'] = testDir;
    const outsidePath = '/etc/outside';

    const result = await initializeWorkspaceRoot(outsidePath);

    expect(result.source).toBe('env');
    expect(result.workspaceRoot).toBe(testDir);
    expect(result.warning).toContain('outside');
    expect(result.warning).toContain('ignored');
    // Env var should remain unchanged
    expect(process.env['AGENT_WORKSPACE_ROOT']).toBe(testDir);
  });

  it('detects symlink escape in config path narrowing', async () => {
    // Create a symlink inside testDir that points outside
    const symlinkPath = path.join(testDir, 'escape-link');
    await fs.symlink('/tmp', symlinkPath);

    process.env['AGENT_WORKSPACE_ROOT'] = testDir;

    const result = await initializeWorkspaceRoot(symlinkPath);

    // Should detect symlink escape and reject config
    expect(result.source).toBe('env');
    expect(result.workspaceRoot).toBe(testDir);
    expect(result.warning).toContain('symlink');
    expect(result.warning).toContain('ignored');
    // Env var should remain unchanged
    expect(process.env['AGENT_WORKSPACE_ROOT']).toBe(testDir);
  });

  it('detects parent symlink escape with non-existent leaf', async () => {
    // Create a symlink inside testDir that points outside
    const symlinkPath = path.join(testDir, 'link-to-outside');
    await fs.symlink('/tmp', symlinkPath);

    process.env['AGENT_WORKSPACE_ROOT'] = testDir;

    // Config path: testDir/link-to-outside/newroot (leaf doesn't exist)
    const configPath = path.join(symlinkPath, 'newroot');
    const result = await initializeWorkspaceRoot(configPath);

    // Should detect parent symlink escape and reject config
    expect(result.source).toBe('env');
    expect(result.workspaceRoot).toBe(testDir);
    expect(result.warning).toContain('symlink');
    expect(result.warning).toContain('parent');
    // Env var should remain unchanged
    expect(process.env['AGENT_WORKSPACE_ROOT']).toBe(testDir);
  });

  it('expands ~ in config path', async () => {
    delete process.env['AGENT_WORKSPACE_ROOT'];

    const result = await initializeWorkspaceRoot('~/my-workspace');

    expect(result.source).toBe('config');
    expect(result.workspaceRoot).toBe(path.join(os.homedir(), 'my-workspace'));
  });

  it('calls onDebug callback', async () => {
    delete process.env['AGENT_WORKSPACE_ROOT'];
    const debugMessages: string[] = [];
    const onDebug = (msg: string): void => {
      debugMessages.push(msg);
    };

    await initializeWorkspaceRoot('/some/path', onDebug);

    expect(debugMessages.length).toBeGreaterThan(0);
  });

  it('calls onDebug with warning when config ignored', async () => {
    process.env['AGENT_WORKSPACE_ROOT'] = testDir;
    const debugMessages: Array<{ msg: string; data?: unknown }> = [];
    const onDebug = (msg: string, data?: unknown): void => {
      debugMessages.push({ msg, data });
    };

    await initializeWorkspaceRoot('/etc/outside', onDebug);

    const warningMsg = debugMessages.find((d) => d.msg.includes('ignored'));
    expect(warningMsg).toBeDefined();
  });
});

describe('getWorkspaceInfo', () => {
  it('uses env var when only env var is set (Case 1)', async () => {
    process.env['AGENT_WORKSPACE_ROOT'] = testDir;

    const result = await getWorkspaceInfo(undefined);

    expect(result.source).toBe('env');
    expect(result.workspaceRoot).toBe(testDir);
    expect(result.warning).toBeUndefined();
  });

  it('uses config when only config is set (Case 2)', async () => {
    delete process.env['AGENT_WORKSPACE_ROOT'];
    const configPath = path.join(os.tmpdir(), 'config-workspace-info');

    const result = await getWorkspaceInfo(configPath);

    expect(result.source).toBe('config');
    expect(result.workspaceRoot).toBe(path.resolve(configPath));
    // Should NOT set the env var (read-only)
    expect(process.env['AGENT_WORKSPACE_ROOT']).toBeUndefined();
  });

  it('does not mutate process.env (read-only)', async () => {
    delete process.env['AGENT_WORKSPACE_ROOT'];
    const configPath = '/some/path';

    await getWorkspaceInfo(configPath);

    // Verify env was NOT mutated
    expect(process.env['AGENT_WORKSPACE_ROOT']).toBeUndefined();
  });

  it('uses cwd when neither is set (Case 4)', async () => {
    delete process.env['AGENT_WORKSPACE_ROOT'];

    const result = await getWorkspaceInfo(undefined);

    expect(result.source).toBe('cwd');
    expect(result.workspaceRoot).toBe(process.cwd());
    expect(result.warning).toBeUndefined();
  });

  it('allows config to narrow env root (Case 3 - config inside env)', async () => {
    process.env['AGENT_WORKSPACE_ROOT'] = testDir;
    const narrowedPath = path.join(testDir, 'subdir');

    const result = await getWorkspaceInfo(narrowedPath);

    expect(result.source).toBe('config');
    // Workspace should be the narrowed path
    expect(result.workspaceRoot.endsWith('subdir')).toBe(true);
    expect(result.warning).toBeUndefined();
    // Env var should NOT be modified (read-only)
    expect(process.env['AGENT_WORKSPACE_ROOT']).toBe(testDir);
  });

  it('ignores config outside env root with warning (Case 3)', async () => {
    process.env['AGENT_WORKSPACE_ROOT'] = testDir;
    const outsidePath = '/etc/outside';

    const result = await getWorkspaceInfo(outsidePath);

    expect(result.source).toBe('env');
    expect(result.workspaceRoot).toBe(testDir);
    expect(result.warning).toContain('outside');
    expect(result.warning).toContain('ignored');
    // Env var should remain unchanged
    expect(process.env['AGENT_WORKSPACE_ROOT']).toBe(testDir);
  });

  it('detects symlink escape in config path narrowing (Case 3)', async () => {
    // Create a symlink inside testDir that points outside
    const symlinkPath = path.join(testDir, 'escape-link-info');
    await fs.symlink('/tmp', symlinkPath);

    process.env['AGENT_WORKSPACE_ROOT'] = testDir;

    const result = await getWorkspaceInfo(symlinkPath);

    // Should detect symlink escape and reject config
    expect(result.source).toBe('env');
    expect(result.workspaceRoot).toBe(testDir);
    expect(result.warning).toContain('symlink');
    expect(result.warning).toContain('ignored');
    // Env var should remain unchanged
    expect(process.env['AGENT_WORKSPACE_ROOT']).toBe(testDir);
  });

  it('detects parent symlink escape with non-existent leaf (Case 3)', async () => {
    // Create a symlink inside testDir that points outside
    const symlinkPath = path.join(testDir, 'link-outside-info');
    await fs.symlink('/tmp', symlinkPath);

    process.env['AGENT_WORKSPACE_ROOT'] = testDir;

    // Config path: testDir/link-outside-info/newroot (leaf doesn't exist)
    const configPath = path.join(symlinkPath, 'newroot');
    const result = await getWorkspaceInfo(configPath);

    // Should detect parent symlink escape and reject config
    expect(result.source).toBe('env');
    expect(result.workspaceRoot).toBe(testDir);
    expect(result.warning).toContain('symlink');
    expect(result.warning).toContain('parent');
    // Env var should remain unchanged
    expect(process.env['AGENT_WORKSPACE_ROOT']).toBe(testDir);
  });

  it('expands ~ in config path', async () => {
    delete process.env['AGENT_WORKSPACE_ROOT'];

    const result = await getWorkspaceInfo('~/my-workspace-info');

    expect(result.source).toBe('config');
    expect(result.workspaceRoot).toBe(path.join(os.homedir(), 'my-workspace-info'));
    // Should NOT mutate env var
    expect(process.env['AGENT_WORKSPACE_ROOT']).toBeUndefined();
  });

  it('handles empty string config as undefined', async () => {
    process.env['AGENT_WORKSPACE_ROOT'] = testDir;

    const result = await getWorkspaceInfo('');

    expect(result.source).toBe('env');
    expect(result.workspaceRoot).toBe(testDir);
  });

  it('handles empty string env as not set', async () => {
    process.env['AGENT_WORKSPACE_ROOT'] = '';
    const configPath = '/some/config/path';

    const result = await getWorkspaceInfo(configPath);

    expect(result.source).toBe('config');
    expect(result.workspaceRoot).toBe(path.resolve(configPath));
  });
});
