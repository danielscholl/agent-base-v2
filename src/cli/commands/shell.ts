/**
 * Shell command execution handler.
 */

import type { CommandHandler, CommandResult } from './types.js';
import { spawnProcess } from '../../runtime/subprocess.js';

/** Timeout for shell commands (30 seconds) */
const SHELL_TIMEOUT_MS = 30000;

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
      context.onOutput(`Exit code: ${String(result.exitCode)}`, 'success');
    } else {
      context.onOutput(`Exit code: ${String(result.exitCode)}`, 'warning');
    }

    return { success: result.exitCode === 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    context.onOutput(`Command failed: ${message}`, 'error');
    return { success: false, message };
  }
};
