/**
 * Custom slash command types and Zod schemas.
 * Defines the structure for user-defined commands from .agent/commands/*.md
 */

import { z } from 'zod';

/**
 * Schema for custom command YAML front matter.
 * Uses z.looseObject to allow unknown fields (lenient validation).
 */
/**
 * Transform argument-hint to string if it's an array.
 * In YAML, [foo] is parsed as an array, but users often mean it as literal text.
 */
const argumentHintTransform = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((val) => {
    if (Array.isArray(val)) {
      return `[${val.join('] [')}]`;
    }
    return val;
  });

/**
 * Transform allowed-tools to string if it's an array.
 * Supports both space-delimited string and YAML array formats.
 */
const allowedToolsTransform = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((val) => {
    if (Array.isArray(val)) {
      return val.join(' ');
    }
    return val;
  });

export const CustomCommandManifestSchema = z.looseObject({
  /** Optional: Override command name (defaults to filename) */
  name: z.string().optional(),
  /** Brief description shown in autocomplete */
  description: z.string().optional(),
  /** Expected arguments hint - accepts string or array (YAML [foo] syntax) */
  'argument-hint': argumentHintTransform,
  /** Tool restrictions - accepts string or array (experimental) */
  'allowed-tools': allowedToolsTransform,
  /** Model override (reserved for future use) */
  model: z.string().optional(),
  /** Command arguments definition (Claude Code compatible) */
  args: z.string().optional(),
  /** Required arguments (Claude Code compatible) */
  required_args: z.array(z.string()).optional(),
  /** Examples (Claude Code compatible) */
  examples: z.array(z.string()).optional(),
});

/**
 * Parsed custom command manifest from YAML front matter.
 */
export interface CustomCommandManifest {
  /** Command name (from filename or front matter) */
  name: string;
  /** Brief description shown in autocomplete */
  description?: string;
  /** Expected arguments hint */
  argumentHint?: string;
  /** Tool restrictions (reserved for future use) */
  allowedTools?: string;
  /** Model override (reserved for future use) */
  model?: string;
  /** Raw front matter for additional fields */
  raw?: Record<string, unknown>;
}

/**
 * Parsed custom command content (manifest + body).
 */
export interface CustomCommandContent {
  /** Parsed manifest from front matter */
  manifest: CustomCommandManifest;
  /** Command body (markdown content after front matter) */
  body: string;
}

/**
 * Source type for custom commands.
 * - 'bundled': Shipped with the agent (src/_bundled_commands/)
 * - 'user': User's personal commands (~/.agent/commands/)
 * - 'claude': Claude Code compatible commands (./.claude/commands/)
 * - 'project': Project-specific commands (.agent/commands/)
 */
export type CustomCommandSource = 'bundled' | 'user' | 'claude' | 'project';

/**
 * Discovered custom command with metadata.
 */
export interface DiscoveredCustomCommand {
  /** Parsed content */
  content: CustomCommandContent;
  /** Full path to the command file */
  path: string;
  /** Command name (derived from filename) */
  name: string;
  /** Source (project or user) */
  source: CustomCommandSource;
  /** Namespace from subdirectory (e.g., "frontend" for .agent/commands/frontend/build.md) */
  namespace?: string;
}

/**
 * Error types for custom command operations.
 */
export type CustomCommandErrorType = 'PARSE_ERROR' | 'VALIDATION_ERROR' | 'IO_ERROR' | 'NOT_FOUND';

/**
 * Error from custom command discovery or execution.
 */
export interface CustomCommandError {
  /** Path to the problematic file */
  path: string;
  /** Error message */
  message: string;
  /** Error type */
  type: CustomCommandErrorType;
}

/**
 * Result of custom command discovery.
 */
export interface CustomCommandDiscoveryResult {
  /** Successfully discovered commands */
  commands: DiscoveredCustomCommand[];
  /** Errors encountered during discovery */
  errors: CustomCommandError[];
}

/**
 * Result of custom command execution.
 */
export type CustomCommandExecutionResult =
  | { success: true; prompt: string; commandName: string }
  | { success: false; error: string; type: CustomCommandErrorType };

/**
 * Options for custom command loader.
 */
export interface CustomCommandLoaderOptions {
  /** Workspace root directory (defaults to cwd) */
  workspaceRoot?: string;
  /** User commands directory (defaults to ~/.agent/commands) */
  userDir?: string;
  /** Claude commands directory (defaults to ./.claude/commands) for Claude Code compatibility */
  claudeDir?: string;
  /** Bundled commands directory (defaults to getBundledCommandsDir()) */
  bundledDir?: string;
  /** Debug callback */
  onDebug?: (msg: string, data?: unknown) => void;
}
