/**
 * Tests for Task tool (subagent delegation).
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { taskTool } from '../task.js';
import { Tool } from '../tool.js';

describe('Task Tool', () => {
  const testSessionID = 'test-session-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('taskTool', () => {
    it('has correct ID', () => {
      expect(taskTool.id).toBe('task');
    });

    it('initializes with description containing subagent types', async () => {
      const initialized = await taskTool.init();
      expect(initialized.description).toContain('subagent');
      expect(initialized.description).toContain('general');
    });

    it('should execute with valid subagent type', async () => {
      const initialized = await taskTool.init();
      const metadataMock = jest.fn();
      const ctx = {
        ...Tool.createNoopContext({ sessionID: testSessionID }),
        metadata: metadataMock,
      };

      const result = await initialized.execute(
        {
          description: 'Test task',
          prompt: 'Do something useful',
          subagent_type: 'general',
        },
        ctx
      );

      expect(result.title).toContain('Task delegated');
      expect(result.title).toContain('Test task');
      expect(result.metadata.subagentType).toBe('general');
      expect(result.metadata.status).toBe('pending');
    });

    it('should return error for invalid subagent type', async () => {
      const initialized = await taskTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        {
          description: 'Test task',
          prompt: 'Do something',
          subagent_type: 'invalid-type',
        },
        ctx
      );

      expect(result.title).toContain('Error');
      expect(result.metadata.error).toBe('VALIDATION_ERROR');
      expect(result.metadata.status).toBe('failed');
      expect(result.output).toContain("Unknown subagent type 'invalid-type'");
    });

    it('should use default subagent type when not provided', async () => {
      const initialized = await taskTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        {
          description: 'Test task',
          prompt: 'Do something',
        },
        ctx
      );

      expect(result.metadata.subagentType).toBe('general');
    });

    it('should generate session ID when not provided', async () => {
      const initialized = await taskTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        {
          description: 'Test task',
          prompt: 'Do something',
          subagent_type: 'general',
        },
        ctx
      );

      expect(result.metadata.sessionID).toMatch(/^task-\d+-[a-f0-9]{8}$/);
    });

    it('should use provided session ID', async () => {
      const initialized = await taskTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });
      const customSessionId = 'custom-session-456';

      const result = await initialized.execute(
        {
          description: 'Test task',
          prompt: 'Do something',
          subagent_type: 'general',
          session_id: customSessionId,
        },
        ctx
      );

      expect(result.metadata.sessionID).toBe(customSessionId);
    });

    it('should return LLM_ASSIST_REQUIRED in output', async () => {
      const initialized = await taskTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        {
          description: 'Test task',
          prompt: 'Do something',
          subagent_type: 'general',
        },
        ctx
      );

      const output = JSON.parse(result.output);
      expect(output.action).toBe('LLM_ASSIST_REQUIRED');
      expect(output.taskType).toBe('subagent_delegation');
      expect(output.description).toBe('Test task');
      expect(output.prompt).toBe('Do something');
    });

    it('should stream metadata with title', async () => {
      const initialized = await taskTool.init();
      const metadataMock = jest.fn();
      const ctx = {
        ...Tool.createNoopContext({ sessionID: testSessionID }),
        metadata: metadataMock,
      };

      await initialized.execute(
        {
          description: 'My task',
          prompt: 'Do work',
          subagent_type: 'research',
        },
        ctx
      );

      expect(metadataMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('research'),
          metadata: expect.objectContaining({
            subagentType: 'research',
            status: 'pending',
          }),
        })
      );
    });

    it('should accept all valid subagent types', async () => {
      const initialized = await taskTool.init();
      const validTypes = ['general', 'code-review', 'research', 'planning'];

      for (const type of validTypes) {
        const ctx = Tool.createNoopContext({ sessionID: testSessionID });
        const result = await initialized.execute(
          {
            description: 'Test',
            prompt: 'Test prompt',
            subagent_type: type,
          },
          ctx
        );
        expect(result.metadata.subagentType).toBe(type);
      }
    });
  });
});
