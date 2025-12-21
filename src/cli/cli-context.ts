/**
 * CLI context adapter for running command handlers outside of React/Ink.
 * Provides console output with colors and readline-based prompts.
 */

import * as readline from 'node:readline';
import type { CommandContext } from './commands/types.js';
import { loadConfig } from '../config/manager.js';
import type { AppConfig } from '../config/schema.js';

/**
 * ANSI color codes for terminal output.
 */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

/**
 * Output content to console with optional color coding.
 * Uses process.stdout/stderr directly to avoid eslint console warnings.
 */
function cliOutput(content: string, type?: 'info' | 'success' | 'warning' | 'error'): void {
  let color = colors.reset;
  switch (type) {
    case 'success':
      color = colors.green;
      break;
    case 'warning':
      color = colors.yellow;
      break;
    case 'error':
      color = colors.red;
      break;
    case 'info':
      color = colors.cyan;
      break;
  }
  const output = `${color}${content}${colors.reset}\n`;
  if (type === 'error') {
    process.stderr.write(output);
  } else {
    process.stdout.write(output);
  }
}

/**
 * Prompt for user input using readline.
 */
function cliPrompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} `, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Create a CommandContext suitable for CLI (non-React) usage.
 */
export async function createCliContext(): Promise<CommandContext> {
  const configResult = await loadConfig();
  const config: AppConfig | null = configResult.success ? (configResult.result as AppConfig) : null;

  return {
    config,
    onOutput: cliOutput,
    onPrompt: cliPrompt,
    exit: () => process.exit(0),
  };
}

/**
 * Create a CLI context with a preloaded config (for cases where config is already loaded).
 */
export function createCliContextWithConfig(config: AppConfig | null): CommandContext {
  return {
    config,
    onOutput: cliOutput,
    onPrompt: cliPrompt,
    exit: () => process.exit(0),
  };
}
