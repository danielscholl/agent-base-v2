/**
 * Local provider factory for Docker Model Runner.
 * Creates ChatOpenAI instances configured for local inference.
 */

import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { LocalProviderConfig } from '../../config/schema.js';
import type { ModelResponse } from '../types.js';
import { successResponse, errorResponse, mapErrorToCode } from '../base.js';
import { DEFAULT_LOCAL_BASE_URL, DEFAULT_LOCAL_MODEL } from '../../config/constants.js';

/**
 * Create a ChatOpenAI instance for local inference.
 * Uses Docker Model Runner or compatible OpenAI-compatible servers.
 *
 * @param config - Local provider configuration
 * @returns Promise<ModelResponse> with ChatOpenAI or error
 */
export function createLocalClient(
  config: LocalProviderConfig | Record<string, unknown>
): Promise<ModelResponse<BaseChatModel>> {
  try {
    // Fallback to defaults if fields are undefined or empty string
    const configBaseUrl = config.baseUrl as string | undefined;
    const configModel = config.model as string | undefined;
    const baseUrl =
      configBaseUrl !== undefined && configBaseUrl !== '' ? configBaseUrl : DEFAULT_LOCAL_BASE_URL;
    const model =
      configModel !== undefined && configModel !== '' ? configModel : DEFAULT_LOCAL_MODEL;

    // Create ChatOpenAI instance with local configuration
    const client = new ChatOpenAI({
      model,
      openAIApiKey: 'not-needed', // Local servers don't require auth
      configuration: { baseURL: baseUrl },
    });

    return Promise.resolve(
      successResponse(client as BaseChatModel, `Local client created with model: ${model}`)
    );
  } catch (error) {
    const errorCode = mapErrorToCode(error);
    const message = error instanceof Error ? error.message : 'Failed to create Local client';
    return Promise.resolve(errorResponse(errorCode, message));
  }
}
