/**
 * LLMClient - Unified interface for LLM operations.
 * Provider selection is based on config.providers.default, not model prefix parsing.
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage, AIMessageChunk } from '@langchain/core/messages';
import { HumanMessage } from '@langchain/core/messages';
import type { AppConfig } from '../config/schema.js';
import type { ProviderName } from '../config/constants.js';
import type {
  ModelResponse,
  InvokeResult,
  LLMCallbacks,
  LLMCallOptions,
  StreamResult,
  TokenUsage,
} from './types.js';
import { successResponse, errorResponse, mapErrorToCode, extractTokenUsage } from './base.js';
import { getProviderFactory, getSupportedProviders, isProviderSupported } from './registry.js';

/**
 * Options for creating an LLMClient.
 */
export interface LLMClientOptions {
  /** Application configuration */
  config: AppConfig;
  /** Optional callbacks for streaming events */
  callbacks?: LLMCallbacks;
}

/**
 * LLMClient provides a unified interface for LLM operations.
 *
 * Provider selection is based on config.providers.default, not model prefix parsing.
 * This class follows the dependency injection pattern from the config module.
 *
 * @example
 * ```typescript
 * const config = await loadConfig();
 * const client = new LLMClient({ config: config.result! });
 *
 * // Simple invocation
 * const result = await client.invoke('Hello, world!');
 * if (result.success) {
 *   console.log(result.result.content);
 * }
 *
 * // Streaming
 * const stream = await client.stream('Tell me a story');
 * if (stream.success) {
 *   for await (const chunk of stream.result) {
 *     process.stdout.write(chunk.content);
 *   }
 * }
 * ```
 */
export class LLMClient {
  private readonly config: AppConfig;
  private readonly callbacks?: LLMCallbacks;
  private client: BaseChatModel | null = null;
  private currentProvider: ProviderName | null = null;

  constructor(options: LLMClientOptions) {
    this.config = options.config;
    this.callbacks = options.callbacks;
  }

  /**
   * Get or create the LangChain chat model client.
   * Lazily initializes the client on first use.
   */
  private getClient(): ModelResponse<BaseChatModel> {
    const providerName = this.config.providers.default;

    // Return cached client if provider hasn't changed
    if (this.client && this.currentProvider === providerName) {
      return successResponse(this.client, 'Using cached client');
    }

    // Check if provider is supported
    if (!isProviderSupported(providerName)) {
      const supportedProviders = getSupportedProviders().join(', ');
      return errorResponse(
        'PROVIDER_NOT_SUPPORTED',
        `Provider '${providerName}' is not yet supported. Supported providers: ${supportedProviders}`
      );
    }

    // Get provider config
    const providerConfig = this.config.providers[providerName];
    if (!providerConfig) {
      return errorResponse(
        'PROVIDER_NOT_CONFIGURED',
        `Provider '${providerName}' is set as default but not configured`
      );
    }

    // Get factory and create client
    const factory = getProviderFactory(providerName);
    if (!factory) {
      return errorResponse(
        'PROVIDER_NOT_SUPPORTED',
        `No factory registered for provider '${providerName}'`
      );
    }

    const result = factory(providerConfig);
    if (result.success) {
      this.client = result.result;
      this.currentProvider = providerName;
    }

    return result;
  }

  /**
   * Convert a simple string or messages array to LangChain messages.
   */
  private toMessages(input: string | BaseMessage[]): BaseMessage[] {
    if (typeof input === 'string') {
      return [new HumanMessage(input)];
    }
    return input;
  }

  /**
   * Invoke the LLM with a prompt and get a complete response.
   *
   * @param input - Prompt string or array of messages
   * @param options - Optional call options (temperature, maxTokens, etc.)
   * @returns ModelResponse with content and token usage
   */
  async invoke(
    input: string | BaseMessage[],
    _options?: LLMCallOptions
  ): Promise<ModelResponse<InvokeResult>> {
    const clientResult = this.getClient();
    if (!clientResult.success) {
      return clientResult;
    }

    const client = clientResult.result;
    const messages = this.toMessages(input);

    try {
      // Note: In LangChain 1.x, temperature and maxTokens must be set at model construction.
      // Runtime options are not supported via bind() anymore. If runtime options are needed,
      // consider caching multiple model instances or setting values at provider configuration.
      const response = await client.invoke(messages);

      // Extract content - handle both string and complex content
      const content =
        typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

      // Extract token usage from response metadata
      const usage = extractTokenUsage(response.response_metadata);

      return successResponse({ content, usage }, 'LLM invocation successful');
    } catch (error) {
      const errorCode = mapErrorToCode(error);
      const message = error instanceof Error ? error.message : 'Unknown error during invocation';
      this.callbacks?.onError?.(errorCode, message);
      return errorResponse(errorCode, message);
    }
  }

  /**
   * Stream the LLM response chunk by chunk.
   *
   * @param input - Prompt string or array of messages
   * @param options - Optional call options
   * @returns ModelResponse with async iterable of chunks
   */
  async stream(
    input: string | BaseMessage[],
    _options?: LLMCallOptions
  ): Promise<ModelResponse<StreamResult>> {
    const clientResult = this.getClient();
    if (!clientResult.success) {
      return clientResult;
    }

    const client = clientResult.result;
    const messages = this.toMessages(input);

    try {
      // Note: In LangChain 1.x, temperature and maxTokens must be set at model construction.
      // Runtime options are not supported via bind() anymore. If runtime options are needed,
      // consider caching multiple model instances or setting values at provider configuration.
      this.callbacks?.onStreamStart?.();

      const stream = await client.stream(messages);

      // Wrap the stream to emit callbacks
      const wrappedStream = this.wrapStreamWithCallbacks(stream);

      return successResponse(wrappedStream, 'Stream started successfully');
    } catch (error) {
      const errorCode = mapErrorToCode(error);
      const message = error instanceof Error ? error.message : 'Unknown error starting stream';
      this.callbacks?.onError?.(errorCode, message);
      return errorResponse(errorCode, message);
    }
  }

  /**
   * Wrap a stream to emit callbacks for each chunk.
   */
  private wrapStreamWithCallbacks(
    stream: AsyncIterable<AIMessageChunk>
  ): AsyncIterable<AIMessageChunk> {
    const callbacks = this.callbacks;

    return {
      [Symbol.asyncIterator]: () => {
        const iterator = stream[Symbol.asyncIterator]();
        let lastUsage: TokenUsage | undefined;

        return {
          async next(): Promise<IteratorResult<AIMessageChunk>> {
            try {
              const result = await iterator.next();

              if (result.done === true) {
                callbacks?.onStreamEnd?.(lastUsage);
                return result;
              }

              const chunk = result.value;
              // Extract content for callback
              const content = typeof chunk.content === 'string' ? chunk.content : '';

              if (content !== '') {
                callbacks?.onStreamChunk?.(content);
              }

              // Try to extract usage from chunk metadata
              const metadata = chunk.response_metadata as Record<string, unknown> | undefined;
              if (metadata !== undefined) {
                lastUsage = extractTokenUsage(metadata);
              }

              return result;
            } catch (error) {
              // Ensure cleanup callbacks are always invoked on error
              callbacks?.onStreamEnd?.(lastUsage);
              throw error;
            }
          },
        };
      },
    };
  }

  /**
   * Get the underlying LangChain model for advanced operations.
   * Use this when you need to bind tools or use structured output.
   *
   * @returns ModelResponse with BaseChatModel or error
   */
  getModel(): ModelResponse<BaseChatModel> {
    return this.getClient();
  }

  /**
   * Get the current provider name.
   */
  getProviderName(): ProviderName {
    return this.config.providers.default;
  }

  /**
   * Get the current model name.
   */
  getModelName(): string {
    const providerName = this.config.providers.default;
    const providerConfig = this.config.providers[providerName] as
      | Record<string, unknown>
      | undefined;

    if (providerConfig === undefined) {
      return 'unknown';
    }

    // Different providers use different field names for model
    if (providerName === 'azure') {
      const deployment = providerConfig.deployment;
      return typeof deployment === 'string' ? deployment : 'unknown';
    }
    if (providerName === 'foundry') {
      const modelDeployment = providerConfig.modelDeployment;
      return typeof modelDeployment === 'string' ? modelDeployment : 'unknown';
    }
    const model = providerConfig.model;
    return typeof model === 'string' ? model : 'unknown';
  }
}
