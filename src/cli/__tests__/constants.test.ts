/**
 * Tests for CLI constants and utility functions.
 */

import {
  COMMAND_EXIT,
  COMMAND_HELP,
  COMMAND_CLEAR,
  COMMAND_TELEMETRY,
  SHELL_PREFIX,
  EXIT_CODES,
  matchesCommand,
  isShellCommand,
  isSlashCommand,
  unescapeSlash,
  extractShellCommand,
} from '../constants.js';

describe('CLI Constants', () => {
  describe('Command aliases', () => {
    it('should define exit command aliases', () => {
      expect(COMMAND_EXIT).toContain('exit');
      expect(COMMAND_EXIT).toContain('quit');
      expect(COMMAND_EXIT).toContain('q');
      expect(COMMAND_EXIT).toContain('/exit');
      expect(COMMAND_EXIT).toContain('/quit');
    });

    it('should define help command aliases', () => {
      expect(COMMAND_HELP).toContain('help');
      expect(COMMAND_HELP).toContain('?');
      expect(COMMAND_HELP).toContain('/help');
    });

    it('should define clear command aliases', () => {
      expect(COMMAND_CLEAR).toContain('clear');
      expect(COMMAND_CLEAR).toContain('/clear');
    });

    it('should define telemetry command aliases', () => {
      expect(COMMAND_TELEMETRY).toContain('/telemetry');
      expect(COMMAND_TELEMETRY).toContain('/aspire');
    });
  });

  describe('SHELL_PREFIX', () => {
    it('should be "!"', () => {
      expect(SHELL_PREFIX).toBe('!');
    });
  });

  describe('EXIT_CODES', () => {
    it('should define standard exit codes', () => {
      expect(EXIT_CODES.SUCCESS).toBe(0);
      expect(EXIT_CODES.GENERAL_ERROR).toBe(1);
      expect(EXIT_CODES.CONFIG_ERROR).toBe(2);
      expect(EXIT_CODES.INTERRUPTED).toBe(130);
    });
  });
});

describe('matchesCommand', () => {
  it('should match exact command strings', () => {
    expect(matchesCommand('exit', COMMAND_EXIT)).toBe(true);
    expect(matchesCommand('quit', COMMAND_EXIT)).toBe(true);
    expect(matchesCommand('q', COMMAND_EXIT)).toBe(true);
    expect(matchesCommand('/exit', COMMAND_EXIT)).toBe(true);
  });

  it('should be case-insensitive', () => {
    expect(matchesCommand('EXIT', COMMAND_EXIT)).toBe(true);
    expect(matchesCommand('Exit', COMMAND_EXIT)).toBe(true);
    expect(matchesCommand('QUIT', COMMAND_EXIT)).toBe(true);
    expect(matchesCommand('/HELP', COMMAND_HELP)).toBe(true);
  });

  it('should trim whitespace', () => {
    expect(matchesCommand('  exit  ', COMMAND_EXIT)).toBe(true);
    expect(matchesCommand('\texit\n', COMMAND_EXIT)).toBe(true);
  });

  it('should not match partial strings', () => {
    expect(matchesCommand('ex', COMMAND_EXIT)).toBe(false);
    expect(matchesCommand('exiting', COMMAND_EXIT)).toBe(false);
    expect(matchesCommand('quitnow', COMMAND_EXIT)).toBe(false);
  });

  it('should not match unrelated strings', () => {
    expect(matchesCommand('hello', COMMAND_EXIT)).toBe(false);
    expect(matchesCommand('/unknown', COMMAND_EXIT)).toBe(false);
  });
});

describe('isShellCommand', () => {
  it('should return true for strings starting with "!"', () => {
    expect(isShellCommand('!ls')).toBe(true);
    expect(isShellCommand('!ls -la')).toBe(true);
    expect(isShellCommand('! pwd')).toBe(true);
    expect(isShellCommand('!')).toBe(true);
  });

  it('should trim whitespace before checking', () => {
    expect(isShellCommand('  !ls')).toBe(true);
    expect(isShellCommand('\t!pwd')).toBe(true);
  });

  it('should return false for non-shell commands', () => {
    expect(isShellCommand('/help')).toBe(false);
    expect(isShellCommand('exit')).toBe(false);
    expect(isShellCommand('hello')).toBe(false);
    expect(isShellCommand('')).toBe(false);
  });
});

describe('isSlashCommand', () => {
  it('should return true for strings starting with "/"', () => {
    expect(isSlashCommand('/help')).toBe(true);
    expect(isSlashCommand('/exit')).toBe(true);
    expect(isSlashCommand('/telemetry start')).toBe(true);
    expect(isSlashCommand('/')).toBe(true);
  });

  it('should trim whitespace before checking', () => {
    expect(isSlashCommand('  /help')).toBe(true);
    expect(isSlashCommand('\t/exit')).toBe(true);
  });

  it('should return false for non-slash commands', () => {
    expect(isSlashCommand('!ls')).toBe(false);
    expect(isSlashCommand('exit')).toBe(false);
    expect(isSlashCommand('hello')).toBe(false);
    expect(isSlashCommand('')).toBe(false);
  });

  it('should return false for escaped slash (//)', () => {
    expect(isSlashCommand('//etc/hosts')).toBe(false);
    expect(isSlashCommand('//path/to/file')).toBe(false);
    expect(isSlashCommand('//')).toBe(false);
  });
});

describe('unescapeSlash', () => {
  it('should return unescaped content for //... inputs', () => {
    expect(unescapeSlash('//etc/hosts')).toBe('/etc/hosts');
    expect(unescapeSlash('//path/to/file')).toBe('/path/to/file');
    expect(unescapeSlash('//')).toBe('/');
    expect(unescapeSlash('//hello')).toBe('/hello');
  });

  it('should trim whitespace before checking', () => {
    expect(unescapeSlash('  //etc/hosts')).toBe('/etc/hosts');
    expect(unescapeSlash('\t//path')).toBe('/path');
  });

  it('should return undefined for non-escaped inputs', () => {
    expect(unescapeSlash('/help')).toBeUndefined();
    expect(unescapeSlash('hello')).toBeUndefined();
    expect(unescapeSlash('!ls')).toBeUndefined();
    expect(unescapeSlash('')).toBeUndefined();
    expect(unescapeSlash('/')).toBeUndefined();
  });
});

describe('extractShellCommand', () => {
  it('should remove the "!" prefix', () => {
    expect(extractShellCommand('!ls')).toBe('ls');
    expect(extractShellCommand('!ls -la')).toBe('ls -la');
    expect(extractShellCommand('!pwd')).toBe('pwd');
  });

  it('should trim the result', () => {
    expect(extractShellCommand('! ls')).toBe('ls');
    expect(extractShellCommand('!  ls -la  ')).toBe('ls -la');
  });

  it('should handle edge cases', () => {
    expect(extractShellCommand('!')).toBe('');
    expect(extractShellCommand('!   ')).toBe('');
  });
});
