/**
 * Tests for Tool namespace (tool definition and context).
 */

import { describe, it, expect, jest } from '@jest/globals';
import { z } from 'zod';
import { Tool } from '../tool.js';

describe('Tool namespace', () => {
  describe('define', () => {
    it('should create tool with static definition', () => {
      const tool = Tool.define('test', {
        description: 'A test tool',
        parameters: z.object({ name: z.string() }),
        execute: (args) => ({
          title: 'Test',
          metadata: {},
          output: `Hello, ${args.name}`,
        }),
      });

      expect(tool.id).toBe('test');
      expect(typeof tool.init).toBe('function');
    });

    it('should create tool with async init function', async () => {
      const tool = Tool.define('async-test', async () => {
        await Promise.resolve(); // Simulate async operation
        return {
          description: 'Async test tool',
          parameters: z.object({ value: z.number() }),
          execute: (args: { value: number }) => ({
            title: 'Async',
            metadata: {},
            output: `Value: ${String(args.value)}`,
          }),
        };
      });

      expect(tool.id).toBe('async-test');
      const initialized = await tool.init();
      expect(initialized.description).toBe('Async test tool');
    });

    it('should create tool with sync init function', () => {
      const tool = Tool.define('sync-test', () => ({
        description: 'Sync test tool',
        parameters: z.object({}),
        execute: () => ({
          title: 'Sync',
          metadata: {},
          output: 'Done',
        }),
      }));

      expect(tool.id).toBe('sync-test');
      const initialized = tool.init();
      expect(initialized.description).toBe('Sync test tool');
    });

    it('should support init context', async () => {
      const onDebug = jest.fn();
      const tool = Tool.define('ctx-test', (ctx) => ({
        description: `Tool in ${ctx?.workingDir ?? 'default'}`,
        parameters: z.object({}),
        execute: () => ({
          title: 'Context',
          metadata: {},
          output: 'Done',
        }),
      }));

      const initialized = await tool.init({ workingDir: '/test/dir', onDebug });
      expect(initialized.description).toContain('/test/dir');
    });
  });

  describe('createNoopContext', () => {
    it('should create default noop context', () => {
      const ctx = Tool.createNoopContext();

      expect(ctx.sessionID).toBe('test-session');
      expect(ctx.messageID).toBe('test-message');
      expect(ctx.agent).toBe('test-agent');
      expect(ctx.abort).toBeInstanceOf(AbortSignal);
      expect(typeof ctx.metadata).toBe('function');
    });

    it('should allow overrides', () => {
      const ctx = Tool.createNoopContext({
        sessionID: 'custom-session',
        agent: 'custom-agent',
      });

      expect(ctx.sessionID).toBe('custom-session');
      expect(ctx.agent).toBe('custom-agent');
      expect(ctx.messageID).toBe('test-message'); // default
    });

    it('should have noop metadata function', () => {
      const ctx = Tool.createNoopContext();
      // Should not throw
      ctx.metadata({ title: 'test', metadata: { foo: 'bar' } });
    });

    it('should allow custom callID', () => {
      const ctx = Tool.createNoopContext({ callID: 'call-123' });
      expect(ctx.callID).toBe('call-123');
    });

    it('should allow extra context', () => {
      const ctx = Tool.createNoopContext({
        extra: { customData: 'value' },
      });
      expect(ctx.extra?.customData).toBe('value');
    });
  });

  describe('isInfo', () => {
    it('should return true for valid Tool.Info', () => {
      const tool = Tool.define('test', {
        description: 'Test',
        parameters: z.object({}),
        execute: () => ({ title: '', metadata: {}, output: '' }),
      });

      expect(Tool.isInfo(tool)).toBe(true);
    });

    it('should return false for null', () => {
      expect(Tool.isInfo(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(Tool.isInfo(undefined)).toBe(false);
    });

    it('should return false for primitive', () => {
      expect(Tool.isInfo('string')).toBe(false);
      expect(Tool.isInfo(123)).toBe(false);
      expect(Tool.isInfo(true)).toBe(false);
    });

    it('should return false for object without id', () => {
      expect(Tool.isInfo({ init: () => {} })).toBe(false);
    });

    it('should return false for object without init', () => {
      expect(Tool.isInfo({ id: 'test' })).toBe(false);
    });

    it('should return false for object with non-string id', () => {
      expect(Tool.isInfo({ id: 123, init: () => {} })).toBe(false);
    });

    it('should return false for object with non-function init', () => {
      expect(Tool.isInfo({ id: 'test', init: 'not a function' })).toBe(false);
    });

    it('should return true for object with valid id and init', () => {
      expect(Tool.isInfo({ id: 'test', init: () => {} })).toBe(true);
    });
  });

  describe('Tool.Initialized', () => {
    it('should execute sync tool', () => {
      const tool = Tool.define('sync', {
        description: 'Sync tool',
        parameters: z.object({ value: z.string() }),
        execute: (args) => ({
          title: 'Sync executed',
          metadata: { length: args.value.length },
          output: args.value,
        }),
      });

      const initialized = tool.init();
      const ctx = Tool.createNoopContext();
      const result = initialized.execute({ value: 'hello' }, ctx);

      expect(result.title).toBe('Sync executed');
      expect(result.output).toBe('hello');
    });

    it('should execute async tool', async () => {
      const tool = Tool.define('async', {
        description: 'Async tool',
        parameters: z.object({ delay: z.number() }),
        execute: async (args) => {
          await new Promise((r) => setTimeout(r, args.delay));
          return {
            title: 'Async executed',
            metadata: {},
            output: `Waited ${String(args.delay)}ms`,
          };
        },
      });

      const initialized = tool.init();
      const ctx = Tool.createNoopContext();
      const result = await initialized.execute({ delay: 10 }, ctx);

      expect(result.title).toBe('Async executed');
    });

    it('should provide context to execute', () => {
      const receivedCtx = { sessionID: '', agent: '' };

      const tool = Tool.define('ctx-test', {
        description: 'Context test',
        parameters: z.object({}),
        execute: (_, ctx) => {
          receivedCtx.sessionID = ctx.sessionID;
          receivedCtx.agent = ctx.agent;
          return { title: '', metadata: {}, output: '' };
        },
      });

      const initialized = tool.init();
      const ctx = Tool.createNoopContext({
        sessionID: 'my-session',
        agent: 'my-agent',
      });
      initialized.execute({}, ctx);

      expect(receivedCtx.sessionID).toBe('my-session');
      expect(receivedCtx.agent).toBe('my-agent');
    });

    it('should allow metadata streaming in execute', () => {
      const metadataUpdates: Array<{ title?: string }> = [];

      const tool = Tool.define('stream', {
        description: 'Stream test',
        parameters: z.object({}),
        execute: (_, ctx) => {
          ctx.metadata({ title: 'Progress 1' });
          ctx.metadata({ title: 'Progress 2' });
          return { title: 'Done', metadata: {}, output: '' };
        },
      });

      const initialized = tool.init();
      const ctx = Tool.createNoopContext({
        metadata: (update) => metadataUpdates.push(update),
      });
      initialized.execute({}, ctx);

      expect(metadataUpdates).toHaveLength(2);
      expect(metadataUpdates[0]?.title).toBe('Progress 1');
    });
  });

  describe('Tool.Result', () => {
    it('should support attachments', () => {
      const tool = Tool.define('attach', {
        description: 'Attachment test',
        parameters: z.object({}),
        execute: () => ({
          title: 'With attachment',
          metadata: {},
          output: 'See attached',
          attachments: [
            {
              type: 'image/png',
              data: 'base64data...',
              filename: 'image.png',
            },
          ],
        }),
      });

      const initialized = tool.init();
      const ctx = Tool.createNoopContext();
      const result = initialized.execute({}, ctx);

      expect(result.attachments).toHaveLength(1);
      expect(result.attachments?.[0]?.type).toBe('image/png');
    });
  });
});
