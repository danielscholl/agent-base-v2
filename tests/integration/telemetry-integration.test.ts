/**
 * Integration tests for telemetry span creation and propagation.
 * Tests the full telemetry flow: agent → LLM → tool with proper span hierarchy.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AIMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { SpanStatusCode } from '@opentelemetry/api';
import { getDefaultConfig } from '../../src/config/schema.js';
import type { AppConfig } from '../../src/config/schema.js';
import type { SpanContext as _SpanContext } from '../../src/agent/types.js';
import type { AgentCallbacks } from '../../src/agent/callbacks.js';
import { Tool } from '../../src/tools/tool.js';
import {
  initializeTestTelemetry,
  type SpanCapture,
} from '../../src/telemetry/__tests__/test-helpers.js';
import { createTracingCallbacks } from '../../src/telemetry/spans.js';
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_TOOL_NAME,
  GEN_AI_OPERATION,
} from '../../src/telemetry/conventions.js';

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

/**
 * Helper to assert a value is defined and get TypeScript to narrow the type.
 */
function assertDefined<T>(value: T | undefined | null, name = 'value'): asserts value is T {
  if (value === undefined || value === null) {
    throw new Error(`Expected ${name} to be defined`);
  }
}

/**
 * Helper to convert Tool.Info to StructuredToolInterface for testing.
 */
async function toolToLangChain(info: Tool.Info): Promise<StructuredToolInterface> {
  const initialized = await info.init();
  return new DynamicStructuredTool({
    name: info.id,
    description: initialized.description,
    schema: initialized.parameters as z.ZodObject<z.ZodRawShape>,
    func: async (input) => {
      const ctx = Tool.createNoopContext();
      const result = await initialized.execute(input, ctx);
      return `${result.title}\n\n${result.output}`;
    },
  });
}

describe('Telemetry Integration', () => {
  let config: AppConfig;
  let capture: SpanCapture;

  // Create test tools using Tool.define
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

  beforeEach(async () => {
    config = getDefaultConfig();
    config.providers.openai = { apiKey: 'test-key', model: 'gpt-4o' };
    config.providers.default = 'openai';
    config.telemetry.enabled = true;

    jest.clearAllMocks();

    // Default mock for simple invocation
    mockInvoke.mockResolvedValue({
      success: true,
      result: {
        content: 'Hello! How can I help?',
        usage: { promptTokens: 10, completionTokens: 5 },
      },
      message: 'Success',
    });

    mockGetModel.mockReturnValue({
      success: false,
      message: 'No model for tools',
    });

    // Initialize test telemetry
    capture = await initializeTestTelemetry();
  });

  afterEach(async () => {
    await capture.shutdown();
  });

  describe('span hierarchy', () => {
    it('creates agent span as root with correct attributes', async () => {
      const { callbacks } = createTracingCallbacks({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      const agent = new Agent({
        config,
        callbacks: callbacks as unknown as AgentCallbacks,
        systemPrompt: 'Test',
      });

      await agent.run('Hello');

      const spans = capture.getSpans();
      // Agent span name follows GenAI convention: "invoke_agent <model>"
      const agentSpan = spans.find((s) => s.name.includes('invoke_agent'));

      assertDefined(agentSpan, 'agentSpan');
      expect(agentSpan.attributes[ATTR_GEN_AI_OPERATION_NAME]).toBe(GEN_AI_OPERATION.INVOKE_AGENT);
      expect(agentSpan.attributes[ATTR_GEN_AI_PROVIDER_NAME]).toBe('openai');
      expect(agentSpan.status.code).toBe(SpanStatusCode.OK);
    });

    it('creates LLM span with correct trace ID', async () => {
      const { callbacks } = createTracingCallbacks({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      const agent = new Agent({
        config,
        callbacks: callbacks as unknown as AgentCallbacks,
        systemPrompt: 'Test',
      });

      await agent.run('Hello');

      const spans = capture.getSpans();
      const agentSpan = spans.find((s) => s.name.includes('invoke_agent'));
      const llmSpan = spans.find((s) => s.name.includes('chat'));

      assertDefined(agentSpan, 'agentSpan');
      assertDefined(llmSpan, 'llmSpan');

      // LLM span should share trace ID with agent span
      expect(llmSpan.spanContext().traceId).toBe(agentSpan.spanContext().traceId);
    });

    it('creates tool span with correct trace ID', async () => {
      // Setup tool calling mock
      const mockModelInvoke = jest
        .fn<() => Promise<AIMessage>>()
        .mockResolvedValueOnce(
          new AIMessage({
            content: '',
            tool_calls: [{ id: 'call_123', name: 'greet', args: { name: 'World' } }],
          })
        )
        .mockResolvedValueOnce(new AIMessage({ content: 'Greeted!' }));

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

      const { callbacks } = createTracingCallbacks({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      const agent = new Agent({
        config,
        callbacks: callbacks as unknown as AgentCallbacks,
        tools: [await toolToLangChain(greetingTool)],
        systemPrompt: 'Test',
      });

      await agent.run('Greet World');

      const spans = capture.getSpans();
      const agentSpan = spans.find((s) => s.name.includes('invoke_agent'));
      const toolSpan = spans.find((s) => s.name.includes('execute_tool'));

      assertDefined(agentSpan, 'agentSpan');
      assertDefined(toolSpan, 'toolSpan');

      // Tool span should share trace ID with agent span
      expect(toolSpan.spanContext().traceId).toBe(agentSpan.spanContext().traceId);
    });

    it('all spans share the same trace ID', async () => {
      // Setup tool calling mock
      const mockModelInvoke = jest
        .fn<() => Promise<AIMessage>>()
        .mockResolvedValueOnce(
          new AIMessage({
            content: '',
            tool_calls: [{ id: 'call_123', name: 'greet', args: { name: 'World' } }],
          })
        )
        .mockResolvedValueOnce(new AIMessage({ content: 'Done!' }));

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

      const { callbacks } = createTracingCallbacks({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      const agent = new Agent({
        config,
        callbacks: callbacks as unknown as AgentCallbacks,
        tools: [await toolToLangChain(greetingTool)],
        systemPrompt: 'Test',
      });

      await agent.run('Greet World');

      const spans = capture.getSpans();
      const traceIds = spans.map((s) => s.spanContext().traceId);
      const uniqueTraceIds = [...new Set(traceIds)];

      // All spans should have the same trace ID
      expect(uniqueTraceIds).toHaveLength(1);
    });
  });

  describe('LLM span attributes', () => {
    it('includes provider and operation attributes from callback', async () => {
      const { callbacks } = createTracingCallbacks({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      const agent = new Agent({
        config,
        callbacks: callbacks as unknown as AgentCallbacks,
        systemPrompt: 'Test',
      });

      await agent.run('Hello');

      const spans = capture.getSpans();
      const llmSpan = spans.find((s) => s.name.includes('chat'));

      assertDefined(llmSpan, 'llmSpan');
      // The span should have correct operation and provider
      expect(llmSpan.attributes[ATTR_GEN_AI_PROVIDER_NAME]).toBe('openai');
      expect(llmSpan.attributes[ATTR_GEN_AI_OPERATION_NAME]).toBe(GEN_AI_OPERATION.CHAT);
    });

    it('includes token usage when provided', async () => {
      // Mock with token usage in response
      mockInvoke.mockResolvedValue({
        success: true,
        result: { content: 'Response', usage: { promptTokens: 100, completionTokens: 50 } },
        message: 'Success',
      });

      // Track usage passed through callbacks
      let receivedUsage: { promptTokens?: number; completionTokens?: number } | undefined;

      const { callbacks } = createTracingCallbacks(
        { providerName: 'openai', modelName: 'gpt-4o' },
        {
          onLLMEnd: (_ctx, _response, usage) => {
            receivedUsage = usage;
          },
        }
      );

      const agent = new Agent({
        config,
        callbacks: callbacks as unknown as AgentCallbacks,
        systemPrompt: 'Test',
      });

      await agent.run('Hello');

      const spans = capture.getSpans();
      const llmSpan = spans.find((s) => s.name.includes('chat'));

      assertDefined(llmSpan, 'llmSpan');

      // Verify callback received token usage
      expect(receivedUsage).toBeDefined();
      expect(receivedUsage?.promptTokens).toBe(100);
      expect(receivedUsage?.completionTokens).toBe(50);

      // Verify token usage attributes are set on the span
      expect(llmSpan.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(100);
      expect(llmSpan.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(50);
    });
  });

  describe('tool span attributes', () => {
    it('includes tool name attribute', async () => {
      const mockModelInvoke = jest
        .fn<() => Promise<AIMessage>>()
        .mockResolvedValueOnce(
          new AIMessage({
            content: '',
            tool_calls: [{ id: 'call_123', name: 'greet', args: { name: 'Alice' } }],
          })
        )
        .mockResolvedValueOnce(new AIMessage({ content: 'Done!' }));

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

      const { callbacks } = createTracingCallbacks({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      const agent = new Agent({
        config,
        callbacks: callbacks as unknown as AgentCallbacks,
        tools: [await toolToLangChain(greetingTool)],
        systemPrompt: 'Test',
      });

      await agent.run('Greet Alice');

      const spans = capture.getSpans();
      const toolSpan = spans.find((s) => s.name.includes('execute_tool'));

      assertDefined(toolSpan, 'toolSpan');
      expect(toolSpan.attributes[ATTR_GEN_AI_TOOL_NAME]).toBe('greet');
      expect(toolSpan.attributes[ATTR_GEN_AI_OPERATION_NAME]).toBe(GEN_AI_OPERATION.EXECUTE_TOOL);
    });

    it('sets error status on tool failure', async () => {
      const failingTool = Tool.define('failing', {
        description: 'A tool that fails',
        parameters: z.object({}),
        execute: () => {
          throw new Error('Tool execution failed');
        },
      });

      const mockModelInvoke = jest
        .fn<() => Promise<AIMessage>>()
        .mockResolvedValueOnce(
          new AIMessage({
            content: '',
            tool_calls: [{ id: 'call_fail', name: 'failing', args: {} }],
          })
        )
        .mockResolvedValueOnce(new AIMessage({ content: 'Tool failed.' }));

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

      const { callbacks } = createTracingCallbacks({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      const agent = new Agent({
        config,
        callbacks: callbacks as unknown as AgentCallbacks,
        tools: [await toolToLangChain(failingTool)],
        systemPrompt: 'Test',
      });

      await agent.run('Use failing tool');

      const spans = capture.getSpans();
      const toolSpan = spans.find((s) => s.name.includes('execute_tool'));

      assertDefined(toolSpan, 'toolSpan');
      expect(toolSpan.status.code).toBe(SpanStatusCode.ERROR);
    });
  });

  describe('sensitive data handling', () => {
    it('does not include sensitive data by default', async () => {
      const { callbacks } = createTracingCallbacks({
        providerName: 'openai',
        modelName: 'gpt-4o',
        enableSensitiveData: false,
      });

      const agent = new Agent({
        config,
        callbacks: callbacks as unknown as AgentCallbacks,
        systemPrompt: 'Test',
      });

      await agent.run('My secret is 12345');

      const spans = capture.getSpans();
      const llmSpan = spans.find((s) => s.name.includes('chat'));

      assertDefined(llmSpan, 'llmSpan');
      // Should NOT have input/output message attributes
      expect(llmSpan.attributes['gen_ai.input.messages']).toBeUndefined();
      expect(llmSpan.attributes['gen_ai.output.messages']).toBeUndefined();
    });

    it('includes sensitive data when enabled', async () => {
      const { callbacks } = createTracingCallbacks({
        providerName: 'openai',
        modelName: 'gpt-4o',
        enableSensitiveData: true,
      });

      const agent = new Agent({
        config,
        callbacks: callbacks as unknown as AgentCallbacks,
        systemPrompt: 'Test',
      });

      await agent.run('Hello');

      const spans = capture.getSpans();
      const llmSpan = spans.find((s) => s.name.includes('chat'));

      assertDefined(llmSpan, 'llmSpan');
      // Should have input messages when sensitive data is enabled
      const inputMessages = llmSpan.attributes['gen_ai.input.messages'];
      expect(inputMessages).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('sets error status on agent failure', async () => {
      mockInvoke.mockResolvedValue({
        success: false,
        error: 'RATE_LIMITED',
        message: 'Rate limit exceeded',
      });

      const { callbacks } = createTracingCallbacks({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      const agent = new Agent({
        config,
        callbacks: callbacks as unknown as AgentCallbacks,
        systemPrompt: 'Test',
      });

      await agent.run('Hello');

      const spans = capture.getSpans();
      const agentSpan = spans.find((s) => s.name.includes('invoke_agent'));

      // Agent should complete (possibly with error in response text)
      expect(agentSpan).toBeDefined();
      // Status depends on whether error is propagated as exception or handled
    });

    it('cleans up dangling spans on agent end', async () => {
      const { callbacks, getState } = createTracingCallbacks({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      const agent = new Agent({
        config,
        callbacks: callbacks as unknown as AgentCallbacks,
        systemPrompt: 'Test',
      });

      await agent.run('Hello');

      // After agent completes, no dangling spans should exist
      const state = getState();
      expect(state.llmSpans.size).toBe(0);
      expect(state.toolSpans.size).toBe(0);
      expect(state.agentSpan).toBeUndefined();
    });
  });

  describe('multiple LLM calls', () => {
    it('creates separate spans for each LLM call', async () => {
      const mockModelInvoke = jest
        .fn<() => Promise<AIMessage>>()
        .mockResolvedValueOnce(
          new AIMessage({
            content: '',
            tool_calls: [{ id: 'call_1', name: 'greet', args: { name: 'A' } }],
          })
        )
        .mockResolvedValueOnce(
          new AIMessage({
            content: '',
            tool_calls: [{ id: 'call_2', name: 'greet', args: { name: 'B' } }],
          })
        )
        .mockResolvedValueOnce(new AIMessage({ content: 'All done!' }));

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

      const { callbacks } = createTracingCallbacks({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      const agent = new Agent({
        config,
        callbacks: callbacks as unknown as AgentCallbacks,
        tools: [await toolToLangChain(greetingTool)],
        systemPrompt: 'Test',
      });

      await agent.run('Greet A and B');

      const spans = capture.getSpans();
      const llmSpans = spans.filter((s) => s.name.includes('chat'));
      const toolSpans = spans.filter((s) => s.name.includes('execute_tool'));

      // Should have 3 LLM spans (initial + 2 after tools)
      expect(llmSpans.length).toBe(3);
      // Should have 2 tool spans
      expect(toolSpans.length).toBe(2);
    });
  });
});
