/**
 * Type definitions for the tool response contract.
 * Establishes the uniform response format that all tools must follow.
 */

/**
 * Error codes for tool failures.
 * Used for categorizing errors in a type-safe manner.
 */
export type ToolErrorCode =
  | 'VALIDATION_ERROR' // Invalid input parameters
  | 'IO_ERROR' // File system or network errors
  | 'CONFIG_ERROR' // Configuration issues
  | 'PERMISSION_DENIED' // Access denied
  | 'RATE_LIMITED' // Rate limiting hit
  | 'NOT_FOUND' // Resource not found
  | 'LLM_ASSIST_REQUIRED' // Tool needs LLM help
  | 'TIMEOUT' // Operation timed out
  | 'UNKNOWN'; // Unexpected errors

/**
 * Success response from a tool execution.
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  result: T;
  message: string;
}

/**
 * Error response from a tool execution.
 */
export interface ErrorResponse {
  success: false;
  error: ToolErrorCode;
  message: string;
}

/**
 * Discriminated union for tool responses.
 * Tools MUST return this type at public boundaries, never throw.
 */
export type ToolResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;
