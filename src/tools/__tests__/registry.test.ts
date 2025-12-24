/**
 * Tests for Tool Registry.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { ToolRegistry, type ToolPermission, registerBuiltinTools } from '../registry.js';
import { Tool } from '../tool.js';
import { z } from 'zod';

describe('ToolRegistry', () => {
  const testSessionID = 'test-session-123';
  let tempDir: string;
  let originalWorkspaceRoot: string | undefined;

  // Create a simple test tool
  const testTool = Tool.define('test-tool', {
    description: 'A test tool',
    parameters: z.object({
      input: z.string().describe('Test input'),
    }),
    execute: (args, _ctx) => ({
      title: 'Test executed',
      metadata: {},
      output: `Received: ${args.input}`,
    }),
  });

  const anotherTool = Tool.define('another-tool', {
    description: 'Another test tool',
    parameters: z.object({
      value: z.number().describe('A number'),
    }),
    execute: (args, _ctx) => ({
      title: 'Another executed',
      metadata: {},
      output: `Value: ${String(args.value)}`,
    }),
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    ToolRegistry.clear();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    originalWorkspaceRoot = process.env['AGENT_WORKSPACE_ROOT'];
    process.env['AGENT_WORKSPACE_ROOT'] = tempDir;
  });

  afterEach(async () => {
    ToolRegistry.clear();
    if (originalWorkspaceRoot !== undefined) {
      process.env['AGENT_WORKSPACE_ROOT'] = originalWorkspaceRoot;
    } else {
      delete process.env['AGENT_WORKSPACE_ROOT'];
    }
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('register', () => {
    it('should register a tool', () => {
      ToolRegistry.register(testTool);
      expect(ToolRegistry.has('test-tool')).toBe(true);
    });

    it('should allow re-registration', () => {
      ToolRegistry.register(testTool);
      ToolRegistry.register(testTool);
      expect(ToolRegistry.size()).toBe(1);
    });

    it('should register with custom permissions', () => {
      ToolRegistry.register(testTool, {
        permissions: { required: ['write', 'execute'] },
      });
      const perms = ToolRegistry.permissions('test-tool');
      expect(perms?.required).toContain('write');
      expect(perms?.required).toContain('execute');
    });
  });

  describe('unregister', () => {
    it('should unregister a tool', () => {
      ToolRegistry.register(testTool);
      const result = ToolRegistry.unregister('test-tool');
      expect(result).toBe(true);
      expect(ToolRegistry.has('test-tool')).toBe(false);
    });

    it('should return false for non-existent tool', () => {
      const result = ToolRegistry.unregister('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('ids', () => {
    it('should return all registered tool IDs', () => {
      ToolRegistry.register(testTool);
      ToolRegistry.register(anotherTool);
      const ids = ToolRegistry.ids();
      expect(ids).toContain('test-tool');
      expect(ids).toContain('another-tool');
    });
  });

  describe('all', () => {
    it('should return all registered tool infos', () => {
      ToolRegistry.register(testTool);
      ToolRegistry.register(anotherTool);
      const tools = ToolRegistry.all();
      expect(tools).toHaveLength(2);
    });
  });

  describe('get', () => {
    it('should return tool info by ID', () => {
      ToolRegistry.register(testTool);
      const tool = ToolRegistry.get('test-tool');
      expect(tool?.id).toBe('test-tool');
    });

    it('should return undefined for non-existent tool', () => {
      const tool = ToolRegistry.get('nonexistent');
      expect(tool).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for registered tool', () => {
      ToolRegistry.register(testTool);
      expect(ToolRegistry.has('test-tool')).toBe(true);
    });

    it('should return false for non-registered tool', () => {
      expect(ToolRegistry.has('nonexistent')).toBe(false);
    });
  });

  describe('enabled', () => {
    it('should filter tools by permissions', () => {
      ToolRegistry.register(testTool, { permissions: { required: ['read'] } });
      ToolRegistry.register(anotherTool, { permissions: { required: ['write'] } });

      const readEnabled = ToolRegistry.enabled(new Set<ToolPermission>(['read']));
      expect(readEnabled).toContain('test-tool');
      expect(readEnabled).not.toContain('another-tool');

      const writeEnabled = ToolRegistry.enabled(new Set<ToolPermission>(['write']));
      expect(writeEnabled).toContain('another-tool');
      expect(writeEnabled).not.toContain('test-tool');

      const bothEnabled = ToolRegistry.enabled(new Set<ToolPermission>(['read', 'write']));
      expect(bothEnabled).toContain('test-tool');
      expect(bothEnabled).toContain('another-tool');
    });
  });

  describe('initialize', () => {
    it('should initialize a tool', async () => {
      ToolRegistry.register(testTool);
      const initialized = await ToolRegistry.initialize('test-tool');
      expect(initialized).toBeDefined();
      expect(initialized?.description).toContain('test');
    });

    it('should return undefined for non-existent tool', async () => {
      const initialized = await ToolRegistry.initialize('nonexistent');
      expect(initialized).toBeUndefined();
    });

    it('should cache initialized tool', async () => {
      ToolRegistry.register(testTool);
      const first = await ToolRegistry.initialize('test-tool');
      const second = await ToolRegistry.initialize('test-tool');
      expect(first).toBe(second);
    });
  });

  describe('execute', () => {
    it('should execute a registered tool', async () => {
      ToolRegistry.register(testTool);
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await ToolRegistry.execute('test-tool', { input: 'hello' }, ctx);

      expect(result.success).toBe(true);
      expect(result.result.output).toContain('hello');
    });

    it('should return error for non-existent tool', async () => {
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });
      const result = await ToolRegistry.execute('nonexistent', {}, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle execution errors', async () => {
      const errorTool = Tool.define('error-tool', {
        description: 'Throws an error',
        parameters: z.object({}),
        execute: () => {
          throw new Error('Test error');
        },
      });

      ToolRegistry.register(errorTool);
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await ToolRegistry.execute('error-tool', {}, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Test error');
    });
  });

  describe('tools', () => {
    it('should return LangChain tools', async () => {
      ToolRegistry.register(testTool);
      ToolRegistry.register(anotherTool);

      const tools = await ToolRegistry.tools();

      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name)).toContain('test-tool');
      expect(tools.map((t) => t.name)).toContain('another-tool');
    });

    it('should filter by IDs', async () => {
      ToolRegistry.register(testTool);
      ToolRegistry.register(anotherTool);

      const tools = await ToolRegistry.tools({ ids: ['test-tool'] });

      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe('test-tool');
    });

    it('should filter by permissions', async () => {
      ToolRegistry.register(testTool, { permissions: { required: ['read'] } });
      ToolRegistry.register(anotherTool, { permissions: { required: ['write'] } });

      const tools = await ToolRegistry.tools({
        enabledPermissions: new Set<ToolPermission>(['read']),
      });

      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe('test-tool');
    });
  });

  describe('getLastResult and storeResult', () => {
    it('should store and retrieve last result', async () => {
      ToolRegistry.register(testTool);
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await ToolRegistry.execute('test-tool', { input: 'test' }, ctx);

      const lastResult = ToolRegistry.getLastResult('test-tool');
      expect(lastResult).toBeDefined();
      expect(lastResult?.success).toBe(true);
    });
  });

  describe('setResultCallback and getResultCallback', () => {
    it('should set and get result callback', () => {
      const callback = jest.fn();
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      ToolRegistry.setResultCallback(callback);
      expect(ToolRegistry.getResultCallback()).toBe(callback);

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      ToolRegistry.setResultCallback(undefined);
      expect(ToolRegistry.getResultCallback()).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should clear all registered tools', () => {
      ToolRegistry.register(testTool);
      ToolRegistry.register(anotherTool);
      ToolRegistry.clear();
      expect(ToolRegistry.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('should return number of registered tools', () => {
      expect(ToolRegistry.size()).toBe(0);
      ToolRegistry.register(testTool);
      expect(ToolRegistry.size()).toBe(1);
      ToolRegistry.register(anotherTool);
      expect(ToolRegistry.size()).toBe(2);
    });
  });

  describe('registerBuiltinTools', () => {
    it('should register multiple tools with permissions', () => {
      const toolsDir = tempDir;

      registerBuiltinTools(toolsDir, [
        { tool: testTool, permissions: { required: ['read'] } },
        { tool: anotherTool, permissions: { required: ['write'] } },
      ]);

      expect(ToolRegistry.has('test-tool')).toBe(true);
      expect(ToolRegistry.has('another-tool')).toBe(true);
    });
  });

  describe('external description loading', () => {
    it('should load description from external file', async () => {
      const descPath = path.join(tempDir, 'test-tool.txt');
      await fs.writeFile(descPath, 'External description for test tool');

      ToolRegistry.register(testTool, { descriptionPath: descPath });
      const initialized = await ToolRegistry.initialize('test-tool');

      expect(initialized?.description).toBe('External description for test tool');
    });

    it('should fallback to embedded description if file not found', async () => {
      const descPath = path.join(tempDir, 'nonexistent.txt');

      ToolRegistry.register(testTool, { descriptionPath: descPath });
      const initialized = await ToolRegistry.initialize('test-tool');

      expect(initialized?.description).toBe('A test tool');
    });

    it('should expand template variables in description', async () => {
      const descPath = path.join(tempDir, 'test-tool.txt');
      await fs.writeFile(descPath, 'Workspace: ${workspace}');

      ToolRegistry.register(testTool, { descriptionPath: descPath });
      const initialized = await ToolRegistry.initialize('test-tool');

      expect(initialized?.description).toContain(tempDir);
    });
  });

  describe('LangChain tool wrapper', () => {
    it('should execute via LangChain tool', async () => {
      ToolRegistry.register(testTool);
      const tools = await ToolRegistry.tools();
      const tool = tools[0];

      const result = await tool?.invoke({ input: 'test input' });

      expect(result).toContain('test input');
    });

    it('should invoke result callback', async () => {
      const callback = jest.fn();
      ToolRegistry.register(testTool);

      const tools = await ToolRegistry.tools({ onToolResult: callback });
      const tool = tools[0];

      await tool?.invoke({ input: 'test' });

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0]?.[0]?.success).toBe(true);
    });

    it('should handle errors in LangChain tool', async () => {
      const errorTool = Tool.define('error-tool', {
        description: 'Throws an error',
        parameters: z.object({}),
        execute: () => {
          throw new Error('Test error');
        },
      });

      ToolRegistry.register(errorTool);
      const tools = await ToolRegistry.tools();
      const tool = tools[0];

      const result = await tool?.invoke({});

      expect(result).toContain('Error');
    });
  });
});
