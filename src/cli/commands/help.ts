/**
 * Help command handler.
 */

import type { CommandHandler, CommandResult } from './types.js';

export const helpHandler: CommandHandler = (_args, context): Promise<CommandResult> => {
  const helpText = `
Available Commands:
  /exit, /quit, q  - Exit the shell
  /help, ?, help   - Show this help message
  /clear, clear    - Clear screen and conversation history
  /telemetry       - Manage telemetry dashboard

Shell Commands:
  !<command>       - Execute shell command (e.g., !ls -la)

Keyboard Shortcuts:
  ESC              - Clear current input
  Ctrl+C, Ctrl+D   - Exit the shell
  Up/Down          - Navigate command history

Tips:
  //path           - Send message starting with / (e.g., //etc/hosts)
`.trim();

  context.onOutput(helpText, 'info');
  return Promise.resolve({ success: true });
};
