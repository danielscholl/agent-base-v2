import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../App.js';

describe('App', () => {
  it('renders the framework title', () => {
    const { lastFrame } = render(<App />);
    expect(lastFrame()).toContain('Agent Framework v2');
  });

  it('renders hello world message', () => {
    const { lastFrame } = render(<App />);
    expect(lastFrame()).toContain('Hello, World!');
  });

  it('renders the tech stack info', () => {
    const { lastFrame } = render(<App />);
    expect(lastFrame()).toContain('TypeScript + Bun + React + Ink');
  });
});
