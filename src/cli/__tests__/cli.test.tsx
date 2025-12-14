/**
 * Tests for CLI router component.
 *
 * Note: --version is handled by meow's autoVersion feature before the CLI renders,
 * so there are no version routing tests here.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render } from 'ink-testing-library';
import type { CLIFlags } from '../types.js';

// Mock all mode components before importing CLI
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

// Import CLI after mocking
const { CLI } = await import('../../cli.js');

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
  });

  describe('routing', () => {
    it('renders HealthCheck when --check flag is set', () => {
      const flags: CLIFlags = { ...defaultFlags, check: true };
      const { lastFrame } = render(<CLI flags={flags} />);
      expect(lastFrame()).toContain('HEALTHCHECK_MOCK');
    });

    it('renders ToolsInfo when --tools flag is set', () => {
      const flags: CLIFlags = { ...defaultFlags, tools: true };
      const { lastFrame } = render(<CLI flags={flags} />);
      expect(lastFrame()).toContain('TOOLSINFO_MOCK');
    });

    it('renders SinglePrompt when -p flag has a value', () => {
      const flags: CLIFlags = { ...defaultFlags, prompt: 'Hello world' };
      const { lastFrame } = render(<CLI flags={flags} />);
      expect(lastFrame()).toContain('SINGLEPROMPT_MOCK: Hello world');
    });

    it('passes verbose flag to SinglePrompt', () => {
      const flags: CLIFlags = { ...defaultFlags, prompt: 'Hello world', verbose: true };
      const { lastFrame } = render(<CLI flags={flags} />);
      expect(lastFrame()).toContain('(verbose)');
    });

    it('renders InteractiveShell by default', () => {
      const { lastFrame } = render(<CLI flags={defaultFlags} />);
      expect(lastFrame()).toContain('INTERACTIVESHELL_MOCK');
    });

    it('passes continue flag to InteractiveShell as resumeSession', () => {
      const flags: CLIFlags = { ...defaultFlags, continue: true };
      const { lastFrame } = render(<CLI flags={flags} />);
      expect(lastFrame()).toContain('(resume)');
    });
  });

  describe('flag priority', () => {
    it('check flag has priority over tools and prompt', () => {
      const flags: CLIFlags = {
        ...defaultFlags,
        check: true,
        tools: true,
        prompt: 'test',
      };
      const { lastFrame } = render(<CLI flags={flags} />);
      expect(lastFrame()).toContain('HEALTHCHECK_MOCK');
    });

    it('tools flag has priority over prompt', () => {
      const flags: CLIFlags = {
        ...defaultFlags,
        tools: true,
        prompt: 'test',
      };
      const { lastFrame } = render(<CLI flags={flags} />);
      expect(lastFrame()).toContain('TOOLSINFO_MOCK');
    });

    it('prompt flag has priority over interactive mode', () => {
      const flags: CLIFlags = {
        ...defaultFlags,
        prompt: 'test',
        continue: true,
      };
      const { lastFrame } = render(<CLI flags={flags} />);
      expect(lastFrame()).toContain('SINGLEPROMPT_MOCK');
    });
  });

  describe('edge cases', () => {
    it('treats empty string prompt as no prompt (interactive mode)', () => {
      const flags: CLIFlags = { ...defaultFlags, prompt: '' };
      const { lastFrame } = render(<CLI flags={flags} />);
      expect(lastFrame()).toContain('INTERACTIVESHELL_MOCK');
    });

    it('handles undefined flags gracefully', () => {
      const flags: CLIFlags = {};
      const { lastFrame } = render(<CLI flags={flags} />);
      expect(lastFrame()).toContain('INTERACTIVESHELL_MOCK');
    });
  });
});
