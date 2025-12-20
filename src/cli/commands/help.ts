/**
 * Help command handler.
 */

import type { CommandHandler, CommandResult } from './types.js';

export const helpHandler: CommandHandler = (_args, context): Promise<CommandResult> => {
  const helpText = `
══════════════════════════════════════════════════════════════
                      Agent Framework Help
══════════════════════════════════════════════════════════════

CONFIGURATION
  /config              Show current configuration
  /config init         Interactive setup wizard
  /config show         Display all settings
  /config edit [field] Edit specific configuration field

SKILLS
  /skill, /skills      List all discovered skills
  /skill list          Show skills by source (bundled/user/project)
  /skill info <name>   Display skill details and SKILL.md preview
  /skill validate <path> Validate a SKILL.md manifest

SESSION MANAGEMENT
  /save [name]         Save current session
  /sessions            List all saved sessions
  /resume <id>         Resume a saved session
  /continue            Resume the last session
  /purge [count]       Delete old sessions (keep N most recent)

TELEMETRY
  /telemetry start     Start Aspire Dashboard (Docker required)
  /telemetry stop      Stop Aspire Dashboard
  /telemetry status    Show telemetry status
  /telemetry url       Open dashboard URL

GENERAL
  /help, ?, help       Show this help message
  /history             Show conversation history
  /clear, clear        Clear screen and history
  /exit, /quit, q      Exit the shell

SHELL COMMANDS
  !<command>           Execute shell command (e.g., !ls -la)

KEYBOARD SHORTCUTS
  ESC                  Clear current input
  Ctrl+C               Cancel current operation / Exit
  Ctrl+D               Exit the shell
  Up/Down              Navigate command history

SPECIAL INPUT
  //path               Send message starting with / (escape)
                       Example: //etc/hosts sends "/etc/hosts"

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
