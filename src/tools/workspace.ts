/**
 * Filesystem utilities for workspace path resolution and validation.
 *
 * Provides shared utilities used by individual file tools (read, write, edit, etc.):
 * - Workspace sandboxing with path traversal protection
 * - Symlink-safe path resolution
 * - System error mapping
 * - Cross-platform path handling
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ToolErrorCode } from './types.js';

// =============================================================================
// Constants
// =============================================================================

/** Default max bytes to read from a file (1MB) */
export const DEFAULT_MAX_READ_BYTES = 1024 * 1024;

/** Default max bytes to write to a file (1MB) */
export const DEFAULT_MAX_WRITE_BYTES = 1024 * 1024;

/** Default max directory entries to return */
export const DEFAULT_MAX_ENTRIES = 200;

/** Maximum directory entries cap */
export const MAX_ENTRIES_CAP = 500;

/** Default max lines to read */
export const DEFAULT_MAX_LINES = 200;

/** Maximum lines cap */
export const MAX_LINES_CAP = 1000;

/** Default max search matches */
export const DEFAULT_MAX_MATCHES = 50;

/** Snippet truncation length */
export const SNIPPET_MAX_LENGTH = 200;

/** Binary detection sample size */
export const BINARY_CHECK_SIZE = 8192;

// =============================================================================
// Path Utilities
// =============================================================================

/**
 * Get workspace root from environment or current directory.
 * Priority: AGENT_WORKSPACE_ROOT env var > process.cwd()
 *
 * Note: For startup initialization with config, use initializeWorkspaceRoot() first.
 */
export function getWorkspaceRoot(): string {
  const envRoot = process.env['AGENT_WORKSPACE_ROOT'];
  if (envRoot !== undefined && envRoot !== '') {
    // Expand ~ to home directory
    const expanded = envRoot.startsWith('~') ? path.join(os.homedir(), envRoot.slice(1)) : envRoot;
    return path.resolve(expanded);
  }
  return process.cwd();
}

/**
 * Expand a path, resolving ~ to home directory.
 */
function expandPath(inputPath: string): string {
  if (inputPath.startsWith('~')) {
    return path.join(os.homedir(), inputPath.slice(1));
  }
  return inputPath;
}

/**
 * Check if a path is within another path (child of or equal to).
 * Uses path.relative() to avoid issues with case-insensitive filesystems.
 */
function isPathWithin(child: string, parent: string): boolean {
  const resolvedChild = path.resolve(child);
  const resolvedParent = path.resolve(parent);
  const relative = path.relative(resolvedParent, resolvedChild);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Result of workspace root initialization.
 */
export interface WorkspaceInitResult {
  /** The effective workspace root */
  workspaceRoot: string;
  /** Source of the workspace root: 'env', 'config', or 'cwd' */
  source: 'env' | 'config' | 'cwd';
  /** Warning message if config was ignored */
  warning?: string;
}

/**
 * Resolve path to its real path, following symlinks.
 * Returns resolved path on error (path may not exist yet).
 */
async function safeRealpath(inputPath: string): Promise<string> {
  try {
    return await fs.realpath(inputPath);
  } catch {
    return path.resolve(inputPath);
  }
}

/**
 * Initialize workspace root from config, respecting env var as hard cap.
 *
 * Precedence rules (for sandbox/container security):
 * 1. AGENT_WORKSPACE_ROOT env var is the authoritative hard cap
 * 2. config.agent.workspaceRoot only applies when env var is unset
 * 3. If both are set, config must be within env root (narrowing only)
 *    - Uses realpath to detect symlink escape attempts
 *    - If config resolves outside env root, it's ignored with a warning
 * 4. Falls back to process.cwd() if nothing is set
 *
 * **Side Effect:** This function modifies `process.env['AGENT_WORKSPACE_ROOT']`
 * when config is applied (cases 2 and 3). This ensures tools using `getWorkspaceRoot()`
 * see the effective workspace. Callers should be aware of this global state mutation.
 *
 * Call this at agent startup to ensure workspace is properly configured.
 *
 * @param configWorkspaceRoot - The config.agent.workspaceRoot value
 * @param onDebug - Optional debug callback
 * @returns The effective workspace root and source (includes warning if config was rejected)
 */
export async function initializeWorkspaceRoot(
  configWorkspaceRoot?: string,
  onDebug?: (msg: string, data?: unknown) => void
): Promise<WorkspaceInitResult> {
  const envRoot = process.env['AGENT_WORKSPACE_ROOT'];
  const hasEnvRoot = envRoot !== undefined && envRoot !== '';
  const hasConfigRoot = configWorkspaceRoot !== undefined && configWorkspaceRoot !== '';

  // Case 1: Only env var set - use it (authoritative)
  if (hasEnvRoot && !hasConfigRoot) {
    const resolved = path.resolve(expandPath(envRoot));
    onDebug?.('Workspace root from env var', { workspaceRoot: resolved });
    return { workspaceRoot: resolved, source: 'env' };
  }

  // Case 2: Only config set - use it and set env var for tools
  if (!hasEnvRoot && hasConfigRoot) {
    const resolved = path.resolve(expandPath(configWorkspaceRoot));
    process.env['AGENT_WORKSPACE_ROOT'] = resolved;
    onDebug?.('Workspace root from config (set env var)', { workspaceRoot: resolved });
    return { workspaceRoot: resolved, source: 'config' };
  }

  // Case 3: Both set - config must be within env root (narrow only)
  // Use realpath to detect symlink escape attempts
  if (hasEnvRoot && hasConfigRoot) {
    const resolvedEnv = path.resolve(expandPath(envRoot));
    const resolvedConfig = path.resolve(expandPath(configWorkspaceRoot));

    // Get real path of env root
    const realEnv = await safeRealpath(resolvedEnv);

    // For config path, we need to handle both existing and non-existing paths:
    // - If it exists, use realpath to check for symlink escapes
    // - If it doesn't exist, check if it's logically within the env root
    //   (using both resolved and real env paths for macOS /var->/private/var compat)
    let realConfig: string;
    try {
      realConfig = await fs.realpath(resolvedConfig);
    } catch {
      // Path doesn't exist - walk parents to find first existing one and check with realpath
      // This catches symlink escapes via parent directories (e.g., /workspace/link/newroot where link -> /tmp)
      let checkPath = resolvedConfig;
      let parentReal: string | null = null;
      let parentPath: string | null = null;

      while (checkPath !== resolvedEnv && checkPath !== path.dirname(checkPath)) {
        const currentParent = path.dirname(checkPath);
        try {
          const currentParentReal = await fs.realpath(currentParent);
          // Found an existing parent - verify it's within env root
          if (!isPathWithin(currentParentReal, realEnv)) {
            // Parent symlink escapes env root
            const warning = `config.agent.workspaceRoot parent (${currentParent} → ${currentParentReal}) is a symlink that resolves outside AGENT_WORKSPACE_ROOT (${realEnv}). Config ignored for security.`;
            onDebug?.('Workspace config ignored (parent symlink escape)', {
              envRoot: resolvedEnv,
              configRoot: resolvedConfig,
              parentPath: currentParent,
              parentReal: currentParentReal,
              realEnv,
            });
            return { workspaceRoot: resolvedEnv, source: 'env', warning };
          }
          // Parent is safe - record it and break
          parentReal = currentParentReal;
          parentPath = currentParent;
          break;
        } catch {
          // Parent doesn't exist either, keep walking up
          checkPath = currentParent;
        }
      }

      // Validate that we found a safe parent or reached resolvedEnv
      if (parentReal === null) {
        // Loop terminated without finding an existing parent
        // This means we walked up to resolvedEnv or filesystem root
        // Verify the config path is logically within resolvedEnv
        if (!isPathWithin(resolvedConfig, resolvedEnv)) {
          const warning = `config.agent.workspaceRoot (${resolvedConfig}) is outside AGENT_WORKSPACE_ROOT (${resolvedEnv}). Config ignored for security.`;
          onDebug?.('Workspace config ignored (outside env root, no existing parent)', {
            envRoot: resolvedEnv,
            configRoot: resolvedConfig,
            realEnv,
          });
          return { workspaceRoot: resolvedEnv, source: 'env', warning };
        }
        // Config is logically within env root but path doesn't exist yet
        // Use resolvedConfig as effective root
        process.env['AGENT_WORKSPACE_ROOT'] = resolvedConfig;
        onDebug?.(
          'Workspace root narrowed by config (path does not exist yet, no existing parent)',
          {
            envRoot: resolvedEnv,
            configRoot: resolvedConfig,
            effectiveRoot: resolvedConfig,
            realEnv,
          }
        );
        return { workspaceRoot: resolvedConfig, source: 'config' };
      }

      // All existing parents are within env root - valid narrowing
      // Pin to real path to prevent later symlink retargeting
      // Reconstruct path by joining parent's real path with remaining relative path
      // parentPath is set together with parentReal, so use it directly
      const effectiveRoot = path.join(parentReal, path.relative(parentPath ?? '', resolvedConfig));

      process.env['AGENT_WORKSPACE_ROOT'] = effectiveRoot;
      onDebug?.('Workspace root narrowed by config (path does not exist yet)', {
        envRoot: resolvedEnv,
        configRoot: resolvedConfig,
        effectiveRoot,
        realEnv,
        parentReal,
        parentPath,
      });
      return { workspaceRoot: effectiveRoot, source: 'config' };
    }

    // Config path exists - check if real path is within real env path (symlink-safe)
    if (isPathWithin(realConfig, realEnv)) {
      // Config narrows the env root - valid
      // Pin to real path to prevent later symlink retargeting
      process.env['AGENT_WORKSPACE_ROOT'] = realConfig;
      onDebug?.('Workspace root narrowed by config', {
        envRoot: resolvedEnv,
        configRoot: resolvedConfig,
        realEnv,
        realConfig,
      });
      return { workspaceRoot: realConfig, source: 'config' };
    } else {
      // Config resolves outside env root (possibly via symlink) - ignore with warning
      const warning =
        realConfig !== resolvedConfig
          ? `config.agent.workspaceRoot (${resolvedConfig} → ${realConfig}) is a symlink that resolves outside AGENT_WORKSPACE_ROOT (${realEnv}). Config ignored for security.`
          : `config.agent.workspaceRoot (${resolvedConfig}) is outside AGENT_WORKSPACE_ROOT (${resolvedEnv}). Config ignored for security.`;
      onDebug?.('Workspace config ignored (outside env root)', {
        envRoot: resolvedEnv,
        configRoot: resolvedConfig,
        realEnv,
        realConfig,
      });
      return { workspaceRoot: resolvedEnv, source: 'env', warning };
    }
  }

  // Case 4: Neither set - use cwd
  const cwd = process.cwd();
  onDebug?.('Workspace root from cwd', { workspaceRoot: cwd });
  return { workspaceRoot: cwd, source: 'cwd' };
}

/**
 * Get workspace info without mutating process.env.
 *
 * This is a read-only version of initializeWorkspaceRoot() for display purposes.
 * Use this in commands that only need to show the current workspace configuration
 * without affecting runtime state.
 *
 * @param configWorkspaceRoot - The config.agent.workspaceRoot value
 * @returns The effective workspace root and source (includes warning if config would be rejected)
 */
export async function getWorkspaceInfo(configWorkspaceRoot?: string): Promise<WorkspaceInitResult> {
  const envRoot = process.env['AGENT_WORKSPACE_ROOT'];
  const hasEnvRoot = envRoot !== undefined && envRoot !== '';
  const hasConfigRoot = configWorkspaceRoot !== undefined && configWorkspaceRoot !== '';

  // Case 1: Only env var set - use it (authoritative)
  if (hasEnvRoot && !hasConfigRoot) {
    const resolved = path.resolve(expandPath(envRoot));
    return { workspaceRoot: resolved, source: 'env' };
  }

  // Case 2: Only config set - would use it
  if (!hasEnvRoot && hasConfigRoot) {
    const resolved = path.resolve(expandPath(configWorkspaceRoot));
    return { workspaceRoot: resolved, source: 'config' };
  }

  // Case 3: Both set - config must be within env root (narrow only)
  if (hasEnvRoot && hasConfigRoot) {
    const resolvedEnv = path.resolve(expandPath(envRoot));
    const resolvedConfig = path.resolve(expandPath(configWorkspaceRoot));

    // Get real path of env root
    const realEnv = await safeRealpath(resolvedEnv);

    // Check if config path is within env root
    let realConfig: string;
    try {
      realConfig = await fs.realpath(resolvedConfig);
    } catch {
      // Path doesn't exist - walk parents to check
      let checkPath = resolvedConfig;
      let parentReal: string | null = null;
      let parentPath: string | null = null;

      while (checkPath !== resolvedEnv && checkPath !== path.dirname(checkPath)) {
        const currentParent = path.dirname(checkPath);
        try {
          const currentParentReal = await fs.realpath(currentParent);
          if (!isPathWithin(currentParentReal, realEnv)) {
            const warning = `config.agent.workspaceRoot parent (${currentParent} → ${currentParentReal}) is a symlink that resolves outside AGENT_WORKSPACE_ROOT (${realEnv}). Config ignored for security.`;
            return { workspaceRoot: resolvedEnv, source: 'env', warning };
          }
          // Parent is safe - record it and break
          parentReal = currentParentReal;
          parentPath = currentParent;
          break;
        } catch {
          checkPath = currentParent;
        }
      }

      // Validate that we found a safe parent or reached resolvedEnv
      if (parentReal === null) {
        // Loop terminated without finding an existing parent
        // Verify the config path is logically within resolvedEnv
        if (!isPathWithin(resolvedConfig, resolvedEnv)) {
          const warning = `config.agent.workspaceRoot (${resolvedConfig}) is outside AGENT_WORKSPACE_ROOT (${resolvedEnv}). Config ignored for security.`;
          return { workspaceRoot: resolvedEnv, source: 'env', warning };
        }
        // Config is logically within env root but path doesn't exist yet
        return { workspaceRoot: resolvedConfig, source: 'config' };
      }

      // Valid narrowing - would use config
      // Reconstruct path by joining parent's real path with remaining relative path
      // parentPath is set together with parentReal, so use it directly
      const effectiveRoot = path.join(parentReal, path.relative(parentPath ?? '', resolvedConfig));
      return { workspaceRoot: effectiveRoot, source: 'config' };
    }

    // Config path exists - check if within env root
    if (isPathWithin(realConfig, realEnv)) {
      return { workspaceRoot: realConfig, source: 'config' };
    } else {
      const warning =
        realConfig !== resolvedConfig
          ? `config.agent.workspaceRoot (${resolvedConfig} → ${realConfig}) is a symlink that resolves outside AGENT_WORKSPACE_ROOT (${realEnv}). Config ignored for security.`
          : `config.agent.workspaceRoot (${resolvedConfig}) is outside AGENT_WORKSPACE_ROOT (${resolvedEnv}). Config ignored for security.`;
      return { workspaceRoot: resolvedEnv, source: 'env', warning };
    }
  }

  // Case 4: Neither set - use cwd
  return { workspaceRoot: process.cwd(), source: 'cwd' };
}

/**
 * Get workspace root resolved to its real path (follows symlinks).
 * Async version needed because realpath is async.
 */
export async function getWorkspaceRootReal(): Promise<string> {
  const workspace = getWorkspaceRoot();
  try {
    return await fs.realpath(workspace);
  } catch {
    return path.resolve(workspace);
  }
}

/**
 * Check if filesystem writes are enabled.
 * Checks AGENT_FILESYSTEM_WRITES_ENABLED env var (defaults to true).
 * This should be set by the Agent layer based on config.agent.filesystemWritesEnabled.
 */
export function isFilesystemWritesEnabled(): boolean {
  const envValue = process.env['AGENT_FILESYSTEM_WRITES_ENABLED'];
  // Default to true if not set, false only if explicitly set to 'false' or '0'
  if (envValue === undefined || envValue === '') {
    return true;
  }
  return envValue.toLowerCase() !== 'false' && envValue !== '0';
}

/**
 * Resolve and validate a path within workspace boundaries.
 * Returns resolved path or error object.
 * Note: This performs basic path validation but does NOT follow symlinks.
 * For symlink-safe validation, use resolveWorkspacePathSafe() which verifies realpath.
 */
export function resolveWorkspacePath(
  relativePath: string,
  workspaceRoot?: string
): string | { error: ToolErrorCode; message: string } {
  const workspace = workspaceRoot ?? getWorkspaceRoot();

  // Check for path traversal attempts
  const pathParts = relativePath.split(/[/\\]/);
  if (pathParts.includes('..')) {
    return {
      error: 'PERMISSION_DENIED',
      message: `Path contains '..' component: ${relativePath}. Path traversal is not allowed.`,
    };
  }

  // Resolve the path
  const requestedPath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(workspace, relativePath);
  const resolved = path.resolve(requestedPath);

  // Ensure resolved path is within workspace
  const normalizedWorkspace = path.resolve(workspace);
  if (!resolved.startsWith(normalizedWorkspace + path.sep) && resolved !== normalizedWorkspace) {
    return {
      error: 'PERMISSION_DENIED',
      message: `Path resolves outside workspace: ${relativePath}`,
    };
  }

  return resolved;
}

/**
 * Resolve and validate a path with symlink safety.
 * After resolving the path, follows symlinks and verifies the real path is within workspace.
 * This prevents symlink escape attacks where a symlink points outside the workspace.
 *
 * @param relativePath - Path relative to workspace
 * @param workspaceRoot - Optional workspace root override
 * @param requireExists - If true, returns error if path doesn't exist (needed for realpath)
 * @returns Resolved path, or error object if validation fails
 */
export async function resolveWorkspacePathSafe(
  relativePath: string,
  workspaceRoot?: string,
  requireExists: boolean = false
): Promise<string | { error: ToolErrorCode; message: string }> {
  // First do basic path validation
  const basicResult = resolveWorkspacePath(relativePath, workspaceRoot);
  if (typeof basicResult !== 'string') {
    return basicResult;
  }

  const workspace = workspaceRoot ?? getWorkspaceRoot();

  // Resolve workspace to real path (handles symlinks like /var -> /private/var on macOS)
  let realWorkspace: string;
  try {
    realWorkspace = await fs.realpath(workspace);
  } catch {
    // Workspace doesn't exist - use normalized path
    realWorkspace = path.resolve(workspace);
  }

  // Try to get the real path (follows symlinks)
  try {
    const realPath = await fs.realpath(basicResult);

    // Verify real path is within workspace (using real workspace path)
    if (!realPath.startsWith(realWorkspace + path.sep) && realPath !== realWorkspace) {
      return {
        error: 'PERMISSION_DENIED',
        message: `Symlink resolves outside workspace: ${relativePath}`,
      };
    }

    return realPath;
  } catch (error) {
    // Path doesn't exist - realpath can't resolve it
    if (requireExists) {
      const mapped = mapSystemErrorToToolError(error);
      return { error: mapped.code, message: `Path does not exist: ${relativePath}` };
    }

    // For paths that don't exist yet (writes), we need to verify parent exists and is safe
    // Check each parent directory until we find one that exists
    let checkPath = basicResult;
    while (checkPath !== realWorkspace && checkPath !== path.dirname(checkPath)) {
      const parentPath = path.dirname(checkPath);
      try {
        const parentReal = await fs.realpath(parentPath);
        // Verify parent's real path is within workspace
        if (!parentReal.startsWith(realWorkspace + path.sep) && parentReal !== realWorkspace) {
          return {
            error: 'PERMISSION_DENIED',
            message: `Parent directory symlink resolves outside workspace: ${relativePath}`,
          };
        }
        // Parent is safe, return the original resolved path
        return basicResult;
      } catch {
        // Parent doesn't exist either, check grandparent
        checkPath = parentPath;
      }
    }

    // Reached workspace root or filesystem root - path is safe
    return basicResult;
  }
}

/**
 * Map Node.js system errors to tool error codes.
 */
export function mapSystemErrorToToolError(error: unknown): {
  code: ToolErrorCode;
  message: string;
} {
  // Handle Error instances (including SystemError with code property)
  if (error !== null && error !== undefined && typeof error === 'object') {
    // Check for code property first (most reliable for Node.js system errors)
    const errorObj = error as { code?: string; message?: string };
    const code = errorObj.code;
    const message = error instanceof Error ? error.message : (errorObj.message ?? 'Unknown error');

    // Also check message for error codes (fallback for some environments)
    // Matches "ENOENT:", "Error: ENOENT:", etc.
    const messageCode = message.match(
      /(ENOENT|EACCES|EPERM|EISDIR|ENOTDIR|EMFILE|ENFILE|ENOSPC):/
    )?.[1];
    const effectiveCode = code ?? messageCode;

    switch (effectiveCode) {
      case 'ENOENT':
        return { code: 'NOT_FOUND', message };
      case 'EACCES':
      case 'EPERM':
        return { code: 'PERMISSION_DENIED', message };
      case 'EISDIR':
      case 'ENOTDIR':
        return { code: 'VALIDATION_ERROR', message };
      case 'EMFILE':
      case 'ENFILE':
      case 'ENOSPC':
        return { code: 'IO_ERROR', message };
      default:
        // If we have an Error object, return IO_ERROR for unknown codes
        if (error instanceof Error || code !== undefined) {
          return { code: 'IO_ERROR', message };
        }
    }
  }
  return { code: 'UNKNOWN', message: String(error) };
}
