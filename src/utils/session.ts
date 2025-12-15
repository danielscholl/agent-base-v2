/**
 * Session persistence for save/restore and history management.
 * Stores conversation sessions to disk as JSON files with metadata.
 */

import { randomBytes } from 'node:crypto';
import type { IFileSystem } from '../config/types.js';
import { NodeFileSystem } from '../config/manager.js';
import {
  DEFAULT_SESSION_DIR,
  DEFAULT_MAX_SESSIONS,
  DEFAULT_SESSION_NAME_MAX_LENGTH,
} from '../config/constants.js';
import type { StoredMessage } from './message-history.js';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Reserved session names that cannot be used */
const RESERVED_NAMES = new Set([
  'index',
  'metadata',
  'last_session',
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
]);

/** Session index schema version */
const INDEX_VERSION = '1.0';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Session metadata stored in index file.
 */
export interface SessionMetadata {
  /** Session ID (filename without extension) */
  id: string;
  /** Session display name (may differ from ID) */
  name: string;
  /** Optional description */
  description?: string;
  /** ISO 8601 timestamp when session was created */
  createdAt: string;
  /** ISO 8601 timestamp of last activity */
  lastActivityAt: string;
  /** Number of messages in session */
  messageCount: number;
  /** First user message preview (truncated) */
  firstMessage: string;
  /** Provider used in session */
  provider: string;
  /** Model used in session */
  model: string;
}

/**
 * Full session data stored on disk.
 */
export interface StoredSession {
  /** Session metadata */
  metadata: SessionMetadata;
  /** Conversation messages (from MessageHistory) */
  messages: StoredMessage[];
  /** Optional context summary for AI resume */
  contextSummary?: string;
}

/**
 * Session index for fast listing.
 */
export interface SessionIndex {
  /** Schema version */
  version: string;
  /** Map of session ID to metadata */
  sessions: Record<string, SessionMetadata>;
  /** Last updated timestamp */
  updatedAt: string;
}

/**
 * Options for SessionManager constructor.
 */
export interface SessionManagerOptions {
  /** Directory for session storage (default: ~/.agent/sessions) */
  sessionDir?: string;
  /** Maximum sessions to keep (default: 50) */
  maxSessions?: number;
  /** File system implementation for testing */
  fileSystem?: IFileSystem;
  /** Debug callback for logging */
  onDebug?: (msg: string, data?: unknown) => void;
}

/**
 * Options for saving a session.
 */
export interface SaveSessionOptions {
  /** Custom session name (default: auto-generated from timestamp) */
  name?: string;
  /** Session description */
  description?: string;
  /** Provider name */
  provider?: string;
  /** Model name */
  model?: string;
}

// -----------------------------------------------------------------------------
// SessionManager Class
// -----------------------------------------------------------------------------

/**
 * Manages session persistence to filesystem.
 * Sessions are stored as JSON files with metadata index for fast listing.
 *
 * @example
 * const manager = new SessionManager({ sessionDir: '~/.agent/sessions' });
 * const meta = await manager.saveSession(messages, { name: 'my-session' });
 * const sessions = await manager.listSessions();
 * const session = await manager.loadSession('my-session');
 */
export class SessionManager {
  private readonly sessionDir: string;
  private readonly maxSessions: number;
  private readonly fileSystem: IFileSystem;
  private readonly onDebug?: (msg: string, data?: unknown) => void;

  /**
   * Creates a new SessionManager instance.
   * @param options - Configuration options
   */
  constructor(options: SessionManagerOptions = {}) {
    this.fileSystem = options.fileSystem ?? new NodeFileSystem();
    this.sessionDir = this.fileSystem.resolvePath(options.sessionDir ?? DEFAULT_SESSION_DIR);
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.onDebug = options.onDebug;
    this.debug('SessionManager initialized', {
      sessionDir: this.sessionDir,
      maxSessions: this.maxSessions,
    });
  }

  // ---------------------------------------------------------------------------
  // Public Methods
  // ---------------------------------------------------------------------------

  /**
   * Save a session to disk with metadata.
   * @param messages - Conversation messages to save
   * @param options - Save options (name, description, provider, model)
   * @returns Session metadata
   */
  async saveSession(
    messages: StoredMessage[],
    options: SaveSessionOptions = {}
  ): Promise<SessionMetadata> {
    await this.ensureSessionDir();

    const sessionId = this.generateSessionId(options.name);
    const name = options.name ?? sessionId;

    // Validate session name
    this.validateSessionName(name);

    const now = new Date().toISOString();
    const firstUserMessage = messages.find((m) => m.role === 'user');
    const firstMessage = firstUserMessage?.content.slice(0, 200) ?? '';

    // Check if session already exists to preserve createdAt
    let createdAt = now;
    const sessionPath = this.getSessionPath(sessionId);
    try {
      if (await this.fileSystem.exists(sessionPath)) {
        const existingContent = await this.fileSystem.readFile(sessionPath);
        const existingParsed: unknown = JSON.parse(existingContent);
        if (
          typeof existingParsed === 'object' &&
          existingParsed !== null &&
          'metadata' in existingParsed &&
          typeof (existingParsed as StoredSession).metadata.createdAt === 'string'
        ) {
          createdAt = (existingParsed as StoredSession).metadata.createdAt;
          this.debug('Preserving existing createdAt for session update', { sessionId, createdAt });
        }
      }
    } catch {
      // Ignore errors reading existing session - use current time
    }

    const metadata: SessionMetadata = {
      id: sessionId,
      name,
      description: options.description,
      createdAt,
      lastActivityAt: now,
      messageCount: messages.length,
      firstMessage,
      provider: options.provider ?? 'unknown',
      model: options.model ?? 'unknown',
    };

    const contextSummary = this.generateContextSummary(messages, metadata);

    const storedSession: StoredSession = {
      metadata,
      messages,
      contextSummary,
    };

    // Write session file atomically (temp + rename pattern)
    const content = JSON.stringify(storedSession, null, 2);
    await this.atomicWriteFile(sessionPath, content);

    // Update index
    const index = await this.loadIndex();
    index.sessions[sessionId] = metadata;
    index.updatedAt = now;
    await this.saveIndex(index);

    // Update last session pointer
    await this.saveLastSession(sessionId);

    // Enforce max sessions limit
    await this.enforceMaxSessions();

    this.debug('Session saved', { sessionId, messageCount: messages.length });
    return metadata;
  }

  /**
   * Load a session from disk.
   * @param sessionId - Session ID to load
   * @returns Stored session or null if not found
   * @throws Error if sessionId contains path traversal attempts
   */
  async loadSession(sessionId: string): Promise<StoredSession | null> {
    this.validateSessionId(sessionId);
    const sessionPath = this.getSessionPath(sessionId);

    try {
      if (!(await this.fileSystem.exists(sessionPath))) {
        this.debug('Session not found', { sessionId });
        return null;
      }

      const content = await this.fileSystem.readFile(sessionPath);
      const session = JSON.parse(content) as StoredSession;
      this.debug('Session loaded', { sessionId, messageCount: session.messages.length });
      return session;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.debug('Failed to load session', { sessionId, error: message });
      return null;
    }
  }

  /**
   * List all sessions with metadata.
   * @returns Array of session metadata sorted by lastActivityAt (newest first), then by id
   */
  async listSessions(): Promise<SessionMetadata[]> {
    const index = await this.loadIndex();
    const sessions = Object.values(index.sessions);

    // Sort by lastActivityAt descending (newest first), then by id descending for stable sort
    sessions.sort((a, b) => {
      const dateA = new Date(a.lastActivityAt).getTime();
      const dateB = new Date(b.lastActivityAt).getTime();
      if (dateB !== dateA) {
        return dateB - dateA;
      }
      // Secondary sort by id (descending) for stable ordering when timestamps match
      return b.id.localeCompare(a.id);
    });

    return sessions;
  }

  /**
   * Delete a session and update index.
   * @param sessionId - Session ID to delete
   * @returns true if deleted, false if session didn't exist
   * @throws Error if sessionId contains path traversal attempts
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    this.validateSessionId(sessionId);
    const sessionPath = this.getSessionPath(sessionId);

    if (!(await this.fileSystem.exists(sessionPath))) {
      this.debug('Session not found for deletion', { sessionId });
      return false;
    }

    // Check if this is the last session BEFORE deleting
    const lastSessionPath = this.getLastSessionPath();
    let wasLastSession = false;
    try {
      if (await this.fileSystem.exists(lastSessionPath)) {
        const lastSessionId = (await this.fileSystem.readFile(lastSessionPath)).trim();
        wasLastSession = lastSessionId === sessionId;
      }
    } catch {
      // Ignore errors reading last session
    }

    try {
      await this.fileSystem.unlink(sessionPath);

      // Remove from index
      const index = await this.loadIndex();
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete index.sessions[sessionId];
      index.updatedAt = new Date().toISOString();
      await this.saveIndex(index);

      // Update last session pointer if this was the last session
      if (wasLastSession) {
        // Find next most recent session
        const sessions = await this.listSessions();
        if (sessions.length > 0 && sessions[0] !== undefined) {
          await this.saveLastSession(sessions[0].id);
        } else {
          // No sessions left, clear last session pointer
          await this.clearLastSession();
        }
      }

      this.debug('Session deleted', { sessionId });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.debug('Failed to delete session', { sessionId, error: message });
      return false;
    }
  }

  /**
   * Get the last session ID for --continue.
   * @returns Session ID or null if not set
   */
  async getLastSession(): Promise<string | null> {
    const lastSessionPath = this.getLastSessionPath();

    try {
      if (!(await this.fileSystem.exists(lastSessionPath))) {
        return null;
      }

      const content = await this.fileSystem.readFile(lastSessionPath);
      const sessionId = content.trim();

      // Verify session still exists
      if (sessionId !== '' && (await this.sessionExists(sessionId))) {
        return sessionId;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Delete old sessions beyond the limit.
   * @param keepCount - Number of sessions to keep (default: maxSessions)
   * @returns Number of sessions deleted
   */
  async purgeSessions(keepCount?: number): Promise<number> {
    const limit = keepCount ?? this.maxSessions;
    const sessions = await this.listSessions();

    if (sessions.length <= limit) {
      return 0;
    }

    const toDelete = sessions.slice(limit);
    let deletedCount = 0;

    for (const session of toDelete) {
      if (await this.deleteSession(session.id)) {
        deletedCount++;
      }
    }

    this.debug('Sessions purged', { deletedCount, kept: limit });
    return deletedCount;
  }

  /**
   * Restore session messages and generate context summary.
   * @param sessionId - Session ID to restore
   * @returns Messages and context summary, or null if not found
   */
  async restoreSession(
    sessionId: string
  ): Promise<{ messages: StoredMessage[]; contextSummary: string | null } | null> {
    const session = await this.loadSession(sessionId);

    if (session === null) {
      return null;
    }

    return {
      messages: session.messages,
      contextSummary: session.contextSummary ?? null,
    };
  }

  /**
   * Check if a session exists.
   * @param sessionId - Session ID to check
   * @returns true if session exists
   * @throws Error if sessionId contains path traversal attempts
   */
  async sessionExists(sessionId: string): Promise<boolean> {
    this.validateSessionId(sessionId);
    const sessionPath = this.getSessionPath(sessionId);
    return this.fileSystem.exists(sessionPath);
  }

  /**
   * Get the session directory path.
   */
  getSessionDir(): string {
    return this.sessionDir;
  }

  // ---------------------------------------------------------------------------
  // Private Methods - Index Management
  // ---------------------------------------------------------------------------

  /**
   * Load session index from disk.
   * Creates empty index if not found.
   */
  private async loadIndex(): Promise<SessionIndex> {
    const indexPath = this.getIndexPath();

    try {
      if (!(await this.fileSystem.exists(indexPath))) {
        return this.createEmptyIndex();
      }

      const content = await this.fileSystem.readFile(indexPath);

      const parsed: unknown = JSON.parse(content);

      // Validate index structure - type assertions from JSON.parse need runtime checks
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('version' in parsed) ||
        !('sessions' in parsed) ||
        typeof (parsed as SessionIndex).version !== 'string' ||
        typeof (parsed as SessionIndex).sessions !== 'object'
      ) {
        this.debug('Invalid index structure, rebuilding');
        return await this.rebuildIndex();
      }

      return parsed as SessionIndex;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.debug('Failed to load index, rebuilding', { error: message });
      return this.rebuildIndex();
    }
  }

  /**
   * Save session index to disk.
   */
  private async saveIndex(index: SessionIndex): Promise<void> {
    const indexPath = this.getIndexPath();
    const content = JSON.stringify(index, null, 2);
    await this.atomicWriteFile(indexPath, content);
  }

  /**
   * Create an empty session index.
   */
  private createEmptyIndex(): SessionIndex {
    return {
      version: INDEX_VERSION,
      sessions: {},
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Rebuild index from session files on disk.
   */
  private async rebuildIndex(): Promise<SessionIndex> {
    const index = this.createEmptyIndex();

    try {
      if (!(await this.fileSystem.exists(this.sessionDir))) {
        return index;
      }

      const files = await this.fileSystem.readdir(this.sessionDir);

      for (const filename of files) {
        if (
          filename === 'index.json' ||
          filename === 'last_session' ||
          !filename.endsWith('.json')
        ) {
          continue;
        }

        const sessionId = filename.replace('.json', '');
        const sessionPath = this.getSessionPath(sessionId);

        try {
          const content = await this.fileSystem.readFile(sessionPath);

          const parsed: unknown = JSON.parse(content);

          // Validate session has metadata from JSON.parse
          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'metadata' in parsed &&
            typeof (parsed as StoredSession).metadata === 'object'
          ) {
            index.sessions[sessionId] = (parsed as StoredSession).metadata;
          }
        } catch {
          this.debug('Failed to read session file during rebuild', { filename });
        }
      }

      await this.saveIndex(index);
      this.debug('Index rebuilt', { sessionCount: Object.keys(index.sessions).length });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.debug('Failed to rebuild index', { error: message });
    }

    return index;
  }

  /**
   * Ensure session directory exists.
   */
  private async ensureSessionDir(): Promise<void> {
    if (!(await this.fileSystem.exists(this.sessionDir))) {
      await this.fileSystem.mkdir(this.sessionDir);
      this.debug('Created session directory', { sessionDir: this.sessionDir });
    }
  }

  // ---------------------------------------------------------------------------
  // Private Methods - Last Session
  // ---------------------------------------------------------------------------

  /**
   * Save the last session ID.
   */
  private async saveLastSession(sessionId: string): Promise<void> {
    const lastSessionPath = this.getLastSessionPath();
    await this.atomicWriteFile(lastSessionPath, sessionId);
  }

  /**
   * Clear the last session pointer.
   */
  private async clearLastSession(): Promise<void> {
    const lastSessionPath = this.getLastSessionPath();
    try {
      if (await this.fileSystem.exists(lastSessionPath)) {
        await this.fileSystem.unlink(lastSessionPath);
      }
    } catch {
      // Ignore errors when clearing
    }
  }

  // ---------------------------------------------------------------------------
  // Private Methods - Helpers
  // ---------------------------------------------------------------------------

  /**
   * Enforce maximum sessions limit by deleting oldest sessions.
   */
  private async enforceMaxSessions(): Promise<void> {
    const sessions = await this.listSessions();

    if (sessions.length > this.maxSessions) {
      const toDelete = sessions.slice(this.maxSessions);
      for (const session of toDelete) {
        await this.deleteSession(session.id);
      }
      this.debug('Enforced max sessions limit', { deleted: toDelete.length });
    }
  }

  /**
   * Generate a unique session ID from timestamp.
   * Includes milliseconds and random suffix to prevent collisions.
   */
  private generateSessionId(customName?: string): string {
    if (customName !== undefined) {
      return this.sanitizeSessionName(customName);
    }

    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const millis = String(now.getMilliseconds()).padStart(3, '0');
    // Add random suffix to handle rapid saves within the same millisecond
    // Using cryptographically secure random bytes for security
    const random = randomBytes(3).toString('base64url').slice(0, 4);

    return `${year}-${month}-${day}-${hours}-${minutes}-${seconds}-${millis}-${random}`;
  }

  /**
   * Sanitize a session name for use as filename.
   */
  private sanitizeSessionName(name: string): string {
    // Remove invalid characters, keep alphanumeric, underscore, dash, dot
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, DEFAULT_SESSION_NAME_MAX_LENGTH);
  }

  /**
   * Validate a session name.
   * @throws Error if name is invalid
   */
  private validateSessionName(name: string): void {
    const sanitized = this.sanitizeSessionName(name);

    if (sanitized.length === 0) {
      throw new Error('Session name cannot be empty');
    }

    if (RESERVED_NAMES.has(sanitized.toLowerCase())) {
      throw new Error(`Session name "${sanitized}" is reserved`);
    }

    // Check for path traversal attempts
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      throw new Error('Session name contains invalid characters');
    }
  }

  /**
   * Validate a session ID to prevent path traversal attacks.
   * @throws Error if sessionId is invalid or contains path traversal attempts
   */
  private validateSessionId(sessionId: string): void {
    if (sessionId.length === 0) {
      throw new Error('Session ID cannot be empty');
    }

    // Check for path traversal attempts - reject any path separators or parent directory references
    if (
      sessionId.includes('..') ||
      sessionId.includes('/') ||
      sessionId.includes('\\') ||
      sessionId.includes('\0')
    ) {
      throw new Error('Invalid session ID: path traversal not allowed');
    }

    // Verify the ID only contains safe characters (alphanumeric, dash, underscore, dot)
    if (!/^[a-zA-Z0-9_.-]+$/.test(sessionId)) {
      throw new Error('Invalid session ID: contains invalid characters');
    }
  }

  /**
   * Generate a context summary for AI resume.
   */
  private generateContextSummary(messages: StoredMessage[], metadata: SessionMetadata): string {
    const messageCount = messages.length;
    const userMessages = messages.filter((m) => m.role === 'user');
    const assistantMessages = messages.filter((m) => m.role === 'assistant');

    const lines: string[] = [
      `You are resuming a previous conversation session.`,
      `Session: ${metadata.name}`,
      `Created: ${metadata.createdAt}`,
      `Last activity: ${metadata.lastActivityAt}`,
      `Total messages: ${String(messageCount)} (${String(userMessages.length)} from user, ${String(assistantMessages.length)} from assistant)`,
    ];

    if (metadata.description !== undefined) {
      lines.push(`Description: ${metadata.description}`);
    }

    if (userMessages.length > 0) {
      const firstUserMsg = userMessages[0];
      if (firstUserMsg !== undefined) {
        lines.push(`First topic: ${firstUserMsg.content.slice(0, 100)}...`);
      }
    }

    lines.push('');
    lines.push('The conversation history follows. Continue naturally from where you left off.');

    return lines.join('\n');
  }

  /**
   * Get the path to the session index file.
   */
  private getIndexPath(): string {
    return this.fileSystem.joinPath(this.sessionDir, 'index.json');
  }

  /**
   * Get the path to a session file.
   */
  private getSessionPath(sessionId: string): string {
    return this.fileSystem.joinPath(this.sessionDir, `${sessionId}.json`);
  }

  /**
   * Get the path to the last session pointer file.
   */
  private getLastSessionPath(): string {
    return this.fileSystem.joinPath(this.sessionDir, 'last_session');
  }

  /**
   * Atomically write a file using temp-then-rename pattern.
   * Prevents file corruption if write is interrupted.
   * Uses unique temp names to handle concurrent writes.
   * @param filePath - Final destination path
   * @param content - Content to write
   */
  private async atomicWriteFile(filePath: string, content: string): Promise<void> {
    // Use unique temp name to avoid conflicts with concurrent writes
    // Using cryptographically secure random bytes for security
    const randomSuffix = randomBytes(4).toString('base64url').slice(0, 6);
    const uniqueSuffix = `${String(Date.now())}-${randomSuffix}`;
    const tempPath = `${filePath}.tmp.${uniqueSuffix}`;
    try {
      // Write to temp file first
      await this.fileSystem.writeFile(tempPath, content);
      // Atomically rename to final location
      await this.fileSystem.rename(tempPath, filePath);
    } catch (error) {
      // Clean up temp file if rename failed
      try {
        if (await this.fileSystem.exists(tempPath)) {
          await this.fileSystem.unlink(tempPath);
        }
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Debug logging helper.
   */
  private debug(msg: string, data?: unknown): void {
    this.onDebug?.(msg, data);
  }
}
