/**
 * Tests for TokenUsageDisplay component.
 */

import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { render } from 'ink-testing-library';
import { TokenUsageDisplay } from '../TokenUsageDisplay.js';
import type { SessionTokenUsage } from '../../utils/index.js';

/**
 * Create test usage data.
 */
function createUsage(
  promptTokens: number,
  completionTokens: number,
  queryCount: number
): SessionTokenUsage {
  return {
    promptTokens,
    completionTokens,
    tokens: promptTokens + completionTokens,
    queryCount,
  };
}

describe('TokenUsageDisplay', () => {
  describe('compact mode (default)', () => {
    it('renders nothing when queryCount is 0', () => {
      const usage = createUsage(0, 0, 0);

      const { lastFrame } = render(<TokenUsageDisplay usage={usage} />);

      expect(lastFrame()).toBe('');
    });

    it('renders total tokens and query count', () => {
      const usage = createUsage(100, 50, 1);

      const { lastFrame } = render(<TokenUsageDisplay usage={usage} />);

      expect(lastFrame()).toContain('Tokens:');
      expect(lastFrame()).toContain('150');
      expect(lastFrame()).toContain('1 query');
    });

    it('formats large numbers with separators', () => {
      const usage = createUsage(10000, 5000, 5);

      const { lastFrame } = render(<TokenUsageDisplay usage={usage} />);

      expect(lastFrame()).toContain('15,000');
    });

    it('shows correct query count plural', () => {
      const singleQuery = createUsage(100, 50, 1);
      const multiQuery = createUsage(200, 100, 3);

      const { lastFrame: single } = render(<TokenUsageDisplay usage={singleQuery} />);
      const { lastFrame: multi } = render(<TokenUsageDisplay usage={multiQuery} />);

      expect(single()).toContain('1 query');
      expect(multi()).toContain('3 queries');
    });
  });

  describe('detailed mode', () => {
    it('shows breakdown when showDetails is true', () => {
      const usage = createUsage(1000, 500, 5);

      const { lastFrame } = render(<TokenUsageDisplay usage={usage} showDetails={true} />);

      expect(lastFrame()).toContain('1,500');
      expect(lastFrame()).toContain('total');
      expect(lastFrame()).toContain('Prompt:');
      expect(lastFrame()).toContain('1,000');
      expect(lastFrame()).toContain('Completion:');
      expect(lastFrame()).toContain('500');
      expect(lastFrame()).toContain('Queries:');
      expect(lastFrame()).toContain('5');
    });

    it('shows average tokens per query', () => {
      const usage = createUsage(800, 200, 4);

      const { lastFrame } = render(<TokenUsageDisplay usage={usage} showDetails={true} />);

      // 1000 total / 4 queries = 250 avg
      expect(lastFrame()).toContain('avg');
      expect(lastFrame()).toContain('250');
      expect(lastFrame()).toContain('/query');
    });

    it('rounds average to nearest integer', () => {
      const usage = createUsage(100, 50, 3);

      const { lastFrame } = render(<TokenUsageDisplay usage={usage} showDetails={true} />);

      // 150 / 3 = 50 (exact)
      expect(lastFrame()).toContain('50');
    });

    it('renders nothing when queryCount is 0 even in detailed mode', () => {
      const usage = createUsage(0, 0, 0);

      const { lastFrame } = render(<TokenUsageDisplay usage={usage} showDetails={true} />);

      expect(lastFrame()).toBe('');
    });
  });

  describe('edge cases', () => {
    it('handles very large token counts', () => {
      const usage = createUsage(1000000, 500000, 100);

      const { lastFrame } = render(<TokenUsageDisplay usage={usage} />);

      expect(lastFrame()).toContain('1,500,000');
    });

    it('handles usage with zero completion tokens', () => {
      const usage = createUsage(100, 0, 1);

      const { lastFrame } = render(<TokenUsageDisplay usage={usage} />);

      expect(lastFrame()).toContain('100');
      expect(lastFrame()).toContain('1 query');
    });

    it('handles usage with zero prompt tokens', () => {
      const usage = createUsage(0, 50, 1);

      const { lastFrame } = render(<TokenUsageDisplay usage={usage} />);

      expect(lastFrame()).toContain('50');
    });

    it('correctly shows breakdown in detailed mode with zeros', () => {
      const usage = createUsage(100, 0, 1);

      const { lastFrame } = render(<TokenUsageDisplay usage={usage} showDetails={true} />);

      expect(lastFrame()).toContain('Prompt:');
      expect(lastFrame()).toContain('100');
      expect(lastFrame()).toContain('Completion:');
      expect(lastFrame()).toContain('0');
    });

    it('handles single query correctly in detailed mode', () => {
      const usage = createUsage(50, 25, 1);

      const { lastFrame } = render(<TokenUsageDisplay usage={usage} showDetails={true} />);

      expect(lastFrame()).toContain('Queries:');
      expect(lastFrame()).toContain('1');
      // Average should be shown for single query too
      expect(lastFrame()).toContain('avg');
      expect(lastFrame()).toContain('75');
    });
  });
});
