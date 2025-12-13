/**
 * Core Agent class - orchestrates LLM calls, tool execution, and answer generation.
 *
 * The Agent is the heart of the framework - the only layer that invokes the Model Layer.
 * It receives queries, assembles messages, binds tools, and coordinates the full
 * query -> LLM -> tool -> response cycle.
 */

import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  isAIMessage,
  isHumanMessage,
  isSystemMessage,
  isToolMessage,
} from '@langchain/core/messages';
import type { BaseMessage, AIMessageChunk } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Runnable } from '@langchain/core/runnables';
import type { AppConfig } from '../config/schema.js';
import type { ToolResponse } from '../tools/types.js';
import type { TokenUsage } from '../model/types.js';
import type { AgentOptions, Message, SpanContext } from './types.js';
import type { AgentCallbacks } from './callbacks.js';
import { LLMClient } from '../model/llm.js';
import { loadSystemPrompt } from './prompts.js';
import { createSpanContext, createChildSpanContext } from './callbacks.js';
import { extractTokenUsage } from '../model/base.js';

/** Default maximum iterations for tool execution loop */
const DEFAULT_MAX_ITERATIONS = 10;

/**
 * Tool call structure from LangChain AIMessage.
 */
interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * Core agent that orchestrates LLM calls, tool execution, and answer generation.
 *
 * @example
 * ```typescript
 * const agent = new Agent({
 *   config: appConfig,
 *   callbacks: {
 *     onLLMStart: (ctx, model) => console.log(`Calling ${model}...`),
 *     onToolStart: (ctx, name) => console.log(`Running ${name}...`),
 *   },
 *   tools: [helloTool, fileSystemTool],
 * });
 *
 * const answer = await agent.run('Say hello to Alice');
 * console.log(answer); // "Hello, Alice!"
 *
 * // Or with streaming:
 * for await (const chunk of agent.runStream('Tell me a story')) {
 *   process.stdout.write(chunk);
 * }
 * ```
 */
export class Agent {
  private readonly config: AppConfig;
  private readonly callbacks?: AgentCallbacks;
  private readonly tools: StructuredToolInterface[];
  private readonly llmClient: LLMClient;
  private readonly maxIterations: number;
  private systemPrompt: string = '';
  private initialized: boolean = false;

  constructor(options: AgentOptions) {
    this.config = options.config;
    this.callbacks = options.callbacks;
    this.tools = options.tools ?? [];
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;

    // Create LLMClient from config
    this.llmClient = new LLMClient({ config: this.config });

    // If system prompt override provided, use it directly
    if (options.systemPrompt !== undefined && options.systemPrompt !== '') {
      this.systemPrompt = options.systemPrompt;
      this.initialized = true;
    }
  }

  /**
   * Initialize agent (load system prompt).
   * Called automatically on first run() if not already initialized.
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load system prompt with three-tier fallback
    this.systemPrompt = await loadSystemPrompt({
      config: this.config,
      model: this.getModelName(),
      provider: this.getProviderName(),
    });

    this.initialized = true;
  }

  /**
   * Convert Message array to LangChain BaseMessage array.
   * Validates tool messages have required toolCallId (drops invalid ones with warning).
   */
  private convertMessages(messages: Message[]): BaseMessage[] {
    const result: BaseMessage[] = [];

    for (const msg of messages) {
      switch (msg.role) {
        case 'system':
          result.push(new SystemMessage(msg.content));
          break;
        case 'user':
          result.push(new HumanMessage(msg.content));
          break;
        case 'assistant':
          result.push(new AIMessage(msg.content));
          break;
        case 'tool':
          // Validate tool messages have required toolCallId
          if (msg.toolCallId === undefined || msg.toolCallId === '') {
            this.callbacks?.onDebug?.(`Dropping invalid tool message: missing toolCallId`, {
              toolName: msg.name,
              content: msg.content.substring(0, 100),
            });
            break; // Skip invalid tool message
          }
          result.push(
            new ToolMessage({
              content: msg.content,
              tool_call_id: msg.toolCallId,
              name: msg.name,
            })
          );
          break;
        default:
          result.push(new HumanMessage(msg.content));
      }
    }

    return result;
  }

  /**
   * Assemble messages for LLM call.
   * Combines system prompt, history, and current query.
   */
  private assembleMessages(query: string, history?: Message[]): BaseMessage[] {
    const messages: BaseMessage[] = [];

    // System prompt
    messages.push(new SystemMessage(this.systemPrompt));

    // History (if provided)
    if (history && history.length > 0) {
      messages.push(...this.convertMessages(history));
    }

    // Current query
    messages.push(new HumanMessage(query));

    return messages;
  }

  /**
   * Get model bound with tools for function calling.
   * Returns the LangChain model with tools bound if tools are available.
   */
  private getModelWithTools(): Runnable<BaseMessage[], AIMessage> | null {
    if (this.tools.length === 0) {
      return null;
    }

    const modelResponse = this.llmClient.getModel();
    if (!modelResponse.success) {
      this.callbacks?.onDebug?.('Failed to get model for tool binding', {
        error: modelResponse.message,
      });
      return null;
    }

    const model = modelResponse.result;

    // Check if model supports tool binding
    if (!('bindTools' in model)) {
      this.callbacks?.onDebug?.('Model does not support tool binding');
      return null;
    }

    // Bind tools to model
    return (
      model as BaseChatModel & {
        bindTools: (tools: StructuredToolInterface[]) => Runnable<BaseMessage[], AIMessage>;
      }
    ).bindTools(this.tools);
  }

  /**
   * Execute a tool by name with given arguments.
   */
  private async executeTool(
    toolCall: ToolCall,
    ctx: SpanContext
  ): Promise<{ name: string; result: ToolResponse; id: string }> {
    const tool = this.tools.find((t) => t.name === toolCall.name);

    if (!tool) {
      // Log debug event for missing tool (don't emit onToolStart/End for tools that won't run)
      this.callbacks?.onDebug?.(`Tool '${toolCall.name}' not found`, { toolCall });

      return {
        name: toolCall.name,
        id: toolCall.id,
        result: {
          success: false,
          error: 'NOT_FOUND',
          message: `Tool '${toolCall.name}' not found`,
        },
      };
    }

    // Emit tool start callback (only for tools that exist and will run)
    this.callbacks?.onToolStart?.(ctx, toolCall.name, toolCall.args);

    try {
      // Execute tool
      const result = (await tool.invoke(toolCall.args)) as ToolResponse;

      // Emit tool end callback
      this.callbacks?.onToolEnd?.(ctx, toolCall.name, result);

      return { name: toolCall.name, id: toolCall.id, result };
    } catch (error) {
      const errorResult: ToolResponse = {
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Unknown error',
      };

      this.callbacks?.onToolEnd?.(ctx, toolCall.name, errorResult);

      return { name: toolCall.name, id: toolCall.id, result: errorResult };
    }
  }

  /**
   * Parse tool calls from an AIMessage.
   */
  private parseToolCalls(message: AIMessage): ToolCall[] {
    const toolCalls = message.tool_calls;
    if (!toolCalls || !Array.isArray(toolCalls)) {
      return [];
    }

    return toolCalls.map((tc) => ({
      id: tc.id !== undefined ? tc.id : '',
      name: tc.name,
      args: tc.args as Record<string, unknown>,
    }));
  }

  /**
   * Run the agent with a query and return the final answer.
   *
   * @param query - User's input query
   * @param history - Optional conversation history
   * @returns Final answer string
   */
  async run(query: string, history?: Message[]): Promise<string> {
    // Ensure initialized
    await this.initialize();

    // Create root span context
    const rootCtx = createSpanContext();

    // Emit agent start
    this.callbacks?.onAgentStart?.(rootCtx, query);
    this.callbacks?.onSpinnerStart?.('Thinking...');
    this.callbacks?.onDebug?.('Agent.run started', { query, historyLength: history?.length ?? 0 });

    try {
      // Assemble messages
      let messages = this.assembleMessages(query, history);
      let iteration = 0;

      // Get model with tools if available
      const modelWithTools = this.getModelWithTools();
      const hasTools = modelWithTools !== null;

      // Main loop: invoke LLM, process tool calls, repeat until done
      while (iteration < this.maxIterations) {
        iteration++;
        const llmCtx = createChildSpanContext(rootCtx);

        // Convert messages to Message[] for callback
        const callbackMessages: Message[] = messages.map((m) => ({
          role: this.getMessageRole(m),
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        }));

        // Emit LLM start
        this.callbacks?.onLLMStart?.(llmCtx, this.getModelName(), callbackMessages);
        this.callbacks?.onDebug?.(`LLM iteration ${String(iteration)}`, {
          messageCount: messages.length,
        });

        let aiMessage: AIMessage;
        let usage: TokenUsage | undefined;

        if (hasTools) {
          // Use model with tools bound for function calling
          try {
            aiMessage = await modelWithTools.invoke(messages);
            // Extract usage from response metadata if available
            const metadata = aiMessage.response_metadata as Record<string, unknown> | undefined;
            usage = extractTokenUsage(metadata);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.callbacks?.onSpinnerStop?.();
            this.callbacks?.onAgentEnd?.(rootCtx, `Error: ${errorMsg}`);
            return `Error: ${errorMsg}`;
          }
        } else {
          // Use LLMClient for simple invocation
          const response = await this.llmClient.invoke(messages);

          if (!response.success) {
            this.callbacks?.onSpinnerStop?.();
            this.callbacks?.onAgentEnd?.(rootCtx, `Error: ${response.message}`);
            return `Error: ${response.message}`;
          }

          // Create AIMessage from response
          aiMessage = new AIMessage(response.result.content);
          usage = response.result.usage;
        }

        // Get content from message
        const content =
          typeof aiMessage.content === 'string'
            ? aiMessage.content
            : JSON.stringify(aiMessage.content);

        // Emit LLM end
        this.callbacks?.onLLMEnd?.(llmCtx, content, usage);

        // Check for tool calls
        const toolCalls = this.parseToolCalls(aiMessage);

        if (toolCalls.length === 0) {
          // No tool calls - we have the final answer
          this.callbacks?.onSpinnerStop?.();
          this.callbacks?.onAgentEnd?.(rootCtx, content);
          return content;
        }

        // Execute tool calls
        this.callbacks?.onDebug?.(`Executing ${String(toolCalls.length)} tool call(s)`, {
          tools: toolCalls.map((tc) => tc.name),
        });

        // Add assistant message with tool calls to messages
        messages = [...messages, aiMessage];

        // Execute each tool and add results to messages
        for (const toolCall of toolCalls) {
          const toolCtx = createChildSpanContext(rootCtx);
          const toolResult = await this.executeTool(toolCall, toolCtx);

          // Add tool result message
          const toolMessage = new ToolMessage({
            content: JSON.stringify(toolResult.result),
            tool_call_id: toolResult.id,
            name: toolResult.name,
          });
          messages = [...messages, toolMessage];
        }

        // Continue loop for next LLM call
      }

      // Max iterations reached
      const errorMsg = `Maximum iterations (${String(this.maxIterations)}) reached`;
      this.callbacks?.onSpinnerStop?.();
      this.callbacks?.onAgentEnd?.(rootCtx, errorMsg);
      return errorMsg;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.callbacks?.onSpinnerStop?.();
      this.callbacks?.onDebug?.('Agent.run error', { error: errorMsg });
      this.callbacks?.onAgentEnd?.(rootCtx, `Error: ${errorMsg}`);
      return `Error: ${errorMsg}`;
    }
  }

  /**
   * Run agent with streaming response.
   * Yields response chunks as they arrive from the LLM.
   *
   * Note: Streaming does not support tool calling. If tools are provided,
   * they will be ignored during streaming. Use run() for tool execution.
   *
   * @param query - User's input query
   * @param history - Optional conversation history
   * @yields Response chunks as strings
   */
  async *runStream(query: string, history?: Message[]): AsyncGenerator<string> {
    // Ensure initialized
    await this.initialize();

    // Create root span context
    const rootCtx = createSpanContext();

    // Emit agent start
    this.callbacks?.onAgentStart?.(rootCtx, query);
    this.callbacks?.onSpinnerStart?.('Thinking...');

    try {
      // Assemble messages
      const messages = this.assembleMessages(query, history);
      const llmCtx = createChildSpanContext(rootCtx);

      // Convert messages to Message[] for callback
      const callbackMessages: Message[] = messages.map((m) => ({
        role: this.getMessageRole(m),
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }));

      // Emit LLM start
      this.callbacks?.onLLMStart?.(llmCtx, this.getModelName(), callbackMessages);

      // Get stream from LLMClient
      const streamResponse = await this.llmClient.stream(messages);

      if (!streamResponse.success) {
        this.callbacks?.onSpinnerStop?.();
        yield `Error: ${streamResponse.message}`;
        return;
      }

      this.callbacks?.onSpinnerStop?.();

      // Yield chunks from stream
      let fullResponse = '';
      for await (const chunk of streamResponse.result as AsyncIterable<AIMessageChunk>) {
        const content = typeof chunk.content === 'string' ? chunk.content : '';
        if (content) {
          fullResponse += content;
          this.callbacks?.onLLMStream?.(llmCtx, content);
          yield content;
        }
      }

      // Emit LLM end
      this.callbacks?.onLLMEnd?.(llmCtx, fullResponse);
      this.callbacks?.onAgentEnd?.(rootCtx, fullResponse);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.callbacks?.onSpinnerStop?.();
      this.callbacks?.onAgentEnd?.(rootCtx, `Error: ${errorMsg}`);
      yield `Error: ${errorMsg}`;
    }
  }

  /**
   * Get message role from BaseMessage.
   */
  private getMessageRole(message: BaseMessage): Message['role'] {
    if (isSystemMessage(message)) {
      return 'system';
    }
    if (isHumanMessage(message)) {
      return 'user';
    }
    if (isAIMessage(message)) {
      return 'assistant';
    }
    if (isToolMessage(message)) {
      return 'tool';
    }
    return 'user';
  }

  /**
   * Get the current model name.
   */
  getModelName(): string {
    return this.llmClient.getModelName();
  }

  /**
   * Get the current provider name.
   */
  getProviderName(): string {
    return this.llmClient.getProviderName();
  }
}
