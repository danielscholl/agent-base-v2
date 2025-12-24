/**
 * Tests for CLI router component.
 */

import { describe, it, expect } from '@jest/globals';
import type { CLIFlags } from '../types.js';

// Import real modules. We test routing by inspecting the returned React element,
// not by rendering (avoids ESM mock/cache flakiness in CI and avoids Ink warnings).
import { CLI } from '../../cli.js';
import { HealthCheck } from '../../components/HealthCheck.js';
import { ToolsInfo } from '../../components/ToolsInfo.js';
import { SinglePrompt } from '../../components/SinglePrompt.js';
import { InteractiveShell } from '../../components/InteractiveShell.js';

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

  describe('routing', () => {
    it('renders HealthCheck when --check flag is set', () => {
      const flags: CLIFlags = { ...defaultFlags, check: true };
      const element = CLI({ flags });
      expect(element.type).toBe(HealthCheck);
    });

    it('renders ToolsInfo when --tools flag is set', () => {
      const flags: CLIFlags = { ...defaultFlags, tools: true };
      const element = CLI({ flags });
      expect(element.type).toBe(ToolsInfo);
    });

    it('renders SinglePrompt when -p flag has a value', () => {
      const flags: CLIFlags = { ...defaultFlags, prompt: 'Hello world' };
      const element = CLI({ flags });
      expect(element.type).toBe(SinglePrompt);
      expect(element.props).toMatchObject({ prompt: 'Hello world' });
    });

    it('passes verbose flag to SinglePrompt', () => {
      const flags: CLIFlags = { ...defaultFlags, prompt: 'Hello world', verbose: true };
      const element = CLI({ flags });
      expect(element.type).toBe(SinglePrompt);
      expect(element.props).toMatchObject({ verbose: true });
    });

    it('renders InteractiveShell by default', () => {
      const element = CLI({ flags: defaultFlags });
      expect(element.type).toBe(InteractiveShell);
    });

    it('passes continue flag to InteractiveShell as resumeSession', () => {
      const flags: CLIFlags = { ...defaultFlags, continue: true };
      const element = CLI({ flags });
      expect(element.type).toBe(InteractiveShell);
      expect(element.props).toMatchObject({ resumeSession: true });
    });

    it('passes verbose flag to InteractiveShell', () => {
      const flags: CLIFlags = { ...defaultFlags, verbose: true };
      const element = CLI({ flags });
      expect(element.type).toBe(InteractiveShell);
      expect(element.props).toMatchObject({ verbose: true });
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
      const element = CLI({ flags });
      expect(element.type).toBe(HealthCheck);
    });

    it('tools flag has priority over prompt', () => {
      const flags: CLIFlags = {
        ...defaultFlags,
        tools: true,
        prompt: 'test',
      };
      const element = CLI({ flags });
      expect(element.type).toBe(ToolsInfo);
    });

    it('prompt flag has priority over interactive mode', () => {
      const flags: CLIFlags = {
        ...defaultFlags,
        prompt: 'test',
        continue: true,
      };
      const element = CLI({ flags });
      expect(element.type).toBe(SinglePrompt);
    });
  });

  describe('edge cases', () => {
    it('treats empty string prompt as no prompt (interactive mode)', () => {
      const flags: CLIFlags = { ...defaultFlags, prompt: '' };
      const element = CLI({ flags });
      expect(element.type).toBe(InteractiveShell);
    });

    it('handles undefined flags gracefully', () => {
      const flags: CLIFlags = {};
      const element = CLI({ flags });
      expect(element.type).toBe(InteractiveShell);
    });
  });
});
