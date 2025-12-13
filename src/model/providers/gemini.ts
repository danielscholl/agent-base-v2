/**
 * Gemini provider factory.
 * Creates ChatGoogleGenerativeAI instances from provider configuration.
 *
 * Note: This factory uses the Gemini Developer API via @langchain/google-genai.
 * For Vertex AI support, a separate @langchain/google-vertexai package would be needed.
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { GeminiProviderConfig } from '../../config/schema.js';
import type { ModelResponse } from '../types.js';
import { successResponse, errorResponse, mapErrorToCode } from '../base.js';
import { DEFAULT_GEMINI_MODEL } from '../../config/constants.js';

/**
 * Create a ChatGoogleGenerativeAI instance from provider config.
 *
 * @param config - Gemini provider configuration
 * @returns ModelResponse with ChatGoogleGenerativeAI or error
 */
export function createGeminiClient(
  config: GeminiProviderConfig | Record<string, unknown>
): ModelResponse<BaseChatModel> {
  try {
    // Extract config with defaults
    const apiKey = config.apiKey as string | undefined;
    const model = (config.model as string | undefined) ?? DEFAULT_GEMINI_MODEL;
    const useVertexai = (config.useVertexai as boolean | undefined) ?? false;

    // Vertex AI mode requires @langchain/google-vertexai package
    // which is not included in this implementation
    if (useVertexai) {
      return errorResponse(
        'PROVIDER_NOT_CONFIGURED',
        'Vertex AI mode requires @langchain/google-vertexai package. ' +
          'Use the Gemini Developer API by setting useVertexai: false, ' +
          'or install @langchain/google-vertexai for Vertex AI support.'
      );
    }

    // Create ChatGoogleGenerativeAI instance for Gemini Developer API
    // API key can come from config or GOOGLE_API_KEY env var
    const client = new ChatGoogleGenerativeAI({
      model,
      apiKey,
    });

    return successResponse(
      client as BaseChatModel,
      `Gemini client created with model: ${model} via Gemini API`
    );
  } catch (error) {
    const errorCode = mapErrorToCode(error);
    const message = error instanceof Error ? error.message : 'Failed to create Gemini client';
    return errorResponse(errorCode, message);
  }
}
