/**
 * Tests for SpanFooter component.
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { SpanFooter } from '../SpanFooter.js';
import type { ExecutionSpan } from '../ExecutionStatus.js';

describe('SpanFooter', () => {
  const createSpan = (overrides: Partial<ExecutionSpan> = {}): ExecutionSpan => ({
    number: 1,
    status: 'complete',
    duration: 2.5,
    messageCount: 3,
    isThinking: false,
    toolNodes: [],
    ...overrides,
  });

  describe('summary header', () => {
    it('renders span and tool count with duration', () => {
      const spans = [createSpan({ number: 1 }), createSpan({ number: 2 })];
      const { lastFrame } = render(
        <SpanFooter spans={spans} duration={5.2} toolCount={8} expandedSpans={new Set()} />
      );
      const frame = lastFrame();
      expect(frame).toContain('2 spans');
      expect(frame).toContain('8 tools');
      expect(frame).toContain('5.2s');
    });

    it('uses singular for 1 span', () => {
      const spans = [createSpan({ number: 1 })];
      const { lastFrame } = render(
        <SpanFooter spans={spans} duration={1.0} toolCount={3} expandedSpans={new Set()} />
      );
      expect(lastFrame()).toContain('1 span,');
    });

    it('uses singular for 1 tool', () => {
      const spans = [createSpan({ number: 1 })];
      const { lastFrame } = render(
        <SpanFooter spans={spans} duration={1.0} toolCount={1} expandedSpans={new Set()} />
      );
      expect(lastFrame()).toContain('1 tool');
    });

    it('shows checkmark for successful completion', () => {
      const spans = [createSpan({ status: 'complete' })];
      const { lastFrame } = render(
        <SpanFooter spans={spans} duration={1.0} toolCount={1} expandedSpans={new Set()} />
      );
      expect(lastFrame()).toContain('✓');
    });

    it('shows error symbol when spans have errors', () => {
      const spans = [
        createSpan({
          status: 'error',
          toolNodes: [{ id: '1', name: 'bash', status: 'error', error: 'Failed', span: 1 }],
        }),
      ];
      const { lastFrame } = render(
        <SpanFooter spans={spans} duration={1.0} toolCount={1} expandedSpans={new Set()} />
      );
      expect(lastFrame()).toContain('✗');
    });
  });

  describe('span chips', () => {
    it('renders span chips with dot separators', () => {
      const spans = [
        createSpan({ number: 1 }),
        createSpan({ number: 2 }),
        createSpan({ number: 3 }),
      ];
      const { lastFrame } = render(
        <SpanFooter spans={spans} duration={3.0} toolCount={5} expandedSpans={new Set()} />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('S1');
      expect(frame).toContain('S2');
      expect(frame).toContain('S3');
      expect(frame).toContain('•');
    });

    it('shows expansion indicator for expanded spans', () => {
      const spans = [createSpan({ number: 1 }), createSpan({ number: 2 })];
      const { lastFrame } = render(
        <SpanFooter spans={spans} duration={2.0} toolCount={3} expandedSpans={new Set([2])} />
      );
      expect(lastFrame()).toContain('▼S2');
    });
  });

  describe('expanded span details', () => {
    it('shows tool tree when span is expanded', () => {
      const spans = [
        createSpan({
          number: 1,
          toolNodes: [
            { id: '1', name: 'bash', status: 'complete', span: 1, primaryArg: 'npm test' },
          ],
        }),
      ];
      const { lastFrame } = render(
        <SpanFooter spans={spans} duration={2.0} toolCount={1} expandedSpans={new Set([1])} />
      );
      const frame = lastFrame();
      expect(frame).toContain('bash');
      expect(frame).toContain('npm test');
    });

    it('only expands spans in expandedSpans set', () => {
      const spans = [
        createSpan({
          number: 1,
          toolNodes: [
            { id: '1', name: 'glob', status: 'complete', span: 1, primaryArg: '**/*.ts' },
          ],
        }),
        createSpan({
          number: 2,
          toolNodes: [
            { id: '2', name: 'read', status: 'complete', span: 2, primaryArg: 'file.ts' },
          ],
        }),
      ];
      const { lastFrame } = render(
        <SpanFooter
          spans={spans}
          duration={3.0}
          toolCount={2}
          expandedSpans={new Set([1])} // Only span 1 expanded
        />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('glob');
      expect(frame).toContain('**/*.ts');
      expect(frame).not.toContain('read');
    });
  });

  describe('empty state', () => {
    it('returns null when no spans', () => {
      const { lastFrame } = render(
        <SpanFooter spans={[]} duration={0} toolCount={0} expandedSpans={new Set()} />
      );
      // Ink renders empty string for null components
      expect(lastFrame()).toBe('');
    });
  });
});
