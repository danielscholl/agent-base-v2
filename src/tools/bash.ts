/**
 * Bash tool - shell command execution with safety controls.
 *
 * Features:
 * - Command execution with timeout
 * - Output truncation for large outputs
 * - Working directory support
 * - Abort signal handling
 * - Metadata streaming for progress
 */

import { spawn } from 'node:child_process';
import { z } from 'zod';
import { Tool } from './tool.js';
import { getWorkspaceRoot } from './workspace.js';

/** Default timeout in milliseconds (2 minutes) */
const DEFAULT_TIMEOUT_MS = 120_000;

/** Maximum timeout in milliseconds (10 minutes) */
const MAX_TIMEOUT_MS = 600_000;

/** Maximum output size in bytes (30KB) */
const MAX_OUTPUT_BYTES = 30_000;

/**
 * Bash tool metadata type.
 */
interface BashMetadata extends Tool.Metadata {
  /** Command that was executed */
  command: string;
  /** Exit code (null if killed) */
  exitCode: number | null;
  /** Whether output was truncated */
  truncated: boolean;
  /** Execution duration in milliseconds */
  durationMs: number;
}

/**
 * Execute a command and return output.
 */
async function executeCommand(
  command: string,
  options: {
    cwd?: string;
    timeout?: number;
    signal?: AbortSignal;
    onOutput?: (chunk: string) => void;
  }
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  truncated: boolean;
}> {
  const { cwd, timeout = DEFAULT_TIMEOUT_MS, signal, onOutput } = options;

  return new Promise((resolve, reject) => {
    const proc = spawn(command, [], {
      shell: true,
      cwd,
      timeout,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    let truncated = false;
    let killed = false;

    // Handle abort signal
    const abortHandler = (): void => {
      killed = true;
      proc.kill('SIGTERM');
    };

    if (signal) {
      signal.addEventListener('abort', abortHandler);
    }

    proc.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      if (stdout.length + chunk.length <= MAX_OUTPUT_BYTES) {
        stdout += chunk;
        onOutput?.(chunk);
      } else if (!truncated) {
        const remaining = MAX_OUTPUT_BYTES - stdout.length;
        if (remaining > 0) {
          stdout += chunk.slice(0, remaining);
          onOutput?.(chunk.slice(0, remaining));
        }
        truncated = true;
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString();
      if (stderr.length + chunk.length <= MAX_OUTPUT_BYTES) {
        stderr += chunk;
      } else if (!truncated) {
        const remaining = MAX_OUTPUT_BYTES - stderr.length;
        if (remaining > 0) {
          stderr += chunk.slice(0, remaining);
        }
        truncated = true;
      }
    });

    proc.on('error', (err) => {
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
      reject(err);
    });

    proc.on('close', (code) => {
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }

      if (killed) {
        resolve({ stdout, stderr, exitCode: null, truncated });
      } else {
        resolve({ stdout, stderr, exitCode: code, truncated });
      }
    });
  });
}

/**
 * Bash tool - execute shell commands.
 */
export const bashTool = Tool.define<
  z.ZodObject<{
    command: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
    workdir: z.ZodOptional<z.ZodString>;
  }>,
  BashMetadata
>('bash', {
  description: 'Execute shell command. Timeout default 2min, max 10min. Output max 30KB.',
  parameters: z.object({
    command: z.string().describe('Shell command to execute'),
    description: z.string().optional().describe('Short description of what the command does'),
    timeout: z
      .number()
      .optional()
      .describe(
        `Timeout in ms (default: ${String(DEFAULT_TIMEOUT_MS)}, max: ${String(MAX_TIMEOUT_MS)})`
      ),
    workdir: z.string().optional().describe('Working directory (default: workspace root)'),
  }),
  execute: async (args, ctx) => {
    const { command, description, timeout: timeoutArg, workdir } = args;

    // Validate and cap timeout
    const timeout = Math.min(timeoutArg ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

    // Determine working directory
    const cwd = workdir ?? getWorkspaceRoot();

    // Stream progress with description if provided
    const displayCmd = description ?? command.slice(0, 50);
    ctx.metadata({ title: `Running: ${displayCmd}...` });

    const startTime = Date.now();

    try {
      const result = await executeCommand(command, {
        cwd,
        timeout,
        signal: ctx.abort,
        onOutput: (chunk) => {
          // Stream output progress
          const lines = chunk.split('\n').length;
          ctx.metadata({ title: `Running: ${displayCmd} (+${String(lines)} lines)` });
        },
      });

      const durationMs = Date.now() - startTime;

      // Build output
      let output = '';
      if (result.stdout) {
        output += result.stdout;
      }
      if (result.stderr) {
        output += output ? '\n\n--- stderr ---\n' : '';
        output += result.stderr;
      }
      if (!output) {
        output = '(no output)';
      }

      // Add truncation notice
      if (result.truncated) {
        output += `\n\n[Output truncated at ${String(MAX_OUTPUT_BYTES)} bytes]`;
      }

      // Build title based on exit code
      let title: string;
      if (result.exitCode === null) {
        title = `Command killed: ${displayCmd}`;
      } else if (result.exitCode === 0) {
        title = `Completed: ${displayCmd}`;
      } else {
        title = `Failed (exit ${String(result.exitCode)}): ${displayCmd}`;
      }

      return {
        title,
        metadata: {
          command,
          exitCode: result.exitCode,
          truncated: result.truncated,
          durationMs,
        },
        output,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);

      return {
        title: `Error: ${displayCmd}`,
        metadata: {
          command,
          exitCode: null,
          truncated: false,
          durationMs,
        },
        output: `Error executing command: ${message}`,
      };
    }
  },
});
