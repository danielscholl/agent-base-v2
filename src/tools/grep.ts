/**
 * Grep tool - content search with regex support.
 *
 * Features:
 * - Literal and regex pattern matching
 * - File type filtering via glob
 * - Line numbers in output
 * - Case sensitivity control
 * - Result limiting
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
  DEFAULT_MAX_READ_BYTES,
  BINARY_CHECK_SIZE,
} from './workspace.js';

/** Default max matches */
const DEFAULT_MAX_MATCHES = 50;

/** Maximum matches cap */
const MAX_MATCHES_CAP = 200;

/** Snippet max length */
const SNIPPET_MAX_LENGTH = 200;

/**
 * Grep tool metadata type.
 */
interface GrepMetadata extends Tool.Metadata {
  /** Search pattern */
  pattern: string;
  /** Number of files searched */
  filesSearched: number;
  /** Number of matches found */
  matchCount: number;
  /** Whether results were truncated */
  truncated: boolean;
  /** Error code if operation failed */
  error?: ToolErrorCode;
}

/**
 * Helper to create error result for grep tool.
 */
function createGrepError(
  pattern: string,
  errorCode: ToolErrorCode,
  message: string
): Tool.Result<GrepMetadata> {
  return {
    title: `Error: ${pattern}`,
    metadata: {
      pattern,
      filesSearched: 0,
      matchCount: 0,
      truncated: false,
      error: errorCode,
    },
    output: `Error: ${message}`,
  };
}

/**
 * Search match result.
 */
interface SearchMatch {
  file: string;
  line: number;
  snippet: string;
}

/**
 * Check if file is binary.
 */
async function isBinaryFile(fd: fs.FileHandle): Promise<boolean> {
  const buffer = Buffer.alloc(BINARY_CHECK_SIZE);
  const { bytesRead } = await fd.read(buffer, 0, BINARY_CHECK_SIZE, 0);
  const sample = buffer.subarray(0, bytesRead);
  return sample.includes(0);
}

/**
 * Simple glob pattern matching.
 */
function matchGlob(filePath: string, pattern: string): boolean {
  if (pattern === '*' || pattern === '**/*') return true;

  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

/**
 * Grep tool - search file contents.
 */
export const grepTool = Tool.define<
  z.ZodObject<{
    pattern: z.ZodString;
    path: z.ZodOptional<z.ZodString>;
    include: z.ZodOptional<z.ZodString>;
    regex: z.ZodOptional<z.ZodBoolean>;
    case_sensitive: z.ZodOptional<z.ZodBoolean>;
    max_matches: z.ZodOptional<z.ZodNumber>;
  }>,
  GrepMetadata
>('grep', {
  description: 'Search file contents by pattern. Supports regex. Max 50 matches default.',
  parameters: z.object({
    pattern: z.string().describe('Search pattern (literal or regex)'),
    path: z.string().optional().describe('Directory or file to search (default: workspace)'),
    include: z.string().optional().describe('File glob filter (e.g., "*.ts")'),
    regex: z.boolean().optional().describe('Treat pattern as regex (default: false)'),
    case_sensitive: z.boolean().optional().describe('Case-sensitive search (default: true)'),
    max_matches: z
      .number()
      .optional()
      .describe(`Max matches (default: ${String(DEFAULT_MAX_MATCHES)})`),
  }),
  execute: async (args, ctx) => {
    const {
      pattern,
      path: searchPath,
      include = '**/*',
      regex: useRegex = false,
      case_sensitive: caseSensitive = true,
      max_matches,
    } = args;

    const maxMatches = Math.min(max_matches ?? DEFAULT_MAX_MATCHES, MAX_MATCHES_CAP);

    // Stream progress
    ctx.metadata({ title: `Searching for "${pattern}"...` });

    // Compile regex if needed
    let searchRegex: RegExp | null = null;
    if (useRegex) {
      try {
        searchRegex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return createGrepError(
          pattern,
          'VALIDATION_ERROR',
          `Invalid regex pattern '${pattern}': ${message}`
        );
      }
    }

    // Resolve search path
    const resolvedPath = searchPath ?? '.';
    const resolvedResult = await resolveWorkspacePathSafe(resolvedPath, undefined, true);
    if (typeof resolvedResult !== 'string') {
      return createGrepError(pattern, resolvedResult.error, resolvedResult.message);
    }
    const resolved: string = resolvedResult;

    const workspaceRoot = await getWorkspaceRootReal();

    const matches: SearchMatch[] = [];
    let filesSearched = 0;
    let truncated = false;

    try {
      const stats = await fs.stat(resolved);
      const filesToSearch: string[] = [];

      if (stats.isFile()) {
        filesToSearch.push(resolved);
      } else if (stats.isDirectory()) {
        // Collect files matching glob
        async function collectFiles(dir: string): Promise<void> {
          let dirents;
          try {
            dirents = await fs.readdir(dir, { withFileTypes: true });
          } catch {
            return;
          }

          for (const dirent of dirents) {
            const entryPath = path.join(dir, dirent.name);

            if (dirent.isDirectory()) {
              // Skip hidden directories
              if (!dirent.name.startsWith('.')) {
                await collectFiles(entryPath);
              }
            } else if (dirent.isFile()) {
              const relativePath = path.relative(resolved, entryPath);
              if (matchGlob(relativePath, include)) {
                filesToSearch.push(entryPath);
              }
            }
          }
        }
        await collectFiles(resolved);
      } else {
        return createGrepError(
          pattern,
          'VALIDATION_ERROR',
          `Path is neither file nor directory: ${resolvedPath}`
        );
      }

      // Search files
      for (const filePath of filesToSearch) {
        if (matches.length >= maxMatches) {
          truncated = true;
          break;
        }

        filesSearched++;

        // Update progress periodically
        if (filesSearched % 10 === 0) {
          ctx.metadata({
            title: `Searching... (${String(filesSearched)} files, ${String(matches.length)} matches)`,
          });
        }

        try {
          const fd = await fs.open(filePath, 'r');
          let content = '';

          try {
            const fileStats = await fd.stat();
            if (fileStats.size > DEFAULT_MAX_READ_BYTES) continue;

            if (await isBinaryFile(fd)) continue;

            content = (await fd.readFile()).toString('utf8');
          } finally {
            await fd.close();
          }

          const lines = content.split('\n');
          const relativePath = path.relative(workspaceRoot, filePath);

          for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            if (matches.length >= maxMatches) {
              truncated = true;
              break;
            }

            const line = lines[lineNum] as string;

            // Truncate snippet
            let snippet = line.trim();
            if (snippet.length > SNIPPET_MAX_LENGTH) {
              snippet = snippet.slice(0, SNIPPET_MAX_LENGTH) + '...';
            }

            let hasMatch = false;

            if (useRegex && searchRegex !== null) {
              searchRegex.lastIndex = 0;
              hasMatch = searchRegex.test(line);
            } else {
              const searchLine = caseSensitive ? line : line.toLowerCase();
              const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
              hasMatch = searchLine.includes(searchPattern);
            }

            if (hasMatch) {
              matches.push({
                file: relativePath,
                line: lineNum + 1,
                snippet,
              });
            }
          }
        } catch {
          // Skip files we can't read
          continue;
        }
      }

      // Format output
      const output =
        matches.length > 0
          ? matches.map((m) => `${m.file}:${String(m.line)}: ${m.snippet}`).join('\n')
          : `No matches found for "${pattern}"`;

      const truncationNote = truncated
        ? `\n\n[Results limited to ${String(maxMatches)} matches]`
        : '';

      return {
        title: `Found ${String(matches.length)} match${matches.length === 1 ? '' : 'es'} in ${String(filesSearched)} files`,
        metadata: {
          pattern,
          filesSearched,
          matchCount: matches.length,
          truncated,
        },
        output: output + truncationNote,
      };
    } catch (error) {
      const mapped = mapSystemErrorToToolError(error);
      return createGrepError(
        pattern,
        mapped.code,
        `Error searching for ${pattern}: ${mapped.message}`
      );
    }
  },
});
