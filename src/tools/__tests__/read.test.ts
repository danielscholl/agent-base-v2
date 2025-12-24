/**
 * Tests for Read tool (file reading).
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { readTool } from '../read.js';
import { Tool } from '../tool.js';

describe('Read Tool', () => {
  const testSessionID = 'test-session-123';
  let tempDir: string;
  let originalWorkspaceRoot: string | undefined;

  beforeEach(async () => {
    jest.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'read-test-'));
    originalWorkspaceRoot = process.env['AGENT_WORKSPACE_ROOT'];
    process.env['AGENT_WORKSPACE_ROOT'] = tempDir;
  });

  afterEach(async () => {
    if (originalWorkspaceRoot !== undefined) {
      process.env['AGENT_WORKSPACE_ROOT'] = originalWorkspaceRoot;
    } else {
      delete process.env['AGENT_WORKSPACE_ROOT'];
    }
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('readTool', () => {
    it('has correct ID', () => {
      expect(readTool.id).toBe('read');
    });

    it('initializes with description', async () => {
      const initialized = await readTool.init();
      expect(initialized.description).toContain('Read');
    });

    it('should read file with line numbers', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'line1\nline2\nline3');

      const initialized = await readTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ file_path: filePath }, ctx);

      expect(result.output).toContain('1\tline1');
      expect(result.output).toContain('2\tline2');
      expect(result.output).toContain('3\tline3');
      expect(result.metadata.totalLines).toBe(3);
    });

    it('should respect offset parameter', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'line1\nline2\nline3\nline4\nline5');

      const initialized = await readTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ file_path: filePath, offset: 3 }, ctx);

      expect(result.output).not.toContain('line1');
      expect(result.output).not.toContain('line2');
      expect(result.output).toContain('3\tline3');
      expect(result.metadata.startLine).toBe(3);
    });

    it('should respect limit parameter', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'line1\nline2\nline3\nline4\nline5');

      const initialized = await readTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ file_path: filePath, limit: 2 }, ctx);

      expect(result.output).toContain('1\tline1');
      expect(result.output).toContain('2\tline2');
      expect(result.output).not.toContain('line3');
      expect(result.metadata.truncated).toBe(true);
    });

    it('should throw error for non-existent file', async () => {
      const initialized = await readTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await expect(
        initialized.execute({ file_path: path.join(tempDir, 'nonexistent.txt') }, ctx)
      ).rejects.toThrow();
    });

    it('should throw error for directory', async () => {
      const initialized = await readTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await expect(initialized.execute({ file_path: tempDir }, ctx)).rejects.toThrow('not a file');
    });

    it('should throw error for binary file', async () => {
      const filePath = path.join(tempDir, 'binary.bin');
      const buffer = Buffer.alloc(100);
      buffer[0] = 0x00; // Null byte makes it binary
      await fs.writeFile(filePath, buffer);

      const initialized = await readTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await expect(initialized.execute({ file_path: filePath }, ctx)).rejects.toThrow('binary');
    });

    it('should throw error for offset beyond file length', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'line1\nline2');

      const initialized = await readTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await expect(initialized.execute({ file_path: filePath, offset: 100 }, ctx)).rejects.toThrow(
        'exceeds file length'
      );
    });

    it('should include truncation note when limited', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const lines = Array(10)
        .fill('line')
        .map((l: string, i) => `${l}${String(i)}`)
        .join('\n');
      await fs.writeFile(filePath, lines);

      const initialized = await readTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ file_path: filePath, limit: 3 }, ctx);

      expect(result.output).toContain('[Truncated');
      expect(result.output).toContain('offset=4 to continue');
    });

    it('should handle empty file', async () => {
      const filePath = path.join(tempDir, 'empty.txt');
      await fs.writeFile(filePath, '');

      const initialized = await readTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ file_path: filePath }, ctx);

      expect(result.metadata.totalLines).toBe(1);
    });

    it('should return correct title with line range', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'line1\nline2\nline3');

      const initialized = await readTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ file_path: filePath }, ctx);

      expect(result.title).toContain('lines 1-3');
    });

    it('should stream metadata during read', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'content');

      const initialized = await readTool.init();
      const metadataMock = jest.fn();
      const ctx = {
        ...Tool.createNoopContext({ sessionID: testSessionID }),
        metadata: metadataMock,
      };

      await initialized.execute({ file_path: filePath }, ctx);

      expect(metadataMock).toHaveBeenCalled();
    });
  });
});
