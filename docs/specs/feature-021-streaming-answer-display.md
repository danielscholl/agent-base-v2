# Feature 21: Implement Streaming Answer Display

## Feature Description

Complete `components/AnswerBox.tsx` with proper streaming support: character-by-character or chunk-by-chunk rendering, cursor indication, and clean completion handling. Ensure consistent behavior across all providers.

**STATUS: IMPLEMENTED** - This feature was delivered as part of Feature 16 (Terminal Display Components). This spec documents the implementation for reference.

## User Story

As a user of the agent framework CLI
I want to see LLM responses stream in real-time with visual feedback
So that I can understand the system is generating a response and read content as it becomes available

## Problem Statement

Without streaming display, users would see no output until the LLM completes its response, which can take several seconds. This creates a poor user experience with no indication of progress.

## Solution Statement

The AnswerBox component provides:
1. **Chunk-by-chunk rendering** - Content accumulates via callback-driven state updates
2. **Cursor indication** - Visual typing indicator (`▌`) during streaming
3. **Clean completion handling** - Indicator disappears when streaming ends
4. **Provider consistency** - All providers use LangChain abstraction for uniform behavior

## Related Documentation

### Requirements
- `docs/plans/typescript-rewrite-features.md`: Feature 21 specification (line 151-152)

### Architecture Decisions
- `docs/decisions/0005-terminal-ui-react-ink.md`: React 19 + Ink 6 for terminal UI
- `docs/decisions/0007-callbacks-over-eventbus.md`: Callback patterns for agent-UI communication
- `docs/architecture.md`: CLI layer responsibilities, callback flow

## Codebase Analysis Findings

### Implementation Status: COMPLETE

The streaming answer display was implemented as part of Feature 16. The full streaming pipeline is:

```
Agent.runStream()
    │
    ├─► yields chunks from LLM
    │
    ├─► callbacks.onLLMStream(ctx, chunk)
    │
    ├─► CallbackState.appendToOutput(chunk)
    │
    ├─► setState(s => ({ ...s, streamingOutput: s.streamingOutput + chunk }))
    │
    └─► <AnswerBox content={streamingOutput} isStreaming={isProcessing} />
```

### Architecture Patterns
- **Parent-controlled state**: AnswerBox receives props; InteractiveShell manages state
- **Callback wiring**: `createCallbacks()` factory transforms state setters to `AgentCallbacks`
- **Provider abstraction**: LangChain handles provider differences; all use same stream interface

### Key Files
| File | Purpose | Status |
|------|---------|--------|
| `src/components/AnswerBox.tsx` | Streaming display component | ✅ Complete |
| `src/components/__tests__/AnswerBox.test.tsx` | Component tests (9 cases) | ✅ Complete |
| `src/agent/agent.ts` | `runStream()` method | ✅ Complete |
| `src/agent/callbacks.ts` | `onLLMStream` callback | ✅ Complete |
| `src/cli/callbacks.ts` | `appendToOutput` integration | ✅ Complete |
| `src/components/InteractiveShell.tsx` | Primary integration | ✅ Complete |
| `src/model/llm.ts` | Provider streaming abstraction | ✅ Complete |

## Archon Project

Project ID: `adbd7092-b0f2-4b40-a09a-b7ed5afd9751`

## Implementation Details

### AnswerBox Component

```typescript
// src/components/AnswerBox.tsx

export interface AnswerBoxProps {
  content: string;           // Accumulated streamed text
  isStreaming?: boolean;     // Show typing indicator
  label?: string;            // Optional label
}

const TYPING_INDICATOR = '▌';  // Block cursor character

export function AnswerBox({
  content,
  isStreaming = false,
  label,
}: AnswerBoxProps): React.ReactElement | null {
  // Don't render if empty and not streaming
  if (content === '' && !isStreaming) {
    return null;
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      {label !== undefined && <Text dimColor>{label}</Text>}

      <Box>
        <Text color="green">{content}</Text>
        {isStreaming && content !== '' && <Text color="cyan">{TYPING_INDICATOR}</Text>}
      </Box>

      {isStreaming && content === '' && (
        <Text color="cyan" dimColor>Generating response...</Text>
      )}
    </Box>
  );
}
```

### Callback Integration

```typescript
// src/cli/callbacks.ts - onLLMStream handler
onLLMStream: (_ctx, chunk) => {
  state.appendToOutput(chunk);  // Accumulates chunks into state
},

// src/components/InteractiveShell.tsx - state update
appendToOutput: (chunk) => {
  setState((s) => ({ ...s, streamingOutput: s.streamingOutput + chunk }));
},
```

### Display Logic

```typescript
// src/components/InteractiveShell.tsx - render logic
{/* Show AnswerBox when streaming */}
{(state.streamingOutput !== '' || (state.isProcessing && state.spinnerMessage === '')) && (
  <AnswerBox content={state.streamingOutput} isStreaming={state.isProcessing} />
)}

{/* Show Spinner when processing but not streaming */}
{state.isProcessing && state.spinnerMessage !== '' && state.streamingOutput === '' && (
  <Spinner message={state.spinnerMessage} />
)}
```

### Agent Streaming

```typescript
// src/agent/agent.ts - runStream() method
async *runStream(query: string, history?: Message[]): AsyncGenerator<string> {
  // ... initialization ...

  this.callbacks?.onSpinnerStop?.();  // Stop spinner when stream starts

  for await (const chunk of streamResponse.result) {
    const content = typeof chunk.content === 'string' ? chunk.content : '';
    if (content) {
      this.callbacks?.onLLMStream?.(llmCtx, content);  // Emit to UI
      yield content;
    }
  }

  this.callbacks?.onLLMEnd?.(llmCtx, fullResponse);
}
```

### Provider Consistency

All 7 providers (OpenAI, Anthropic, Azure OpenAI, Gemini, GitHub, Local, Foundry) use the same LangChain streaming interface:

```typescript
// src/model/llm.ts - stream method
async stream(messages: BaseMessage[]): Promise<StreamResult> {
  const streamIterable = await this.startStream(messages, options);
  const wrappedStream = this.wrapStreamWithCallbacks(streamIterable.result);
  return successResponse(wrappedStream);
}
```

## Testing Strategy

### Unit Tests (Implemented)

9 test cases in `src/components/__tests__/AnswerBox.test.tsx`:

1. ✅ Empty state handling - returns null when no content and not streaming
2. ✅ Content rendering - displays content text
3. ✅ Typing indicator visibility - shows `▌` when streaming with content
4. ✅ "Generating response..." - shows placeholder when streaming starts
5. ✅ Typing indicator hidden - no cursor when not streaming
6. ✅ Optional label support - renders label above content
7. ✅ Multiline content - handles newlines correctly
8. ✅ No generating message with content - placeholder disappears once content arrives
9. ✅ Default isStreaming value - false by default

### Integration Points

- Mock agent tests in `InteractiveShell.test.tsx` verify `onLLMStream` callback flow
- Mock agent tests in `SinglePrompt.test.tsx` verify verbose mode streaming

## Acceptance Criteria

- [x] AnswerBox displays streaming content chunk-by-chunk
- [x] Typing indicator (`▌`) shown during streaming
- [x] "Generating response..." shown when streaming starts but no content yet
- [x] Typing indicator disappears when streaming completes
- [x] AnswerBox renders nothing when empty and not streaming
- [x] Content displayed in green, cursor in cyan
- [x] All providers stream consistently via LangChain abstraction
- [x] Clean state reset between queries
- [x] 9 unit tests pass
- [x] Type checking passes (`bun run typecheck`)
- [x] Linting passes (`bun run lint`)
- [x] Build succeeds (`bun run build`)

## Validation Commands

```bash
# Type checking
bun run typecheck

# Linting
bun run lint

# Run all tests
bun run test

# Run AnswerBox tests specifically
bun run test src/components/__tests__/AnswerBox.test.tsx

# Build verification
bun run build

# Manual testing
bun run dev
# Type any query and observe streaming response with cursor indicator
```

## Notes

### State Lifecycle

1. **Query submission**: `streamingOutput: ''`, `isProcessing: true`, `spinnerMessage: 'Thinking...'`
2. **LLM starts streaming**: Spinner stops, AnswerBox shows "Generating response..."
3. **Chunks arrive**: `streamingOutput` accumulates, cursor shown after content
4. **Streaming complete**: `isProcessing: false`, cursor disappears, content added to messages
5. **New query**: `streamingOutput` reset to empty

### Visual Transition

```
[Spinner] Thinking...
           ↓
[AnswerBox] Generating response...
           ↓
[AnswerBox] Hello▌
           ↓
[AnswerBox] Hello, world!▌
           ↓
[AnswerBox] Hello, world!  (no cursor)
```

### Known Limitations

1. **No tool calling in streaming** - `runStream()` does not support tool execution; use `run()` for tools
2. **No markdown rendering** - Plain text only; future enhancement
3. **No backpressure** - UI renders every chunk immediately

### Future Enhancements

- Markdown rendering for formatted output
- Code block syntax highlighting
- Token count display during streaming
- Animated cursor (blinking block)

## Execution

This feature is **ALREADY IMPLEMENTED**. No further development needed.

Related spec: `docs/specs/feature-016-terminal-display-components.md`
