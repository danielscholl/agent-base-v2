/**
 * Anthropic provider factory.
 * Creates ChatAnthropic instances from provider configuration.
 */

import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { AnthropicProviderConfig } from '../../config/schema.js';
import type { ModelResponse } from '../types.js';
import { successResponse, errorResponse, mapErrorToCode } from '../base.js';
import { DEFAULT_ANTHROPIC_MODEL } from '../../config/constants.js';

/**
 * Create a ChatAnthropic instance from provider config.
 *
 * @param config - Anthropic provider configuration
 * @returns Promise<ModelResponse> with ChatAnthropic or error
 */
export function createAnthropicClient(
  config: AnthropicProviderConfig | Record<string, unknown>
): Promise<ModelResponse<BaseChatModel>> {
  try {
    // API key can come from config or ANTHROPIC_API_KEY env var
    const apiKey = config.apiKey as string | undefined;
    // Model has a default from schema, but we handle Record<string,unknown> input too
    const model = (config.model as string | undefined) ?? DEFAULT_ANTHROPIC_MODEL;

    // Create ChatAnthropic instance
    const client = new ChatAnthropic({
      model,
      anthropicApiKey: apiKey,
    });

    return Promise.resolve(
      successResponse(client as BaseChatModel, `Anthropic client created with model: ${model}`)
    );
  } catch (error) {
    const errorCode = mapErrorToCode(error);
    const message = error instanceof Error ? error.message : 'Failed to create Anthropic client';
    return Promise.resolve(errorResponse(errorCode, message));
  }
}
