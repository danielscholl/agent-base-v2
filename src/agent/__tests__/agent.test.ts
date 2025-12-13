/**
 * Unit tests for Agent class.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { AppConfig } from '../../config/schema.js';
import { getDefaultConfig } from '../../config/schema.js';
import type { AgentCallbacks } from '../callbacks.js';
import type { SpanContext, Message } from '../types.js';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage } from '@langchain/core/messages';

// Create mock functions at module level
const mockInvoke =
  jest.fn<() => Promise<{ success: boolean; result?: unknown; error?: string; message: string }>>();
const mockStream =
  jest.fn<() => Promise<{ success: boolean; result?: unknown; error?: string; message: string }>>();
const mockGetModel =
  jest.fn<() => { success: boolean; result?: unknown; error?: string; message: string }>();
const mockGetModelName = jest.fn<() => string>();
const mockGetProviderName = jest.fn<() => string>();

// Mock fs/promises for prompt loading
jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: () => Promise.resolve('You are a helpful assistant. Model: {{MODEL}}'),
  access: () => Promise.reject(new Error('ENOENT')),
  constants: { R_OK: 4 },
}));

// Mock os for homedir
jest.unstable_mockModule('node:os', () => ({
  homedir: () => '/home/testuser',
}));

// Mock LLMClient module
jest.unstable_mockModule('../../model/llm.js', () => {
  return {
    LLMClient: class {
      invoke = mockInvoke;
      stream = mockStream;
      getModel = mockGetModel;
      getModelName = mockGetModelName;
      getProviderName = mockGetProviderName;
    },
  };
});

// Import after all mocks are set up
const { Agent } = await import('../agent.js');

// Create mock async iterator for streaming
interface MockChunk {
  content: string;
}

function createMockStream(chunks: string[]): AsyncIterable<MockChunk> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<MockChunk> {
      let index = 0;
      return {
        next(): Promise<IteratorResult<MockChunk>> {
          if (index < chunks.length) {
            const chunk = chunks[index];
            index++;
            return Promise.resolve({
              done: false,
              value: { content: chunk },
            });
          }
          return Promise.resolve({ done: true, value: undefined });
        },
      };
    },
  };
}

describe('Agent', () => {
  let config: AppConfig;
  let callbacks: AgentCallbacks;

  beforeEach(() => {
    config = getDefaultConfig();
    config.providers.openai = { apiKey: 'test-key', model: 'gpt-4o' };
    config.providers.default = 'openai';

    callbacks = {
      onAgentStart: jest.fn(),
      onAgentEnd: jest.fn(),
      onError: jest.fn(),
      onLLMStart: jest.fn(),
      onLLMStream: jest.fn(),
      onLLMEnd: jest.fn(),
      onToolStart: jest.fn(),
      onToolEnd: jest.fn(),
      onSpinnerStart: jest.fn(),
      onSpinnerStop: jest.fn(),
      onDebug: jest.fn(),
      onTrace: jest.fn(),
    };

    jest.clearAllMocks();

    // Default mock responses
    mockGetModelName.mockReturnValue('gpt-4o');
    mockGetProviderName.mockReturnValue('openai');

    mockInvoke.mockResolvedValue({
      success: true,
      result: {
        content: 'Hello! How can I help you?',
        usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
      },
      message: 'Success',
    });

    mockStream.mockResolvedValue({
      success: true,
      result: createMockStream(['Hello', ' ', 'World', '!']),
      message: 'Success',
    });

    mockGetModel.mockReturnValue({
      success: false,
      error: 'PROVIDER_NOT_CONFIGURED',
      message: 'No model for test',
    });
  });

  describe('constructor', () => {
    it('creates agent with config', () => {
      const agent = new Agent({ config });
      expect(agent).toBeInstanceOf(Agent);
    });

    it('accepts optional callbacks', () => {
      const agent = new Agent({ config, callbacks });
      expect(agent).toBeInstanceOf(Agent);
    });

    it('accepts optional tools', () => {
      const mockTool = {
        name: 'test-tool',
        description: 'A test tool',
        invoke: jest.fn(),
      };
      const agent = new Agent({ config, tools: [mockTool as never] });
      expect(agent).toBeInstanceOf(Agent);
    });

    it('accepts system prompt override', () => {
      const agent = new Agent({
        config,
        systemPrompt: 'Custom system prompt',
      });
      expect(agent).toBeInstanceOf(Agent);
    });

    it('accepts max iterations option', () => {
      const agent = new Agent({
        config,
        maxIterations: 5,
      });
      expect(agent).toBeInstanceOf(Agent);
    });
  });

  describe('getModelName', () => {
    it('returns the model name from LLMClient', () => {
      const agent = new Agent({ config });
      expect(agent.getModelName()).toBe('gpt-4o');
    });
  });

  describe('getProviderName', () => {
    it('returns the provider name from LLMClient', () => {
      const agent = new Agent({ config });
      expect(agent.getProviderName()).toBe('openai');
    });
  });

  describe('run', () => {
    it('runs a simple query and returns response', async () => {
      const agent = new Agent({ config, callbacks });
      const result = await agent.run('Hello');

      expect(result).toBe('Hello! How can I help you?');
    });

    it('emits lifecycle callbacks in correct order', async () => {
      const agent = new Agent({ config, callbacks });
      await agent.run('Hello');

      // Check callback invocation order
      expect(callbacks.onAgentStart).toHaveBeenCalled();
      expect(callbacks.onSpinnerStart).toHaveBeenCalledWith('Thinking...');
      expect(callbacks.onLLMStart).toHaveBeenCalled();
      expect(callbacks.onLLMEnd).toHaveBeenCalled();
      expect(callbacks.onSpinnerStop).toHaveBeenCalled();
      expect(callbacks.onAgentEnd).toHaveBeenCalled();
    });

    it('passes query to onAgentStart callback', async () => {
      const agent = new Agent({ config, callbacks });
      await agent.run('Test query');

      expect(callbacks.onAgentStart).toHaveBeenCalledWith(
        expect.objectContaining({
          traceId: expect.any(String),
          spanId: expect.any(String),
        }),
        'Test query'
      );
    });

    it('passes response to onAgentEnd callback', async () => {
      const agent = new Agent({ config, callbacks });
      await agent.run('Hello');

      expect(callbacks.onAgentEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          traceId: expect.any(String),
          spanId: expect.any(String),
        }),
        'Hello! How can I help you?'
      );
    });

    it('handles LLM errors gracefully', async () => {
      mockInvoke.mockResolvedValue({
        success: false,
        error: 'NETWORK_ERROR',
        message: 'Network connection failed',
      });

      const agent = new Agent({ config, callbacks });
      const result = await agent.run('Hello');

      expect(result).toBe('Error: Network connection failed');
      expect(callbacks.onSpinnerStop).toHaveBeenCalled();
      expect(callbacks.onAgentEnd).toHaveBeenCalledWith(
        expect.any(Object),
        'Error: Network connection failed'
      );
      // Verify structured error is also emitted via onError callback
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({ traceId: expect.any(String) }),
        expect.objectContaining({
          success: false,
          error: 'NETWORK_ERROR',
          message: 'Network connection failed',
          metadata: expect.objectContaining({
            provider: 'openai',
            model: 'gpt-4o',
          }),
        })
      );
    });

    it('uses system prompt override when provided', async () => {
      const agent = new Agent({
        config,
        callbacks,
        systemPrompt: 'Custom prompt for testing',
      });

      await agent.run('Hello');

      // Verify LLMClient invoke was called (messages include system prompt)
      expect(mockInvoke).toHaveBeenCalled();
    });

    it('includes history in messages when provided', async () => {
      const agent = new Agent({ config, callbacks });
      const history: Message[] = [
        { role: 'user', content: 'Previous question' },
        { role: 'assistant', content: 'Previous answer' },
      ];

      await agent.run('Follow-up question', history);

      expect(mockInvoke).toHaveBeenCalled();
    });

    it('drops invalid tool messages from history and logs debug', async () => {
      const agent = new Agent({ config, callbacks });
      const history: Message[] = [
        { role: 'user', content: 'Use a tool' },
        { role: 'assistant', content: 'Using tool' },
        // Invalid tool message: missing toolCallId
        { role: 'tool', content: 'Tool result', name: 'some_tool' },
        { role: 'assistant', content: 'Final response' },
      ];

      await agent.run('Follow-up', history);

      // Should have logged debug about invalid tool message
      expect(callbacks.onDebug).toHaveBeenCalledWith(
        'Dropping invalid tool message: missing toolCallId',
        expect.objectContaining({ toolName: 'some_tool' })
      );
    });

    it('works without callbacks', async () => {
      const agent = new Agent({ config });
      const result = await agent.run('Hello');

      expect(result).toBe('Hello! How can I help you?');
    });

    it('handles exceptions during run', async () => {
      mockInvoke.mockRejectedValue(new Error('Unexpected error'));

      const agent = new Agent({ config, callbacks });
      const result = await agent.run('Hello');

      expect(result).toBe('Error: Unexpected error');
      expect(callbacks.onSpinnerStop).toHaveBeenCalled();
    });
  });

  describe('runStream', () => {
    it('yields response chunks', async () => {
      const agent = new Agent({ config, callbacks });
      const chunks: string[] = [];

      for await (const chunk of agent.runStream('Tell me a story')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' ', 'World', '!']);
    });

    it('emits lifecycle callbacks', async () => {
      const agent = new Agent({ config, callbacks });

      for await (const _chunk of agent.runStream('Hello')) {
        // Consume stream
      }

      expect(callbacks.onAgentStart).toHaveBeenCalled();
      expect(callbacks.onSpinnerStart).toHaveBeenCalled();
      expect(callbacks.onLLMStart).toHaveBeenCalled();
      expect(callbacks.onSpinnerStop).toHaveBeenCalled();
      expect(callbacks.onLLMEnd).toHaveBeenCalled();
      expect(callbacks.onAgentEnd).toHaveBeenCalled();
    });

    it('emits onLLMStream for each chunk', async () => {
      const agent = new Agent({ config, callbacks });

      for await (const _chunk of agent.runStream('Hello')) {
        // Consume stream
      }

      expect(callbacks.onLLMStream).toHaveBeenCalledTimes(4);
      expect(callbacks.onLLMStream).toHaveBeenCalledWith(expect.any(Object), 'Hello');
      expect(callbacks.onLLMStream).toHaveBeenCalledWith(expect.any(Object), ' ');
      expect(callbacks.onLLMStream).toHaveBeenCalledWith(expect.any(Object), 'World');
      expect(callbacks.onLLMStream).toHaveBeenCalledWith(expect.any(Object), '!');
    });

    it('handles stream errors gracefully', async () => {
      mockStream.mockResolvedValue({
        success: false,
        error: 'NETWORK_ERROR',
        message: 'Stream failed',
      });

      const agent = new Agent({ config, callbacks });
      const chunks: string[] = [];

      for await (const chunk of agent.runStream('Hello')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Error: Stream failed']);
    });

    it('handles exceptions during stream', async () => {
      mockStream.mockRejectedValue(new Error('Stream error'));

      const agent = new Agent({ config, callbacks });
      const chunks: string[] = [];

      for await (const chunk of agent.runStream('Hello')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Error: Stream error']);
    });

    it('includes history in stream messages', async () => {
      const agent = new Agent({ config, callbacks });
      const history: Message[] = [{ role: 'user', content: 'Previous' }];

      for await (const _chunk of agent.runStream('Current', history)) {
        // Consume stream
      }

      expect(mockStream).toHaveBeenCalled();
    });
  });

  describe('tool execution', () => {
    it('executes tools when model returns tool calls', async () => {
      // Create a mock tool
      const mockTool = {
        name: 'greeting',
        description: 'Greet someone',
        invoke: jest.fn().mockResolvedValue({
          success: true,
          result: { message: 'Hello, World!' },
          message: 'Greeted successfully',
        }),
      };

      // Set up model to return tool calls
      const mockModelWithTools = {
        invoke: jest
          .fn()
          .mockResolvedValueOnce(
            new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: 'call_123',
                  name: 'greeting',
                  args: { name: 'World' },
                },
              ],
            })
          )
          .mockResolvedValueOnce(new AIMessage({ content: 'I greeted World!' })),
        bindTools: jest.fn().mockReturnThis(),
      };

      mockGetModel.mockReturnValue({
        success: true,
        result: mockModelWithTools as unknown as BaseChatModel,
        message: 'Model retrieved',
      });

      const agent = new Agent({
        config,
        callbacks,
        tools: [mockTool as never],
      });

      const result = await agent.run('Say hello to World');

      expect(mockTool.invoke).toHaveBeenCalledWith({ name: 'World' });
      expect(callbacks.onToolStart).toHaveBeenCalledWith(expect.any(Object), 'greeting', {
        name: 'World',
      });
      expect(callbacks.onToolEnd).toHaveBeenCalled();
      expect(result).toBe('I greeted World!');
    });

    it('handles tool not found error', async () => {
      // Create a real tool, but have LLM call a different tool name
      const existingTool = {
        name: 'existing',
        description: 'An existing tool',
        invoke: jest.fn(),
      };

      // Set up model to return tool call for non-existent tool
      const mockModelWithTools = {
        invoke: jest
          .fn()
          .mockResolvedValueOnce(
            new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: 'call_123',
                  name: 'nonexistent',
                  args: {},
                },
              ],
            })
          )
          .mockResolvedValueOnce(new AIMessage({ content: 'Tool not found response' })),
        bindTools: jest.fn().mockReturnThis(),
      };

      mockGetModel.mockReturnValue({
        success: true,
        result: mockModelWithTools as unknown as BaseChatModel,
        message: 'Model retrieved',
      });

      const agent = new Agent({
        config,
        callbacks,
        tools: [existingTool as never], // Provide a tool so tool binding happens
      });

      await agent.run('Use the nonexistent tool');

      // onToolStart/End should NOT be called for missing tools
      // Instead, onDebug should log the missing tool
      expect(callbacks.onToolStart).not.toHaveBeenCalledWith(
        expect.any(Object),
        'nonexistent',
        expect.any(Object)
      );
      expect(callbacks.onToolEnd).not.toHaveBeenCalledWith(
        expect.any(Object),
        'nonexistent',
        expect.any(Object)
      );
      expect(callbacks.onDebug).toHaveBeenCalledWith(
        "Tool 'nonexistent' not found",
        expect.objectContaining({
          toolCall: expect.objectContaining({ name: 'nonexistent' }),
        })
      );
    });

    it('handles tool execution errors', async () => {
      const failingTool = {
        name: 'failing',
        description: 'A tool that fails',
        invoke: jest.fn().mockRejectedValue(new Error('Tool execution failed')),
      };

      const mockModelWithTools = {
        invoke: jest
          .fn()
          .mockResolvedValueOnce(
            new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: 'call_123',
                  name: 'failing',
                  args: {},
                },
              ],
            })
          )
          .mockResolvedValueOnce(new AIMessage({ content: 'Handled tool error' })),
        bindTools: jest.fn().mockReturnThis(),
      };

      mockGetModel.mockReturnValue({
        success: true,
        result: mockModelWithTools as unknown as BaseChatModel,
        message: 'Model retrieved',
      });

      const agent = new Agent({
        config,
        callbacks,
        tools: [failingTool as never],
      });

      await agent.run('Use the failing tool');

      expect(callbacks.onToolEnd).toHaveBeenCalledWith(
        expect.any(Object),
        'failing',
        expect.objectContaining({
          success: false,
          error: 'UNKNOWN',
          message: 'Tool execution failed',
        })
      );
    });

    it('respects max iterations limit', async () => {
      // Set up model to always return tool calls (infinite loop scenario)
      const mockModelWithTools = {
        invoke: jest.fn().mockResolvedValue(
          new AIMessage({
            content: '',
            tool_calls: [
              {
                id: 'call_123',
                name: 'loop',
                args: {},
              },
            ],
          })
        ),
        bindTools: jest.fn().mockReturnThis(),
      };

      mockGetModel.mockReturnValue({
        success: true,
        result: mockModelWithTools as unknown as BaseChatModel,
        message: 'Model retrieved',
      });

      const loopTool = {
        name: 'loop',
        description: 'Loop forever',
        invoke: jest.fn().mockResolvedValue({
          success: true,
          result: {},
          message: 'Looped',
        }),
      };

      const agent = new Agent({
        config,
        callbacks,
        tools: [loopTool as never],
        maxIterations: 3,
      });

      const result = await agent.run('Loop forever');

      expect(result).toBe('Error: Maximum iterations (3) reached');
      expect(mockModelWithTools.invoke).toHaveBeenCalledTimes(3);
    });
  });

  describe('span context', () => {
    it('creates unique trace IDs for each run', async () => {
      const traceIds: string[] = [];
      const trackingCallbacks: AgentCallbacks = {
        onAgentStart: (ctx: SpanContext) => {
          traceIds.push(ctx.traceId);
        },
      };

      const agent = new Agent({ config, callbacks: trackingCallbacks });

      await agent.run('First');
      await agent.run('Second');

      expect(traceIds).toHaveLength(2);
      expect(traceIds[0]).not.toBe(traceIds[1]);
    });

    it('creates child span contexts for LLM calls', async () => {
      const contexts: SpanContext[] = [];
      const trackingCallbacks: AgentCallbacks = {
        onAgentStart: (ctx: SpanContext) => {
          contexts.push({ ...ctx });
        },
        onLLMStart: (ctx: SpanContext) => {
          contexts.push({ ...ctx });
        },
      };

      const agent = new Agent({ config, callbacks: trackingCallbacks });
      await agent.run('Hello');

      expect(contexts).toHaveLength(2);
      // LLM context should have same trace ID but different span ID
      expect(contexts[1].traceId).toBe(contexts[0].traceId);
      expect(contexts[1].spanId).not.toBe(contexts[0].spanId);
      expect(contexts[1].parentSpanId).toBe(contexts[0].spanId);
    });
  });
});
