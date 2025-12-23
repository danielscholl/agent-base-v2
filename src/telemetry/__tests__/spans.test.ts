/**
 * Tests for GenAI semantic convention span helpers.
 */

import { SpanStatusCode } from '@opentelemetry/api';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  initializeTelemetry,
  shutdown,
  startLLMSpan,
  endLLMSpan,
  startToolSpan,
  endToolSpan,
  startAgentSpan,
  endAgentSpan,
  getActiveSpan,
  withSpan,
  withSpanAsync,
  mapProviderName,
  createTracingState,
  createTracingCallbacks,
  getSpanKey,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_ERROR_TYPE,
  GEN_AI_OPERATION,
  GEN_AI_PROVIDER,
} from '../index.js';
import type { TelemetryConfig } from '../../config/schema.js';
import { initializeTestTelemetry, type SpanCapture } from './test-helpers.js';

// Default test config
const createTestConfig = (overrides: Partial<TelemetryConfig> = {}): TelemetryConfig => ({
  enabled: true,
  enableSensitiveData: false,
  otlpEndpoint: undefined,
  applicationinsightsConnectionString: undefined,
  ...overrides,
});

describe('GenAI Span Helpers', () => {
  beforeEach(async () => {
    // Initialize telemetry with no-op exporter for fast tests
    await initializeTelemetry({
      config: createTestConfig(),
      exporterType: 'none',
    });
  });

  afterEach(async () => {
    await shutdown();
  });

  describe('startLLMSpan', () => {
    it('creates span with required GenAI attributes', () => {
      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      expect(span).toBeDefined();
      // Span should have been created - attributes verified by integration test
      span.end();
    });

    it('creates span with optional temperature attribute', () => {
      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
        temperature: 0.7,
      });

      expect(span).toBeDefined();
      span.end();
    });

    it('creates span with optional maxTokens attribute', () => {
      const span = startLLMSpan({
        providerName: 'anthropic',
        modelName: 'claude-sonnet-4-5',
        maxTokens: 1000,
      });

      expect(span).toBeDefined();
      span.end();
    });

    it('creates span with custom operation name', () => {
      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'text-embedding-3-small',
        operationName: 'embeddings',
      });

      expect(span).toBeDefined();
      span.end();
    });

    it('does not include messages when enableSensitiveData is false', () => {
      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
        enableSensitiveData: false,
      });

      expect(span).toBeDefined();
      span.end();
    });

    it('includes messages when enableSensitiveData is true', () => {
      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
        enableSensitiveData: true,
      });

      expect(span).toBeDefined();
      span.end();
    });
  });

  describe('endLLMSpan', () => {
    it('ends span with token usage', () => {
      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      endLLMSpan(span, {
        inputTokens: 100,
        outputTokens: 50,
      });

      // Span should be ended without errors
    });

    it('ends span with error status', () => {
      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      endLLMSpan(span, {
        errorType: 'RateLimitError',
      });

      // Span should be ended with error status
    });

    it('ends span with response model', () => {
      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      endLLMSpan(span, {
        inputTokens: 100,
        outputTokens: 50,
        responseModel: 'gpt-4o-2024-11-20',
        finishReason: 'stop',
      });
    });

    it('ends span with no options (defaults to OK status)', () => {
      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      endLLMSpan(span);
      // Should complete without error
    });

    it('does not include response when enableSensitiveData is false', () => {
      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      // Response should NOT be recorded when enableSensitiveData is false/undefined
      endLLMSpan(span, {
        response: 'Hello, how can I help you?',
        enableSensitiveData: false,
      });
      // Span ends without recording sensitive response
    });

    it('includes response when enableSensitiveData is true', () => {
      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      endLLMSpan(span, {
        response: 'Hello, how can I help you?',
        enableSensitiveData: true,
      });
      // Span records response when explicitly enabled
    });

    it('does not include response when enableSensitiveData is not provided', () => {
      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      // Response should NOT be recorded when enableSensitiveData is undefined
      endLLMSpan(span, {
        response: 'Hello, how can I help you?',
      });
      // Span ends without recording sensitive response (secure by default)
    });
  });

  describe('startToolSpan', () => {
    it('creates span with tool name', () => {
      const span = startToolSpan({
        toolName: 'read_file',
      });

      expect(span).toBeDefined();
      span.end();
    });

    it('creates span with tool call ID', () => {
      const span = startToolSpan({
        toolName: 'write_file',
        toolCallId: 'call_abc123',
      });

      expect(span).toBeDefined();
      span.end();
    });

    it('does not include arguments when enableSensitiveData is false', () => {
      const span = startToolSpan({
        toolName: 'read_file',
        arguments: { path: '/etc/passwd' },
        enableSensitiveData: false,
      });

      expect(span).toBeDefined();
      span.end();
    });

    it('includes arguments when enableSensitiveData is true', () => {
      const span = startToolSpan({
        toolName: 'read_file',
        arguments: { path: '/etc/hosts' },
        enableSensitiveData: true,
      });

      expect(span).toBeDefined();
      span.end();
    });
  });

  describe('endToolSpan', () => {
    it('ends span with success status', () => {
      const span = startToolSpan({
        toolName: 'hello',
      });

      endToolSpan(span, {
        success: true,
      });
    });

    it('ends span with error status', () => {
      const span = startToolSpan({
        toolName: 'read_file',
      });

      endToolSpan(span, {
        success: false,
        errorType: 'FileNotFoundError',
      });
    });

    it('ends span with error but no errorType', () => {
      const span = startToolSpan({
        toolName: 'read_file',
      });

      endToolSpan(span, {
        success: false,
      });
      // Should use default error message
    });

    it('includes result when enableSensitiveData is true', () => {
      const span = startToolSpan({
        toolName: 'hello',
      });

      endToolSpan(span, {
        success: true,
        enableSensitiveData: true,
        result: { message: 'Hello, world!' },
      });
    });

    it('does not include result when enableSensitiveData is false', () => {
      const span = startToolSpan({
        toolName: 'hello',
      });

      endToolSpan(span, {
        success: true,
        enableSensitiveData: false,
        result: { message: 'Hello, world!' },
      });
    });
  });

  describe('startAgentSpan', () => {
    it('creates span with default operation name', () => {
      const span = startAgentSpan();

      expect(span).toBeDefined();
      span.end();
    });

    it('creates span with provider and model', () => {
      const span = startAgentSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
        conversationId: 'session-123',
      });

      expect(span).toBeDefined();
      span.end();
    });

    it('creates span with custom operation name', () => {
      const span = startAgentSpan({
        operationName: 'create_agent',
      });

      expect(span).toBeDefined();
      span.end();
    });
  });

  describe('endAgentSpan', () => {
    it('ends span with OK status', () => {
      const span = startAgentSpan();
      endAgentSpan(span);
    });

    it('ends span with error', () => {
      const span = startAgentSpan();
      endAgentSpan(span, 'MaxIterationsExceeded');
    });
  });

  describe('mapProviderName', () => {
    it('maps openai correctly', () => {
      expect(mapProviderName('openai')).toBe('openai');
    });

    it('maps azure to azure.ai.openai', () => {
      expect(mapProviderName('azure')).toBe('azure.ai.openai');
    });

    it('maps foundry to azure.ai.foundry', () => {
      expect(mapProviderName('foundry')).toBe('azure.ai.foundry');
    });

    it('maps anthropic correctly', () => {
      expect(mapProviderName('anthropic')).toBe('anthropic');
    });

    it('maps gemini to google.gemini', () => {
      expect(mapProviderName('gemini')).toBe('google.gemini');
    });

    it('maps github correctly', () => {
      expect(mapProviderName('github')).toBe('github');
    });

    it('maps local correctly', () => {
      expect(mapProviderName('local')).toBe('local');
    });

    it('returns unknown providers unchanged', () => {
      expect(mapProviderName('custom-provider')).toBe('custom-provider');
    });
  });

  describe('createTracingState', () => {
    it('creates empty state object', () => {
      const state = createTracingState();

      expect(state.agentSpan).toBeUndefined();
      expect(state.llmSpans).toBeInstanceOf(Map);
      expect(state.llmSpans.size).toBe(0);
      expect(state.toolSpans).toBeInstanceOf(Map);
      expect(state.toolSpans.size).toBe(0);
    });
  });

  describe('getSpanKey', () => {
    it('creates key from trace and span IDs', () => {
      const key = getSpanKey({
        traceId: 'abc123',
        spanId: 'def456',
      });

      expect(key).toBe('abc123:def456');
    });
  });

  describe('getActiveSpan', () => {
    it('returns undefined when no span is active', () => {
      const activeSpan = getActiveSpan();
      // Without explicit context propagation, this will be undefined
      expect(activeSpan).toBeUndefined();
    });
  });

  describe('withSpan', () => {
    it('executes function within span context', () => {
      const span = startAgentSpan();
      let executed = false;

      const result = withSpan(span, () => {
        executed = true;
        return 'result';
      });

      expect(executed).toBe(true);
      expect(result).toBe('result');
      span.end();
    });

    it('propagates return value', () => {
      const span = startAgentSpan();

      const result = withSpan(span, () => {
        return { value: 42 };
      });

      expect(result).toEqual({ value: 42 });
      span.end();
    });
  });

  describe('withSpanAsync', () => {
    it('executes async function within span context', async () => {
      const span = startAgentSpan();
      let executed = false;

      const result = await withSpanAsync(span, async () => {
        executed = true;
        await Promise.resolve();
        return 'async-result';
      });

      expect(executed).toBe(true);
      expect(result).toBe('async-result');
      span.end();
    });

    it('propagates async return value', async () => {
      const span = startAgentSpan();

      const result = await withSpanAsync(span, async () => {
        await Promise.resolve();
        return { asyncValue: 'test' };
      });

      expect(result).toEqual({ asyncValue: 'test' });
      span.end();
    });
  });
});

describe('GenAI Conventions Constants', () => {
  it('exports attribute constants', () => {
    expect(ATTR_GEN_AI_OPERATION_NAME).toBe('gen_ai.operation.name');
    expect(ATTR_GEN_AI_PROVIDER_NAME).toBe('gen_ai.provider.name');
    expect(ATTR_GEN_AI_REQUEST_MODEL).toBe('gen_ai.request.model');
    expect(ATTR_GEN_AI_TOOL_NAME).toBe('gen_ai.tool.name');
  });

  it('exports operation name constants', () => {
    expect(GEN_AI_OPERATION.CHAT).toBe('chat');
    expect(GEN_AI_OPERATION.TEXT_COMPLETION).toBe('text_completion');
    expect(GEN_AI_OPERATION.EMBEDDINGS).toBe('embeddings');
    expect(GEN_AI_OPERATION.EXECUTE_TOOL).toBe('execute_tool');
    expect(GEN_AI_OPERATION.CREATE_AGENT).toBe('create_agent');
    expect(GEN_AI_OPERATION.INVOKE_AGENT).toBe('invoke_agent');
  });

  it('exports provider name constants', () => {
    expect(GEN_AI_PROVIDER.OPENAI).toBe('openai');
    expect(GEN_AI_PROVIDER.ANTHROPIC).toBe('anthropic');
    expect(GEN_AI_PROVIDER.AZURE_OPENAI).toBe('azure.ai.openai');
    expect(GEN_AI_PROVIDER.AZURE_FOUNDRY).toBe('azure.ai.foundry');
    expect(GEN_AI_PROVIDER.GOOGLE_VERTEX).toBe('gcp.vertex_ai');
    expect(GEN_AI_PROVIDER.GOOGLE_GEMINI).toBe('google.gemini');
    expect(GEN_AI_PROVIDER.GITHUB).toBe('github');
    expect(GEN_AI_PROVIDER.LOCAL).toBe('local');
  });
});

describe('GenAI Spans Integration', () => {
  afterEach(async () => {
    await shutdown();
  });

  it('creates proper span hierarchy for agent run', async () => {
    await initializeTelemetry({
      config: createTestConfig(),
      exporterType: 'none',
    });

    // Simulate agent run with LLM call and tool execution
    const agentSpan = startAgentSpan({
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    // First LLM call
    const llmSpan1 = startLLMSpan({
      providerName: 'openai',
      modelName: 'gpt-4o',
      temperature: 0.7,
    });

    endLLMSpan(llmSpan1, {
      inputTokens: 150,
      outputTokens: 50,
      finishReason: 'tool_calls',
    });

    // Tool execution
    const toolSpan = startToolSpan({
      toolName: 'hello',
      toolCallId: 'call_123',
    });

    endToolSpan(toolSpan, {
      success: true,
    });

    // Second LLM call (with tool result)
    const llmSpan2 = startLLMSpan({
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    endLLMSpan(llmSpan2, {
      inputTokens: 200,
      outputTokens: 100,
      finishReason: 'stop',
    });

    // End agent span
    endAgentSpan(agentSpan);

    // If we get here without errors, the integration test passes
    expect(true).toBe(true);
  });

  it('handles error scenarios correctly', async () => {
    await initializeTelemetry({
      config: createTestConfig(),
      exporterType: 'none',
    });

    const agentSpan = startAgentSpan();

    const llmSpan = startLLMSpan({
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    // Simulate rate limit error
    endLLMSpan(llmSpan, {
      errorType: 'RateLimitError',
    });

    endAgentSpan(agentSpan, 'RateLimitError');

    expect(true).toBe(true);
  });

  it('handles concurrent tool spans', async () => {
    await initializeTelemetry({
      config: createTestConfig(),
      exporterType: 'none',
    });

    const agentSpan = startAgentSpan();

    // Start multiple tool spans concurrently
    const toolSpan1 = startToolSpan({
      toolName: 'tool_a',
      toolCallId: 'call_1',
    });

    const toolSpan2 = startToolSpan({
      toolName: 'tool_b',
      toolCallId: 'call_2',
    });

    const toolSpan3 = startToolSpan({
      toolName: 'tool_c',
      toolCallId: 'call_3',
    });

    // End them in different order
    endToolSpan(toolSpan2, { success: true });
    endToolSpan(toolSpan1, { success: false, errorType: 'TestError' });
    endToolSpan(toolSpan3, { success: true });

    endAgentSpan(agentSpan);

    expect(true).toBe(true);
  });

  it('works when telemetry is disabled', async () => {
    await initializeTelemetry({
      config: createTestConfig({ enabled: false }),
    });

    // All operations should work with no-op spans
    const agentSpan = startAgentSpan();
    const llmSpan = startLLMSpan({
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    endLLMSpan(llmSpan, { inputTokens: 100 });
    endAgentSpan(agentSpan);

    expect(true).toBe(true);
  });
});

describe('createTracingCallbacks', () => {
  beforeEach(async () => {
    await initializeTelemetry({
      config: createTestConfig(),
      exporterType: 'none',
    });
  });

  afterEach(async () => {
    await shutdown();
  });

  it('creates callbacks object with tracing wrappers', () => {
    const { callbacks, getState } = createTracingCallbacks({
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    expect(callbacks.onAgentStart).toBeDefined();
    expect(callbacks.onAgentEnd).toBeDefined();
    expect(callbacks.onLLMStart).toBeDefined();
    expect(callbacks.onLLMEnd).toBeDefined();
    expect(callbacks.onToolStart).toBeDefined();
    expect(callbacks.onToolEnd).toBeDefined();
    expect(getState).toBeInstanceOf(Function);
  });

  it('creates agent span on onAgentStart', () => {
    const { callbacks, getState } = createTracingCallbacks({
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    const ctx = { traceId: 'abc123', spanId: 'def456' };
    callbacks.onAgentStart?.(ctx, 'Hello');

    const state = getState();
    expect(state.agentSpan).toBeDefined();

    // Clean up
    callbacks.onAgentEnd?.(ctx, 'Done');
  });

  it('ends agent span on onAgentEnd', () => {
    const { callbacks, getState } = createTracingCallbacks({
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    const ctx = { traceId: 'abc123', spanId: 'def456' };
    callbacks.onAgentStart?.(ctx, 'Hello');
    callbacks.onAgentEnd?.(ctx, 'Done');

    const state = getState();
    expect(state.agentSpan).toBeUndefined();
  });

  it('creates LLM span on onLLMStart', () => {
    const { callbacks, getState } = createTracingCallbacks({
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    const agentCtx = { traceId: 'abc123', spanId: 'agent1' };
    const llmCtx = { traceId: 'abc123', spanId: 'llm1', parentSpanId: 'agent1' };

    callbacks.onAgentStart?.(agentCtx, 'Hello');
    callbacks.onLLMStart?.(llmCtx, 'gpt-4o', [{ role: 'user', content: 'Hi' }]);

    const state = getState();
    expect(state.llmSpans.size).toBe(1);
    expect(state.llmSpans.has('abc123:llm1')).toBe(true);

    // Clean up
    callbacks.onLLMEnd?.(llmCtx, 'Hello!', { promptTokens: 10, completionTokens: 5 });
    callbacks.onAgentEnd?.(agentCtx, 'Done');
  });

  it('ends LLM span on onLLMEnd', () => {
    const { callbacks, getState } = createTracingCallbacks({
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    const agentCtx = { traceId: 'abc123', spanId: 'agent1' };
    const llmCtx = { traceId: 'abc123', spanId: 'llm1', parentSpanId: 'agent1' };

    callbacks.onAgentStart?.(agentCtx, 'Hello');
    callbacks.onLLMStart?.(llmCtx, 'gpt-4o', [{ role: 'user', content: 'Hi' }]);
    callbacks.onLLMEnd?.(llmCtx, 'Hello!', { promptTokens: 10, completionTokens: 5 });

    const state = getState();
    expect(state.llmSpans.size).toBe(0);

    // Clean up
    callbacks.onAgentEnd?.(agentCtx, 'Done');
  });

  it('creates tool span on onToolStart', () => {
    const { callbacks, getState } = createTracingCallbacks({
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    const agentCtx = { traceId: 'abc123', spanId: 'agent1' };
    const toolCtx = { traceId: 'abc123', spanId: 'tool1', parentSpanId: 'agent1' };

    callbacks.onAgentStart?.(agentCtx, 'Hello');
    callbacks.onToolStart?.(toolCtx, 'hello_tool', { name: 'World' });

    const state = getState();
    expect(state.toolSpans.size).toBe(1);
    expect(state.toolSpans.has('abc123:tool1')).toBe(true);

    // Clean up
    callbacks.onToolEnd?.(toolCtx, 'hello_tool', { success: true, result: 'Hello, World!' });
    callbacks.onAgentEnd?.(agentCtx, 'Done');
  });

  it('ends tool span on onToolEnd', () => {
    const { callbacks, getState } = createTracingCallbacks({
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    const agentCtx = { traceId: 'abc123', spanId: 'agent1' };
    const toolCtx = { traceId: 'abc123', spanId: 'tool1', parentSpanId: 'agent1' };

    callbacks.onAgentStart?.(agentCtx, 'Hello');
    callbacks.onToolStart?.(toolCtx, 'hello_tool', { name: 'World' });
    callbacks.onToolEnd?.(toolCtx, 'hello_tool', { success: true, result: 'Hello, World!' });

    const state = getState();
    expect(state.toolSpans.size).toBe(0);

    // Clean up
    callbacks.onAgentEnd?.(agentCtx, 'Done');
  });

  it('wraps base callbacks and calls them', () => {
    let agentStartCalled = false;
    let agentEndCalled = false;
    let llmStartCalled = false;
    let llmEndCalled = false;
    let toolStartCalled = false;
    let toolEndCalled = false;

    const baseCallbacks = {
      onAgentStart: () => {
        agentStartCalled = true;
      },
      onAgentEnd: () => {
        agentEndCalled = true;
      },
      onLLMStart: () => {
        llmStartCalled = true;
      },
      onLLMEnd: () => {
        llmEndCalled = true;
      },
      onToolStart: () => {
        toolStartCalled = true;
      },
      onToolEnd: () => {
        toolEndCalled = true;
      },
    };

    const { callbacks } = createTracingCallbacks(
      {
        providerName: 'openai',
        modelName: 'gpt-4o',
      },
      baseCallbacks
    );

    const agentCtx = { traceId: 'abc123', spanId: 'agent1' };
    const llmCtx = { traceId: 'abc123', spanId: 'llm1' };
    const toolCtx = { traceId: 'abc123', spanId: 'tool1' };

    callbacks.onAgentStart?.(agentCtx, 'Hello');
    callbacks.onLLMStart?.(llmCtx, 'gpt-4o', []);
    callbacks.onLLMEnd?.(llmCtx, 'Response', {});
    callbacks.onToolStart?.(toolCtx, 'test', {});
    callbacks.onToolEnd?.(toolCtx, 'test', { success: true });
    callbacks.onAgentEnd?.(agentCtx, 'Done');

    expect(agentStartCalled).toBe(true);
    expect(agentEndCalled).toBe(true);
    expect(llmStartCalled).toBe(true);
    expect(llmEndCalled).toBe(true);
    expect(toolStartCalled).toBe(true);
    expect(toolEndCalled).toBe(true);
  });

  it('handles tool error status correctly', () => {
    const { callbacks, getState } = createTracingCallbacks({
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    const agentCtx = { traceId: 'abc123', spanId: 'agent1' };
    const toolCtx = { traceId: 'abc123', spanId: 'tool1' };

    callbacks.onAgentStart?.(agentCtx, 'Hello');
    callbacks.onToolStart?.(toolCtx, 'failing_tool', {});
    callbacks.onToolEnd?.(toolCtx, 'failing_tool', {
      success: false,
      error: 'FileNotFoundError',
    });

    const state = getState();
    expect(state.toolSpans.size).toBe(0); // Span was ended

    callbacks.onAgentEnd?.(agentCtx, 'Done');
  });

  it('respects conversationId option', () => {
    const { callbacks, getState } = createTracingCallbacks({
      providerName: 'openai',
      modelName: 'gpt-4o',
      conversationId: 'session-123',
    });

    const ctx = { traceId: 'abc123', spanId: 'agent1' };
    callbacks.onAgentStart?.(ctx, 'Hello');

    const state = getState();
    expect(state.agentSpan).toBeDefined();

    callbacks.onAgentEnd?.(ctx, 'Done');
  });

  it('handles multiple concurrent LLM spans', () => {
    const { callbacks, getState } = createTracingCallbacks({
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    const agentCtx = { traceId: 'abc123', spanId: 'agent1' };
    const llmCtx1 = { traceId: 'abc123', spanId: 'llm1' };
    const llmCtx2 = { traceId: 'abc123', spanId: 'llm2' };

    callbacks.onAgentStart?.(agentCtx, 'Hello');
    callbacks.onLLMStart?.(llmCtx1, 'gpt-4o', []);
    callbacks.onLLMStart?.(llmCtx2, 'gpt-4o', []);

    const state = getState();
    expect(state.llmSpans.size).toBe(2);

    callbacks.onLLMEnd?.(llmCtx1, 'Response 1', {});
    expect(getState().llmSpans.size).toBe(1);

    callbacks.onLLMEnd?.(llmCtx2, 'Response 2', {});
    expect(getState().llmSpans.size).toBe(0);

    callbacks.onAgentEnd?.(agentCtx, 'Done');
  });

  it('cleans up dangling LLM spans on agent end', () => {
    const { callbacks, getState } = createTracingCallbacks({
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    const agentCtx = { traceId: 'abc123', spanId: 'agent1' };
    const llmCtx = { traceId: 'abc123', spanId: 'llm1' };

    callbacks.onAgentStart?.(agentCtx, 'Hello');
    callbacks.onLLMStart?.(llmCtx, 'gpt-4o', [{ role: 'user', content: 'Hi' }]);

    // Simulate error scenario: onLLMEnd never called
    expect(getState().llmSpans.size).toBe(1);

    // onAgentEnd should clean up the dangling span
    callbacks.onAgentEnd?.(agentCtx, 'Error occurred');

    expect(getState().llmSpans.size).toBe(0);
    expect(getState().agentSpan).toBeUndefined();
  });

  it('cleans up dangling tool spans on agent end', () => {
    const { callbacks, getState } = createTracingCallbacks({
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    const agentCtx = { traceId: 'abc123', spanId: 'agent1' };
    const toolCtx = { traceId: 'abc123', spanId: 'tool1' };

    callbacks.onAgentStart?.(agentCtx, 'Hello');
    callbacks.onToolStart?.(toolCtx, 'my_tool', { arg: 'value' });

    // Simulate error scenario: onToolEnd never called
    expect(getState().toolSpans.size).toBe(1);

    // onAgentEnd should clean up the dangling span
    callbacks.onAgentEnd?.(agentCtx, 'Error occurred');

    expect(getState().toolSpans.size).toBe(0);
    expect(getState().agentSpan).toBeUndefined();
  });

  it('cleans up multiple dangling spans on agent end', () => {
    const { callbacks, getState } = createTracingCallbacks({
      providerName: 'openai',
      modelName: 'gpt-4o',
    });

    const agentCtx = { traceId: 'abc123', spanId: 'agent1' };
    const llmCtx1 = { traceId: 'abc123', spanId: 'llm1' };
    const llmCtx2 = { traceId: 'abc123', spanId: 'llm2' };
    const toolCtx = { traceId: 'abc123', spanId: 'tool1' };

    callbacks.onAgentStart?.(agentCtx, 'Hello');
    callbacks.onLLMStart?.(llmCtx1, 'gpt-4o', []);
    callbacks.onLLMStart?.(llmCtx2, 'gpt-4o', []);
    callbacks.onToolStart?.(toolCtx, 'my_tool', {});

    // Multiple dangling spans
    expect(getState().llmSpans.size).toBe(2);
    expect(getState().toolSpans.size).toBe(1);

    // onAgentEnd should clean up all dangling spans
    callbacks.onAgentEnd?.(agentCtx, 'Error occurred');

    expect(getState().llmSpans.size).toBe(0);
    expect(getState().toolSpans.size).toBe(0);
  });
});

// =============================================================================
// Attribute Validation Tests (using in-memory exporter)
// =============================================================================

describe('GenAI Span Attribute Validation', () => {
  let capture: SpanCapture;

  afterEach(async () => {
    // Always shutdown telemetry, even if capture wasn't properly assigned
    await shutdown();
  });

  describe('LLM Spans', () => {
    it('sets required GenAI attributes on LLM span', async () => {
      capture = await initializeTestTelemetry();

      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });
      span.end();

      expect(capture.getSpans()).toHaveLength(1);
      const llmSpan = capture.getFirstSpan();
      expect(llmSpan.name).toBe('chat gpt-4o');
      expect(capture.getAttribute(llmSpan, ATTR_GEN_AI_OPERATION_NAME)).toBe('chat');
      expect(capture.getAttribute(llmSpan, ATTR_GEN_AI_PROVIDER_NAME)).toBe('openai');
      expect(capture.getAttribute(llmSpan, ATTR_GEN_AI_REQUEST_MODEL)).toBe('gpt-4o');
    });

    it('sets optional temperature attribute when provided', async () => {
      capture = await initializeTestTelemetry();

      const span = startLLMSpan({
        providerName: 'anthropic',
        modelName: 'claude-sonnet-4-5',
        temperature: 0.7,
      });
      span.end();

      const recorded = capture.getFirstSpan();
      expect(capture.getAttribute(recorded, ATTR_GEN_AI_REQUEST_TEMPERATURE)).toBe(0.7);
    });

    it('sets optional maxTokens attribute when provided', async () => {
      capture = await initializeTestTelemetry();

      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
        maxTokens: 2048,
      });
      span.end();

      const recorded = capture.getFirstSpan();
      expect(capture.getAttribute(recorded, ATTR_GEN_AI_REQUEST_MAX_TOKENS)).toBe(2048);
    });

    it('sets custom operation name', async () => {
      capture = await initializeTestTelemetry();

      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'text-embedding-3-small',
        operationName: 'embeddings',
      });
      span.end();

      const recorded = capture.getFirstSpan();
      expect(recorded.name).toBe('embeddings text-embedding-3-small');
      expect(capture.getAttribute(recorded, ATTR_GEN_AI_OPERATION_NAME)).toBe('embeddings');
    });

    it('records input messages when enableSensitiveData is true', async () => {
      capture = await initializeTestTelemetry({ enableSensitiveData: true });

      const messages = [{ role: 'user', content: 'Hello' }];
      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
        messages,
        enableSensitiveData: true,
      });
      span.end();

      const recorded = capture.getFirstSpan();
      expect(capture.getAttribute(recorded, ATTR_GEN_AI_INPUT_MESSAGES)).toBe(
        JSON.stringify(messages)
      );
    });

    it('does NOT record input messages when enableSensitiveData is false', async () => {
      capture = await initializeTestTelemetry();

      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
        messages: [{ role: 'user', content: 'Secret' }],
        enableSensitiveData: false,
      });
      span.end();

      const recorded = capture.getFirstSpan();
      expect(capture.getAttribute(recorded, ATTR_GEN_AI_INPUT_MESSAGES)).toBeUndefined();
    });

    it('sets token usage on endLLMSpan', async () => {
      capture = await initializeTestTelemetry();

      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });
      endLLMSpan(span, {
        inputTokens: 150,
        outputTokens: 75,
      });

      const recorded = capture.getFirstSpan();
      expect(capture.getAttribute(recorded, ATTR_GEN_AI_USAGE_INPUT_TOKENS)).toBe(150);
      expect(capture.getAttribute(recorded, ATTR_GEN_AI_USAGE_OUTPUT_TOKENS)).toBe(75);
    });

    it('sets response model and finish reason on endLLMSpan', async () => {
      capture = await initializeTestTelemetry();

      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });
      endLLMSpan(span, {
        responseModel: 'gpt-4o-2024-11-20',
        finishReason: 'stop',
      });

      const recorded = capture.getFirstSpan();
      expect(capture.getAttribute(recorded, ATTR_GEN_AI_RESPONSE_MODEL)).toBe('gpt-4o-2024-11-20');
      expect(capture.getAttribute(recorded, ATTR_GEN_AI_RESPONSE_FINISH_REASONS)).toEqual(['stop']);
    });

    it('records response content only when enableSensitiveData is true', async () => {
      capture = await initializeTestTelemetry();

      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });
      endLLMSpan(span, {
        response: 'Hello! How can I help you?',
        enableSensitiveData: true,
      });

      const recorded = capture.getFirstSpan();
      expect(capture.getAttribute(recorded, ATTR_GEN_AI_OUTPUT_MESSAGES)).toBe(
        'Hello! How can I help you?'
      );
    });

    it('does NOT record response content when enableSensitiveData is false', async () => {
      capture = await initializeTestTelemetry();

      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });
      endLLMSpan(span, {
        response: 'Secret response',
        enableSensitiveData: false,
      });

      const recorded = capture.getFirstSpan();
      expect(capture.getAttribute(recorded, ATTR_GEN_AI_OUTPUT_MESSAGES)).toBeUndefined();
    });

    it('sets error status and error type on failure', async () => {
      capture = await initializeTestTelemetry();

      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });
      endLLMSpan(span, {
        errorType: 'RateLimitError',
      });

      const recorded = capture.getFirstSpan();
      expect(capture.getAttribute(recorded, ATTR_ERROR_TYPE)).toBe('RateLimitError');
      expect(recorded.status.code).toBe(SpanStatusCode.ERROR);
      expect(recorded.status.message).toBe('RateLimitError');
    });

    it('sets OK status on success', async () => {
      capture = await initializeTestTelemetry();

      const span = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });
      endLLMSpan(span, { inputTokens: 100 });

      const recorded = capture.getFirstSpan();
      expect(recorded.status.code).toBe(SpanStatusCode.OK);
    });
  });

  describe('Tool Spans', () => {
    it('sets required GenAI attributes on tool span', async () => {
      capture = await initializeTestTelemetry();

      const span = startToolSpan({
        toolName: 'read_file',
      });
      span.end();

      expect(capture.getSpans()).toHaveLength(1);
      const toolSpan = capture.getFirstSpan();
      expect(toolSpan.name).toBe('execute_tool read_file');
      expect(capture.getAttribute(toolSpan, ATTR_GEN_AI_OPERATION_NAME)).toBe('execute_tool');
      expect(capture.getAttribute(toolSpan, ATTR_GEN_AI_TOOL_NAME)).toBe('read_file');
    });

    it('sets tool call ID when provided', async () => {
      capture = await initializeTestTelemetry();

      const span = startToolSpan({
        toolName: 'write_file',
        toolCallId: 'call_abc123',
      });
      span.end();

      const recorded = capture.getFirstSpan();
      expect(capture.getAttribute(recorded, ATTR_GEN_AI_TOOL_CALL_ID)).toBe('call_abc123');
    });

    it('records arguments when enableSensitiveData is true', async () => {
      capture = await initializeTestTelemetry();

      const args = { path: '/etc/hosts', encoding: 'utf-8' };
      const span = startToolSpan({
        toolName: 'read_file',
        arguments: args,
        enableSensitiveData: true,
      });
      span.end();

      const recorded = capture.getFirstSpan();
      expect(capture.getAttribute(recorded, ATTR_GEN_AI_TOOL_CALL_ARGUMENTS)).toBe(
        JSON.stringify(args)
      );
    });

    it('does NOT record arguments when enableSensitiveData is false', async () => {
      capture = await initializeTestTelemetry();

      const span = startToolSpan({
        toolName: 'read_file',
        arguments: { path: '/secret/path' },
        enableSensitiveData: false,
      });
      span.end();

      const recorded = capture.getFirstSpan();
      expect(capture.getAttribute(recorded, ATTR_GEN_AI_TOOL_CALL_ARGUMENTS)).toBeUndefined();
    });

    it('records result when enableSensitiveData is true', async () => {
      capture = await initializeTestTelemetry();

      const span = startToolSpan({ toolName: 'hello' });
      const result = { message: 'Hello, World!' };
      endToolSpan(span, {
        success: true,
        enableSensitiveData: true,
        result,
      });

      const recorded = capture.getFirstSpan();
      expect(capture.getAttribute(recorded, ATTR_GEN_AI_TOOL_CALL_RESULT)).toBe(
        JSON.stringify(result)
      );
    });

    it('does NOT record result when enableSensitiveData is false', async () => {
      capture = await initializeTestTelemetry();

      const span = startToolSpan({ toolName: 'hello' });
      endToolSpan(span, {
        success: true,
        enableSensitiveData: false,
        result: { secret: 'data' },
      });

      const recorded = capture.getFirstSpan();
      expect(capture.getAttribute(recorded, ATTR_GEN_AI_TOOL_CALL_RESULT)).toBeUndefined();
    });

    it('sets error status and error type on failure', async () => {
      capture = await initializeTestTelemetry();

      const span = startToolSpan({ toolName: 'read_file' });
      endToolSpan(span, {
        success: false,
        errorType: 'FileNotFoundError',
      });

      const recorded = capture.getFirstSpan();
      expect(capture.getAttribute(recorded, ATTR_ERROR_TYPE)).toBe('FileNotFoundError');
      expect(recorded.status.code).toBe(SpanStatusCode.ERROR);
    });

    it('sets OK status on success', async () => {
      capture = await initializeTestTelemetry();

      const span = startToolSpan({ toolName: 'hello' });
      endToolSpan(span, { success: true });

      const recorded = capture.getFirstSpan();
      expect(recorded.status.code).toBe(SpanStatusCode.OK);
    });
  });

  describe('Agent Spans', () => {
    it('sets GenAI attributes on agent span', async () => {
      capture = await initializeTestTelemetry();

      const span = startAgentSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
        conversationId: 'session-123',
      });
      span.end();

      expect(capture.getSpans()).toHaveLength(1);
      const agentSpan = capture.getFirstSpan();
      // Span name follows GenAI convention: "{operation_name} {model_name}"
      expect(agentSpan.name).toBe('invoke_agent gpt-4o');
      expect(capture.getAttribute(agentSpan, ATTR_GEN_AI_OPERATION_NAME)).toBe('invoke_agent');
      expect(capture.getAttribute(agentSpan, ATTR_GEN_AI_PROVIDER_NAME)).toBe('openai');
      expect(capture.getAttribute(agentSpan, ATTR_GEN_AI_REQUEST_MODEL)).toBe('gpt-4o');
      expect(capture.getAttribute(agentSpan, ATTR_GEN_AI_CONVERSATION_ID)).toBe('session-123');
    });

    it('sets custom operation name', async () => {
      capture = await initializeTestTelemetry();

      const span = startAgentSpan({
        operationName: 'create_agent',
      });
      span.end();

      const recorded = capture.getFirstSpan();
      // Span name is just operation name when no model is provided
      expect(recorded.name).toBe('create_agent');
      expect(capture.getAttribute(recorded, ATTR_GEN_AI_OPERATION_NAME)).toBe('create_agent');
    });

    it('sets error status on failure', async () => {
      capture = await initializeTestTelemetry();

      const span = startAgentSpan();
      endAgentSpan(span, 'MaxIterationsExceeded');

      const recorded = capture.getFirstSpan();
      expect(capture.getAttribute(recorded, ATTR_ERROR_TYPE)).toBe('MaxIterationsExceeded');
      expect(recorded.status.code).toBe(SpanStatusCode.ERROR);
    });

    it('sets OK status on success', async () => {
      capture = await initializeTestTelemetry();

      const span = startAgentSpan();
      endAgentSpan(span);

      const recorded = capture.getFirstSpan();
      expect(recorded.status.code).toBe(SpanStatusCode.OK);
    });
  });

  describe('Span Hierarchy', () => {
    it('creates proper trace with agent, LLM, and tool spans', async () => {
      capture = await initializeTestTelemetry();

      // Simulate agent run
      const agentSpan = startAgentSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });

      const llmSpan = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
        temperature: 0.7,
      });
      endLLMSpan(llmSpan, {
        inputTokens: 100,
        outputTokens: 50,
        finishReason: 'tool_calls',
      });

      const toolSpan = startToolSpan({
        toolName: 'hello',
        toolCallId: 'call_123',
      });
      endToolSpan(toolSpan, { success: true });

      const llmSpan2 = startLLMSpan({
        providerName: 'openai',
        modelName: 'gpt-4o',
      });
      endLLMSpan(llmSpan2, {
        inputTokens: 200,
        outputTokens: 100,
        finishReason: 'stop',
      });

      endAgentSpan(agentSpan);

      const spans = capture.getSpans();
      expect(spans).toHaveLength(4);

      // Verify all spans have correct operation names
      const agentSpans = spans.filter(
        (s) => capture.getAttribute(s, ATTR_GEN_AI_OPERATION_NAME) === 'invoke_agent'
      );
      const llmSpans = spans.filter(
        (s) => capture.getAttribute(s, ATTR_GEN_AI_OPERATION_NAME) === 'chat'
      );
      const toolSpans = spans.filter(
        (s) => capture.getAttribute(s, ATTR_GEN_AI_OPERATION_NAME) === 'execute_tool'
      );

      expect(agentSpans).toHaveLength(1);
      expect(llmSpans).toHaveLength(2);
      expect(toolSpans).toHaveLength(1);
    });
  });
});
