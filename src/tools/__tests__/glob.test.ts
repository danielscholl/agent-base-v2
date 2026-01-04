/**
 * Tests for Glob tool (file pattern matching).
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { globTool } from '../glob.js';
import { Tool } from '../tool.js';

describe('Glob Tool', () => {
  const testSessionID = 'test-session-123';
  let tempDir: string;
  let originalWorkspaceRoot: string | undefined;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'glob-test-'));
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

  describe('globTool', () => {
    it('has correct ID', () => {
      expect(globTool.id).toBe('glob');
    });

    it('initializes with description', async () => {
      const initialized = await globTool.init();
      expect(initialized.description).toContain('pattern');
    });

    it('should find files matching simple pattern', async () => {
      // Create test files
      await fs.writeFile(path.join(tempDir, 'file1.ts'), 'content1');
      await fs.writeFile(path.join(tempDir, 'file2.ts'), 'content2');
      await fs.writeFile(path.join(tempDir, 'file3.js'), 'content3');

      const initialized = await globTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      // Use *.ts pattern (not **/*.ts which only matches in subdirs)
      const result = await initialized.execute({ pattern: '*.ts', path: tempDir }, ctx);

      expect(result.output).toContain('file1.ts');
      expect(result.output).toContain('file2.ts');
      expect(result.output).not.toContain('file3.js');
      expect(result.metadata.fileCount).toBe(2);
    });

    it('should find files in subdirectories with **', async () => {
      // Create nested structure
      await fs.mkdir(path.join(tempDir, 'subdir'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'subdir', 'nested.ts'), 'content');

      const initialized = await globTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      // **/*.ts matches files in subdirectories
      const result = await initialized.execute({ pattern: '**/*.ts', path: tempDir }, ctx);

      expect(result.output).toContain('nested.ts');
      expect(result.metadata.fileCount).toBeGreaterThanOrEqual(1);
    });

    it('should respect max_results limit', async () => {
      // Create many files
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(path.join(tempDir, `file${String(i)}.txt`), 'content');
      }

      const initialized = await globTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { pattern: '*.txt', path: tempDir, max_results: 5 },
        ctx
      );

      expect(result.metadata.truncated).toBe(true);
      expect(result.metadata.fileCount).toBe(5);
    });

    it('should return no files message when no matches', async () => {
      const initialized = await globTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ pattern: '*.nonexistent', path: tempDir }, ctx);

      expect(result.output).toContain('No files');
      expect(result.metadata.fileCount).toBe(0);
    });

    it('should match files with wildcard', async () => {
      await fs.writeFile(path.join(tempDir, 'file.ts'), 'content');
      await fs.writeFile(path.join(tempDir, 'file.tsx'), 'content');
      await fs.writeFile(path.join(tempDir, 'file.js'), 'content');

      const initialized = await globTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ pattern: '*.ts*', path: tempDir }, ctx);

      expect(result.output).toContain('file.ts');
      expect(result.output).toContain('file.tsx');
    });

    it('should skip hidden files and directories', async () => {
      await fs.mkdir(path.join(tempDir, '.hidden'), { recursive: true });
      await fs.writeFile(path.join(tempDir, '.hidden', 'secret.ts'), 'content');
      await fs.writeFile(path.join(tempDir, '.hiddenfile.ts'), 'content');
      await fs.writeFile(path.join(tempDir, 'visible.ts'), 'content');

      const initialized = await globTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ pattern: '*.ts', path: tempDir }, ctx);

      expect(result.output).toContain('visible.ts');
      expect(result.output).not.toContain('secret.ts');
      expect(result.output).not.toContain('.hiddenfile.ts');
    });

    it('should return correct title with match count', async () => {
      await fs.writeFile(path.join(tempDir, 'a.ts'), 'content');
      await fs.writeFile(path.join(tempDir, 'b.ts'), 'content');

      const initialized = await globTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ pattern: '*.ts', path: tempDir }, ctx);

      expect(result.title).toContain('2');
      expect(result.title).toContain('file');
    });

    it('should handle question mark wildcard', async () => {
      await fs.writeFile(path.join(tempDir, 'f1.ts'), 'content');
      await fs.writeFile(path.join(tempDir, 'f2.ts'), 'content');
      await fs.writeFile(path.join(tempDir, 'f12.ts'), 'content');

      const initialized = await globTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ pattern: 'f?.ts', path: tempDir }, ctx);

      expect(result.output).toContain('f1.ts');
      expect(result.output).toContain('f2.ts');
      expect(result.output).not.toContain('f12.ts');
    });

    it('should sort by modification time', async () => {
      // Create files with different mtimes
      await fs.writeFile(path.join(tempDir, 'older.ts'), 'content');
      await new Promise((r) => setTimeout(r, 10));
      await fs.writeFile(path.join(tempDir, 'newer.ts'), 'content');

      const initialized = await globTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ pattern: '*.ts', path: tempDir }, ctx);

      // Newer file should appear first (sorted by mtime descending)
      const newerIndex = result.output.indexOf('newer.ts');
      const olderIndex = result.output.indexOf('older.ts');
      expect(newerIndex).toBeLessThan(olderIndex);
    });

    it('should return error for non-directory path', async () => {
      const filePath = path.join(tempDir, 'file.txt');
      await fs.writeFile(filePath, 'content');

      const initialized = await globTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ pattern: '*.ts', path: filePath }, ctx);

      expect(result.title).toContain('Error');
      expect(result.metadata.error).toBe('VALIDATION_ERROR');
      expect(result.output).toContain('not a directory');
    });
  });
});
