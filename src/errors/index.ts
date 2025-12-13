/**
 * Structured error types for the agent layer.
 * Provides typed error responses with provider metadata for programmatic handling.
 *
 * Follows the discriminated union pattern established by ToolResponse and ModelResponse.
 * Errors include optional provider metadata for detailed context.
 */

import type { ModelErrorCode } from '../model/types.js';
import type { ToolErrorCode } from '../tools/types.js';

// -----------------------------------------------------------------------------
// Error Codes
// -----------------------------------------------------------------------------

/**
 * Error codes for agent operations.
 * Combines relevant codes from Model and Tool layers plus agent-specific codes.
 */
export type AgentErrorCode =
  // Provider errors (from ModelErrorCode)
  | 'PROVIDER_NOT_CONFIGURED' // Provider config missing
  | 'PROVIDER_NOT_SUPPORTED' // Unknown provider name
  | 'AUTHENTICATION_ERROR' // API key invalid or missing
  | 'RATE_LIMITED' // Rate limit exceeded
  | 'MODEL_NOT_FOUND' // Model name not available
  | 'CONTEXT_LENGTH_EXCEEDED' // Input too long
  | 'NETWORK_ERROR' // Connection failed
  | 'TIMEOUT' // Request timed out
  | 'INVALID_RESPONSE' // Malformed response
  // Tool errors (from ToolErrorCode)
  | 'VALIDATION_ERROR' // Invalid input parameters
  | 'IO_ERROR' // File system or network errors
  | 'CONFIG_ERROR' // Configuration issues
  | 'PERMISSION_DENIED' // Access denied
  | 'NOT_FOUND' // Resource not found
  | 'LLM_ASSIST_REQUIRED' // Tool needs LLM help
  // Agent-specific errors
  | 'MAX_ITERATIONS_EXCEEDED' // Exceeded iteration limit
  | 'TOOL_EXECUTION_ERROR' // Tool execution failed
  | 'INITIALIZATION_ERROR' // Agent initialization failed
  | 'UNKNOWN'; // Unexpected errors

// -----------------------------------------------------------------------------
// Provider Metadata
// -----------------------------------------------------------------------------

/**
 * Optional metadata about the provider that produced an error.
 * Provides context for debugging and smart retry logic.
 */
export interface ProviderErrorMetadata {
  /** Provider name (e.g., 'openai', 'anthropic') */
  provider?: string;
  /** Model name (e.g., 'gpt-4o', 'claude-3-opus') */
  model?: string;
  /** HTTP status code from the API response */
  statusCode?: number;
  /** Seconds until retry is allowed (for rate limiting) */
  retryAfter?: number;
  /** Original error from SDK for debugging */
  originalError?: unknown;
}

// -----------------------------------------------------------------------------
// Response Types
// -----------------------------------------------------------------------------

/**
 * Success response from an agent operation.
 */
export interface AgentSuccessResponse<T = unknown> {
  success: true;
  result: T;
  message: string;
}

/**
 * Error response from an agent operation.
 * Includes optional provider metadata for detailed error context.
 */
export interface AgentErrorResponse {
  success: false;
  error: AgentErrorCode;
  message: string;
  /** Optional provider metadata for debugging and retry logic */
  metadata?: ProviderErrorMetadata;
}

/**
 * Discriminated union for agent responses.
 * Agent operations return this type at public boundaries.
 */
export type AgentResponse<T = unknown> = AgentSuccessResponse<T> | AgentErrorResponse;

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Create a success response.
 *
 * @param result - The result data
 * @param message - Human-readable success message
 * @returns Success response object
 */
export function successResponse<T>(result: T, message: string): AgentSuccessResponse<T> {
  return { success: true, result, message };
}

/**
 * Create an error response.
 *
 * @param error - Error code from AgentErrorCode
 * @param message - Human-readable error message
 * @param metadata - Optional provider metadata
 * @returns Error response object
 */
export function errorResponse(
  error: AgentErrorCode,
  message: string,
  metadata?: ProviderErrorMetadata
): AgentErrorResponse {
  const response: AgentErrorResponse = { success: false, error, message };
  if (metadata !== undefined) {
    response.metadata = metadata;
  }
  return response;
}

// -----------------------------------------------------------------------------
// Type Guards
// -----------------------------------------------------------------------------

/**
 * Type guard for success responses.
 */
export function isAgentSuccess<T>(response: AgentResponse<T>): response is AgentSuccessResponse<T> {
  return response.success;
}

/**
 * Type guard for error responses.
 */
export function isAgentError(response: AgentResponse): response is AgentErrorResponse {
  return !response.success;
}

// -----------------------------------------------------------------------------
// Error Mapping Functions
// -----------------------------------------------------------------------------

/**
 * Map a ModelErrorCode to an AgentErrorCode.
 * Explicit mapping ensures type safety when new codes are added.
 */
export function mapModelErrorCodeToAgentErrorCode(code: ModelErrorCode): AgentErrorCode {
  const mapping: Record<ModelErrorCode, AgentErrorCode> = {
    PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
    PROVIDER_NOT_SUPPORTED: 'PROVIDER_NOT_SUPPORTED',
    AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
    RATE_LIMITED: 'RATE_LIMITED',
    MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
    CONTEXT_LENGTH_EXCEEDED: 'CONTEXT_LENGTH_EXCEEDED',
    NETWORK_ERROR: 'NETWORK_ERROR',
    TIMEOUT: 'TIMEOUT',
    INVALID_RESPONSE: 'INVALID_RESPONSE',
    UNKNOWN: 'UNKNOWN',
  };
  return mapping[code];
}

/**
 * Map a ToolErrorCode to an AgentErrorCode.
 * Explicit mapping ensures type safety when new codes are added.
 */
export function mapToolErrorCodeToAgentErrorCode(code: ToolErrorCode): AgentErrorCode {
  const mapping: Record<ToolErrorCode, AgentErrorCode> = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    IO_ERROR: 'IO_ERROR',
    CONFIG_ERROR: 'CONFIG_ERROR',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    RATE_LIMITED: 'RATE_LIMITED',
    NOT_FOUND: 'NOT_FOUND',
    LLM_ASSIST_REQUIRED: 'LLM_ASSIST_REQUIRED',
    TIMEOUT: 'TIMEOUT',
    UNKNOWN: 'UNKNOWN',
  };
  return mapping[code];
}

/**
 * Generate a user-friendly error message based on error code and context.
 *
 * @param error - The error code
 * @param metadata - Optional provider metadata for context
 * @returns User-friendly error message
 */
export function getUserFriendlyMessage(
  error: AgentErrorCode,
  metadata?: ProviderErrorMetadata
): string {
  const provider = metadata?.provider ?? 'the provider';

  switch (error) {
    case 'AUTHENTICATION_ERROR':
      return `Authentication failed with ${provider}. Please check your API key.`;
    case 'RATE_LIMITED':
      if (metadata?.retryAfter !== undefined) {
        return `Rate limited by ${provider}. Retry after ${String(metadata.retryAfter)} seconds.`;
      }
      return `Rate limited by ${provider}. Please wait before retrying.`;
    case 'MODEL_NOT_FOUND':
      if (metadata?.model !== undefined) {
        return `Model '${metadata.model}' not found on ${provider}.`;
      }
      return `The requested model was not found on ${provider}.`;
    case 'CONTEXT_LENGTH_EXCEEDED':
      return `Input exceeds the context length limit for ${provider}.`;
    case 'NETWORK_ERROR':
      return `Network error connecting to ${provider}. Please check your connection.`;
    case 'TIMEOUT':
      return `Request to ${provider} timed out. Please try again.`;
    case 'PROVIDER_NOT_CONFIGURED':
      return `Provider '${provider}' is not configured. Please check your configuration.`;
    case 'PROVIDER_NOT_SUPPORTED':
      return `Provider '${provider}' is not supported.`;
    case 'MAX_ITERATIONS_EXCEEDED':
      return 'Maximum iterations exceeded. The query may be too complex.';
    case 'TOOL_EXECUTION_ERROR':
      return 'A tool failed to execute. Please check the tool configuration.';
    case 'INITIALIZATION_ERROR':
      return 'Agent initialization failed. Please check your configuration.';
    case 'VALIDATION_ERROR':
      return 'Invalid input parameters provided.';
    case 'IO_ERROR':
      return 'An I/O error occurred while processing your request.';
    case 'CONFIG_ERROR':
      return 'Configuration error. Please check your settings.';
    case 'PERMISSION_DENIED':
      return 'Permission denied for the requested operation.';
    case 'NOT_FOUND':
      return 'The requested resource was not found.';
    case 'LLM_ASSIST_REQUIRED':
      return 'The operation requires LLM assistance.';
    case 'INVALID_RESPONSE':
      return `Received an invalid response from ${provider}.`;
    default:
      return 'An unexpected error occurred.';
  }
}
