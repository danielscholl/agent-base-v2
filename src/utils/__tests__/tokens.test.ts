/**
 * Tests for Token counting utilities.
 */

import { TokenUsageTracker, TokenEstimator, type SessionTokenUsage } from '../tokens.js';
import type { TokenUsage } from '../../model/types.js';
import type { Message } from '../../agent/types.js';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

/**
 * Create a TokenUsage object for testing.
 */
function createTokenUsage(prompt: number, completion: number): TokenUsage {
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: prompt + completion,
  };
}

/**
 * Create a Message object for testing.
 */
function createMessage(role: Message['role'], content: string): Message {
  return { role, content };
}

// -----------------------------------------------------------------------------
// TokenUsageTracker Tests
// -----------------------------------------------------------------------------

describe('TokenUsageTracker', () => {
  describe('constructor', () => {
    it('should initialize with zero usage', () => {
      const tracker = new TokenUsageTracker();
      const usage = tracker.getUsage();

      expect(usage.totalPromptTokens).toBe(0);
      expect(usage.totalCompletionTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
      expect(usage.queryCount).toBe(0);
    });

    it('should accept onUpdate callback', () => {
      const updates: SessionTokenUsage[] = [];
      const tracker = new TokenUsageTracker({
        onUpdate: (usage) => updates.push(usage),
      });

      tracker.addUsage(createTokenUsage(100, 50));

      expect(updates.length).toBe(1);
      expect(updates[0].totalTokens).toBe(150);
    });

    it('should accept onDebug callback', () => {
      const debugMsgs: string[] = [];
      const tracker = new TokenUsageTracker({
        onDebug: (msg) => debugMsgs.push(msg),
      });

      // Debug callback should be called on initialization
      expect(debugMsgs.length).toBeGreaterThan(0);
      expect(debugMsgs[0]).toContain('initialized');

      // Use tracker to avoid unused variable warning
      expect(tracker.getUsage().queryCount).toBe(0);
    });
  });

  describe('addUsage', () => {
    it('should accumulate token usage across multiple calls', () => {
      const tracker = new TokenUsageTracker();

      tracker.addUsage(createTokenUsage(100, 50));
      tracker.addUsage(createTokenUsage(200, 100));
      tracker.addUsage(createTokenUsage(150, 75));

      const usage = tracker.getUsage();
      expect(usage.totalPromptTokens).toBe(450);
      expect(usage.totalCompletionTokens).toBe(225);
      expect(usage.totalTokens).toBe(675);
      expect(usage.queryCount).toBe(3);
    });

    it('should increment query count with each call', () => {
      const tracker = new TokenUsageTracker();

      tracker.addUsage(createTokenUsage(10, 5));
      expect(tracker.getUsage().queryCount).toBe(1);

      tracker.addUsage(createTokenUsage(10, 5));
      expect(tracker.getUsage().queryCount).toBe(2);

      tracker.addUsage(createTokenUsage(10, 5));
      expect(tracker.getUsage().queryCount).toBe(3);
    });

    it('should invoke onUpdate callback with accumulated usage', () => {
      const updates: SessionTokenUsage[] = [];
      const tracker = new TokenUsageTracker({
        onUpdate: (usage) => updates.push({ ...usage }),
      });

      tracker.addUsage(createTokenUsage(100, 50));
      tracker.addUsage(createTokenUsage(100, 50));

      expect(updates.length).toBe(2);
      expect(updates[0].totalTokens).toBe(150);
      expect(updates[0].queryCount).toBe(1);
      expect(updates[1].totalTokens).toBe(300);
      expect(updates[1].queryCount).toBe(2);
    });

    it('should handle zero token usage', () => {
      const tracker = new TokenUsageTracker();

      tracker.addUsage(createTokenUsage(0, 0));

      const usage = tracker.getUsage();
      expect(usage.totalPromptTokens).toBe(0);
      expect(usage.totalCompletionTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
      expect(usage.queryCount).toBe(1);
    });

    it('should handle large token numbers', () => {
      const tracker = new TokenUsageTracker();
      const largeNumber = 1000000;

      tracker.addUsage(createTokenUsage(largeNumber, largeNumber));
      tracker.addUsage(createTokenUsage(largeNumber, largeNumber));

      const usage = tracker.getUsage();
      expect(usage.totalPromptTokens).toBe(2 * largeNumber);
      expect(usage.totalCompletionTokens).toBe(2 * largeNumber);
      expect(usage.totalTokens).toBe(4 * largeNumber);
    });

    it('should call debug callback on each addition', () => {
      const debugMsgs: Array<{ msg: string; data?: unknown }> = [];
      const tracker = new TokenUsageTracker({
        onDebug: (msg, data) => debugMsgs.push({ msg, data }),
      });

      tracker.addUsage(createTokenUsage(100, 50));

      const addedMsg = debugMsgs.find((m) => m.msg.includes('added'));
      expect(addedMsg).toBeDefined();
    });
  });

  describe('getUsage', () => {
    it('should return a copy of usage', () => {
      const tracker = new TokenUsageTracker();
      tracker.addUsage(createTokenUsage(100, 50));

      const usage1 = tracker.getUsage();
      usage1.totalTokens = 9999;

      const usage2 = tracker.getUsage();
      expect(usage2.totalTokens).toBe(150);
    });

    it('should return current accumulated values', () => {
      const tracker = new TokenUsageTracker();

      const usageBefore = tracker.getUsage();
      expect(usageBefore.totalTokens).toBe(0);

      tracker.addUsage(createTokenUsage(100, 50));

      const usageAfter = tracker.getUsage();
      expect(usageAfter.totalTokens).toBe(150);
    });
  });

  describe('reset', () => {
    it('should reset all counters to zero', () => {
      const tracker = new TokenUsageTracker();

      tracker.addUsage(createTokenUsage(100, 50));
      tracker.addUsage(createTokenUsage(200, 100));
      tracker.reset();

      const usage = tracker.getUsage();
      expect(usage.totalPromptTokens).toBe(0);
      expect(usage.totalCompletionTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
      expect(usage.queryCount).toBe(0);
    });

    it('should invoke onUpdate callback after reset', () => {
      const updates: SessionTokenUsage[] = [];
      const tracker = new TokenUsageTracker({
        onUpdate: (usage) => updates.push({ ...usage }),
      });

      tracker.addUsage(createTokenUsage(100, 50));
      tracker.reset();

      expect(updates.length).toBe(2);
      expect(updates[1].totalTokens).toBe(0);
      expect(updates[1].queryCount).toBe(0);
    });

    it('should allow accumulation after reset', () => {
      const tracker = new TokenUsageTracker();

      tracker.addUsage(createTokenUsage(100, 50));
      tracker.reset();
      tracker.addUsage(createTokenUsage(200, 100));

      const usage = tracker.getUsage();
      expect(usage.totalPromptTokens).toBe(200);
      expect(usage.totalCompletionTokens).toBe(100);
      expect(usage.queryCount).toBe(1);
    });

    it('should call debug callback on reset', () => {
      const debugMsgs: string[] = [];
      const tracker = new TokenUsageTracker({
        onDebug: (msg) => debugMsgs.push(msg),
      });

      tracker.reset();

      expect(debugMsgs.some((m) => m.includes('reset'))).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple resets', () => {
      const tracker = new TokenUsageTracker();

      tracker.reset();
      tracker.reset();
      tracker.reset();

      const usage = tracker.getUsage();
      expect(usage.queryCount).toBe(0);
    });

    it('should work without callbacks', () => {
      const tracker = new TokenUsageTracker({});

      tracker.addUsage(createTokenUsage(100, 50));
      tracker.reset();

      // Should not throw
      expect(tracker.getUsage().queryCount).toBe(0);
    });

    it('should handle rapid sequential additions', () => {
      const tracker = new TokenUsageTracker();

      for (let i = 0; i < 100; i++) {
        tracker.addUsage(createTokenUsage(10, 5));
      }

      const usage = tracker.getUsage();
      expect(usage.totalPromptTokens).toBe(1000);
      expect(usage.totalCompletionTokens).toBe(500);
      expect(usage.queryCount).toBe(100);
    });
  });
});

// -----------------------------------------------------------------------------
// TokenEstimator Tests
// -----------------------------------------------------------------------------

describe('TokenEstimator', () => {
  describe('constructor', () => {
    it('should create with default model', () => {
      const estimator = new TokenEstimator();

      // Should not throw
      const tokens = estimator.estimateTokens('Hello, world!');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should accept custom model', () => {
      const estimator = new TokenEstimator({ model: 'gpt-4' });

      const tokens = estimator.estimateTokens('Hello, world!');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should accept onDebug callback', () => {
      const debugMsgs: string[] = [];
      const estimator = new TokenEstimator({
        onDebug: (msg) => debugMsgs.push(msg),
      });

      expect(debugMsgs.length).toBeGreaterThan(0);
      expect(debugMsgs[0]).toContain('initialized');

      // Use estimator to avoid unused variable warning
      expect(estimator.estimateTokens('')).toBe(0);
    });
  });

  describe('estimateTokens', () => {
    it('should return 0 for empty string', () => {
      const estimator = new TokenEstimator();

      const tokens = estimator.estimateTokens('');

      expect(tokens).toBe(0);
    });

    it('should estimate tokens for simple text', () => {
      const estimator = new TokenEstimator();

      const tokens = estimator.estimateTokens('Hello, world!');

      // "Hello, world!" is typically 4 tokens with tiktoken
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(10);
    });

    it('should estimate tokens for longer text', () => {
      const estimator = new TokenEstimator();

      const shortText = 'Hello';
      const longText = 'Hello '.repeat(100);

      const shortTokens = estimator.estimateTokens(shortText);
      const longTokens = estimator.estimateTokens(longText);

      expect(longTokens).toBeGreaterThan(shortTokens);
    });

    it('should handle code snippets', () => {
      const estimator = new TokenEstimator();

      const code = `
function greet(name: string): void {
  console.log(\`Hello, \${name}!\`);
}
      `.trim();

      const tokens = estimator.estimateTokens(code);

      expect(tokens).toBeGreaterThan(10);
    });

    it('should handle unicode text', () => {
      const estimator = new TokenEstimator();

      const tokens = estimator.estimateTokens('\u4F60\u597D\u4E16\u754C\u{1F44B}');

      expect(tokens).toBeGreaterThan(0);
    });

    it('should call debug callback', () => {
      const debugMsgs: Array<{ msg: string; data?: unknown }> = [];
      const estimator = new TokenEstimator({
        onDebug: (msg, data) => debugMsgs.push({ msg, data }),
      });

      estimator.estimateTokens('Test text');

      expect(debugMsgs.some((m) => m.msg.includes('estimated'))).toBe(true);
    });

    it('should be reasonably accurate for known text', () => {
      const estimator = new TokenEstimator({ model: 'gpt-4o' });

      // "The quick brown fox jumps over the lazy dog" is consistently ~10 tokens
      const tokens = estimator.estimateTokens('The quick brown fox jumps over the lazy dog');

      expect(tokens).toBeGreaterThanOrEqual(8);
      expect(tokens).toBeLessThanOrEqual(12);
    });
  });

  describe('estimateMessages', () => {
    it('should return 0 for empty messages array', () => {
      const estimator = new TokenEstimator();

      const tokens = estimator.estimateMessages([]);

      expect(tokens).toBe(0);
    });

    it('should include message overhead', () => {
      const estimator = new TokenEstimator();

      const contentOnly = estimator.estimateTokens('Hello');
      const withMessage = estimator.estimateMessages([createMessage('user', 'Hello')]);

      // With overhead, message tokens should be higher
      expect(withMessage).toBeGreaterThan(contentOnly);
    });

    it('should handle multiple messages', () => {
      const estimator = new TokenEstimator();

      const messages = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi there!'),
        createMessage('user', 'How are you?'),
      ];

      const tokens = estimator.estimateMessages(messages);

      expect(tokens).toBeGreaterThan(0);
    });

    it('should count all message roles', () => {
      const estimator = new TokenEstimator();

      const systemOnly = estimator.estimateMessages([createMessage('system', 'You are helpful')]);

      const userOnly = estimator.estimateMessages([createMessage('user', 'You are helpful')]);

      const assistantOnly = estimator.estimateMessages([
        createMessage('assistant', 'You are helpful'),
      ]);

      // All should have similar counts (content is same, roles are similar length)
      expect(Math.abs(systemOnly - userOnly)).toBeLessThan(5);
      expect(Math.abs(userOnly - assistantOnly)).toBeLessThan(5);
    });

    it('should scale with message count', () => {
      const estimator = new TokenEstimator();

      const oneMessage = estimator.estimateMessages([createMessage('user', 'Test')]);

      const threeMessages = estimator.estimateMessages([
        createMessage('user', 'Test'),
        createMessage('assistant', 'Test'),
        createMessage('user', 'Test'),
      ]);

      expect(threeMessages).toBeGreaterThan(oneMessage);
    });

    it('should call debug callback', () => {
      const debugMsgs: Array<{ msg: string; data?: unknown }> = [];
      const estimator = new TokenEstimator({
        onDebug: (msg, data) => debugMsgs.push({ msg, data }),
      });

      estimator.estimateMessages([createMessage('user', 'Test')]);

      expect(debugMsgs.some((m) => m.msg.includes('Message tokens estimated'))).toBe(true);
    });
  });

  describe('model-specific encoding', () => {
    it('should use model-specific encoding for gpt-4o', () => {
      const debugMsgs: string[] = [];
      const estimator = new TokenEstimator({
        model: 'gpt-4o',
        onDebug: (msg) => debugMsgs.push(msg),
      });

      estimator.estimateTokens('test');

      // Should either use model-specific or o200k_base encoding
      const usedEncoding = debugMsgs.some(
        (m) => m.includes('model-specific') || m.includes('o200k_base')
      );
      expect(usedEncoding).toBe(true);
    });

    it('should fall back gracefully for unknown models', () => {
      const estimator = new TokenEstimator({
        model: 'unknown-model-xyz',
      });

      // Should not throw and should return valid token count
      const tokens = estimator.estimateTokens('Hello');

      expect(tokens).toBeGreaterThan(0);
    });

    it('should handle claude model prefix', () => {
      const estimator = new TokenEstimator({ model: 'claude-3-opus' });

      // Should not throw
      const tokens = estimator.estimateTokens('Hello');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should handle gemini model prefix', () => {
      const estimator = new TokenEstimator({ model: 'gemini-pro' });

      // Should not throw
      const tokens = estimator.estimateTokens('Hello');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should cache encoder for reuse', () => {
      const debugMsgs: string[] = [];
      const estimator = new TokenEstimator({
        onDebug: (msg) => debugMsgs.push(msg),
      });

      // First call initializes encoder
      estimator.estimateTokens('test1');
      const initCount = debugMsgs.filter((m) => m.includes('encoding')).length;

      // Second call should reuse encoder
      estimator.estimateTokens('test2');
      const afterCount = debugMsgs.filter((m) => m.includes('encoding')).length;

      // Should not create new encoder on second call
      expect(afterCount).toBe(initCount);
    });
  });

  describe('edge cases', () => {
    it('should handle whitespace-only text', () => {
      const estimator = new TokenEstimator();

      const tokens = estimator.estimateTokens('   \t\n   ');

      // Whitespace still counts as tokens
      expect(tokens).toBeGreaterThan(0);
    });

    it('should handle very long text', () => {
      const estimator = new TokenEstimator();

      const longText = 'word '.repeat(10000);
      const tokens = estimator.estimateTokens(longText);

      // Should handle without throwing
      expect(tokens).toBeGreaterThan(1000);
    });

    it('should handle special characters', () => {
      const estimator = new TokenEstimator();

      const tokens = estimator.estimateTokens('!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~');

      expect(tokens).toBeGreaterThan(0);
    });

    it('should handle newlines in text', () => {
      const estimator = new TokenEstimator();

      const tokens = estimator.estimateTokens('line1\nline2\nline3');

      expect(tokens).toBeGreaterThan(0);
    });

    it('should handle empty message content', () => {
      const estimator = new TokenEstimator();

      const tokens = estimator.estimateMessages([createMessage('user', '')]);

      // Should still have overhead tokens
      expect(tokens).toBeGreaterThan(0);
    });
  });
});
