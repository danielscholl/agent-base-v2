# Feature 16: Add Basic Terminal Display Components

## Feature Description

Implement Ink equivalents of Rich UI pieces as `components/TaskProgress.tsx` and `components/AnswerBox.tsx`. The existing `Spinner.tsx` is already functional and requires no changes. Wire all components via callbacks so planning/execution state is visible without relying on global events.

This feature completes the Phase 2 CLI experience by providing visual feedback during agent operations: tool execution progress, streaming LLM responses, and loading states.

## User Story

As a user of the agent framework CLI
I want to see visual feedback when the agent is thinking, executing tools, and generating responses
So that I can understand what's happening during agent operations and feel confident the system is working

## Problem Statement

The current CLI provides minimal visual feedback during agent operations:
- `Spinner.tsx` shows loading states but only with a simple message
- No dedicated component for displaying streaming LLM responses with proper formatting
- No visualization of tool execution progress (which tools are running, success/failure status)
- Tool callbacks (`onToolStart`, `onToolEnd`) exist in `AgentCallbacks` but aren't wired to display components
- Streaming output is displayed inline without clear visual separation

The Python Rich implementation provides:
- Task progress trees showing execution hierarchy
- Streaming answer boxes with typing indicators
- Status indicators for each operation phase

## Solution Statement

Implement two new display components that integrate with the existing callback system:

1. **TaskProgress.tsx** - Displays tool execution status
   - Shows active tools with spinner animation
   - Shows completed tools with success/failure indicators
   - Integrates with `onToolStart` and `onToolEnd` callbacks
   - Supports multiple concurrent tool displays

2. **AnswerBox.tsx** - Displays streaming LLM responses
   - Visual container for assistant responses
   - Typing indicator when streaming and no content yet
   - Smooth display of streamed chunks
   - Integrates with `onLLMStream` and `onLLMEnd` callbacks

Both components receive state as props (parent-controlled), following the established pattern from `Spinner.tsx`, `ErrorDisplay.tsx`, and `Header.tsx`.

## Related Documentation

### Requirements
- `docs/plans/typescript-rewrite-features.md`: Feature 16 specification (line 107-108)
- Feature 14: Ink CLI Shell - provides foundation (InteractiveShell, SinglePrompt)
- Feature 15: Input Handling - provides command infrastructure

### Architecture Decisions
- `docs/decisions/0005-terminal-ui-react-ink.md`: React 19 + Ink 6 for terminal UI
- `docs/decisions/0007-callbacks-over-eventbus.md`: Callback patterns for agent-UI communication
- `docs/architecture.md`: CLI layer responsibilities, callback flow

## Codebase Analysis Findings

### Architecture Patterns
- **Parent-controlled state**: Components receive props; parent manages state
- **Callback wiring**: `createCallbacks()` factory transforms state setters to `AgentCallbacks`
- **Conditional rendering**: Parent controls visibility via JSX conditionals, not component internal state
- **Mount safety**: `mountedRef` pattern for async state updates

### Naming Conventions
- **Components**: PascalCase files, PascalCase function names, `{Name}Props` interfaces
- **Props**: JSDoc on every prop, optional marked with `?`
- **State interfaces**: Defined before `useState` call, functional updates with `setState(s => ...)`

### Similar Implementations
- `src/components/Spinner.tsx`: Simple animated component (already implemented)
- `src/components/ErrorDisplay.tsx`: Structured data display pattern
- `src/components/Header.tsx`: Multi-prop display with optional fields
- `src/components/InteractiveShell.tsx`: State management and callback integration

### Integration Points
- `src/cli/callbacks.ts`: `createCallbacks()` factory to extend
- `src/agent/callbacks.ts`: `AgentCallbacks` interface (has `onToolStart`, `onToolEnd`)
- `src/components/InteractiveShell.tsx`: Primary integration target
- `src/components/SinglePrompt.tsx`: Secondary integration target

### Color Conventions (from existing components)
- Cyan: Input, spinners, interactive elements
- Green: Success, assistant responses
- Red: Errors
- Yellow: System messages, warnings
- dimColor: Secondary information, metadata

## Archon Project

Project ID: `940eb0c2-47f6-4455-a70b-0446c719f414`

## Relevant Files

### Existing Files
- `src/components/Spinner.tsx`: Existing spinner (no changes needed)
- `src/components/Header.tsx`: Reference for simple prop-based component
- `src/components/ErrorDisplay.tsx`: Reference for structured display
- `src/components/InteractiveShell.tsx`: Main integration target
- `src/components/SinglePrompt.tsx`: Secondary integration target
- `src/cli/callbacks.ts`: Callback factory to extend
- `src/cli/types.ts`: CLI type definitions
- `src/agent/callbacks.ts`: AgentCallbacks interface
- `src/tools/types.ts`: ToolResponse type for tool results

### New Files
- `src/components/TaskProgress.tsx`: Tool execution progress display
- `src/components/AnswerBox.tsx`: Streaming answer display
- `src/components/__tests__/TaskProgress.test.tsx`: TaskProgress tests
- `src/components/__tests__/AnswerBox.test.tsx`: AnswerBox tests

## Implementation Plan

### Phase 1: TaskProgress Component
Create a component that displays tool execution status with active/completed states and success/failure indicators.

### Phase 2: AnswerBox Component
Create a component for displaying streaming LLM responses with visual container and typing indicator.

### Phase 3: Callback Extensions
Extend `CallbackState` interface with tool tracking state setters for proper integration.

### Phase 4: Integration
Wire new components into InteractiveShell and SinglePrompt with proper state management.

## Step by Step Tasks

### Task 1: Create TaskProgress Component Types
- Description: Define types for tool execution tracking
- Files to create: Types inline in `src/components/TaskProgress.tsx`
- Implementation:

```typescript
/**
 * TaskProgress component for tool execution visualization.
 * Displays active and completed tool operations.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Spinner } from './Spinner.js';
import type { ToolResponse } from '../tools/types.js';

/**
 * Information about an active tool execution.
 */
export interface ActiveTask {
  /** Unique identifier for the task */
  id: string;
  /** Tool name */
  name: string;
  /** Tool arguments (for display) */
  args?: Record<string, unknown>;
  /** Timestamp when tool started */
  startTime: number;
}

/**
 * Information about a completed tool execution.
 */
export interface CompletedTask {
  /** Tool name */
  name: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Duration in milliseconds */
  duration: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Props for TaskProgress component.
 */
export interface TaskProgressProps {
  /** Currently active tool executions */
  activeTasks?: ActiveTask[];
  /** Completed tool executions */
  completedTasks?: CompletedTask[];
  /** Whether to show completed tasks (default: true) */
  showCompleted?: boolean;
  /** Maximum completed tasks to show (default: 3) */
  maxCompleted?: number;
}
```

### Task 2: Implement TaskProgress Component
- Description: Create the TaskProgress display component
- Files to create: `src/components/TaskProgress.tsx`
- Implementation:

```typescript
/**
 * TaskProgress component.
 * Displays tool execution status with active spinners and completion indicators.
 */
export function TaskProgress({
  activeTasks = [],
  completedTasks = [],
  showCompleted = true,
  maxCompleted = 3,
}: TaskProgressProps): React.ReactElement | null {
  // Don't render if no tasks
  if (activeTasks.length === 0 && completedTasks.length === 0) {
    return null;
  }

  // Get most recent completed tasks
  const visibleCompleted = showCompleted
    ? completedTasks.slice(-maxCompleted)
    : [];

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Completed tasks (most recent) */}
      {visibleCompleted.map((task, index) => (
        <Box key={`completed-${index}`}>
          <Text color={task.success ? 'green' : 'red'}>
            {task.success ? '✓' : '✗'}
          </Text>
          <Text> {task.name}</Text>
          <Text dimColor> ({task.duration}ms)</Text>
          {task.error && <Text color="red"> - {task.error}</Text>}
        </Box>
      ))}

      {/* Active tasks */}
      {activeTasks.map((task, index) => (
        <Box key={`active-${index}`}>
          <Spinner message="" />
          <Text color="cyan"> {task.name}</Text>
          {task.args && Object.keys(task.args).length > 0 && (
            <Text dimColor> ({formatArgs(task.args)})</Text>
          )}
        </Box>
      ))}
    </Box>
  );
}

/**
 * Format tool arguments for display.
 * Shows first few args, truncates long values.
 */
function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args).slice(0, 2);
  return entries
    .map(([key, value]) => {
      const strValue = String(value);
      const truncated = strValue.length > 20 ? strValue.slice(0, 17) + '...' : strValue;
      return `${key}: ${truncated}`;
    })
    .join(', ');
}
```

### Task 3: Create AnswerBox Component
- Description: Create the streaming answer display component
- Files to create: `src/components/AnswerBox.tsx`
- Implementation:

```typescript
/**
 * AnswerBox component for streaming LLM response display.
 * Provides visual container for assistant responses with typing indicator.
 */

import React from 'react';
import { Box, Text } from 'ink';

/**
 * Props for AnswerBox component.
 */
export interface AnswerBoxProps {
  /** Content to display (accumulated streamed text) */
  content: string;
  /** Whether currently streaming (show typing indicator) */
  isStreaming?: boolean;
  /** Optional label for the box */
  label?: string;
}

/** Typing indicator character */
const TYPING_INDICATOR = '▌';

/**
 * AnswerBox component.
 * Displays streaming LLM responses with visual container.
 */
export function AnswerBox({
  content,
  isStreaming = false,
  label,
}: AnswerBoxProps): React.ReactElement | null {
  // Don't render if empty and not streaming
  if (!content && !isStreaming) {
    return null;
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Optional label */}
      {label && (
        <Text dimColor>{label}</Text>
      )}

      {/* Content with optional typing indicator */}
      <Box>
        <Text color="green">
          {content}
          {isStreaming && <Text color="cyan">{TYPING_INDICATOR}</Text>}
        </Text>
      </Box>

      {/* Show "thinking..." when streaming starts but no content yet */}
      {isStreaming && !content && (
        <Text color="cyan" dimColor>
          Generating response...
        </Text>
      )}
    </Box>
  );
}
```

### Task 4: Write TaskProgress Tests
- Description: Test TaskProgress component rendering
- Files to create: `src/components/__tests__/TaskProgress.test.tsx`
- Implementation:

```typescript
/**
 * Tests for TaskProgress component.
 */

import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { render } from 'ink-testing-library';
import { TaskProgress } from '../TaskProgress.js';
import type { ActiveTask, CompletedTask } from '../TaskProgress.js';

describe('TaskProgress', () => {
  it('renders nothing when no tasks', () => {
    const { lastFrame } = render(<TaskProgress />);
    expect(lastFrame()).toBe('');
  });

  it('renders active task with spinner', () => {
    const activeTasks: ActiveTask[] = [
      { name: 'read_file', startTime: Date.now() },
    ];

    const { lastFrame } = render(<TaskProgress activeTasks={activeTasks} />);

    expect(lastFrame()).toContain('read_file');
    // Spinner frame should be present (one of the braille characters)
    expect(lastFrame()).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
  });

  it('renders active task with arguments', () => {
    const activeTasks: ActiveTask[] = [
      {
        name: 'read_file',
        args: { path: '/test/file.txt' },
        startTime: Date.now(),
      },
    ];

    const { lastFrame } = render(<TaskProgress activeTasks={activeTasks} />);

    expect(lastFrame()).toContain('read_file');
    expect(lastFrame()).toContain('path: /test/file.txt');
  });

  it('truncates long argument values', () => {
    const activeTasks: ActiveTask[] = [
      {
        name: 'read_file',
        args: { path: '/very/long/path/to/some/file.txt' },
        startTime: Date.now(),
      },
    ];

    const { lastFrame } = render(<TaskProgress activeTasks={activeTasks} />);

    expect(lastFrame()).toContain('path: /very/long/path/to');
    expect(lastFrame()).toContain('...');
  });

  it('renders completed task with success indicator', () => {
    const completedTasks: CompletedTask[] = [
      { name: 'read_file', success: true, duration: 150 },
    ];

    const { lastFrame } = render(<TaskProgress completedTasks={completedTasks} />);

    expect(lastFrame()).toContain('✓');
    expect(lastFrame()).toContain('read_file');
    expect(lastFrame()).toContain('150ms');
  });

  it('renders completed task with failure indicator', () => {
    const completedTasks: CompletedTask[] = [
      { name: 'read_file', success: false, duration: 50, error: 'File not found' },
    ];

    const { lastFrame } = render(<TaskProgress completedTasks={completedTasks} />);

    expect(lastFrame()).toContain('✗');
    expect(lastFrame()).toContain('read_file');
    expect(lastFrame()).toContain('File not found');
  });

  it('limits completed tasks shown', () => {
    const completedTasks: CompletedTask[] = [
      { name: 'task1', success: true, duration: 100 },
      { name: 'task2', success: true, duration: 100 },
      { name: 'task3', success: true, duration: 100 },
      { name: 'task4', success: true, duration: 100 },
      { name: 'task5', success: true, duration: 100 },
    ];

    const { lastFrame } = render(
      <TaskProgress completedTasks={completedTasks} maxCompleted={3} />
    );

    // Should show last 3 tasks
    expect(lastFrame()).not.toContain('task1');
    expect(lastFrame()).not.toContain('task2');
    expect(lastFrame()).toContain('task3');
    expect(lastFrame()).toContain('task4');
    expect(lastFrame()).toContain('task5');
  });

  it('renders both active and completed tasks', () => {
    const activeTasks: ActiveTask[] = [
      { name: 'active_tool', startTime: Date.now() },
    ];
    const completedTasks: CompletedTask[] = [
      { name: 'done_tool', success: true, duration: 100 },
    ];

    const { lastFrame } = render(
      <TaskProgress activeTasks={activeTasks} completedTasks={completedTasks} />
    );

    expect(lastFrame()).toContain('active_tool');
    expect(lastFrame()).toContain('done_tool');
    expect(lastFrame()).toContain('✓');
  });

  it('hides completed tasks when showCompleted is false', () => {
    const completedTasks: CompletedTask[] = [
      { name: 'done_tool', success: true, duration: 100 },
    ];

    const { lastFrame } = render(
      <TaskProgress completedTasks={completedTasks} showCompleted={false} />
    );

    // Nothing to show - renders empty
    expect(lastFrame()).toBe('');
  });
});
```

### Task 5: Write AnswerBox Tests
- Description: Test AnswerBox component rendering
- Files to create: `src/components/__tests__/AnswerBox.test.tsx`
- Implementation:

```typescript
/**
 * Tests for AnswerBox component.
 */

import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { render } from 'ink-testing-library';
import { AnswerBox } from '../AnswerBox.js';

describe('AnswerBox', () => {
  it('renders nothing when empty and not streaming', () => {
    const { lastFrame } = render(<AnswerBox content="" />);
    expect(lastFrame()).toBe('');
  });

  it('renders content', () => {
    const { lastFrame } = render(<AnswerBox content="Hello, world!" />);
    expect(lastFrame()).toContain('Hello, world!');
  });

  it('shows typing indicator when streaming', () => {
    const { lastFrame } = render(
      <AnswerBox content="Hello" isStreaming={true} />
    );

    expect(lastFrame()).toContain('Hello');
    expect(lastFrame()).toContain('▌');
  });

  it('shows generating message when streaming starts', () => {
    const { lastFrame } = render(
      <AnswerBox content="" isStreaming={true} />
    );

    expect(lastFrame()).toContain('Generating response...');
  });

  it('hides typing indicator when not streaming', () => {
    const { lastFrame } = render(
      <AnswerBox content="Complete response" isStreaming={false} />
    );

    expect(lastFrame()).toContain('Complete response');
    expect(lastFrame()).not.toContain('▌');
  });

  it('renders with optional label', () => {
    const { lastFrame } = render(
      <AnswerBox content="Response" label="Assistant:" />
    );

    expect(lastFrame()).toContain('Assistant:');
    expect(lastFrame()).toContain('Response');
  });

  it('renders multiline content', () => {
    const content = 'Line 1\nLine 2\nLine 3';
    const { lastFrame } = render(<AnswerBox content={content} />);

    expect(lastFrame()).toContain('Line 1');
    expect(lastFrame()).toContain('Line 2');
    expect(lastFrame()).toContain('Line 3');
  });
});
```

### Task 6: Extend CallbackState Interface
- Description: Add tool tracking state setters to callback factory
- Files to modify: `src/cli/callbacks.ts`
- Changes:

```typescript
// Add to CallbackState interface:
/** Add active tool to tracking */
addActiveTask?: (id: string, name: string, args?: Record<string, unknown>) => void;
/** Mark tool as completed */
completeTask?: (id: string, name: string, success: boolean, duration: number, error?: string) => void;
```

### Task 7: Update createCallbacks Factory
- Description: Wire new callbacks for tool tracking
- Files to modify: `src/cli/callbacks.ts`
- Add handlers for `onToolStart` and `onToolEnd`:

```typescript
// In createCallbacks return object:
onToolStart: (_ctx, toolName, args) => {
  state.addActiveTask?.(toolName, args);
},

onToolEnd: (_ctx, toolName, result) => {
  // Calculate duration (would need startTime tracking)
  const success = result.success;
  const error = !success && 'message' in result ? result.message : undefined;
  state.completeTask?.(toolName, success, 0, error);
},
```

### Task 8: Add Task State to InteractiveShell
- Description: Add task tracking state to shell component
- Files to modify: `src/components/InteractiveShell.tsx`
- Changes to ShellState interface and state initialization:

```typescript
// Add to ShellState interface in component:
activeTasks: ActiveTask[];
completedTasks: CompletedTask[];

// Add to initial state:
activeTasks: [],
completedTasks: [],
```

### Task 9: Wire TaskProgress to InteractiveShell
- Description: Integrate TaskProgress component with state
- Files to modify: `src/components/InteractiveShell.tsx`
- Add callback state setters and component render:

```typescript
// In callback creation:
addActiveTask: (id, name, args) => {
  setState(s => ({
    ...s,
    activeTasks: [...s.activeTasks, { id, name, args, startTime: Date.now() }],
  }));
},
completeTask: (id, name, success, _duration, error) => {
  setState(s => {
    const task = s.activeTasks.find(t => t.id === id);
    const duration = task ? Date.now() - task.startTime : 0;
    return {
      ...s,
      activeTasks: s.activeTasks.filter(t => t.id !== id),
      completedTasks: [...s.completedTasks, { name, success, duration, error }],
    };
  });
},

// In render, before streaming output:
{(state.activeTasks.length > 0 || state.completedTasks.length > 0) && (
  <TaskProgress
    activeTasks={state.activeTasks}
    completedTasks={state.completedTasks}
  />
)}
```

### Task 10: Update AnswerBox Integration
- Description: Replace inline streaming output with AnswerBox
- Files to modify: `src/components/InteractiveShell.tsx`
- Replace streaming output section:

```typescript
// Replace streaming output Box with AnswerBox:
{(state.streamingOutput !== '' || state.isProcessing) && !state.spinnerMessage && (
  <AnswerBox
    content={state.streamingOutput}
    isStreaming={state.isProcessing && state.streamingOutput !== ''}
  />
)}
```

### Task 11: Update Component Exports
- Description: Export new components from index
- Files to create/modify: `src/components/index.ts`
- Implementation:

```typescript
/**
 * Component exports.
 */

export { App } from './App.js';
export { ErrorDisplay, type ErrorDisplayProps } from './ErrorDisplay.js';
export { Header, type HeaderProps } from './Header.js';
export { HealthCheck } from './HealthCheck.js';
export { InteractiveShell } from './InteractiveShell.js';
export { SinglePrompt } from './SinglePrompt.js';
export { Spinner, type SpinnerProps } from './Spinner.js';
export { TaskProgress, type TaskProgressProps, type ActiveTask, type CompletedTask } from './TaskProgress.js';
export { AnswerBox, type AnswerBoxProps } from './AnswerBox.js';
export { ToolsInfo } from './ToolsInfo.js';
export { Version } from './Version.js';
```

### Task 12: Clear Tasks on New Query
- Description: Reset task tracking when user submits new query
- Files to modify: `src/components/InteractiveShell.tsx`
- In handleSubmit, when adding user message:

```typescript
// When starting new query, clear completed tasks from previous queries:
setState((s) => ({
  ...s,
  input: '',
  messages: [...s.messages, { role: 'user', content: query, timestamp: new Date() }],
  isProcessing: true,
  spinnerMessage: 'Thinking...',
  streamingOutput: '',
  error: null,
  activeTasks: [],
  completedTasks: [],
}));
```

## Testing Strategy

### Unit Tests
- TaskProgress rendering with different task states
- AnswerBox rendering with streaming states
- Spinner integration within TaskProgress

### Integration Tests
- Callback wiring from Agent to display components
- State updates through callback chain
- Component visibility transitions

### Edge Cases
- Empty task lists (should render nothing)
- Very long tool arguments (truncation)
- Rapid tool start/end transitions
- Multiple concurrent active tools
- Mixed success/failure completed tasks
- Streaming with empty content

## Acceptance Criteria

- [ ] TaskProgress displays active tools with spinner animation
- [ ] TaskProgress shows completed tools with success (green checkmark) or failure (red X)
- [ ] TaskProgress shows tool execution duration
- [ ] TaskProgress truncates long argument values
- [ ] TaskProgress limits visible completed tasks (default 3)
- [ ] AnswerBox displays streaming content with typing indicator
- [ ] AnswerBox shows "Generating response..." when streaming starts
- [ ] AnswerBox hides typing indicator when streaming completes
- [ ] Both components render nothing when empty/idle
- [ ] Components integrate with InteractiveShell state
- [ ] Callback factory properly wires onToolStart/onToolEnd
- [ ] All tests pass with existing 85%+ coverage maintained
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

# Run specific component tests
bun run test src/components/__tests__/TaskProgress.test.tsx
bun run test src/components/__tests__/AnswerBox.test.tsx

# Build verification
bun run build

# Manual testing (requires tool support - Feature 17)
bun run dev
# Test with prompts that trigger tool use
```

## Notes

### Design Decisions

1. **Prop-based state**: Components receive state as props, following established patterns. Parent controls visibility through conditional rendering.

2. **Task tracking in shell**: Task state is managed in InteractiveShell rather than globally, enabling different shells to have independent task views.

3. **Completed task limit**: Only show last N completed tasks to avoid clutter. Recent tasks are most relevant.

4. **Spinner reuse**: TaskProgress reuses existing Spinner component for active tasks, maintaining consistent animation.

5. **AnswerBox simplicity**: Start simple without markdown rendering (future enhancement). Focus on streaming display first.

### Callback Extension Pattern

The `CallbackState` interface is extended with optional methods:
- Keeps backward compatibility (existing code doesn't break)
- Components opt-in to task tracking
- Factory handles undefined cases gracefully

### Integration Considerations

Tool execution requires Feature 17 (FileSystem tools) to be fully testable in manual usage. However, the components and callback wiring can be tested in isolation using mocks.

The components will be most visible once tools are wired into the CLI (Feature 42 - UX polish addresses this integration).

### Python Rich Parity

This implementation provides equivalents to:
- `rich.console.status()` - Spinner for simple states
- `rich.tree.Tree` - TaskProgress for hierarchical task display (simplified)
- `rich.live.Live` - AnswerBox for streaming content

Deferred to future:
- Full tree visualization (nested tool calls)
- Markdown rendering in AnswerBox
- Token count display
- Progress bars for long operations

## Execution

This spec can be implemented using: `/sdlc:implement docs/specs/feature-016-terminal-display-components.md`
