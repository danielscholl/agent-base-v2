/**
 * Tests for Aspire Dashboard management functions.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { SubprocessResult } from '../../runtime/subprocess.js';
import type { SpawnOptions } from '../../runtime/subprocess.js';

// Mock the subprocess module
jest.unstable_mockModule('../../runtime/subprocess.js', () => ({
  spawnProcess: jest.fn(),
  isBunRuntime: jest.fn(() => false),
}));

// Helper to create mock subprocess results
function mockResult(stdout: string, stderr: string, exitCode: number): SubprocessResult {
  return { exitCode, stdout, stderr };
}

describe('Aspire Dashboard Management', () => {
  let spawnProcess: jest.MockedFunction<
    (cmd: string[], options?: SpawnOptions) => Promise<SubprocessResult>
  >;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Get the mocked function
    const subprocess = await import('../../runtime/subprocess.js');
    spawnProcess = subprocess.spawnProcess as typeof spawnProcess;
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('startAspireDashboard', () => {
    it('returns error when Docker is not installed', async () => {
      // Mock docker --version to fail
      spawnProcess.mockResolvedValue(mockResult('', 'Docker not found', -1));

      const { startAspireDashboard } = await import('../aspire.js');
      const result = await startAspireDashboard();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('DOCKER_NOT_INSTALLED');
      }
    });

    it('returns error when Docker daemon is not running', async () => {
      // First call succeeds (docker --version)
      // Second call fails (docker info)
      spawnProcess
        .mockResolvedValueOnce(mockResult('Docker version 24.0.0', '', 0))
        .mockResolvedValueOnce(mockResult('', 'Cannot connect to the Docker daemon', 1));

      const { startAspireDashboard } = await import('../aspire.js');
      const result = await startAspireDashboard();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('DOCKER_NOT_RUNNING');
      }
    });

    it('returns success when container is already running', async () => {
      spawnProcess
        .mockResolvedValueOnce(mockResult('Docker version 24.0.0', '', 0)) // --version
        .mockResolvedValueOnce(mockResult('Server Version: 24.0.0', '', 0)) // info
        .mockResolvedValueOnce(mockResult('aspire-dashboard', '', 0)) // ps --filter (names)
        .mockResolvedValueOnce(mockResult('Up 5 minutes', '', 0)); // ps --filter (status)

      const { startAspireDashboard } = await import('../aspire.js');
      const result = await startAspireDashboard();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.running).toBe(true);
        expect(result.message).toContain('already running');
      }
    });

    it('starts container when not running', async () => {
      spawnProcess
        .mockResolvedValueOnce(mockResult('Docker version 24.0.0', '', 0)) // --version
        .mockResolvedValueOnce(mockResult('Server Version: 24.0.0', '', 0)) // info
        .mockResolvedValueOnce(mockResult('', '', 0)) // ps --filter (not running - names check)
        .mockResolvedValueOnce(mockResult('container_id_123', '', 0)) // run
        .mockResolvedValueOnce(mockResult('aspire-dashboard', '', 0)) // ps --filter (verify names)
        .mockResolvedValueOnce(mockResult('Up 1 second', '', 0)); // ps --filter (verify status)

      const { startAspireDashboard, CONTAINER_STARTUP_WAIT_MS } = await import('../aspire.js');

      // Speed up test by using fake timers
      jest.useFakeTimers();
      const resultPromise = startAspireDashboard();
      // Advance past the startup wait time
      await jest.advanceTimersByTimeAsync(CONTAINER_STARTUP_WAIT_MS + 1000);
      const result = await resultPromise;
      jest.useRealTimers();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.running).toBe(true);
        expect(result.message).toContain('started successfully');
      }
    });

    it('returns error on port conflict', async () => {
      spawnProcess
        .mockResolvedValueOnce(mockResult('Docker version 24.0.0', '', 0)) // --version
        .mockResolvedValueOnce(mockResult('Server Version: 24.0.0', '', 0)) // info
        .mockResolvedValueOnce(mockResult('', '', 0)) // ps --filter (not running)
        .mockResolvedValueOnce(
          mockResult('', 'Bind for 0.0.0.0:18888 failed: port is already allocated', 1)
        ); // run fails

      const { startAspireDashboard } = await import('../aspire.js');
      const result = await startAspireDashboard();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('CONTAINER_START_FAILED');
        expect(result.message).toContain('Port');
      }
    });

    it('returns error on container name conflict', async () => {
      spawnProcess
        .mockResolvedValueOnce(mockResult('Docker version 24.0.0', '', 0)) // --version
        .mockResolvedValueOnce(mockResult('Server Version: 24.0.0', '', 0)) // info
        .mockResolvedValueOnce(mockResult('', '', 0)) // ps --filter (not running)
        .mockResolvedValueOnce(
          mockResult('', 'Conflict. The container name "/aspire-dashboard" is already in use', 1)
        ); // run fails

      const { startAspireDashboard } = await import('../aspire.js');
      const result = await startAspireDashboard();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('CONTAINER_START_FAILED');
        expect(result.message).toContain('already exists');
      }
    });
  });

  describe('stopAspireDashboard', () => {
    it('returns success when container is not running', async () => {
      spawnProcess
        .mockResolvedValueOnce(mockResult('Docker version 24.0.0', '', 0)) // --version
        .mockResolvedValueOnce(mockResult('Server Version: 24.0.0', '', 0)) // info
        .mockResolvedValueOnce(mockResult('', '', 0)); // ps --filter (not running)

      const { stopAspireDashboard } = await import('../aspire.js');
      const result = await stopAspireDashboard();

      expect(result.success).toBe(true);
      expect(result.message).toContain('was not running');
    });

    it('stops running container', async () => {
      spawnProcess
        .mockResolvedValueOnce(mockResult('Docker version 24.0.0', '', 0)) // --version
        .mockResolvedValueOnce(mockResult('Server Version: 24.0.0', '', 0)) // info
        .mockResolvedValueOnce(mockResult('aspire-dashboard', '', 0)) // ps --filter {{.Names}} (running)
        .mockResolvedValueOnce(mockResult('Up 5 minutes', '', 0)) // ps --filter {{.Status}} (uptime)
        .mockResolvedValueOnce(mockResult('aspire-dashboard', '', 0)); // stop

      const { stopAspireDashboard } = await import('../aspire.js');
      const result = await stopAspireDashboard();

      expect(result.success).toBe(true);
      expect(result.message).toContain('stopped');
    });

    it('returns error on stop failure', async () => {
      spawnProcess
        .mockResolvedValueOnce(mockResult('Docker version 24.0.0', '', 0)) // --version
        .mockResolvedValueOnce(mockResult('Server Version: 24.0.0', '', 0)) // info
        .mockResolvedValueOnce(mockResult('aspire-dashboard', '', 0)) // ps --filter {{.Names}} (running)
        .mockResolvedValueOnce(mockResult('Up 5 minutes', '', 0)) // ps --filter {{.Status}} (uptime)
        .mockResolvedValueOnce(mockResult('', 'Error: No such container', 1)); // stop fails

      const { stopAspireDashboard } = await import('../aspire.js');
      const result = await stopAspireDashboard();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('CONTAINER_STOP_FAILED');
      }
    });
  });

  describe('getAspireStatus', () => {
    it('returns not running status', async () => {
      spawnProcess
        .mockResolvedValueOnce(mockResult('Docker version 24.0.0', '', 0)) // --version
        .mockResolvedValueOnce(mockResult('Server Version: 24.0.0', '', 0)) // info
        .mockResolvedValueOnce(mockResult('', '', 0)); // ps --filter (not running)

      const { getAspireStatus } = await import('../aspire.js');
      const result = await getAspireStatus();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.running).toBe(false);
        expect(result.result.dashboardUrl).toBe('http://localhost:18888');
        expect(result.result.otlpEndpoint).toBe('http://localhost:4317');
      }
    });

    it('returns running status with uptime', async () => {
      spawnProcess
        .mockResolvedValueOnce(mockResult('Docker version 24.0.0', '', 0)) // --version
        .mockResolvedValueOnce(mockResult('Server Version: 24.0.0', '', 0)) // info
        .mockResolvedValueOnce(mockResult('aspire-dashboard', '', 0)) // ps --filter (names)
        .mockResolvedValueOnce(mockResult('Up 10 minutes', '', 0)); // ps --filter (status)

      const { getAspireStatus } = await import('../aspire.js');
      const result = await getAspireStatus();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.running).toBe(true);
        expect(result.result.uptime).toBe('Up 10 minutes');
      }
    });

    it('returns error when Docker is not available', async () => {
      spawnProcess.mockResolvedValueOnce(mockResult('', 'Docker not found', -1));

      const { getAspireStatus } = await import('../aspire.js');
      const result = await getAspireStatus();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('DOCKER_NOT_INSTALLED');
      }
    });
  });

  describe('getAspireUrl', () => {
    it('returns URLs with auto status when no argument provided', async () => {
      const { getAspireUrl } = await import('../aspire.js');
      const result = getAspireUrl();

      expect(result.dashboardUrl).toBe('http://localhost:18888');
      expect(result.otlpEndpoint).toBe('http://localhost:4317');
      expect(result.telemetryStatus).toBe('auto');
    });

    it('returns URLs with enabled status', async () => {
      const { getAspireUrl } = await import('../aspire.js');
      const result = getAspireUrl(true);

      expect(result.telemetryStatus).toBe('enabled');
    });

    it('returns URLs with disabled status', async () => {
      const { getAspireUrl } = await import('../aspire.js');
      const result = getAspireUrl(false);

      expect(result.telemetryStatus).toBe('disabled');
    });
  });

  describe('Constants', () => {
    it('exports correct constants', async () => {
      const {
        ASPIRE_CONTAINER_NAME,
        ASPIRE_DASHBOARD_URL,
        ASPIRE_OTLP_GRPC_ENDPOINT,
        ASPIRE_OTLP_HTTP_ENDPOINT,
        ASPIRE_IMAGE,
      } = await import('../aspire.js');

      expect(ASPIRE_CONTAINER_NAME).toBe('aspire-dashboard');
      expect(ASPIRE_DASHBOARD_URL).toBe('http://localhost:18888');
      expect(ASPIRE_OTLP_GRPC_ENDPOINT).toBe('http://localhost:4317');
      expect(ASPIRE_OTLP_HTTP_ENDPOINT).toBe('http://localhost:4318');
      expect(ASPIRE_IMAGE).toBe('mcr.microsoft.com/dotnet/aspire-dashboard:latest');
    });
  });
});

describe('Aspire Config Integration', () => {
  let spawnProcess: jest.MockedFunction<
    (cmd: string[], options?: SpawnOptions) => Promise<SubprocessResult>
  >;

  beforeEach(async () => {
    jest.clearAllMocks();
    const subprocess = await import('../../runtime/subprocess.js');
    spawnProcess = subprocess.spawnProcess as typeof spawnProcess;

    // Mock successful Docker environment by default
    spawnProcess.mockImplementation((cmd: string[]) => {
      const args = cmd.slice(1); // Remove 'docker' prefix
      if (args.includes('--version')) {
        return Promise.resolve(mockResult('Docker version 24.0.0', '', 0));
      }
      if (args.includes('info')) {
        return Promise.resolve(mockResult('Server Version: 24.0.0', '', 0));
      }
      if (args.includes('ps') && args.includes('--filter')) {
        return Promise.resolve(mockResult('', '', 0)); // Not running
      }
      if (args.includes('run')) {
        return Promise.resolve(mockResult('container_id', '', 0));
      }
      if (args.includes('stop')) {
        return Promise.resolve(mockResult('aspire-dashboard', '', 0));
      }
      return Promise.resolve(mockResult('', '', 0));
    });
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('startAspireDashboardWithConfig can disable config update', async () => {
    // Add verification mocks after container start
    let psCallCount = 0;
    spawnProcess.mockImplementation((cmd: string[]) => {
      const args = cmd.slice(1);
      if (args.includes('--version'))
        return Promise.resolve(mockResult('Docker version 24.0.0', '', 0));
      if (args.includes('info'))
        return Promise.resolve(mockResult('Server Version: 24.0.0', '', 0));
      if (args.includes('run')) return Promise.resolve(mockResult('container_id', '', 0));
      if (args.includes('ps') && args.includes('{{.Names}}')) {
        psCallCount++;
        // First ps check is before run (not running), subsequent are after run (running)
        return Promise.resolve(mockResult(psCallCount > 1 ? 'aspire-dashboard' : '', '', 0));
      }
      if (args.includes('ps') && args.includes('{{.Status}}'))
        return Promise.resolve(mockResult('Up 1 second', '', 0));
      if (args.includes('ps')) return Promise.resolve(mockResult('', '', 0)); // Initial check - not running
      return Promise.resolve(mockResult('', '', 0));
    });

    const { startAspireDashboardWithConfig, CONTAINER_STARTUP_WAIT_MS } =
      await import('../aspire.js');

    // Speed up test
    jest.useFakeTimers();
    const resultPromise = startAspireDashboardWithConfig({
      autoUpdateConfig: false,
    });
    await jest.advanceTimersByTimeAsync(CONTAINER_STARTUP_WAIT_MS + 1000);
    const result = await resultPromise;
    jest.useRealTimers();

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('stopAspireDashboardWithConfig can disable config update', async () => {
    // Mock container as running for stop
    spawnProcess.mockImplementation((cmd: string[]) => {
      const args = cmd.slice(1);
      if (args.includes('--version'))
        return Promise.resolve(mockResult('Docker version 24.0.0', '', 0));
      if (args.includes('info'))
        return Promise.resolve(mockResult('Server Version: 24.0.0', '', 0));
      if (args.includes('ps') && args.includes('--filter'))
        return Promise.resolve(mockResult('aspire-dashboard', '', 0));
      if (args.includes('stop')) return Promise.resolve(mockResult('aspire-dashboard', '', 0));
      return Promise.resolve(mockResult('', '', 0));
    });

    const { stopAspireDashboardWithConfig } = await import('../aspire.js');

    const result = await stopAspireDashboardWithConfig({
      autoUpdateConfig: false,
    });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.message).toContain('stopped');
  });
});
