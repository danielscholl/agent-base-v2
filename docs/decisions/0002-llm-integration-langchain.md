---
status: accepted
contact: Project Team
date: 2025-01-15
deciders: Project Team
consulted: Claude Code architecture review
---

# LLM Integration: LangChain.js

## Context and Problem Statement

The agent framework needs to support multiple LLM providers (OpenAI, Anthropic, Google Gemini, Azure OpenAI, Azure AI Foundry, GitHub Models, Local/Docker). We need an abstraction layer that provides:
- Unified interface across providers
- Streaming support
- Tool/function calling
- Structured output parsing
- Retry and error handling

The Python version uses Microsoft Agent Framework. What should the TypeScript version use?

## Decision Drivers

- **Multi-provider support**: Must support 7 providers with consistent interface
- **Streaming**: All providers must support streaming responses
- **Tool calling**: Unified tool binding and execution
- **TypeScript-native**: Good type definitions and DX
- **Maintenance burden**: Prefer maintained abstractions over custom implementations
- **Community**: Active community for troubleshooting and examples

## Considered Options

### Option 1: LangChain.js

LangChain.js provides a comprehensive LLM abstraction with provider packages.

**Pros:**
- Mature, well-maintained library with large community
- Supports all 7 target providers via official packages
- Built-in streaming, tool calling, structured output
- Consistent `BaseChatModel` interface
- Good TypeScript support
- Handles provider-specific quirks internally

**Cons:**
- Large dependency tree
- Abstractions can be opaque when debugging
- Some overhead for simple use cases
- Version churn (though stabilizing with 1.x)

### Option 2: Vercel AI SDK

Vercel's AI SDK focuses on streaming and React integration.

**Pros:**
- Excellent streaming primitives
- React/Next.js integration (less relevant for CLI)
- Lighter weight than LangChain
- Good TypeScript support

**Cons:**
- Fewer provider integrations (would need custom adapters)
- Less mature tool calling support
- Focused on web use cases, not CLI agents
- Would need significant custom code for 7 providers

### Option 3: Direct Provider SDKs

Use each provider's official SDK directly with a thin custom abstraction.

**Pros:**
- Minimal dependencies per provider
- Full control over implementation
- No abstraction overhead
- Direct access to provider-specific features

**Cons:**
- Must implement and maintain abstraction layer
- Each provider has different API shapes
- Streaming implementations vary significantly
- Tool calling differs across providers
- High maintenance burden for 7 providers
- Must handle provider quirks ourselves

## Decision Outcome

Chosen option: **"LangChain.js"**, because:

1. **Provider coverage**: Official packages for all 7 target providers
2. **Battle-tested**: Handles edge cases and provider quirks we'd otherwise discover painfully
3. **Tool calling**: Unified `bindTools()` and structured output parsing
4. **Streaming**: Consistent streaming interface across providers
5. **Maintenance**: Provider-specific issues fixed upstream, not by us
6. **Reference**: Dexter codebase already uses LangChain.js successfully

The dependency size trade-off is acceptable given the significant reduction in custom code and maintenance burden.

### Consequences

**Good:**
- Rapid implementation of multi-provider support
- Consistent API regardless of underlying provider
- Community support and documentation
- Reduced maintenance burden

**Bad:**
- Larger bundle size than minimal implementation
- Less control over low-level provider interactions
- Must track LangChain.js updates and breaking changes

**Mitigations:**
- Use specific provider packages (e.g., `@langchain/openai`) not monolithic package
- Pin versions carefully in package.json
- Wrap LangChain in our own `model/llm.ts` to isolate integration points

### Implementation Notes

```typescript
// Provider factory pattern in model/llm.ts
const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  'openai': (config) => new ChatOpenAI({ model: config.model, ...config }),
  'anthropic': (config) => new ChatAnthropic({ model: config.model, ...config }),
  'gemini': (config) => new ChatGoogleGenerativeAI({ model: config.model, ...config }),
  // ... etc
};
```

### Packages to Use

| Provider | Package |
|----------|---------|
| OpenAI | `@langchain/openai` |
| Anthropic | `@langchain/anthropic` |
| Google Gemini | `@langchain/google-genai` |
| Azure OpenAI | `@langchain/openai` (with Azure config) |
| Azure AI Foundry | Custom `BaseChatModel` adapter |
| GitHub Models | `@langchain/openai` (OpenAI-compatible) |
| Local (Docker) | `@langchain/openai` (OpenAI-compatible) |
