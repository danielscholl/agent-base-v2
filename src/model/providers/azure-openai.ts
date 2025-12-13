/**
 * Azure OpenAI provider factory.
 * Creates AzureChatOpenAI instances from provider configuration.
 */

import { AzureChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { AzureOpenAIProviderConfig } from '../../config/schema.js';
import type { ModelResponse } from '../types.js';
import { successResponse, errorResponse, mapErrorToCode } from '../base.js';
import { DEFAULT_AZURE_API_VERSION } from '../../config/constants.js';

/**
 * Create an AzureChatOpenAI instance from provider config.
 *
 * @param config - Azure OpenAI provider configuration
 * @returns ModelResponse with AzureChatOpenAI or error
 */
export function createAzureOpenAIClient(
  config: AzureOpenAIProviderConfig | Record<string, unknown>
): ModelResponse<BaseChatModel> {
  try {
    // Extract config fields
    const endpoint = config.endpoint as string | undefined;
    const deployment = config.deployment as string | undefined;
    const apiVersion = (config.apiVersion as string | undefined) ?? DEFAULT_AZURE_API_VERSION;
    const apiKey = config.apiKey as string | undefined;

    // Validate required fields for Azure
    if (endpoint === undefined || endpoint === '') {
      return errorResponse(
        'PROVIDER_NOT_CONFIGURED',
        'Azure OpenAI requires endpoint to be configured'
      );
    }

    if (deployment === undefined || deployment === '') {
      return errorResponse(
        'PROVIDER_NOT_CONFIGURED',
        'Azure OpenAI requires deployment name to be configured'
      );
    }

    // Create AzureChatOpenAI instance
    // Note: API key can come from config or AZURE_OPENAI_API_KEY env var
    const client = new AzureChatOpenAI({
      azureOpenAIEndpoint: endpoint,
      azureOpenAIApiDeploymentName: deployment,
      azureOpenAIApiVersion: apiVersion,
      azureOpenAIApiKey: apiKey,
    });

    return successResponse(
      client as BaseChatModel,
      `Azure OpenAI client created with deployment: ${deployment}`
    );
  } catch (error) {
    const errorCode = mapErrorToCode(error);
    const message = error instanceof Error ? error.message : 'Failed to create Azure OpenAI client';
    return errorResponse(errorCode, message);
  }
}
