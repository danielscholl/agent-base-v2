/**
 * Tool namespace - OpenCode-style tool definition pattern.
 *
 * Provides:
 * - Tool.Context<M> with session info, abort signal, and metadata callback
 * - Tool.Info<P, M> for tool definition with async initialization
 * - Tool.Result for standardized tool responses
 * - Tool.define() factory for creating tools
 *
 * @example
 * ```typescript
 * import { Tool } from './tool.js';
 * import { z } from 'zod';
 *
 * const helloTool = Tool.define('hello', {
 *   description: 'Say hello to someone',
 *   parameters: z.object({ name: z.string() }),
 *   execute: async (args, ctx) => ({
 *     title: `Greeted ${args.name}`,
 *     metadata: {},
 *     output: `Hello, ${args.name}!`,
 *   }),
 * });
 * ```
 */

import type { z } from 'zod';

/**
 * Tool namespace containing all type definitions and the define() factory.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Tool {
  /**
   * Base metadata type - tools can extend with specific metadata.
   * Uses index signature for TypeScript compatibility.
   */
  export interface Metadata {
    [key: string]: unknown;
  }

  /**
   * Attachment type for binary content (images, PDFs, etc.)
   */
  export interface Attachment {
    /** MIME type of the attachment */
    type: string;
    /** Base64-encoded data or URL */
    data: string;
    /** Optional filename */
    filename?: string;
  }

  /**
   * Tool execution context provided to execute() function.
   * Contains session info, abort signal, and metadata streaming callback.
   */
  export interface Context<M extends Metadata = Metadata> {
    /** Session ID for the current conversation */
    sessionID: string;
    /** Message ID for the current turn */
    messageID: string;
    /** Agent name executing the tool */
    agent: string;
    /** Abort signal for cancellation support */
    abort: AbortSignal;
    /** Optional tool call ID (for parallel tool execution tracking) */
    callID?: string;
    /** Extra context data passed from agent */
    extra?: Record<string, unknown>;
    /**
     * Stream metadata updates during execution.
     * Use this for progress updates, status changes, etc.
     */
    metadata(input: { title?: string; metadata?: Partial<M> }): void;
  }

  /**
   * Context for tool initialization.
   * Passed to init() function for setup tasks.
   */
  export interface InitContext {
    /** Working directory for the tool */
    workingDir?: string;
    /** Optional debug callback */
    onDebug?: (message: string, data?: Record<string, unknown>) => void;
  }

  /**
   * Tool execution result.
   * Standardized response format for all tools.
   */
  export interface Result<M extends Metadata = Metadata> {
    /** Short title describing what was done */
    title: string;
    /** Tool-specific metadata */
    metadata: M;
    /** Text output (consumed by LLM) */
    output: string;
    /** Optional binary attachments */
    attachments?: Attachment[];
  }

  /**
   * Initialized tool ready for execution.
   * Returned by init() function.
   */
  export interface Initialized<P extends z.ZodType = z.ZodType, M extends Metadata = Metadata> {
    /** Tool description (for LLM consumption, keep under 40 tokens) */
    description: string;
    /** Zod schema for input parameters */
    parameters: P;
    /** Execute the tool with validated parameters */
    execute(args: z.infer<P>, ctx: Context<M>): Result<M> | Promise<Result<M>>;
  }

  /**
   * Tool definition containing id and init function.
   */
  export interface Info<P extends z.ZodType = z.ZodType, M extends Metadata = Metadata> {
    /** Unique tool identifier */
    id: string;
    /**
     * Initialize the tool.
     * Can be async to load resources, discover capabilities, etc.
     */
    init: (ctx?: InitContext) => Initialized<P, M> | Promise<Initialized<P, M>>;
  }

  /**
   * Shorthand definition for tools that don't need async initialization.
   * Allows passing the Initialized object directly instead of an init function.
   */
  export type Definition<P extends z.ZodType = z.ZodType, M extends Metadata = Metadata> =
    | Info<P, M>['init']
    | Initialized<P, M>;

  /**
   * Create a tool definition with the given id and initialization.
   *
   * @param id - Unique tool identifier (e.g., 'read', 'bash', 'glob')
   * @param definition - Either an async init function or a static Initialized object
   * @returns Tool.Info ready for registration
   *
   * @example Async initialization (for tools that need setup):
   * ```typescript
   * const taskTool = Tool.define('task', async (ctx) => {
   *   const agents = await discoverAgents();
   *   return {
   *     description: `Launch subagent. Available: ${agents.join(', ')}`,
   *     parameters: taskSchema,
   *     execute: async (args, ctx) => { ... },
   *   };
   * });
   * ```
   *
   * @example Static definition (for simple tools):
   * ```typescript
   * const helloTool = Tool.define('hello', {
   *   description: 'Say hello',
   *   parameters: z.object({ name: z.string() }),
   *   execute: async (args) => ({
   *     title: `Greeted ${args.name}`,
   *     metadata: {},
   *     output: `Hello, ${args.name}!`,
   *   }),
   * });
   * ```
   */
  export function define<P extends z.ZodType, M extends Metadata = Metadata>(
    id: string,
    definition: Definition<P, M>
  ): Info<P, M> {
    // If definition is a function, use it as init directly
    // Otherwise, wrap the static definition in an async function
    const init: Info<P, M>['init'] =
      typeof definition === 'function' ? definition : () => definition;

    return {
      id,
      init,
    };
  }

  /**
   * Create a no-op context for testing or default scenarios.
   * All callbacks do nothing, abort is never signaled.
   */
  export function createNoopContext<M extends Metadata = Metadata>(
    overrides?: Partial<Context<M>>
  ): Context<M> {
    return {
      sessionID: 'test-session',
      messageID: 'test-message',
      agent: 'test-agent',
      abort: new AbortController().signal,
      metadata: () => {}, // no-op
      ...overrides,
    };
  }

  /**
   * Check if a value is a Tool.Info object.
   */
  export function isInfo<P extends z.ZodType, M extends Metadata>(
    value: unknown
  ): value is Info<P, M> {
    return (
      typeof value === 'object' &&
      value !== null &&
      'id' in value &&
      'init' in value &&
      typeof (value as Info<P, M>).id === 'string' &&
      typeof (value as Info<P, M>).init === 'function'
    );
  }
}
