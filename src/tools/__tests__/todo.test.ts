/**
 * Tests for Todo tools (TodoWrite, TodoRead).
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { todoWriteTool, todoReadTool, clearTodos, getTodos } from '../todo.js';
import { Tool } from '../tool.js';

describe('Todo Tools', () => {
  const testSessionID = 'test-session-123';

  beforeEach(() => {
    // Clear todos before each test
    clearTodos(testSessionID);
  });

  describe('todoWriteTool', () => {
    it('has correct ID', () => {
      expect(todoWriteTool.id).toBe('todowrite');
    });

    it('initializes with description', async () => {
      const initialized = await todoWriteTool.init();
      expect(initialized.description).toContain('task list');
    });

    it('should write todos and return formatted output', async () => {
      const initialized = await todoWriteTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });
      const todos = [
        { content: 'Task 1', status: 'pending' as const },
        { content: 'Task 2', status: 'in_progress' as const },
        { content: 'Task 3', status: 'completed' as const },
      ];

      const result = await initialized.execute({ todos }, ctx);

      expect(result.output).toContain('1. [○] Task 1');
      expect(result.output).toContain('2. [●] Task 2');
      expect(result.output).toContain('3. [✓] Task 3');
    });

    it('should store todos in session-scoped store', async () => {
      const initialized = await todoWriteTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });
      const todos = [{ content: 'Test task', status: 'pending' as const }];

      await initialized.execute({ todos }, ctx);

      const storedTodos = getTodos(testSessionID);
      expect(storedTodos).toHaveLength(1);
      expect(storedTodos[0].content).toBe('Test task');
      expect(storedTodos[0].status).toBe('pending');
    });

    it('should return empty list message when no todos', async () => {
      const initialized = await todoWriteTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ todos: [] }, ctx);

      expect(result.output).toContain('(empty list)');
    });

    it('should handle todos with activeForm', async () => {
      const initialized = await todoWriteTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });
      const todos = [
        { content: 'Run tests', status: 'in_progress' as const, activeForm: 'Running tests' },
      ];

      const result = await initialized.execute({ todos }, ctx);

      expect(result.output).toContain('[●] Run tests');
    });

    it('should update existing todos when called again', async () => {
      const initialized = await todoWriteTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      // Write initial todos
      await initialized.execute(
        { todos: [{ content: 'Initial task', status: 'pending' as const }] },
        ctx
      );

      // Update with new todos
      await initialized.execute(
        {
          todos: [
            { content: 'Updated task 1', status: 'completed' as const },
            { content: 'Updated task 2', status: 'pending' as const },
          ],
        },
        ctx
      );

      const storedTodos = getTodos(testSessionID);
      expect(storedTodos).toHaveLength(2);
      expect(storedTodos[0].content).toBe('Updated task 1');
    });

    it('should return correct title for single todo', async () => {
      const initialized = await todoWriteTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { todos: [{ content: 'Single task', status: 'pending' as const }] },
        ctx
      );

      expect(result.title).toBe('Updated 1 todo');
    });

    it('should return correct title for multiple todos', async () => {
      const initialized = await todoWriteTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        {
          todos: [
            { content: 'Task 1', status: 'pending' as const },
            { content: 'Task 2', status: 'pending' as const },
          ],
        },
        ctx
      );

      expect(result.title).toBe('Updated 2 todos');
    });

    it('should return correct metadata with status counts', async () => {
      const initialized = await todoWriteTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        {
          todos: [
            { content: 'Pending 1', status: 'pending' as const },
            { content: 'Pending 2', status: 'pending' as const },
            { content: 'In progress', status: 'in_progress' as const },
            { content: 'Completed', status: 'completed' as const },
          ],
        },
        ctx
      );

      expect(result.metadata.todoCount).toBe(4);
      expect(result.metadata.statusCounts.pending).toBe(2);
      expect(result.metadata.statusCounts.in_progress).toBe(1);
      expect(result.metadata.statusCounts.completed).toBe(1);
    });
  });

  describe('todoReadTool', () => {
    it('has correct ID', () => {
      expect(todoReadTool.id).toBe('todoread');
    });

    it('initializes with description', async () => {
      const initialized = await todoReadTool.init();
      expect(initialized.description).toContain('task list');
    });

    it('should return empty message when no todos exist', async () => {
      const initialized = await todoReadTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({}, ctx);

      expect(result.output).toContain('(no todos)');
    });

    it('should read previously written todos', async () => {
      const writeInit = await todoWriteTool.init();
      const readInit = await todoReadTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      // Write todos first
      await writeInit.execute(
        {
          todos: [
            { content: 'Read this task', status: 'pending' as const },
            { content: 'And this one', status: 'completed' as const },
          ],
        },
        ctx
      );

      // Read todos
      const result = await readInit.execute({}, ctx);

      expect(result.output).toContain('1. [○] Read this task');
      expect(result.output).toContain('2. [✓] And this one');
    });

    it('should format todos with correct status icons', async () => {
      const writeInit = await todoWriteTool.init();
      const readInit = await todoReadTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await writeInit.execute(
        {
          todos: [
            { content: 'Pending task', status: 'pending' as const },
            { content: 'In progress task', status: 'in_progress' as const },
            { content: 'Completed task', status: 'completed' as const },
          ],
        },
        ctx
      );

      const result = await readInit.execute({}, ctx);

      expect(result.output).toContain('[○] Pending task');
      expect(result.output).toContain('[●] In progress task');
      expect(result.output).toContain('[✓] Completed task');
    });

    it('should return correct title for single todo', async () => {
      const writeInit = await todoWriteTool.init();
      const readInit = await todoReadTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await writeInit.execute({ todos: [{ content: 'Single', status: 'pending' as const }] }, ctx);

      const result = await readInit.execute({}, ctx);
      expect(result.title).toBe('1 todo');
    });

    it('should return correct title for multiple todos', async () => {
      const writeInit = await todoWriteTool.init();
      const readInit = await todoReadTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await writeInit.execute(
        {
          todos: [
            { content: 'Task 1', status: 'pending' as const },
            { content: 'Task 2', status: 'pending' as const },
          ],
        },
        ctx
      );

      const result = await readInit.execute({}, ctx);
      expect(result.title).toBe('2 todos');
    });

    it('should return correct metadata', async () => {
      const writeInit = await todoWriteTool.init();
      const readInit = await todoReadTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await writeInit.execute(
        {
          todos: [
            { content: 'Pending', status: 'pending' as const },
            { content: 'In progress', status: 'in_progress' as const },
            { content: 'Completed', status: 'completed' as const },
          ],
        },
        ctx
      );

      const result = await readInit.execute({}, ctx);

      expect(result.metadata.todoCount).toBe(3);
      expect(result.metadata.statusCounts.pending).toBe(1);
      expect(result.metadata.statusCounts.in_progress).toBe(1);
      expect(result.metadata.statusCounts.completed).toBe(1);
    });
  });

  describe('clearTodos', () => {
    it('should clear todos for a session', async () => {
      const writeInit = await todoWriteTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      // Write todos
      await writeInit.execute(
        { todos: [{ content: 'To be cleared', status: 'pending' as const }] },
        ctx
      );

      expect(getTodos(testSessionID)).toHaveLength(1);

      // Clear todos
      clearTodos(testSessionID);

      expect(getTodos(testSessionID)).toHaveLength(0);
    });

    it('should not affect other sessions', async () => {
      const writeInit = await todoWriteTool.init();
      const otherSessionID = 'other-session-456';

      const ctx1 = Tool.createNoopContext({ sessionID: testSessionID });
      const ctx2 = Tool.createNoopContext({ sessionID: otherSessionID });

      // Write to test session
      await writeInit.execute(
        { todos: [{ content: 'Session 1 task', status: 'pending' as const }] },
        ctx1
      );

      // Write to other session
      await writeInit.execute(
        { todos: [{ content: 'Session 2 task', status: 'pending' as const }] },
        ctx2
      );

      // Clear test session
      clearTodos(testSessionID);

      // Test session should be empty
      expect(getTodos(testSessionID)).toHaveLength(0);

      // Other session should still have todos
      expect(getTodos(otherSessionID)).toHaveLength(1);

      // Cleanup
      clearTodos(otherSessionID);
    });
  });

  describe('getTodos', () => {
    it('should return empty array for unknown session', () => {
      const todos = getTodos('unknown-session');
      expect(todos).toEqual([]);
    });

    it('should return todos for known session', async () => {
      const writeInit = await todoWriteTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await writeInit.execute(
        { todos: [{ content: 'Get this', status: 'pending' as const }] },
        ctx
      );

      const todos = getTodos(testSessionID);
      expect(todos).toHaveLength(1);
      expect(todos[0].content).toBe('Get this');
    });
  });
});
