# Feature: Token Counting Utilities

**Status**: Implemented
**Archon Project ID**: 29a6e4bb-a4f2-430a-b611-d5170510d078

## Feature Description

Token counting utilities for the agent framework providing:

1. **Provider-returned token tracking** - Display actual token usage from LLM responses (accurate)
2. **Session accumulation** - Sum token usage across multiple LLM calls within a session
3. **Pre-flight token estimation** - Approximate tokens for messages before sending to LLM (for context window management)

## User Story

As a user of the agent framework
I want to see token usage statistics for my conversations
So that I can monitor API costs and understand context window utilization

## Design Decisions

### Data Flow: UI-Based Accumulation

The implementation uses **UI state as the accumulator** rather than a separate tracker class:

```
LLM Response → extractTokenUsage() → onLLMEnd callback → InteractiveShell state accumulates
```

**Rationale**: Simpler architecture, single source of truth in React state, avoids synchronization between tracker and UI.

**Note**: `TokenUsageTracker` class exists for programmatic use cases (e.g., headless agent runs, custom integrations) but is not used by the CLI integration.

### Token Counting Accuracy

| Source | Accuracy | Use Case |
|--------|----------|----------|
| Provider-returned (`TokenUsage`) | Exact | Display after LLM calls |
| `TokenEstimator` | ~95% for OpenAI, varies for others | Pre-flight estimation, context window checks |

**Important**: Provider-returned usage is authoritative. Estimation is only for pre-flight checks and should not be displayed as actual usage.

### Message Overhead (TokenEstimator)

The estimator uses OpenAI chat-style overhead constants:
- **Per message**: 4 tokens (role token + separators)
- **Per request**: 3 tokens (conversation framing)

**Limitations**:
- Only `role` and `content` fields are counted; `name`, `toolCallId`, and other metadata are ignored
- Tool messages and function-call metadata use the same overhead (may undercount)
- Constants are hardcoded; not configurable per model

### Display Behavior

Token usage is **always displayed** after each response when `queryCount > 0`. No config flag exists to disable it.

**Future consideration**: Add `config.ui.showTokenUsage` setting if users request quieter output.

## Related Documentation

- Feature 22 in `docs/plans/typescript-rewrite-features.md`
- ADR-0007: Callbacks over EventBus
- ADR-0002: LangChain LLM Integration

## Implementation

### Files Created

| File | Purpose |
|------|---------|
| `src/utils/tokens.ts` | TokenUsageTracker and TokenEstimator classes |
| `src/utils/__tests__/tokens.test.ts` | 44 unit tests |
| `src/components/TokenUsageDisplay.tsx` | Ink component for token stats |
| `src/components/__tests__/TokenUsageDisplay.test.tsx` | 13 component tests |

### Files Modified

| File | Changes |
|------|---------|
| `package.json` | Added `js-tiktoken` dependency |
| `src/utils/index.ts` | Exported token utilities |
| `src/cli/callbacks.ts` | Extended `CallbackState` with `updateTokenUsage`, wired `onLLMEnd` |
| `src/components/InteractiveShell.tsx` | Added `tokenUsage` state, accumulation logic, display rendering |

### API Surface

```typescript
// Session-level usage (accumulated)
interface SessionTokenUsage {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  queryCount: number;
}

// Tracker for programmatic use (not used by CLI)
class TokenUsageTracker {
  constructor(options?: TokenUsageTrackerOptions);
  addUsage(usage: TokenUsage): void;  // Accumulates and emits onUpdate
  getUsage(): SessionTokenUsage;       // Returns copy
  reset(): void;                       // Clears counters
}

// Estimator for pre-flight checks
class TokenEstimator {
  constructor(options?: TokenEstimatorOptions);
  estimateTokens(text: string): number;
  estimateMessages(messages: Message[]): number;  // Includes overhead
}

// UI Component
function TokenUsageDisplay(props: {
  usage: SessionTokenUsage;
  showDetails?: boolean;  // false = compact, true = breakdown
}): React.ReactElement | null;
```

### CLI Integration

```typescript
// In InteractiveShell state
tokenUsage: SessionTokenUsage  // Initialized to zeros

// In createCallbacks
updateTokenUsage: (usage) => {
  setState((s) => ({
    ...s,
    tokenUsage: {
      totalPromptTokens: s.tokenUsage.totalPromptTokens + usage.totalPromptTokens,
      totalCompletionTokens: s.tokenUsage.totalCompletionTokens + usage.totalCompletionTokens,
      totalTokens: s.tokenUsage.totalTokens + usage.totalTokens,
      queryCount: s.tokenUsage.queryCount + usage.queryCount,
    },
  }));
}

// In onLLMEnd callback
if (usage && state.updateTokenUsage) {
  state.updateTokenUsage({
    totalPromptTokens: usage.promptTokens,
    totalCompletionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    queryCount: 1,  // Per-request delta
  });
}
```

## Acceptance Criteria

- [ ] Provider-returned token usage displayed after each LLM response
- [ ] Session totals accumulate across multiple queries
- [ ] TokenEstimator provides reasonable estimates for OpenAI models
- [ ] Display hidden when no queries yet (`queryCount === 0`)
- [ ] All tests pass
- [ ] TypeScript strict mode passes
- [ ] ESLint passes (no new warnings)

## Implementation Status

**Completed**: 2025-12-15

| Metric | Value |
|--------|-------|
| Tests created | 57 |
| Tests passing | 57/57 |
| Coverage (utils/tokens.ts) | 94.82% statements |
| Coverage (TokenUsageDisplay.tsx) | 100% |

## Known Limitations

1. **Estimation accuracy varies by provider**: Claude and Gemini use `cl100k_base` encoding as approximation; actual accuracy may be lower than OpenAI models.

2. **No tool message overhead**: Tool calls and function metadata are counted as plain text without additional overhead.

3. **Always-on display**: No config option to hide token display.

4. **TokenUsageTracker unused in CLI**: The class exists but CLI uses direct state accumulation. Consider removing the class or documenting it as "for programmatic use only."

## Future Enhancements

- Cost estimation (tokens × price per model)
- Context window warnings (e.g., "90% of limit")
- Provider-specific estimators (Anthropic tokenizer, etc.)
- Config flag for display visibility
- Token budget tracking per session
