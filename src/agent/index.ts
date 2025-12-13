/**
 * Agent module exports.
 * Provides the core Agent class and related types for orchestrating LLM interactions.
 */

// ─── Core Agent ─────────────────────────────────────────────────────────────
export { Agent } from './agent.js';

// ─── Types ──────────────────────────────────────────────────────────────────
export type {
  AgentOptions,
  Message,
  MessageRole,
  SpanContext,
  PermissionScope,
  AgentRunResult,
} from './types.js';

export type { AgentCallbacks } from './callbacks.js';

// ─── Error Types ─────────────────────────────────────────────────────────
export type {
  AgentErrorCode,
  AgentErrorResponse,
  AgentSuccessResponse,
  AgentResponse,
  ProviderErrorMetadata,
} from '../errors/index.js';

export {
  successResponse,
  errorResponse,
  isAgentSuccess,
  isAgentError,
  mapModelErrorCodeToAgentErrorCode,
  mapToolErrorCodeToAgentErrorCode,
  getUserFriendlyMessage,
} from '../errors/index.js';

// ─── Helpers ────────────────────────────────────────────────────────────────
export { createSpanContext, createChildSpanContext } from './callbacks.js';
export {
  loadSystemPrompt,
  replacePlaceholders,
  stripYamlFrontMatter,
  type PromptOptions,
  type PlaceholderValues,
} from './prompts.js';
