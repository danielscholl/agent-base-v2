/**
 * Tests for CLI router component.
 *
 * Note: --version is handled by meow's autoVersion feature before the CLI renders,
 * so there are no version routing tests here.
 *
 * These tests use jest.isolateModulesAsync to ensure each test gets fresh ESM mocks.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render } from 'ink-testing-library';
import type { CLIFlags } from '../types.js';

// Helper to poll for expected content - CI environments need time for React to flush
async function waitForContent(
  lastFrame: () => string | undefined,
  expected: string,
  maxWait = 2000
): Promise<void> {
  const interval = 50;
  let elapsed = 0;
  while (elapsed < maxWait) {
    await new Promise((resolve) => {
      setTimeout(resolve, interval);
    });
    elapsed += interval;
    const frame = lastFrame();
    if (frame !== undefined && frame.includes(expected)) {
      return;
    }
  }
}

// Setup mocks and import CLI in an isolated module context
async function setupCLI(): Promise<{ CLI: React.ComponentType<{ flags: CLIFlags }> }> {
  jest.unstable_mockModule('../../components/HealthCheck.js', () => ({
    HealthCheck: () => React.createElement('span', null, 'HEALTHCHECK_MOCK'),
  }));

  jest.unstable_mockModule('../../components/ToolsInfo.js', () => ({
    ToolsInfo: () => React.createElement('span', null, 'TOOLSINFO_MOCK'),
  }));

  jest.unstable_mockModule('../../components/SinglePrompt.js', () => ({
    SinglePrompt: ({ prompt, verbose }: { prompt: string; verbose?: boolean }) =>
      React.createElement(
        'span',
        null,
        `SINGLEPROMPT_MOCK: ${prompt}${verbose === true ? ' (verbose)' : ''}`
      ),
  }));

  jest.unstable_mockModule('../../components/InteractiveShell.js', () => ({
    InteractiveShell: ({ resumeSession }: { resumeSession?: boolean }) =>
      React.createElement(
        'span',
        null,
        `INTERACTIVESHELL_MOCK${resumeSession === true ? ' (resume)' : ''}`
      ),
  }));

  const { CLI } = await import('../../cli.js');
  return { CLI };
}

describe('CLI', () => {
  const defaultFlags: CLIFlags = {
    prompt: undefined,
    check: false,
    tools: false,
    version: false,
    provider: undefined,
    model: undefined,
    continue: false,
    verbose: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('routing', () => {
    it('renders HealthCheck when --check flag is set', async () => {
      const { CLI } = await setupCLI();
      const flags: CLIFlags = { ...defaultFlags, check: true };
      const { lastFrame } = render(<CLI flags={flags} />);
      await waitForContent(lastFrame, 'HEALTHCHECK_MOCK');
      expect(lastFrame()).toContain('HEALTHCHECK_MOCK');
    });

    it('renders ToolsInfo when --tools flag is set', async () => {
      const { CLI } = await setupCLI();
      const flags: CLIFlags = { ...defaultFlags, tools: true };
      const { lastFrame } = render(<CLI flags={flags} />);
      await waitForContent(lastFrame, 'TOOLSINFO_MOCK');
      expect(lastFrame()).toContain('TOOLSINFO_MOCK');
    });

    it('renders SinglePrompt when -p flag has a value', async () => {
      const { CLI } = await setupCLI();
      const flags: CLIFlags = { ...defaultFlags, prompt: 'Hello world' };
      const { lastFrame } = render(<CLI flags={flags} />);
      await waitForContent(lastFrame, 'SINGLEPROMPT_MOCK');
      expect(lastFrame()).toContain('SINGLEPROMPT_MOCK: Hello world');
    });

    it('passes verbose flag to SinglePrompt', async () => {
      const { CLI } = await setupCLI();
      const flags: CLIFlags = { ...defaultFlags, prompt: 'Hello world', verbose: true };
      const { lastFrame } = render(<CLI flags={flags} />);
      await waitForContent(lastFrame, '(verbose)');
      expect(lastFrame()).toContain('(verbose)');
    });

    it('renders InteractiveShell by default', async () => {
      const { CLI } = await setupCLI();
      const { lastFrame } = render(<CLI flags={defaultFlags} />);
      await waitForContent(lastFrame, 'INTERACTIVESHELL_MOCK');
      expect(lastFrame()).toContain('INTERACTIVESHELL_MOCK');
    });

    it('passes continue flag to InteractiveShell as resumeSession', async () => {
      const { CLI } = await setupCLI();
      const flags: CLIFlags = { ...defaultFlags, continue: true };
      const { lastFrame } = render(<CLI flags={flags} />);
      await waitForContent(lastFrame, '(resume)');
      expect(lastFrame()).toContain('(resume)');
    });
  });

  describe('flag priority', () => {
    it('check flag has priority over tools and prompt', async () => {
      const { CLI } = await setupCLI();
      const flags: CLIFlags = {
        ...defaultFlags,
        check: true,
        tools: true,
        prompt: 'test',
      };
      const { lastFrame } = render(<CLI flags={flags} />);
      await waitForContent(lastFrame, 'HEALTHCHECK_MOCK');
      expect(lastFrame()).toContain('HEALTHCHECK_MOCK');
    });

    it('tools flag has priority over prompt', async () => {
      const { CLI } = await setupCLI();
      const flags: CLIFlags = {
        ...defaultFlags,
        tools: true,
        prompt: 'test',
      };
      const { lastFrame } = render(<CLI flags={flags} />);
      await waitForContent(lastFrame, 'TOOLSINFO_MOCK');
      expect(lastFrame()).toContain('TOOLSINFO_MOCK');
    });

    it('prompt flag has priority over interactive mode', async () => {
      const { CLI } = await setupCLI();
      const flags: CLIFlags = {
        ...defaultFlags,
        prompt: 'test',
        continue: true,
      };
      const { lastFrame } = render(<CLI flags={flags} />);
      await waitForContent(lastFrame, 'SINGLEPROMPT_MOCK');
      expect(lastFrame()).toContain('SINGLEPROMPT_MOCK');
    });
  });

  describe('edge cases', () => {
    it('treats empty string prompt as no prompt (interactive mode)', async () => {
      const { CLI } = await setupCLI();
      const flags: CLIFlags = { ...defaultFlags, prompt: '' };
      const { lastFrame } = render(<CLI flags={flags} />);
      await waitForContent(lastFrame, 'INTERACTIVESHELL_MOCK');
      expect(lastFrame()).toContain('INTERACTIVESHELL_MOCK');
    });

    it('handles undefined flags gracefully', async () => {
      const { CLI } = await setupCLI();
      const flags: CLIFlags = {};
      const { lastFrame } = render(<CLI flags={flags} />);
      await waitForContent(lastFrame, 'INTERACTIVESHELL_MOCK');
      expect(lastFrame()).toContain('INTERACTIVESHELL_MOCK');
    });
  });
});
