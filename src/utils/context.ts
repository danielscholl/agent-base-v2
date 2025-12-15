/**
 * Tool context persistence for memory-efficient handling of tool outputs.
 * Stores tool inputs/outputs to filesystem with metadata, indexed by query/task.
 */

import { createHash } from 'node:crypto';

import type { IFileSystem } from '../config/types.js';
import { NodeFileSystem } from '../config/manager.js';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Default directory for context storage */
const DEFAULT_CONTEXT_DIR = '~/.agent/context';

/** Default threshold in bytes for persisting to disk (32KB) */
const DEFAULT_PERSIST_THRESHOLD = 32 * 1024;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Lightweight pointer to stored context (kept in memory).
 * Contains metadata about the context without loading full data.
 */
export interface ContextPointer {
  /** Full path to context file on disk */
  filepath: string;
  /** Just the filename (for display) */
  filename: string;
  /** Tool that generated this context */
  toolName: string;
  /** Human-readable description of what the tool did */
  toolDescription: string;
  /** Tool input arguments */
  args: Record<string, unknown>;
  /** Optional task ID for grouping */
  taskId?: number;
  /** Query ID that triggered this tool call */
  queryId?: string;
}

/**
 * Full context data stored on disk.
 * Contains complete tool execution information.
 */
export interface StoredContext {
  /** Tool that generated this context */
  toolName: string;
  /** Human-readable description of what the tool did */
  toolDescription: string;
  /** Tool input arguments */
  args: Record<string, unknown>;
  /** ISO 8601 timestamp when context was created */
  timestamp: string;
  /** Optional task ID for grouping */
  taskId?: number;
  /** Query ID that triggered this tool call */
  queryId?: string;
  /** The tool execution result */
  result: unknown;
}

/**
 * Options for ContextManager constructor.
 */
export interface ContextManagerOptions {
  /** Directory for context storage (default: ~/.agent/context) */
  contextDir?: string;
  /** Threshold in bytes for persisting to disk (default: 32KB) */
  persistThreshold?: number;
  /** File system implementation for testing */
  fileSystem?: IFileSystem;
  /** Debug callback for logging */
  onDebug?: (msg: string, data?: unknown) => void;
}

// -----------------------------------------------------------------------------
// ContextManager Class
// -----------------------------------------------------------------------------

/**
 * Manages tool context persistence to filesystem.
 * All tool outputs are persisted to disk as JSON files with metadata.
 * Lightweight pointers are kept in memory for filtering and retrieval.
 *
 * Note: Size-aware memory caching (persistThreshold) is reserved for future use.
 * Current MVP implementation persists all outputs to disk.
 *
 * @example
 * const manager = new ContextManager({ contextDir: '/tmp/context' });
 * const filepath = await manager.saveContext('readFile', { path: '/src/index.ts' }, fileContent);
 * const contexts = await manager.loadContexts([filepath]);
 */
export class ContextManager {
  private readonly contextDir: string;
  /** Reserved for future size-aware caching (not used in MVP) */
  private readonly persistThreshold: number;
  private readonly fileSystem: IFileSystem;
  private readonly onDebug?: (msg: string, data?: unknown) => void;
  private pointers: ContextPointer[] = [];
  private filenameCounter = 0;

  /**
   * Creates a new ContextManager instance.
   * @param options - Configuration options
   */
  constructor(options: ContextManagerOptions = {}) {
    this.fileSystem = options.fileSystem ?? new NodeFileSystem();
    this.contextDir = this.fileSystem.resolvePath(options.contextDir ?? DEFAULT_CONTEXT_DIR);
    this.persistThreshold = options.persistThreshold ?? DEFAULT_PERSIST_THRESHOLD;
    this.onDebug = options.onDebug;
    this.debug('ContextManager initialized', {
      contextDir: this.contextDir,
      persistThreshold: this.persistThreshold,
    });
  }

  // ---------------------------------------------------------------------------
  // Public Methods
  // ---------------------------------------------------------------------------

  /**
   * Save tool execution results with metadata.
   * Creates context directory if it doesn't exist.
   * @param toolName - Name of the tool that executed
   * @param args - Tool input arguments
   * @param result - Tool execution result
   * @param taskId - Optional task ID for grouping
   * @param queryId - Optional query ID for filtering
   * @returns Path to the saved context file
   */
  async saveContext(
    toolName: string,
    args: Record<string, unknown>,
    result: unknown,
    taskId?: number,
    queryId?: string
  ): Promise<string> {
    // Ensure context directory exists
    if (!(await this.fileSystem.exists(this.contextDir))) {
      await this.fileSystem.mkdir(this.contextDir);
      this.debug('Created context directory', { contextDir: this.contextDir });
    }

    const filename = this.generateFilename(toolName, args);
    const filepath = this.fileSystem.joinPath(this.contextDir, filename);
    const toolDescription = this.getToolDescription(toolName, args);

    const storedContext: StoredContext = {
      toolName,
      toolDescription,
      args,
      timestamp: new Date().toISOString(),
      taskId,
      queryId,
      result,
    };

    // Write context to disk
    const content = JSON.stringify(storedContext, null, 2);
    await this.fileSystem.writeFile(filepath, content);

    // Create and store pointer
    const pointer: ContextPointer = {
      filepath,
      filename,
      toolName,
      toolDescription,
      args: { ...args },
      taskId,
      queryId,
    };
    this.pointers.push(pointer);

    this.debug('Context saved', { filepath, toolName, hasQueryId: Boolean(queryId) });
    return filepath;
  }

  /**
   * Get all stored pointers.
   * @returns Copy of all context pointers
   */
  getAllPointers(): ContextPointer[] {
    return this.pointers.map((p) => ({ ...p, args: { ...p.args } }));
  }

  /**
   * Get pointers for a specific query.
   * @param queryId - Query ID to filter by
   * @returns Matching context pointers (copies)
   */
  getPointersForQuery(queryId: string): ContextPointer[] {
    return this.pointers
      .filter((p) => p.queryId === queryId)
      .map((p) => ({ ...p, args: { ...p.args } }));
  }

  /**
   * Get pointers for a specific task.
   * @param taskId - Task ID to filter by
   * @returns Matching context pointers (copies)
   */
  getPointersForTask(taskId: number): ContextPointer[] {
    return this.pointers
      .filter((p) => p.taskId === taskId)
      .map((p) => ({ ...p, args: { ...p.args } }));
  }

  /**
   * Load full context data from disk.
   * @param filepaths - Paths to context files to load
   * @returns Array of loaded contexts (skips missing/invalid files)
   */
  async loadContexts(filepaths: string[]): Promise<StoredContext[]> {
    const contexts: StoredContext[] = [];

    for (const filepath of filepaths) {
      try {
        if (!(await this.fileSystem.exists(filepath))) {
          this.debug('Context file not found, skipping', { filepath });
          continue;
        }

        const content = await this.fileSystem.readFile(filepath);
        const context = JSON.parse(content) as StoredContext;
        contexts.push(context);
        this.debug('Context loaded', { filepath });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.debug('Failed to load context, skipping', { filepath, error: message });
      }
    }

    return contexts;
  }

  /**
   * Select relevant contexts for a query using keyword matching.
   * MVP implementation using heuristic-based scoring.
   * @param query - Search query
   * @param availablePointers - Pointers to score for relevance
   * @returns Filepaths of relevant contexts sorted by score
   */
  selectRelevantContexts(query: string, availablePointers: ContextPointer[]): string[] {
    if (availablePointers.length === 0) {
      return [];
    }

    const queryKeywords = this.extractKeywords(query);
    if (queryKeywords.length === 0) {
      // No keywords to match, return all pointers
      return availablePointers.map((p) => p.filepath);
    }

    // Score each pointer by keyword overlap with tool description
    const scored = availablePointers.map((pointer) => {
      const descKeywords = this.extractKeywords(pointer.toolDescription);
      let score = 0;

      for (const keyword of queryKeywords) {
        if (descKeywords.includes(keyword)) {
          score++;
        }
      }

      return { pointer, score };
    });

    // Filter to pointers with at least one keyword match
    const matches = scored.filter((s) => s.score > 0);

    // If no matches, fall back to all pointers
    if (matches.length === 0) {
      this.debug('No relevant matches, returning all pointers', { query: query.slice(0, 50) });
      return availablePointers.map((p) => p.filepath);
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    return matches.map((s) => s.pointer.filepath);
  }

  /**
   * Generate a unique query ID from a query string.
   * Useful for grouping tool outputs from the same user query.
   * Uses SHA-256 truncated to 16 hex chars for strong uniqueness.
   * @param query - The user query string
   * @returns A unique query ID (hash-based)
   */
  static hashQuery(query: string): string {
    const trimmed = query.trim().toLowerCase();
    const hash = createHash('sha256').update(trimmed).digest('hex').slice(0, 16);
    return `q_${hash}`;
  }

  /**
   * Clear all pointers (in-memory).
   */
  clearPointers(): void {
    this.pointers = [];
    this.debug('Pointers cleared');
  }

  /**
   * Clear context directory (filesystem).
   * Removes all JSON context files from disk.
   */
  async clearContextDir(): Promise<void> {
    if (!(await this.fileSystem.exists(this.contextDir))) {
      this.debug('Context directory does not exist, nothing to clear');
      return;
    }

    let deletedCount = 0;
    try {
      // Read all files in context directory and delete JSON files
      const files = await this.fileSystem.readdir(this.contextDir);
      for (const filename of files) {
        if (filename.endsWith('.json')) {
          const filepath = this.fileSystem.joinPath(this.contextDir, filename);
          try {
            await this.fileSystem.unlink(filepath);
            deletedCount++;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.debug('Failed to delete context file', { filepath, error: message });
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.debug('Failed to read context directory', { error: message });
    }

    this.debug('Context directory cleared', { deletedCount });
  }

  /**
   * Full cleanup (both pointers and filesystem).
   * Call at session end.
   */
  async clear(): Promise<void> {
    await this.clearContextDir();
    this.clearPointers();
    this.debug('Full cleanup completed');
  }

  /**
   * Get the number of stored pointers.
   */
  get size(): number {
    return this.pointers.length;
  }

  /**
   * Get the context directory path.
   */
  getContextDir(): string {
    return this.contextDir;
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Generate a unique filename from tool name, args hash, timestamp, counter, and random suffix.
   * Includes timestamp, counter, and random suffix to prevent overwrites across instances.
   */
  private generateFilename(toolName: string, args: Record<string, unknown>): string {
    const hash = this.hashArgs(args);
    const sanitizedName = toolName.replace(/[^\dA-Za-z]/g, '_');
    const timestamp = Date.now();
    const counter = this.filenameCounter++;
    const random = Math.random().toString(36).slice(2, 6);
    return `${sanitizedName}_${hash}_${String(timestamp)}_${String(counter)}_${random}.json`;
  }

  /**
   * Hash arguments to create a short unique identifier.
   */
  private hashArgs(args: Record<string, unknown>): string {
    const str = JSON.stringify(args);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).slice(0, 8);
  }

  /**
   * Create a human-readable description of what the tool did.
   */
  private getToolDescription(toolName: string, args: Record<string, unknown>): string {
    const argValues = Object.values(args);
    const firstArg = argValues[0];

    // Create description based on common patterns
    if (typeof firstArg === 'string' && firstArg.length > 0) {
      const truncated = firstArg.length > 50 ? `${firstArg.slice(0, 50)}...` : firstArg;
      return `${toolName}: ${truncated}`;
    }

    if (argValues.length > 0) {
      return `${toolName} with ${String(argValues.length)} argument(s)`;
    }

    return toolName;
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
   * Debug logging helper.
   */
  private debug(msg: string, data?: unknown): void {
    this.onDebug?.(msg, data);
  }
}
