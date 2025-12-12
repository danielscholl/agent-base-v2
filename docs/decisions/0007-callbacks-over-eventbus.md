---
status: accepted
contact: Project Team
date: 2025-01-15
deciders: Project Team
consulted: Claude Code architecture review
---

# Event System: Callbacks over EventBus

## Context and Problem Statement

The agent framework needs a mechanism for the Agent layer to communicate events (LLM calls, tool execution, errors) to the CLI layer for display. The Python version uses a singleton EventBus pattern. What should the TypeScript version use?

## Decision Drivers

- **Type safety**: Events and payloads should be fully typed
- **React integration**: Must work well with React state updates
- **Testability**: Easy to mock and assert in tests
- **Simplicity**: Avoid over-engineering
- **Dependency injection**: Support for different callback implementations
- **Telemetry integration**: Events should correlate with OpenTelemetry spans

## Considered Options

### Option 1: Typed Callbacks Interface

Pass a callbacks object to the Agent, which invokes methods at lifecycle points.

**Pros:**
- Fully typed with TypeScript interfaces
- Natural React integration (callbacks update state)
- Easy to mock in tests (jest.fn())
- Explicit dependency injection
- No global state
- Direct correlation with spans via SpanContext parameter

**Cons:**
- Must thread callbacks through layers
- Callbacks object can grow large

### Option 2: Singleton EventBus

Global event emitter with publish/subscribe pattern (like Python version).

**Pros:**
- Familiar pattern from Python codebase
- Decoupled publishers and subscribers
- Easy to add new listeners

**Cons:**
- Global mutable state (singleton)
- Harder to test (must reset between tests)
- Type safety requires careful event typing
- Implicit dependencies (who's listening?)
- React integration less natural (need useEffect subscriptions)

### Option 3: RxJS Observables

Reactive streams for event handling.

**Pros:**
- Powerful composition operators
- Good for complex event flows
- Built-in backpressure handling

**Cons:**
- Large dependency
- Steep learning curve
- Overkill for our use case
- Less familiar to most developers

### Option 4: Custom Event Emitter (typed)

Build a typed event emitter without singleton pattern.

**Pros:**
- Lightweight
- Can be injected as dependency

**Cons:**
- Must build and maintain
- Still less natural than callbacks for React

## Decision Outcome

Chosen option: **"Typed Callbacks Interface"**, because:

1. **Type safety**: Full TypeScript typing of all events and payloads
2. **React integration**: Callbacks directly update React state (no useEffect dance)
3. **Testability**: `jest.fn()` mocks work perfectly
4. **Dependency injection**: Callbacks passed to Agent constructor
5. **Telemetry**: SpanContext parameter enables correlation
6. **Simplicity**: No event bus infrastructure to maintain

This follows the pattern used successfully in the Dexter reference codebase.

### Consequences

**Good:**
- Fully typed event handling
- Natural React state updates
- Simple testing with jest.fn()
- No global state
- Clear data flow (Agent → Callbacks → UI)

**Bad:**
- Must pass callbacks through component tree
- Interface grows as events are added

**Mitigations:**
- Keep callback interface focused on essential events
- Use React context if prop drilling becomes painful
- Document each callback's purpose and payload

### Callback Interface

```typescript
// src/agent/callbacks.ts

interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface AgentCallbacks {
  // Agent lifecycle
  onAgentStart?: (ctx: SpanContext, query: string) => void;
  onAgentEnd?: (ctx: SpanContext, answer: string) => void;

  // LLM interaction
  onLLMStart?: (ctx: SpanContext, model: string, messages: Message[]) => void;
  onLLMStream?: (ctx: SpanContext, chunk: string) => void;
  onLLMEnd?: (ctx: SpanContext, response: string, usage: TokenUsage) => void;

  // Tool execution
  onToolStart?: (ctx: SpanContext, toolName: string, args: Record<string, unknown>) => void;
  onToolEnd?: (ctx: SpanContext, toolName: string, result: ToolResponse) => void;

  // Permissions (Phase 4)
  onPermissionRequest?: (scope: PermissionScope, resource: string) => Promise<boolean>;

  // Debug/logging
  onDebug?: (message: string, data?: unknown) => void;
}
```

### Usage in Agent

```typescript
// src/agent/agent.ts

class Agent {
  constructor(private options: AgentOptions) {}

  async run(query: string): Promise<string> {
    const ctx = this.createSpanContext();

    this.options.callbacks?.onAgentStart?.(ctx, query);

    try {
      // LLM call
      this.options.callbacks?.onLLMStart?.(ctx, this.model, messages);
      const response = await this.llm.invoke(messages);
      this.options.callbacks?.onLLMEnd?.(ctx, response.content, usage);

      // Tool execution if needed
      if (response.tool_calls) {
        for (const call of response.tool_calls) {
          this.options.callbacks?.onToolStart?.(ctx, call.name, call.args);
          const result = await this.executeTool(call);
          this.options.callbacks?.onToolEnd?.(ctx, call.name, result);
        }
      }

      this.options.callbacks?.onAgentEnd?.(ctx, answer);
      return answer;
    } catch (error) {
      // Error handling...
    }
  }
}
```

### Usage in React/Ink CLI

```typescript
// src/cli.tsx

const CLI: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);

  const callbacks: AgentCallbacks = useMemo(() => ({
    onLLMStart: () => {
      setIsLoading(true);
      setStreamedText('');
    },
    onLLMStream: (ctx, chunk) => {
      setStreamedText(prev => prev + chunk);
    },
    onLLMEnd: () => {
      setIsLoading(false);
    },
    onToolStart: (ctx, name, args) => {
      setToolCalls(prev => [...prev, { name, args, status: 'running' }]);
    },
    onToolEnd: (ctx, name, result) => {
      setToolCalls(prev =>
        prev.map(t => t.name === name ? { ...t, status: 'done', result } : t)
      );
    },
  }), []);

  const agent = useMemo(() => new Agent({ callbacks }), [callbacks]);

  // ... render UI based on state
};
```

### Testing with Callbacks

```typescript
// src/agent/__tests__/agent.test.ts

describe('Agent callbacks', () => {
  it('invokes onLLMStart and onLLMEnd', async () => {
    const callbacks: AgentCallbacks = {
      onLLMStart: jest.fn(),
      onLLMEnd: jest.fn(),
    };

    const agent = new Agent({ model: 'gpt-4o', callbacks });
    await agent.run('Hello');

    expect(callbacks.onLLMStart).toHaveBeenCalledWith(
      expect.objectContaining({ traceId: expect.any(String) }),
      'gpt-4o',
      expect.any(Array)
    );
    expect(callbacks.onLLMEnd).toHaveBeenCalled();
  });
});
```

### Comparison with Python EventBus

| Aspect | Python EventBus | TypeScript Callbacks |
|--------|-----------------|---------------------|
| Global state | Yes (singleton) | No |
| Type safety | Runtime only | Compile-time |
| React integration | useEffect subscription | Direct state updates |
| Testing | Must reset bus | Simple jest.fn() |
| Telemetry | Separate concern | SpanContext in payload |
