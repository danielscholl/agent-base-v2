/**
 * Tests for skill dependency checking utilities.
 */

import { describe, expect, it } from '@jest/globals';
import {
  checkCommandAvailable,
  parseRequires,
  findMissingCommands,
  checkSkillDependencies,
} from '../dependencies.js';

describe('parseRequires', () => {
  it('returns empty array for undefined', () => {
    expect(parseRequires(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseRequires('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(parseRequires('   ')).toEqual([]);
  });

  it('parses single command', () => {
    expect(parseRequires('gh')).toEqual(['gh']);
  });

  it('parses multiple commands', () => {
    expect(parseRequires('gh git docker')).toEqual(['gh', 'git', 'docker']);
  });

  it('handles extra whitespace', () => {
    expect(parseRequires('  gh   git  ')).toEqual(['gh', 'git']);
  });

  it('handles tabs and multiple spaces', () => {
    expect(parseRequires('gh\tgit  docker')).toEqual(['gh', 'git', 'docker']);
  });
});

describe('checkCommandAvailable', () => {
  it('returns true for common commands (ls/dir)', () => {
    // 'ls' exists on Unix, 'dir' exists on Windows
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'cmd' : 'ls';
    expect(checkCommandAvailable(command)).toBe(true);
  });

  it('returns false for nonexistent commands', () => {
    expect(checkCommandAvailable('this-command-definitely-does-not-exist-12345')).toBe(false);
  });

  it('returns false for empty command', () => {
    expect(checkCommandAvailable('')).toBe(false);
  });

  it('handles commands with special characters gracefully', () => {
    // Should not throw, just return false
    expect(checkCommandAvailable('cmd;echo')).toBe(false);
  });
});

describe('findMissingCommands', () => {
  it('returns empty array when no commands required', () => {
    expect(findMissingCommands([])).toEqual([]);
  });

  it('returns empty array when all commands exist', () => {
    const isWindows = process.platform === 'win32';
    const existingCmd = isWindows ? 'cmd' : 'ls';
    expect(findMissingCommands([existingCmd])).toEqual([]);
  });

  it('returns missing commands', () => {
    const missing = findMissingCommands(['nonexistent-cmd-12345']);
    expect(missing).toEqual(['nonexistent-cmd-12345']);
  });

  it('returns only missing commands from mixed list', () => {
    const isWindows = process.platform === 'win32';
    const existingCmd = isWindows ? 'cmd' : 'ls';
    const missing = findMissingCommands([existingCmd, 'nonexistent-cmd-12345']);
    expect(missing).toEqual(['nonexistent-cmd-12345']);
  });
});

describe('checkSkillDependencies', () => {
  it('returns available for undefined requires', () => {
    const result = checkSkillDependencies(undefined);
    expect(result.available).toBe(true);
    expect(result.missingCommands).toEqual([]);
    expect(result.reason).toBeUndefined();
  });

  it('returns available for empty requires', () => {
    const result = checkSkillDependencies('');
    expect(result.available).toBe(true);
    expect(result.missingCommands).toEqual([]);
  });

  it('returns available when all commands exist', () => {
    const isWindows = process.platform === 'win32';
    const existingCmd = isWindows ? 'cmd' : 'ls';
    const result = checkSkillDependencies(existingCmd);
    expect(result.available).toBe(true);
    expect(result.missingCommands).toEqual([]);
  });

  it('returns unavailable with reason when commands missing', () => {
    const result = checkSkillDependencies('nonexistent-cmd-12345');
    expect(result.available).toBe(false);
    expect(result.missingCommands).toEqual(['nonexistent-cmd-12345']);
    expect(result.reason).toBe('missing commands: nonexistent-cmd-12345');
  });

  it('lists multiple missing commands in reason', () => {
    const result = checkSkillDependencies('missing-1 missing-2');
    expect(result.available).toBe(false);
    expect(result.missingCommands).toEqual(['missing-1', 'missing-2']);
    expect(result.reason).toBe('missing commands: missing-1, missing-2');
  });

  it('only reports actually missing commands', () => {
    const isWindows = process.platform === 'win32';
    const existingCmd = isWindows ? 'cmd' : 'ls';
    const result = checkSkillDependencies(`${existingCmd} missing-cmd-12345`);
    expect(result.available).toBe(false);
    expect(result.missingCommands).toEqual(['missing-cmd-12345']);
    expect(result.reason).toBe('missing commands: missing-cmd-12345');
  });
});
