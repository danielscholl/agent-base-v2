/**
 * Tools module - LangChain tool wrapper and response contract.
 *
 * This module provides:
 * - ToolResponse<T> type for uniform tool responses
 * - Helper functions for creating success/error responses
 * - createTool factory for LangChain-compatible tools
 */

// Type exports
export type { ToolErrorCode, ToolResponse, SuccessResponse, ErrorResponse } from './types.js';

// Type guards
export { isSuccessResponse, isErrorResponse } from './types.js';

// Helper functions
export { successResponse, errorResponse, createTool, wrapWithToolResponse } from './base.js';

// Types for tool creation
export type { CreateToolOptions } from './base.js';
