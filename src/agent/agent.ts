/**
 * Core Agent class - orchestrates LLM calls, tool execution, and answer generation.
 *
 * The Agent is the heart of the framework - the only layer that invokes the Model Layer.
 * It receives queries, assembles messages, binds tools, and coordinates the full
 * query -> LLM -> tool -> response cycle.
 */

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage, AIMessageChunk } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools'; // Used for resolvedTools typing
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Runnable } from '@langchain/core/runnables';
import type { AppConfig } from '../config/schema.js';
import type { ToolResponse } from '../tools/types.js';
import type { TokenUsage } from '../model/types.js';
import type { AgentOptions, Message, SpanContext } from './types.js';
import type { AgentCallbacks } from './callbacks.js';
import type { AgentErrorCode, AgentErrorResponse, ProviderErrorMetadata } from '../errors/index.js';
import type { DiscoveredSkill, SkillLoaderOptions } from '../skills/types.js';
import type { ToolPermission } from '../tools/index.js';
import { Tool, ToolRegistry, initializeWorkspaceRoot } from '../tools/index.js';
import { LLMClient } from '../model/llm.js';
import { withRetry, mapErrorToCode, extractRetryAfter } from '../model/index.js';
import type { ModelResponse } from '../model/types.js';
import { assembleSystemPrompt, loadSkillsContext } from './prompts.js';
import { createSkillContextProvider } from '../skills/index.js';
import { createSpanContext, createChildSpanContext } from './callbacks.js';
import { extractTokenUsage, extractTextContent } from '../model/base.js';
import { errorResponse, mapModelErrorCodeToAgentErrorCode } from '../errors/index.js';

/** Default maximum iterations for tool execution loop (safety valve, not a constraint) */
const DEFAULT_MAX_ITERATIONS = 50;

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
 * Tools are automatically loaded from the ToolRegistry.
 *
 * @example
 * ```typescript
 * const agent = new Agent({
 *   config: appConfig,
 *   callbacks: {
 *     onLLMStart: (ctx, model) => console.log(`Calling ${model}...`),
 *     onToolStart: (ctx, name) => console.log(`Running ${name}...`),
 *   },
 * });
 *
 * const answer = await agent.run('Read the contents of README.md');
 * console.log(answer);
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
  private readonly llmClient: LLMClient;
  private readonly maxIterations: number;
  private readonly includeSkills: boolean;
  private readonly skillLoaderOptions?: SkillLoaderOptions;
  private readonly enabledPermissions: Set<ToolPermission>;
  private systemPrompt: string = '';
  private initialized: boolean = false;
  private discoveredSkills: DiscoveredSkill[] = [];
  private resolvedTools: StructuredToolInterface[] = [];
  private sessionId: string = '';
  private messageId: string = '';
  private abortController: AbortController | null = null;

  constructor(options: AgentOptions) {
    this.config = options.config;
    this.callbacks = options.callbacks;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.includeSkills = options.includeSkills !== false; // Default: true
    this.skillLoaderOptions = options.skillLoaderOptions;
    this.enabledPermissions =
      options.enabledPermissions ??
      new Set<ToolPermission>(['read', 'write', 'execute', 'network']);

    // Create LLMClient from config
    this.llmClient = new LLMClient({ config: this.config });

    // If system prompt override provided, use it directly
    // Note: initialized remains false to ensure resolveTools() is called
    if (options.systemPrompt !== undefined && options.systemPrompt !== '') {
      this.systemPrompt = options.systemPrompt;
    }
  }

  /**
   * Initialize agent (load system prompt, discover skills, resolve tools).
   * Called automatically on first run() if not already initialized.
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    // Generate session ID (once per agent lifetime)
    // Message ID is generated per turn in run()/runStream()
    this.sessionId = `session-${String(Date.now())}-${crypto.randomUUID().slice(0, 8)}`;

    // Initialize workspace root from config (respects env var as hard cap)
    // This ensures tools use the correct workspace before any tool calls
    const workspaceInit = await initializeWorkspaceRoot(
      this.config.agent.workspaceRoot,
      this.callbacks?.onDebug
    );
    if (workspaceInit.warning !== undefined) {
      // Emit warning through debug callback - config was ignored for security
      this.callbacks?.onDebug?.('Workspace initialization warning', {
        warning: workspaceInit.warning,
        effectiveRoot: workspaceInit.workspaceRoot,
      });
    }

    // Load system prompt if not already provided via constructor
    if (this.systemPrompt === '') {
      // Use compositional prompt assembly with provider layer and environment
      const basePrompt = await assembleSystemPrompt({
        config: this.config,
        model: this.getModelName(),
        provider: this.getProviderName(),
        providerMode: this.getProviderMode(),
        includeEnvironment: true,
        includeProviderLayer: true,
        workingDir: process.cwd(),
        onDebug: this.callbacks?.onDebug,
      });

      // Discover and filter skills if enabled
      if (this.includeSkills) {
        // Prepare skill loader options, merging config.skills with explicit options
        // Design: userDir, pluginsDir, plugins, and filtering options come from config.skills.
        // bundledDir is internal to the package and projectDir is auto-detected from cwd.
        // Both can still be overridden via skillLoaderOptions for testing or advanced use cases.
        const skillLoaderOptions: SkillLoaderOptions = {
          userDir: this.config.skills.userDir ?? this.skillLoaderOptions?.userDir,
          pluginsDir: this.config.skills.pluginsDir ?? this.skillLoaderOptions?.pluginsDir,
          plugins: this.config.skills.plugins,
          disabledBundled: this.config.skills.disabledBundled,
          enabledBundled: this.config.skills.enabledBundled,
          bundledDir: this.skillLoaderOptions?.bundledDir,
          projectDir: this.skillLoaderOptions?.projectDir,
          onDebug: this.skillLoaderOptions?.onDebug ?? this.callbacks?.onDebug,
        };

        // Discover all skills (loader handles filtering based on disabled/enabled config)
        const { skills: filteredSkills } = await loadSkillsContext(skillLoaderOptions);

        // Generate token-limited XML from filtered skills using SkillContextProvider
        // This applies the tier-1 token cap (~1000 tokens) to prevent context bloat
        const skillContextProvider = createSkillContextProvider(filteredSkills, {
          onDebug: this.callbacks?.onDebug,
        });
        const skillsXml = skillContextProvider.getTier1Context();

        // Combine base prompt with filtered skills XML
        this.systemPrompt = skillsXml ? `${basePrompt}\n\n${skillsXml}` : basePrompt;
        this.discoveredSkills = filteredSkills;

        this.callbacks?.onDebug?.('Agent initialized with skills', {
          skillCount: filteredSkills.length,
          skillNames: filteredSkills.map((s) => s.manifest.name),
        });
      } else {
        this.systemPrompt = basePrompt;
        this.discoveredSkills = [];

        this.callbacks?.onDebug?.('Agent initialized without skills');
      }
    } else {
      // System prompt was provided in constructor, skip skills
      this.discoveredSkills = [];
      this.callbacks?.onDebug?.('Agent initialized with custom system prompt');
    }

    // Resolve tools from registry and/or legacy tools
    await this.resolveTools();

    this.initialized = true;
  }

  /**
   * Resolve tools from ToolRegistry.
   */
  private async resolveTools(): Promise<void> {
    // Get tools from registry with proper context creation
    this.resolvedTools = await ToolRegistry.tools({
      enabledPermissions: this.enabledPermissions,
      initCtx: {
        workingDir: process.cwd(),
        onDebug: this.callbacks?.onDebug,
      },
      createContext: (toolId, callId) => this.createToolContext(toolId, callId),
    });

    this.callbacks?.onDebug?.('Resolved tools from registry', {
      count: this.resolvedTools.length,
      toolNames: this.resolvedTools.map((t) => t.name),
    });
  }

  /**
   * Create a Tool.Context for tool execution.
   * Uses the shared abort controller from the current run.
   */
  private createToolContext(toolId: string, callId: string): Tool.Context {
    // Ensure we have an abort controller (should be created by run())
    if (!this.abortController) {
      this.abortController = new AbortController();
    }

    return {
      sessionID: this.sessionId,
      messageID: this.messageId,
      agent: 'agent',
      abort: this.abortController.signal,
      callID: callId,
      metadata: (update) => {
        // Stream metadata updates via callback
        this.callbacks?.onDebug?.(`Tool metadata update: ${toolId}`, update);
      },
    };
  }

  /**
   * Abort the current run.
   * This will signal all running tools to stop.
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Get discovered skills (available after initialization).
   *
   * @returns Array of discovered skills
   */
  getDiscoveredSkills(): DiscoveredSkill[] {
    return this.discoveredSkills;
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
   * Check if the current provider supports tool/function calling.
   * Some local models (like Foundry local) don't support function calling.
   */
  private supportsToolCalling(): boolean {
    const providerName = this.config.providers.default;

    // Check if user explicitly configured function calling support
    const providerConfig = this.config.providers[providerName];
    if (providerConfig && 'supportsFunctionCalling' in providerConfig) {
      const supports = providerConfig.supportsFunctionCalling;
      if (supports !== undefined) {
        return supports;
      }
    }

    // Foundry local mode doesn't support function calling by default
    if (providerName === 'foundry') {
      const foundryConfig = this.config.providers.foundry;
      if (foundryConfig?.mode === 'local') {
        return false;
      }
    }

    // For other providers, default to true (assume function calling is supported)
    // Users can explicitly set supportsFunctionCalling: false in config for models that don't support it

    return true;
  }

  /**
   * Get model bound with tools for function calling.
   * Returns the LangChain model with tools bound if tools are available.
   */
  private async getModelWithTools(): Promise<Runnable<BaseMessage[], AIMessage> | null> {
    if (this.resolvedTools.length === 0) {
      return null;
    }

    // Skip tool binding for providers that don't support function calling
    if (!this.supportsToolCalling()) {
      this.callbacks?.onDebug?.(
        'Provider does not support function calling, skipping tool binding'
      );
      return null;
    }

    const modelResponse = await this.llmClient.getModel();
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
    ).bindTools(this.resolvedTools);
  }

  /**
   * Execute a tool by name with given arguments.
   * Returns the tool output as a string (for ToolMessage content).
   */
  private async executeTool(
    toolCall: ToolCall,
    ctx: SpanContext
  ): Promise<{ name: string; content: string; id: string }> {
    const tool = this.resolvedTools.find((t) => t.name === toolCall.name);

    if (!tool) {
      // Log debug event for missing tool (don't emit onToolStart/End for tools that won't run)
      this.callbacks?.onDebug?.(`Tool '${toolCall.name}' not found`, { toolCall });

      const errorResult: ToolResponse = {
        success: false,
        error: 'NOT_FOUND',
        message: `Tool '${toolCall.name}' not found`,
      };
      return {
        name: toolCall.name,
        id: toolCall.id,
        content: JSON.stringify(errorResult),
      };
    }

    // Emit tool start callback (only for tools that exist and will run)
    this.callbacks?.onToolStart?.(ctx, toolCall.name, toolCall.args);

    try {
      // Execute tool - result may be string (new tools) or ToolResponse (legacy tools)
      const rawResult: unknown = await tool.invoke(toolCall.args);

      // Normalize result to string content for ToolMessage
      let content: string;
      let callbackResult: ToolResponse;

      if (typeof rawResult === 'string') {
        // New tool format: plain string output
        content = rawResult;
        // Create a synthetic ToolResponse for callback compatibility
        callbackResult = {
          success: true,
          result: rawResult,
          message: 'Tool executed successfully',
        };
      } else {
        // Legacy tool format: ToolResponse object
        const toolResponse = rawResult as ToolResponse;
        content = JSON.stringify(toolResponse);
        callbackResult = toolResponse;
      }

      // Get execution result from registry
      const executionResult = ToolRegistry.getLastResult(toolCall.name);

      // Emit tool end callback with execution result
      this.callbacks?.onToolEnd?.(ctx, toolCall.name, callbackResult, executionResult);

      return { name: toolCall.name, id: toolCall.id, content };
    } catch (error) {
      const errorResult: ToolResponse = {
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Unknown error',
      };

      // Get execution result from registry (may have error info)
      const executionResult = ToolRegistry.getLastResult(toolCall.name);

      this.callbacks?.onToolEnd?.(ctx, toolCall.name, errorResult, executionResult);

      return { name: toolCall.name, id: toolCall.id, content: JSON.stringify(errorResult) };
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
   * Returns a plain string - either the LLM's answer or an error message prefixed with "Error:".
   * For structured error handling, subscribe to the `onError` callback which receives
   * `AgentErrorResponse` with error codes and metadata.
   *
   * @param query - User's input query
   * @param history - Optional conversation history
   * @returns Final answer string (or error message string prefixed with "Error:")
   */
  async run(query: string, history?: Message[]): Promise<string> {
    // Ensure initialized
    await this.initialize();

    // Create fresh abort controller for this run
    this.abortController = new AbortController();

    // Generate new message ID per turn (session ID is stable)
    this.messageId = `msg-${String(Date.now())}-${crypto.randomUUID().slice(0, 8)}`;

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
      const modelWithTools = await this.getModelWithTools();
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
          // Wrap invocation to convert exceptions to ModelResponse for retry compatibility
          const invokeWithTools = async (): Promise<ModelResponse<AIMessage>> => {
            try {
              const result = await modelWithTools.invoke(messages);
              return { success: true, result, message: 'Tool invocation succeeded' };
            } catch (error) {
              const errorCode = mapErrorToCode(error);
              const errorMsg = error instanceof Error ? error.message : 'Unknown error';
              const retryAfterMs = extractRetryAfter(error);
              return {
                success: false,
                error: errorCode,
                message: errorMsg,
                retryAfterMs,
              };
            }
          };

          // Apply retry logic if enabled (matches LLMClient.invoke behavior)
          const retryConfig = this.config.retry;
          let response: ModelResponse<AIMessage>;

          if (retryConfig.enabled) {
            response = await withRetry(invokeWithTools, {
              maxRetries: retryConfig.maxRetries,
              baseDelayMs: retryConfig.baseDelayMs,
              maxDelayMs: retryConfig.maxDelayMs,
              enableJitter: retryConfig.enableJitter,
              onRetry: (ctx) => {
                this.callbacks?.onDebug?.(
                  `Retrying tool LLM call (attempt ${String(ctx.attempt)}/${String(ctx.maxRetries)})`,
                  {
                    error: ctx.error,
                    delayMs: ctx.delayMs,
                  }
                );
              },
            });
          } else {
            response = await invokeWithTools();
          }

          if (!response.success) {
            const errorCode = mapModelErrorCodeToAgentErrorCode(response.error);
            this.callbacks?.onSpinnerStop?.();
            this.emitError(rootCtx, errorCode, response.message, {
              provider: this.getProviderName(),
              model: this.getModelName(),
            });
            return `Error: ${response.message}`;
          }

          aiMessage = response.result;
          // Extract usage from response metadata if available
          const responseMetadata = aiMessage.response_metadata as
            | Record<string, unknown>
            | undefined;
          usage = extractTokenUsage(responseMetadata);
        } else {
          // Use LLMClient for simple invocation
          const response = await this.llmClient.invoke(messages);

          if (!response.success) {
            this.callbacks?.onSpinnerStop?.();
            // Map model error code to agent error code for type safety
            this.emitError(
              rootCtx,
              mapModelErrorCodeToAgentErrorCode(response.error),
              response.message,
              {
                provider: this.getProviderName(),
                model: this.getModelName(),
              }
            );
            return `Error: ${response.message}`;
          }

          // Create AIMessage from response
          aiMessage = new AIMessage(response.result.content);
          usage = response.result.usage;
        }

        // Get content from message - handle both string and content block arrays (newer OpenAI models)
        const content = extractTextContent(aiMessage.content);

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

          // Check for LLM_ASSIST_REQUIRED signal from tools that need LLM help
          const assistRequest = this.parseLLMAssistRequest(toolResult.content);
          if (assistRequest !== undefined) {
            this.callbacks?.onDebug?.('LLM_ASSIST_REQUIRED detected', assistRequest);
            // Note: Full subagent spawning is future work - for now, pass through to LLM
            // The LLM will interpret the request and may provide assistance or guidance
          }

          // Add tool result message (content is already properly formatted)
          const toolMessage = new ToolMessage({
            content: toolResult.content,
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
      this.emitError(rootCtx, 'MAX_ITERATIONS_EXCEEDED', errorMsg);
      return `Error: ${errorMsg}`;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const errorCode = this.mapErrorToAgentErrorCode(error);
      this.callbacks?.onSpinnerStop?.();
      this.callbacks?.onDebug?.('Agent.run error', { error: errorMsg });
      this.emitError(rootCtx, errorCode, errorMsg, {
        provider: this.getProviderName(),
        model: this.getModelName(),
        originalError: error,
      });
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

    // Create fresh abort controller for this run
    this.abortController = new AbortController();

    // Generate new message ID per turn (session ID is stable)
    this.messageId = `msg-${String(Date.now())}-${crypto.randomUUID().slice(0, 8)}`;

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
        // Emit structured error with mapped error code for type safety
        this.emitError(
          rootCtx,
          mapModelErrorCodeToAgentErrorCode(streamResponse.error),
          streamResponse.message,
          {
            provider: this.getProviderName(),
            model: this.getModelName(),
          }
        );
        yield `Error: ${streamResponse.message}`;
        return;
      }

      this.callbacks?.onSpinnerStop?.();

      // Yield chunks from stream
      let fullResponse = '';
      for await (const chunk of streamResponse.result as AsyncIterable<AIMessageChunk>) {
        // Extract content from chunk - handle both string and content block arrays
        const content = extractTextContent(chunk.content);
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
      const errorCode = this.mapErrorToAgentErrorCode(error);
      this.callbacks?.onSpinnerStop?.();
      this.emitError(rootCtx, errorCode, errorMsg, {
        provider: this.getProviderName(),
        model: this.getModelName(),
        originalError: error,
      });
      yield `Error: ${errorMsg}`;
    }
  }

  /**
   * Get message role from BaseMessage.
   * Uses static .isInstance() methods (LangChain 1.x recommended approach).
   */
  private getMessageRole(message: BaseMessage): Message['role'] {
    if (SystemMessage.isInstance(message)) {
      return 'system';
    }
    if (HumanMessage.isInstance(message)) {
      return 'user';
    }
    if (AIMessage.isInstance(message)) {
      return 'assistant';
    }
    if (ToolMessage.isInstance(message)) {
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

  /**
   * Get the current provider mode (e.g., 'local', 'cloud').
   */
  getProviderMode(): string | undefined {
    return this.llmClient.getProviderMode();
  }

  /**
   * Emit an error via the onError callback and return an AgentErrorResponse.
   * Also emits the error message via onAgentEnd for backward compatibility.
   */
  private emitError(
    ctx: SpanContext,
    code: AgentErrorCode,
    message: string,
    metadata?: ProviderErrorMetadata
  ): AgentErrorResponse {
    const agentError = errorResponse(code, message, metadata);

    // Emit structured error via onError callback
    this.callbacks?.onError?.(ctx, agentError);

    // Emit string error via onAgentEnd for backward compatibility
    this.callbacks?.onAgentEnd?.(ctx, `Error: ${message}`);

    return agentError;
  }

  /**
   * Map an error to an AgentErrorCode based on error message patterns.
   */
  private mapErrorToAgentErrorCode(error: unknown): AgentErrorCode {
    if (!(error instanceof Error)) {
      return 'UNKNOWN';
    }

    const message = error.message.toLowerCase();

    if (
      message.includes('api key') ||
      message.includes('authentication') ||
      message.includes('unauthorized')
    ) {
      return 'AUTHENTICATION_ERROR';
    }
    if (
      message.includes('rate limit') ||
      message.includes('429') ||
      message.includes('too many requests')
    ) {
      return 'RATE_LIMITED';
    }
    if (message.includes('model') && message.includes('not found')) {
      return 'MODEL_NOT_FOUND';
    }
    if (
      message.includes('context length') ||
      message.includes('too long') ||
      message.includes('token limit')
    ) {
      return 'CONTEXT_LENGTH_EXCEEDED';
    }
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'TIMEOUT';
    }
    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('fetch failed')
    ) {
      return 'NETWORK_ERROR';
    }

    return 'UNKNOWN';
  }

  /**
   * Parse LLM assist request from tool output content.
   * Tool outputs may contain a structured request for LLM assistance.
   *
   * @returns Parsed request if content contains LLM_ASSIST_REQUIRED action, undefined otherwise
   */
  private parseLLMAssistRequest(content: string): LLMAssistRequest | undefined {
    // Try multiple parsing strategies for different content formats
    const tryParseAction = (text: string): LLMAssistRequest | undefined => {
      try {
        const parsed: unknown = JSON.parse(text);

        // Validate parsed value is a non-null object before accessing properties
        if (typeof parsed !== 'object' || parsed === null) {
          return undefined;
        }

        // Strategy A: Check for action: 'LLM_ASSIST_REQUIRED' (task tool format)
        // Robustly validate the object has 'action' property with expected value
        if (
          'action' in parsed &&
          typeof (parsed as Record<string, unknown>).action === 'string' &&
          (parsed as { action: string }).action === 'LLM_ASSIST_REQUIRED'
        ) {
          return parsed as LLMAssistRequest;
        }

        // Strategy B: Check for legacy ToolResponse format { error: 'LLM_ASSIST_REQUIRED' }
        // Robustly validate the object has 'error' property with expected value
        if (
          'error' in parsed &&
          typeof (parsed as Record<string, unknown>).error === 'string' &&
          (parsed as { error: string }).error === 'LLM_ASSIST_REQUIRED'
        ) {
          const legacy = parsed as { error: string; message?: string };
          return {
            action: 'LLM_ASSIST_REQUIRED',
            message: legacy.message,
          };
        }
      } catch {
        // Not valid JSON
      }
      return undefined;
    };

    // Strategy 1: Try parsing full content (legacy tools return plain JSON)
    const fromFull = tryParseAction(content);
    if (fromFull !== undefined) {
      return fromFull;
    }

    // Strategy 2: Try parsing after title separator (ToolRegistry format: "title\n\noutput")
    const separatorIndex = content.indexOf('\n\n');
    if (separatorIndex !== -1) {
      const outputPart = content.slice(separatorIndex + 2);
      const fromOutput = tryParseAction(outputPart);
      if (fromOutput !== undefined) {
        return fromOutput;
      }
    }

    return undefined;
  }
}

/**
 * LLM assist request structure emitted by tools that need LLM help.
 * Used by task delegation tool to signal subagent spawning.
 */
interface LLMAssistRequest {
  action: 'LLM_ASSIST_REQUIRED';
  taskType?: string;
  sessionID?: string;
  subagentType?: string;
  description?: string;
  prompt?: string;
  message?: string;
}
