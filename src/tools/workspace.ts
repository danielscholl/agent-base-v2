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
