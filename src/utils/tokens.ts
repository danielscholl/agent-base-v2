/**
 * Token counting utilities for the agent framework.
 * Provides session-level token tracking and pre-flight token estimation.
 */

import { encodingForModel, getEncoding, type Tiktoken, type TiktokenModel } from 'js-tiktoken';
import type { TokenUsage } from '../model/types.js';
import type { Message } from '../agent/types.js';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Session-level token usage statistics.
 * Represents per-request token data that will be accumulated by the consumer.
 */
export interface SessionTokenUsage {
  /** Prompt tokens from a single request */
  promptTokens: number;
  /** Completion tokens from a single request */
  completionTokens: number;
  /** Total tokens (prompt + completion) from a single request */
  tokens: number;
  /** Number of LLM queries (typically 1 for per-request updates) */
  queryCount: number;
}

/**
 * Options for TokenUsageTracker constructor.
 */
export interface TokenUsageTrackerOptions {
  /** Callback invoked when token usage is updated */
  onUpdate?: (usage: SessionTokenUsage) => void;
  /** Debug callback for logging */
  onDebug?: (message: string, data?: unknown) => void;
}

/**
 * Options for TokenEstimator constructor.
 */
export interface TokenEstimatorOptions {
  /** Model name for encoding selection (default: gpt-4o) */
  model?: string;
  /** Debug callback for logging */
  onDebug?: (message: string, data?: unknown) => void;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Default model for token estimation.
 * NOTE: Must be present in MODEL_ENCODING_MAP or be a valid TiktokenModel
 * to ensure correct encoding selection.
 */
const DEFAULT_MODEL = 'gpt-4o';

/** Message overhead tokens (role, separators) */
const MESSAGE_OVERHEAD_TOKENS = 4;

/** Per-request overhead tokens (start/end tokens) */
const REQUEST_OVERHEAD_TOKENS = 3;

/**
 * Model to encoding mapping.
 * Maps model prefixes to tiktoken encodings.
 */
const MODEL_ENCODING_MAP: Record<string, string> = {
  'gpt-4o': 'o200k_base',
  'gpt-4': 'cl100k_base',
  'gpt-3.5': 'cl100k_base',
  claude: 'cl100k_base', // Approximation for Anthropic models
  gemini: 'cl100k_base', // Approximation for Google models
};

// -----------------------------------------------------------------------------
// TokenUsageTracker Class
// -----------------------------------------------------------------------------

/**
 * Tracks token usage across multiple LLM calls within a session.
 * Accumulates prompt tokens, completion tokens, and query count.
 *
 * @example
 * const tracker = new TokenUsageTracker({
 *   onUpdate: (usage) => console.log(`Total: ${usage.tokens}`),
 * });
 * tracker.addUsage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
 */
export class TokenUsageTracker {
  private readonly onUpdate?: (usage: SessionTokenUsage) => void;
  private readonly onDebug?: (message: string, data?: unknown) => void;
  private usage: SessionTokenUsage;

  /**
   * Creates a new TokenUsageTracker instance.
   * @param options - Configuration options
   */
  constructor(options: TokenUsageTrackerOptions = {}) {
    this.onUpdate = options.onUpdate;
    this.onDebug = options.onDebug;
    this.usage = this.createEmptyUsage();
    this.debug('TokenUsageTracker initialized');
  }

  /**
   * Add token usage from a single LLM call.
   * Accumulates tokens and increments query count.
   * @param usage - Token usage from a single call
   */
  addUsage(usage: TokenUsage): void {
    this.usage = {
      promptTokens: this.usage.promptTokens + usage.promptTokens,
      completionTokens: this.usage.completionTokens + usage.completionTokens,
      tokens: this.usage.tokens + usage.totalTokens,
      queryCount: this.usage.queryCount + 1,
    };

    this.debug('Token usage added', {
      added: usage,
      cumulative: this.usage,
    });

    this.onUpdate?.(this.getUsage());
  }

  /**
   * Get current session token usage.
   * @returns Copy of current usage statistics
   */
  getUsage(): SessionTokenUsage {
    return { ...this.usage };
  }

  /**
   * Reset all counters to zero.
   */
  reset(): void {
    this.usage = this.createEmptyUsage();
    this.debug('Token usage reset');
    this.onUpdate?.(this.getUsage());
  }

  /**
   * Create empty usage object.
   */
  private createEmptyUsage(): SessionTokenUsage {
    return {
      promptTokens: 0,
      completionTokens: 0,
      tokens: 0,
      queryCount: 0,
    };
  }

  /**
   * Debug logging helper.
   */
  private debug(msg: string, data?: unknown): void {
    this.onDebug?.(msg, data);
  }
}

// -----------------------------------------------------------------------------
// TokenEstimator Class
// -----------------------------------------------------------------------------

/**
 * Estimates token counts for text and messages using tiktoken.
 * Supports model-specific tokenizers for accurate estimation.
 *
 * @example
 * const estimator = new TokenEstimator({ model: 'gpt-4o' });
 * const tokens = estimator.estimateTokens('Hello, world!');
 * const messageTokens = estimator.estimateMessages(messages);
 */
export class TokenEstimator {
  private readonly model: string;
  private readonly onDebug?: (message: string, data?: unknown) => void;
  private encoder: Tiktoken | null = null;

  /**
   * Creates a new TokenEstimator instance.
   * @param options - Configuration options
   */
  constructor(options: TokenEstimatorOptions = {}) {
    this.model = options.model ?? DEFAULT_MODEL;
    this.onDebug = options.onDebug;
    this.debug('TokenEstimator initialized', { model: this.model });
  }

  /**
   * Estimate token count for a text string.
   * @param text - Text to estimate tokens for
   * @returns Estimated token count
   */
  estimateTokens(text: string): number {
    if (text === '') {
      return 0;
    }

    const encoder = this.getEncoder();
    const tokens = encoder.encode(text);
    const count = tokens.length;

    this.debug('Tokens estimated', {
      textLength: text.length,
      tokenCount: count,
    });

    return count;
  }

  /**
   * Estimate token count for an array of messages.
   * Includes per-message overhead for role and separators.
   * @param messages - Messages to estimate tokens for
   * @returns Estimated token count including overhead
   */
  estimateMessages(messages: Message[]): number {
    if (messages.length === 0) {
      return 0;
    }

    const encoder = this.getEncoder();
    let totalTokens = REQUEST_OVERHEAD_TOKENS;

    for (const message of messages) {
      // Add message overhead
      totalTokens += MESSAGE_OVERHEAD_TOKENS;

      // Count role tokens (usually 1 token)
      totalTokens += encoder.encode(message.role).length;

      // Count content tokens
      totalTokens += encoder.encode(message.content).length;
    }

    this.debug('Message tokens estimated', {
      messageCount: messages.length,
      totalTokens,
    });

    return totalTokens;
  }

  /**
   * Releases resources held by this TokenEstimator.
   * Call this method when the estimator is no longer needed to free memory.
   */
  dispose(): void {
    // js-tiktoken encoders do not currently provide a cleanup method,
    // but nulling the reference allows for garbage collection.
    this.encoder = null;
    this.debug('TokenEstimator disposed');
  }

  /**
   * Get or create the tiktoken encoder.
   * Lazily initializes the encoder on first use.
   */
  private getEncoder(): Tiktoken {
    if (this.encoder !== null) {
      return this.encoder;
    }

    // Try model-specific encoding first
    // Type assertion is required because TiktokenModel is a closed union type
    // that doesn't include all valid model names. The catch block handles
    // unrecognized models gracefully by falling back to prefix matching.
    try {
      this.encoder = encodingForModel(this.model as TiktokenModel);
      this.debug('Using model-specific encoding', { model: this.model });
      return this.encoder;
    } catch {
      // Model not found, fall back to prefix matching or default
    }

    // Try prefix matching
    const encoding = this.getEncodingForModel(this.model);
    try {
      this.encoder = getEncoding(encoding as Parameters<typeof getEncoding>[0]);
      this.debug('Using encoding from prefix match', { model: this.model, encoding });
      return this.encoder;
    } catch {
      // Encoding not found, use default
    }

    // Fall back to cl100k_base (most common)
    this.encoder = getEncoding('cl100k_base');
    this.debug('Using fallback encoding', { encoding: 'cl100k_base' });
    return this.encoder;
  }

  /**
   * Get encoding name for a model based on prefix matching.
   */
  private getEncodingForModel(model: string): string {
    const lowerModel = model.toLowerCase();

    for (const [prefix, encoding] of Object.entries(MODEL_ENCODING_MAP)) {
      if (lowerModel.startsWith(prefix)) {
        return encoding;
      }
    }

    return 'cl100k_base';
  }

  /**
   * Debug logging helper.
   */
  private debug(msg: string, data?: unknown): void {
    this.onDebug?.(msg, data);
  }
}
