/**
 * LLMClient - Unified interface for LLM operations.
 * Provider selection is based on config.providers.default, not model prefix parsing.
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage, AIMessageChunk } from '@langchain/core/messages';
import { HumanMessage } from '@langchain/core/messages';
import type { AppConfig, RetryConfig } from '../config/schema.js';
import type { ProviderName } from '../config/constants.js';
import type {
  ModelResponse,
  InvokeResult,
  LLMCallbacks,
  LLMCallOptions,
  StreamResult,
  TokenUsage,
} from './types.js';
import {
  successResponse,
  errorResponse,
  mapErrorToCode,
  extractTokenUsage,
  extractTextContent,
} from './base.js';
import { getProviderFactory, getSupportedProviders, isProviderSupported } from './registry.js';
import { withRetry, extractRetryAfter } from './retry.js';

/**
 * Options for creating an LLMClient.
 */
export interface LLMClientOptions {
  /** Application configuration */
  config: AppConfig;
  /** Optional callbacks for streaming events */
  callbacks?: LLMCallbacks;
  /** Optional retry configuration (overrides config.retry) */
  retryConfig?: RetryConfig;
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
  private readonly retryConfig: RetryConfig;
  private client: BaseChatModel | null = null;
  private currentProvider: ProviderName | null = null;

  constructor(options: LLMClientOptions) {
    this.config = options.config;
    this.callbacks = options.callbacks;
    // Use provided retry config, or fall back to config.retry
    this.retryConfig = options.retryConfig ?? options.config.retry;
  }

  /**
   * Get or create the LangChain chat model client.
   * Lazily initializes the client on first use.
   * Now async to support providers that need initialization (e.g., Foundry local mode).
   */
  private async getClient(): Promise<ModelResponse<BaseChatModel>> {
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

    // Get provider config (may be undefined if relying on env vars)
    const providerConfig = this.config.providers[providerName] ?? {};

    // Get factory and create client
    const factory = getProviderFactory(providerName);
    if (!factory) {
      return errorResponse(
        'PROVIDER_NOT_SUPPORTED',
        `No factory registered for provider '${providerName}'`
      );
    }

    // Factory may return a Promise for async providers (e.g., Foundry local mode)
    // Pass empty config if not configured - factory will try env vars
    const result = await factory(providerConfig);
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
    // Skip retry wrapper if retry is disabled
    if (!this.retryConfig.enabled) {
      const result = await this.invokeOnce(input);
      if (!result.success) {
        this.callbacks?.onError?.(result.error, result.message);
      }
      return result;
    }

    const result = await withRetry(() => this.invokeOnce(input), {
      maxRetries: this.retryConfig.maxRetries,
      baseDelayMs: this.retryConfig.baseDelayMs,
      maxDelayMs: this.retryConfig.maxDelayMs,
      enableJitter: this.retryConfig.enableJitter,
      onRetry: this.callbacks?.onRetry,
    });

    // Only fire onError on final failure (after all retries exhausted)
    if (!result.success) {
      this.callbacks?.onError?.(result.error, result.message);
    }
    return result;
  }

  /**
   * Internal invoke without retry wrapper.
   * Does NOT fire onError - caller is responsible for that after retries exhausted.
   */
  private async invokeOnce(input: string | BaseMessage[]): Promise<ModelResponse<InvokeResult>> {
    const clientResult = await this.getClient();
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

      // Extract content - handle both string and content block arrays (newer OpenAI models)
      const content = extractTextContent(response.content);

      // Extract token usage from response metadata
      const usage = extractTokenUsage(response.response_metadata);

      return successResponse({ content, usage }, 'LLM invocation successful');
    } catch (error) {
      const errorCode = mapErrorToCode(error);
      const message = error instanceof Error ? error.message : 'Unknown error during invocation';
      const retryAfterMs = extractRetryAfter(error);
      // Note: onError is NOT called here - it's called by invoke() after retries exhausted
      return errorResponse(errorCode, message, retryAfterMs);
    }
  }

  /**
   * Stream the LLM response chunk by chunk.
   *
   * Note: Retry only applies to the initial stream() call, not iteration errors.
   * If an error occurs during iteration, the stream will fail without retry.
   *
   * @param input - Prompt string or array of messages
   * @param options - Optional call options
   * @returns ModelResponse with async iterable of chunks
   */
  async stream(
    input: string | BaseMessage[],
    _options?: LLMCallOptions
  ): Promise<ModelResponse<StreamResult>> {
    // Fire onStreamStart once before any retry attempts
    this.callbacks?.onStreamStart?.();

    // Skip retry wrapper if retry is disabled
    if (!this.retryConfig.enabled) {
      const result = await this.streamOnce(input);
      if (!result.success) {
        this.callbacks?.onError?.(result.error, result.message);
      }
      return result;
    }

    const result = await withRetry(() => this.streamOnce(input), {
      maxRetries: this.retryConfig.maxRetries,
      baseDelayMs: this.retryConfig.baseDelayMs,
      maxDelayMs: this.retryConfig.maxDelayMs,
      enableJitter: this.retryConfig.enableJitter,
      onRetry: this.callbacks?.onRetry,
    });

    // Only fire onError on final failure (after all retries exhausted)
    if (!result.success) {
      this.callbacks?.onError?.(result.error, result.message);
    }
    return result;
  }

  /**
   * Internal stream without retry wrapper.
   * Does NOT fire onStreamStart or onError - caller is responsible for those.
   */
  private async streamOnce(input: string | BaseMessage[]): Promise<ModelResponse<StreamResult>> {
    const clientResult = await this.getClient();
    if (!clientResult.success) {
      return clientResult;
    }

    const client = clientResult.result;
    const messages = this.toMessages(input);

    try {
      // Note: In LangChain 1.x, temperature and maxTokens must be set at model construction.
      // Runtime options are not supported via bind() anymore. If runtime options are needed,
      // consider caching multiple model instances or setting values at provider configuration.
      const stream = await client.stream(messages);

      // Wrap the stream to emit callbacks
      const wrappedStream = this.wrapStreamWithCallbacks(stream);

      return successResponse(wrappedStream, 'Stream started successfully');
    } catch (error) {
      const errorCode = mapErrorToCode(error);
      const message = error instanceof Error ? error.message : 'Unknown error starting stream';
      const retryAfterMs = extractRetryAfter(error);
      // Note: onError is NOT called here - it's called by stream() after retries exhausted
      return errorResponse(errorCode, message, retryAfterMs);
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
              // Extract content for callback - handle both string and content block arrays
              const content = extractTextContent(chunk.content);

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
   * @returns Promise<ModelResponse> with BaseChatModel or error
   */
  async getModel(): Promise<ModelResponse<BaseChatModel>> {
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
      // Local mode uses modelAlias, cloud mode uses modelDeployment
      const mode = providerConfig.mode;
      if (mode === 'local') {
        const modelAlias = providerConfig.modelAlias;
        return typeof modelAlias === 'string' ? modelAlias : 'unknown';
      }
      const modelDeployment = providerConfig.modelDeployment;
      return typeof modelDeployment === 'string' ? modelDeployment : 'unknown';
    }
    const model = providerConfig.model;
    return typeof model === 'string' ? model : 'unknown';
  }

  /**
   * Get the current provider mode (e.g., 'local', 'cloud').
   * Only applicable to providers that support modes (e.g., foundry).
   * Returns undefined if the provider doesn't have a mode.
   *
   * For foundry, defaults to 'cloud' if mode is not explicitly set,
   * ensuring the provider-specific prompt layer loads correctly.
   */
  getProviderMode(): string | undefined {
    const providerName = this.config.providers.default;
    const providerConfig = this.config.providers[providerName] as
      | Record<string, unknown>
      | undefined;

    // Currently only foundry supports modes
    if (providerName === 'foundry') {
      // Default to 'cloud' if mode is not set (matches config schema default)
      const mode = providerConfig?.mode;
      return typeof mode === 'string' ? mode : 'cloud';
    }

    return undefined;
  }
}
