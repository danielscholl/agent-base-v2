/**
 * Custom command executor.
 * Handles argument substitution, file references, and bash context execution.
 */

import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, isAbsolute } from 'node:path';
import type { DiscoveredCustomCommand, CustomCommandExecutionResult } from './types.js';
import { getWorkspaceRoot } from '../../../tools/workspace.js';

/** Default timeout for bash commands (5 seconds) */
const DEFAULT_BASH_TIMEOUT_MS = 5000;

/** Maximum file size for file references (100KB) */
const MAX_FILE_REFERENCE_SIZE = 100 * 1024;

/**
 * Execute a custom command with the given arguments.
 * Processes argument substitution, file references, and bash context.
 *
 * @param command - The discovered command to execute
 * @param args - Arguments passed to the command
 * @param workspaceRoot - Workspace root for resolving paths
 * @returns Execution result with processed prompt or error
 */
export async function executeCustomCommand(
  command: DiscoveredCustomCommand,
  args: string,
  workspaceRoot?: string
): Promise<CustomCommandExecutionResult> {
  const workspace = workspaceRoot ?? getWorkspaceRoot();

  let body = command.content.body;

  // Step 1: Substitute arguments
  body = substituteArguments(body, args);

  // Step 2: Process file references (@filepath)
  body = await processFileReferences(body, workspace);

  // Step 3: Execute bash context (!`command`)
  body = await executeBashContext(body, workspace);

  return {
    success: true,
    prompt: body,
    commandName: command.name,
  };
}

/**
 * Substitute argument placeholders in command body.
 *
 * Supports:
 * - $ARGUMENTS - All arguments as a single string
 * - $1, $2, ... - Positional arguments
 * - {{arg0}}, {{arg1}}, ... - Alternative positional syntax (Claude Code compatible)
 * - {{repos_root}} - Workspace root path
 *
 * @param body - Command body with placeholders
 * @param args - Arguments string from user input
 * @returns Body with arguments substituted
 */
export function substituteArguments(body: string, args: string): string {
  // Parse positional arguments (split on whitespace, respecting quotes)
  const positionalArgs = parseArguments(args);

  let result = body;

  // Replace $ARGUMENTS with all arguments
  result = result.replace(/\$ARGUMENTS/g, args);

  // Replace positional $1, $2, etc. (up to $9)
  for (let i = 1; i <= 9; i++) {
    const arg = positionalArgs[i - 1] ?? '';
    result = result.replace(new RegExp(`\\$${String(i)}(?![0-9])`, 'g'), arg);
  }

  // Replace {{arg0}}, {{arg1}}, etc. (Claude Code compatible)
  for (let i = 0; i <= 9; i++) {
    const arg = positionalArgs[i] ?? '';
    result = result.replace(new RegExp(`\\{\\{arg${String(i)}\\}\\}`, 'g'), arg);
  }

  // Replace {{repos_root}} with workspace root
  const workspace = getWorkspaceRoot();
  result = result.replace(/\{\{repos_root\}\}/g, workspace);

  return result;
}

/**
 * Parse arguments string into positional array.
 * Handles quoted strings with spaces.
 *
 * @param args - Arguments string
 * @returns Array of parsed arguments
 */
function parseArguments(args: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuote: '"' | "'" | null = null;

  for (let i = 0; i < args.length; i++) {
    const char = args[i] as string;

    if (inQuote !== null) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current = current + char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === ' ' || char === '\t') {
      if (current !== '') {
        result.push(current);
        current = '';
      }
    } else {
      current = current + char;
    }
  }

  if (current !== '') {
    result.push(current);
  }

  return result;
}

/**
 * Escape dollar signs for use in String.replace() replacement string.
 * In JavaScript, $& $' $` $n are special in replacements.
 *
 * @param str - String to escape
 * @returns String with $ escaped as $$
 */
function escapeReplacementString(str: string): string {
  return str.replace(/\$/g, '$$$$'); // $$ produces a literal $
}

/** Trailing punctuation to strip from file references */
const TRAILING_PUNCTUATION = /[.,;:!?)]+$/;

/**
 * Process file references in command body.
 * Replaces @filepath with file contents.
 *
 * @param body - Command body with file references
 * @param workspaceRoot - Workspace root for resolving relative paths
 * @returns Body with file contents substituted
 */
export async function processFileReferences(body: string, workspaceRoot: string): Promise<string> {
  // Match @filepath patterns - supports files with or without extensions
  // Supports: @src/file.ts, @./relative/path.md, @/absolute/path, @README, @Makefile
  // Also supports Windows paths: @C:\path\file.ts
  // Excludes: email addresses (@user.name@domain), backticked code
  // Pattern breakdown:
  // - (?:[A-Za-z]:[\\/])? - optional Windows drive letter (C:\, D:/, etc.)
  // - (?:\.{0,2}[\\/])? - optional relative path prefix (./, ../, .\, ..\)
  // - [^\s`@*?"<>|]+ - path characters (excluding special chars, but allowing : for Windows)
  const fileRefPattern = /@((?:[A-Za-z]:[\\/])?(?:\.{0,2}[\\/])?[^\s`@*?"<>|]+)/g;

  const matches = Array.from(body.matchAll(fileRefPattern));

  if (matches.length === 0) {
    return body;
  }

  let result = body;

  for (const match of matches) {
    const fullMatch = match[0];
    let filePath = match[1];

    // Skip if no capture group
    if (filePath === undefined) {
      continue;
    }

    // Strip trailing punctuation (common in natural sentences like "see @README.")
    const strippedPunctuation = filePath.match(TRAILING_PUNCTUATION)?.[0] ?? '';
    filePath = filePath.replace(TRAILING_PUNCTUATION, '');

    // Adjust fullMatch to only replace the part without trailing punctuation
    const actualMatch = fullMatch.slice(0, fullMatch.length - strippedPunctuation.length);

    // Skip empty paths after stripping
    if (filePath === '') {
      continue;
    }

    // Resolve path relative to workspace
    const absolutePath = isAbsolute(filePath) ? filePath : join(workspaceRoot, filePath);

    try {
      const stats = await import('node:fs/promises').then((fs) => fs.stat(absolutePath));
      const fileSize = typeof stats.size === 'bigint' ? Number(stats.size) : stats.size;

      if (fileSize > MAX_FILE_REFERENCE_SIZE) {
        const fileSizeKb = String(Math.round(fileSize / 1024));
        const maxSizeKb = String(MAX_FILE_REFERENCE_SIZE / 1024);
        result = result.replace(
          actualMatch,
          `[File too large: ${filePath} (${fileSizeKb}KB > ${maxSizeKb}KB)]`
        );
        continue;
      }

      const content = await readFile(absolutePath, 'utf-8');
      // Escape $ in content to prevent replacement pattern interpretation
      result = result.replace(actualMatch, escapeReplacementString(content));
    } catch {
      // File not found or unreadable - leave a note
      result = result.replace(actualMatch, `[File not found: ${filePath}]`);
    }
  }

  return result;
}

/**
 * Execute bash commands for context in command body.
 * Replaces !`command` patterns with command output.
 *
 * @param body - Command body with bash commands
 * @param workspaceRoot - Working directory for commands
 * @returns Body with command outputs substituted
 */
export async function executeBashContext(body: string, workspaceRoot: string): Promise<string> {
  // Match !`command` patterns (backticks don't need escaping in regex)
  const bashPattern = /!`([^`]+)`/g;

  const matches = Array.from(body.matchAll(bashPattern));

  if (matches.length === 0) {
    return body;
  }

  let result = body;

  for (const match of matches) {
    const fullMatch = match[0];
    const command = match[1];

    // Skip if no capture group
    if (command === undefined) {
      continue;
    }

    try {
      const output = await runBashCommand(command, workspaceRoot, DEFAULT_BASH_TIMEOUT_MS);
      // Escape $ in output to prevent replacement pattern interpretation
      result = result.replace(fullMatch, escapeReplacementString(output.trim()));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result = result.replace(fullMatch, `[Command failed: ${errorMsg}]`);
    }
  }

  return result;
}

/**
 * Run a bash command and return its output.
 *
 * @param command - Command to execute
 * @param cwd - Working directory
 * @param timeoutMs - Timeout in milliseconds
 * @returns Command stdout
 */
async function runBashCommand(command: string, cwd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    const shellArgs = process.platform === 'win32' ? ['/c', command] : ['-c', command];

    const proc = spawn(shell, shellArgs, {
      cwd,
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout = stdout + data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr = stderr + data.toString();
    });

    proc.on('error', (error) => {
      reject(error);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        const exitCode = code !== null ? String(code) : 'unknown';
        reject(new Error(stderr !== '' ? stderr : `Command exited with code ${exitCode}`));
      }
    });

    // Handle timeout
    setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Command timed out after ${String(timeoutMs)}ms`));
    }, timeoutMs);
  });
}
