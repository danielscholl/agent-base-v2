/**
 * Help command handler.
 */

import type { CommandHandler, CommandResult } from './types.js';

export const helpHandler: CommandHandler = (_args, context): Promise<CommandResult> => {
  const helpText = `
══════════════════════════════════════════════════════════════
                      Agent Framework Help
══════════════════════════════════════════════════════════════

SESSION MANAGEMENT
  /save [name]         Save current session
  /resume [id]         Resume a session (interactive selector if no id)

TELEMETRY
  /telemetry start     Start Aspire Dashboard (Docker required)
  /telemetry stop      Stop Aspire Dashboard
  /telemetry status    Show telemetry status
  /telemetry url       Open dashboard URL

GENERAL
  /help, ?, help       Show this help message
  /clear, clear        Clear screen and history
  /exit, /quit, q      Exit the shell

SHELL COMMANDS
  !<command>           Execute shell command (e.g., !ls -la)

CUSTOM COMMANDS
  Create .agent/commands/*.md files to define custom slash commands.
  - Project commands: ./.agent/commands/*.md (shown with 'project' suffix)
  - User commands: ~/.agent/commands/*.md (shown with 'user' suffix)
  Project commands take precedence over user commands with the same name.
  See documentation for format: description, argument-hint in YAML front matter.

KEYBOARD SHORTCUTS
  ESC                  Clear current input
  Ctrl+C               Cancel current operation / Exit
  Ctrl+D               Exit the shell
  Up/Down              Navigate command history

SPECIAL INPUT
  //path               Send message starting with / (escape)
                       Example: //etc/hosts sends "/etc/hosts"

CLI SUBCOMMANDS (run from shell, not in interactive mode)
  agent config         Manage configuration (show/init/edit)
  agent skill          Manage skills (list/info/validate)

TIPS
  - Use --provider <name> to override the default provider
  - Use --model <name> to override the model
  - Use --continue to resume the last session
  - Use -p "<prompt>" for single-prompt mode

══════════════════════════════════════════════════════════════
`.trim();

  context.onOutput(helpText, 'info');
  return Promise.resolve({ success: true });
};
