/**
 * Core type definitions for the Agent layer.
 * Establishes types for agent construction, message handling, and telemetry.
 */

import type { StructuredToolInterface } from '@langchain/core/tools';
import type { AppConfig } from '../config/schema.js';
import type { AgentCallbacks } from './callbacks.js';
import type { SkillLoaderOptions } from '../skills/types.js';

// -----------------------------------------------------------------------------
// Telemetry Types
// -----------------------------------------------------------------------------

/**
 * Span context for telemetry correlation.
 * Follows OpenTelemetry conventions for distributed tracing.
 */
export interface SpanContext {
  /** Unique trace identifier */
  traceId: string;
  /** Unique span identifier within trace */
  spanId: string;
  /** Parent span identifier for nested operations */
  parentSpanId?: string;
}

// -----------------------------------------------------------------------------
// Message Types
// -----------------------------------------------------------------------------

/**
 * Message role types following OpenAI/LangChain conventions.
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Message format for conversation history.
 * Compatible with LangChain BaseMessage structure.
 */
export interface Message {
  /** Message role */
  role: MessageRole;
  /** Message content */
  content: string;
  /** Tool name (for tool messages) */
  name?: string;
  /** Tool call ID (for tool response messages) */
  toolCallId?: string;
}

// -----------------------------------------------------------------------------
// Permission Types
// -----------------------------------------------------------------------------

/**
 * Permission scope for tool operations.
 * Used by permission system to gate sensitive operations.
 */
export type PermissionScope =
  | 'fs-read' // Read files
  | 'fs-write' // Write files
  | 'fs-delete' // Delete files
  | 'shell-run' // Execute shell commands
  | 'network'; // Make network requests

// -----------------------------------------------------------------------------
// Agent Configuration Types
// -----------------------------------------------------------------------------

/**
 * Options for Agent constructor.
 * All dependencies are injected via this interface.
 */
export interface AgentOptions {
  /** Application configuration */
  config: AppConfig;
  /** Optional callbacks for lifecycle events */
  callbacks?: AgentCallbacks;
  /** Optional tools to bind for function calling */
  tools?: StructuredToolInterface[];
  /** Override for system prompt (skips file loading) */
  systemPrompt?: string;
  /** Maximum iterations for tool execution loop (default: 10) */
  maxIterations?: number;
  /** Include discovered skills in system prompt (default: true) */
  includeSkills?: boolean;
  /** Options for skill loader (custom directories, debug callback) */
  skillLoaderOptions?: SkillLoaderOptions;
}

/**
 * Result from a single agent run.
 * Used internally for structured response handling.
 */
export interface AgentRunResult {
  /** Final answer text */
  answer: string;
  /** Whether tool calls were executed */
  toolsExecuted: boolean;
  /** Number of LLM calls made */
  llmCallCount: number;
  /** Total tokens used (if available) */
  totalTokens?: number;
}
