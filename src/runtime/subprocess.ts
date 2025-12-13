/**
 * Runtime boundary for subprocess execution.
 *
 * This module abstracts subprocess spawning to handle the Bun vs Node runtime
 * distinction. In production (Bun runtime), it uses Bun.spawn. In tests (Node/Jest),
 * this module can be mocked without shimming globals.
 *
 * @see ADR-0003 for Bun runtime decision
 */

import { spawn as nodeSpawn } from 'node:child_process';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Bun runtime global type declaration.
 * This allows TypeScript to understand the Bun global when it exists.
 */
declare global {
  var Bun:
    | {
        spawn: (
          cmd: string[],
          opts?: { stdout?: string; stderr?: string; cwd?: string; env?: Record<string, string> }
        ) => {
          stdout: ReadableStream;
          stderr: ReadableStream;
          exitCode: number | null;
          exited: Promise<number>;
          kill: () => void;
        };
      }
    | undefined;
}

/**
 * Options for spawning a subprocess.
 */
export interface SpawnOptions {
  /** Capture stdout as a pipe */
  stdout?: 'pipe' | 'inherit' | 'ignore';
  /** Capture stderr as a pipe */
  stderr?: 'pipe' | 'inherit' | 'ignore';
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds (best-effort) */
  timeoutMs?: number;
}

/**
 * Result of a subprocess execution.
 */
export interface SubprocessResult {
  /** Exit code (0 = success) */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
}

// -----------------------------------------------------------------------------
// Runtime Detection
// -----------------------------------------------------------------------------

/**
 * Check if we're running in Bun runtime.
 */
export function isBunRuntime(): boolean {
  return typeof globalThis.Bun !== 'undefined';
}

// -----------------------------------------------------------------------------
// Subprocess Execution
// -----------------------------------------------------------------------------

/**
 * Spawn a subprocess and wait for completion.
 *
 * Uses Bun.spawn when available (production), falls back to Node child_process
 * for compatibility. In tests, this function should be mocked.
 *
 * @param cmd - Command and arguments array
 * @param options - Spawn options
 * @returns Subprocess result with exit code, stdout, and stderr
 *
 * @example
 * ```typescript
 * const result = await spawnProcess(['docker', '--version']);
 * if (result.exitCode === 0) {
 *   console.log('Docker version:', result.stdout);
 * }
 * ```
 */
export async function spawnProcess(
  cmd: string[],
  options: SpawnOptions = {}
): Promise<SubprocessResult> {
  const command = cmd[0];
  if (command === undefined || command === '') {
    return {
      exitCode: -1,
      stdout: '',
      stderr: 'No command provided',
    };
  }

  const args = cmd.slice(1);

  if (isBunRuntime()) {
    return spawnWithBun(command, args, options);
  }

  return spawnWithNode(command, args, options);
}

/**
 * Spawn using Bun.spawn (production path).
 */
async function spawnWithBun(
  command: string,
  args: string[],
  options: SpawnOptions
): Promise<SubprocessResult> {
  // Access Bun global - guaranteed to exist when isBunRuntime() is true
  const BunRuntime = globalThis.Bun;
  if (!BunRuntime) {
    return {
      exitCode: -1,
      stdout: '',
      stderr: 'Bun runtime not available',
    };
  }

  const proc = BunRuntime.spawn([command, ...args], {
    stdout: options.stdout ?? 'pipe',
    stderr: options.stderr ?? 'pipe',
    cwd: options.cwd,
    env: options.env,
  });

  if (typeof options.timeoutMs === 'number' && options.timeoutMs > 0) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const winner = await Promise.race([
        proc.exited.then(() => 'exited' as const),
        new Promise<'timeout'>((resolve) => {
          timeoutId = setTimeout(() => {
            try {
              if (proc.exitCode === null) {
                proc.kill();
              }
            } finally {
              resolve('timeout');
            }
          }, options.timeoutMs);
        }),
      ]);

      if (winner === 'timeout') {
        return { exitCode: -1, stdout: '', stderr: 'Command timed out' };
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  } else {
    await proc.exited;
  }

  const exitCode = proc.exitCode ?? -1;
  const stdout = options.stdout === 'pipe' ? await new Response(proc.stdout).text() : '';
  const stderr = options.stderr === 'pipe' ? await new Response(proc.stderr).text() : '';

  return {
    exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

/**
 * Spawn using Node child_process (fallback/test path).
 */
function spawnWithNode(
  command: string,
  args: string[],
  options: SpawnOptions
): Promise<SubprocessResult> {
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const finalize = (result: SubprocessResult): void => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      resolve(result);
    };

    const proc = nodeSpawn(command, args, {
      stdio: [
        'ignore',
        options.stdout === 'inherit' ? 'inherit' : options.stdout === 'pipe' ? 'pipe' : 'ignore',
        options.stderr === 'inherit' ? 'inherit' : options.stderr === 'pipe' ? 'pipe' : 'ignore',
      ],
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : undefined,
    });

    let stdout = '';
    let stderr = '';

    if (proc.stdout) {
      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
    }

    if (proc.stderr) {
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    }

    if (typeof options.timeoutMs === 'number' && options.timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        try {
          proc.kill();
        } finally {
          finalize({ exitCode: -1, stdout: stdout.trim(), stderr: 'Command timed out' });
        }
      }, options.timeoutMs);
    }

    proc.on('error', (error) => {
      finalize({
        exitCode: -1,
        stdout: '',
        stderr: error.message,
      });
    });

    proc.on('close', (code) => {
      finalize({
        exitCode: code ?? -1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}
