/**
 * Tests for Edit tool (file editing).
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { editTool } from '../edit.js';
import { Tool } from '../tool.js';

describe('Edit Tool', () => {
  const testSessionID = 'test-session-123';
  let tempDir: string;
  let originalWorkspaceRoot: string | undefined;
  let originalWritesEnabled: string | undefined;

  beforeEach(async () => {
    jest.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'edit-test-'));
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

  describe('editTool', () => {
    it('has correct ID', () => {
      expect(editTool.id).toBe('edit');
    });

    it('initializes with description', async () => {
      const initialized = await editTool.init();
      expect(initialized.description).toContain('Replace');
    });

    it('should replace unique text', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'Hello World');

      const initialized = await editTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { file_path: filePath, old_string: 'Hello', new_string: 'Goodbye' },
        ctx
      );

      expect(result.metadata.replacements).toBe(1);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Goodbye World');
    });

    it('should return error for non-unique match without replace_all', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'hello hello hello');

      const initialized = await editTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { file_path: filePath, old_string: 'hello', new_string: 'hi' },
        ctx
      );

      expect(result.title).toContain('Error');
      expect(result.metadata.error).toBe('VALIDATION_ERROR');
      expect(result.output).toContain('3 times');
    });

    it('should replace all occurrences with replace_all', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'hello hello hello');

      const initialized = await editTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { file_path: filePath, old_string: 'hello', new_string: 'hi', replace_all: true },
        ctx
      );

      expect(result.metadata.replacements).toBe(3);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('hi hi hi');
    });

    it('should return error when old_string not found', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'Hello World');

      const initialized = await editTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { file_path: filePath, old_string: 'Nonexistent', new_string: 'New' },
        ctx
      );

      expect(result.title).toContain('Error');
      expect(result.metadata.error).toBe('NOT_FOUND');
      expect(result.output).toContain('not found');
    });

    it('should return error for empty old_string', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'Hello World');

      const initialized = await editTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { file_path: filePath, old_string: '', new_string: 'New' },
        ctx
      );

      expect(result.title).toContain('Error');
      expect(result.metadata.error).toBe('VALIDATION_ERROR');
      expect(result.output).toContain('cannot be empty');
    });

    it('should return error when writes are disabled', async () => {
      process.env['AGENT_FILESYSTEM_WRITES_ENABLED'] = 'false';
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'Hello World');

      const initialized = await editTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { file_path: filePath, old_string: 'Hello', new_string: 'Hi' },
        ctx
      );

      expect(result.title).toContain('Error');
      expect(result.metadata.error).toBe('PERMISSION_DENIED');
      expect(result.output).toContain('Filesystem writes are disabled');
    });

    it('should return error for non-existent file', async () => {
      const initialized = await editTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { file_path: path.join(tempDir, 'nonexistent.txt'), old_string: 'a', new_string: 'b' },
        ctx
      );

      expect(result.title).toContain('Error');
      expect(result.metadata.error).toBeDefined();
      expect(result.output).toContain('Error');
    });

    it('should return error for binary file', async () => {
      const filePath = path.join(tempDir, 'binary.bin');
      const buffer = Buffer.alloc(100);
      buffer[0] = 0x00;
      buffer.write('hello', 50);
      await fs.writeFile(filePath, buffer);

      const initialized = await editTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { file_path: filePath, old_string: 'hello', new_string: 'hi' },
        ctx
      );

      expect(result.title).toContain('Error');
      expect(result.metadata.error).toBe('VALIDATION_ERROR');
      expect(result.output).toContain('binary');
    });

    it('should return error for directory', async () => {
      const initialized = await editTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { file_path: tempDir, old_string: 'a', new_string: 'b' },
        ctx
      );

      expect(result.title).toContain('Error');
      expect(result.metadata.error).toBe('VALIDATION_ERROR');
      expect(result.output).toContain('not a file');
    });

    it('should generate diff output', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'line1\nHello World\nline3');

      const initialized = await editTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { file_path: filePath, old_string: 'Hello', new_string: 'Goodbye' },
        ctx
      );

      expect(result.output).toContain('-Hello');
      expect(result.output).toContain('+Goodbye');
    });

    it('should track file size changes', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'Short');

      const initialized = await editTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { file_path: filePath, old_string: 'Short', new_string: 'Much longer text' },
        ctx
      );

      expect(result.metadata.originalSize).toBe(5);
      expect(result.metadata.newSize).toBeGreaterThan(5);
    });

    it('should stream metadata during edit', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'Hello World');

      const initialized = await editTool.init();
      const metadataMock = jest.fn();
      const ctx = {
        ...Tool.createNoopContext({ sessionID: testSessionID }),
        metadata: metadataMock,
      };

      await initialized.execute(
        { file_path: filePath, old_string: 'Hello', new_string: 'Hi' },
        ctx
      );

      expect(metadataMock).toHaveBeenCalled();
    });

    it('should handle multiline replacements', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'line1\nline2\nline3');

      const initialized = await editTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await initialized.execute(
        { file_path: filePath, old_string: 'line1\nline2', new_string: 'replaced' },
        ctx
      );

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('replaced\nline3');
    });
  });
});
