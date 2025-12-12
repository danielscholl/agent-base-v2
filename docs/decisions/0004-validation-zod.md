---
status: accepted
contact: Project Team
date: 2025-01-15
deciders: Project Team
consulted: Claude Code architecture review
---

# Validation: Zod 4.x

## Context and Problem Statement

The agent framework needs runtime validation for:
- Configuration files (settings.json)
- LLM structured outputs
- Tool input parameters
- Skill manifests
- API responses

The Python version uses Pydantic v2. What should the TypeScript version use, and which version?

## Decision Drivers

- **TypeScript integration**: Type inference from schemas (`z.infer<>`)
- **Runtime validation**: Validate data at boundaries (config load, LLM output)
- **LangChain compatibility**: LangChain.js uses Zod for tool schemas
- **Error messages**: Clear, actionable validation errors
- **Bundle size**: Reasonable size for CLI distribution
- **Latest features**: Use newest stable versions

## Considered Options

### Option 1: Zod 3.x (Previous Stable)

Previous major release, widely adopted.

**Pros:**
- Battle-tested, stable API
- Largest ecosystem of Zod-based libraries
- Extensive documentation and examples

**Cons:**
- Older version, missing improvements
- Some known limitations in complex schemas
- Larger bundle size than 4.x

### Option 2: Zod 4.x (Latest)

Current major version with improvements.

**Pros:**
- Performance improvements (faster parsing)
- Better error messages
- Smaller bundle size
- New features and API refinements
- Active development focus

**Cons:**
- Some ecosystem libraries may still target 3.x
- Some breaking changes from 3.x
- Newer documentation

### Option 3: Valibot

Lightweight alternative to Zod.

**Pros:**
- Much smaller bundle size (~1KB)
- Similar API to Zod
- Tree-shakeable

**Cons:**
- Smaller ecosystem
- Not compatible with LangChain.js (expects Zod)
- Would need adapter for tool schemas

### Option 4: io-ts / fp-ts

Functional programming approach to validation.

**Pros:**
- Powerful composition
- Strong type safety

**Cons:**
- Steeper learning curve
- Not compatible with LangChain.js
- Less mainstream adoption

## Decision Outcome

Chosen option: **"Zod 4.x (Latest)"**, because:

1. **Latest features**: Performance improvements and better error messages
2. **Smaller bundle**: Reduced bundle size compared to 3.x
3. **Active development**: Current focus of Zod maintainers
4. **TypeScript DX**: Excellent `z.infer<>` type inference
5. **Risk tolerance**: Project accepts risk of using latest versions

We choose **4.x over 3.x** because:
- Project prioritizes latest versions over maximum ecosystem compatibility
- Zod 4.x API is largely compatible with 3.x
- LangChain.js Zod usage is straightforward and likely compatible
- Any issues can be addressed during development

### Consequences

**Good:**
- Better performance and smaller bundle
- Improved error messages
- Latest features available
- Strong TypeScript type inference

**Bad:**
- Some ecosystem libraries may need updates
- Less Stack Overflow coverage for 4.x specific issues
- May encounter edge cases in newer code

**Mitigations:**
- Test LangChain.js integration early in Phase 1
- Pin to specific 4.x version for stability
- Fall back to 3.x if critical compatibility issues arise

### Version Specification

```json
{
  "dependencies": {
    "zod": "^4.0.0"
  }
}
```

### Compatibility Verification

Before Phase 1 implementation, verify:
- [ ] LangChain.js tool schemas work with Zod 4.x
- [ ] `z.infer<>` type inference works correctly
- [ ] Error messages are clear and actionable

### Usage Patterns

```typescript
// Config schema with type inference
const ProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  model: z.string(),
  baseUrl: z.string().url().optional(),
});

type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

// Tool parameter schema
const helloToolSchema = z.object({
  name: z.string().describe('Name to greet'),
  language: z.enum(['en', 'es', 'fr']).default('en'),
});

// LLM structured output validation
const responseSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
});

const validated = responseSchema.safeParse(llmOutput);
if (!validated.success) {
  // Handle validation error with clear message
  console.error(validated.error.format());
}
```

### Fallback Plan

If Zod 4.x causes critical issues:
1. Downgrade to Zod 3.x (`^3.23.0`)
2. Update any 4.x-specific code
3. Document incompatibilities found
