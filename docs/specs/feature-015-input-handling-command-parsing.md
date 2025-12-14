# Feature 15: Implement Input Handling and Command Parsing

## Feature Description

Port the interactive affordances from the Python `../agent-base/src/agent/cli/interactive.py` and `commands.py` to TypeScript: enhanced line editing, command history navigation, `/commands` (clear, continue, exit, help, telemetry), and keyboard shortcuts (Ctrl+C for cancel, Ctrl+D for exit, ESC to clear input). Use Ink keypress events and keep command routing separate from the agent core.

## User Story

As a user of the agent framework CLI
I want a rich interactive experience with command history, keyboard shortcuts, and slash commands
So that I can efficiently navigate conversations and control the agent without leaving the terminal

## Problem Statement

The current TypeScript `InteractiveShell` component has minimal input handling:
- Character-by-character input with basic backspace support only
- No command history navigation (up/down arrows)
- No keyboard shortcuts beyond Ctrl+C to exit
- Only three hardcoded commands (`/exit`, `/help`, `/clear`) with inline if/else handling
- No command alias support (e.g., `q` for `/exit`)
- No shell command execution (lines starting with `!`)
- No telemetry management commands
- No session continuation commands

The Python `interactive.py` provides a mature user experience with:
- Full line editing via prompt_toolkit (cursor movement, home/end, word navigation)
- Persistent command history with file storage and navigation
- Keybindings (ESC to clear, Ctrl+Alt+L alternative)
- Command dispatcher with aliases (exit/quit/q all work)
- Shell command execution (! prefix)
- Telemetry commands (/telemetry start/stop/status/url)
- Session commands (/continue, /purge)
- Status bar with contextual info

## Solution Statement

Implement a comprehensive input handling and command parsing system:

1. **Command Constants** - Define command aliases and exit codes in `src/cli/constants.ts`
2. **Command Registry** - Create a dispatcher pattern with command handlers in `src/cli/commands/`
3. **Enhanced Input Handling** - Add history navigation, keyboard shortcuts, and improved cursor handling
4. **Command Handlers** - Port all commands from Python with TypeScript async/await patterns
5. **Integration** - Wire commands into `InteractiveShell` while maintaining separation of concerns

The implementation will use Ink's `useInput` hook for keyboard events while keeping command logic separate from UI components.

## Related Documentation

### Requirements
- `docs/plans/typescript-rewrite-features.md`: Feature 15 specification (lines 104-105)
- Feature 14: Ink CLI Shell - provides the foundation this feature builds on
- Feature 11: Aspire Dashboard Integration - provides telemetry functions to wrap

### Architecture Decisions
- `docs/decisions/0005-terminal-ui-react-ink.md`: React/Ink for terminal UI
- `docs/decisions/0007-callbacks-over-eventbus.md`: Callback patterns for agent-UI communication
- `docs/architecture.md`: CLI layer responsibilities, command routing

## Codebase Analysis Findings

### Architecture Patterns
- **Callback-driven UI**: `AgentCallbacks` in `src/agent/callbacks.ts` for agent-to-UI communication
- **State management**: React useState/useEffect hooks for component state
- **Lazy initialization**: Agent created on first query, not shell startup
- **Structured responses**: `TelemetryResponse<T>` pattern from `src/telemetry/types.ts`

### Naming Conventions
- Files: kebab-case (`command-types.ts`, `telemetry-handler.ts`)
- Components: PascalCase (`InteractiveShell`, `Spinner`)
- Functions: camelCase (`handleSubmit`, `createCallbacks`)
- Constants: SCREAMING_SNAKE_CASE (`COMMAND_EXIT`, `EXIT_CODES`)

### Similar Implementations
- `src/components/InteractiveShell.tsx`: Current shell with basic input handling
- `src/telemetry/aspire.ts`: Aspire Dashboard management (already implemented)
- Python `agent-base/src/agent/cli/commands.py`: Reference command handlers
- Python `agent-base/src/agent/cli/constants.py`: Reference command aliases

### Integration Points
- `InteractiveShell.tsx` lines 82-121: Current inline command handling (to replace)
- `InteractiveShell.tsx` lines 212-232: Current useInput handling (to enhance)
- `src/telemetry/aspire.ts`: Functions for /telemetry commands
- `src/config/manager.ts`: Config loading for session operations

## Relevant Files

### Existing Files
- `src/components/InteractiveShell.tsx`: Main shell component to enhance
- `src/cli/types.ts`: CLI type definitions to extend
- `src/cli/callbacks.ts`: Callback factory for Agent-UI wiring
- `src/config/constants.ts`: Existing constants (provider names, defaults)
- `src/telemetry/aspire.ts`: Aspire Dashboard functions (start/stop/status)
- `src/telemetry/types.ts`: TelemetryResponse type

### New Files
- `src/cli/constants.ts`: Command aliases and exit codes
- `src/cli/commands/types.ts`: Command handler interfaces
- `src/cli/commands/index.ts`: Command registry and dispatcher
- `src/cli/commands/help.ts`: Help command handler
- `src/cli/commands/clear.ts`: Clear command handler
- `src/cli/commands/exit.ts`: Exit command handler
- `src/cli/commands/telemetry.ts`: Telemetry command handler
- `src/cli/commands/shell.ts`: Shell command execution handler
- `src/cli/input/types.ts`: Input state interfaces
- `src/cli/input/history.ts`: Command history management
- `src/cli/input/hooks.ts`: Custom input hooks
- `src/cli/__tests__/constants.test.ts`: Constants tests
- `src/cli/commands/__tests__/`: Command handler tests
- `src/cli/input/__tests__/`: Input handling tests

## Implementation Plan

### Phase 1: Foundation
1. Create command constants with aliases and exit codes
2. Define command handler interfaces and types
3. Create command registry with dispatcher pattern

### Phase 2: Command Handlers
1. Implement help command handler
2. Implement clear command handler
3. Implement exit command handler
4. Implement telemetry command handler (wrapping existing aspire.ts)
5. Implement shell command execution handler

### Phase 3: Input Enhancement
1. Add command history state management
2. Implement history navigation (up/down arrows)
3. Add keyboard shortcut handling (ESC to clear, Ctrl+D to exit)
4. Improve cursor handling for input buffer

### Phase 4: Integration
1. Update InteractiveShell to use command registry
2. Wire input enhancements into shell component
3. Add comprehensive tests for all commands and input handling

## Step by Step Tasks

### Task 1: Create CLI Constants
- Description: Define command aliases and exit codes
- Files to create: `src/cli/constants.ts`
- Implementation:
```typescript
/**
 * CLI command aliases and exit codes.
 * Mirrors Python agent-base/src/agent/cli/constants.py
 */

/** Command aliases - multiple strings map to same command */
export const COMMAND_EXIT = ['exit', 'quit', 'q', '/exit', '/quit'] as const;
export const COMMAND_HELP = ['help', '?', '/help'] as const;
export const COMMAND_CLEAR = ['clear', '/clear'] as const;
export const COMMAND_CONTINUE = ['/continue'] as const;
export const COMMAND_PURGE = ['/purge'] as const;
export const COMMAND_TELEMETRY = ['/telemetry', '/aspire'] as const;

/** All command prefixes that require special handling */
export const COMMAND_PREFIXES = ['/'] as const;

/** Shell command prefix */
export const SHELL_PREFIX = '!' as const;

/** Standard exit codes */
export const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  CONFIG_ERROR: 2,
  INTERRUPTED: 130,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/** Check if input matches a command set */
export function matchesCommand(input: string, commands: readonly string[]): boolean {
  const normalized = input.trim().toLowerCase();
  return commands.includes(normalized);
}

/** Check if input is a shell command */
export function isShellCommand(input: string): boolean {
  return input.trim().startsWith(SHELL_PREFIX);
}

/** Check if input is a slash command */
export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith('/');
}

/** Extract shell command (without ! prefix) */
export function extractShellCommand(input: string): string {
  return input.trim().slice(1).trim();
}
```

### Task 2: Define Command Handler Types
- Description: Create interfaces for command handlers
- Files to create: `src/cli/commands/types.ts`
- Implementation:
```typescript
/**
 * Command handler interfaces and types.
 */

import type { AppConfig } from '../../config/schema.js';

/** Result of a command execution */
export interface CommandResult {
  /** Whether command executed successfully */
  success: boolean;
  /** Message to display to user */
  message?: string;
  /** Whether to exit the shell after this command */
  shouldExit?: boolean;
  /** Whether to clear the screen */
  shouldClear?: boolean;
  /** Whether to clear the conversation history */
  shouldClearHistory?: boolean;
  /** Additional data from command */
  data?: unknown;
}

/** Context passed to command handlers */
export interface CommandContext {
  /** Current app configuration */
  config: AppConfig | null;
  /** Callback to display output */
  onOutput: (content: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  /** Callback for interactive prompts */
  onPrompt?: (question: string) => Promise<string>;
  /** Exit the shell */
  exit: () => void;
}

/** Command handler function signature */
export type CommandHandler = (
  args: string,
  context: CommandContext
) => Promise<CommandResult>;

/** Command definition with metadata */
export interface CommandDefinition {
  /** Command aliases that trigger this handler */
  aliases: readonly string[];
  /** Brief description for help */
  description: string;
  /** Handler function */
  handler: CommandHandler;
  /** Whether command requires arguments */
  requiresArgs?: boolean;
  /** Usage example */
  usage?: string;
}
```

### Task 3: Implement Help Command Handler
- Description: Show available commands
- Files to create: `src/cli/commands/help.ts`
- Implementation:
```typescript
/**
 * Help command handler.
 */

import type { CommandHandler, CommandResult } from './types.js';

export const helpHandler: CommandHandler = async (_args, context): Promise<CommandResult> => {
  const helpText = `
Available Commands:
  /exit, /quit, q  - Exit the shell
  /help, ?, help   - Show this help message
  /clear, clear    - Clear screen and conversation history
  /continue        - Resume a previous session
  /purge           - Delete all agent data
  /telemetry       - Manage telemetry dashboard

Shell Commands:
  !<command>       - Execute shell command (e.g., !ls -la)

Keyboard Shortcuts:
  ESC              - Clear current input
  Ctrl+D           - Exit the shell
  Ctrl+C           - Cancel current operation
  Up/Down          - Navigate command history
`.trim();

  context.onOutput(helpText, 'info');
  return { success: true };
};
```

### Task 4: Implement Clear Command Handler
- Description: Clear screen and optionally conversation history
- Files to create: `src/cli/commands/clear.ts`
- Implementation:
```typescript
/**
 * Clear command handler.
 */

import type { CommandHandler, CommandResult } from './types.js';

export const clearHandler: CommandHandler = async (_args, _context): Promise<CommandResult> => {
  return {
    success: true,
    shouldClear: true,
    shouldClearHistory: true,
    message: 'Screen and history cleared',
  };
};
```

### Task 5: Implement Exit Command Handler
- Description: Exit the shell gracefully
- Files to create: `src/cli/commands/exit.ts`
- Implementation:
```typescript
/**
 * Exit command handler.
 */

import type { CommandHandler, CommandResult } from './types.js';

export const exitHandler: CommandHandler = async (_args, context): Promise<CommandResult> => {
  context.onOutput('Goodbye!', 'info');
  return {
    success: true,
    shouldExit: true,
  };
};
```

### Task 6: Implement Telemetry Command Handler
- Description: Wrap aspire.ts functions for CLI usage
- Files to create: `src/cli/commands/telemetry.ts`
- Implementation:
```typescript
/**
 * Telemetry command handler.
 * Wraps src/telemetry/aspire.ts functions for CLI usage.
 */

import type { CommandHandler, CommandResult } from './types.js';
import {
  startAspireDashboardWithConfig,
  stopAspireDashboardWithConfig,
  getAspireStatus,
  getAspireUrl,
  ASPIRE_DASHBOARD_URL,
  ASPIRE_OTLP_GRPC_ENDPOINT,
} from '../../telemetry/aspire.js';

export const telemetryHandler: CommandHandler = async (args, context): Promise<CommandResult> => {
  const action = args.trim().toLowerCase() || 'help';

  switch (action) {
    case 'start': {
      context.onOutput('Starting telemetry dashboard...', 'info');
      const result = await startAspireDashboardWithConfig({
        autoUpdateConfig: true,
      });

      if (result.success && result.result) {
        context.onOutput(`Dashboard started successfully!`, 'success');
        context.onOutput(`Dashboard: ${result.result.dashboardUrl}`, 'info');
        context.onOutput(`OTLP Endpoint: ${result.result.otlpEndpoint}`, 'info');
        return { success: true };
      } else {
        context.onOutput(`Failed to start dashboard: ${result.message}`, 'error');
        return { success: false, message: result.message };
      }
    }

    case 'stop': {
      context.onOutput('Stopping telemetry dashboard...', 'info');
      const result = await stopAspireDashboardWithConfig({
        autoUpdateConfig: true,
      });

      if (result.success) {
        context.onOutput('Dashboard stopped', 'success');
        return { success: true };
      } else {
        context.onOutput(`Failed to stop dashboard: ${result.message}`, 'error');
        return { success: false, message: result.message };
      }
    }

    case 'status': {
      const result = await getAspireStatus();

      if (result.success && result.result) {
        if (result.result.running) {
          context.onOutput('Telemetry dashboard is running', 'success');
          context.onOutput(`Status: ${result.result.uptime ?? 'Unknown'}`, 'info');
          context.onOutput(`Dashboard: ${result.result.dashboardUrl}`, 'info');
          context.onOutput(`OTLP Endpoint: ${result.result.otlpEndpoint}`, 'info');
        } else {
          context.onOutput('Telemetry dashboard is not running', 'warning');
          context.onOutput('Start with: /telemetry start', 'info');
        }
        return { success: true };
      } else {
        context.onOutput(`Failed to get status: ${result.message}`, 'error');
        return { success: false, message: result.message };
      }
    }

    case 'url': {
      const info = getAspireUrl(process.env.ENABLE_OTEL === 'true');
      context.onOutput('Telemetry Dashboard:', 'info');
      context.onOutput(`  ${info.dashboardUrl}`, 'info');
      context.onOutput('', 'info');
      context.onOutput('Telemetry status:', 'info');
      if (info.telemetryStatus === 'enabled') {
        context.onOutput('  Enabled (ENABLE_OTEL=true)', 'success');
      } else if (info.telemetryStatus === 'disabled') {
        context.onOutput('  Disabled (ENABLE_OTEL=false)', 'warning');
      } else {
        context.onOutput('  Auto-detection (activates when dashboard is running)', 'info');
      }
      return { success: true };
    }

    default:
      context.onOutput('Telemetry Commands:', 'info');
      context.onOutput('  /telemetry start   - Start telemetry dashboard', 'info');
      context.onOutput('  /telemetry stop    - Stop telemetry dashboard', 'info');
      context.onOutput('  /telemetry status  - Check if running', 'info');
      context.onOutput('  /telemetry url     - Show URLs and setup', 'info');
      return { success: true };
  }
};
```

### Task 7: Implement Shell Command Handler
- Description: Execute shell commands with ! prefix
- Files to create: `src/cli/commands/shell.ts`
- Implementation:
```typescript
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
      context.onOutput(`Exit code: ${result.exitCode}`, 'success');
    } else {
      context.onOutput(`Exit code: ${result.exitCode}`, 'warning');
    }

    return { success: result.exitCode === 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    context.onOutput(`Command failed: ${message}`, 'error');
    return { success: false, message };
  }
};
```

### Task 8: Create Command Registry
- Description: Central dispatcher for all commands
- Files to create: `src/cli/commands/index.ts`
- Implementation:
```typescript
/**
 * Command registry and dispatcher.
 */

import type { CommandDefinition, CommandHandler, CommandContext, CommandResult } from './types.js';
import {
  COMMAND_EXIT,
  COMMAND_HELP,
  COMMAND_CLEAR,
  COMMAND_TELEMETRY,
  matchesCommand,
  isShellCommand,
  extractShellCommand,
} from '../constants.js';

import { helpHandler } from './help.js';
import { clearHandler } from './clear.js';
import { exitHandler } from './exit.js';
import { telemetryHandler } from './telemetry.js';
import { shellHandler } from './shell.js';

export type { CommandDefinition, CommandHandler, CommandContext, CommandResult };
export { helpHandler, clearHandler, exitHandler, telemetryHandler, shellHandler };

/** All registered commands */
export const COMMANDS: CommandDefinition[] = [
  {
    aliases: COMMAND_EXIT,
    description: 'Exit the shell',
    handler: exitHandler,
  },
  {
    aliases: COMMAND_HELP,
    description: 'Show help message',
    handler: helpHandler,
  },
  {
    aliases: COMMAND_CLEAR,
    description: 'Clear screen and history',
    handler: clearHandler,
  },
  {
    aliases: COMMAND_TELEMETRY,
    description: 'Manage telemetry dashboard',
    handler: telemetryHandler,
    usage: '/telemetry [start|stop|status|url]',
  },
];

/**
 * Find a command handler for the given input.
 * Returns undefined if input is not a recognized command.
 */
export function findCommand(input: string): CommandDefinition | undefined {
  const normalized = input.trim().toLowerCase();
  const [baseCmd] = normalized.split(/\s+/);

  return COMMANDS.find((cmd) => matchesCommand(baseCmd, cmd.aliases));
}

/**
 * Extract arguments from command input.
 */
export function extractArgs(input: string): string {
  const trimmed = input.trim();
  const firstSpace = trimmed.indexOf(' ');
  return firstSpace > 0 ? trimmed.slice(firstSpace + 1).trim() : '';
}

/**
 * Execute a command and return the result.
 * Returns undefined if input is not a command.
 */
export async function executeCommand(
  input: string,
  context: CommandContext
): Promise<CommandResult | undefined> {
  // Handle shell commands (! prefix)
  if (isShellCommand(input)) {
    const command = extractShellCommand(input);
    return shellHandler(command, context);
  }

  // Find matching command
  const command = findCommand(input);
  if (!command) {
    return undefined;
  }

  // Extract arguments and execute
  const args = extractArgs(input);
  return command.handler(args, context);
}

/**
 * Check if input is a command (starts with / or ! or matches alias).
 */
export function isCommand(input: string): boolean {
  if (isShellCommand(input)) return true;
  return findCommand(input) !== undefined;
}
```

### Task 9: Create Input History Manager
- Description: Manage command history with navigation
- Files to create: `src/cli/input/history.ts`
- Implementation:
```typescript
/**
 * Command history management.
 */

/** Maximum history entries to keep */
const MAX_HISTORY_SIZE = 100;

/**
 * Input history manager.
 * Provides history navigation and storage.
 */
export class InputHistory {
  private history: string[] = [];
  private position: number = -1;
  private tempInput: string = '';

  /**
   * Add entry to history.
   * Does not add empty strings or duplicates of the last entry.
   */
  add(input: string): void {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Don't add duplicate of last entry
    if (this.history.length > 0 && this.history[this.history.length - 1] === trimmed) {
      return;
    }

    this.history.push(trimmed);

    // Trim history if too large
    if (this.history.length > MAX_HISTORY_SIZE) {
      this.history = this.history.slice(-MAX_HISTORY_SIZE);
    }

    // Reset position for next navigation
    this.reset();
  }

  /**
   * Navigate to previous entry (up arrow).
   * Returns previous entry or undefined if at start.
   */
  previous(currentInput: string): string | undefined {
    if (this.history.length === 0) return undefined;

    // Save current input if starting navigation
    if (this.position === -1) {
      this.tempInput = currentInput;
      this.position = this.history.length;
    }

    // Move up in history
    if (this.position > 0) {
      this.position--;
      return this.history[this.position];
    }

    return undefined;
  }

  /**
   * Navigate to next entry (down arrow).
   * Returns next entry, temp input, or undefined if at end.
   */
  next(): string | undefined {
    if (this.position === -1) return undefined;

    // Move down in history
    if (this.position < this.history.length - 1) {
      this.position++;
      return this.history[this.position];
    }

    // Return to current input
    if (this.position === this.history.length - 1) {
      this.position = -1;
      return this.tempInput;
    }

    return undefined;
  }

  /**
   * Reset navigation position.
   * Call after submitting input.
   */
  reset(): void {
    this.position = -1;
    this.tempInput = '';
  }

  /**
   * Get all history entries.
   */
  getAll(): string[] {
    return [...this.history];
  }

  /**
   * Clear all history.
   */
  clear(): void {
    this.history = [];
    this.reset();
  }

  /**
   * Get current position in history (-1 means not navigating).
   */
  getPosition(): number {
    return this.position;
  }
}
```

### Task 10: Create Input Types
- Description: Define input state interfaces
- Files to create: `src/cli/input/types.ts`
- Implementation:
```typescript
/**
 * Input handling types and interfaces.
 */

/** Input buffer state */
export interface InputState {
  /** Current input text */
  value: string;
  /** Cursor position (for future use) */
  cursorPosition: number;
  /** Whether currently navigating history */
  isNavigatingHistory: boolean;
}

/** Keyboard shortcut identifiers */
export type KeyboardShortcut =
  | 'escape'
  | 'ctrl+d'
  | 'ctrl+c'
  | 'up'
  | 'down'
  | 'return'
  | 'backspace'
  | 'delete';

/** Result of input processing */
export interface InputResult {
  /** Updated input state */
  state: InputState;
  /** Action to perform */
  action?: 'submit' | 'exit' | 'clear' | 'none';
}
```

### Task 11: Create Input Module Exports
- Description: Export input handling utilities
- Files to create: `src/cli/input/index.ts`
- Implementation:
```typescript
/**
 * Input handling module exports.
 */

export { InputHistory } from './history.js';
export type { InputState, KeyboardShortcut, InputResult } from './types.js';
```

### Task 12: Update CLI Types
- Description: Add command-related types to CLI module
- Files to modify: `src/cli/types.ts`
- Add types for command output and context

### Task 13: Update CLI Module Exports
- Description: Export new constants and commands
- Files to modify: `src/cli/index.ts`
- Implementation:
```typescript
/**
 * CLI module exports.
 */

// Types
export type {
  CLIFlags,
  CLIProps,
  SinglePromptProps,
  InteractiveShellProps,
  ShellState,
  ShellMessage,
} from './types.js';

// Constants
export * from './constants.js';

// Callbacks
export { createCallbacks, type CallbackState, type CallbackFactoryOptions } from './callbacks.js';

// Commands
export { executeCommand, isCommand, findCommand, COMMANDS } from './commands/index.js';
export type { CommandResult, CommandContext, CommandHandler, CommandDefinition } from './commands/types.js';

// Input
export { InputHistory } from './input/index.js';
export type { InputState, KeyboardShortcut, InputResult } from './input/types.js';

// Version
export { VERSION } from './version.js';
```

### Task 14: Update InteractiveShell Component
- Description: Integrate command registry and input handling
- Files to modify: `src/components/InteractiveShell.tsx`
- Key changes:
  - Replace inline command handling with executeCommand()
  - Add InputHistory instance via useRef
  - Add up/down arrow history navigation
  - Add ESC to clear input
  - Add Ctrl+D to exit
  - Handle command results (shouldExit, shouldClear, shouldClearHistory)
  - Add system message display for command output

### Task 15: Write Constants Tests
- Description: Test command matching and utilities
- Files to create: `src/cli/__tests__/constants.test.ts`
- Test cases:
  - matchesCommand matches all aliases
  - matchesCommand is case-insensitive
  - isShellCommand detects ! prefix
  - isSlashCommand detects / prefix
  - extractShellCommand removes prefix

### Task 16: Write Command Handler Tests
- Description: Test individual command handlers
- Files to create: `src/cli/commands/__tests__/handlers.test.ts`
- Test cases:
  - helpHandler returns success and outputs help text
  - clearHandler sets shouldClear and shouldClearHistory
  - exitHandler sets shouldExit
  - telemetryHandler handles start/stop/status/url actions
  - telemetryHandler shows help on unknown action
  - shellHandler executes commands and captures output

### Task 17: Write Command Registry Tests
- Description: Test command dispatcher
- Files to create: `src/cli/commands/__tests__/registry.test.ts`
- Test cases:
  - findCommand finds commands by alias
  - findCommand returns undefined for non-commands
  - extractArgs extracts arguments correctly
  - executeCommand routes to correct handler
  - executeCommand handles shell commands
  - isCommand identifies commands correctly

### Task 18: Write Input History Tests
- Description: Test history navigation
- Files to create: `src/cli/input/__tests__/history.test.ts`
- Test cases:
  - add() stores entries
  - add() skips empty strings
  - add() skips duplicate of last entry
  - previous() navigates backward
  - next() navigates forward
  - next() returns to temp input
  - reset() clears navigation state
  - history limited to MAX_HISTORY_SIZE

### Task 19: Write InteractiveShell Integration Tests
- Description: Test shell with command integration
- Files to modify: `src/components/__tests__/InteractiveShell.test.tsx`
- Additional test cases:
  - Handles /help command
  - Handles /clear command
  - Handles exit aliases (q, /quit, exit)
  - Up/down arrows navigate history
  - ESC clears current input
  - Ctrl+D exits shell

## Testing Strategy

### Unit Tests
- Command constants and matching functions
- Individual command handlers with mocked context
- Command registry dispatch logic
- Input history navigation

### Integration Tests
- InteractiveShell command execution flow
- Keyboard shortcut handling
- History navigation in shell context

### Edge Cases
- Empty input submission
- Unknown commands
- Malformed command arguments
- Very long command history
- Rapid up/down arrow navigation
- Shell command timeout
- Shell command with special characters

## Acceptance Criteria

- [ ] Command aliases work (`q`, `exit`, `/exit` all exit the shell)
- [ ] `/help` displays all available commands and shortcuts
- [ ] `/clear` clears screen and conversation history
- [ ] `/telemetry start|stop|status|url` manage Aspire Dashboard
- [ ] `!<command>` executes shell commands with output display
- [ ] Up/down arrows navigate command history
- [ ] ESC clears current input without submitting
- [ ] Ctrl+D exits the shell
- [ ] Ctrl+C cancels current operation (already works)
- [ ] Command handlers are separated from InteractiveShell component
- [ ] All tests pass with 85%+ coverage
- [ ] No type errors (`bun run typecheck`)
- [ ] Linting passes (`bun run lint`)
- [ ] Build succeeds (`bun run build`)

## Validation Commands

```bash
# Type checking
bun run typecheck

# Linting
bun run lint

# Run all tests
bun run test

# Run specific test files
bun run test src/cli/__tests__/constants.test.ts
bun run test src/cli/commands/__tests__/
bun run test src/cli/input/__tests__/
bun run test src/components/__tests__/InteractiveShell.test.tsx

# Build verification
bun run build

# Manual testing
bun run dev               # Start interactive mode
# Then test commands:
#   /help
#   /clear
#   /telemetry status
#   !ls -la
#   q (to exit)
```

## Notes

### Design Decisions

1. **Separate command module**: Commands live in `src/cli/commands/` not in components. This enables testing without Ink rendering and follows separation of concerns.

2. **Command registry pattern**: Central registry with aliases enables extensibility. Future commands (e.g., `/continue`, `/purge` from Features 20 and 34) can be added without modifying InteractiveShell.

3. **InputHistory class over hook**: Class-based history manager is more testable and can be shared across components if needed.

4. **Structured CommandResult**: Returning `{ shouldExit, shouldClear }` lets InteractiveShell handle UI concerns while commands focus on logic.

5. **Wrap existing aspire.ts**: The telemetry command wraps existing functions rather than duplicating logic. This ensures consistency with programmatic usage.

### Python Parity Notes

Features deferred to later:
- `/continue` command (Feature 20: Session management)
- `/purge` command (Feature 34: Session commands)
- `/memory` command (Feature 18: Memory system)
- Persistent command history file (could add in polish phase)
- Status bar with git branch (Feature 16: Terminal display components)

### Future Considerations

- Feature 20 will add `/continue` command using session persistence
- Feature 34 will add `/purge` and session management commands
- Post-MVP could add persistent history file storage
- Could add command completion/suggestions with tab

## Execution

This spec can be implemented using: `/sdlc:implement docs/specs/feature-015-input-handling-command-parsing.md`
