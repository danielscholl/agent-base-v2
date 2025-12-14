# Feature 14: Build the Ink CLI Shell (Interactive + Single-Prompt)

## Feature Description

Create `src/cli.tsx` and refactor `src/index.tsx` to replicate the top-level experience of the Python `../agent-base/src/agent/cli/app.py`: interactive chat by default, `-p/--prompt` for one-shot runs, and flags for provider/model selection. Structure the CLI so it can host subcommands later (config, skills, session). This feature establishes the primary user interface for the TypeScript agent framework.

## User Story

As a user of the agent framework
I want a command-line interface that supports both interactive chat and single-prompt modes
So that I can have conversations with the agent or use it for scripting and automation

## Problem Statement

The TypeScript agent framework currently has:
- A demo `src/index.tsx` that exits immediately after rendering
- No CLI argument parsing for mode selection, provider overrides, or other options
- No interactive shell for conversational use
- No single-prompt mode for scripting and automation

Users need a CLI that matches the Python agent-base experience:
- Interactive mode for conversational AI interactions
- Single-prompt mode (`-p/--prompt`) for scripting
- Provider/model selection via CLI flags
- Configuration and health check commands
- Extensible structure for future subcommands

## Solution Statement

Implement a comprehensive CLI shell using:
1. **meow** for CLI argument parsing (already in dependencies)
2. **React/Ink** for terminal UI rendering (already in dependencies)
3. **Callback-driven architecture** connecting Agent to UI components
4. **Modular component structure** ready for future extensions

The CLI will support:
- Interactive mode (default): Full chat experience with history
- Single-prompt mode (`-p`): Execute query and exit (clean output for scripting)
- Health check (`--check`): Show configuration and connectivity
- Version display (`--version`)
- Provider/model overrides (`--provider`, `--model`)
- Session resumption (`--continue`)

## Related Documentation

### Requirements
- `docs/plans/typescript-rewrite-features.md`: Feature 14 specification (lines 101-102)
- Feature 15: Input handling and command parsing (tight coupling)
- Feature 16: Terminal display components (builds on this foundation)

### Architecture Decisions
- `docs/architecture.md`: CLI layer architecture, callback patterns
- `CLAUDE.md`: Callback-driven architecture principle, React/Ink layer separation

## Codebase Analysis Findings

### Architecture Patterns
- **Callback interface**: `AgentCallbacks` in `src/agent/callbacks.ts` provides all hooks needed for UI integration
- **Agent class**: `src/agent/agent.ts` has `run()` and `runStream()` methods ready for CLI integration
- **Config loading**: `ConfigManager` in `src/config/manager.ts` handles hierarchical config loading
- **Error handling**: Structured `AgentErrorResponse` with `getUserFriendlyMessage()` for display

### Naming Conventions
- camelCase for variables and functions
- PascalCase for React components and types
- Files use kebab-case (e.g., `cli.tsx`, `single-prompt.tsx`)
- Component files in `src/components/`

### Similar Implementations
- `src/index.tsx`: Current entry point with Ink render pattern
- `src/components/App.tsx`: Basic Ink component structure
- Python `../agent-base/src/agent/cli/app.py`: Reference implementation with Typer

### Integration Patterns
- Ink components receive callbacks as props
- Configuration injected at entry point
- Environment variables for provider/model overrides (existing pattern)

## Relevant Files

### Existing Files
- `src/index.tsx`: Entry point to refactor with meow CLI parsing
- `src/components/App.tsx`: Base component (rename to preserve or remove)
- `src/agent/agent.ts`: Agent class for CLI to instantiate
- `src/agent/callbacks.ts`: AgentCallbacks interface for UI integration
- `src/config/manager.ts`: Config loading functions
- `src/errors/index.ts`: Error types and getUserFriendlyMessage()

### New Files
- `src/cli.tsx`: Main CLI router component
- `src/components/InteractiveShell.tsx`: Interactive chat mode component
- `src/components/SinglePrompt.tsx`: Single-prompt mode component
- `src/components/Spinner.tsx`: Loading indicator component
- `src/components/Header.tsx`: Banner and status display
- `src/components/ErrorDisplay.tsx`: Formatted error output
- `src/cli/__tests__/cli.test.tsx`: CLI router tests
- `src/components/__tests__/InteractiveShell.test.tsx`: Interactive mode tests
- `src/components/__tests__/SinglePrompt.test.tsx`: Single-prompt mode tests

## Implementation Plan

### Phase 1: Foundation
1. Create CLI types and interfaces
2. Implement meow CLI argument parsing in `src/index.tsx`
3. Create CLI router component in `src/cli.tsx`

### Phase 2: Core Components
1. Implement Spinner component
2. Implement Header component
3. Implement ErrorDisplay component
4. Implement SinglePrompt component (simpler, test Agent integration first)

### Phase 3: Interactive Mode
1. Implement InteractiveShell skeleton with state management
2. Add basic input handling (using `useInput` hook)
3. Wire callbacks from Agent to UI state
4. Add slash command routing skeleton (actual commands in Feature 15)

### Phase 4: Integration & Polish
1. Add health check display (`--check`)
2. Add version display (`--version`)
3. Wire up provider/model overrides
4. Add session resumption flag (`--continue`, full implementation in Feature 20)

## Step by Step Tasks

### Task 1: Define CLI Types
- Description: Create TypeScript interfaces for CLI flags and props
- Files to create: `src/cli/types.ts`
- Implementation:
  ```typescript
  export interface CLIFlags {
    prompt?: string;
    check?: boolean;
    tools?: boolean;
    version?: boolean;
    provider?: string;
    model?: string;
    continue?: boolean;
    verbose?: boolean;
  }

  export interface CLIProps {
    flags: CLIFlags;
  }
  ```

### Task 2: Refactor Entry Point with meow
- Description: Add CLI argument parsing using meow
- Files to modify: `src/index.tsx`
- Implementation:
  ```typescript
  import meow from 'meow';
  import { render } from 'ink';
  import { CLI } from './cli.js';

  const cli = meow(`
    Usage
      $ agent [options]
      $ agent -p <prompt> [options]

    Options
      -p, --prompt <text>    Execute single prompt and exit
      --check                Show configuration and connectivity
      --tools                Show tool configuration
      --version              Show version
      --provider <name>      Override provider
      --model <name>         Override model name
      --continue             Resume last session
      --verbose              Show detailed execution

    Examples
      $ agent                           # Interactive mode
      $ agent -p "Say hello"            # Single prompt
      $ agent --provider anthropic      # Use specific provider
  `, {
    importMeta: import.meta,
    flags: {
      prompt: { type: 'string', shortFlag: 'p' },
      check: { type: 'boolean', default: false },
      tools: { type: 'boolean', default: false },
      version: { type: 'boolean', default: false },
      provider: { type: 'string' },
      model: { type: 'string' },
      continue: { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
    }
  });

  // Apply overrides to environment
  if (cli.flags.provider) process.env.LLM_PROVIDER = cli.flags.provider;
  if (cli.flags.model) process.env.AGENT_MODEL = cli.flags.model;

  const { waitUntilExit } = render(<CLI flags={cli.flags} />);
  await waitUntilExit();
  ```

### Task 3: Create CLI Router Component
- Description: Route to appropriate mode based on flags
- Files to create: `src/cli.tsx`
- Implementation:
  ```typescript
  import React from 'react';
  import type { CLIProps } from './cli/types.js';
  import { Version } from './components/Version.js';
  import { HealthCheck } from './components/HealthCheck.js';
  import { ToolsInfo } from './components/ToolsInfo.js';
  import { SinglePrompt } from './components/SinglePrompt.js';
  import { InteractiveShell } from './components/InteractiveShell.js';

  export function CLI({ flags }: CLIProps): React.ReactElement {
    if (flags.version) {
      return <Version />;
    }
    if (flags.check) {
      return <HealthCheck />;
    }
    if (flags.tools) {
      return <ToolsInfo />;
    }
    if (flags.prompt) {
      return <SinglePrompt prompt={flags.prompt} verbose={flags.verbose} />;
    }
    return <InteractiveShell resumeSession={flags.continue} />;
  }
  ```

### Task 4: Implement Spinner Component
- Description: Create loading indicator using Ink
- Files to create: `src/components/Spinner.tsx`
- Implementation:
  ```typescript
  import React from 'react';
  import { Text } from 'ink';

  const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  interface SpinnerProps {
    message?: string;
  }

  export function Spinner({ message = 'Loading...' }: SpinnerProps): React.ReactElement {
    const [frame, setFrame] = React.useState(0);

    React.useEffect(() => {
      const timer = setInterval(() => {
        setFrame(f => (f + 1) % SPINNER_FRAMES.length);
      }, 80);
      return () => clearInterval(timer);
    }, []);

    return (
      <Text color="cyan">
        {SPINNER_FRAMES[frame]} {message}
      </Text>
    );
  }
  ```

### Task 5: Implement Header Component
- Description: Display banner with version and model info
- Files to create: `src/components/Header.tsx`
- Implementation:
  ```typescript
  import React from 'react';
  import { Box, Text } from 'ink';

  interface HeaderProps {
    version: string;
    model?: string;
    provider?: string;
  }

  export function Header({ version, model, provider }: HeaderProps): React.ReactElement {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color="green" bold>Agent Framework v{version}</Text>
        {model && provider && (
          <Text dimColor>Model: {provider}/{model}</Text>
        )}
      </Box>
    );
  }
  ```

### Task 6: Implement ErrorDisplay Component
- Description: Format and display agent errors
- Files to create: `src/components/ErrorDisplay.tsx`
- Implementation:
  ```typescript
  import React from 'react';
  import { Box, Text } from 'ink';
  import type { AgentErrorResponse } from '../errors/index.js';
  import { getUserFriendlyMessage } from '../errors/index.js';

  interface ErrorDisplayProps {
    error: AgentErrorResponse;
  }

  export function ErrorDisplay({ error }: ErrorDisplayProps): React.ReactElement {
    const friendlyMessage = getUserFriendlyMessage(error.error, error.metadata);

    return (
      <Box flexDirection="column">
        <Text color="red">Error: {friendlyMessage}</Text>
        {error.metadata?.provider && (
          <Text dimColor>Provider: {error.metadata.provider}</Text>
        )}
      </Box>
    );
  }
  ```

### Task 7: Implement Version Component
- Description: Display version information
- Files to create: `src/components/Version.tsx`
- Implementation:
  ```typescript
  import React, { useEffect } from 'react';
  import { Text, useApp } from 'ink';
  // Import version from package.json
  import pkg from '../../package.json' assert { type: 'json' };

  export function Version(): React.ReactElement {
    const { exit } = useApp();

    useEffect(() => {
      // Exit after displaying version
      const timer = setTimeout(() => exit(), 0);
      return () => clearTimeout(timer);
    }, [exit]);

    return <Text>Agent Framework v{pkg.version}</Text>;
  }
  ```

### Task 8: Implement HealthCheck Component
- Description: Display configuration and connectivity status
- Files to create: `src/components/HealthCheck.tsx`
- Implementation: Show system info, loaded config, provider status (placeholder for full Feature 31)

### Task 9: Implement ToolsInfo Component
- Description: Display available tools
- Files to create: `src/components/ToolsInfo.tsx`
- Implementation: List registered tools with descriptions (placeholder)

### Task 10: Implement SinglePrompt Component
- Description: Execute single query and exit
- Files to create: `src/components/SinglePrompt.tsx`
- Key features:
  - Load config on mount
  - Create Agent with callbacks
  - Execute query via `agent.run()` or `agent.runStream()`
  - Display result (or stream chunks)
  - Exit on completion
- Callbacks to wire:
  - `onSpinnerStart/Stop` → show/hide Spinner
  - `onLLMStream` → append to output (if streaming)
  - `onError` → display ErrorDisplay
  - `onAgentEnd` → display result, exit

### Task 11: Implement InteractiveShell Component
- Description: Interactive chat mode with state management
- Files to create: `src/components/InteractiveShell.tsx`
- Key features:
  - State: `messages`, `input`, `isProcessing`, `error`
  - Lazy agent initialization on first query
  - Header display with model info
  - Message history rendering
  - Input handling (delegate to Feature 15 for full implementation)
  - Slash command detection (route to handler, implement in Feature 15)
- Callbacks to wire:
  - `onSpinnerStart/Stop` → update UI state
  - `onLLMStream` → append to current response
  - `onToolStart/End` → show tool execution status
  - `onError` → set error state
  - `onAgentEnd` → append to messages

### Task 12: Create Callback Factory
- Description: Factory function to create callbacks that update React state
- Files to create: `src/cli/callbacks.ts`
- Implementation:
  ```typescript
  import type { AgentCallbacks } from '../agent/callbacks.js';

  interface CallbackState {
    setSpinnerMessage: (message: string | null) => void;
    setIsProcessing: (value: boolean) => void;
    appendToOutput: (text: string) => void;
    setError: (error: AgentErrorResponse | null) => void;
  }

  export function createCallbacks(state: CallbackState): AgentCallbacks {
    return {
      onSpinnerStart: (message) => {
        state.setSpinnerMessage(message);
        state.setIsProcessing(true);
      },
      onSpinnerStop: () => {
        state.setSpinnerMessage(null);
        state.setIsProcessing(false);
      },
      onLLMStream: (_ctx, chunk) => {
        state.appendToOutput(chunk);
      },
      onError: (_ctx, error) => {
        state.setError(error);
        state.setIsProcessing(false);
      },
      onDebug: (message, data) => {
        // Only log in verbose mode
        if (process.env.AGENT_DEBUG) {
          console.error(`[DEBUG] ${message}`, data);
        }
      },
    };
  }
  ```

### Task 13: Add CLI Module Exports
- Description: Export CLI types and utilities
- Files to create: `src/cli/index.ts`
- Exports: types, callback factory

### Task 14: Write Unit Tests for CLI Router
- Description: Test CLI routing logic
- Files to create: `src/cli/__tests__/cli.test.tsx`
- Test cases:
  - Renders Version when `--version` flag
  - Renders HealthCheck when `--check` flag
  - Renders SinglePrompt when `-p` flag with prompt
  - Renders InteractiveShell by default

### Task 15: Write Unit Tests for SinglePrompt
- Description: Test single-prompt mode
- Files to create: `src/components/__tests__/SinglePrompt.test.tsx`
- Test cases:
  - Loads config on mount
  - Creates agent with correct callbacks
  - Displays spinner while processing
  - Shows result after completion
  - Displays error on failure
  - Exits after completion

### Task 16: Write Unit Tests for InteractiveShell
- Description: Test interactive mode skeleton
- Files to create: `src/components/__tests__/InteractiveShell.test.tsx`
- Test cases:
  - Renders header with version
  - Shows initial greeting
  - Displays spinner during processing
  - (Input handling tests in Feature 15)

### Task 17: Update package.json Scripts
- Description: Ensure dev script works with new entry point
- Files to modify: `package.json`
- Verify `bun run dev` executes the CLI correctly

## Testing Strategy

### Unit Tests
- CLI router component routing logic
- Individual component rendering
- Callback factory creates correct callbacks
- State updates flow correctly

### Integration Tests
- Single-prompt mode executes full Agent flow (mocked LLM)
- Interactive shell initializes Agent correctly
- Provider/model overrides apply to config

### Edge Cases
- Empty prompt string (`-p ""`)
- Invalid provider name
- Missing API keys (config not configured)
- Ctrl+C during processing
- Very long responses (streaming)

## Acceptance Criteria

- [ ] `src/index.tsx` parses CLI arguments with meow
- [ ] `src/cli.tsx` routes to correct mode based on flags
- [ ] `--version` displays version and exits
- [ ] `--check` displays config status and exits
- [ ] `-p "prompt"` executes query and exits with clean output
- [ ] Default mode shows interactive shell
- [ ] `--provider` and `--model` override default config
- [ ] `--verbose` shows detailed execution in single-prompt mode
- [ ] Spinner displays during Agent processing
- [ ] Errors display user-friendly messages
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
bun run test src/cli/__tests__/cli.test.tsx
bun run test src/components/__tests__/SinglePrompt.test.tsx

# Build verification
bun run build

# Manual testing
bun run dev --version
bun run dev --check
bun run dev -p "Say hello"
bun run dev  # Interactive mode
```

## Notes

### Design Decisions

1. **meow over Typer**: meow is already in dependencies, provides clean CLI parsing with TypeScript support, and integrates well with Ink's render model

2. **Component-based routing**: CLI router component pattern allows easy testing and future extension for subcommands

3. **Callback factory pattern**: Centralizes callback creation, making it easier to test and ensuring consistent state management across components

4. **Lazy Agent initialization**: Agent is created on first query, not on shell start. This matches Python behavior and avoids unnecessary API key validation until needed

5. **Streaming in SinglePrompt**: When verbose mode is enabled, use `runStream()` to show incremental output; otherwise use `run()` for clean final output

### Python Parity Notes

The Python `app.py` includes:
- `config` subcommand group (defer to Feature 31)
- `skill` subcommand group (defer to Feature 33)
- `/telemetry` slash command (defer to Feature 11 integration)
- `/memory` flag (defer to Feature 18)

This feature implements the core CLI structure; subcommands and slash commands are implemented in later features.

### Future Considerations

- Feature 15 adds full input handling and slash command parsing
- Feature 16 adds TaskProgress and AnswerBox components
- Feature 20 adds session save/restore
- Features 31-34 add subcommand groups

## Execution

This spec can be implemented using: `/sdlc:implement docs/specs/feature-014-ink-cli-shell.md`
