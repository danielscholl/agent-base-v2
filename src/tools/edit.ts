/**
 * Edit tool - exact string replacement in files.
 *
 * Features:
 * - Exact string matching and replacement
 * - Single or all occurrences mode
 * - Diff-style output showing changes
 * - Atomic writes via temp file + rename
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
  isFilesystemWritesEnabled,
  DEFAULT_MAX_WRITE_BYTES,
  BINARY_CHECK_SIZE,
} from './workspace.js';

/**
 * Edit tool metadata type.
 */
interface EditMetadata extends Tool.Metadata {
  /** File path that was edited */
  path: string;
  /** Number of replacements made */
  replacements: number;
  /** Original file size in bytes */
  originalSize: number;
  /** New file size in bytes */
  newSize: number;
  /** Error code if operation failed */
  error?: ToolErrorCode;
}

/**
 * Helper to create error result for edit tool.
 */
function createEditError(
  filePath: string,
  errorCode: ToolErrorCode,
  message: string
): Tool.Result<EditMetadata> {
  return {
    title: `Error: ${filePath}`,
    metadata: {
      path: filePath,
      replacements: 0,
      originalSize: 0,
      newSize: 0,
      error: errorCode,
    },
    output: `Error: ${message}`,
  };
}

/**
 * Check if file is binary by looking for null bytes.
 */
async function isBinaryFile(fd: fs.FileHandle): Promise<boolean> {
  const buffer = Buffer.alloc(BINARY_CHECK_SIZE);
  const { bytesRead } = await fd.read(buffer, 0, BINARY_CHECK_SIZE, 0);
  const sample = buffer.subarray(0, bytesRead);
  return sample.includes(0);
}

/**
 * Generate a simple diff showing the change context.
 */
function generateDiff(
  original: string,
  _replacement: string,
  oldString: string,
  newString: string
): string {
  // Find the context around the first change
  const changeIndex = original.indexOf(oldString);
  if (changeIndex === -1) return '';

  // Get a few lines of context
  const beforeChange = original.substring(0, changeIndex);
  const beforeLines = beforeChange.split('\n');
  const contextStart = Math.max(0, beforeLines.length - 3);

  const afterChange = original.substring(changeIndex + oldString.length);
  const afterLines = afterChange.split('\n');
  const contextEnd = Math.min(afterLines.length, 3);

  // Build diff output
  const lines: string[] = [];

  // Context before
  for (let i = contextStart; i < beforeLines.length; i++) {
    lines.push(` ${beforeLines[i] ?? ''}`);
  }

  // Removed lines
  const oldLines = oldString.split('\n');
  for (const line of oldLines) {
    lines.push(`-${line}`);
  }

  // Added lines
  const newLines = newString.split('\n');
  for (const line of newLines) {
    lines.push(`+${line}`);
  }

  // Context after
  for (let i = 0; i < contextEnd; i++) {
    const afterLine = afterLines[i];
    if (afterLine !== undefined) {
      lines.push(` ${afterLine}`);
    }
  }

  return lines.join('\n');
}

/**
 * Edit tool - replace exact text in a file.
 */
export const editTool = Tool.define<
  z.ZodObject<{
    file_path: z.ZodString;
    old_string: z.ZodString;
    new_string: z.ZodString;
    replace_all: z.ZodOptional<z.ZodBoolean>;
  }>,
  EditMetadata
>('edit', {
  description: 'Replace exact text in file. Requires unique match or use replace_all=true.',
  parameters: z.object({
    file_path: z.string().describe('Absolute or workspace-relative file path'),
    old_string: z.string().describe('Exact text to find and replace'),
    new_string: z.string().describe('Replacement text'),
    replace_all: z.boolean().optional().describe('Replace all occurrences (default: false)'),
  }),
  execute: async (args, ctx) => {
    const {
      file_path: filePath,
      old_string: oldString,
      new_string: newString,
      replace_all: replaceAll = false,
    } = args;

    // Check if writes are enabled
    if (!isFilesystemWritesEnabled()) {
      return createEditError(
        filePath,
        'PERMISSION_DENIED',
        'Filesystem writes are disabled. Set AGENT_FILESYSTEM_WRITES_ENABLED=true or update config.'
      );
    }

    // Validate oldString
    if (oldString === '') {
      return createEditError(
        filePath,
        'VALIDATION_ERROR',
        'old_string cannot be empty. Provide exact text to match.'
      );
    }

    // Stream progress
    ctx.metadata({ title: `Editing ${filePath}...` });

    // Resolve and validate path (require file exists)
    const resolved = await resolveWorkspacePathSafe(filePath, undefined, true);
    if (typeof resolved !== 'string') {
      return createEditError(filePath, resolved.error, resolved.message);
    }

    try {
      const fd = await fs.open(resolved, 'r');
      let originalContent: string;

      try {
        // Check file is a file
        const stats = await fd.stat();
        if (!stats.isFile()) {
          await fd.close();
          return createEditError(filePath, 'VALIDATION_ERROR', `Path is not a file: ${filePath}`);
        }

        // Check for binary
        if (await isBinaryFile(fd)) {
          await fd.close();
          return createEditError(
            filePath,
            'VALIDATION_ERROR',
            `Cannot edit binary file: ${filePath}`
          );
        }

        // Read original content
        originalContent = (await fd.readFile()).toString('utf8');
      } finally {
        await fd.close();
      }

      const originalSize = Buffer.byteLength(originalContent, 'utf-8');

      // Count occurrences
      const occurrences = originalContent.split(oldString).length - 1;

      if (occurrences === 0) {
        return createEditError(
          filePath,
          'NOT_FOUND',
          `old_string not found in file: ${filePath}. No changes made.`
        );
      }

      if (occurrences > 1 && !replaceAll) {
        return createEditError(
          filePath,
          'VALIDATION_ERROR',
          `old_string found ${String(occurrences)} times in ${filePath}. Use replace_all=true to replace all, or provide more context to make match unique.`
        );
      }

      // Perform replacement
      let newContent: string;
      let replacements: number;

      if (replaceAll) {
        newContent = originalContent.split(oldString).join(newString);
        replacements = occurrences;
      } else {
        newContent = originalContent.replace(oldString, newString);
        replacements = 1;
      }

      // Check new size
      const newSize = Buffer.byteLength(newContent, 'utf-8');
      if (newSize > DEFAULT_MAX_WRITE_BYTES) {
        return createEditError(
          filePath,
          'VALIDATION_ERROR',
          `Resulting file size (${String(newSize)} bytes) exceeds max write limit (${String(DEFAULT_MAX_WRITE_BYTES)} bytes)`
        );
      }

      // Atomic write via temp file + rename
      const parentDir = path.dirname(resolved);
      const tempPath = path.join(
        parentDir,
        `.${path.basename(resolved)}.tmp.${String(Date.now())}`
      );
      await fs.writeFile(tempPath, newContent, { encoding: 'utf-8' });

      try {
        await fs.rename(tempPath, resolved);
      } catch {
        try {
          await fs.unlink(tempPath);
        } catch {
          // Ignore cleanup errors
        }
        return createEditError(filePath, 'IO_ERROR', `Failed to write edited file: ${filePath}`);
      }

      // Generate diff for output
      const diff = generateDiff(originalContent, newContent, oldString, newString);

      return {
        title: `Edited ${filePath} (${String(replacements)} replacement${replacements > 1 ? 's' : ''})`,
        metadata: {
          path: filePath,
          replacements,
          originalSize,
          newSize,
        },
        output: `Applied ${String(replacements)} replacement(s) to ${filePath}\n\n${diff}`,
      };
    } catch (error) {
      const mapped = mapSystemErrorToToolError(error);
      return createEditError(filePath, mapped.code, `Error editing ${filePath}: ${mapped.message}`);
    }
  },
});
