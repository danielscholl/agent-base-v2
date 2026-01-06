/**
 * Azure OpenAI provider factory.
 * Automatically chooses between Chat Completions API and Responses API
 * based on the model/deployment being used.
 *
 * - Chat Completions API: Standard models (gpt-4o, gpt-5.2, etc.)
 * - Responses API: Reasoning models (gpt-5-codex, o1, o3, etc.)
 */

import { spawnSync } from 'node:child_process';
import { AzureOpenAI } from 'openai';
import type { ResponseInput, FunctionTool } from 'openai/resources/responses/responses';
import { AzureChatOpenAI } from '@langchain/openai';
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

import type { AzureOpenAIProviderConfig } from '../../config/schema.js';
import type { ModelResponse } from '../types.js';
import { successResponse, errorResponse, mapErrorToCode } from '../base.js';
import { DEFAULT_AZURE_API_VERSION } from '../../config/constants.js';

// Azure Responses API requires this preview version or later
const RESPONSES_API_VERSION = '2025-03-01-preview';

// Models that require the Responses API (reasoning models)
const RESPONSES_API_MODELS = ['gpt-5-codex', 'o1', 'o3', 'o1-preview', 'o1-mini'];

/**
 * Check if a deployment/model requires the Responses API.
 * Uses specific matching to prevent false positives from substring matches.
 * Matches exact name or names that start with the model name followed by - or _.
 */
function requiresResponsesApi(deployment: string): boolean {
  const lowerDeployment = deployment.toLowerCase();
  return RESPONSES_API_MODELS.some((model) => {
    const lowerModel = model.toLowerCase();
    return (
      lowerDeployment === lowerModel ||
      lowerDeployment.startsWith(`${lowerModel}-`) ||
      lowerDeployment.startsWith(`${lowerModel}_`)
    );
  });
}

/**
 * Get Azure access token from Azure CLI if logged in.
 * Uses the Cognitive Services resource scope for Azure OpenAI.
 */
export function getAzureCLIToken(): string | undefined {
  try {
    const result = spawnSync(
      'az',
      [
        'account',
        'get-access-token',
        '--resource',
        'https://cognitiveservices.azure.com',
        '--query',
        'accessToken',
        '-o',
        'tsv',
      ],
      {
        encoding: 'utf-8',
        timeout: 10000,
      }
    );
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim();
    }
    return undefined;
  } catch {
    return undefined;
  }
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
 * Custom chat model that wraps Azure OpenAI Responses API.
 * Implements LangChain's BaseChatModel interface for compatibility.
 * Handles stateful conversation with previous_response_id for tool continuations.
 *
 * Note: This class is integration-tested via manual verification with actual Azure OpenAI endpoints.
 * Unit testing is complex due to the openai package's internal structure.
 */
/* istanbul ignore next -- @preserve: Integration-tested class, see manual verification */
class AzureResponsesChatModel extends BaseChatModel {
  private client: AzureOpenAI;
  private deployment: string;
  private boundTools: FunctionTool[] = [];

  constructor(client: AzureOpenAI, deployment: string, tools: FunctionTool[] = []) {
    super({});
    this.client = client;
    this.deployment = deployment;
    this.boundTools = tools;
  }

  _llmType(): string {
    return 'azure-responses';
  }

  /**
   * Bind tools to the model for function calling.
   * Returns a new model instance with tools bound.
   *
   * Note: This method diverges from BaseChatModel's bindTools signature in two ways:
   * 1. Parameter type: Accepts unknown[] instead of BindToolsInput[] to remain structurally
   *    compatible with agent framework usage. Internally casts to StructuredToolInterface[].
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
              _zod?: { def?: { typeName?: string }; description?: string };
              _def?: { typeName?: string };
              description?: string;
              isOptional?: () => boolean;
            };

            const typeName = field._zod?.def?.typeName ?? field._def?.typeName ?? 'string';
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

    return new AzureResponsesChatModel(
      this.client,
      this.deployment,
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
          output: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
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
        items.push({ type: 'message', role: 'system', content: msg.content as string });
      } else if (msg instanceof HumanMessage) {
        items.push({ type: 'message', role: 'user', content: msg.content as string });
      } else if (msg instanceof AIMessage) {
        const content = typeof msg.content === 'string' ? msg.content : '';
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
   */
  private extractTextFromOutput(
    output: Array<{
      type: string;
      content?: Array<{ type: string; text?: string }>;
    }>
  ): string {
    for (const item of output) {
      if (item.type === 'message' && item.content !== undefined) {
        for (const content of item.content) {
          if (content.type === 'output_text' && content.text !== undefined && content.text !== '') {
            return content.text;
          }
        }
      }
    }
    return '';
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
          // If parsing fails, use empty args
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
        model: this.deployment,
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
        model: this.deployment,
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
 * Create an Azure OpenAI client (Chat Completions API).
 */
function createChatCompletionsClient(
  endpoint: string,
  deployment: string,
  apiKey: string | undefined,
  apiVersion: string,
  useAzureCLI: boolean
): ModelResponse<BaseChatModel> {
  const clientConfig: Record<string, unknown> = {
    azureOpenAIEndpoint: endpoint,
    azureOpenAIApiDeploymentName: deployment,
    azureOpenAIApiVersion: apiVersion,
  };

  if (useAzureCLI) {
    clientConfig.azureADTokenProvider = () => {
      const token = getAzureCLIToken();
      if (token === undefined) {
        throw new Error('Failed to get Azure CLI token. Run "az login" to authenticate.');
      }
      return token;
    };
  } else if (apiKey !== undefined && apiKey !== '') {
    clientConfig.azureOpenAIApiKey = apiKey;
  } else {
    return errorResponse(
      'PROVIDER_NOT_CONFIGURED',
      'Azure OpenAI requires authentication. Either:\n' +
        '  1. Set AZURE_OPENAI_API_KEY env var\n' +
        '  2. Configure providers.azure.apiKey\n' +
        '  3. Run "az login" for Azure CLI auth'
    );
  }

  const client = new AzureChatOpenAI(clientConfig);
  const authMethod = useAzureCLI ? 'Azure CLI' : 'API key';

  return successResponse(
    client as BaseChatModel,
    `Azure OpenAI client created with deployment: ${deployment} (auth: ${authMethod}, API: Chat Completions)`
  );
}

/**
 * Create an Azure Responses API client.
 * Handles both API key auth (api-key header) and Azure CLI auth (Bearer token).
 */
function createResponsesApiClient(
  endpoint: string,
  deployment: string,
  apiKey: string,
  useAzureCLI: boolean
): ModelResponse<BaseChatModel> {
  // Azure CLI tokens need azureADTokenProvider (sends Bearer token)
  // API keys use apiKey (sends api-key header)
  const clientConfig: {
    endpoint: string;
    apiVersion: string;
    deployment: string;
    apiKey?: string;
    azureADTokenProvider?: () => Promise<string>;
  } = {
    endpoint,
    apiVersion: RESPONSES_API_VERSION,
    deployment,
  };

  if (useAzureCLI) {
    // Azure CLI auth: use azureADTokenProvider which sends Bearer token
    // The token is already obtained, but we wrap it in a provider function
    // that refreshes it on each call to handle token expiration
    clientConfig.azureADTokenProvider = () => {
      const token = getAzureCLIToken();
      if (token === undefined) {
        throw new Error('Azure CLI token expired or unavailable');
      }
      return Promise.resolve(token);
    };
  } else {
    // API key auth: use apiKey which sends api-key header
    clientConfig.apiKey = apiKey;
  }

  const client = new AzureOpenAI(clientConfig);
  const chatModel = new AzureResponsesChatModel(client, deployment);
  const authMethod = useAzureCLI ? 'Azure CLI' : 'API key';

  return successResponse(
    chatModel as unknown as BaseChatModel,
    `Azure OpenAI client created with deployment: ${deployment} (auth: ${authMethod}, API: Responses)`
  );
}

/**
 * Create an Azure OpenAI client from provider config.
 * Automatically chooses between Chat Completions API and Responses API
 * based on the deployment/model name.
 *
 * Configuration sources (in order of priority):
 * - Endpoint: config.endpoint → AZURE_OPENAI_ENDPOINT env var
 * - Deployment: config.deployment → AZURE_OPENAI_DEPLOYMENT_NAME env var
 * - API Key: config.apiKey → AZURE_OPENAI_API_KEY env var → Azure CLI token
 * - API Version: config.apiVersion → AZURE_OPENAI_API_VERSION env var → default
 *
 * @param config - Azure OpenAI provider configuration
 * @returns Promise<ModelResponse> with appropriate client or error
 */
export function createAzureOpenAIClient(
  config: AzureOpenAIProviderConfig | Record<string, unknown>
): Promise<ModelResponse<BaseChatModel>> {
  try {
    // Extract config fields with env var fallbacks
    let endpoint = config.endpoint as string | undefined;
    let deployment = config.deployment as string | undefined;
    let apiKey = config.apiKey as string | undefined;
    let apiVersion = config.apiVersion as string | undefined;

    // Fall back to environment variables
    if (endpoint === undefined || endpoint === '') {
      endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    }
    if (deployment === undefined || deployment === '') {
      deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
    }
    if (apiKey === undefined || apiKey === '') {
      apiKey = process.env.AZURE_OPENAI_API_KEY;
    }
    if (apiVersion === undefined || apiVersion === '') {
      apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? DEFAULT_AZURE_API_VERSION;
    }

    // Validate required fields
    if (endpoint === undefined || endpoint === '') {
      return Promise.resolve(
        errorResponse(
          'PROVIDER_NOT_CONFIGURED',
          'Azure OpenAI requires endpoint. Set AZURE_OPENAI_ENDPOINT or configure providers.azure.endpoint'
        )
      );
    }

    if (deployment === undefined || deployment === '') {
      return Promise.resolve(
        errorResponse(
          'PROVIDER_NOT_CONFIGURED',
          'Azure OpenAI requires deployment. Set AZURE_OPENAI_DEPLOYMENT_NAME or configure providers.azure.deployment'
        )
      );
    }

    // Determine authentication method
    let useAzureCLI = false;
    if (apiKey === undefined || apiKey === '') {
      const cliToken = getAzureCLIToken();
      if (cliToken !== undefined) {
        useAzureCLI = true;
        apiKey = cliToken;
      }
    }

    if (apiKey === undefined || apiKey === '') {
      return Promise.resolve(
        errorResponse(
          'PROVIDER_NOT_CONFIGURED',
          'Azure OpenAI requires authentication. Either:\n' +
            '  1. Set AZURE_OPENAI_API_KEY env var\n' +
            '  2. Configure providers.azure.apiKey\n' +
            '  3. Run "az login" for Azure CLI auth'
        )
      );
    }

    // Choose API based on model/deployment
    if (requiresResponsesApi(deployment)) {
      return Promise.resolve(createResponsesApiClient(endpoint, deployment, apiKey, useAzureCLI));
    } else {
      return Promise.resolve(
        createChatCompletionsClient(endpoint, deployment, apiKey, apiVersion, useAzureCLI)
      );
    }
  } catch (error) {
    const errorCode = mapErrorToCode(error);
    const message = error instanceof Error ? error.message : 'Failed to create Azure OpenAI client';
    return Promise.resolve(errorResponse(errorCode, message));
  }
}
