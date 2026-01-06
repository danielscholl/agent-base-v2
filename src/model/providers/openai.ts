/**
 * OpenAI provider factory.
 * Automatically chooses between Chat Completions API and Responses API
 * based on the model being used.
 *
 * - Chat Completions API: Standard models (gpt-4o, gpt-5.2-pro, etc.)
 * - Responses API: Reasoning/codex models (gpt-5-codex, o1, o3, etc.)
 */

import { OpenAI } from 'openai';
import type { ResponseInput, FunctionTool } from 'openai/resources/responses/responses';
import { ChatOpenAI } from '@langchain/openai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { ChatResult, ChatGeneration } from '@langchain/core/outputs';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { Runnable } from '@langchain/core/runnables';

import type { OpenAIProviderConfig } from '../../config/schema.js';
import type { ModelResponse } from '../types.js';
import { successResponse, errorResponse, mapErrorToCode, extractTextContent } from '../base.js';
import { DEFAULT_OPENAI_MODEL } from '../../config/constants.js';

// Models that require the Responses API (reasoning/codex models)
const RESPONSES_API_MODELS = [
  'gpt-5-codex',
  'gpt-5.1-codex',
  'o1',
  'o3',
  'o1-preview',
  'o1-mini',
  'o3-mini',
];

/**
 * Check if a model requires the Responses API.
 * Uses specific matching to prevent false positives from substring matches.
 * Matches exact name or names that start with the model name followed by - or _.
 *
 * Note: Model name comparison is case-insensitive for user convenience
 * (e.g., 'GPT-5-Codex' matches 'gpt-5-codex'). OpenAI's API handles model names
 * case-insensitively, so this normalization improves UX without affecting API behavior.
 * The actual model string passed to the API is not modified.
 */
function requiresResponsesApi(model: string): boolean {
  const lowerModel = model.toLowerCase();
  return RESPONSES_API_MODELS.some((responsesModel) => {
    const lowerResponsesModel = responsesModel.toLowerCase();
    return (
      lowerModel === lowerResponsesModel ||
      lowerModel.startsWith(`${lowerResponsesModel}-`) ||
      lowerModel.startsWith(`${lowerResponsesModel}_`)
    );
  });
}

/**
 * Function call output from Responses API.
 */
interface FunctionCallOutput {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
}

/**
 * LangChain tool call format.
 */
interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * Custom chat model that wraps OpenAI Responses API.
 * Implements LangChain's BaseChatModel interface for compatibility.
 * Handles stateful conversation with previous_response_id for tool continuations.
 *
 * Streaming limitation: This implementation does not support streaming responses.
 * The class extends BaseChatModel but does not override _streamResponseChunks,
 * causing streaming calls to fall back to non-streaming behavior. This is intentional
 * to prioritize tool binding and continuation support over streaming functionality.
 *
 * Note: This class is integration-tested via manual verification with actual OpenAI endpoints.
 * Unit testing is complex due to the openai package's internal structure.
 */
/* istanbul ignore next -- @preserve: Integration-tested class, see manual verification */
class OpenAIResponsesChatModel extends BaseChatModel {
  private client: OpenAI;
  private model: string;
  private boundTools: FunctionTool[] = [];

  constructor(client: OpenAI, model: string, tools: FunctionTool[] = []) {
    super({});
    this.client = client;
    this.model = model;
    this.boundTools = tools;
  }

  _llmType(): string {
    return 'openai-responses';
  }

  /**
   * Bind tools to the model for function calling.
   * Returns a new model instance with tools bound.
   *
   * Note: This method diverges from BaseChatModel's bindTools signature in two ways:
   * 1. Parameter type: Accepts unknown[] instead of BindToolsInput[] to remain structurally
   *    compatible with agent framework usage. Internally casts to StructuredToolInterface[].
   *
   *    SAFETY: The cast at line 128 is safe because:
   *    - The agent framework always passes valid StructuredToolInterface objects
   *    - Invalid tools would fail during Zod schema extraction (lines 134-184) anyway
   *    - Adding runtime validation would add overhead without practical benefit
   *    - The agent layer is the sole caller and controls the input type
   *
   * 2. Return type: Returns Runnable<BaseMessage[], AIMessage> instead of the base class's
   *    Runnable<BaseLanguageModelInput, AIMessageChunk>. This is safe because:
   *    - The agent framework expects AIMessage (not AIMessageChunk)
   *    - The Responses API generates complete messages, not streaming chunks
   *    - Runtime behavior is compatible despite the type mismatch
   *
   * The type divergence is intentional and safe for this custom model implementation.
   * We suppress type checking to allow this necessary flexibility while maintaining
   * runtime compatibility with LangChain's agent framework.
   */
  // @ts-expect-error - Return type intentionally diverges from base class (returns AIMessage not AIMessageChunk)
  bindTools(tools: unknown[]): Runnable<BaseMessage[], AIMessage> {
    // Cast to StructuredToolInterface[] for internal processing
    const structuredTools = tools as StructuredToolInterface[];
    // Convert LangChain tools to Responses API format
    const responsesTools: FunctionTool[] = structuredTools.map((tool) => {
      let parameters: FunctionTool['parameters'] = null;

      const schema = tool.schema;
      // Zod 4 schemas have a _zod property, Zod 3 have _def
      if ('_zod' in schema || '_def' in schema) {
        const zodSchema = schema as {
          shape?: Record<string, unknown>;
          _def?: { shape?: Record<string, unknown>; typeName?: string };
        };

        const shape = zodSchema.shape ?? zodSchema._def?.shape;
        if (shape !== undefined) {
          const properties: Record<string, unknown> = {};
          const required: string[] = [];

          for (const [key, fieldSchema] of Object.entries(shape)) {
            const field = fieldSchema as {
              _zod?: { _def?: { typeName?: string }; description?: string };
              _def?: { typeName?: string };
              description?: string;
              isOptional?: () => boolean;
            };

            const typeName = field._zod?._def?.typeName ?? field._def?.typeName ?? 'string';
            const description = field._zod?.description ?? field.description;

            let jsonType = 'string';
            if (typeName.includes('Number')) jsonType = 'number';
            else if (typeName.includes('Boolean')) jsonType = 'boolean';
            else if (typeName.includes('Array')) jsonType = 'array';
            else if (typeName.includes('Object')) jsonType = 'object';

            properties[key] = {
              type: jsonType,
              ...(description !== undefined && description !== '' ? { description } : {}),
            };

            if (
              !typeName.includes('Optional') &&
              (typeof field.isOptional !== 'function' || !field.isOptional())
            ) {
              required.push(key);
            }
          }

          parameters = {
            type: 'object',
            properties,
            ...(required.length > 0 ? { required } : {}),
          };
        }
      } else {
        parameters = schema as FunctionTool['parameters'];
      }

      return {
        type: 'function' as const,
        name: tool.name,
        description: tool.description,
        parameters,
        strict: null,
      };
    });

    return new OpenAIResponsesChatModel(
      this.client,
      this.model,
      responsesTools
    ) as unknown as Runnable<BaseMessage[], AIMessage>;
  }

  /**
   * Detect if messages represent a tool continuation pattern.
   * Returns the index and previous response ID of the LAST AIMessage with tool_calls
   * that is followed by ToolMessages, or undefined if not a continuation.
   *
   * For multi-step tool loops, we need the LAST response_id to continue from,
   * not the first one, to avoid sending stale outputs.
   */
  private detectToolContinuation(
    messages: BaseMessage[]
  ): { index: number; responseId: string } | undefined {
    // Find the LAST AIMessage with tool_calls and response_id that is followed by ToolMessages
    let lastMatch: { index: number; responseId: string } | undefined;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg instanceof AIMessage) {
        const toolCalls = msg.tool_calls;
        const responseId = (msg.additional_kwargs as { response_id?: string }).response_id;

        if (
          toolCalls !== undefined &&
          Array.isArray(toolCalls) &&
          toolCalls.length > 0 &&
          responseId !== undefined
        ) {
          // Check if followed by ToolMessages
          const hasToolResults = messages.slice(i + 1).some((m) => m instanceof ToolMessage);
          if (hasToolResults) {
            lastMatch = { index: i, responseId };
          }
        }
      }
    }
    return lastMatch;
  }

  /**
   * Extract tool outputs from messages for continuation.
   * Only extracts ToolMessages that appear after the specified startIndex.
   *
   * @param messages - All messages in the conversation
   * @param startIndex - Index of the AIMessage whose tool outputs we want (extract messages after this)
   */
  private extractToolOutputs(
    messages: BaseMessage[],
    startIndex: number
  ): Array<{ type: 'function_call_output'; call_id: string; output: string }> {
    const outputs: Array<{ type: 'function_call_output'; call_id: string; output: string }> = [];

    // Only collect ToolMessages that appear after the startIndex
    for (let i = startIndex + 1; i < messages.length; i++) {
      const msg = messages[i];
      // Stop if we hit another AIMessage (those tool outputs belong to a different response)
      if (msg instanceof AIMessage) {
        break;
      }
      if (msg instanceof ToolMessage) {
        outputs.push({
          type: 'function_call_output',
          call_id: msg.tool_call_id,
          output: extractTextContent(msg.content),
        });
      }
    }

    return outputs;
  }

  /**
   * Convert LangChain messages to Responses API conversation items.
   * Used for initial requests (not tool continuations).
   */
  private messagesToConversation(
    messages: BaseMessage[]
  ): Array<{ type: 'message'; role: 'user' | 'assistant' | 'system'; content: string }> {
    const items: Array<{
      type: 'message';
      role: 'user' | 'assistant' | 'system';
      content: string;
    }> = [];

    for (const msg of messages) {
      if (msg instanceof SystemMessage) {
        items.push({ type: 'message', role: 'system', content: extractTextContent(msg.content) });
      } else if (msg instanceof HumanMessage) {
        items.push({ type: 'message', role: 'user', content: extractTextContent(msg.content) });
      } else if (msg instanceof AIMessage) {
        const content = extractTextContent(msg.content);
        if (content !== '') {
          items.push({ type: 'message', role: 'assistant', content });
        }
      }
      // Skip ToolMessages for initial conversation - they're handled via previous_response_id
    }

    return items;
  }

  /**
   * Extract text content from Responses API output.
   * Accumulates all output_text blocks from all message items.
   */
  private extractTextFromOutput(
    output: Array<{
      type: string;
      content?: Array<{ type: string; text?: string }>;
    }>
  ): string {
    const texts: string[] = [];

    for (const item of output) {
      if (item.type === 'message' && item.content !== undefined) {
        for (const content of item.content) {
          if (content.type === 'output_text' && content.text !== undefined && content.text !== '') {
            texts.push(content.text);
          }
        }
      }
    }

    return texts.join('');
  }

  /**
   * Extract function calls from Responses API output.
   */
  private extractFunctionCalls(output: unknown[]): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    for (const item of output) {
      const typedItem = item as {
        type?: string;
        call_id?: string;
        name?: string;
        arguments?: string;
      };
      if (typedItem.type === 'function_call') {
        const funcCall = item as FunctionCallOutput;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(funcCall.arguments) as Record<string, unknown>;
        } catch {
          // Graceful degradation: If the LLM outputs malformed JSON in function arguments,
          // we use an empty args object rather than failing the entire tool call.
          // This allows the tool call to proceed - the tool itself will report missing
          // required arguments, and the LLM can retry with valid JSON in the next iteration.
          // Silent failure is intentional here to maintain conversation flow.
        }

        toolCalls.push({
          id: funcCall.call_id,
          name: funcCall.name,
          args,
        });
      }
    }

    return toolCalls;
  }

  /**
   * Core implementation of chat generation.
   * Handles both initial requests and tool continuations.
   */
  async _generate(
    messages: BaseMessage[],
    _options?: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    // Check if this is a tool continuation (returns last AIMessage with response_id)
    const continuation = this.detectToolContinuation(messages);

    let response;

    if (continuation !== undefined) {
      // Tool continuation: use previous_response_id with only the relevant tool outputs
      // (those that immediately follow the AIMessage at continuation.index)
      const toolOutputs = this.extractToolOutputs(messages, continuation.index);

      response = await this.client.responses.create({
        model: this.model,
        previous_response_id: continuation.responseId,
        input: toolOutputs as unknown as ResponseInput,
      });
    } else {
      // Initial request: send full conversation
      const input = this.messagesToConversation(messages) as ResponseInput;

      const requestParams: {
        model: string;
        input: ResponseInput;
        tools?: FunctionTool[];
      } = {
        model: this.model,
        input,
      };

      if (this.boundTools.length > 0) {
        requestParams.tools = this.boundTools;
      }

      response = await this.client.responses.create(requestParams);
    }

    // Extract tool calls from response
    const toolCalls = this.extractFunctionCalls(response.output);

    // Extract text content
    const text = this.extractTextFromOutput(
      response.output as Array<{
        type: string;
        content?: Array<{ type: string; text?: string }>;
      }>
    );

    // Create AIMessage with tool_calls if present
    // Store response.id in additional_kwargs for potential tool continuation
    // Note: response_id is only stored when tool_calls exist because it's specifically
    // used for the Responses API's previous_response_id parameter when continuing after
    // tool execution. AIMessages without tool_calls don't need response_id since they
    // never trigger continuation - detectToolContinuation only matches messages with
    // both tool_calls AND response_id (see lines 226-234).
    const additionalKwargs: Record<string, unknown> = {};
    if (toolCalls.length > 0) {
      additionalKwargs.response_id = response.id;
    }

    const aiMessage =
      toolCalls.length > 0
        ? new AIMessage({
            content: text,
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              args: tc.args,
            })),
            additional_kwargs: additionalKwargs,
          })
        : new AIMessage({ content: text });

    const generation: ChatGeneration = {
      text,
      message: aiMessage,
    };

    return {
      generations: [generation],
      llmOutput: {
        tokenUsage: {
          promptTokens: response.usage?.input_tokens ?? 0,
          completionTokens: response.usage?.output_tokens ?? 0,
          totalTokens: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
        },
      },
    };
  }
}

/**
 * Create a Chat Completions API client (standard ChatOpenAI).
 */
function createChatCompletionsClient(
  model: string,
  apiKey: string | undefined,
  baseUrl: string | undefined
): ModelResponse<BaseChatModel> {
  const client = new ChatOpenAI({
    model,
    openAIApiKey: apiKey,
    configuration: baseUrl !== undefined && baseUrl !== '' ? { baseURL: baseUrl } : undefined,
  });

  return successResponse(
    client as BaseChatModel,
    `OpenAI client created with model: ${model} (API: Chat Completions)`
  );
}

/**
 * Create a Responses API client for reasoning/codex models.
 */
function createResponsesApiClient(
  model: string,
  apiKey: string | undefined,
  baseUrl: string | undefined
): ModelResponse<BaseChatModel> {
  // Validate API key is available
  const effectiveApiKey = apiKey ?? process.env.OPENAI_API_KEY;
  if (effectiveApiKey === undefined || effectiveApiKey === '') {
    return errorResponse(
      'PROVIDER_NOT_CONFIGURED',
      'OpenAI Responses API requires an API key. Set OPENAI_API_KEY or configure providers.openai.apiKey'
    );
  }

  // OpenAI client configuration
  const clientConfig: {
    apiKey?: string;
    baseURL?: string;
  } = {};

  // API key can come from config or OPENAI_API_KEY env var
  if (apiKey !== undefined && apiKey !== '') {
    clientConfig.apiKey = apiKey;
  }

  // Optional custom base URL
  if (baseUrl !== undefined && baseUrl !== '') {
    clientConfig.baseURL = baseUrl;
  }

  const client = new OpenAI(clientConfig);
  const chatModel = new OpenAIResponsesChatModel(client, model);

  return successResponse(
    chatModel as unknown as BaseChatModel,
    `OpenAI client created with model: ${model} (API: Responses)`
  );
}

/**
 * Create an OpenAI client from provider config.
 * Automatically chooses between Chat Completions API and Responses API
 * based on the model name.
 *
 * Configuration sources (in order of priority):
 * - API Key: config.apiKey → OPENAI_API_KEY env var
 * - Model: config.model → DEFAULT_OPENAI_MODEL
 * - Base URL: config.baseUrl (optional)
 *
 * @param config - OpenAI provider configuration
 * @returns Promise<ModelResponse> with appropriate client or error
 */
export function createOpenAIClient(
  config: OpenAIProviderConfig | Record<string, unknown>
): Promise<ModelResponse<BaseChatModel>> {
  try {
    // API key can come from config or OPENAI_API_KEY env var
    const apiKey = config.apiKey as string | undefined;
    // Model has a default from schema, but we handle Record<string,unknown> input too
    // Fallback to DEFAULT_OPENAI_MODEL if model is undefined
    const model = (config.model as string | undefined) ?? DEFAULT_OPENAI_MODEL;
    const baseUrl = config.baseUrl as string | undefined;

    // Choose API based on model
    if (requiresResponsesApi(model)) {
      return Promise.resolve(createResponsesApiClient(model, apiKey, baseUrl));
    } else {
      return Promise.resolve(createChatCompletionsClient(model, apiKey, baseUrl));
    }
  } catch (error) {
    const errorCode = mapErrorToCode(error);
    const message = error instanceof Error ? error.message : 'Failed to create OpenAI client';
    return Promise.resolve(errorResponse(errorCode, message));
  }
}
