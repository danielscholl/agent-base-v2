---
status: accepted
contact: Project Team
date: 2025-01-15
deciders: Project Team
consulted: Claude Code architecture review
---

# Terminal UI: React 19 + Ink 6

## Context and Problem Statement

The agent framework needs a terminal UI for interactive chat, command input, streaming output display, and status indicators. The Python version uses Rich + Typer. What should the TypeScript version use?

## Decision Drivers

- **Component model**: Declarative, composable UI components
- **Streaming support**: Real-time display of LLM streaming responses
- **State management**: React hooks for UI state
- **Developer familiarity**: React is widely known
- **Maintenance**: Active development and community
- **Claude Code alignment**: Match proven architecture

## Considered Options

### Option 1: React 19 + Ink 6

React for terminal UIs via Ink.

**Pros:**
- Familiar React component model and hooks
- Ink 6 is actively maintained, requires React 19
- Proven in Claude Code architecture
- Excellent for streaming text display
- Rich ecosystem of Ink components
- Flexbox layout model

**Cons:**
- React 19 is relatively new (released late 2024)
- Bundle size larger than minimal alternatives
- Some React features don't apply to terminals

### Option 2: Blessed / Blessed-contrib

Traditional terminal UI library.

**Pros:**
- Mature, feature-rich
- Widgets for complex layouts
- No React dependency

**Cons:**
- Imperative API (not declarative)
- Less active maintenance
- Steeper learning curve
- No component model

### Option 3: Ink 5 + React 18

Previous stable versions.

**Pros:**
- More battle-tested combination
- React 18 widely deployed

**Cons:**
- Ink 5 is older, less actively developed
- Missing Ink 6 improvements
- Would need to hold back React version

### Option 4: Custom with ANSI codes

Minimal approach with direct terminal control.

**Pros:**
- Smallest bundle size
- Full control
- No dependencies

**Cons:**
- Significant implementation effort
- Must handle terminal quirks manually
- No component reusability
- Poor developer experience

## Decision Outcome

Chosen option: **"React 19 + Ink 6"**, because:

1. **Proven architecture**: Claude Code validates this stack works well for CLI agents
2. **Modern React**: React 19 brings performance improvements and better hooks
3. **Active maintenance**: Ink 6 is the current maintained version
4. **Developer experience**: React component model is familiar and productive
5. **Streaming**: Excellent support for real-time text updates

We accept the risk of React 19 being newer because:
- Ink 6 requires React 19 anyway
- React 19 has been stable since release
- Claude Code demonstrates production viability

### Consequences

**Good:**
- Familiar development model for React developers
- Declarative UI updates via state
- Component reusability across the CLI
- Good streaming text support
- Active ecosystem

**Bad:**
- Larger bundle than minimal solutions
- React 19 is newer (less Stack Overflow coverage)
- Some React patterns don't translate to terminals

**Mitigations:**
- Test thoroughly on different terminal emulators
- Keep components simple and focused
- Document terminal-specific patterns

### Key Components to Build

```
src/components/
├── Input.tsx          # Terminal input with history
├── Spinner.tsx        # Loading indicator
├── AnswerBox.tsx      # Streaming LLM response display
├── TaskProgress.tsx   # Task/tool execution status
└── ModelSelector.tsx  # Provider selection UI
```

### Usage Pattern

```typescript
// src/cli.tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Spinner } from './components/Spinner.js';
import { AnswerBox } from './components/AnswerBox.js';

export const CLI: React.FC<{ agent: Agent }> = ({ agent }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [answer, setAnswer] = useState('');

  // Callbacks update React state
  const callbacks: AgentCallbacks = {
    onLLMStart: () => setIsLoading(true),
    onLLMStream: (ctx, chunk) => setAnswer(prev => prev + chunk),
    onLLMEnd: () => setIsLoading(false),
  };

  return (
    <Box flexDirection="column">
      {isLoading && <Spinner label="Thinking..." />}
      <AnswerBox content={answer} streaming={isLoading} />
    </Box>
  );
};
```

### Version Specification

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "ink": "^6.0.0"
  },
  "devDependencies": {
    "ink-testing-library": "^4.0.0",
    "@types/react": "^19.0.0"
  }
}
```

### Compatibility Notes

- Ink 6 requires React 19 (peer dependency)
- Use `ink-testing-library` for component testing
- Some Ink components may need updates for React 19
