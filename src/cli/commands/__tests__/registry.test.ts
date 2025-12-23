/**
 * Tests for command registry and dispatcher.
 */

import { describe, it, expect } from '@jest/globals';
import {
  findCommand,
  extractArgs,
  isCommand,
  executeCommand,
  getAutocompleteCommands,
  COMMANDS,
} from '../index.js';
import type { CommandContext } from '../types.js';

describe('COMMANDS', () => {
  it('should contain all expected commands', () => {
    const aliases = COMMANDS.flatMap((cmd) => Array.from(cmd.aliases));

    expect(aliases).toContain('exit');
    expect(aliases).toContain('/exit');
    expect(aliases).toContain('help');
    expect(aliases).toContain('/help');
    expect(aliases).toContain('clear');
    expect(aliases).toContain('/clear');
    expect(aliases).toContain('/telemetry');
  });
});

describe('findCommand', () => {
  it('should find exit command by various aliases', () => {
    expect(findCommand('exit')).toBeDefined();
    expect(findCommand('quit')).toBeDefined();
    expect(findCommand('q')).toBeDefined();
    expect(findCommand('/exit')).toBeDefined();
    expect(findCommand('/quit')).toBeDefined();
  });

  it('should find help command by various aliases', () => {
    expect(findCommand('help')).toBeDefined();
    expect(findCommand('?')).toBeDefined();
    expect(findCommand('/help')).toBeDefined();
  });

  it('should find clear command by various aliases', () => {
    expect(findCommand('clear')).toBeDefined();
    expect(findCommand('/clear')).toBeDefined();
  });

  it('should find telemetry command', () => {
    expect(findCommand('/telemetry')).toBeDefined();
    expect(findCommand('/aspire')).toBeDefined();
  });

  it('should be case-insensitive', () => {
    expect(findCommand('EXIT')).toBeDefined();
    expect(findCommand('Help')).toBeDefined();
    expect(findCommand('/CLEAR')).toBeDefined();
  });

  it('should extract base command from input with arguments', () => {
    expect(findCommand('/telemetry start')).toBeDefined();
    expect(findCommand('/telemetry stop')).toBeDefined();
  });

  it('should return undefined for unknown commands', () => {
    expect(findCommand('/unknown')).toBeUndefined();
    expect(findCommand('notacommand')).toBeUndefined();
    expect(findCommand('hello world')).toBeUndefined();
  });

  it('should return undefined for empty input', () => {
    expect(findCommand('')).toBeUndefined();
    expect(findCommand('   ')).toBeUndefined();
  });
});

describe('extractArgs', () => {
  it('should extract arguments after command', () => {
    expect(extractArgs('/telemetry start')).toBe('start');
    expect(extractArgs('/telemetry stop')).toBe('stop');
    expect(extractArgs('command arg1 arg2')).toBe('arg1 arg2');
  });

  it('should handle commands without arguments', () => {
    expect(extractArgs('/help')).toBe('');
    expect(extractArgs('exit')).toBe('');
    expect(extractArgs('/clear')).toBe('');
  });

  it('should trim whitespace', () => {
    expect(extractArgs('  /telemetry   start  ')).toBe('start');
    expect(extractArgs('/command   arg1   arg2  ')).toBe('arg1   arg2');
  });
});

describe('isCommand', () => {
  it('should return true for known commands', () => {
    expect(isCommand('exit')).toBe(true);
    expect(isCommand('quit')).toBe(true);
    expect(isCommand('q')).toBe(true);
    expect(isCommand('help')).toBe(true);
    expect(isCommand('?')).toBe(true);
    expect(isCommand('/help')).toBe(true);
    expect(isCommand('/exit')).toBe(true);
    expect(isCommand('/clear')).toBe(true);
    expect(isCommand('/telemetry')).toBe(true);
  });

  it('should return true for shell commands', () => {
    expect(isCommand('!ls')).toBe(true);
    expect(isCommand('!pwd')).toBe(true);
    expect(isCommand('!ls -la')).toBe(true);
  });

  it('should return true for unknown slash commands', () => {
    expect(isCommand('/unknown')).toBe(true);
    expect(isCommand('/foo')).toBe(true);
    expect(isCommand('/continue')).toBe(true);
  });

  it('should return false for regular input', () => {
    expect(isCommand('hello')).toBe(false);
    expect(isCommand('what is the weather')).toBe(false);
    expect(isCommand('')).toBe(false);
  });

  it('should return false for escaped slash commands (//)', () => {
    expect(isCommand('//etc/hosts')).toBe(false);
    expect(isCommand('//path/to/file')).toBe(false);
    expect(isCommand('//')).toBe(false);
  });
});

describe('executeCommand', () => {
  function createMockContext(): CommandContext & {
    outputs: Array<{ content: string; type?: string }>;
  } {
    const ctx: CommandContext & { outputs: Array<{ content: string; type?: string }> } = {
      config: null,
      outputs: [],
      onOutput: (content: string, type?: string) => {
        ctx.outputs.push({ content, type });
      },
      exit: () => {},
    };
    return ctx;
  }

  it('should return undefined for regular input', async () => {
    const context = createMockContext();
    const result = await executeCommand('hello world', context);
    expect(result).toBeUndefined();
  });

  it('should handle unknown slash commands with error', async () => {
    const context = createMockContext();
    const result = await executeCommand('/unknown', context);

    expect(result).toBeDefined();
    expect(result?.success).toBe(false);
    expect(context.outputs.length).toBeGreaterThan(0);
    expect(context.outputs[0].content).toContain('Unknown command');
    expect(context.outputs[0].content).toContain('/unknown');
  });

  it('should handle unknown slash commands with arguments', async () => {
    const context = createMockContext();
    const result = await executeCommand('/foo bar baz', context);

    expect(result).toBeDefined();
    expect(result?.success).toBe(false);
    expect(context.outputs[0].content).toContain('/foo');
  });
});

describe('getAutocompleteCommands', () => {
  it('should return commands without leading slash', () => {
    const commands = getAutocompleteCommands();
    for (const cmd of commands) {
      expect(cmd.name).not.toMatch(/^\//);
    }
  });

  it('should return commands sorted alphabetically', () => {
    const commands = getAutocompleteCommands();
    const names = commands.map((c) => c.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('should include all slash commands from COMMANDS', () => {
    const commands = getAutocompleteCommands();
    const names = commands.map((c) => c.name);

    // Check that key commands are present
    expect(names).toContain('clear');
    expect(names).toContain('help');
    expect(names).toContain('history');
    expect(names).toContain('telemetry');
    expect(names).toContain('save');
    expect(names).toContain('sessions');
  });

  it('should include descriptions', () => {
    const commands = getAutocompleteCommands();
    for (const cmd of commands) {
      expect(cmd.description).toBeDefined();
      expect(cmd.description.length).toBeGreaterThan(0);
    }
  });

  it('should not include non-slash aliases', () => {
    // Commands like 'exit', 'quit', 'q' should not be duplicated
    // Only /exit should appear as 'exit'
    const commands = getAutocompleteCommands();
    const names = commands.map((c) => c.name);

    // Should have 'exit' (from /exit) but not 'quit' or 'q'
    expect(names).toContain('exit');
    expect(names).not.toContain('quit');
    expect(names).not.toContain('q');
  });
});
