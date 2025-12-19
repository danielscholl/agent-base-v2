# TypeScript Rewrite Feature List (Agent Framework)

This document decomposes `docs/plans/typescript-rewrite.md` into an ordered set of features/milestones to deliver a TypeScript replacement for `agent-base`, using `dexter` as the architectural reference. Features are grouped by phase and sequenced from an empty repo to MVP completion.

---

## Phase 1a: Foundation (Core)

**Goal:** Establish core architecture and validate the agent loop

### Feature 1: Initialize Bun + TypeScript workspace
Create a fresh `agent` project using Bun, enable strict TypeScript, set up module resolution, and add baseline tooling (Jest/ts-jest via `bun run test`, ESLint, Prettier). Mirror the final folder layout from the plan so later ports land in stable locations. Unit tests are co-located in `src/**/__tests__/` directories. Ensure a minimal `index.tsx` boots an Ink app.

### Feature 2: Port configuration schemas and config manager
Recreate `agent-base/src/agent/config/schema.py` as Zod schemas with inferred TS types, including agent settings, providers, memory, skills, and paths. Implement a config manager that:
- Loads defaults from Zod schemas
- Merges project-level config (`./.agent/settings.json` - committable)
- Merges user-level config (`~/.agent/settings.json` - personal)
- Applies environment variable overrides (highest priority)
- Validates on load/save and writes to disk in a stable JSON format
- Uses camelCase for all config keys (TypeScript convention)

Config directory is `.agent/` (matches Python for easier migration).

This is the foundation every other feature depends on.

### Feature 3: Define the LangChain tool wrapper and response contract
Introduce a `tools/base.ts` that standardizes the `{ success, result|error, message }` response shape and provides helpers to turn internal tools into LangChain `StructuredTool`s via Zod. This replaces `AgentToolset`/Pydantic annotations and sets the contract for built-in tools and skills.

### Feature 4: Implement the multi-provider LLM abstraction with OpenAI
Build `model/llm.ts` with config-based provider routing. Provider is selected by `config.providers.default` (e.g., "openai"), not by parsing model name prefixes. Start with OpenAI (`@langchain/openai`) and wire it into config so the agent can make a single end-to-end LLM call. Include basic streaming support.

### Feature 5: Create the core Agent orchestration loop ✅
Port the responsibilities of `../agent-base/src/agent/agent.py` into `agent/agent.ts`: system prompt loading (three-tier: env var → user file → package default), placeholder replacement (`{{MODEL}}`, `{{DATA_DIR}}`), message assembly, tool binding, and the main `run()` loop. Keep the architecture compatible with LangChain calling patterns while preserving agent-base behavior (tool choice, retries, error surfaces).

**Implemented:**
- `src/agent/types.ts` - Core types (SpanContext, Message, AgentOptions, etc.)
- `src/agent/callbacks.ts` - AgentCallbacks interface with span context helpers
- `src/agent/prompts.ts` - Three-tier system prompt loading with placeholder replacement
- `src/prompts/system.md` - Default system prompt template
- `src/agent/agent.ts` - Core Agent class with run() and runStream() methods
- `src/agent/index.ts` - Public exports
- Full test coverage in `src/agent/__tests__/`

### Feature 6: Replace the EventBus with typed callbacks
Add `agent/callbacks.ts` and thread callbacks through the agent, tools, and UI, modeled after `../dexter/src/agent/agent.ts`. Expose hooks for LLM request/response, tool start/finish, task/session lifecycle, debug output, and trace logging for development troubleshooting. This is required for Ink rendering and for deterministic testing.

### Feature 7: Define structured error types and hierarchy
Port `../agent-base/src/agent/exceptions.py` to `errors/index.ts` with typed error classes for provider errors (rate limits, auth failures), tool failures, config validation, and user-facing messages. Ensure errors surface cleanly through callbacks and are distinguishable by type.

### Feature 8: Port the built-in Hello tool
Reimplement `../agent-base/src/agent/tools/hello.py` in TypeScript using the new tool base. This validates the tool wrapper pattern and provides a simple test case for the agent loop.

---

## Phase 1b: Foundation (Observability)

**Goal:** Add telemetry instrumentation before expanding providers

### Feature 9: Implement OpenTelemetry setup and OTLP exporter
Port `../agent-base/src/agent/observability.py` patterns to `telemetry/setup.ts`. Create a singleton setup function that:
- Initializes OpenTelemetry with configurable exporters (OTLP, console, none)
- Uses environment variables for configuration (`OTEL_ENDPOINT`, `ENABLE_OTEL`)
- Auto-detects local telemetry endpoint availability via fast socket check
- Provides `getTracer()` and `getMeter()` helpers
- Zero overhead when disabled (no-op tracer)

### Feature 10: Add GenAI semantic conventions for spans
Implement `telemetry/spans.ts` with helpers that follow OpenTelemetry GenAI semantic conventions:
- `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.request.model`
- `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`
- `tool.name`, `tool.result` for tool execution spans
- Integrate with callback system so all LLM/tool calls are automatically traced

### Feature 11: Implement Aspire Dashboard integration
Port the `/telemetry start|stop|status|url` commands from `../agent-base/src/agent/cli/commands.py` to `telemetry/aspire.ts`:
- Start/stop Aspire Dashboard Docker container
- Check container status and display dashboard URL
- Auto-enable telemetry in config when dashboard starts
- Provide clear error messages when Docker is unavailable

This completes the foundation with full observability before expanding providers.

---

## Phase 2: Multi-Provider + CLI

**Goal:** Provider parity for core 3, interactive shell, and essential tools

### Feature 12: Add multi-provider support (Anthropic, Gemini, Azure OpenAI)
Following the OpenAI pattern established in Feature 4, implement three additional providers:
- **Anthropic** (`model/providers/anthropic.ts`): Use `@langchain/anthropic`, validate streaming and token usage reporting
- **Gemini** (`model/providers/gemini.ts`): Use `@langchain/google-genai`, handle Gemini-specific options
- **Azure OpenAI** (`model/providers/azure-openai.ts`): Use `@langchain/openai` with Azure configuration (endpoint, deployment, api_version)

All providers must support streaming, token usage callbacks, and map cleanly to the existing config schema. Providers share common patterns and can be implemented/tested together.

### Feature 13: Implement retry logic with exponential backoff
Add `model/retry.ts` with configurable retry logic for transient failures (rate limits, network errors). Apply consistently across all providers. Include jitter to prevent thundering herd.

### Feature 14: Build the Ink CLI shell (interactive + single-prompt)
Create `src/cli.tsx` and `src/index.tsx` to replicate the top-level experience of `../agent-base/src/agent/cli/app.py`: interactive chat by default, `-p/--prompt` for one-shot runs, and flags for provider/model selection. Structure the CLI so it can host subcommands later (config, skills, session).

### Feature 15: Implement input handling and command parsing
Port the interactive affordances from `../agent-base/src/agent/cli/interactive.py` and `commands.py`: line editing, history, `/commands` (clear, continue, exit, help, telemetry), and keyboard shortcuts (Ctrl+C for cancel, Ctrl+D for exit). Use Ink keypress events and keep command routing separate from the agent core.

### Feature 16: Add basic terminal display components
Implement Ink equivalents of Rich UI pieces as `components/Spinner.tsx`, `TaskProgress.tsx`, and an initial `AnswerBox.tsx`. Wire them via callbacks so planning/execution state is visible without relying on global events.

### Feature 17: Port FileSystem tools ✅
Implement a **minimal, optimized** filesystem toolset in TypeScript focused on real workflows (read/search/edit project files like `pom.xml`) while maintaining the core sandboxing/safety behaviors from `../agent-base/src/agent/tools/filesystem.py` (path validation, consistent errors, and large-file handling).

**Implemented (2025-12-14):**
- `get_path_info` - File/directory metadata (exists, type, size, permissions)
- `list_directory` - Directory listing with recursive mode, hidden file filtering
- `read_file` - Text file reading with line range support, binary detection
- `search_text` - Pattern search with regex/literal modes, finds all matches per line
- `write_file` - File creation with create/overwrite/append modes (atomic writes)
- `apply_text_edit` - Exact text replacement with atomic writes via temp file + rename
- `create_directory` - Directory creation with parent support
- `apply_file_patch` - **Primary edit tool**: unified diff patch application with context validation, SHA256 verification, and dryRun mode

**Security Features:**
- Workspace sandboxing via `resolveWorkspacePathSafe()` with symlink escape protection
- Write permission enforcement via `AGENT_FILESYSTEM_WRITES_ENABLED` env var
- Binary file detection (null byte check in first 8KB)
- Oversized file protection in search_text (skips files > 1MB)
- Atomic writes for all file modifications (temp file + rename)

**CLI integration:** Tools wired into `InteractiveShell` and `SinglePrompt` via Agent constructor.

**Test Coverage:** 101 filesystem-specific tests, all passing.

See `docs/specs/feature-017-filesystem-tools.md` for detailed specification.

---

## Phase 3: Memory + Session

**Goal:** Conversation persistence and remaining providers

### Feature 18: Introduce message history memory
Port the conversational memory surface from `agent-base/src/agent/memory/` into `utils/message-history.ts`, supporting add/retrieve and relevance selection for multi-turn context. Start with simple recency-based retrieval; semantic search can be added post-MVP.

### Feature 19: Implement tool context persistence
Recreate `../dexter/src/utils/context.ts` behavior as `utils/context.ts`: save tool inputs/outputs to the filesystem, index by query/task, and provide "relevant contexts" retrieval for answer generation. This replaces Python's context provider hooks and enables memory-efficient tool use.

### Feature 20: Add session save/restore and history management
Port `../agent-base/src/agent/cli/session.py` and persistence helpers so chats are stored as sessions, can be listed/picked, resumed (`--continue`), or purged. Keep on-disk formats stable and aligned with the config/migration tooling.

### Feature 21: Implement streaming answer display
Complete `components/AnswerBox.tsx` with proper streaming support: character-by-character or chunk-by-chunk rendering, cursor indication, and clean completion handling. Ensure consistent behavior across all providers.

### Feature 22: Add token counting utilities
Implement `utils/tokens.ts` using tiktoken for accurate token counting. Expose via callbacks for display (tokens used per request/response) and for context window management.

### Feature 23: Implement GitHub Models provider
Add GitHub Models provider using OpenAI-compatible endpoints (`https://models.github.ai/inference`). Support both personal and org-scoped tokens. Implement in `model/providers/github.ts`.

### Feature 23a: Support Azure AI Foundry (Local or Cloud)
Add Azure AI Foundry support that can be configured to target either:
- **Foundry Local** (on-device models) via the `foundry-local-sdk`, using its OpenAI-compatible endpoint + API key (LangChain `ChatOpenAI` with `baseURL` and `apiKey` from `FoundryLocalManager`).
- **Azure AI Foundry (cloud)** via the existing Foundry endpoint configuration.

Expose a single provider surface (e.g., `providers.azureFoundry.mode = "local" | "cloud"`) so projects can switch between local and cloud models without changing agent code. Ensure streaming behavior is consistent across both modes.

Reference: https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-local/how-to/how-to-use-langchain-with-foundry-local?view=foundry-classic&pivots=programming-language-javascript

### Feature 24: Implement Local (Docker Model Runner) provider
Add local inference via OpenAI-compatible API in `model/providers/local.ts`. Target Docker Desktop's Model Runner which exposes models at `http://model-runner.docker.internal/`. Support configurable base URL and ensure streaming works correctly.

---

## Phase 4: Skills System

**Goal:** Implement Agent Skills per the official [agentskills.io](https://agentskills.io) specification

> **Spec Alignment (2024-12):** Phase 4 follows the official Agent Skills specification exactly.
> Skills are portable across Claude Code, Claude.ai, and any spec-compliant agent.

### Feature 25: SKILL.md Manifest Schema with Spec-Compliant Zod Validation
Implement Zod schemas for SKILL.md frontmatter matching the official Agent Skills spec exactly.

**Required fields:**
- `name` - 1-64 chars, lowercase alphanumeric + hyphens, must match directory name
- `description` - 1-1024 chars, describes what skill does and when to use it

**Optional fields:**
- `license` - License name or file reference
- `compatibility` - 1-500 chars, environment requirements
- `metadata` - Arbitrary key-value mapping for extensions
- `allowed-tools` - Space-delimited tool patterns (experimental)

Port validation logic from [skills-ref](https://github.com/agentskills/agentskills/tree/main/skills-ref) Python reference. Include YAML frontmatter parser using `yaml` package.

**Key files:** `src/skills/manifest.ts`, `src/skills/parser.ts`

### Feature 26: Skill Discovery and Loader
Scan configured directories for valid skills (folders containing SKILL.md). Parse frontmatter and validate against spec schema. Build skill index with metadata and absolute paths.

**Skill locations:**
- Bundled: `src/_bundled_skills/`
- User: `~/.agent/skills/`
- Project: `./.agent/skills/` (future)

No dynamic class loading or toolsets - just metadata collection per spec.

**Key files:** `src/skills/loader.ts`, `src/skills/types.ts`

### Feature 27: Skill Prompt Generation (`<available_skills>` XML)
Generate `<available_skills>` XML block for system prompt injection per spec format:

```xml
<available_skills>
<skill>
<name>skill-name</name>
<description>What it does and when to use it</description>
<location>/absolute/path/to/skill/SKILL.md</location>
</skill>
</available_skills>
```

HTML-escape all content. Integrate with Agent system prompt assembly in `agent/prompts.ts`. No persistent registry needed - discover skills on startup.

**Key files:** `src/skills/prompt.ts`

### Feature 28: Progressive Disclosure (3-Tier Spec Model)
Implement the spec's 3-tier progressive disclosure model:

1. **Metadata** (~100 tokens/skill) - Inject `<available_skills>` XML at startup
2. **Instructions** (<5000 tokens) - Agent reads full SKILL.md via Read tool when activated
3. **Resources** (as needed) - Agent reads `scripts/`, `references/`, `assets/` on demand

**No custom trigger matching** - the LLM decides which skill to activate based on the description field matching user intent. This is simpler and more portable than explicit triggers.

**Key files:** `src/skills/context-provider.ts`

### Feature 29: ~~Azure AI Foundry provider~~ (Moved to Phase 3)
*Already implemented as Feature 23a in Phase 3.*

### Feature 30: Bundled hello-world Skill (Spec-Compliant Example)
Create `src/_bundled_skills/hello-world/` with spec-compliant structure:

```
hello-world/
├── SKILL.md              # Frontmatter + instructions
├── scripts/              # Optional executable scripts
│   └── greet.sh
└── references/           # Optional documentation
    └── EXAMPLES.md
```

Validates the full discovery → prompt injection → activation → execution flow. Serves as reference implementation for skill authors.

**Key files:** `src/_bundled_skills/hello-world/SKILL.md`

---

## Phase 5: CLI Completeness

**Goal:** Full CLI parity with Python version

### Feature 31: Implement config subcommands
Recreate `config init`, `config show`, `config edit` commands in `commands/config.tsx`. Use Ink forms for interactive setup and Zod validation for all inputs.

### Feature 32: Add provider setup wizards
Port provider-specific setup flows from `agent-base/src/agent/config/providers/` that guide users through API key entry, endpoint configuration, and validation. Make each provider testable before saving.

### Feature 33: Implement skill management commands
Add `skill list`, `skill info <name>`, `skill validate <path>` commands in `commands/skills.tsx`. Show discovered skills, their descriptions, and locations. Validate skill directories against the spec.

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
Write integration tests that exercise the full agent flow: prompt → LLM → tool call → response. Use mocked providers to ensure deterministic results. Include telemetry span assertions.

### Feature 38: Build Python → TypeScript config migration tool
Write a converter that reads existing agent-base config (`~/.agent/settings.json`), maps fields to the new Zod schema, and writes a TS-compatible config file with clear warnings on unsupported options. Provide dry-run mode.

### Feature 39: Implement system prompt template system
Finalize `agent/prompts.ts` with three-tier loading (env → user → package), placeholder replacement, and YAML front matter stripping. Document customization options.

### Feature 40: Maintain CLAUDE.md alignment ✅
CLAUDE.md governance document has been created. During Phase 6, ensure it stays in sync with implementation reality and any ADRs added during development.

### Feature 41: Write README and migration documentation
Document installation, configuration, usage, and migration from Python. Include examples for each provider and common workflows. Include telemetry setup guide.

### Feature 42: Error handling and UX polish
Review all error paths for clear, actionable messages. Ensure graceful degradation when providers are unavailable. Verify keyboard interrupt handling works cleanly.

**Tool/UX polish:** Improve tool-related UX (clearer tool errors, better task display, and CLI help text for chat-only/streaming mode). Optionally implement true streaming-with-tools if/when the agent loop supports it.

---

## Post-MVP (Deferred)

These features are explicitly deferred to keep MVP scope manageable:

### Feature 43: Skill script execution (`scripts/` directory)
Add Bun subprocess execution for scripts in skill `scripts/` directories per Agent Skills spec. Use `Bun.spawn()` with:
- Process isolation and sandboxing
- Timeout enforcement (60s default)
- Output size limits (1MB)
- Argument validation (max 100 args, 4096 bytes)

Scripts are language-agnostic (Bash, Python, TypeScript, etc.) and executed via the agent's shell access. This completes spec-compliant skill execution.

### Feature 44: Git-based skill installation
Support `skill install <git-url>` for installing skills from repositories. Port `manager.py` patterns: shallow clone, structure detection (single-skill, subdirectory, monorepo), atomic installation to `~/.agent/skills/`.

### Feature 45: Semantic memory (Mem0)
Add optional Mem0 integration for vector-based semantic memory retrieval.

### Feature 46: npm package publishing
Prepare package.json for npm publication, set up CI/CD for releases.

---

## Feature → Phase Summary

| Phase | Features | Count | Focus |
|-------|----------|-------|-------|
| 1a | 1-8 | 8 | Foundation core: config, tools, OpenAI, agent loop, callbacks, errors, hello tool |
| 1b | 9-11 | 3 | Foundation observability: OpenTelemetry, GenAI conventions, Aspire Dashboard |
| 2 | 12-17 | 6 | Multi-provider (Anthropic, Gemini, Azure), retry, CLI shell, input, display, **FileSystem tools** |
| 3 | 18-24 (+23a) | 8 | Memory, context, sessions, streaming, tokens, GitHub, Azure Foundry (Local/Cloud), Local (Docker Model Runner) |
| 4 | 25-30 | 5 | Skills: **Spec-compliant** manifest, loader, prompt generation, progressive disclosure, bundled example |
| 5 | 31-35 | 5 | Config commands, wizards, skill commands, session commands, help |
| 6 | 36-42 | 7 | Tests, migration tool, prompts, CLAUDE.md, docs, polish |
| Post | 43-46 | 4 | **Script execution** (scripts/ dir), git skills, Mem0, npm publish |

**MVP Total: 42 features** (Feature 29 merged into 23a; script execution deferred to post-MVP)

> **Note:** Phase 4 aligns with the official [Agent Skills specification](https://agentskills.io). Skills created for this framework are portable to Claude Code, Claude.ai, and other spec-compliant agents.
