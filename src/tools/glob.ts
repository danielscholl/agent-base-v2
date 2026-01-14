/**
 * Glob tool - fast file pattern matching.
 *
 * Features:
 * - Glob pattern matching (**, *, ?)
 * - Results sorted by modification time
 * - Configurable result limit
 * - Workspace path validation
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { Tool } from './tool.js';
import type { ToolErrorCode } from './types.js';
import {
  resolveWorkspacePathSafe,
  mapSystemErrorToToolError,
  getWorkspaceRootReal,
} from './workspace.js';

/** Default max results */
const DEFAULT_MAX_RESULTS = 100;

/** Maximum results cap */
const MAX_RESULTS_CAP = 500;

/**
 * Glob tool metadata type.
 */
interface GlobMetadata extends Tool.Metadata {
  /** Pattern that was matched */
  pattern: string;
  /** Number of files found */
  fileCount: number;
  /** Whether results were truncated */
  truncated: boolean;
  /** Error code if operation failed */
  error?: ToolErrorCode;
}

/**
 * Helper to create error result for glob tool.
 */
function createGlobError(
  pattern: string,
  errorCode: ToolErrorCode,
  message: string
): Tool.Result<GlobMetadata> {
  return {
    title: `Error: ${pattern}`,
    metadata: {
      pattern,
      fileCount: 0,
      truncated: false,
      error: errorCode,
    },
    output: `Error: ${message}`,
  };
}

/**
 * File info for sorting.
 */
interface FileInfo {
  relativePath: string;
  mtimeMs: number;
}

/**
 * Simple glob pattern matching.
 */
function matchGlob(filePath: string, pattern: string): boolean {
  // Handle common cases
  if (pattern === '*' || pattern === '**/*') return true;

  // Convert glob to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
    .replace(/\*\*/g, '{{GLOBSTAR}}') // Temp placeholder for **
    .replace(/\*/g, '[^/]*') // * matches anything except /
    .replace(/{{GLOBSTAR}}/g, '.*') // ** matches anything
    .replace(/\?/g, '.'); // ? matches single char

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

/**
 * Recursively find files matching a glob pattern.
 */
async function findFiles(
  dir: string,
  pattern: string,
  baseDir: string,
  maxResults: number
): Promise<FileInfo[]> {
  const results: FileInfo[] = [];

  async function walk(currentDir: string): Promise<void> {
    if (results.length >= maxResults) return;

    let dirents;
    try {
      dirents = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return; // Skip directories we can't read
    }

    for (const dirent of dirents) {
      if (results.length >= maxResults) break;

      // Skip hidden files and directories
      if (dirent.name.startsWith('.')) continue;

      const entryPath = path.join(currentDir, dirent.name);
      const relativePath = path.relative(baseDir, entryPath);

      if (dirent.isDirectory()) {
        await walk(entryPath);
      } else if (dirent.isFile()) {
        if (matchGlob(relativePath, pattern)) {
          try {
            const stats = await fs.stat(entryPath);
            results.push({
              relativePath,
              mtimeMs: stats.mtimeMs,
            });
          } catch {
            // Skip files we can't stat
          }
        }
      }
    }
  }

  await walk(dir);
  return results;
}

/**
 * Glob tool - find files by pattern.
 */
export const globTool = Tool.define<
  z.ZodObject<{
    pattern: z.ZodString;
    path: z.ZodOptional<z.ZodString>;
    max_results: z.ZodOptional<z.ZodType<number>>;
  }>,
  GlobMetadata
>('glob', {
  description: 'Find files matching glob pattern. Sorted by modification time. Max 100 results.',
  parameters: z.object({
    pattern: z.string().describe('Glob pattern (e.g., "**/*.ts", "src/**/*.js")'),
    path: z.string().optional().describe('Base directory (default: workspace root)'),
    max_results: z.coerce
      .number()
      .optional()
      .describe(`Max results (default: ${String(DEFAULT_MAX_RESULTS)})`),
  }),
  execute: async (args, ctx) => {
    const { pattern, path: basePath, max_results } = args;
    const maxResults = Math.min(max_results ?? DEFAULT_MAX_RESULTS, MAX_RESULTS_CAP);

    // Stream progress
    ctx.metadata({ title: `Searching for ${pattern}...` });

    // Resolve base path
    const resolvedPath = basePath ?? '.';
    const resolved = await resolveWorkspacePathSafe(resolvedPath, undefined, true);
    if (typeof resolved !== 'string') {
      return createGlobError(pattern, resolved.error, resolved.message);
    }

    // workspaceRoot could be used for relative path display if needed
    void (await getWorkspaceRootReal());

    try {
      // Check path is a directory
      const stats = await fs.stat(resolved);
      if (!stats.isDirectory()) {
        return createGlobError(
          pattern,
          'VALIDATION_ERROR',
          `Path is not a directory: ${resolvedPath}`
        );
      }

      // Find matching files
      const files = await findFiles(resolved, pattern, resolved, maxResults + 1);
      const truncated = files.length > maxResults;

      // Sort by modification time (newest first)
      files.sort((a, b) => b.mtimeMs - a.mtimeMs);

      // Limit results
      const limitedFiles = files.slice(0, maxResults);

      // Format output
      const output =
        limitedFiles.length > 0
          ? limitedFiles.map((f) => f.relativePath).join('\n')
          : 'No files found matching pattern';

      const truncationNote = truncated
        ? `\n\n[Results limited to ${String(maxResults)} files]`
        : '';

      return {
        title: `Found ${String(limitedFiles.length)} file${limitedFiles.length === 1 ? '' : 's'} matching ${pattern}`,
        metadata: {
          pattern,
          fileCount: limitedFiles.length,
          truncated,
        },
        output: output + truncationNote,
      };
    } catch (error) {
      const mapped = mapSystemErrorToToolError(error);
      return createGlobError(
        pattern,
        mapped.code,
        `Error searching for ${pattern}: ${mapped.message}`
      );
    }
  },
});
