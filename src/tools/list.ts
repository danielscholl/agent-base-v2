/**
 * List tool - directory listing with tree-style output.
 *
 * Features:
 * - Tree-style directory listing
 * - Recursive mode support
 * - Hidden file filtering
 * - Entry limit to prevent overflow
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

/** Default max entries to return */
const DEFAULT_MAX_ENTRIES = 200;

/** Maximum entries cap */
const MAX_ENTRIES_CAP = 500;

/**
 * List tool metadata type.
 */
interface ListMetadata extends Tool.Metadata {
  /** Directory path listed */
  path: string;
  /** Number of entries returned */
  entryCount: number;
  /** Whether output was truncated */
  truncated: boolean;
  /** Error code if operation failed */
  error?: ToolErrorCode;
}

/**
 * Directory entry info.
 */
interface EntryInfo {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  size: number | null;
}

/**
 * Format entries as tree-style output.
 */
function formatAsTree(entries: EntryInfo[], _basePath: string): string {
  // Group entries by directory
  const tree = new Map<string, EntryInfo[]>();

  for (const entry of entries) {
    const dir = path.dirname(entry.relativePath);
    if (!tree.has(dir)) {
      tree.set(dir, []);
    }
    const dirList = tree.get(dir);
    if (dirList) dirList.push(entry);
  }

  // Sort directories and build output
  const sortedDirs = Array.from(tree.keys()).sort();
  const lines: string[] = [];

  for (const dir of sortedDirs) {
    const dirEntries = tree.get(dir);
    if (!dirEntries) continue;
    // Sort entries: directories first, then files, alphabetically
    dirEntries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    for (const entry of dirEntries) {
      const prefix = entry.isDirectory ? '[dir]  ' : '       ';
      const sizeSuffix = entry.size !== null ? ` (${formatSize(entry.size)})` : '';
      lines.push(`${prefix}${entry.relativePath}${sizeSuffix}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format file size in human-readable format.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

/**
 * List tool - list directory contents.
 */
export const listTool = Tool.define<
  z.ZodObject<{
    path: z.ZodOptional<z.ZodString>;
    recursive: z.ZodOptional<z.ZodBoolean>;
    include_hidden: z.ZodOptional<z.ZodBoolean>;
    max_entries: z.ZodOptional<z.ZodNumber>;
  }>,
  ListMetadata
>('list', {
  description: 'List directory contents. Supports recursive mode. Default 200 entries max.',
  parameters: z.object({
    path: z.string().optional().describe('Directory path (default: current directory)'),
    recursive: z.boolean().optional().describe('List recursively (default: false)'),
    include_hidden: z.boolean().optional().describe('Include hidden files (default: false)'),
    max_entries: z
      .number()
      .optional()
      .describe(`Max entries (default: ${String(DEFAULT_MAX_ENTRIES)})`),
  }),
  execute: async (args, ctx) => {
    const dirPath = args.path ?? '.';
    const recursive = args.recursive ?? false;
    const includeHidden = args.include_hidden ?? false;
    const maxEntries = Math.min(args.max_entries ?? DEFAULT_MAX_ENTRIES, MAX_ENTRIES_CAP);

    // Stream progress
    ctx.metadata({ title: `Listing ${dirPath}...` });

    // Resolve and validate path (require directory exists)
    const resolved = await resolveWorkspacePathSafe(dirPath, undefined, true);
    if (typeof resolved !== 'string') {
      return {
        title: `Error: ${dirPath}`,
        metadata: {
          path: dirPath,
          entryCount: 0,
          truncated: false,
          error: resolved.error,
        },
        output: `Error: ${resolved.message}`,
      };
    }

    const workspaceRoot = await getWorkspaceRootReal();

    try {
      // Check path is a directory
      const stats = await fs.stat(resolved);
      if (!stats.isDirectory()) {
        return {
          title: `Error: ${dirPath}`,
          metadata: {
            path: dirPath,
            entryCount: 0,
            truncated: false,
            error: 'VALIDATION_ERROR' as ToolErrorCode,
          },
          output: `Error: Path is not a directory: ${dirPath}`,
        };
      }

      const entries: EntryInfo[] = [];
      let truncated = false;

      if (recursive) {
        // Recursive walk using async generator
        async function* walk(dir: string): AsyncGenerator<EntryInfo> {
          const dirents = await fs.readdir(dir, { withFileTypes: true });

          for (const dirent of dirents) {
            if (!includeHidden && dirent.name.startsWith('.')) continue;

            const entryPath = path.join(dir, dirent.name);
            const relativePath = path.relative(workspaceRoot, entryPath);

            if (dirent.isDirectory()) {
              yield {
                name: dirent.name,
                relativePath,
                isDirectory: true,
                size: null,
              };
              yield* walk(entryPath);
            } else if (dirent.isFile()) {
              let size: number | null = null;
              try {
                const s = await fs.stat(entryPath);
                size = s.size;
              } catch {
                // Ignore stat errors
              }
              yield {
                name: dirent.name,
                relativePath,
                isDirectory: false,
                size,
              };
            }
          }
        }

        for await (const entry of walk(resolved)) {
          if (entries.length >= maxEntries) {
            truncated = true;
            break;
          }
          entries.push(entry);
        }
      } else {
        // Non-recursive listing
        const dirents = await fs.readdir(resolved, { withFileTypes: true });

        for (const dirent of dirents) {
          if (entries.length >= maxEntries) {
            truncated = true;
            break;
          }
          if (!includeHidden && dirent.name.startsWith('.')) continue;

          const entryPath = path.join(resolved, dirent.name);
          const relativePath = path.relative(workspaceRoot, entryPath);

          if (dirent.isDirectory()) {
            entries.push({
              name: dirent.name,
              relativePath,
              isDirectory: true,
              size: null,
            });
          } else if (dirent.isFile()) {
            let size: number | null = null;
            try {
              const s = await fs.stat(entryPath);
              size = s.size;
            } catch {
              // Ignore stat errors
            }
            entries.push({
              name: dirent.name,
              relativePath,
              isDirectory: false,
              size,
            });
          }
        }
      }

      // Format output
      const treeOutput = formatAsTree(entries, dirPath);
      const truncationNote = truncated
        ? `\n\n[Truncated: showing ${String(entries.length)} of more entries]`
        : '';

      return {
        title: `Listed ${dirPath} (${String(entries.length)} entries)`,
        metadata: {
          path: dirPath,
          entryCount: entries.length,
          truncated,
        },
        output: treeOutput + truncationNote,
      };
    } catch (error) {
      const mapped = mapSystemErrorToToolError(error);
      return {
        title: `Error: ${dirPath}`,
        metadata: {
          path: dirPath,
          entryCount: 0,
          truncated: false,
          error: mapped.code,
        },
        output: `Error listing ${dirPath}: ${mapped.message}`,
      };
    }
  },
});
