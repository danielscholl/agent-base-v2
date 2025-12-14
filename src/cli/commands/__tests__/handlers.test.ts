/**
 * Tests for command handlers.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { CommandContext } from '../types.js';
import type { SubprocessResult } from '../../../runtime/subprocess.js';

// Mock subprocess module
jest.unstable_mockModule('../../../runtime/subprocess.js', () => ({
  spawnProcess: jest.fn(),
}));

// Mock telemetry functions
jest.unstable_mockModule('../../../telemetry/aspire.js', () => ({
  startAspireDashboardWithConfig: jest.fn(),
  stopAspireDashboardWithConfig: jest.fn(),
  getAspireStatus: jest.fn(),
  getAspireUrl: jest.fn(),
}));

/**
 * Create a mock command context for testing.
 */
function createMockContext(): CommandContext & {
  outputs: Array<{ content: string; type?: string }>;
  exitCalled: boolean;
} {
  const context: CommandContext & {
    outputs: Array<{ content: string; type?: string }>;
    exitCalled: boolean;
  } = {
    config: null,
    outputs: [],
    exitCalled: false,
    onOutput: (content: string, type?: string) => {
      context.outputs.push({ content, type });
    },
    exit: () => {
      context.exitCalled = true;
    },
  };
  return context;
}

describe('Command Handlers', () => {
  let spawnProcess: jest.MockedFunction<
    (cmd: string[], options?: unknown) => Promise<SubprocessResult>
  >;
  let startAspireDashboardWithConfig: jest.MockedFunction<() => Promise<unknown>>;
  let stopAspireDashboardWithConfig: jest.MockedFunction<() => Promise<unknown>>;
  let getAspireStatus: jest.MockedFunction<() => Promise<unknown>>;
  let getAspireUrl: jest.MockedFunction<(enabled?: boolean) => unknown>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const subprocess = await import('../../../runtime/subprocess.js');
    spawnProcess = subprocess.spawnProcess as typeof spawnProcess;

    const aspire = await import('../../../telemetry/aspire.js');
    startAspireDashboardWithConfig =
      aspire.startAspireDashboardWithConfig as typeof startAspireDashboardWithConfig;
    stopAspireDashboardWithConfig =
      aspire.stopAspireDashboardWithConfig as typeof stopAspireDashboardWithConfig;
    getAspireStatus = aspire.getAspireStatus as typeof getAspireStatus;
    getAspireUrl = aspire.getAspireUrl as typeof getAspireUrl;
  });

  describe('helpHandler', () => {
    it('should return success and output help text', async () => {
      const { helpHandler } = await import('../help.js');
      const context = createMockContext();
      const result = await helpHandler('', context);

      expect(result.success).toBe(true);
      expect(context.outputs.length).toBeGreaterThan(0);

      const helpText = context.outputs[0].content;
      expect(helpText).toContain('Available Commands');
      expect(helpText).toContain('/exit');
      expect(helpText).toContain('/help');
      expect(helpText).toContain('/clear');
      expect(helpText).toContain('/telemetry');
      expect(helpText).toContain('Keyboard Shortcuts');
      expect(helpText).toContain('ESC');
      expect(helpText).toContain('Ctrl+C');
      expect(helpText).toContain('Ctrl+D');
      expect(helpText).toContain('Up/Down');
      // Should NOT contain unimplemented commands
      expect(helpText).not.toContain('/continue');
      expect(helpText).not.toContain('/purge');
    });
  });

  describe('clearHandler', () => {
    it('should return success with shouldClear and shouldClearHistory flags', async () => {
      const { clearHandler } = await import('../clear.js');
      const context = createMockContext();
      const result = await clearHandler('', context);

      expect(result.success).toBe(true);
      expect(result.shouldClear).toBe(true);
      expect(result.shouldClearHistory).toBe(true);
    });
  });

  describe('exitHandler', () => {
    it('should return success with shouldExit flag', async () => {
      const { exitHandler } = await import('../exit.js');
      const context = createMockContext();
      const result = await exitHandler('', context);

      expect(result.success).toBe(true);
      expect(result.shouldExit).toBe(true);
      expect(context.outputs).toContainEqual({ content: 'Goodbye!', type: 'info' });
    });
  });

  describe('telemetryHandler', () => {
    it('should show help on empty args', async () => {
      const { telemetryHandler } = await import('../telemetry.js');
      const context = createMockContext();
      const result = await telemetryHandler('', context);

      expect(result.success).toBe(true);
      const outputText = context.outputs.map((o) => o.content).join('\n');
      expect(outputText).toContain('Telemetry Commands');
      expect(outputText).toContain('/telemetry start');
      expect(outputText).toContain('/telemetry stop');
      expect(outputText).toContain('/telemetry status');
      expect(outputText).toContain('/telemetry url');
    });

    it('should start dashboard on "start" action', async () => {
      startAspireDashboardWithConfig.mockResolvedValue({
        success: true,
        result: {
          running: true,
          dashboardUrl: 'http://localhost:18888',
          otlpEndpoint: 'http://localhost:4317',
        },
        message: 'Dashboard started',
      });

      const { telemetryHandler } = await import('../telemetry.js');
      const context = createMockContext();
      const result = await telemetryHandler('start', context);

      expect(result.success).toBe(true);
      expect(startAspireDashboardWithConfig).toHaveBeenCalled();
      const outputText = context.outputs.map((o) => o.content).join('\n');
      expect(outputText).toContain('started successfully');
    });

    it('should handle start failure', async () => {
      startAspireDashboardWithConfig.mockResolvedValue({
        success: false,
        error: 'DOCKER_NOT_INSTALLED',
        message: 'Docker not installed',
      });

      const { telemetryHandler } = await import('../telemetry.js');
      const context = createMockContext();
      const result = await telemetryHandler('start', context);

      expect(result.success).toBe(false);
      const outputText = context.outputs.map((o) => o.content).join('\n');
      expect(outputText).toContain('Failed to start');
    });

    it('should stop dashboard on "stop" action', async () => {
      stopAspireDashboardWithConfig.mockResolvedValue({
        success: true,
        message: 'Dashboard stopped',
      });

      const { telemetryHandler } = await import('../telemetry.js');
      const context = createMockContext();
      const result = await telemetryHandler('stop', context);

      expect(result.success).toBe(true);
      expect(stopAspireDashboardWithConfig).toHaveBeenCalled();
      const outputText = context.outputs.map((o) => o.content).join('\n');
      expect(outputText).toContain('stopped');
    });

    it('should show status on "status" action', async () => {
      getAspireStatus.mockResolvedValue({
        success: true,
        result: {
          running: true,
          uptime: 'Up 5 minutes',
          dashboardUrl: 'http://localhost:18888',
          otlpEndpoint: 'http://localhost:4317',
        },
        message: 'Dashboard is running',
      });

      const { telemetryHandler } = await import('../telemetry.js');
      const context = createMockContext();
      const result = await telemetryHandler('status', context);

      expect(result.success).toBe(true);
      expect(getAspireStatus).toHaveBeenCalled();
      const outputText = context.outputs.map((o) => o.content).join('\n');
      expect(outputText).toContain('running');
    });

    it('should show url info on "url" action', async () => {
      getAspireUrl.mockReturnValue({
        dashboardUrl: 'http://localhost:18888',
        otlpEndpoint: 'http://localhost:4317',
        telemetryStatus: 'auto',
      });

      const { telemetryHandler } = await import('../telemetry.js');
      const context = createMockContext();
      const result = await telemetryHandler('url', context);

      expect(result.success).toBe(true);
      expect(getAspireUrl).toHaveBeenCalled();
      const outputText = context.outputs.map((o) => o.content).join('\n');
      expect(outputText).toContain('Telemetry Dashboard');
    });
  });

  describe('shellHandler', () => {
    it('should warn on empty command', async () => {
      const { shellHandler } = await import('../shell.js');
      const context = createMockContext();
      const result = await shellHandler('', context);

      expect(result.success).toBe(false);
      const outputText = context.outputs.map((o) => o.content).join('\n');
      expect(outputText).toContain('No command specified');
    });

    it('should execute shell command and return success on exit code 0', async () => {
      spawnProcess.mockResolvedValue({
        exitCode: 0,
        stdout: 'file1.txt\nfile2.txt',
        stderr: '',
      });

      const { shellHandler } = await import('../shell.js');
      const context = createMockContext();
      const result = await shellHandler('ls', context);

      expect(result.success).toBe(true);
      expect(spawnProcess).toHaveBeenCalledWith(['sh', '-c', 'ls'], expect.any(Object));
      const outputText = context.outputs.map((o) => o.content).join('\n');
      expect(outputText).toContain('file1.txt');
      expect(outputText).toContain('Exit code: 0');
    });

    it('should return failure on non-zero exit code', async () => {
      spawnProcess.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'command not found',
      });

      const { shellHandler } = await import('../shell.js');
      const context = createMockContext();
      const result = await shellHandler('nonexistent', context);

      expect(result.success).toBe(false);
      const outputText = context.outputs.map((o) => o.content).join('\n');
      expect(outputText).toContain('command not found');
      expect(outputText).toContain('Exit code: 1');
    });

    it('should handle spawn errors', async () => {
      spawnProcess.mockRejectedValue(new Error('Spawn failed'));

      const { shellHandler } = await import('../shell.js');
      const context = createMockContext();
      const result = await shellHandler('test', context);

      expect(result.success).toBe(false);
      const outputText = context.outputs.map((o) => o.content).join('\n');
      expect(outputText).toContain('Command failed');
      expect(outputText).toContain('Spawn failed');
    });
  });
});
