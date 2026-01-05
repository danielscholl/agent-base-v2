/**
 * Tests for update command handler.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { CommandContext } from '../types.js';

// Mock child_process for spawn tests
const mockSpawn = jest.fn();
jest.unstable_mockModule('node:child_process', () => ({
  spawn: mockSpawn,
}));

// Mock fs/promises for file operation tests
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();
jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
}));

// Mock fs for realpathSync
const mockRealpathSync = jest.fn();
jest.unstable_mockModule('node:fs', () => ({
  realpathSync: mockRealpathSync,
}));

// Mock VERSION constant - needs to be a separate variable that can be changed
// Path is relative to the module being tested (update.ts), not the test file
let mockVersion = '0.1.0';
jest.unstable_mockModule('../../version', () => ({
  get VERSION() {
    return mockVersion;
  },
}));

// Mock global fetch for GitHub API calls
const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

interface OutputEntry {
  content: string;
  type?: string;
}

function createMockContext(): CommandContext & {
  outputs: OutputEntry[];
  exitCalled: boolean;
} {
  const outputs: OutputEntry[] = [];

  return {
    config: null,
    onOutput: (content: string, type?: string) => {
      outputs.push({ content, type });
    },
    exit: () => {
      // noop for test
    },
    outputs,
    exitCalled: false,
  };
}

describe('update command handler', () => {
  let originalArgv: string[];

  beforeEach(() => {
    jest.clearAllMocks();
    // Save original process.argv
    originalArgv = process.argv;
    // Set default test argv
    process.argv = ['bun', '/Users/test/.bun/install/global/agent-base-v2/index.js'];

    // Default mock VERSION
    mockVersion = '0.1.0';
    // Default mock for realpathSync - return path as-is
    mockRealpathSync.mockImplementation((path: string) => path);
    // Default mock for readFile - used for version cache
    mockReadFile.mockResolvedValue('{}');
    // Default mocks for write operations
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    // Default mock for fetch - returns GitHub API response with latest version
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tag_name: 'v0.1.0',
          html_url: 'https://github.com/danielscholl/agent-base-v2/releases/tag/v0.1.0',
          assets: [],
        }),
    });
  });

  afterEach(() => {
    // Restore original process.argv
    process.argv = originalArgv;
    jest.resetModules();
  });

  // Note: help tests removed - help is now handled by meow in index.tsx before handler is called

  describe('detectInstallationType', () => {
    it('detects global installation via .bun/install/global', async () => {
      process.argv = ['bun', '/Users/test/.bun/install/global/agent-base-v2/index.js'];

      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      await updateHandler('--check', context);

      expect(context.outputs.some((o) => o.content.includes('Installation: Bun global'))).toBe(
        true
      );
    });

    it('detects global installation via node_modules/.bin', async () => {
      process.argv = ['node', '/usr/local/lib/node_modules/.bin/agent'];

      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      await updateHandler('--check', context);

      expect(context.outputs.some((o) => o.content.includes('Installation: Bun global'))).toBe(
        true
      );
    });

    it('detects local development via src/index.tsx', async () => {
      process.argv = ['bun', '/Users/test/projects/agent-base-v2/src/index.tsx'];

      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      const result = await updateHandler('', context);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Local development detected');
      expect(
        context.outputs.some((o) => o.content.includes('Installation: Local development'))
      ).toBe(true);
      expect(
        context.outputs.some((o) => o.content.includes('Running from local development source'))
      ).toBe(true);
    });

    it('detects local development via dist/', async () => {
      process.argv = ['bun', '/Users/test/projects/agent-base-v2/dist/index.js'];

      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      const result = await updateHandler('', context);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Local development detected');
      expect(
        context.outputs.some((o) => o.content.includes('Installation: Local development'))
      ).toBe(true);
    });

    it('returns unknown for unrecognized paths', async () => {
      process.argv = ['node', '/some/random/path/agent.js'];

      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      const result = await updateHandler('', context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Unknown installation type');
      expect(context.outputs.some((o) => o.content.includes('Installation: Unknown'))).toBe(true);
      expect(
        context.outputs.some((o) => o.content.includes('Could not determine installation type'))
      ).toBe(true);
    });

    it('handles Windows-style paths', async () => {
      process.argv = ['bun', 'C:\\Users\\test\\.bun\\install\\global\\agent-base-v2\\index.js'];

      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      await updateHandler('--check', context);

      expect(context.outputs.some((o) => o.content.includes('Installation: Bun global'))).toBe(
        true
      );
    });
  });

  describe('getCurrentVersion', () => {
    it('returns version from VERSION constant', async () => {
      mockVersion = '0.2.5';

      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      await updateHandler('--check', context);

      expect(context.outputs.some((o) => o.content.includes('Current version: 0.2.5'))).toBe(true);
    });

    it('returns unknown when VERSION is empty', async () => {
      mockVersion = '';

      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      await updateHandler('--check', context);

      expect(context.outputs.some((o) => o.content.includes('Current version: unknown'))).toBe(
        true
      );
    });

    it('allows updates when VERSION is unknown with --force', async () => {
      mockVersion = '';
      // Mock GitHub API to return a version
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            tag_name: 'v0.2.0',
            html_url: 'https://github.com/danielscholl/agent-base-v2/releases/tag/v0.2.0',
            assets: [],
          }),
      });

      // Mock successful spawn
      const mockProcess = {
        stdout: { on: jest.fn(), removeListener: jest.fn() },
        stderr: { on: jest.fn(), removeListener: jest.fn() },
        once: jest.fn((event: string, callback: (arg: number | null | Error) => void) => {
          if (event === 'close') {
            setTimeout(() => {
              callback(0);
            }, 10);
          }
          return mockProcess;
        }),
      };
      mockSpawn.mockReturnValue(mockProcess);

      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      const result = await updateHandler('--force', context);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Update complete');
    });
  });

  describe('symlink resolution', () => {
    it('resolves symlinks to detect shell-binary installation', async () => {
      // Symlink in ~/.local/bin/agent points to ~/.agent/bin/agent
      process.argv = ['bun', '/Users/test/.local/bin/agent'];
      mockRealpathSync.mockReturnValue('/Users/test/.agent/bin/agent');

      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      await updateHandler('--check', context);

      expect(
        context.outputs.some((o) => o.content.includes('Installation: Shell script (binary)'))
      ).toBe(true);
    });

    it('falls back to original path if realpath fails', async () => {
      process.argv = ['bun', '/Users/test/.bun/install/global/agent-base-v2/index.js'];
      mockRealpathSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      await updateHandler('--check', context);

      // Should still detect bun-global from the original path
      expect(context.outputs.some((o) => o.content.includes('Installation: Bun global'))).toBe(
        true
      );
    });
  });

  describe('local development installation', () => {
    beforeEach(() => {
      process.argv = ['bun', '/Users/test/projects/agent-base-v2/src/index.tsx'];
    });

    it('shows git pull instructions', async () => {
      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      const result = await updateHandler('', context);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Local development detected');
      expect(
        context.outputs.some((o) => o.content.includes('Running from local development source'))
      ).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('To update, run:'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('git pull'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('bun install'))).toBe(true);
    });

    it('handles --check flag for local development', async () => {
      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      const result = await updateHandler('--check', context);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Local development detected');
      expect(context.outputs.some((o) => o.content.includes('git pull'))).toBe(true);
    });
  });

  describe('unknown installation type', () => {
    beforeEach(() => {
      process.argv = ['node', '/some/random/path/agent.js'];
    });

    it('shows installation instructions', async () => {
      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      const result = await updateHandler('', context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Unknown installation type');
      expect(
        context.outputs.some((o) => o.content.includes('Could not determine installation type'))
      ).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Recommended installation:'))).toBe(
        true
      );
      expect(context.outputs.some((o) => o.content.includes('install.sh'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Or install via Bun:'))).toBe(true);
      expect(
        context.outputs.some((o) => o.content.includes('bun install -g github:danielscholl'))
      ).toBe(true);
    });
  });

  describe('check-only mode', () => {
    beforeEach(() => {
      process.argv = ['bun', '/Users/test/.bun/install/global/agent-base-v2/index.js'];
    });

    it('checks for updates without installing', async () => {
      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      const result = await updateHandler('--check', context);

      expect(result.success).toBe(true);
      // When on latest version, message is 'Already up to date'
      expect(result.message === 'Check complete' || result.message === 'Already up to date').toBe(
        true
      );
      expect(context.outputs.some((o) => o.content.includes('Checking for updates...'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Latest version:'))).toBe(true);
    });
  });

  describe('global installation update', () => {
    beforeEach(() => {
      process.argv = ['bun', '/Users/test/.bun/install/global/agent-base-v2/index.js'];
    });

    it('updates successfully', async () => {
      // Mock GitHub API to return a newer version so update proceeds
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            tag_name: 'v0.2.0',
            html_url: 'https://github.com/danielscholl/agent-base-v2/releases/tag/v0.2.0',
            assets: [],
          }),
      });

      // Mock successful spawn
      const eventHandlers: Record<string, ((arg: number | null | Error) => void)[]> = {};
      const mockProcess = {
        stdout: {
          on: jest.fn(),
          removeListener: jest.fn(),
        },
        stderr: {
          on: jest.fn(),
          removeListener: jest.fn(),
        },
        once: jest.fn((event: string, callback: (arg: number | null | Error) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);

          // Simulate successful close
          if (event === 'close') {
            setTimeout(() => {
              callback(0);
            }, 10);
          }
          return mockProcess;
        }),
      };
      mockSpawn.mockReturnValue(mockProcess);

      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      const result = await updateHandler('', context);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Update complete');
      expect(context.outputs.some((o) => o.content.includes('Updating...'))).toBe(true);
      expect(
        context.outputs.some((o) =>
          o.content.includes('Running: bun install -g github:danielscholl')
        )
      ).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Update successful!'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Restart the agent'))).toBe(true);
    });

    it('updates with --force flag', async () => {
      const eventHandlers: Record<string, ((arg: number | null | Error) => void)[]> = {};
      const mockProcess = {
        stdout: {
          on: jest.fn(),
          removeListener: jest.fn(),
        },
        stderr: {
          on: jest.fn(),
          removeListener: jest.fn(),
        },
        once: jest.fn((event: string, callback: (arg: number | null | Error) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);

          if (event === 'close') {
            setTimeout(() => {
              callback(0);
            }, 10);
          }
          return mockProcess;
        }),
      };
      mockSpawn.mockReturnValue(mockProcess);

      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      const result = await updateHandler('--force', context);

      expect(result.success).toBe(true);
      expect(
        context.outputs.some((o) => o.content.includes('Running: bun install -g --force github:'))
      ).toBe(true);
    });

    it('handles update failure', async () => {
      // Mock GitHub API to return a newer version so update proceeds
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            tag_name: 'v0.2.0',
            html_url: 'https://github.com/danielscholl/agent-base-v2/releases/tag/v0.2.0',
            assets: [],
          }),
      });

      const eventHandlers: Record<string, ((arg: number | null | Error) => void)[]> = {};
      const mockProcess = {
        stdout: {
          on: jest.fn(),
          removeListener: jest.fn(),
        },
        stderr: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            // Simulate stderr data
            setTimeout(() => {
              callback(Buffer.from('Error: Update failed'));
            }, 5);
          }),
          removeListener: jest.fn(),
        },
        once: jest.fn((event: string, callback: (arg: number | null | Error) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);

          // Simulate failed close
          if (event === 'close') {
            setTimeout(() => {
              callback(1);
            }, 10);
          }
          return mockProcess;
        }),
      };
      mockSpawn.mockReturnValue(mockProcess);

      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      const result = await updateHandler('', context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Update failed');
      expect(context.outputs.some((o) => o.content.includes('Update failed.'))).toBe(true);
      expect(context.outputs.some((o) => o.content.includes('Try manually:'))).toBe(true);
    });

    it('handles spawn error', async () => {
      // Mock GitHub API to return a newer version so update proceeds
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            tag_name: 'v0.2.0',
            html_url: 'https://github.com/danielscholl/agent-base-v2/releases/tag/v0.2.0',
            assets: [],
          }),
      });

      const eventHandlers: Record<string, ((arg: number | null | Error) => void)[]> = {};
      const mockProcess = {
        stdout: {
          on: jest.fn(),
          removeListener: jest.fn(),
        },
        stderr: {
          on: jest.fn(),
          removeListener: jest.fn(),
        },
        once: jest.fn((event: string, callback: (arg: number | null | Error) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);

          // Simulate error event
          if (event === 'error') {
            setTimeout(() => {
              callback(new Error('Command not found'));
            }, 10);
          }
          return mockProcess;
        }),
      };
      mockSpawn.mockReturnValue(mockProcess);

      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      const result = await updateHandler('', context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Update failed');
      expect(context.outputs.some((o) => o.content.includes('Update failed.'))).toBe(true);
    });
  });

  describe('combined flags', () => {
    beforeEach(() => {
      process.argv = ['bun', '/Users/test/.bun/install/global/agent-base-v2/index.js'];
    });

    it('handles --check and --force together (check takes precedence)', async () => {
      const { updateHandler } = await import('../update.js');
      const context = createMockContext();
      const result = await updateHandler('--check --force', context);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Check complete');
      expect(context.outputs.some((o) => o.content.includes('Checking for updates...'))).toBe(true);
    });
  });
});
