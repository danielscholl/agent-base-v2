/**
 * Tests for AnswerBox component.
 */

import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { render } from 'ink-testing-library';
import { AnswerBox } from '../AnswerBox.js';

describe('AnswerBox', () => {
  it('renders nothing when empty and not streaming', () => {
    const { lastFrame } = render(<AnswerBox content="" />);
    expect(lastFrame()).toBe('');
  });

  it('renders content', () => {
    const { lastFrame } = render(<AnswerBox content="Hello, world!" />);
    expect(lastFrame()).toContain('Hello, world!');
  });

  it('shows typing indicator when streaming with content', () => {
    const { lastFrame } = render(<AnswerBox content="Hello" isStreaming={true} />);

    expect(lastFrame()).toContain('Hello');
    expect(lastFrame()).toContain('▌');
  });

  it('shows generating message when streaming starts', () => {
    const { lastFrame } = render(<AnswerBox content="" isStreaming={true} />);

    expect(lastFrame()).toContain('Generating response...');
  });

  it('hides typing indicator when not streaming', () => {
    const { lastFrame } = render(<AnswerBox content="Complete response" isStreaming={false} />);

    expect(lastFrame()).toContain('Complete response');
    expect(lastFrame()).not.toContain('▌');
  });

  it('renders with optional label', () => {
    const { lastFrame } = render(<AnswerBox content="Response" label="Assistant:" />);

    expect(lastFrame()).toContain('Assistant:');
    expect(lastFrame()).toContain('Response');
  });

  it('renders multiline content', () => {
    const content = 'Line 1\nLine 2\nLine 3';
    const { lastFrame } = render(<AnswerBox content={content} />);

    expect(lastFrame()).toContain('Line 1');
    expect(lastFrame()).toContain('Line 2');
    expect(lastFrame()).toContain('Line 3');
  });

  it('does not show generating message when content exists', () => {
    const { lastFrame } = render(<AnswerBox content="Some content" isStreaming={true} />);

    expect(lastFrame()).not.toContain('Generating response...');
    expect(lastFrame()).toContain('Some content');
  });

  it('renders without label when not provided', () => {
    const { lastFrame } = render(<AnswerBox content="Response" />);

    expect(lastFrame()).toContain('Response');
    // Should not have extra elements
    const frame = lastFrame();
    expect(frame).toBeDefined();
  });

  it('handles default isStreaming value', () => {
    const { lastFrame } = render(<AnswerBox content="Test content" />);

    // Default isStreaming is false, so no typing indicator
    expect(lastFrame()).toContain('Test content');
    expect(lastFrame()).not.toContain('▌');
  });
});
