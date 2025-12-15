/**
 * Tests for MessageHistory class.
 */

import { MessageHistory } from '../message-history.js';
import type { Message } from '../../agent/types.js';

describe('MessageHistory', () => {
  let history: MessageHistory;

  beforeEach(() => {
    history = new MessageHistory();
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const h = new MessageHistory();
      expect(h.size).toBe(0);
      expect(h.isEmpty).toBe(true);
    });

    it('should accept custom historyLimit', () => {
      const h = new MessageHistory({ historyLimit: 5 });
      for (let i = 0; i < 10; i++) {
        h.add({ role: 'user', content: `msg${String(i)}` });
      }
      expect(h.size).toBe(5);
    });

    it('should accept debug callback', () => {
      const debugMsgs: string[] = [];
      const h = new MessageHistory({
        onDebug: (msg) => debugMsgs.push(msg),
      });
      h.add({ role: 'user', content: 'test' });
      expect(debugMsgs.length).toBeGreaterThan(0);
    });
  });

  describe('add', () => {
    it('should add a single message with generated ID and timestamp', () => {
      const msg: Message = { role: 'user', content: 'Hello' };
      const stored = history.add(msg);

      expect(stored.id).toBeDefined();
      expect(stored.timestamp).toBeDefined();
      expect(stored.role).toBe('user');
      expect(stored.content).toBe('Hello');
      expect(history.size).toBe(1);
    });

    it('should preserve all Message fields', () => {
      const msg: Message = {
        role: 'tool',
        content: 'Result',
        name: 'readFile',
        toolCallId: 'call_123',
      };
      const stored = history.add(msg);

      expect(stored.name).toBe('readFile');
      expect(stored.toolCallId).toBe('call_123');
    });

    it('should generate unique IDs for each message', () => {
      const stored1 = history.add({ role: 'user', content: 'msg1' });
      const stored2 = history.add({ role: 'user', content: 'msg2' });

      expect(stored1.id).not.toBe(stored2.id);
    });

    it('should skip duplicate consecutive messages', () => {
      history.add({ role: 'user', content: 'Hello' });
      history.add({ role: 'user', content: 'Hello' });
      history.add({ role: 'user', content: 'Hello' });

      expect(history.size).toBe(1);
    });

    it('should allow duplicate if not consecutive', () => {
      history.add({ role: 'user', content: 'Hello' });
      history.add({ role: 'assistant', content: 'Hi' });
      history.add({ role: 'user', content: 'Hello' });

      expect(history.size).toBe(3);
    });

    it('should allow same content with different role', () => {
      history.add({ role: 'user', content: 'Hello' });
      history.add({ role: 'assistant', content: 'Hello' });

      expect(history.size).toBe(2);
    });

    it('should NOT deduplicate consecutive tool messages with same content', () => {
      // Tool messages may have same content but different name/toolCallId
      history.add({ role: 'tool', content: 'success', name: 'tool1', toolCallId: 'call_1' });
      history.add({ role: 'tool', content: 'success', name: 'tool2', toolCallId: 'call_2' });

      expect(history.size).toBe(2);
    });

    it('should NOT deduplicate consecutive system messages', () => {
      history.add({ role: 'system', content: 'You are helpful' });
      history.add({ role: 'system', content: 'You are helpful' });

      expect(history.size).toBe(2);
    });

    it('should enforce history limit with FIFO trimming', () => {
      const h = new MessageHistory({ historyLimit: 3 });

      h.add({ role: 'user', content: 'msg1' });
      h.add({ role: 'assistant', content: 'msg2' });
      h.add({ role: 'user', content: 'msg3' });
      h.add({ role: 'assistant', content: 'msg4' });
      h.add({ role: 'user', content: 'msg5' });

      expect(h.size).toBe(3);
      const all = h.getAll();
      expect(all[0].content).toBe('msg3');
      expect(all[2].content).toBe('msg5');
    });
  });

  describe('addExchange', () => {
    it('should add user and assistant messages as pair', () => {
      const [user, assistant] = history.addExchange(
        'What is TypeScript?',
        'TypeScript is a typed superset of JavaScript.'
      );

      expect(user.role).toBe('user');
      expect(user.content).toBe('What is TypeScript?');
      expect(assistant.role).toBe('assistant');
      expect(assistant.content).toBe('TypeScript is a typed superset of JavaScript.');
      expect(history.size).toBe(2);
    });

    it('should assign matching turn indices', () => {
      const [user1, assistant1] = history.addExchange('Q1', 'A1');
      const [user2, assistant2] = history.addExchange('Q2', 'A2');

      expect(user1.turnIndex).toBe(1);
      expect(assistant1.turnIndex).toBe(1);
      expect(user2.turnIndex).toBe(2);
      expect(assistant2.turnIndex).toBe(2);
    });

    it('should generate unique IDs for both messages', () => {
      const [user, assistant] = history.addExchange('Q', 'A');

      expect(user.id).toBeDefined();
      expect(assistant.id).toBeDefined();
      expect(user.id).not.toBe(assistant.id);
    });

    it('should skip duplicate exchange', () => {
      const [user1, assistant1] = history.addExchange('Q1', 'A1');
      const [user2, assistant2] = history.addExchange('Q1', 'A1');

      // Should only have one exchange
      expect(history.size).toBe(2);

      // Duplicate should return the same messages, not create new ones
      expect(user2.id).toBe(user1.id);
      expect(assistant2.id).toBe(assistant1.id);

      // Verify turnCounter was NOT incremented for the duplicate
      // Add a third unique exchange - it should get turnIndex 2, not 3
      const [user3, assistant3] = history.addExchange('Q2', 'A2');
      expect(user3.turnIndex).toBe(2);
      expect(assistant3.turnIndex).toBe(2);

      // Verify the duplicate didn't increment the counter
      // First exchange has turnIndex 1, duplicate didn't increment, third has turnIndex 2
      expect(user1.turnIndex).toBe(1);
      expect(assistant1.turnIndex).toBe(1);
    });
  });

  describe('getRecent', () => {
    beforeEach(() => {
      history.add({ role: 'user', content: 'msg1' });
      history.add({ role: 'assistant', content: 'msg2' });
      history.add({ role: 'user', content: 'msg3' });
      history.add({ role: 'assistant', content: 'msg4' });
      history.add({ role: 'user', content: 'msg5' });
    });

    it('should return N most recent messages', () => {
      const recent = history.getRecent(3);

      expect(recent.length).toBe(3);
      expect(recent[0].content).toBe('msg3');
      expect(recent[1].content).toBe('msg4');
      expect(recent[2].content).toBe('msg5');
    });

    it('should return all if limit > size', () => {
      const recent = history.getRecent(100);

      expect(recent.length).toBe(5);
    });

    it('should return all if no limit specified', () => {
      const recent = history.getRecent();

      expect(recent.length).toBe(5);
    });

    it('should return empty array if empty history', () => {
      const emptyHistory = new MessageHistory();
      const recent = emptyHistory.getRecent(5);

      expect(recent).toEqual([]);
    });

    it('should return copies without internal metadata', () => {
      const recent = history.getRecent(1);

      expect(recent[0]).not.toHaveProperty('id');
      expect(recent[0]).not.toHaveProperty('timestamp');
    });

    it('should return empty array for limit 0', () => {
      const recent = history.getRecent(0);

      expect(recent).toEqual([]);
    });

    it('should return empty array for negative limit', () => {
      const recent = history.getRecent(-1);

      expect(recent).toEqual([]);
    });

    it('should return empty array for NaN limit', () => {
      const recent = history.getRecent(NaN);

      expect(recent).toEqual([]);
    });
  });

  describe('getAll', () => {
    it('should return all messages', () => {
      history.add({ role: 'user', content: 'msg1' });
      history.add({ role: 'assistant', content: 'msg2' });

      const all = history.getAll();

      expect(all.length).toBe(2);
      expect(all[0].content).toBe('msg1');
      expect(all[1].content).toBe('msg2');
    });

    it('should strip internal metadata', () => {
      history.add({ role: 'user', content: 'test' });
      const all = history.getAll();

      expect(all[0]).not.toHaveProperty('id');
      expect(all[0]).not.toHaveProperty('timestamp');
      expect(all[0]).not.toHaveProperty('turnIndex');
    });

    it('should return copy (prevent mutation)', () => {
      history.add({ role: 'user', content: 'original' });
      const all = history.getAll();
      all[0].content = 'modified';

      expect(history.getAll()[0].content).toBe('original');
    });
  });

  describe('getAllStored', () => {
    it('should return all messages with metadata', () => {
      history.addExchange('Q', 'A');
      const allStored = history.getAllStored();

      expect(allStored.length).toBe(2);
      expect(allStored[0].id).toBeDefined();
      expect(allStored[0].timestamp).toBeDefined();
      expect(allStored[0].turnIndex).toBeDefined();
    });

    it('should return copies (prevent mutation)', () => {
      history.add({ role: 'user', content: 'original' });
      const allStored = history.getAllStored();
      allStored[0].content = 'modified';

      expect(history.getAllStored()[0].content).toBe('original');
    });
  });

  describe('getRelevant', () => {
    beforeEach(() => {
      history.add({ role: 'user', content: 'Tell me about TypeScript programming' });
      history.add({
        role: 'assistant',
        content: 'TypeScript is a typed language built on JavaScript',
      });
      history.add({ role: 'user', content: 'What about Python coding?' });
      history.add({ role: 'assistant', content: 'Python is a dynamic scripting language' });
      history.add({ role: 'user', content: 'Can you explain React hooks?' });
      history.add({ role: 'assistant', content: 'React hooks are functions for state management' });
    });

    it('should find messages with matching keywords', () => {
      const relevant = history.getRelevant('TypeScript language');

      expect(relevant.length).toBeGreaterThan(0);
      const contents = relevant.map((m) => m.content);
      expect(contents.some((c) => c.includes('TypeScript'))).toBe(true);
    });

    it('should be case-insensitive', () => {
      const relevant = history.getRelevant('TYPESCRIPT');

      expect(relevant.length).toBeGreaterThan(0);
      const contents = relevant.map((m) => m.content);
      expect(contents.some((c) => c.includes('TypeScript'))).toBe(true);
    });

    it('should respect limit parameter', () => {
      const relevant = history.getRelevant('programming', 2);

      expect(relevant.length).toBeLessThanOrEqual(2);
    });

    it('should fall back to getRecent when no matches', () => {
      const relevant = history.getRelevant('zzzznonexistent', 3);

      // Should get recent messages instead
      expect(relevant.length).toBe(3);
    });

    it('should fall back to getRecent for empty query', () => {
      const relevant = history.getRelevant('', 3);

      expect(relevant.length).toBe(3);
    });

    it('should fall back to getRecent for whitespace-only query', () => {
      const relevant = history.getRelevant('   ', 3);

      expect(relevant.length).toBe(3);
    });

    it('should return empty for empty history', () => {
      const emptyHistory = new MessageHistory();
      const relevant = emptyHistory.getRelevant('test', 5);

      expect(relevant).toEqual([]);
    });

    it('should score by keyword match count', () => {
      // "TypeScript language" should match the TypeScript messages better
      const relevant = history.getRelevant('TypeScript language typed');

      // First result should be the one with most keyword matches
      expect(relevant[0].content).toContain('TypeScript');
    });

    it('should return empty array for limit 0', () => {
      const relevant = history.getRelevant('TypeScript', 0);

      expect(relevant).toEqual([]);
    });

    it('should return empty array for negative limit', () => {
      const relevant = history.getRelevant('TypeScript', -1);

      expect(relevant).toEqual([]);
    });

    it('should return empty array for NaN limit', () => {
      const relevant = history.getRelevant('TypeScript', NaN);

      expect(relevant).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should remove all messages', () => {
      history.add({ role: 'user', content: 'msg1' });
      history.add({ role: 'assistant', content: 'msg2' });

      history.clear();

      expect(history.size).toBe(0);
      expect(history.isEmpty).toBe(true);
    });

    it('should reset turn counter', () => {
      history.addExchange('Q1', 'A1');
      history.addExchange('Q2', 'A2');
      history.clear();
      const [user] = history.addExchange('Q3', 'A3');

      // Turn should start from 1 again
      expect(user.turnIndex).toBe(1);
    });
  });

  describe('size', () => {
    it('should return 0 for empty history', () => {
      expect(history.size).toBe(0);
    });

    it('should return correct count', () => {
      history.add({ role: 'user', content: 'msg1' });
      expect(history.size).toBe(1);

      history.add({ role: 'assistant', content: 'msg2' });
      expect(history.size).toBe(2);
    });
  });

  describe('isEmpty', () => {
    it('should return true for empty history', () => {
      expect(history.isEmpty).toBe(true);
    });

    it('should return false when messages exist', () => {
      history.add({ role: 'user', content: 'test' });
      expect(history.isEmpty).toBe(false);
    });
  });

  describe('getLastUserMessage', () => {
    it('should return undefined for empty history', () => {
      expect(history.getLastUserMessage()).toBeUndefined();
    });

    it('should return last user message', () => {
      history.add({ role: 'user', content: 'first user' });
      history.add({ role: 'assistant', content: 'response' });
      history.add({ role: 'user', content: 'second user' });
      history.add({ role: 'assistant', content: 'another response' });

      const lastUser = history.getLastUserMessage();
      expect(lastUser?.content).toBe('second user');
    });

    it('should return undefined if only assistant messages', () => {
      history.add({ role: 'assistant', content: 'response1' });
      history.add({ role: 'assistant', content: 'response2' });

      expect(history.getLastUserMessage()).toBeUndefined();
    });

    it('should return Message without internal metadata', () => {
      history.add({ role: 'user', content: 'test' });

      const lastUser = history.getLastUserMessage();
      expect(lastUser).not.toHaveProperty('id');
      expect(lastUser).not.toHaveProperty('timestamp');
    });
  });

  describe('edge cases', () => {
    it('should handle system messages', () => {
      history.add({ role: 'system', content: 'You are a helpful assistant' });

      expect(history.size).toBe(1);
      expect(history.getAll()[0].role).toBe('system');
    });

    it('should handle tool messages with metadata', () => {
      history.add({
        role: 'tool',
        content: '{"result": "success"}',
        name: 'readFile',
        toolCallId: 'call_abc123',
      });

      const all = history.getAll();
      expect(all[0].role).toBe('tool');
      expect(all[0].name).toBe('readFile');
      expect(all[0].toolCallId).toBe('call_abc123');
    });

    it('should handle unicode content', () => {
      history.add({ role: 'user', content: 'Hello! \u{1F44B} How are you?' });
      history.add({ role: 'assistant', content: '\u4F60\u597D\uFF01\u6211\u5F88\u597D\u3002' });

      const all = history.getAll();
      expect(all[0].content).toContain('\u{1F44B}');
      expect(all[1].content).toBe('\u4F60\u597D\uFF01\u6211\u5F88\u597D\u3002');
    });

    it('should handle very long messages', () => {
      const longContent = 'x'.repeat(100000);
      history.add({ role: 'user', content: longContent });

      expect(history.getAll()[0].content.length).toBe(100000);
    });

    it('should handle empty content', () => {
      history.add({ role: 'user', content: '' });

      expect(history.size).toBe(1);
      expect(history.getAll()[0].content).toBe('');
    });

    it('should handle history at exactly limit boundary', () => {
      const h = new MessageHistory({ historyLimit: 3 });

      h.add({ role: 'user', content: 'msg1' });
      h.add({ role: 'assistant', content: 'msg2' });
      h.add({ role: 'user', content: 'msg3' });

      expect(h.size).toBe(3);

      // Adding one more should trim to 3
      h.add({ role: 'assistant', content: 'msg4' });
      expect(h.size).toBe(3);
      expect(h.getAll()[0].content).toBe('msg2');
    });

    it('should generate valid UUID format for IDs', () => {
      const stored = history.add({ role: 'user', content: 'test' });

      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const uuidRegex = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
      expect(stored.id).toMatch(uuidRegex);
    });

    it('should generate valid ISO timestamp', () => {
      const stored = history.add({ role: 'user', content: 'test' });

      // Should parse as valid date
      const date = new Date(stored.timestamp);
      expect(date.toString()).not.toBe('Invalid Date');
    });
  });

  describe('history limit enforcement', () => {
    it('should handle limit of 1', () => {
      const h = new MessageHistory({ historyLimit: 1 });

      h.add({ role: 'user', content: 'msg1' });
      h.add({ role: 'assistant', content: 'msg2' });
      h.add({ role: 'user', content: 'msg3' });

      expect(h.size).toBe(1);
      expect(h.getAll()[0].content).toBe('msg3');
    });

    it('should handle limit of 0 (edge case)', () => {
      const h = new MessageHistory({ historyLimit: 0 });

      h.add({ role: 'user', content: 'msg1' });

      // With limit 0, no messages should be kept
      expect(h.size).toBe(0);
    });

    it('should handle very large limit', () => {
      const h = new MessageHistory({ historyLimit: 1000000 });

      for (let i = 0; i < 100; i++) {
        h.add({ role: 'user', content: `msg${String(i)}` });
      }

      expect(h.size).toBe(100);
    });
  });
});
