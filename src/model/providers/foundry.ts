/**
 * Azure AI Foundry provider factory.
 * Creates LangChain chat models for both local and cloud Foundry modes.
 *
 * Local mode: Uses foundry-local-sdk to get endpoint/apiKey, then ChatOpenAI.
 * Cloud mode: Uses Azure AI Foundry cloud endpoint with ChatOpenAI.
 */

import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { FoundryProviderConfig } from '../../config/schema.js';
import type { ModelResponse } from '../types.js';
import { successResponse, errorResponse, mapErrorToCode } from '../base.js';
import {
  DEFAULT_FOUNDRY_MODE,
  DEFAULT_FOUNDRY_LOCAL_MODEL,
  DEFAULT_FOUNDRY_MODEL,
} from '../../config/constants.js';

/**
 * Internal: Create client for local Foundry mode.
 * Uses foundry-local-sdk to initialize model and get endpoint/apiKey.
 */
async function createLocalFoundryClient(
  config: FoundryProviderConfig | Record<string, unknown>
): Promise<ModelResponse<BaseChatModel>> {
  try {
    // Dynamic import to avoid requiring foundry-local-sdk when not in local mode
    const { FoundryLocalManager } = await import('foundry-local-sdk');

    const modelAlias = (config.modelAlias as string | undefined) ?? DEFAULT_FOUNDRY_LOCAL_MODEL;
    const temperature = config.temperature as number | undefined;

    // Initialize the Foundry Local Manager
    const foundryLocalManager = new FoundryLocalManager();
    const modelInfo = await foundryLocalManager.init(modelAlias);

    // Validate modelInfo was returned
    if (!modelInfo) {
      return errorResponse(
        'MODEL_NOT_FOUND',
        `Foundry Local model '${modelAlias}' not found or failed to initialize`
      );
    }

    // Get endpoint and API key from the manager
    const endpoint = foundryLocalManager.endpoint;
    const apiKey = foundryLocalManager.apiKey;

    // Create ChatOpenAI with Foundry Local endpoint
    const clientConfig: Record<string, unknown> = {
      model: modelInfo.id,
      openAIApiKey: apiKey,
      configuration: { baseURL: endpoint },
    };

    if (temperature !== undefined) {
      clientConfig.temperature = temperature;
    }

    const client = new ChatOpenAI(clientConfig);

    return successResponse(
      client as BaseChatModel,
      `Foundry Local client created with model: ${modelInfo.id} (alias: ${modelAlias})`
    );
  } catch (error) {
    const errorCode = mapErrorToCode(error);
    const message =
      error instanceof Error ? error.message : 'Failed to create Foundry Local client';
    return errorResponse(errorCode, message);
  }
}

/**
 * Internal: Create client for cloud Foundry mode.
 * Uses Azure AI Foundry cloud endpoints with the v1 API format.
 *
 * API Details (per Azure docs):
 * - v1 endpoint: https://{resource}.services.ai.azure.com/openai/v1/
 * - Authentication: api-key header (NOT Bearer token)
 * - API version not required for v1 endpoint
 */
function createCloudFoundryClient(
  config: FoundryProviderConfig | Record<string, unknown>
): Promise<ModelResponse<BaseChatModel>> {
  try {
    const projectEndpoint = config.projectEndpoint as string | undefined;
    const modelDeployment = (config.modelDeployment as string | undefined) ?? DEFAULT_FOUNDRY_MODEL;
    // API key from config, then env var fallback
    const apiKey =
      (config.apiKey as string | undefined) ?? process.env.AZURE_FOUNDRY_API_KEY ?? undefined;
    const temperature = config.temperature as number | undefined;

    // Validate required fields for cloud mode
    if (projectEndpoint === undefined || projectEndpoint === '') {
      return Promise.resolve(
        errorResponse(
          'PROVIDER_NOT_CONFIGURED',
          'Azure AI Foundry cloud mode requires projectEndpoint to be configured'
        )
      );
    }

    // Construct the OpenAI v1-compatible endpoint
    // Azure AI Foundry v1 API: https://{resource}.services.ai.azure.com/openai/v1/
    // This format does NOT require api-version query parameter
    let baseUrl = projectEndpoint;
    if (!baseUrl.endsWith('/')) {
      baseUrl += '/';
    }
    baseUrl += 'openai/v1';

    // Create ChatOpenAI with Azure AI Foundry endpoint
    // Use dummy openAIApiKey since Azure uses api-key header, not Bearer token
    // ChatOpenAI requires openAIApiKey to be set, so we use a placeholder
    const clientConfig: Record<string, unknown> = {
      model: modelDeployment,
      openAIApiKey: 'azure-uses-api-key-header', // Placeholder - auth via defaultHeaders
      configuration: {
        baseURL: baseUrl,
        defaultHeaders: {
          'api-key': apiKey ?? '',
        },
      },
    };

    if (temperature !== undefined) {
      clientConfig.temperature = temperature;
    }

    const client = new ChatOpenAI(clientConfig);

    return Promise.resolve(
      successResponse(
        client as BaseChatModel,
        `Foundry Cloud client created with deployment: ${modelDeployment}`
      )
    );
  } catch (error) {
    const errorCode = mapErrorToCode(error);
    const message =
      error instanceof Error ? error.message : 'Failed to create Foundry Cloud client';
    return Promise.resolve(errorResponse(errorCode, message));
  }
}

/**
 * Create an Azure AI Foundry client from provider config.
 * Supports both local (on-device) and cloud modes.
 *
 * @param config - Foundry provider configuration
 * @returns Promise<ModelResponse> with BaseChatModel or error
 */
export async function createFoundryClient(
  config: FoundryProviderConfig | Record<string, unknown>
): Promise<ModelResponse<BaseChatModel>> {
  const mode = (config.mode as 'local' | 'cloud' | undefined) ?? DEFAULT_FOUNDRY_MODE;

  if (mode === 'local') {
    return createLocalFoundryClient(config);
  }

  return createCloudFoundryClient(config);
}
