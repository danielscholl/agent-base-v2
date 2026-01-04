/**
 * Tests for List tool (directory listing).
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { listTool } from '../list.js';
import { Tool } from '../tool.js';

describe('List Tool', () => {
  const testSessionID = 'test-session-123';
  let tempDir: string;
  let originalWorkspaceRoot: string | undefined;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'list-test-'));
    // Set workspace root to temp dir to allow access
    originalWorkspaceRoot = process.env['AGENT_WORKSPACE_ROOT'];
    process.env['AGENT_WORKSPACE_ROOT'] = tempDir;
  });

  afterEach(async () => {
    // Restore workspace root
    if (originalWorkspaceRoot !== undefined) {
      process.env['AGENT_WORKSPACE_ROOT'] = originalWorkspaceRoot;
    } else {
      delete process.env['AGENT_WORKSPACE_ROOT'];
    }
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('listTool', () => {
    it('has correct ID', () => {
      expect(listTool.id).toBe('list');
    });

    it('initializes with description', async () => {
      const initialized = await listTool.init();
      expect(initialized.description).toContain('List');
    });

    it('should list files in directory', async () => {
      // Create test files
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(tempDir, 'file2.txt'), 'content2');

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ path: tempDir }, ctx);

      expect(result.output).toContain('file1.txt');
      expect(result.output).toContain('file2.txt');
      expect(result.metadata.entryCount).toBe(2);
    });

    it('should show directories with [dir] prefix', async () => {
      // Create test directory
      await fs.mkdir(path.join(tempDir, 'subdir'));

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ path: tempDir }, ctx);

      expect(result.output).toContain('[dir]');
      expect(result.output).toContain('subdir');
    });

    it('should list hidden files when include_hidden is true', async () => {
      // Create hidden file
      await fs.writeFile(path.join(tempDir, '.hidden'), 'secret');
      await fs.writeFile(path.join(tempDir, 'visible.txt'), 'public');

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ path: tempDir, include_hidden: true }, ctx);

      expect(result.output).toContain('.hidden');
      expect(result.output).toContain('visible.txt');
    });

    it('should hide hidden files by default', async () => {
      // Create hidden file
      await fs.writeFile(path.join(tempDir, '.hidden'), 'secret');
      await fs.writeFile(path.join(tempDir, 'visible.txt'), 'public');

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ path: tempDir }, ctx);

      expect(result.output).not.toContain('.hidden');
      expect(result.output).toContain('visible.txt');
    });

    it('should return empty output for empty directory', async () => {
      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ path: tempDir }, ctx);

      expect(result.output).toBe('');
      expect(result.metadata.entryCount).toBe(0);
    });

    it('should return error for non-existent path', async () => {
      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ path: path.join(tempDir, 'nonexistent') }, ctx);

      expect(result.title).toContain('Error');
      expect(result.metadata.error).toBeDefined();
      expect(result.output).toContain('Error');
    });

    it('should show file sizes', async () => {
      // Create test file
      await fs.writeFile(path.join(tempDir, 'file.txt'), 'content');

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ path: tempDir }, ctx);

      // Should show size in parentheses
      expect(result.output).toContain('file.txt');
      expect(result.output).toMatch(/\(\d+B\)/);
    });

    it('should respect max_entries limit', async () => {
      // Create many files
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(path.join(tempDir, `file${String(i)}.txt`), 'content');
      }

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ path: tempDir, max_entries: 5 }, ctx);

      expect(result.metadata.truncated).toBe(true);
      expect(result.metadata.entryCount).toBe(5);
    });

    it('should return correct title with entry count', async () => {
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'a');
      await fs.writeFile(path.join(tempDir, 'file2.txt'), 'b');
      await fs.writeFile(path.join(tempDir, 'file3.txt'), 'c');

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ path: tempDir }, ctx);

      expect(result.title).toContain('3');
      expect(result.title).toContain('entries');
    });

    it('should list recursively when recursive is true', async () => {
      await fs.mkdir(path.join(tempDir, 'subdir'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'root.txt'), 'content');
      await fs.writeFile(path.join(tempDir, 'subdir', 'nested.txt'), 'content');

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ path: tempDir, recursive: true }, ctx);

      expect(result.output).toContain('root.txt');
      expect(result.output).toContain('nested.txt');
    });

    it('should sort directories before files', async () => {
      await fs.mkdir(path.join(tempDir, 'zdir'));
      await fs.writeFile(path.join(tempDir, 'afile.txt'), 'content');

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ path: tempDir }, ctx);

      // Directory should come before file even though 'a' < 'z'
      const dirIndex = result.output.indexOf('[dir]');
      const fileIndex = result.output.indexOf('afile.txt');
      expect(dirIndex).toBeLessThan(fileIndex);
    });

    it('should return error for file path instead of directory', async () => {
      const filePath = path.join(tempDir, 'file.txt');
      await fs.writeFile(filePath, 'content');

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ path: filePath }, ctx);

      expect(result.title).toContain('Error');
      expect(result.metadata.error).toBe('VALIDATION_ERROR');
      expect(result.output).toContain('not a directory');
    });

    it('should format KB sizes correctly', async () => {
      // Create 2KB file
      await fs.writeFile(path.join(tempDir, 'medium.txt'), 'x'.repeat(2048));

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ path: tempDir }, ctx);

      expect(result.output).toMatch(/\d+\.\d+KB\)/);
    });

    it('should format MB sizes correctly', async () => {
      // Create 1.5MB file
      await fs.writeFile(path.join(tempDir, 'large.txt'), 'x'.repeat(1.5 * 1024 * 1024));

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ path: tempDir }, ctx);

      expect(result.output).toMatch(/\d+\.\d+MB\)/);
    });

    it('should filter hidden files in recursive mode', async () => {
      await fs.mkdir(path.join(tempDir, 'subdir'));
      await fs.writeFile(path.join(tempDir, 'subdir', '.hidden'), 'secret');
      await fs.writeFile(path.join(tempDir, 'subdir', 'visible.txt'), 'public');

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ path: tempDir, recursive: true }, ctx);

      expect(result.output).not.toContain('.hidden');
      expect(result.output).toContain('visible.txt');
    });

    it('should include hidden files in recursive mode when include_hidden is true', async () => {
      await fs.mkdir(path.join(tempDir, 'subdir'));
      await fs.writeFile(path.join(tempDir, 'subdir', '.hidden'), 'secret');
      await fs.writeFile(path.join(tempDir, 'subdir', 'visible.txt'), 'public');

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        {
          path: tempDir,
          recursive: true,
          include_hidden: true,
        },
        ctx
      );

      expect(result.output).toContain('.hidden');
      expect(result.output).toContain('visible.txt');
    });

    it('should show truncation note when results are truncated', async () => {
      // Create many files
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(path.join(tempDir, `file${String(i)}.txt`), 'content');
      }

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ path: tempDir, max_entries: 3 }, ctx);

      expect(result.output).toContain('[Truncated');
      expect(result.metadata.truncated).toBe(true);
    });

    it('should truncate during recursive walk', async () => {
      await fs.mkdir(path.join(tempDir, 'deep'));
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(path.join(tempDir, 'deep', `file${String(i)}.txt`), 'content');
      }

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        {
          path: tempDir,
          recursive: true,
          max_entries: 3,
        },
        ctx
      );

      expect(result.metadata.truncated).toBe(true);
      expect(result.metadata.entryCount).toBe(3);
    });

    it('should skip hidden directories in recursive mode', async () => {
      await fs.mkdir(path.join(tempDir, '.hidden_dir'));
      await fs.writeFile(path.join(tempDir, '.hidden_dir', 'file.txt'), 'content');
      await fs.mkdir(path.join(tempDir, 'visible_dir'));
      await fs.writeFile(path.join(tempDir, 'visible_dir', 'file.txt'), 'content');

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ path: tempDir, recursive: true }, ctx);

      expect(result.output).not.toContain('.hidden_dir');
      expect(result.output).toContain('visible_dir');
    });

    it('should default to current directory when path not provided', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content');

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      // Without path, should use workspace root (tempDir)
      const result = await initialized.execute({}, ctx);

      expect(result.output).toContain('test.txt');
    });

    it('should cap max_entries at MAX_ENTRIES_CAP', async () => {
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(path.join(tempDir, `file${String(i)}.txt`), 'content');
      }

      const initialized = await listTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      // Request more than MAX_ENTRIES_CAP (500)
      const result = await initialized.execute({ path: tempDir, max_entries: 1000 }, ctx);

      // Should still work and return all 10 files (since 10 < 500)
      expect(result.metadata.entryCount).toBe(10);
    });
  });
});
