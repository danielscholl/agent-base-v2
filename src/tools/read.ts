/**
 * Read tool - file reading with line-numbered output.
 *
 * Features:
 * - Line-numbered output format
 * - Offset and limit support for large files
 * - Binary file detection
 * - Workspace path validation
 */

import * as fs from 'node:fs/promises';
import { z } from 'zod';
import { Tool } from './tool.js';
import type { ToolErrorCode } from './types.js';
import {
  resolveWorkspacePathSafe,
  mapSystemErrorToToolError,
  DEFAULT_MAX_READ_BYTES,
  BINARY_CHECK_SIZE,
} from './workspace.js';

/** Default max lines to read */
const DEFAULT_MAX_LINES = 2000;

/** Maximum lines cap */
const MAX_LINES_CAP = 5000;

/**
 * Read tool metadata type.
 */
interface ReadMetadata extends Tool.Metadata {
  /** File path that was read */
  path: string;
  /** Starting line number (1-based) */
  startLine: number;
  /** Ending line number (1-based) */
  endLine: number;
  /** Total lines in file */
  totalLines: number;
  /** Whether output was truncated */
  truncated: boolean;
  /** Error code if operation failed */
  error?: ToolErrorCode;
}

/**
 * Helper to create error result for read tool.
 */
function createReadError(
  filePath: string,
  startLine: number,
  errorCode: ToolErrorCode,
  message: string
): Tool.Result<ReadMetadata> {
  return {
    title: `Error: ${filePath}`,
    metadata: {
      path: filePath,
      startLine,
      endLine: 0,
      totalLines: 0,
      truncated: false,
      error: errorCode,
    },
    output: `Error: ${message}`,
  };
}

/**
 * Check if file is binary by looking for null bytes in first 8KB.
 */
async function isBinaryFile(fd: fs.FileHandle): Promise<boolean> {
  const buffer = Buffer.alloc(BINARY_CHECK_SIZE);
  const { bytesRead } = await fd.read(buffer, 0, BINARY_CHECK_SIZE, 0);
  const sample = buffer.subarray(0, bytesRead);
  return sample.includes(0);
}

/**
 * Read tool - read file contents with line numbers.
 */
export const readTool = Tool.define<
  z.ZodObject<{
    file_path: z.ZodString;
    offset: z.ZodOptional<z.ZodNumber>;
    limit: z.ZodOptional<z.ZodNumber>;
  }>,
  ReadMetadata
>('read', {
  description: 'Read file with line numbers. Supports offset/limit for large files.',
  parameters: z.object({
    file_path: z.string().describe('Absolute or workspace-relative file path'),
    offset: z.number().optional().describe('Starting line number (1-based, default: 1)'),
    limit: z
      .number()
      .optional()
      .describe(`Max lines to read (default: ${String(DEFAULT_MAX_LINES)})`),
  }),
  execute: async (args, ctx) => {
    const filePath = args.file_path;
    const startLine = Math.max(1, args.offset ?? 1);
    const maxLines = Math.min(args.limit ?? DEFAULT_MAX_LINES, MAX_LINES_CAP);

    // Stream progress
    ctx.metadata({ title: `Reading ${filePath}...` });

    // Resolve and validate path
    const resolved = await resolveWorkspacePathSafe(filePath, undefined, true);
    if (typeof resolved !== 'string') {
      return createReadError(filePath, startLine, resolved.error, resolved.message);
    }

    try {
      const fd = await fs.open(resolved, 'r');
      let content: string;

      try {
        // Check file exists and is a file
        const stats = await fd.stat();
        if (!stats.isFile()) {
          await fd.close();
          return createReadError(
            filePath,
            startLine,
            'VALIDATION_ERROR',
            `Path is not a file: ${filePath}`
          );
        }

        // Check file size
        if (stats.size > DEFAULT_MAX_READ_BYTES) {
          await fd.close();
          return createReadError(
            filePath,
            startLine,
            'VALIDATION_ERROR',
            `File size (${String(stats.size)} bytes) exceeds max read limit (${String(DEFAULT_MAX_READ_BYTES)} bytes)`
          );
        }

        // Check for binary
        if (await isBinaryFile(fd)) {
          await fd.close();
          return createReadError(
            filePath,
            startLine,
            'VALIDATION_ERROR',
            `File appears to be binary (contains null bytes): ${filePath}`
          );
        }

        // Read file content
        content = (await fd.readFile()).toString('utf8');
      } finally {
        await fd.close();
      }

      const lines = content.split('\n');
      const totalLines = lines.length;

      // Validate start line
      if (startLine > totalLines && totalLines > 0) {
        return createReadError(
          filePath,
          startLine,
          'VALIDATION_ERROR',
          `offset (${String(startLine)}) exceeds file length (${String(totalLines)} lines)`
        );
      }

      // Extract lines (1-based to 0-based)
      const startIdx = startLine - 1;
      const endIdx = Math.min(startIdx + maxLines, totalLines);
      const selectedLines = lines.slice(startIdx, endIdx);

      // Format with line numbers
      const lineWidth = String(endIdx).length;
      const formattedLines = selectedLines.map((line, i) => {
        const lineNum = String(startLine + i).padStart(lineWidth, ' ');
        return `${lineNum}\t${line}`;
      });

      // Check truncation
      const truncated = endIdx < totalLines;
      const truncationNote = truncated
        ? `\n\n[Truncated: showing lines ${String(startLine)}-${String(endIdx)} of ${String(totalLines)}. Use offset=${String(endIdx + 1)} to continue.]`
        : '';

      return {
        title: `Read ${filePath} (lines ${String(startLine)}-${String(endIdx)})`,
        metadata: {
          path: filePath,
          startLine,
          endLine: endIdx,
          totalLines,
          truncated,
        },
        output: formattedLines.join('\n') + truncationNote,
      };
    } catch (error) {
      const mapped = mapSystemErrorToToolError(error);
      return createReadError(
        filePath,
        startLine,
        mapped.code,
        `Error reading ${filePath}: ${mapped.message}`
      );
    }
  },
});
