/**
 * GitHub Models provider factory.
 * Creates ChatOpenAI instances for GitHub's OpenAI-compatible API.
 */

import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { GitHubProviderConfig } from '../../config/schema.js';
import type { ModelResponse } from '../types.js';
import { successResponse, errorResponse, mapErrorToCode } from '../base.js';
import { DEFAULT_GITHUB_MODEL, DEFAULT_GITHUB_ENDPOINT } from '../../config/constants.js';

/**
 * Create a ChatOpenAI instance for GitHub Models.
 * Uses the OpenAI-compatible API at models.github.ai/inference.
 *
 * @param config - GitHub provider configuration
 * @returns Promise<ModelResponse> with ChatOpenAI or error
 */
export function createGitHubClient(
  config: GitHubProviderConfig | Record<string, unknown>
): Promise<ModelResponse<BaseChatModel>> {
  try {
    // Extract config fields with empty string handling (treat '' as unset)
    const token = config.token as string | undefined;
    const configModel = config.model as string | undefined;
    const configEndpoint = config.endpoint as string | undefined;
    const model =
      configModel !== undefined && configModel !== '' ? configModel : DEFAULT_GITHUB_MODEL;
    const endpoint =
      configEndpoint !== undefined && configEndpoint !== ''
        ? configEndpoint
        : DEFAULT_GITHUB_ENDPOINT;
    const org = config.org as string | undefined;

    // GitHub Models requires authentication
    if (token === undefined || token === '') {
      return Promise.resolve(
        errorResponse(
          'PROVIDER_NOT_CONFIGURED',
          'GitHub Models requires token to be configured. ' +
            'Set providers.github.token in config or GITHUB_TOKEN environment variable.'
        )
      );
    }

    // Build endpoint URL with optional org parameter
    // Personal: https://models.github.ai/inference
    // Org: https://models.github.ai/orgs/{org}/inference
    let baseURL = endpoint;
    if (org !== undefined && org !== '') {
      // Insert org into the endpoint path
      // From: https://models.github.ai/inference
      // To: https://models.github.ai/orgs/{org}/inference
      const url = new URL(endpoint);
      url.pathname = `/orgs/${org}/inference`;
      baseURL = url.toString();
    }

    // Create ChatOpenAI instance with GitHub Models endpoint
    const client = new ChatOpenAI({
      model,
      openAIApiKey: token,
      configuration: { baseURL },
    });

    const locationMsg = org !== undefined && org !== '' ? ` (org: ${org})` : '';
    return Promise.resolve(
      successResponse(
        client as BaseChatModel,
        `GitHub client created with model: ${model}${locationMsg}`
      )
    );
  } catch (error) {
    const errorCode = mapErrorToCode(error);
    const message = error instanceof Error ? error.message : 'Failed to create GitHub client';
    return Promise.resolve(errorResponse(errorCode, message));
  }
}
