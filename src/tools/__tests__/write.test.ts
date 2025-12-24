/**
 * Tests for Write tool (file writing).
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { writeTool } from '../write.js';
import { Tool } from '../tool.js';

describe('Write Tool', () => {
  const testSessionID = 'test-session-123';
  let tempDir: string;
  let originalWorkspaceRoot: string | undefined;
  let originalWritesEnabled: string | undefined;

  beforeEach(async () => {
    jest.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'write-test-'));
    originalWorkspaceRoot = process.env['AGENT_WORKSPACE_ROOT'];
    originalWritesEnabled = process.env['AGENT_FILESYSTEM_WRITES_ENABLED'];
    process.env['AGENT_WORKSPACE_ROOT'] = tempDir;
    process.env['AGENT_FILESYSTEM_WRITES_ENABLED'] = 'true';
  });

  afterEach(async () => {
    if (originalWorkspaceRoot !== undefined) {
      process.env['AGENT_WORKSPACE_ROOT'] = originalWorkspaceRoot;
    } else {
      delete process.env['AGENT_WORKSPACE_ROOT'];
    }
    if (originalWritesEnabled !== undefined) {
      process.env['AGENT_FILESYSTEM_WRITES_ENABLED'] = originalWritesEnabled;
    } else {
      delete process.env['AGENT_FILESYSTEM_WRITES_ENABLED'];
    }
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('writeTool', () => {
    it('has correct ID', () => {
      expect(writeTool.id).toBe('write');
    });

    it('initializes with description', async () => {
      const initialized = await writeTool.init();
      expect(initialized.description).toContain('Write');
    });

    it('should create new file', async () => {
      const filePath = path.join(tempDir, 'new.txt');

      const initialized = await writeTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { file_path: filePath, content: 'Hello World' },
        ctx
      );

      expect(result.title).toContain('Created');
      expect(result.metadata.existedBefore).toBe(false);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Hello World');
    });

    it('should overwrite existing file', async () => {
      const filePath = path.join(tempDir, 'existing.txt');
      await fs.writeFile(filePath, 'Old content');

      const initialized = await writeTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { file_path: filePath, content: 'New content' },
        ctx
      );

      expect(result.title).toContain('Overwrote');
      expect(result.metadata.existedBefore).toBe(true);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('New content');
    });

    it('should create parent directories', async () => {
      const filePath = path.join(tempDir, 'subdir', 'deep', 'file.txt');

      const initialized = await writeTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await initialized.execute({ file_path: filePath, content: 'Nested' }, ctx);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Nested');
    });

    it('should throw error when writes are disabled', async () => {
      process.env['AGENT_FILESYSTEM_WRITES_ENABLED'] = 'false';

      const initialized = await writeTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await expect(
        initialized.execute({ file_path: path.join(tempDir, 'test.txt'), content: 'test' }, ctx)
      ).rejects.toThrow('Filesystem writes are disabled');
    });

    it('should track bytes written', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const content = 'Hello World';

      const initialized = await writeTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ file_path: filePath, content }, ctx);

      expect(result.metadata.bytesWritten).toBe(Buffer.byteLength(content));
    });

    it('should stream metadata during write', async () => {
      const filePath = path.join(tempDir, 'test.txt');

      const initialized = await writeTool.init();
      const metadataMock = jest.fn();
      const ctx = {
        ...Tool.createNoopContext({ sessionID: testSessionID }),
        metadata: metadataMock,
      };

      await initialized.execute({ file_path: filePath, content: 'test' }, ctx);

      expect(metadataMock).toHaveBeenCalled();
    });

    it('should handle unicode content', async () => {
      const filePath = path.join(tempDir, 'unicode.txt');
      const content = '日本語テスト 🚀';

      const initialized = await writeTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await initialized.execute({ file_path: filePath, content }, ctx);

      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe(content);
    });

    it('should include bytes in output message', async () => {
      const filePath = path.join(tempDir, 'test.txt');

      const initialized = await writeTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ file_path: filePath, content: 'Hello' }, ctx);

      expect(result.output).toContain('5 bytes');
    });

    it('should throw error for content exceeding max size', async () => {
      const filePath = path.join(tempDir, 'large.txt');
      // Create content larger than DEFAULT_MAX_WRITE_BYTES (10MB)
      const largeContent = 'x'.repeat(11 * 1024 * 1024);

      const initialized = await writeTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await expect(
        initialized.execute({ file_path: filePath, content: largeContent }, ctx)
      ).rejects.toThrow('exceeds max write limit');
    });

    it('should throw error for path outside workspace', async () => {
      const initialized = await writeTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await expect(
        initialized.execute({ file_path: '/etc/passwd', content: 'test' }, ctx)
      ).rejects.toThrow();
    });

    it('should throw error for relative path traversal', async () => {
      const initialized = await writeTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await expect(
        initialized.execute(
          { file_path: path.join(tempDir, '..', '..', 'outside.txt'), content: 'test' },
          ctx
        )
      ).rejects.toThrow();
    });

    it('should handle empty content', async () => {
      const filePath = path.join(tempDir, 'empty.txt');

      const initialized = await writeTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ file_path: filePath, content: '' }, ctx);

      expect(result.metadata.bytesWritten).toBe(0);
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('');
    });

    it('should throw error for directory path', async () => {
      const initialized = await writeTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      // Writing to an existing directory should fail
      await expect(
        initialized.execute({ file_path: tempDir, content: 'test' }, ctx)
      ).rejects.toThrow();
    });
  });
});
