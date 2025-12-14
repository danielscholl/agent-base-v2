/**
 * Shell command execution handler.
 */

import type { CommandHandler, CommandResult } from './types.js';
import { spawnProcess } from '../../runtime/subprocess.js';

/** Timeout for shell commands (30 seconds) */
const SHELL_TIMEOUT_MS = 30000;

/**
 * Execute arbitrary shell commands via `sh -c`.
 *
 * SECURITY IMPLICATIONS:
 * - No input validation or sanitization is performed
 * - Commands execute with the current user's full privileges
 * - No command allowlist or denylist is enforced
 * - Suitable ONLY for interactive CLI where the user controls input
 * - DO NOT adapt this code for web services, APIs, or untrusted input sources
 *
 * This design is acceptable for the current use case because:
 * - The CLI is an interactive tool running locally
 * - Users already have full shell access via their terminal
 * - Commands are explicitly invoked by the user (not automated)
 */
export const shellHandler: CommandHandler = async (command, context): Promise<CommandResult> => {
  if (!command.trim()) {
    context.onOutput('No command specified. Type !<command> to execute shell commands.', 'warning');
    return { success: false };
  }

  context.onOutput(`$ ${command}`, 'info');

  try {
    const result = await spawnProcess(['sh', '-c', command], {
      stdout: 'pipe',
      stderr: 'pipe',
      timeoutMs: SHELL_TIMEOUT_MS,
    });

    if (result.stdout) {
      context.onOutput(result.stdout.trimEnd(), 'info');
    }

    if (result.stderr) {
      context.onOutput(result.stderr.trimEnd(), 'error');
    }

    if (result.exitCode === 0) {
      context.onOutput(`Exit code: ${result.exitCode.toString()}`, 'success');
    } else {
      context.onOutput(`Exit code: ${result.exitCode.toString()}`, 'warning');
    }

    return { success: result.exitCode === 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    context.onOutput(`Command failed: ${message}`, 'error');
    return { success: false, message };
  }
};
