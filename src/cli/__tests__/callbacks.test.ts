/**
 * Tests for callback factory and telemetry wrapper.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { AgentCallbacks } from '../../agent/callbacks.js';
import type { SpanContext } from '../../agent/types.js';
import type { ToolResponse } from '../../tools/types.js';
import type { TokenUsage } from '../../model/types.js';

// Mock functions - defined at module level for hoisting
let mockIsEnabled: jest.Mock<() => boolean>;
let mockStartAgentSpan: jest.Mock;
let mockEndAgentSpan: jest.Mock;
let mockEndLLMSpan: jest.Mock;
let mockEndToolSpan: jest.Mock;
let mockTracerStartSpan: jest.Mock;

// Mock telemetry module before importing callbacks
jest.unstable_mockModule('../../telemetry/index.js', () => {
  // Create mocks inside the factory to avoid hoisting issues
  mockIsEnabled = jest.fn<() => boolean>();
  mockStartAgentSpan = jest.fn();
  mockEndAgentSpan = jest.fn();
  mockEndLLMSpan = jest.fn();
  mockEndToolSpan = jest.fn();

  // Create a shared mock for tracer.startSpan
  mockTracerStartSpan = jest.fn().mockReturnValue({
    setAttribute: jest.fn(),
    setStatus: jest.fn(),
    end: jest.fn(),
  });

  return {
    isEnabled: mockIsEnabled,
    startAgentSpan: mockStartAgentSpan,
    endAgentSpan: mockEndAgentSpan,
    endLLMSpan: mockEndLLMSpan,
    endToolSpan: mockEndToolSpan,
    // These don't need to be mocks - they're pass-through
    getSpanKey: (ctx: SpanContext) => `${ctx.traceId}:${ctx.spanId}`,
    mapProviderName: (name: string) => name,
    // Tracer mock - return the shared mock
    getTracer: () => ({
      startSpan: mockTracerStartSpan,
    }),
    // GenAI semantic convention constants
    ATTR_GEN_AI_OPERATION_NAME: 'gen_ai.operation.name',
    ATTR_GEN_AI_PROVIDER_NAME: 'gen_ai.provider.name',
    ATTR_GEN_AI_REQUEST_MODEL: 'gen_ai.request.model',
    ATTR_GEN_AI_INPUT_MESSAGES: 'gen_ai.request.messages',
    ATTR_GEN_AI_TOOL_NAME: 'gen_ai.tool.name',
    ATTR_GEN_AI_TOOL_CALL_ID: 'gen_ai.tool.call.id',
    ATTR_GEN_AI_TOOL_CALL_ARGUMENTS: 'gen_ai.tool.call.arguments',
    GEN_AI_OPERATION: {
      CHAT: 'chat',
      EXECUTE_TOOL: 'execute_tool',
      INVOKE_AGENT: 'invoke_agent',
    },
  };
});

// Import after mocking
const { createCallbacks, wrapWithTelemetry } = await import('../callbacks.js');

// Helper to create mock span context
function createMockSpanContext(): SpanContext {
  return {
    traceId: '12345678901234567890123456789012',
    spanId: '1234567890123456',
  };
}

// Helper to create a mock span
function createMockSpan(): {
  setAttribute: jest.Mock;
  setStatus: jest.Mock;
  end: jest.Mock;
} {
  return {
    setAttribute: jest.fn(),
    setStatus: jest.fn(),
    end: jest.fn(),
  };
}

describe('createCallbacks', () => {
  it('creates callbacks that update state', () => {
    const setSpinnerMessage = jest.fn();
    const setIsProcessing = jest.fn();
    const appendToOutput = jest.fn();
    const setError = jest.fn();

    const callbacks = createCallbacks({
      setSpinnerMessage,
      setIsProcessing,
      appendToOutput,
      setError,
    });

    // Test onSpinnerStart
    callbacks.onSpinnerStart?.('Loading...');
    expect(setSpinnerMessage).toHaveBeenCalledWith('Loading...');

    // Test onSpinnerStop
    callbacks.onSpinnerStop?.();
    expect(setSpinnerMessage).toHaveBeenCalledWith(null);

    // Test onLLMStream
    const ctx = createMockSpanContext();
    callbacks.onLLMStream?.(ctx, 'chunk');
    expect(appendToOutput).toHaveBeenCalledWith('chunk');
  });

  it('calls onComplete when agent ends', () => {
    const onComplete = jest.fn();
    const callbacks = createCallbacks({
      setSpinnerMessage: jest.fn(),
      setIsProcessing: jest.fn(),
      appendToOutput: jest.fn(),
      setError: jest.fn(),
      onComplete,
    });

    const ctx = createMockSpanContext();
    callbacks.onAgentEnd?.(ctx, 'Answer here');
    expect(onComplete).toHaveBeenCalledWith('Answer here');
  });

  it('tracks tool execution with addActiveTask and completeTask', () => {
    const addActiveTask = jest.fn();
    const completeTask = jest.fn();

    const callbacks = createCallbacks({
      setSpinnerMessage: jest.fn(),
      setIsProcessing: jest.fn(),
      appendToOutput: jest.fn(),
      setError: jest.fn(),
      addActiveTask,
      completeTask,
    });

    const ctx = createMockSpanContext();
    const args = { path: '/test' };

    callbacks.onToolStart?.(ctx, 'read_file', args);
    // Now includes primaryArg from generateToolSummary
    expect(addActiveTask).toHaveBeenCalledWith(ctx.spanId, 'read_file', args, expect.any(String));

    const result: ToolResponse = { success: true, result: { content: 'test' }, message: 'OK' };
    callbacks.onToolEnd?.(ctx, 'read_file', result);
    // Now also passes primaryArg, resultSummary, hasDetail from generateToolSummary
    expect(completeTask).toHaveBeenCalledWith(
      ctx.spanId,
      'read_file',
      true,
      0,
      undefined,
      expect.any(String),
      expect.any(String),
      expect.any(Boolean)
    );
  });

  it('marks tool as failed when executionResult has metadata.error', () => {
    const completeTask = jest.fn();

    const callbacks = createCallbacks({
      setSpinnerMessage: jest.fn(),
      setIsProcessing: jest.fn(),
      appendToOutput: jest.fn(),
      setError: jest.fn(),
      completeTask,
    });

    const ctx = createMockSpanContext();
    // Tool result shows success (legacy format), but executionResult has error
    const result: ToolResponse = { success: true, result: {}, message: 'OK' };
    const executionResult = {
      toolId: 'read_file',
      result: {
        title: 'Error: read_file',
        metadata: { error: 'NOT_FOUND' },
        output: 'Error: File not found',
      },
      timestamp: Date.now(),
      success: false,
      error: 'NOT_FOUND',
    };

    callbacks.onToolEnd?.(ctx, 'read_file', result, executionResult);
    // Should prefer executionResult.success and extract error from metadata
    // Now also passes primaryArg, resultSummary, hasDetail from generateToolSummary
    expect(completeTask).toHaveBeenCalledWith(
      ctx.spanId,
      'read_file',
      false,
      0,
      'NOT_FOUND',
      expect.any(String),
      expect.any(String),
      expect.any(Boolean)
    );
  });

  it('handles backward compatibility when executionResult is undefined', () => {
    const completeTask = jest.fn();

    const callbacks = createCallbacks({
      setSpinnerMessage: jest.fn(),
      setIsProcessing: jest.fn(),
      appendToOutput: jest.fn(),
      setError: jest.fn(),
      completeTask,
    });

    const ctx = createMockSpanContext();

    // Test success case with undefined executionResult (legacy)
    // Now also passes primaryArg, resultSummary, hasDetail from generateToolSummary
    const successResult: ToolResponse = { success: true, result: { data: 'test' }, message: 'OK' };
    callbacks.onToolEnd?.(ctx, 'read_file', successResult, undefined);
    expect(completeTask).toHaveBeenCalledWith(
      ctx.spanId,
      'read_file',
      true,
      0,
      undefined,
      expect.any(String),
      expect.any(String),
      expect.any(Boolean)
    );

    // Test error case with undefined executionResult (legacy)
    const errorResult: ToolResponse = {
      success: false,
      error: 'IO_ERROR',
      message: 'File not found',
    };
    callbacks.onToolEnd?.(ctx, 'write_file', errorResult, undefined);
    expect(completeTask).toHaveBeenCalledWith(
      ctx.spanId,
      'write_file',
      false,
      0,
      'File not found',
      expect.any(String),
      expect.any(String),
      expect.any(Boolean)
    );
  });

  it('updates token usage on LLM end', () => {
    const updateTokenUsage = jest.fn();

    const callbacks = createCallbacks({
      setSpinnerMessage: jest.fn(),
      setIsProcessing: jest.fn(),
      appendToOutput: jest.fn(),
      setError: jest.fn(),
      updateTokenUsage,
    });

    const ctx = createMockSpanContext();
    const usage: TokenUsage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };

    callbacks.onLLMEnd?.(ctx, 'Response', usage);
    expect(updateTokenUsage).toHaveBeenCalledWith({
      promptTokens: 100,
      completionTokens: 50,
      tokens: 150,
      queryCount: 1,
    });
  });
});

describe('wrapWithTelemetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns callbacks unchanged when telemetry is disabled', () => {
    mockIsEnabled.mockReturnValue(false);

    const baseCallbacks: AgentCallbacks = {
      onAgentStart: jest.fn(),
      onAgentEnd: jest.fn(),
    };

    const wrapped = wrapWithTelemetry(baseCallbacks, {
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    // Should be the exact same object
    expect(wrapped).toBe(baseCallbacks);
  });

  it('creates agent span on onAgentStart', () => {
    mockIsEnabled.mockReturnValue(true);
    const mockSpan = createMockSpan();
    mockStartAgentSpan.mockReturnValue(mockSpan);

    const baseOnAgentStart = jest.fn();
    const baseCallbacks: AgentCallbacks = {
      onAgentStart: baseOnAgentStart,
    };

    const wrapped = wrapWithTelemetry(baseCallbacks, {
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    const ctx = createMockSpanContext();
    wrapped.onAgentStart?.(ctx, 'Hello');

    expect(mockStartAgentSpan).toHaveBeenCalledWith({
      providerName: 'openai',
      modelName: 'gpt-4o',
      conversationId: undefined,
    });
    expect(baseOnAgentStart).toHaveBeenCalledWith(ctx, 'Hello');
  });

  it('ends agent span on onAgentEnd', () => {
    mockIsEnabled.mockReturnValue(true);
    const mockSpan = createMockSpan();
    mockStartAgentSpan.mockReturnValue(mockSpan);

    const baseOnAgentEnd = jest.fn();
    const baseCallbacks: AgentCallbacks = {
      onAgentStart: jest.fn(),
      onAgentEnd: baseOnAgentEnd,
    };

    const wrapped = wrapWithTelemetry(baseCallbacks, {
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    const ctx = createMockSpanContext();
    wrapped.onAgentStart?.(ctx, 'Hello');
    wrapped.onAgentEnd?.(ctx, 'World');

    expect(mockEndAgentSpan).toHaveBeenCalledWith(mockSpan);
    expect(baseOnAgentEnd).toHaveBeenCalledWith(ctx, 'World');
  });

  it('creates and ends LLM spans', () => {
    mockIsEnabled.mockReturnValue(true);
    const mockAgentSpan = createMockSpan();
    const mockLLMSpan = createMockSpan();
    mockStartAgentSpan.mockReturnValue(mockAgentSpan);
    mockTracerStartSpan.mockReturnValue(mockLLMSpan);

    const baseOnLLMStart = jest.fn();
    const baseOnLLMEnd = jest.fn();
    const baseCallbacks: AgentCallbacks = {
      onAgentStart: jest.fn(),
      onLLMStart: baseOnLLMStart,
      onLLMEnd: baseOnLLMEnd,
    };

    const wrapped = wrapWithTelemetry(baseCallbacks, {
      providerName: 'anthropic',
      modelName: 'claude-3',
    });

    const ctx = createMockSpanContext();
    const messages = [{ role: 'user' as const, content: 'Hi' }];
    const usage: TokenUsage = { promptTokens: 10, completionTokens: 20, totalTokens: 30 };

    wrapped.onAgentStart?.(ctx, 'Test');
    wrapped.onLLMStart?.(ctx, 'claude-3', messages);

    // Verify tracer.startSpan was called with correct span name
    expect(mockTracerStartSpan).toHaveBeenCalledWith(
      'chat claude-3',
      expect.objectContaining({
        kind: expect.any(Number), // SpanKind.CLIENT
        attributes: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'gen_ai.provider.name': 'anthropic',
          'gen_ai.request.model': 'claude-3',
        }),
      }),
      expect.anything() // parent context
    );
    expect(baseOnLLMStart).toHaveBeenCalledWith(ctx, 'claude-3', messages);

    wrapped.onLLMEnd?.(ctx, 'Response', usage);

    expect(mockEndLLMSpan).toHaveBeenCalledWith(mockLLMSpan, {
      inputTokens: 10,
      outputTokens: 20,
      enableSensitiveData: false,
      response: undefined,
    });
    expect(baseOnLLMEnd).toHaveBeenCalledWith(ctx, 'Response', usage);
  });

  it('creates and ends tool spans', () => {
    mockIsEnabled.mockReturnValue(true);
    const mockAgentSpan = createMockSpan();
    const mockToolSpan = createMockSpan();
    mockStartAgentSpan.mockReturnValue(mockAgentSpan);
    mockTracerStartSpan.mockReturnValue(mockToolSpan);

    const baseOnToolStart = jest.fn();
    const baseOnToolEnd = jest.fn();
    const baseCallbacks: AgentCallbacks = {
      onAgentStart: jest.fn(),
      onToolStart: baseOnToolStart,
      onToolEnd: baseOnToolEnd,
    };

    const wrapped = wrapWithTelemetry(baseCallbacks, {
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    const ctx = createMockSpanContext();
    const args = { path: '/test' };
    const result: ToolResponse = { success: true, result: { data: 'test' }, message: 'OK' };

    wrapped.onAgentStart?.(ctx, 'Test');
    mockTracerStartSpan.mockClear(); // Clear from agent span call
    wrapped.onToolStart?.(ctx, 'read_file', args);

    // Verify tracer.startSpan was called for tool span
    expect(mockTracerStartSpan).toHaveBeenCalledWith(
      'execute_tool read_file',
      expect.objectContaining({
        kind: expect.any(Number), // SpanKind.INTERNAL
        attributes: expect.objectContaining({
          'gen_ai.operation.name': 'execute_tool',
          'gen_ai.tool.name': 'read_file',
          'gen_ai.tool.call.id': ctx.spanId,
        }),
      }),
      expect.anything() // parent context
    );
    expect(baseOnToolStart).toHaveBeenCalledWith(ctx, 'read_file', args);

    wrapped.onToolEnd?.(ctx, 'read_file', result);

    expect(mockEndToolSpan).toHaveBeenCalledWith(mockToolSpan, {
      success: true,
      errorType: undefined,
      enableSensitiveData: false,
      result: undefined,
    });
    expect(baseOnToolEnd).toHaveBeenCalledWith(ctx, 'read_file', result, undefined);
  });

  it('records sensitive data when enabled', () => {
    mockIsEnabled.mockReturnValue(true);
    const mockLLMSpan = createMockSpan();
    mockStartAgentSpan.mockReturnValue(createMockSpan());
    mockTracerStartSpan.mockReturnValue(mockLLMSpan);

    const baseCallbacks: AgentCallbacks = {};

    const wrapped = wrapWithTelemetry(baseCallbacks, {
      providerName: 'openai',
      modelName: 'gpt-4o',
      enableSensitiveData: true,
    });

    const ctx = createMockSpanContext();
    const messages = [{ role: 'user' as const, content: 'Secret' }];

    wrapped.onAgentStart?.(ctx, 'Test');
    wrapped.onLLMStart?.(ctx, 'gpt-4o', messages);

    // Verify span.setAttribute was called with sensitive data
    expect(mockLLMSpan.setAttribute).toHaveBeenCalledWith(
      'gen_ai.request.messages',
      JSON.stringify([{ role: 'user', content: 'Secret' }])
    );
  });

  it('handles tool errors correctly', () => {
    mockIsEnabled.mockReturnValue(true);
    const mockToolSpan = createMockSpan();
    mockStartAgentSpan.mockReturnValue(createMockSpan());
    mockTracerStartSpan.mockReturnValue(mockToolSpan);

    const baseCallbacks: AgentCallbacks = {};

    const wrapped = wrapWithTelemetry(baseCallbacks, {
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    const ctx = createMockSpanContext();
    const errorResult: ToolResponse = {
      success: false,
      error: 'IO_ERROR',
      message: 'File not found',
    };

    wrapped.onAgentStart?.(ctx, 'Test');
    wrapped.onToolStart?.(ctx, 'read_file', { path: '/missing' });
    wrapped.onToolEnd?.(ctx, 'read_file', errorResult);

    expect(mockEndToolSpan).toHaveBeenCalledWith(mockToolSpan, {
      success: false,
      errorType: 'IO_ERROR',
      enableSensitiveData: false,
      result: undefined,
    });
  });
});
