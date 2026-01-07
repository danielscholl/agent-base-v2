/**
 * Tests for sandbox executor.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { SubprocessResult, SpawnOptions } from '../../runtime/subprocess.js';

// Mock dependencies
jest.unstable_mockModule('../../runtime/subprocess.js', () => ({
  spawnProcess: jest.fn(),
  isBunRuntime: jest.fn(() => false),
}));

jest.unstable_mockModule('../detection.js', () => ({
  detectContainer: jest.fn(),
  isAgentSandbox: jest.fn(),
}));

// Helper to create mock subprocess results
function mockResult(stdout: string, stderr: string, exitCode: number): SubprocessResult {
  return { exitCode, stdout, stderr };
}

describe('executor', () => {
  const originalEnv = process.env;

  let spawnProcess: jest.MockedFunction<
    (cmd: string[], options?: SpawnOptions) => Promise<SubprocessResult>
  >;
  let detectContainer: jest.MockedFunction<
    () => { isContainer: boolean; method: string; details?: string }
  >;
  let isAgentSandbox: jest.MockedFunction<() => boolean>;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env['AGENT_SANDBOX'];
    delete process.env['AGENT_SANDBOX_IMAGE'];
    process.env['HOME'] = '/home/testuser';

    // Get mocked modules
    const subprocess = await import('../../runtime/subprocess.js');
    const detection = await import('../detection.js');

    spawnProcess = subprocess.spawnProcess as typeof spawnProcess;
    detectContainer = detection.detectContainer as typeof detectContainer;
    isAgentSandbox = detection.isAgentSandbox as typeof isAgentSandbox;

    // Default: not in container
    detectContainer.mockReturnValue({
      isContainer: false,
      method: 'none',
    });
    isAgentSandbox.mockReturnValue(false);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  describe('getSandboxStatus', () => {
    it('returns status from detection module', async () => {
      detectContainer.mockReturnValue({
        isContainer: true,
        method: 'env',
        details: 'AGENT_SANDBOX=true',
      });
      isAgentSandbox.mockReturnValue(true);

      const { getSandboxStatus } = await import('../executor.js');
      const status = getSandboxStatus();

      expect(status).toEqual({
        isInSandbox: true,
        isAgentSandbox: true,
        detectionMethod: 'env',
        details: 'AGENT_SANDBOX=true',
      });
    });

    it('distinguishes between generic container and agent sandbox', async () => {
      detectContainer.mockReturnValue({
        isContainer: true,
        method: 'dockerenv',
        details: '/.dockerenv exists',
      });
      isAgentSandbox.mockReturnValue(false);

      const { getSandboxStatus } = await import('../executor.js');
      const status = getSandboxStatus();

      expect(status.isInSandbox).toBe(true);
      expect(status.isAgentSandbox).toBe(false);
    });
  });

  describe('checkDockerAvailable', () => {
    it('returns success when Docker CLI is available', async () => {
      spawnProcess.mockResolvedValue(mockResult('Docker version 24.0.7', '', 0));

      const { checkDockerAvailable } = await import('../executor.js');
      const result = await checkDockerAvailable();

      expect(result.success).toBe(true);
      expect(result.result).toBe('Docker version 24.0.7');
    });

    it('returns error when Docker CLI is not found', async () => {
      spawnProcess.mockResolvedValue(mockResult('', 'command not found', 127));

      const { checkDockerAvailable } = await import('../executor.js');
      const result = await checkDockerAvailable();

      expect(result.success).toBe(false);
      expect(result.error).toBe('DOCKER_NOT_INSTALLED');
    });
  });

  describe('checkDockerDaemon', () => {
    it('returns success when daemon is running', async () => {
      spawnProcess.mockResolvedValue(mockResult('Server: Docker Engine', '', 0));

      const { checkDockerDaemon } = await import('../executor.js');
      const result = await checkDockerDaemon();

      expect(result.success).toBe(true);
    });

    it('returns error when daemon is not running', async () => {
      spawnProcess.mockResolvedValue(mockResult('', 'Cannot connect to Docker daemon', 1));

      const { checkDockerDaemon } = await import('../executor.js');
      const result = await checkDockerDaemon();

      expect(result.success).toBe(false);
      expect(result.error).toBe('DOCKER_NOT_RUNNING');
    });
  });

  describe('checkSandboxImage', () => {
    it('returns success when image exists', async () => {
      spawnProcess.mockResolvedValue(mockResult('[{"Id": "sha256:abc123"}]', '', 0));

      const { checkSandboxImage } = await import('../executor.js');
      const result = await checkSandboxImage('ai-harness-sandbox');

      expect(result.success).toBe(true);
    });

    it('returns error when image not found', async () => {
      spawnProcess.mockResolvedValue(mockResult('', 'No such image', 1));

      const { checkSandboxImage } = await import('../executor.js');
      const result = await checkSandboxImage('missing-image');

      expect(result.success).toBe(false);
      expect(result.error).toBe('IMAGE_NOT_FOUND');
      expect(result.message).toContain('missing-image');
    });
  });

  describe('buildDockerCommand', () => {
    it('builds basic command with defaults', async () => {
      const { buildDockerCommand } = await import('../executor.js');
      const cmd = buildDockerCommand({
        workspacePath: '/workspace',
      });

      expect(cmd).toContain('docker');
      expect(cmd).toContain('run');
      expect(cmd).toContain('--rm');
      // -it is only added when stdin is a TTY (not in test environment)
      // Default image is ghcr.io/danielscholl/ai-harness-sandbox:VERSION
      const imageArg = cmd.find((arg) => arg.includes('ghcr.io/danielscholl/ai-harness-sandbox'));
      expect(imageArg).toBeDefined();
    });

    it('adds -it when interactive is explicitly true', async () => {
      const { buildDockerCommand } = await import('../executor.js');
      const cmd = buildDockerCommand({
        interactive: true,
      });

      expect(cmd).toContain('-it');
    });

    it('mounts workspace volume', async () => {
      const { buildDockerCommand } = await import('../executor.js');
      const cmd = buildDockerCommand({
        workspacePath: '/my/project',
      });

      expect(cmd).toContain('-v');
      expect(cmd).toContain('/my/project:/workspace');
    });

    it('mounts config directory read-write', async () => {
      const { buildDockerCommand } = await import('../executor.js');
      const cmd = buildDockerCommand({
        configPath: '/home/user/.agent',
      });

      expect(cmd).toContain('-v');
      expect(cmd).toContain('/home/user/.agent:/home/agent/.agent');
      // Should NOT be read-only (no :ro suffix)
      expect(cmd).not.toContain('/home/user/.agent:/home/agent/.agent:ro');
    });

    it('sets AGENT_SANDBOX environment variable', async () => {
      const { buildDockerCommand } = await import('../executor.js');
      const cmd = buildDockerCommand({});

      const envIndex = cmd.indexOf('AGENT_SANDBOX=true');
      expect(envIndex).toBeGreaterThan(-1);
      expect(cmd[envIndex - 1]).toBe('-e');
    });

    it('sets AGENT_WORKSPACE_ROOT environment variable', async () => {
      const { buildDockerCommand } = await import('../executor.js');
      const cmd = buildDockerCommand({});

      const envIndex = cmd.indexOf('AGENT_WORKSPACE_ROOT=/workspace');
      expect(envIndex).toBeGreaterThan(-1);
      expect(cmd[envIndex - 1]).toBe('-e');
    });

    it('passes through agent args without --sandbox', async () => {
      const { buildDockerCommand } = await import('../executor.js');
      const cmd = buildDockerCommand({
        agentArgs: ['--sandbox', '-p', 'Hello', '--verbose'],
      });

      expect(cmd).toContain('-p');
      expect(cmd).toContain('Hello');
      expect(cmd).toContain('--verbose');
      expect(cmd.filter((a) => a === '--sandbox')).toHaveLength(0);
    });

    it('uses custom image name', async () => {
      const { buildDockerCommand } = await import('../executor.js');
      const cmd = buildDockerCommand({
        image: 'custom-sandbox:v2',
      });

      expect(cmd).toContain('custom-sandbox:v2');
      expect(cmd).not.toContain('ai-harness-sandbox');
    });

    it('uses AGENT_SANDBOX_IMAGE env var', async () => {
      process.env['AGENT_SANDBOX_IMAGE'] = 'env-image:latest';

      const { buildDockerCommand } = await import('../executor.js');
      const cmd = buildDockerCommand({});

      expect(cmd).toContain('env-image:latest');
    });

    it('passes through LLM API keys when set', async () => {
      process.env['OPENAI_API_KEY'] = 'sk-test';
      process.env['ANTHROPIC_API_KEY'] = 'ak-test';

      const { buildDockerCommand } = await import('../executor.js');
      const cmd = buildDockerCommand({});

      expect(cmd.filter((a) => a === 'OPENAI_API_KEY')).toHaveLength(1);
      expect(cmd.filter((a) => a === 'ANTHROPIC_API_KEY')).toHaveLength(1);
    });

    it('does not pass through unset env vars', async () => {
      delete process.env['OPENAI_API_KEY'];

      const { buildDockerCommand } = await import('../executor.js');
      const cmd = buildDockerCommand({});

      expect(cmd).not.toContain('OPENAI_API_KEY');
    });

    it('sets hostname', async () => {
      const { buildDockerCommand } = await import('../executor.js');
      const cmd = buildDockerCommand({});

      const hostnameIndex = cmd.indexOf('--hostname');
      expect(hostnameIndex).toBeGreaterThan(-1);
      expect(cmd[hostnameIndex + 1]).toBe('agent-sandbox');
    });

    it('uses AGENT_HOME env var for config path', async () => {
      process.env['AGENT_HOME'] = '/custom/agent/home';

      const { buildDockerCommand } = await import('../executor.js');
      const cmd = buildDockerCommand({});

      expect(cmd).toContain('/custom/agent/home:/home/agent/.agent');
      delete process.env['AGENT_HOME'];
    });

    it('sets AGENT_HOME in container', async () => {
      const { buildDockerCommand } = await import('../executor.js');
      const cmd = buildDockerCommand({});

      const envIndex = cmd.indexOf('AGENT_HOME=/home/agent/.agent');
      expect(envIndex).toBeGreaterThan(-1);
      expect(cmd[envIndex - 1]).toBe('-e');
    });

    it('omits -it when interactive is false', async () => {
      const { buildDockerCommand } = await import('../executor.js');
      const cmd = buildDockerCommand({
        interactive: false,
      });

      expect(cmd).not.toContain('-it');
    });
  });

  describe('executeSandbox', () => {
    it('returns error when already in container', async () => {
      detectContainer.mockReturnValue({
        isContainer: true,
        method: 'env',
        details: 'AGENT_SANDBOX=true',
      });

      const { executeSandbox } = await import('../executor.js');
      const result = await executeSandbox();

      expect(result.success).toBe(false);
      expect(result.error).toBe('ALREADY_IN_CONTAINER');
    });

    it('checks Docker CLI before proceeding', async () => {
      spawnProcess.mockResolvedValueOnce(mockResult('', 'command not found', 127));

      const { executeSandbox } = await import('../executor.js');
      const result = await executeSandbox();

      expect(result.success).toBe(false);
      expect(result.error).toBe('DOCKER_NOT_INSTALLED');
    });

    it('checks Docker daemon after CLI', async () => {
      spawnProcess
        .mockResolvedValueOnce(mockResult('Docker version 24.0.7', '', 0))
        .mockResolvedValueOnce(mockResult('', 'Cannot connect', 1));

      const { executeSandbox } = await import('../executor.js');
      const result = await executeSandbox();

      expect(result.success).toBe(false);
      expect(result.error).toBe('DOCKER_NOT_RUNNING');
    });

    it('checks image exists and attempts pull if missing', async () => {
      spawnProcess
        .mockResolvedValueOnce(mockResult('Docker version', '', 0)) // CLI check
        .mockResolvedValueOnce(mockResult('', '', 0)) // daemon check
        .mockResolvedValueOnce(mockResult('', 'No such image', 1)) // local image check
        .mockResolvedValueOnce(mockResult('', 'pull failed', 1)) // pull versioned
        .mockResolvedValueOnce(mockResult('', 'pull failed', 1)); // pull latest fallback

      const { executeSandbox } = await import('../executor.js');
      const result = await executeSandbox();

      expect(result.success).toBe(false);
      expect(result.error).toBe('IMAGE_NOT_FOUND');
    });

    it('executes Docker command when all checks pass', async () => {
      spawnProcess
        .mockResolvedValueOnce(mockResult('Docker version', '', 0))
        .mockResolvedValueOnce(mockResult('', '', 0))
        .mockResolvedValueOnce(mockResult('[{}]', '', 0))
        .mockResolvedValueOnce(mockResult('', '', 0));

      const { executeSandbox } = await import('../executor.js');
      const result = await executeSandbox({
        agentArgs: ['-p', 'Hello'],
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe(0);
    });

    it('returns error on non-zero exit code', async () => {
      spawnProcess
        .mockResolvedValueOnce(mockResult('Docker version', '', 0))
        .mockResolvedValueOnce(mockResult('', '', 0))
        .mockResolvedValueOnce(mockResult('[{}]', '', 0))
        .mockResolvedValueOnce(mockResult('', 'error', 1));

      const { executeSandbox } = await import('../executor.js');
      const result = await executeSandbox();

      expect(result.success).toBe(false);
      expect(result.error).toBe('EXECUTION_FAILED');
      expect(result.result).toBe(1);
    });

    it('handles timeout', async () => {
      spawnProcess
        .mockResolvedValueOnce(mockResult('Docker version', '', 0))
        .mockResolvedValueOnce(mockResult('', '', 0))
        .mockResolvedValueOnce(mockResult('[{}]', '', 0))
        .mockResolvedValueOnce(mockResult('', 'Command timed out', -1));

      const { executeSandbox } = await import('../executor.js');
      const result = await executeSandbox({ timeout: 1000 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('TIMEOUT');
    });

    it('calls onDebug callback', async () => {
      const debugMessages: string[] = [];
      spawnProcess
        .mockResolvedValueOnce(mockResult('Docker version 24', '', 0))
        .mockResolvedValueOnce(mockResult('', '', 0))
        .mockResolvedValueOnce(mockResult('[{}]', '', 0))
        .mockResolvedValueOnce(mockResult('', '', 0));

      const { executeSandbox } = await import('../executor.js');
      await executeSandbox({
        onDebug: (msg: string) => debugMessages.push(msg),
      });

      expect(debugMessages.some((m) => m.includes('Docker CLI'))).toBe(true);
      expect(debugMessages.some((m) => m.includes('Docker daemon'))).toBe(true);
    });
  });
});
