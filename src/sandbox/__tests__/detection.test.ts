/**
 * Tests for container detection utilities.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock fs module
jest.unstable_mockModule('node:fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

describe('detection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env['AGENT_SANDBOX'];
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  describe('detectContainer', () => {
    it('detects AGENT_SANDBOX env var', async () => {
      process.env['AGENT_SANDBOX'] = 'true';

      const { detectContainer } = await import('../detection.js');
      const result = detectContainer();

      expect(result).toEqual({
        isContainer: true,
        method: 'env',
        details: 'AGENT_SANDBOX=true',
      });
    });

    it('ignores AGENT_SANDBOX when not "true"', async () => {
      process.env['AGENT_SANDBOX'] = 'false';
      const fs = await import('node:fs');
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const { detectContainer } = await import('../detection.js');
      const result = detectContainer();

      expect(result.isContainer).toBe(false);
    });

    it('detects /.agent-sandbox marker file', async () => {
      const fs = await import('node:fs');
      (fs.existsSync as jest.Mock).mockImplementation((path: string) => path === '/.agent-sandbox');

      const { detectContainer } = await import('../detection.js');
      const result = detectContainer();

      expect(result).toEqual({
        isContainer: true,
        method: 'marker',
        details: '/.agent-sandbox exists',
      });
    });

    it('detects /.dockerenv file', async () => {
      const fs = await import('node:fs');
      (fs.existsSync as jest.Mock).mockImplementation((path: string) => path === '/.dockerenv');

      const { detectContainer } = await import('../detection.js');
      const result = detectContainer();

      expect(result).toEqual({
        isContainer: true,
        method: 'dockerenv',
        details: '/.dockerenv exists',
      });
    });

    it('detects docker in cgroup', async () => {
      const fs = await import('node:fs');
      (fs.existsSync as jest.Mock).mockImplementation((path: string) => path === '/proc/1/cgroup');
      (fs.readFileSync as jest.Mock).mockReturnValue('12:devices:/docker/abc123\n');

      const { detectContainer } = await import('../detection.js');
      const result = detectContainer();

      expect(result).toEqual({
        isContainer: true,
        method: 'cgroup',
        details: 'cgroup indicates container',
      });
    });

    it('detects containerd in cgroup', async () => {
      const fs = await import('node:fs');
      (fs.existsSync as jest.Mock).mockImplementation((path: string) => path === '/proc/1/cgroup');
      (fs.readFileSync as jest.Mock).mockReturnValue('0::/system.slice/containerd.service\n');

      const { detectContainer } = await import('../detection.js');
      const result = detectContainer();

      expect(result).toEqual({
        isContainer: true,
        method: 'cgroup',
        details: 'cgroup indicates container',
      });
    });

    it('detects kubepods in cgroup', async () => {
      const fs = await import('node:fs');
      (fs.existsSync as jest.Mock).mockImplementation((path: string) => path === '/proc/1/cgroup');
      (fs.readFileSync as jest.Mock).mockReturnValue('12:devices:/kubepods/abc123\n');

      const { detectContainer } = await import('../detection.js');
      const result = detectContainer();

      expect(result).toEqual({
        isContainer: true,
        method: 'cgroup',
        details: 'cgroup indicates container',
      });
    });

    it('returns none when not in container', async () => {
      const fs = await import('node:fs');
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const { detectContainer } = await import('../detection.js');
      const result = detectContainer();

      expect(result).toEqual({
        isContainer: false,
        method: 'none',
      });
    });

    it('handles cgroup read errors gracefully', async () => {
      const fs = await import('node:fs');
      (fs.existsSync as jest.Mock).mockImplementation((path: string) => path === '/proc/1/cgroup');
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { detectContainer } = await import('../detection.js');
      const result = detectContainer();

      expect(result).toEqual({
        isContainer: false,
        method: 'none',
      });
    });

    it('prefers env var over other detection methods', async () => {
      process.env['AGENT_SANDBOX'] = 'true';
      const fs = await import('node:fs');
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const { detectContainer } = await import('../detection.js');
      const result = detectContainer();

      expect(result.method).toBe('env');
    });
  });

  describe('isAgentSandbox', () => {
    it('returns true when AGENT_SANDBOX=true', async () => {
      process.env['AGENT_SANDBOX'] = 'true';

      const { isAgentSandbox } = await import('../detection.js');
      expect(isAgentSandbox()).toBe(true);
    });

    it('returns true when marker file exists', async () => {
      const fs = await import('node:fs');
      (fs.existsSync as jest.Mock).mockImplementation((path: string) => path === '/.agent-sandbox');

      const { isAgentSandbox } = await import('../detection.js');
      expect(isAgentSandbox()).toBe(true);
    });

    it('returns false when neither env nor marker present', async () => {
      const fs = await import('node:fs');
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const { isAgentSandbox } = await import('../detection.js');
      expect(isAgentSandbox()).toBe(false);
    });

    it('returns false when AGENT_SANDBOX is not "true"', async () => {
      process.env['AGENT_SANDBOX'] = 'false';
      const fs = await import('node:fs');
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const { isAgentSandbox } = await import('../detection.js');
      expect(isAgentSandbox()).toBe(false);
    });
  });
});
