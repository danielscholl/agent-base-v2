/**
 * OpenAI provider factory.
 * Creates ChatOpenAI instances from provider configuration.
 */

import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { OpenAIProviderConfig } from '../../config/schema.js';
import type { ModelResponse } from '../types.js';
import { successResponse, errorResponse, mapErrorToCode } from '../base.js';
import { DEFAULT_OPENAI_MODEL } from '../../config/constants.js';

/**
 * Create a ChatOpenAI instance from provider config.
 *
 * @param config - OpenAI provider configuration
 * @returns Promise<ModelResponse> with ChatOpenAI or error
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

    // Create ChatOpenAI instance
    const client = new ChatOpenAI({
      model,
      openAIApiKey: apiKey,
      configuration: baseUrl !== undefined && baseUrl !== '' ? { baseURL: baseUrl } : undefined,
    });

    return Promise.resolve(
      successResponse(client as BaseChatModel, `OpenAI client created with model: ${model}`)
    );
  } catch (error) {
    const errorCode = mapErrorToCode(error);
    const message = error instanceof Error ? error.message : 'Failed to create OpenAI client';
    return Promise.resolve(errorResponse(errorCode, message));
  }
}
