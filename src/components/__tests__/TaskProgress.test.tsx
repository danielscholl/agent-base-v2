/**
 * Tests for TaskProgress component.
 */

import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { render } from 'ink-testing-library';
import { TaskProgress } from '../TaskProgress.js';
import type { ActiveTask, CompletedTask } from '../TaskProgress.js';

describe('TaskProgress', () => {
  it('renders nothing when no tasks', () => {
    const { lastFrame } = render(<TaskProgress />);
    expect(lastFrame()).toBe('');
  });

  it('renders active task with spinner', () => {
    const activeTasks: ActiveTask[] = [{ id: 'span-1', name: 'read_file', startTime: Date.now() }];

    const { lastFrame } = render(<TaskProgress activeTasks={activeTasks} />);

    expect(lastFrame()).toContain('read_file');
    // Spinner frame should be present (one of the braille characters)
    expect(lastFrame()).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
  });

  it('renders active task with arguments', () => {
    const activeTasks: ActiveTask[] = [
      {
        id: 'span-2',
        name: 'read_file',
        args: { path: '/test/file.txt' },
        startTime: Date.now(),
      },
    ];

    const { lastFrame } = render(<TaskProgress activeTasks={activeTasks} />);

    expect(lastFrame()).toContain('read_file');
    expect(lastFrame()).toContain('path: /test/file.txt');
  });

  it('truncates long argument values', () => {
    const activeTasks: ActiveTask[] = [
      {
        id: 'span-3',
        name: 'read_file',
        args: { path: '/very/long/path/to/some/file.txt' },
        startTime: Date.now(),
      },
    ];

    const { lastFrame } = render(<TaskProgress activeTasks={activeTasks} />);

    // formatArgs truncates values longer than 20 chars to 17 chars + '...'
    expect(lastFrame()).toContain('path: /very/long/path/t');
    expect(lastFrame()).toContain('...');
  });

  it('renders completed task with success indicator', () => {
    const completedTasks: CompletedTask[] = [{ name: 'read_file', success: true, duration: 150 }];

    const { lastFrame } = render(<TaskProgress completedTasks={completedTasks} />);

    expect(lastFrame()).toContain('✓');
    expect(lastFrame()).toContain('read_file');
    expect(lastFrame()).toContain('150ms');
  });

  it('renders completed task with failure indicator', () => {
    const completedTasks: CompletedTask[] = [
      { name: 'read_file', success: false, duration: 50, error: 'File not found' },
    ];

    const { lastFrame } = render(<TaskProgress completedTasks={completedTasks} />);

    expect(lastFrame()).toContain('✗');
    expect(lastFrame()).toContain('read_file');
    expect(lastFrame()).toContain('File not found');
  });

  it('limits completed tasks shown', () => {
    const completedTasks: CompletedTask[] = [
      { name: 'task1', success: true, duration: 100 },
      { name: 'task2', success: true, duration: 100 },
      { name: 'task3', success: true, duration: 100 },
      { name: 'task4', success: true, duration: 100 },
      { name: 'task5', success: true, duration: 100 },
    ];

    const { lastFrame } = render(<TaskProgress completedTasks={completedTasks} maxCompleted={3} />);

    // Should show last 3 tasks
    expect(lastFrame()).not.toContain('task1');
    expect(lastFrame()).not.toContain('task2');
    expect(lastFrame()).toContain('task3');
    expect(lastFrame()).toContain('task4');
    expect(lastFrame()).toContain('task5');
  });

  it('renders both active and completed tasks', () => {
    const activeTasks: ActiveTask[] = [
      { id: 'span-4', name: 'active_tool', startTime: Date.now() },
    ];
    const completedTasks: CompletedTask[] = [{ name: 'done_tool', success: true, duration: 100 }];

    const { lastFrame } = render(
      <TaskProgress activeTasks={activeTasks} completedTasks={completedTasks} />
    );

    expect(lastFrame()).toContain('active_tool');
    expect(lastFrame()).toContain('done_tool');
    expect(lastFrame()).toContain('✓');
  });

  it('hides completed tasks when showCompleted is false', () => {
    const completedTasks: CompletedTask[] = [{ name: 'done_tool', success: true, duration: 100 }];

    const { lastFrame } = render(
      <TaskProgress completedTasks={completedTasks} showCompleted={false} />
    );

    // Nothing to show - renders empty
    expect(lastFrame()).toBe('');
  });

  it('shows only first 2 arguments', () => {
    const activeTasks: ActiveTask[] = [
      {
        id: 'span-5',
        name: 'multi_arg_tool',
        args: { arg1: 'val1', arg2: 'val2', arg3: 'val3' },
        startTime: Date.now(),
      },
    ];

    const { lastFrame } = render(<TaskProgress activeTasks={activeTasks} />);

    expect(lastFrame()).toContain('arg1: val1');
    expect(lastFrame()).toContain('arg2: val2');
    expect(lastFrame()).not.toContain('arg3');
  });

  it('handles empty args object', () => {
    const activeTasks: ActiveTask[] = [
      {
        id: 'span-6',
        name: 'no_args_tool',
        args: {},
        startTime: Date.now(),
      },
    ];

    const { lastFrame } = render(<TaskProgress activeTasks={activeTasks} />);

    expect(lastFrame()).toContain('no_args_tool');
    // Should not show empty parentheses
    expect(lastFrame()).not.toContain('()');
  });

  it('handles undefined args', () => {
    const activeTasks: ActiveTask[] = [
      {
        id: 'span-7',
        name: 'undefined_args_tool',
        startTime: Date.now(),
      },
    ];

    const { lastFrame } = render(<TaskProgress activeTasks={activeTasks} />);

    expect(lastFrame()).toContain('undefined_args_tool');
  });

  it('handles concurrent tasks with same name using unique ids', () => {
    const activeTasks: ActiveTask[] = [
      { id: 'span-a', name: 'read_file', startTime: Date.now() },
      { id: 'span-b', name: 'read_file', startTime: Date.now() },
    ];

    const { lastFrame } = render(<TaskProgress activeTasks={activeTasks} />);

    // Both tasks should be displayed (same name, different ids)
    const frame = lastFrame() ?? '';
    const readFileCount = (frame.match(/read_file/g) ?? []).length;
    expect(readFileCount).toBe(2);
  });
});
