/**
 * Message history management for multi-turn conversation context.
 * Provides storage, retrieval, and relevance-based selection of conversation messages.
 */

import type { Message } from '../agent/types.js';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Message with additional metadata for history tracking.
 */
export interface StoredMessage extends Message {
  /** Unique message identifier */
  id: string;
  /** ISO 8601 timestamp when message was added */
  timestamp: string;
  /** Optional conversation turn number */
  turnIndex?: number;
}

/**
 * Options for MessageHistory constructor.
 */
export interface MessageHistoryOptions {
  /** Maximum messages to store (default: 100) */
  historyLimit?: number;
  /** Debug callback for logging */
  onDebug?: (msg: string, data?: unknown) => void;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Default history limit if not specified */
const DEFAULT_HISTORY_LIMIT = 100;

// -----------------------------------------------------------------------------
// MessageHistory Class
// -----------------------------------------------------------------------------

/**
 * Manages conversation message history with size limits and relevance retrieval.
 *
 * @example
 * const history = new MessageHistory({ historyLimit: 50 });
 * history.addExchange('What is TypeScript?', 'TypeScript is a typed superset of JavaScript.');
 * const recent = history.getRecent(10);
 */
export class MessageHistory {
  private messages: StoredMessage[] = [];
  private historyLimit: number;
  private onDebug?: (msg: string, data?: unknown) => void;
  private turnCounter = 0;

  /**
   * Creates a new MessageHistory instance.
   * @param options - Configuration options
   */
  constructor(options: MessageHistoryOptions = {}) {
    this.historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
    this.onDebug = options.onDebug;
    this.debug('MessageHistory initialized', { historyLimit: this.historyLimit });
  }

  // ---------------------------------------------------------------------------
  // Add Methods
  // ---------------------------------------------------------------------------

  /**
   * Add a single message to history.
   * Skips duplicate consecutive messages (for user/assistant roles only).
   * Tool messages are never deduplicated since they may have different name/toolCallId.
   * @param message - Message to add
   * @returns The stored message with metadata
   */
  add(message: Message): StoredMessage {
    // Skip duplicate consecutive messages for user/assistant only
    // Tool messages may have same content but different name/toolCallId
    // DESIGN NOTE: When a duplicate is detected, we return the original message with its
    // original turnIndex. This is intentional - the turnIndex represents when the message
    // was first created, not when it was last referenced. Returning a new turnIndex for
    // a duplicate would be misleading and break chronological ordering guarantees.
    if (this.messages.length > 0 && (message.role === 'user' || message.role === 'assistant')) {
      const last = this.messages[this.messages.length - 1];
      if (last !== undefined && last.role === message.role && last.content === message.content) {
        this.debug('Skipping duplicate consecutive message', { role: message.role });
        return last;
      }
    }

    const stored: StoredMessage = {
      ...message,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
    };

    this.messages.push(stored);
    this.enforceLimit();
    this.debug('Message added', { id: stored.id, role: stored.role });

    return stored;
  }

  /**
   * Add a user/assistant exchange as a pair of messages.
   * Convenience method for common Q&A pattern.
   * @param query - User query
   * @param response - Assistant response
   * @returns Tuple of [userMessage, assistantMessage]
   */
  addExchange(query: string, response: string): [StoredMessage, StoredMessage] {
    // Check if this is a duplicate of the last exchange
    // Last exchange would be: [..., userMsg, assistantMsg] at end
    if (this.messages.length >= 2) {
      const lastAssistant = this.messages[this.messages.length - 1];
      const lastUser = this.messages[this.messages.length - 2];
      if (
        lastUser !== undefined &&
        lastAssistant !== undefined &&
        lastUser.role === 'user' &&
        lastUser.content === query &&
        lastAssistant.role === 'assistant' &&
        lastAssistant.content === response
      ) {
        this.debug('Skipping duplicate exchange', { query: query.slice(0, 50) });
        return [lastUser, lastAssistant];
      }
    }

    this.turnCounter++;
    const turn = this.turnCounter;

    const userMsg: StoredMessage = {
      role: 'user',
      content: query,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      turnIndex: turn,
    };

    const assistantMsg: StoredMessage = {
      role: 'assistant',
      content: response,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      turnIndex: turn,
    };

    this.messages.push(userMsg, assistantMsg);
    this.enforceLimit();
    this.debug('Exchange added', { turn, queryLength: query.length });

    return [userMsg, assistantMsg];
  }

  // ---------------------------------------------------------------------------
  // Retrieval Methods
  // ---------------------------------------------------------------------------

  /**
   * Get N most recent messages.
   * @param limit - Maximum messages to return (default: all)
   * @returns Array of messages (copies, without internal metadata)
   */
  getRecent(limit?: number): Message[] {
    // Handle edge cases: limit <= 0, NaN, or negative returns empty array
    if (limit !== undefined && (limit <= 0 || Number.isNaN(limit))) {
      return [];
    }
    const count = limit ?? this.messages.length;
    const slice = this.messages.slice(-count);
    return slice.map((m) => this.stripMetadata(m));
  }

  /**
   * Get all messages as Message array (without internal metadata).
   * @returns Copy of all messages
   */
  getAll(): Message[] {
    return this.messages.map((m) => this.stripMetadata(m));
  }

  /**
   * Get all messages with full metadata.
   * @returns Copy of all stored messages
   */
  getAllStored(): StoredMessage[] {
    return this.messages.map((m) => ({ ...m }));
  }

  /**
   * Get messages relevant to a query using keyword matching.
   * Falls back to getRecent() if no matches found.
   * @param query - Search query
   * @param limit - Maximum messages to return (default: 10)
   * @returns Array of relevant messages sorted by score
   */
  getRelevant(query: string, limit = 10): Message[] {
    // Handle edge cases: limit <= 0, NaN, or negative returns empty array
    if (limit <= 0 || Number.isNaN(limit)) {
      return [];
    }
    if (query.trim() === '' || this.messages.length === 0) {
      return this.getRecent(limit);
    }

    // Extract keywords from query (lowercase, split on whitespace/punctuation)
    const keywords = this.extractKeywords(query);
    if (keywords.length === 0) {
      return this.getRecent(limit);
    }

    // Score each message by keyword matches
    const scored = this.messages.map((msg, index) => {
      const msgKeywords = this.extractKeywords(msg.content);
      let score = 0;

      for (const keyword of keywords) {
        if (msgKeywords.includes(keyword)) {
          score++;
        }
      }

      // Add small recency bonus (newer messages get slight boost)
      const recencyBonus = (index / this.messages.length) * 0.1;

      return { msg, score: score + recencyBonus };
    });

    // Filter to messages with at least one match
    const matches = scored.filter((s) => s.score > 0.1); // > recency bonus only

    // If no matches, fall back to recent
    if (matches.length === 0) {
      this.debug('No relevant matches, falling back to recent', { query: query.slice(0, 50) });
      return this.getRecent(limit);
    }

    // Sort by score descending, then by recency
    matches.sort((a, b) => b.score - a.score);

    // Return top N
    return matches.slice(0, limit).map((s) => this.stripMetadata(s.msg));
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  /**
   * Clear all message history.
   */
  clear(): void {
    this.messages = [];
    this.turnCounter = 0;
    this.debug('History cleared');
  }

  /**
   * Get the number of messages in history.
   */
  get size(): number {
    return this.messages.length;
  }

  /**
   * Check if history is empty.
   */
  get isEmpty(): boolean {
    return this.messages.length === 0;
  }

  /**
   * Get the most recent user message.
   * @returns Last user message or undefined if none
   */
  getLastUserMessage(): Message | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if (msg !== undefined && msg.role === 'user') {
        return this.stripMetadata(msg);
      }
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Generate a unique message ID.
   */
  private generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * Enforce the history limit by removing oldest messages.
   *
   * Note: When messages are removed, turnIndex values in remaining messages are NOT
   * renumbered. The turnIndex is an absolute identifier that persists even when earlier
   * messages are removed from history. This is intentional behavior:
   * - Allows correlation with external systems that logged the original turnIndex
   * - Maintains temporal ordering without requiring renumbering
   * - Callers should NOT assume turnIndex starts at 1 or is contiguous
   * - If you need contiguous indices, use array positions instead
   *
   * Example: If messages with turnIndex 1-5 exist and messages 1-2 are removed,
   * the remaining messages still have turnIndex 3-5. This indicates there were
   * earlier turns that are no longer available in the current history window.
   */
  private enforceLimit(): void {
    if (this.messages.length > this.historyLimit) {
      const overflow = this.messages.length - this.historyLimit;
      this.messages = this.messages.slice(overflow);
      this.debug('History trimmed', { removed: overflow, remaining: this.messages.length });
    }
  }

  /**
   * Extract keywords from text for relevance matching.
   */
  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[\s\-_.,;:!?'"()[\]{}]+/)
      .filter((word) => word.length > 2); // Skip very short words
  }

  /**
   * Strip internal metadata from StoredMessage to return Message.
   */
  private stripMetadata(msg: StoredMessage): Message {
    const result: Message = {
      role: msg.role,
      content: msg.content,
    };
    if (msg.name !== undefined) result.name = msg.name;
    if (msg.toolCallId !== undefined) result.toolCallId = msg.toolCallId;
    return result;
  }

  /**
   * Debug logging helper.
   */
  private debug(msg: string, data?: unknown): void {
    this.onDebug?.(msg, data);
  }
}
