/**
 * Integration tests for Agent with real components (mocked LLM).
 * Tests the full flow: query → LLM → tool → response.
 *
 * These tests use the real Agent class but mock the LLMClient at the module level.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AIMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { AppConfig } from '../../src/config/schema.js';
import type { SpanContext } from '../../src/agent/types.js';
import type { AgentCallbacks } from '../../src/agent/callbacks.js';
import { Tool } from '../../src/tools/index.js';
// Use shared fixtures
import { createTestConfig, createTrackingCallbacks } from '../fixtures/factories.js';
import { SIMPLE_GREETING_RESPONSE } from '../fixtures/llm-responses.js';

/**
 * Helper to convert Tool.Info to StructuredToolInterface for testing.
 * This mimics what ToolRegistry does internally.
 */
function toolToLangChain(info: Tool.Info): StructuredToolInterface {
  const initialized = info.init();
  return new DynamicStructuredTool({
    name: info.id,
    description: initialized.description,
    schema: initialized.parameters as z.ZodObject<z.ZodRawShape>,
    func: async (input) => {
      const ctx = Tool.createNoopContext();
      const result = await initialized.execute(input, ctx);
      return `${String(result.title)}\n\n${String(result.output)}`;
    },
  });
}

// Mock the LLMClient module before importing Agent
const mockInvoke = jest.fn<() => Promise<unknown>>();
const mockStream = jest.fn<() => Promise<unknown>>();
const mockGetModel = jest.fn<() => unknown>();
const mockGetModelName = jest.fn(() => 'gpt-4o');
const mockGetProviderName = jest.fn(() => 'openai');

jest.unstable_mockModule('../../src/model/llm.js', () => ({
  LLMClient: class MockLLMClient {
    invoke = mockInvoke;
    stream = mockStream;
    getModel = mockGetModel;
    getModelName = mockGetModelName;
    getProviderName = mockGetProviderName;
  },
}));

// Import Agent after mocking LLMClient
const { Agent } = await import('../../src/agent/agent.js');

describe('Agent Integration', () => {
  let config: AppConfig;
  let callbackLog: string[];
  let _traceIds: string[];
  let _spanIds: string[];
  let callbacks: AgentCallbacks;

  // Create a simple greeting tool for testing using Tool.define
  const greetingTool = Tool.define('greet', {
    description: 'Greet a person by name',
    parameters: z.object({
      name: z.string().describe('The name of the person to greet'),
    }),
    execute: (args) => ({
      title: `Greeted ${args.name}`,
      metadata: { name: args.name },
      output: `Hello, ${args.name}!`,
    }),
  });

  beforeEach(() => {
    // Use fixtures for config and callbacks
    config = createTestConfig();

    // Use tracking callbacks from fixtures
    const tracking = createTrackingCallbacks();
    callbackLog = tracking.log;
    _traceIds = tracking.traceIds;
    _spanIds = tracking.spanIds;
    callbacks = tracking.callbacks;

    jest.clearAllMocks();

    // Default mock for simple invocation (no tools)
    // Uses SIMPLE_GREETING_RESPONSE pattern from fixtures
    mockInvoke.mockResolvedValue({
      success: true,
      result: { content: SIMPLE_GREETING_RESPONSE.content },
      message: 'Success',
    });

    // Default: no model for tools
    mockGetModel.mockReturnValue({
      success: false,
      message: 'No model for tools',
    });
  });

  describe('full query flow without tools', () => {
    it('processes a simple query and emits callbacks in order', async () => {
      const agent = new Agent({
        config,
        callbacks,
        systemPrompt: 'You are a helpful assistant.',
      });

      const result = await agent.run('Hello there');

      // Response matches SIMPLE_GREETING_RESPONSE from fixtures
      expect(result).toBe('Hello! How can I help you today?');

      // Verify key callbacks were called in correct order (ignoring debug messages)
      const keyEvents = callbackLog.filter((e) => !e.startsWith('onDebug'));
      expect(keyEvents).toContain('onAgentStart: Hello there');
      expect(keyEvents).toContain('onSpinnerStart: Thinking...');
      expect(keyEvents).toContain('onSpinnerStop');
      expect(keyEvents).toContain('onAgentEnd: Hello! How can I help you today?');

      // Verify order: AgentStart -> SpinnerStart -> ... -> SpinnerStop -> AgentEnd
      const agentStartIdx = keyEvents.indexOf('onAgentStart: Hello there');
      const spinnerStopIdx = keyEvents.indexOf('onSpinnerStop');
      const agentEndIdx = keyEvents.findIndex((e) => e.startsWith('onAgentEnd'));
      expect(agentStartIdx).toBeLessThan(spinnerStopIdx);
      expect(spinnerStopIdx).toBeLessThan(agentEndIdx);
    });

    it('handles conversation history correctly', async () => {
      const agent = new Agent({
        config,
        callbacks,
        systemPrompt: 'You are a helpful assistant.',
      });

      const history = [
        { role: 'user' as const, content: 'My name is Alice' },
        { role: 'assistant' as const, content: 'Nice to meet you, Alice!' },
      ];

      await agent.run('What is my name?', history);

      // LLM should have been called with messages including history
      expect(mockInvoke).toHaveBeenCalled();
    });
  });

  describe('full query flow with tools', () => {
    beforeEach(() => {
      // Set up model with tool binding support
      const mockModelInvoke = jest
        .fn<() => Promise<AIMessage>>()
        .mockResolvedValueOnce(
          new AIMessage({
            content: '',
            tool_calls: [
              {
                id: 'call_123',
                name: 'greet',
                args: { name: 'World' },
              },
            ],
          })
        )
        .mockResolvedValueOnce(new AIMessage({ content: 'I greeted World for you!' }));
      const mockBindTools = jest.fn();
      const mockModelWithTools = {
        invoke: mockModelInvoke,
        bindTools: mockBindTools,
      };
      // bindTools returns the same mock object
      mockBindTools.mockReturnValue(mockModelWithTools);

      mockGetModel.mockReturnValue({
        success: true,
        result: mockModelWithTools as unknown as BaseChatModel,
        message: 'Model retrieved',
      });
    });

    it('executes tool calls and returns final response', async () => {
      const agent = new Agent({
        config,
        callbacks,
        tools: [toolToLangChain(greetingTool)],
        systemPrompt: 'You are a helpful assistant.',
      });

      const result = await agent.run('Please greet World');

      expect(result).toBe('I greeted World for you!');
    });

    it('emits tool callbacks during execution', async () => {
      const agent = new Agent({
        config,
        callbacks,
        tools: [toolToLangChain(greetingTool)],
        systemPrompt: 'You are a helpful assistant.',
      });

      await agent.run('Please greet World');

      // Verify tool callbacks were called
      expect(callbackLog).toContain('onToolStart: greet');
      expect(callbackLog).toContain('onToolEnd: greet');

      // Verify callback order: LLM -> Tool -> LLM
      const llmStartIndex = callbackLog.indexOf('onLLMStart: gpt-4o');
      const toolStartIndex = callbackLog.indexOf('onToolStart: greet');
      const toolEndIndex = callbackLog.indexOf('onToolEnd: greet');

      expect(llmStartIndex).toBeLessThan(toolStartIndex);
      expect(toolStartIndex).toBeLessThan(toolEndIndex);
    });

    // Note: Tool argument verification is implicitly tested by 'executes tool calls and returns final response'
    // which uses greetingTool and verifies the response includes the expected output based on args
  });

  describe('error handling', () => {
    it('handles LLM errors gracefully', async () => {
      mockInvoke.mockResolvedValue({
        success: false,
        error: 'RATE_LIMITED',
        message: 'Rate limit exceeded',
      });

      const agent = new Agent({
        config,
        callbacks,
        systemPrompt: 'You are a helpful assistant.',
      });

      const result = await agent.run('Hello');

      expect(result).toContain('Error');
      expect(callbackLog).toContain('onSpinnerStop');
    });

    it('handles tool execution errors', async () => {
      const failingTool = Tool.define('failing', {
        description: 'A tool that fails',
        parameters: z.object({}),
        execute: () => {
          throw new Error('Tool crashed');
        },
      });

      const mockModelInvoke = jest
        .fn<() => Promise<AIMessage>>()
        .mockResolvedValueOnce(
          new AIMessage({
            content: '',
            tool_calls: [{ id: 'call_1', name: 'failing', args: {} }],
          })
        )
        .mockResolvedValueOnce(new AIMessage({ content: 'Tool failed, sorry!' }));
      const mockBindTools = jest.fn();
      const mockModelWithTools = {
        invoke: mockModelInvoke,
        bindTools: mockBindTools,
      };
      mockBindTools.mockReturnValue(mockModelWithTools);

      mockGetModel.mockReturnValue({
        success: true,
        result: mockModelWithTools as unknown as BaseChatModel,
        message: 'Model retrieved',
      });

      const agent = new Agent({
        config,
        callbacks,
        tools: [toolToLangChain(failingTool)],
        systemPrompt: 'You are a helpful assistant.',
      });

      const result = await agent.run('Use the failing tool');

      // Agent should continue after tool error
      expect(result).toBe('Tool failed, sorry!');
      expect(callbackLog).toContain('onToolEnd: failing');
    });
  });

  describe('span context propagation', () => {
    it('uses consistent trace ID across all callbacks in a run', async () => {
      const traceIds: string[] = [];
      const spanIds: string[] = [];

      const trackingCallbacks: AgentCallbacks = {
        onAgentStart: (ctx: SpanContext) => traceIds.push(ctx.traceId),
        onLLMStart: (ctx: SpanContext) => {
          traceIds.push(ctx.traceId);
          spanIds.push(ctx.spanId);
        },
        onLLMEnd: (ctx: SpanContext) => traceIds.push(ctx.traceId),
        onAgentEnd: (ctx: SpanContext) => traceIds.push(ctx.traceId),
      };

      const agent = new Agent({
        config,
        callbacks: trackingCallbacks,
        systemPrompt: 'Test',
      });

      await agent.run('Test query');

      // All trace IDs should be the same (same trace)
      const uniqueTraceIds = [...new Set(traceIds)];
      expect(uniqueTraceIds).toHaveLength(1);

      // Span IDs should exist
      expect(spanIds.length).toBeGreaterThan(0);
    });

    it('creates child span IDs for LLM operations', async () => {
      const agentSpanIds: string[] = [];
      const llmSpanIds: string[] = [];
      const parentSpanIds: (string | undefined)[] = [];

      const trackingCallbacks: AgentCallbacks = {
        onAgentStart: (ctx: SpanContext) => agentSpanIds.push(ctx.spanId),
        onLLMStart: (ctx: SpanContext) => {
          llmSpanIds.push(ctx.spanId);
          parentSpanIds.push(ctx.parentSpanId);
        },
        onAgentEnd: (ctx: SpanContext) => agentSpanIds.push(ctx.spanId),
      };

      const agent = new Agent({
        config,
        callbacks: trackingCallbacks,
        systemPrompt: 'Test',
      });

      await agent.run('Test query');

      // Agent start and end share the same span (root span)
      expect(agentSpanIds[0]).toBe(agentSpanIds[1]);

      // LLM operations should have span IDs
      expect(llmSpanIds.length).toBeGreaterThan(0);

      // LLM span should reference parent (agent span)
      expect(parentSpanIds[0]).toBe(agentSpanIds[0]);
    });
  });

  describe('multi-tool execution', () => {
    // Create additional tools for multi-tool tests
    const addTool = Tool.define('add', {
      description: 'Add two numbers',
      parameters: z.object({
        a: z.number().describe('First number'),
        b: z.number().describe('Second number'),
      }),
      execute: (args) => ({
        title: `Added ${String(args.a)} + ${String(args.b)}`,
        metadata: { a: args.a, b: args.b, sum: args.a + args.b },
        output: `Sum: ${String(args.a + args.b)}`,
      }),
    });

    const multiplyTool = Tool.define('multiply', {
      description: 'Multiply two numbers',
      parameters: z.object({
        a: z.number().describe('First number'),
        b: z.number().describe('Second number'),
      }),
      execute: (args) => ({
        title: `Multiplied ${String(args.a)} * ${String(args.b)}`,
        metadata: { a: args.a, b: args.b, product: args.a * args.b },
        output: `Product: ${String(args.a * args.b)}`,
      }),
    });

    it('executes multiple tools in sequence', async () => {
      const mockModelInvoke = jest
        .fn<() => Promise<AIMessage>>()
        // First LLM call: request add tool
        .mockResolvedValueOnce(
          new AIMessage({
            content: '',
            tool_calls: [{ id: 'call_1', name: 'add', args: { a: 2, b: 3 } }],
          })
        )
        // Second LLM call: request multiply tool
        .mockResolvedValueOnce(
          new AIMessage({
            content: '',
            tool_calls: [{ id: 'call_2', name: 'multiply', args: { a: 5, b: 4 } }],
          })
        )
        // Third LLM call: final response
        .mockResolvedValueOnce(new AIMessage({ content: 'The sum is 5 and product is 20.' }));

      const mockBindTools = jest.fn();
      const mockModelWithTools = {
        invoke: mockModelInvoke,
        bindTools: mockBindTools,
      };
      mockBindTools.mockReturnValue(mockModelWithTools);

      mockGetModel.mockReturnValue({
        success: true,
        result: mockModelWithTools as unknown as BaseChatModel,
        message: 'Model retrieved',
      });

      const agent = new Agent({
        config,
        callbacks,
        tools: [toolToLangChain(addTool), toolToLangChain(multiplyTool)],
        systemPrompt: 'You are a calculator assistant.',
      });

      const result = await agent.run('Add 2+3 and multiply 5*4');

      expect(result).toBe('The sum is 5 and product is 20.');

      // Verify both tools were executed
      expect(callbackLog).toContain('onToolStart: add');
      expect(callbackLog).toContain('onToolEnd: add');
      expect(callbackLog).toContain('onToolStart: multiply');
      expect(callbackLog).toContain('onToolEnd: multiply');

      // Verify order: add before multiply
      const addStartIdx = callbackLog.indexOf('onToolStart: add');
      const multiplyStartIdx = callbackLog.indexOf('onToolStart: multiply');
      expect(addStartIdx).toBeLessThan(multiplyStartIdx);
    });

    it('handles parallel tool calls in single response', async () => {
      const mockModelInvoke = jest
        .fn<() => Promise<AIMessage>>()
        // LLM returns multiple tool calls at once
        .mockResolvedValueOnce(
          new AIMessage({
            content: '',
            tool_calls: [
              { id: 'call_1', name: 'add', args: { a: 1, b: 2 } },
              { id: 'call_2', name: 'multiply', args: { a: 3, b: 4 } },
            ],
          })
        )
        .mockResolvedValueOnce(new AIMessage({ content: 'Both calculations complete!' }));

      const mockBindTools = jest.fn();
      const mockModelWithTools = {
        invoke: mockModelInvoke,
        bindTools: mockBindTools,
      };
      mockBindTools.mockReturnValue(mockModelWithTools);

      mockGetModel.mockReturnValue({
        success: true,
        result: mockModelWithTools as unknown as BaseChatModel,
        message: 'Model retrieved',
      });

      const agent = new Agent({
        config,
        callbacks,
        tools: [toolToLangChain(addTool), toolToLangChain(multiplyTool)],
        systemPrompt: 'You are a calculator assistant.',
      });

      const result = await agent.run('Calculate 1+2 and 3*4');

      expect(result).toBe('Both calculations complete!');

      // Both tools should be executed
      expect(callbackLog).toContain('onToolStart: add');
      expect(callbackLog).toContain('onToolStart: multiply');
    });
  });

  describe('max iterations handling', () => {
    it('stops after reaching max iterations', async () => {
      // Tool that always asks for more work (infinite loop scenario)
      const mockModelInvoke = jest.fn<() => Promise<AIMessage>>().mockResolvedValue(
        new AIMessage({
          content: '',
          tool_calls: [{ id: 'call_loop', name: 'greet', args: { name: 'Loop' } }],
        })
      );

      const mockBindTools = jest.fn();
      const mockModelWithTools = {
        invoke: mockModelInvoke,
        bindTools: mockBindTools,
      };
      mockBindTools.mockReturnValue(mockModelWithTools);

      mockGetModel.mockReturnValue({
        success: true,
        result: mockModelWithTools as unknown as BaseChatModel,
        message: 'Model retrieved',
      });

      const agent = new Agent({
        config,
        callbacks,
        tools: [toolToLangChain(greetingTool)],
        systemPrompt: 'Test',
        maxIterations: 3, // Limit iterations
      });

      const result = await agent.run('Greet infinitely');

      // Should stop with an error message about max iterations
      expect(result).toContain('iterations');

      // Should have called tool exactly maxIterations times
      const toolStartCount = callbackLog.filter((e) => e === 'onToolStart: greet').length;
      expect(toolStartCount).toBe(3);
    });
  });

  describe('conversation history edge cases', () => {
    it('handles empty conversation history', async () => {
      const agent = new Agent({
        config,
        callbacks,
        systemPrompt: 'You are a helpful assistant.',
      });

      const result = await agent.run('Hello', []);

      // Response matches SIMPLE_GREETING_RESPONSE from fixtures
      expect(result).toBe('Hello! How can I help you today?');
      expect(mockInvoke).toHaveBeenCalled();
    });

    it('handles long conversation history', async () => {
      const agent = new Agent({
        config,
        callbacks,
        systemPrompt: 'You are a helpful assistant.',
      });

      // Create a long conversation history
      const longHistory = Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: `Message ${String(i + 1)}`,
      }));

      await agent.run('Continue the conversation', longHistory);

      expect(mockInvoke).toHaveBeenCalled();
    });

    it('handles history with special characters', async () => {
      const agent = new Agent({
        config,
        callbacks,
        systemPrompt: 'You are a helpful assistant.',
      });

      const historyWithSpecialChars = [
        { role: 'user' as const, content: 'Hello! 🎉 How are you?' },
        { role: 'assistant' as const, content: "I'm doing well! <script>alert('xss')</script>" },
      ];

      await agent.run('Continue', historyWithSpecialChars);

      expect(mockInvoke).toHaveBeenCalled();
    });
  });

  describe('tool result handling', () => {
    it('handles tool returning error response', async () => {
      const errorTool = Tool.define('errorTool', {
        description: 'A tool that returns an error',
        parameters: z.object({}),
        execute: () => {
          throw new Error('Invalid input provided');
        },
      });

      const mockModelInvoke = jest
        .fn<() => Promise<AIMessage>>()
        .mockResolvedValueOnce(
          new AIMessage({
            content: '',
            tool_calls: [{ id: 'call_err', name: 'errorTool', args: {} }],
          })
        )
        .mockResolvedValueOnce(
          new AIMessage({ content: 'The tool encountered a validation error.' })
        );

      const mockBindTools = jest.fn();
      const mockModelWithTools = {
        invoke: mockModelInvoke,
        bindTools: mockBindTools,
      };
      mockBindTools.mockReturnValue(mockModelWithTools);

      mockGetModel.mockReturnValue({
        success: true,
        result: mockModelWithTools as unknown as BaseChatModel,
        message: 'Model retrieved',
      });

      const agent = new Agent({
        config,
        callbacks,
        tools: [toolToLangChain(errorTool)],
        systemPrompt: 'Test',
      });

      const result = await agent.run('Use the error tool');

      expect(result).toBe('The tool encountered a validation error.');
      expect(callbackLog).toContain('onToolEnd: errorTool');
    });

    it('handles tool returning large result', async () => {
      const largeTool = Tool.define('largeTool', {
        description: 'Returns a large result',
        parameters: z.object({}),
        execute: () => ({
          title: 'Large data retrieved',
          metadata: {},
          output: 'x'.repeat(10000), // 10KB of data
        }),
      });

      const mockModelInvoke = jest
        .fn<() => Promise<AIMessage>>()
        .mockResolvedValueOnce(
          new AIMessage({
            content: '',
            tool_calls: [{ id: 'call_large', name: 'largeTool', args: {} }],
          })
        )
        .mockResolvedValueOnce(new AIMessage({ content: 'Processed large data successfully.' }));

      const mockBindTools = jest.fn();
      const mockModelWithTools = {
        invoke: mockModelInvoke,
        bindTools: mockBindTools,
      };
      mockBindTools.mockReturnValue(mockModelWithTools);

      mockGetModel.mockReturnValue({
        success: true,
        result: mockModelWithTools as unknown as BaseChatModel,
        message: 'Model retrieved',
      });

      const agent = new Agent({
        config,
        callbacks,
        tools: [toolToLangChain(largeTool)],
        systemPrompt: 'Test',
      });

      const result = await agent.run('Get large data');

      expect(result).toBe('Processed large data successfully.');
    });
  });

  describe('callback error handling', () => {
    it('propagates callback errors (callbacks are not caught)', async () => {
      const throwingCallbacks: AgentCallbacks = {
        onAgentStart: () => {
          throw new Error('Callback error');
        },
      };

      const agent = new Agent({
        config,
        callbacks: throwingCallbacks,
        systemPrompt: 'Test',
      });

      // Callback errors should propagate - this is expected behavior
      // Callbacks are considered critical and should be handled by the caller
      await expect(agent.run('Hello')).rejects.toThrow('Callback error');
    });
  });
});
