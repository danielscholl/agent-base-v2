/**
 * Tests for Bash tool (shell command execution).
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { bashTool } from '../bash.js';
import { Tool } from '../tool.js';

describe('Bash Tool', () => {
  const testSessionID = 'test-session-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('bashTool', () => {
    it('has correct ID', () => {
      expect(bashTool.id).toBe('bash');
    });

    it('initializes with description', async () => {
      const initialized = await bashTool.init();
      expect(initialized.description).toContain('shell');
    });

    it('should execute simple command', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ command: 'echo "hello"' }, ctx);

      expect(result.output).toContain('hello');
      expect(result.metadata.exitCode).toBe(0);
    });

    it('should return exit code for failed command', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ command: 'exit 42' }, ctx);

      expect(result.metadata.exitCode).toBe(42);
      expect(result.title).toContain('Failed');
    });

    it('should capture stderr', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ command: 'echo "error" >&2' }, ctx);

      expect(result.output).toContain('error');
    });

    it('should use description in title if provided', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { command: 'echo test', description: 'Print test message' },
        ctx
      );

      expect(result.title).toContain('Print test message');
    });

    it('should return (no output) for empty output', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ command: 'true' }, ctx);

      expect(result.output).toContain('(no output)');
    });

    it('should respect timeout parameter', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      // This should complete quickly
      const result = await initialized.execute({ command: 'echo "fast"', timeout: 5000 }, ctx);

      expect(result.metadata.exitCode).toBe(0);
    });

    it('should track execution duration', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ command: 'sleep 0.1' }, ctx);

      expect(result.metadata.durationMs).toBeGreaterThanOrEqual(50);
    });

    it('should include command in metadata', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ command: 'echo test' }, ctx);

      expect(result.metadata.command).toBe('echo test');
    });

    it('should handle command not found', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ command: 'nonexistent_command_12345' }, ctx);

      // Command not found typically returns exit code 127
      expect(result.metadata.exitCode).toBe(127);
    });

    it('should handle multi-line output', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { command: 'echo "line1"; echo "line2"; echo "line3"' },
        ctx
      );

      expect(result.output).toContain('line1');
      expect(result.output).toContain('line2');
      expect(result.output).toContain('line3');
    });

    it('should show Completed for successful command', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ command: 'echo ok' }, ctx);

      expect(result.title).toContain('Completed');
    });

    it('should handle special characters in output', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ command: 'echo "special: <>&\\"\\$"' }, ctx);

      expect(result.output).toContain('special');
    });

    it('should handle environment variables', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ command: 'echo $HOME' }, ctx);

      expect(result.output).not.toBe('$HOME');
      expect(result.metadata.exitCode).toBe(0);
    });

    it('should stream metadata during execution', async () => {
      const initialized = await bashTool.init();
      const metadataMock = jest.fn();
      const ctx = {
        ...Tool.createNoopContext({ sessionID: testSessionID }),
        metadata: metadataMock,
      };

      await initialized.execute({ command: 'echo test' }, ctx);

      expect(metadataMock).toHaveBeenCalled();
    });

    it('should cap timeout at max value', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      // Should not throw even with huge timeout (gets capped)
      const result = await initialized.execute({ command: 'echo fast', timeout: 9999999 }, ctx);

      expect(result.metadata.exitCode).toBe(0);
    });

    it('should handle stderr with stdout', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { command: 'echo "stdout" && echo "stderr" >&2' },
        ctx
      );

      expect(result.output).toContain('stdout');
      expect(result.output).toContain('stderr');
    });

    it('should handle process that outputs nothing', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ command: ':' }, ctx);

      expect(result.output).toContain('(no output)');
    });

    it('should respect workdir parameter', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ command: 'pwd', workdir: '/tmp' }, ctx);

      expect(result.output).toContain('/tmp');
    });

    it('should handle abort signal', async () => {
      const initialized = await bashTool.init();
      const abortController = new AbortController();
      const ctx = {
        ...Tool.createNoopContext({ sessionID: testSessionID }),
        abort: abortController.signal,
      };

      // Start a slow command
      const promise = initialized.execute({ command: 'sleep 10', timeout: 30000 }, ctx);

      // Abort after a short delay
      setTimeout(() => {
        abortController.abort();
      }, 100);

      const result = await promise;
      expect(result.title).toContain('killed');
      expect(result.metadata.exitCode).toBeNull();
    }, 30000);

    it('should truncate large stdout output', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      // Generate output larger than MAX_OUTPUT_BYTES (30KB)
      const result = await initialized.execute({ command: 'yes "line" | head -n 10000' }, ctx);

      expect(result.metadata.truncated).toBe(true);
      expect(result.output).toContain('truncated');
    });

    it('should truncate large stderr output', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      // Generate stderr output larger than MAX_OUTPUT_BYTES
      const result = await initialized.execute({ command: 'yes "error" | head -n 10000 >&2' }, ctx);

      expect(result.metadata.truncated).toBe(true);
    });

    it('should show Command killed for null exitCode', async () => {
      const initialized = await bashTool.init();
      const abortController = new AbortController();
      const ctx = {
        ...Tool.createNoopContext({ sessionID: testSessionID }),
        abort: abortController.signal,
      };

      const promise = initialized.execute({ command: 'sleep 5' }, ctx);

      setTimeout(() => {
        abortController.abort();
      }, 50);

      const result = await promise;
      expect(result.title).toContain('killed');
    }, 30000);

    it('should use command slice for display when no description', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const longCommand = 'echo "' + 'a'.repeat(100) + '"';
      const result = await initialized.execute({ command: longCommand }, ctx);

      // Title should contain truncated command (first 50 chars)
      expect(result.title.length).toBeLessThan(longCommand.length + 20);
    });

    it('should handle pipe in output stream callback', async () => {
      const initialized = await bashTool.init();
      const metadataCalls: Array<{ title?: string }> = [];
      const ctx = {
        ...Tool.createNoopContext({ sessionID: testSessionID }),
        metadata: (update: { title?: string }) => metadataCalls.push(update),
      };

      await initialized.execute({ command: 'echo "line1\nline2\nline3"' }, ctx);

      // Should have received metadata updates during execution
      expect(metadataCalls.length).toBeGreaterThan(0);
    });

    it('should add stderr separator when both stdout and stderr', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ command: 'echo "out" && echo "err" >&2' }, ctx);

      expect(result.output).toContain('--- stderr ---');
    });

    it('should handle process spawn error gracefully', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      // Try to execute a command in a non-existent directory
      const result = await initialized.execute(
        { command: 'echo test', workdir: '/nonexistent/path/that/does/not/exist' },
        ctx
      );

      expect(result.output).toContain('Error');
      expect(result.metadata.exitCode).toBeNull();
    });

    it('should handle error message as non-Error type', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      // Execute command that will fail in a way that produces error
      const result = await initialized.execute(
        { command: 'cd /nonexistent_directory_12345', workdir: '/nonexistent' },
        ctx
      );

      expect(result.output).toContain('Error');
    });

    it('should handle remaining stderr after truncation', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      // Generate much more than MAX_OUTPUT_BYTES of stderr
      // The `remaining > 0` check needs to be false on second chunk
      const result = await initialized.execute(
        { command: 'for i in $(seq 1 5000); do echo "error line $i" >&2; done' },
        ctx
      );

      expect(result.metadata.truncated).toBe(true);
    });

    it('should handle remaining stdout after truncation', async () => {
      const initialized = await bashTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      // Generate exactly enough to test the `remaining > 0` branch
      const result = await initialized.execute(
        { command: 'for i in $(seq 1 5000); do echo "output line $i with some extra text"; done' },
        ctx
      );

      expect(result.metadata.truncated).toBe(true);
    });
  });
});
