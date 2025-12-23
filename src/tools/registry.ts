/**
 * Tool Registry - centralized tool management with lazy initialization.
 *
 * Provides:
 * - Registration of Tool.Info definitions
 * - Lazy initialization with caching
 * - Permission-based tool filtering
 * - Conversion to LangChain StructuredToolInterface
 * - Preservation of structured Tool.Result for metadata streaming
 *
 * @example
 * ```typescript
 * import { ToolRegistry } from './registry.js';
 * import { readTool } from './read.js';
 * import { writeTool } from './write.js';
 *
 * // Register tools
 * ToolRegistry.register(readTool);
 * ToolRegistry.register(writeTool);
 *
 * // Get initialized tools for LangChain
 * const tools = await ToolRegistry.tools({ createContext: () => myContext });
 * ```
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DynamicStructuredTool } from '@langchain/core/tools';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { z } from 'zod';
import { getWorkspaceRoot } from './workspace.js';
import { Tool } from './tool.js';

/**
 * Tool permission levels.
 */
export type ToolPermission = 'read' | 'write' | 'execute' | 'network';

/**
 * Tool permission configuration.
 */
export interface ToolPermissions {
  /** Required permissions for this tool */
  required: ToolPermission[];
  /** Optional permissions that enhance functionality */
  optional?: ToolPermission[];
}

/**
 * Last execution result for a tool.
 */
export interface ToolExecutionResult<M extends Tool.Metadata = Tool.Metadata> {
  /** Tool ID that was executed */
  toolId: string;
  /** Full structured result */
  result: Tool.Result<M>;
  /** Execution timestamp */
  timestamp: number;
  /** Whether execution succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Registered tool entry with metadata.
 */
interface RegisteredTool {
  /** Tool.Info definition */
  info: Tool.Info;
  /** Required permissions */
  permissions: ToolPermissions;
  /** Path to external description file (optional) */
  descriptionPath?: string;
  /** Cached initialized tool (lazy loading) */
  initialized?: Tool.Initialized;
  /** Cached LangChain tool wrapper */
  langchainTool?: StructuredToolInterface;
}

/**
 * Tool Registry namespace for centralized tool management.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ToolRegistry {
  /** Internal registry state */
  const registry = new Map<string, RegisteredTool>();

  /** Initialization cache key (includes context hash) */
  let initCacheKey: string | null = null;

  /** Last execution results by tool ID */
  const lastResults = new Map<string, ToolExecutionResult>();

  /** Callback for tool result streaming */
  let onToolResult: ((result: ToolExecutionResult) => void) | undefined;

  /**
   * Set callback for receiving structured tool results.
   * This allows the Agent to receive full Tool.Result including metadata.
   * @deprecated Use per-context callbacks instead via createContext
   */
  export function setResultCallback(
    callback: ((result: ToolExecutionResult) => void) | undefined
  ): void {
    onToolResult = callback;
  }

  /**
   * Get the current result callback.
   * Used internally by createLangChainTool.
   */
  export function getResultCallback(): ((result: ToolExecutionResult) => void) | undefined {
    return onToolResult;
  }

  /**
   * Get last execution result for a tool.
   */
  export function getLastResult(toolId: string): ToolExecutionResult | undefined {
    return lastResults.get(toolId);
  }

  /**
   * Store a tool execution result.
   * Used by createLangChainTool to update lastResults from outside the namespace.
   */
  export function storeResult(toolId: string, result: ToolExecutionResult): void {
    lastResults.set(toolId, result);
  }

  /**
   * Expand template variables in description content.
   * Supports: ${workspace}, ${directory}, ${cwd}
   * - ${workspace}: AGENT_WORKSPACE_ROOT or cwd (sandbox root)
   * - ${directory}, ${cwd}: Current working directory from initCtx
   */
  function expandTemplateVariables(content: string, initCtx?: Tool.InitContext): string {
    const workingDir = initCtx?.workingDir ?? process.cwd();
    const workspaceRoot = getWorkspaceRoot();

    return content
      .replace(/\$\{workspace\}/g, workspaceRoot)
      .replace(/\$\{directory\}/g, workingDir)
      .replace(/\$\{cwd\}/g, workingDir);
  }

  /**
   * Load description from external file.
   * Falls back to embedded description if file not found.
   * Expands template variables like ${workspace}.
   */
  async function loadDescription(
    descPath: string | undefined,
    fallback: string,
    initCtx?: Tool.InitContext
  ): Promise<string> {
    if (descPath === undefined || descPath === '') return fallback;

    try {
      const content = await fs.readFile(descPath, 'utf-8');
      return expandTemplateVariables(content.trim(), initCtx);
    } catch {
      // File not found or unreadable, use fallback
      return fallback;
    }
  }

  /**
   * Register a tool definition.
   *
   * @param info - Tool.Info definition
   * @param options - Registration options
   */
  export function register(
    info: Tool.Info,
    options?: {
      permissions?: ToolPermissions;
      descriptionPath?: string;
    }
  ): void {
    const permissions = options?.permissions ?? { required: ['read'] };

    if (registry.has(info.id)) {
      // Allow re-registration (useful for hot reloading)
      const existing = registry.get(info.id);
      if (existing) {
        existing.info = info;
        existing.permissions = permissions;
        existing.descriptionPath = options?.descriptionPath;
        // Clear cache to force re-initialization
        existing.initialized = undefined;
        existing.langchainTool = undefined;
      }
    } else {
      registry.set(info.id, {
        info,
        permissions,
        descriptionPath: options?.descriptionPath,
      });
    }
  }

  /**
   * Unregister a tool by ID.
   *
   * @param id - Tool ID to remove
   * @returns true if tool was removed, false if not found
   */
  export function unregister(id: string): boolean {
    lastResults.delete(id);
    return registry.delete(id);
  }

  /**
   * Get all registered tool IDs.
   */
  export function ids(): string[] {
    return Array.from(registry.keys());
  }

  /**
   * Get all registered tool infos.
   */
  export function all(): Tool.Info[] {
    return Array.from(registry.values()).map((entry) => entry.info);
  }

  /**
   * Get a specific tool by ID.
   */
  export function get(id: string): Tool.Info | undefined {
    return registry.get(id)?.info;
  }

  /**
   * Check if a tool is registered.
   */
  export function has(id: string): boolean {
    return registry.has(id);
  }

  /**
   * Get permissions for a tool.
   */
  export function permissions(id: string): ToolPermissions | undefined {
    return registry.get(id)?.permissions;
  }

  /**
   * Filter tools by enabled permissions.
   *
   * @param enabledPermissions - Set of permissions that are enabled
   * @returns Tool IDs that have their required permissions satisfied
   */
  export function enabled(enabledPermissions: Set<ToolPermission>): string[] {
    const result: string[] = [];

    for (const [id, entry] of registry) {
      const hasRequired = entry.permissions.required.every((p) => enabledPermissions.has(p));
      if (hasRequired) {
        result.push(id);
      }
    }

    return result;
  }

  /**
   * Initialize a specific tool by ID.
   *
   * @param id - Tool ID to initialize
   * @param initCtx - Initialization context
   * @returns Initialized tool or undefined if not found
   */
  export async function initialize(
    id: string,
    initCtx?: Tool.InitContext
  ): Promise<Tool.Initialized | undefined> {
    const entry = registry.get(id);
    if (!entry) {
      return undefined;
    }

    // Return cached if available
    if (entry.initialized) {
      return entry.initialized;
    }

    // Initialize tool
    const initialized = await entry.info.init(initCtx);

    // Load external description if available (with template expansion)
    if (entry.descriptionPath !== undefined && entry.descriptionPath !== '') {
      const description = await loadDescription(
        entry.descriptionPath,
        initialized.description,
        initCtx
      );
      // Create new initialized with loaded description
      entry.initialized = {
        ...initialized,
        description,
      };
    } else {
      entry.initialized = initialized;
    }

    return entry.initialized;
  }

  /**
   * Execute a tool directly by ID.
   * Preserves full structured result and streams via callback.
   *
   * @param id - Tool ID to execute
   * @param args - Tool arguments
   * @param ctx - Execution context
   * @param initCtx - Optional initialization context (for first-time init)
   */
  export async function execute<M extends Tool.Metadata = Tool.Metadata>(
    id: string,
    args: Record<string, unknown>,
    ctx: Tool.Context<M>,
    initCtx?: Tool.InitContext
  ): Promise<ToolExecutionResult<M>> {
    const entry = registry.get(id);
    if (!entry) {
      const result: ToolExecutionResult<M> = {
        toolId: id,
        result: {
          title: `Tool not found: ${id}`,
          metadata: {} as M,
          output: `Tool '${id}' is not registered`,
        },
        timestamp: Date.now(),
        success: false,
        error: `Tool '${id}' not found`,
      };
      lastResults.set(id, result as ToolExecutionResult);
      onToolResult?.(result as ToolExecutionResult);
      return result;
    }

    // Ensure initialized (uses initialize() to handle external descriptions)
    if (!entry.initialized) {
      await initialize(id, initCtx);
    }

    // entry.initialized should now be set by initialize()
    if (!entry.initialized) {
      const result: ToolExecutionResult<M> = {
        toolId: id,
        result: {
          title: `Tool initialization failed: ${id}`,
          metadata: {} as M,
          output: `Tool '${id}' could not be initialized`,
        },
        timestamp: Date.now(),
        success: false,
        error: `Tool '${id}' initialization failed`,
      };
      lastResults.set(id, result as ToolExecutionResult);
      onToolResult?.(result as ToolExecutionResult);
      return result;
    }

    const startTime = Date.now();

    try {
      const toolResult = await entry.initialized.execute(args, ctx);

      const execResult: ToolExecutionResult<M> = {
        toolId: id,
        result: toolResult as Tool.Result<M>,
        timestamp: startTime,
        success: true,
      };

      lastResults.set(id, execResult as ToolExecutionResult);
      onToolResult?.(execResult as ToolExecutionResult);
      return execResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const execResult: ToolExecutionResult<M> = {
        toolId: id,
        result: {
          title: `Error executing ${id}`,
          metadata: {} as M,
          output: `Error: ${message}`,
        },
        timestamp: startTime,
        success: false,
        error: message,
      };

      lastResults.set(id, execResult as ToolExecutionResult);
      onToolResult?.(execResult as ToolExecutionResult);
      return execResult;
    }
  }

  /**
   * Get initialized tools as LangChain StructuredToolInterface array.
   * Uses lazy initialization with caching.
   *
   * @param options - Options for tool retrieval
   * @returns Array of LangChain-compatible tools
   */
  export async function tools(options?: {
    /** Filter to specific tool IDs */
    ids?: string[];
    /** Only include tools with these permissions satisfied */
    enabledPermissions?: Set<ToolPermission>;
    /** Initialization context */
    initCtx?: Tool.InitContext;
    /** Context factory for tool execution */
    createContext?: (toolId: string, callId: string) => Tool.Context;
    /**
     * Per-agent callback for receiving structured tool results.
     * When provided, creates fresh tool wrappers (not cached) to ensure
     * the callback is properly scoped to this agent.
     */
    onToolResult?: (result: ToolExecutionResult) => void;
  }): Promise<StructuredToolInterface[]> {
    const {
      ids: filterIds,
      enabledPermissions,
      initCtx,
      createContext,
      onToolResult: agentCallback,
    } = options ?? {};

    // Determine which tools to include
    let toolIds: string[];
    if (filterIds) {
      toolIds = filterIds.filter((id) => registry.has(id));
    } else if (enabledPermissions) {
      toolIds = enabled(enabledPermissions);
    } else {
      toolIds = Array.from(registry.keys());
    }

    // Build cache key for this initialization
    const cacheKey = JSON.stringify({
      ids: toolIds.sort(),
      workingDir: initCtx?.workingDir,
    });

    // Initialize tools if cache key changed
    const needsReinit = cacheKey !== initCacheKey;
    if (needsReinit) {
      initCacheKey = cacheKey;
    }

    // If agent provides a callback, create fresh wrappers (not cached)
    // to ensure proper callback scoping per-agent
    const useAgentCallback = agentCallback !== undefined;

    // Initialize and convert to LangChain tools
    const result: StructuredToolInterface[] = [];

    for (const id of toolIds) {
      const entry = registry.get(id);
      if (!entry) continue;

      // Initialize if needed
      if (!entry.initialized || needsReinit) {
        await initialize(id, initCtx);
        entry.langchainTool = undefined; // Clear cached wrapper
      }

      if (!entry.initialized) continue;

      if (useAgentCallback) {
        // Create fresh wrapper with agent-specific callback
        const wrapper = createLangChainTool(
          entry.info.id,
          entry.initialized,
          createContext,
          agentCallback
        );
        result.push(wrapper);
      } else {
        // Use cached wrapper with global callback
        if (!entry.langchainTool) {
          entry.langchainTool = createLangChainTool(
            entry.info.id,
            entry.initialized,
            createContext,
            getResultCallback()
          );
        }
        result.push(entry.langchainTool);
      }
    }

    return result;
  }

  /**
   * Clear all registered tools.
   * Useful for testing.
   */
  export function clear(): void {
    registry.clear();
    lastResults.clear();
    initCacheKey = null;
  }

  /**
   * Get registry size.
   */
  export function size(): number {
    return registry.size;
  }
}

/**
 * Generate a unique call ID for tool execution.
 */
function generateCallId(): string {
  return `call-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a LangChain DynamicStructuredTool from an initialized Tool.
 * Preserves full structured result via callback and lastResults storage.
 *
 * @param id - Tool ID
 * @param initialized - Initialized tool instance
 * @param createContext - Optional context factory
 * @param resultCallback - Optional callback for structured results (per-agent or global)
 */
function createLangChainTool(
  id: string,
  initialized: Tool.Initialized,
  createContext?: (toolId: string, callId: string) => Tool.Context,
  resultCallback?: (result: ToolExecutionResult) => void
): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: id,
    description: initialized.description,
    schema: initialized.parameters as z.ZodObject<z.ZodRawShape>,
    func: async (input: z.infer<typeof initialized.parameters>) => {
      const callId = generateCallId();

      // Create context for this execution
      const ctx = createContext?.(id, callId) ?? Tool.createNoopContext({ callID: callId });

      try {
        const result = await initialized.execute(input, ctx);

        // Store result for retrieval via getLastResult()
        const execResult: ToolExecutionResult = {
          toolId: id,
          result,
          timestamp: Date.now(),
          success: true,
        };

        // Store in registry for getLastResult() access
        ToolRegistry.storeResult(id, execResult);

        // Emit via callback (per-agent or global)
        if (resultCallback) {
          resultCallback(execResult);
        }

        // Return formatted string for LLM consumption
        // Include title as a header for context
        return `${result.title}\n\n${result.output}`;
      } catch (error) {
        // Convert errors to string output
        const message = error instanceof Error ? error.message : String(error);

        // Store error result
        const execResult: ToolExecutionResult = {
          toolId: id,
          result: {
            title: `Error: ${id}`,
            metadata: {},
            output: `Error: ${message}`,
          },
          timestamp: Date.now(),
          success: false,
          error: message,
        };

        // Store in registry for getLastResult() access
        ToolRegistry.storeResult(id, execResult);

        // Emit via callback
        if (resultCallback) {
          resultCallback(execResult);
        }

        return `Error: ${message}`;
      }
    },
  });
}

/**
 * Auto-register built-in tools.
 * Called from index.ts to populate registry on import.
 */
export function registerBuiltinTools(
  toolsDir: string,
  tools: Array<{ tool: Tool.Info; permissions?: ToolPermissions }>
): void {
  for (const { tool, permissions } of tools) {
    const descriptionPath = path.join(toolsDir, `${tool.id}.txt`);
    ToolRegistry.register(tool, {
      permissions,
      descriptionPath,
    });
  }
}
