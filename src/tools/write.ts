/**
 * Write tool - file creation and overwriting.
 *
 * Features:
 * - Create new files or overwrite existing
 * - Atomic writes via temp file + rename
 * - Creates parent directories automatically
 * - Workspace path validation
 * - Permission checking
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { Tool } from './tool.js';
import {
  resolveWorkspacePathSafe,
  mapSystemErrorToToolError,
  isFilesystemWritesEnabled,
  DEFAULT_MAX_WRITE_BYTES,
} from './workspace.js';

/**
 * Write tool metadata type.
 */
interface WriteMetadata extends Tool.Metadata {
  /** File path that was written */
  path: string;
  /** Number of bytes written */
  bytesWritten: number;
  /** Whether file existed before */
  existedBefore: boolean;
}

/**
 * Write tool - write content to a file.
 */
export const writeTool = Tool.define<
  z.ZodObject<{
    file_path: z.ZodString;
    content: z.ZodString;
  }>,
  WriteMetadata
>('write', {
  description:
    'Write content to file. Creates parent directories. Use for new files or full rewrites.',
  parameters: z.object({
    file_path: z.string().describe('Absolute or workspace-relative file path'),
    content: z.string().describe('Content to write'),
  }),
  execute: async (args, ctx) => {
    const { file_path: filePath, content } = args;

    // Check if writes are enabled
    if (!isFilesystemWritesEnabled()) {
      throw new Error(
        'Filesystem writes are disabled. Set AGENT_FILESYSTEM_WRITES_ENABLED=true or update config.'
      );
    }

    // Stream progress
    ctx.metadata({ title: `Writing ${filePath}...` });

    // Check content size
    const contentBytes = Buffer.byteLength(content, 'utf-8');
    if (contentBytes > DEFAULT_MAX_WRITE_BYTES) {
      throw new Error(
        `Content size (${String(contentBytes)} bytes) exceeds max write limit (${String(DEFAULT_MAX_WRITE_BYTES)} bytes)`
      );
    }

    // Resolve and validate path (path may not exist yet)
    const resolved = await resolveWorkspacePathSafe(filePath);
    if (typeof resolved !== 'string') {
      throw new Error(resolved.message);
    }

    try {
      // Check if file exists
      let existedBefore = false;
      try {
        await fs.stat(resolved);
        existedBefore = true;
      } catch {
        // File doesn't exist
      }

      // Ensure parent directory exists
      const parentDir = path.dirname(resolved);
      await fs.mkdir(parentDir, { recursive: true });

      // Atomic write via temp file + rename
      const tempPath = path.join(
        parentDir,
        `.${path.basename(resolved)}.tmp.${String(Date.now())}`
      );
      await fs.writeFile(tempPath, content, { encoding: 'utf-8' });

      try {
        await fs.rename(tempPath, resolved);
      } catch {
        // Cleanup temp file on rename failure
        try {
          await fs.unlink(tempPath);
        } catch {
          // Ignore cleanup errors
        }
        throw new Error(`Failed to write file: ${filePath}`);
      }

      const action = existedBefore ? 'Overwrote' : 'Created';
      return {
        title: `${action} ${filePath}`,
        metadata: {
          path: filePath,
          bytesWritten: contentBytes,
          existedBefore,
        },
        output: `${action} ${filePath} (${String(contentBytes)} bytes)`,
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Failed to write')) {
        throw error;
      }
      const mapped = mapSystemErrorToToolError(error);
      throw new Error(`Error writing ${filePath}: ${mapped.message}`);
    }
  },
});
