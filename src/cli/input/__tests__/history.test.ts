/**
 * Tests for InputHistory class.
 */

import { InputHistory } from '../history.js';

describe('InputHistory', () => {
  let history: InputHistory;

  beforeEach(() => {
    history = new InputHistory();
  });

  describe('add', () => {
    it('should add entries to history', () => {
      history.add('command1');
      history.add('command2');

      expect(history.getAll()).toEqual(['command1', 'command2']);
    });

    it('should not add empty strings', () => {
      history.add('');
      history.add('   ');

      expect(history.getAll()).toEqual([]);
    });

    it('should trim entries', () => {
      history.add('  command  ');

      expect(history.getAll()).toEqual(['command']);
    });

    it('should not add duplicate of last entry', () => {
      history.add('command1');
      history.add('command1');
      history.add('command1');

      expect(history.getAll()).toEqual(['command1']);
    });

    it('should allow duplicate if not consecutive', () => {
      history.add('command1');
      history.add('command2');
      history.add('command1');

      expect(history.getAll()).toEqual(['command1', 'command2', 'command1']);
    });

    it('should limit history to MAX_HISTORY_SIZE (100)', () => {
      for (let i = 0; i < 150; i++) {
        history.add(`command${String(i)}`);
      }

      const all = history.getAll();
      expect(all.length).toBe(100);
      expect(all[0]).toBe('command50');
      expect(all[99]).toBe('command149');
    });
  });

  describe('previous', () => {
    it('should return undefined for empty history', () => {
      expect(history.previous('')).toBeUndefined();
    });

    it('should navigate backwards through history', () => {
      history.add('command1');
      history.add('command2');
      history.add('command3');

      expect(history.previous('')).toBe('command3');
      expect(history.previous('')).toBe('command2');
      expect(history.previous('')).toBe('command1');
    });

    it('should return undefined at start of history', () => {
      history.add('command1');

      expect(history.previous('')).toBe('command1');
      expect(history.previous('')).toBeUndefined();
    });

    it('should save current input when starting navigation', () => {
      history.add('command1');

      history.previous('current-input');
      history.next();

      // After navigating forward past history, should return saved input
      expect(history.getPosition()).toBe(-1);
    });
  });

  describe('next', () => {
    it('should return undefined if not navigating', () => {
      history.add('command1');

      expect(history.next()).toBeUndefined();
    });

    it('should navigate forward through history', () => {
      history.add('command1');
      history.add('command2');
      history.add('command3');

      // Navigate to start
      history.previous('');
      history.previous('');
      history.previous('');

      // Navigate forward
      expect(history.next()).toBe('command2');
      expect(history.next()).toBe('command3');
    });

    it('should return to temp input at end', () => {
      history.add('command1');
      history.add('command2');

      history.previous('my-current');
      history.previous('my-current');

      history.next();
      const result = history.next();

      expect(result).toBe('my-current');
      expect(history.getPosition()).toBe(-1);
    });
  });

  describe('reset', () => {
    it('should reset navigation position', () => {
      history.add('command1');
      history.add('command2');

      history.previous('');
      expect(history.getPosition()).not.toBe(-1);

      history.reset();
      expect(history.getPosition()).toBe(-1);
    });

    it('should clear temp input', () => {
      history.add('command1');

      history.previous('temp');
      history.reset();

      // Starting new navigation shouldn't have old temp
      history.previous('');
      const result = history.next();
      expect(result).toBe('');
    });
  });

  describe('getAll', () => {
    it('should return copy of history', () => {
      history.add('command1');
      history.add('command2');

      const all = history.getAll();
      all.push('command3'); // Modify copy

      expect(history.getAll()).toEqual(['command1', 'command2']);
    });
  });

  describe('clear', () => {
    it('should remove all history', () => {
      history.add('command1');
      history.add('command2');

      history.clear();

      expect(history.getAll()).toEqual([]);
    });

    it('should reset navigation', () => {
      history.add('command1');
      history.previous('');

      history.clear();

      expect(history.getPosition()).toBe(-1);
    });
  });

  describe('getPosition', () => {
    it('should return -1 when not navigating', () => {
      expect(history.getPosition()).toBe(-1);
    });

    it('should return current position during navigation', () => {
      history.add('command1');
      history.add('command2');
      history.add('command3');

      history.previous('');
      expect(history.getPosition()).toBe(2);

      history.previous('');
      expect(history.getPosition()).toBe(1);
    });
  });

  describe('navigation edge cases', () => {
    it('should handle rapid up/down navigation', () => {
      history.add('a');
      history.add('b');
      history.add('c');

      // Up, up, down, up, down, down
      history.previous('x');
      history.previous('x');
      history.next();
      history.previous('x');
      history.next();
      history.next();

      // Should be back at temp input
      expect(history.getPosition()).toBe(-1);
    });

    it('should maintain state across add operations', () => {
      history.add('old');
      history.previous('current');

      history.add('new'); // This resets position

      expect(history.getPosition()).toBe(-1);
      expect(history.getAll()).toEqual(['old', 'new']);
    });
  });
});
