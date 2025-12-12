# TypeScript Rewrite Feature List (Agent Framework)

This document decomposes `docs/plans/typescript-rewrite.md` into an ordered set of features/milestones to deliver a TypeScript replacement for `agent-base`, using `dexter` as the architectural reference. Features are grouped by phase and sequenced from an empty repo to MVP completion.

---

## Phase 1: Foundation

**Goal:** Establish core architecture and single provider

### Feature 1: Initialize Bun + TypeScript workspace
Create a fresh `agent-ts/` project using Bun, enable strict TypeScript, set up module resolution, and add baseline tooling (Jest/ts-jest via `bun run test`, ESLint, Prettier). Mirror the final folder layout from the plan so later ports land in stable locations. Unit tests are co-located in `src/**/__tests__/` directories. Ensure a minimal `index.tsx` boots an Ink app.

### Feature 2: Port configuration schemas and config manager
Recreate `agent-base/src/agent/config/schema.py` as Zod schemas with inferred TS types, including agent settings, providers, memory, skills, and paths. Implement a config manager that:
- Loads defaults from Zod schemas
- Merges project-level config (`./.agent-ts/settings.json` - committable)
- Merges user-level config (`~/.agent-ts/settings.json` - personal)
- Applies environment variable overrides (highest priority)
- Validates on load/save and writes to disk in a stable JSON format

This is the foundation every other feature depends on.

### Feature 3: Define the LangChain tool wrapper and response contract
Introduce a `tools/base.ts` that standardizes the `{ success, result|error, message }` response shape and provides helpers to turn internal tools into LangChain `StructuredTool`s via Zod. This replaces `AgentToolset`/Pydantic annotations and sets the contract for built-in tools and skills.

### Feature 4: Implement the multi-provider LLM abstraction with OpenAI
Build `model/llm.ts` following `dexter/src/model/llm.ts`, with prefix or config-based routing to concrete LangChain models. Start with OpenAI (`@langchain/openai`) and wire it into config so the agent can make a single end-to-end LLM call. Include basic streaming support.

### Feature 5: Create the core Agent orchestration loop
Port the responsibilities of `agent-base/src/agent/agent.py` into `agent/agent.ts`: system prompt loading (three-tier: env var → user file → package default), placeholder replacement (`{{MODEL}}`, `{{DATA_DIR}}`), message assembly, tool binding, and the main `run()` loop. Keep the architecture compatible with LangChain calling patterns while preserving agent-base behavior (tool choice, retries, error surfaces).

### Feature 6: Replace the EventBus with typed callbacks
Add `agent/callbacks.ts` and thread callbacks through the agent, tools, and UI, modeled after `dexter/src/agent/agent.ts`. Expose hooks for LLM request/response, tool start/finish, task/session lifecycle, debug output, and trace logging for development troubleshooting. This is required for Ink rendering and for deterministic testing.

### Feature 7: Define structured error types and hierarchy
Port `agent-base/src/agent/exceptions.py` to `errors/index.ts` with typed error classes for provider errors (rate limits, auth failures), tool failures, config validation, and user-facing messages. Ensure errors surface cleanly through callbacks and are distinguishable by type.

### Feature 8: Port the built-in Hello tool
Reimplement `agent-base/src/agent/tools/hello.py` in TypeScript using the new tool base. This validates the tool wrapper pattern and provides a simple test case for the agent loop.

---

## Phase 2: Multi-Provider + CLI

**Goal:** Provider parity for core 3 + interactive shell

### Feature 9: Add Anthropic provider
Following the OpenAI pattern, implement Anthropic in `model/providers/anthropic.ts` using `@langchain/anthropic`. Validate streaming, token usage reporting, and option mapping.

### Feature 10: Add Gemini provider
Implement Google Gemini in `model/providers/gemini.ts` using `@langchain/google-genai`. Handle Gemini-specific options and ensure streaming parity.

### Feature 11: Add Azure OpenAI provider
Implement Azure OpenAI in `model/providers/azure-openai.ts` using `@langchain/openai` with Azure configuration (endpoint, deployment, api_version). Map agent-base config fields to LangChain options.

### Feature 12: Implement retry logic with exponential backoff
Add `model/retry.ts` with configurable retry logic for transient failures (rate limits, network errors). Apply consistently across all providers. Include jitter to prevent thundering herd.

### Feature 13: Build the Ink CLI shell (interactive + single-prompt)
Create `src/cli.tsx` and `src/index.tsx` to replicate the top-level experience of `agent-base/src/agent/cli/app.py`: interactive chat by default, `-p/--prompt` for one-shot runs, and flags for provider/model selection. Structure the CLI so it can host subcommands later (config, skills, session).

### Feature 14: Implement input handling and command parsing
Port the interactive affordances from `agent-base/src/agent/cli/interactive.py` and `commands.py`: line editing, history, `/commands` (clear, continue, exit, help), and keyboard shortcuts (Ctrl+C for cancel, Ctrl+D for exit). Use Ink keypress events and keep command routing separate from the agent core.

### Feature 15: Add basic terminal display components
Implement Ink equivalents of Rich UI pieces as `components/Spinner.tsx`, `TaskProgress.tsx`, and an initial `AnswerBox.tsx`. Wire them via callbacks so planning/execution state is visible without relying on global events.

---

## Phase 3: Memory + Session

**Goal:** Conversation persistence and remaining providers

### Feature 16: Introduce message history memory
Port the conversational memory surface from `agent-base/src/agent/memory/` into `utils/message-history.ts`, supporting add/retrieve and relevance selection for multi-turn context. Start with simple recency-based retrieval; semantic search can be added post-MVP.

### Feature 17: Implement tool context persistence
Recreate `dexter/src/utils/context.ts` behavior as `utils/context.ts`: save tool inputs/outputs to the filesystem, index by query/task, and provide "relevant contexts" retrieval for answer generation. This replaces Python's context provider hooks and enables memory-efficient tool use.

### Feature 18: Add session save/restore and history management
Port `agent-base/src/agent/cli/session.py` and persistence helpers so chats are stored as sessions, can be listed/picked, resumed (`--continue`), or purged. Keep on-disk formats stable and aligned with the config/migration tooling.

### Feature 19: Implement streaming answer display
Complete `components/AnswerBox.tsx` with proper streaming support: character-by-character or chunk-by-chunk rendering, cursor indication, and clean completion handling. Ensure consistent behavior across all providers.

### Feature 20: Add token counting utilities
Implement `utils/tokens.ts` using tiktoken for accurate token counting. Expose via callbacks for display (tokens used per request/response) and for context window management.

### Feature 21: Implement GitHub Models provider
Add GitHub Models provider using OpenAI-compatible endpoints (`https://models.github.ai/inference`). Support both personal and org-scoped tokens. Implement in `model/providers/github.ts`.

### Feature 22: Implement Local (Ollama) provider
Add local inference via `@langchain/ollama` in `model/providers/local.ts`. Support configurable base URL for Docker or native Ollama installations. Ensure streaming works correctly.

---

## Phase 4: Skills System

**Goal:** Full skills system port with script execution

### Feature 23: Define the new `skill.json` manifest format
Specify and validate a JSON manifest schema (metadata, triggers, toolsets, scripts, docs pointers) to replace SKILL.md YAML. Provide Zod schemas and document the on-disk layout under `skills/` and `_bundled_skills/`.

### Feature 24: Port skill discovery and registry
Reimplement `agent-base/src/agent/skills/loader.py` and `documentation_index.py` so skills are found on disk (bundled and plugin directories), validated against the manifest schema, and indexed for progressive disclosure. Expose skill metadata through the registry.

### Feature 25: Implement skill enablement and configuration
Port enable/disable logic from `agent-base` so skills can be toggled via config. Track which skills are active and ensure disabled skills don't register tools or inject context.

### Feature 26: Add Bun-sandboxed skill script execution
Replace `script_tools.py`/`uv run` with a Bun subprocess runner that executes per-skill scripts, enforces timeouts and working directory limits, and returns structured results. Integrate with the tool wrapper so scripts behave like first-class tools.

### Feature 27: Implement context injection for skills
Port `skills/context_provider.py` semantics: allow skills to contribute prompt fragments and tool context through the callback layer based on trigger matching. This preserves agent-base's progressive skill activation without a global event bus.

### Feature 28: Implement Azure AI Foundry provider
Build a custom LangChain `BaseChatModel` adapter that maps agent-base Foundry settings to the Foundry API in `model/providers/azure-foundry.ts`. This completes seven-provider parity.

### Feature 29: Port bundled hello-extended skill
Migrate the `hello-extended` skill from Python to TypeScript as a reference implementation in `_bundled_skills/hello-extended/`. Include both toolsets and scripts to validate the full skill system.

### Feature 30: Port FileSystem tools
Reimplement `agent-base/src/agent/tools/filesystem.py` in TypeScript. Ensure parity on behaviors like path validation, error formatting, and large file handling.

---

## Phase 5: CLI Completeness

**Goal:** Full CLI parity with Python version

### Feature 31: Implement config subcommands
Recreate `config init`, `config show`, `config edit` commands in `commands/config.tsx`. Use Ink forms for interactive setup and Zod validation for all inputs.

### Feature 32: Add provider setup wizards
Port provider-specific setup flows from `agent-base/src/agent/config/providers/` that guide users through API key entry, endpoint configuration, and validation. Make each provider testable before saving.

### Feature 33: Implement skill management commands
Add `skill list`, `skill enable`, `skill disable` commands in `commands/skills.tsx`. Show skill status, available triggers, and registered tools.

### Feature 34: Add session management commands
Implement `session list`, `session continue`, `session purge` in `commands/session.tsx`. Allow users to manage conversation history from the CLI.

### Feature 35: Implement help system
Add comprehensive `--help` for all commands and a `/help` interactive command. Document available slash commands, keyboard shortcuts, and configuration options.

---

## Phase 6: Polish + Testing

**Goal:** Production readiness

### Feature 36: Establish Jest test patterns and fixtures
Set up test infrastructure with co-located unit tests (`src/**/__tests__/`) for schemas, providers, tools, skills loader, and persistence. Integration tests live in `tests/integration/`. Create mock fixtures in `tests/fixtures/` for LLM responses that don't require real API calls. Target 85% coverage.

### Feature 37: Add integration tests for agent loop
Write integration tests that exercise the full agent flow: prompt → LLM → tool call → response. Use mocked providers to ensure deterministic results.

### Feature 38: Build Python → TypeScript config migration tool
Write a converter that reads existing agent-base config (`~/.agent/settings.json`), maps fields to the new Zod schema, and writes a TS-compatible config file with clear warnings on unsupported options. Provide dry-run mode.

### Feature 39: Implement system prompt template system
Finalize `agent/prompts.ts` with three-tier loading (env → user → package), placeholder replacement, and YAML front matter stripping. Document customization options.

### Feature 40: Create CLAUDE.md for the new codebase
Write comprehensive AI coding guidance covering architecture patterns, testing requirements, code style, and key files. This enables AI-assisted development on the TypeScript codebase.

### Feature 41: Write README and migration documentation
Document installation, configuration, usage, and migration from Python. Include examples for each provider and common workflows.

### Feature 42: Error handling and UX polish
Review all error paths for clear, actionable messages. Ensure graceful degradation when providers are unavailable. Verify keyboard interrupt handling works cleanly.

---

## Post-MVP (Deferred)

These features are explicitly deferred to keep MVP scope manageable:

### Feature 43: Git-based skill installation
Support `skill install <git-url>` for installing skills from repositories. Track installed skills in config with update/remove lifecycle.

### Feature 44: OpenTelemetry observability
Port `agent-base/src/agent/observability.py` for distributed tracing, metrics export, and Azure Monitor integration.

### Feature 45: Semantic memory (Mem0)
Add optional Mem0 integration for vector-based semantic memory retrieval.

### Feature 46: npm package publishing
Prepare package.json for npm publication, set up CI/CD for releases.

---

## Feature → Phase Summary

| Phase | Features | Focus |
|-------|----------|-------|
| 1 | 1-8 | Foundation, config, tools, OpenAI, agent loop, callbacks, errors |
| 2 | 9-15 | Anthropic, Gemini, Azure, retry, CLI shell, input, display |
| 3 | 16-22 | Memory, context, sessions, streaming, tokens, GitHub, Local |
| 4 | 23-30 | Skills manifest, loader, scripts, context injection, Foundry, bundled skill, filesystem tools |
| 5 | 31-35 | Config commands, wizards, skill commands, session commands, help |
| 6 | 36-42 | Tests, migration tool, prompts, CLAUDE.md, docs, polish |
| Post | 43-46 | Git skills, OpenTelemetry, Mem0, npm publish |
