/**
 * Tests for Grep tool (content search).
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { grepTool } from '../grep.js';
import { Tool } from '../tool.js';

describe('Grep Tool', () => {
  const testSessionID = 'test-session-123';
  let tempDir: string;

  let originalWorkspaceRoot: string | undefined;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'grep-test-'));
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

  describe('grepTool', () => {
    it('has correct ID', () => {
      expect(grepTool.id).toBe('grep');
    });

    it('initializes with description', async () => {
      const initialized = await grepTool.init();
      expect(initialized.description).toContain('Search');
    });

    it('should find literal pattern matches', async () => {
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'Hello World\nGoodbye World');
      await fs.writeFile(path.join(tempDir, 'file2.txt'), 'No match here');

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ pattern: 'Hello', path: tempDir }, ctx);

      expect(result.output).toContain('file1.txt');
      expect(result.output).toContain('Hello World');
      expect(result.metadata.matchCount).toBe(1);
    });

    it('should find regex pattern matches', async () => {
      await fs.writeFile(path.join(tempDir, 'file.txt'), 'test123\ntest456\nother');

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { pattern: 'test\\d+', path: tempDir, regex: true },
        ctx
      );

      expect(result.output).toContain('test123');
      expect(result.output).toContain('test456');
      expect(result.metadata.matchCount).toBe(2);
    });

    it('should respect case_sensitive option', async () => {
      await fs.writeFile(path.join(tempDir, 'file.txt'), 'Hello\nhello\nHELLO');

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      // Case-insensitive search
      const result = await initialized.execute(
        { pattern: 'hello', path: tempDir, case_sensitive: false },
        ctx
      );

      expect(result.metadata.matchCount).toBe(3);
    });

    it('should filter by file pattern using include', async () => {
      await fs.writeFile(path.join(tempDir, 'code.ts'), 'function hello() {}');
      await fs.writeFile(path.join(tempDir, 'code.js'), 'function hello() {}');

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { pattern: 'hello', path: tempDir, include: '*.ts' },
        ctx
      );

      expect(result.output).toContain('code.ts');
      expect(result.output).not.toContain('code.js');
    });

    it('should respect max_matches limit', async () => {
      // Create file with many matches
      const content = Array(20).fill('matching line').join('\n');
      await fs.writeFile(path.join(tempDir, 'many.txt'), content);

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { pattern: 'matching', path: tempDir, max_matches: 5 },
        ctx
      );

      expect(result.metadata.matchCount).toBe(5);
      expect(result.metadata.truncated).toBe(true);
    });

    it('should return no matches message when pattern not found', async () => {
      await fs.writeFile(path.join(tempDir, 'file.txt'), 'some content');

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ pattern: 'nonexistent', path: tempDir }, ctx);

      expect(result.output).toContain('No matches');
      expect(result.metadata.matchCount).toBe(0);
    });

    it('should throw error for invalid regex', async () => {
      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await expect(
        initialized.execute({ pattern: '[invalid(', path: tempDir, regex: true }, ctx)
      ).rejects.toThrow('Invalid regex');
    });

    it('should search single file when path is file', async () => {
      const filePath = path.join(tempDir, 'target.txt');
      await fs.writeFile(filePath, 'line1\nline2\nline3');

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ pattern: 'line', path: filePath }, ctx);

      expect(result.metadata.filesSearched).toBe(1);
      expect(result.metadata.matchCount).toBe(3);
    });

    it('should skip binary files', async () => {
      // Create a binary file
      const binaryPath = path.join(tempDir, 'binary.bin');
      const buffer = Buffer.alloc(100);
      buffer[0] = 0x00; // Null byte makes it binary
      buffer.write('matching', 50);
      await fs.writeFile(binaryPath, buffer);

      // Create a text file
      await fs.writeFile(path.join(tempDir, 'text.txt'), 'matching');

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ pattern: 'matching', path: tempDir }, ctx);

      // Should only find in text file
      expect(result.output).toContain('text.txt');
      expect(result.output).not.toContain('binary.bin');
    });

    it('should include line numbers in output', async () => {
      await fs.writeFile(path.join(tempDir, 'file.txt'), 'line1\nmatch\nline3');

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ pattern: 'match', path: tempDir }, ctx);

      expect(result.output).toMatch(/file\.txt:2:/);
    });

    it('should truncate long snippets', async () => {
      const longLine = 'x'.repeat(300) + 'pattern' + 'x'.repeat(300);
      await fs.writeFile(path.join(tempDir, 'file.txt'), longLine);

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ pattern: 'pattern', path: tempDir }, ctx);

      expect(result.output).toContain('...');
      expect(result.output.length).toBeLessThan(longLine.length);
    });

    it('should search subdirectories', async () => {
      await fs.mkdir(path.join(tempDir, 'sub'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'root.txt'), 'match');
      await fs.writeFile(path.join(tempDir, 'sub', 'nested.txt'), 'match');

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ pattern: 'match', path: tempDir }, ctx);

      expect(result.output).toContain('root.txt');
      expect(result.output).toContain('nested.txt');
    });

    it('should handle case-insensitive regex search', async () => {
      await fs.writeFile(path.join(tempDir, 'file.txt'), 'Hello\nhello\nHELLO');

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { pattern: 'hello', path: tempDir, regex: true, case_sensitive: false },
        ctx
      );

      expect(result.metadata.matchCount).toBe(3);
    });

    it('should update progress when searching many files', async () => {
      // Create more than 10 files to trigger progress update
      for (let i = 0; i < 15; i++) {
        await fs.writeFile(path.join(tempDir, `file${String(i)}.txt`), 'content');
      }

      const initialized = await grepTool.init();
      const metadataCalls: Array<{ title?: string }> = [];
      const ctx = {
        ...Tool.createNoopContext({ sessionID: testSessionID }),
        metadata: (update: { title?: string }) => metadataCalls.push(update),
      };

      await initialized.execute({ pattern: 'content', path: tempDir }, ctx);

      // Should have progress updates
      expect(metadataCalls.length).toBeGreaterThan(1);
    });

    it('should show singular match in title for single match', async () => {
      await fs.writeFile(path.join(tempDir, 'file.txt'), 'unique pattern here');

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ pattern: 'unique', path: tempDir }, ctx);

      expect(result.title).toContain('1 match');
      expect(result.title).not.toContain('matches');
    });

    it('should show plural matches in title for multiple matches', async () => {
      await fs.writeFile(path.join(tempDir, 'file.txt'), 'match\nmatch');

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ pattern: 'match', path: tempDir }, ctx);

      expect(result.title).toContain('2 matches');
    });

    it('should skip hidden directories', async () => {
      await fs.mkdir(path.join(tempDir, '.hidden'), { recursive: true });
      await fs.writeFile(path.join(tempDir, '.hidden', 'file.txt'), 'secret');
      await fs.writeFile(path.join(tempDir, 'visible.txt'), 'secret');

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ pattern: 'secret', path: tempDir }, ctx);

      expect(result.output).toContain('visible.txt');
      expect(result.output).not.toContain('.hidden');
    });

    it('should default to workspace when path not provided', async () => {
      await fs.writeFile(path.join(tempDir, 'file.txt'), 'findme');

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      // No path specified
      const result = await initialized.execute({ pattern: 'findme' }, ctx);

      expect(result.metadata.matchCount).toBe(1);
    });

    it('should cap max_matches at MAX_MATCHES_CAP', async () => {
      // Create file with many matches
      const content = Array(250).fill('match').join('\n');
      await fs.writeFile(path.join(tempDir, 'many.txt'), content);

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { pattern: 'match', path: tempDir, max_matches: 1000 },
        ctx
      );

      // Should be capped at MAX_MATCHES_CAP (200)
      expect(result.metadata.matchCount).toBeLessThanOrEqual(200);
    });

    it('should show truncation note when max_matches reached', async () => {
      const content = Array(100).fill('match').join('\n');
      await fs.writeFile(path.join(tempDir, 'many.txt'), content);

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { pattern: 'match', path: tempDir, max_matches: 10 },
        ctx
      );

      expect(result.output).toContain('[Results limited');
    });

    it('should match all files with * include pattern', async () => {
      await fs.writeFile(path.join(tempDir, 'a.txt'), 'match');
      await fs.writeFile(path.join(tempDir, 'b.js'), 'match');

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { pattern: 'match', path: tempDir, include: '*' },
        ctx
      );

      expect(result.metadata.matchCount).toBe(2);
    });

    it('should match files with globstar pattern', async () => {
      await fs.mkdir(path.join(tempDir, 'deep'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'deep', 'file.txt'), 'match');

      const initialized = await grepTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { pattern: 'match', path: tempDir, include: '**/*' },
        ctx
      );

      expect(result.metadata.matchCount).toBe(1);
    });
  });
});
