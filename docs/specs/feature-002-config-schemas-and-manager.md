# Feature: Configuration Schemas and Manager

## Feature Description

Port the Python configuration system (`agent-base/src/agent/config/schema.py`) to TypeScript using Zod schemas with inferred types. This implements a complete configuration management system that:

1. Defines Zod schemas for all configuration sections (providers, agent, telemetry, memory, skills)
2. Automatically infers TypeScript types from schemas (no manual type definitions)
3. Loads configuration from multiple sources with hierarchical merging
4. Validates configuration on load and save operations
5. Persists configuration in stable, minimal JSON format

This is **Feature 2** from the TypeScript rewrite plan and serves as the foundation that every other feature depends on.

## User Story

As a developer using the agent framework
I want a type-safe, validated configuration system
So that I can confidently configure providers, memory, and telemetry without runtime errors

## Problem Statement

The TypeScript agent framework needs a robust configuration system that:
- Provides type safety through Zod schema inference
- Supports multi-level configuration merging (defaults, user-level, project-level, environment)
- Validates configuration at load time to catch errors early
- Persists changes in a clean, minimal JSON format
- Maintains compatibility with the Python version's config structure for migration

## Solution Statement

Implement a configuration module in `src/config/` that:
1. Defines comprehensive Zod schemas matching the Python Pydantic models
2. Uses `z.infer<>` for automatic TypeScript type generation
3. Implements a `ConfigManager` class with dependency injection
4. Provides merge utilities for hierarchical configuration
5. Handles environment variable overrides with proper type coercion
6. Writes minimal JSON (only enabled providers, non-null values)

## Related Documentation

### Requirements
- Feature 2 in `docs/plans/typescript-rewrite-features.md`

### Architecture Decisions
- ADR-0004: Validation with Zod 4.x (use Zod 3.24.x per package.json)
- ADR-0007: Callbacks over EventBus (for config load/save notifications)

## Codebase Analysis Findings

- **Architecture patterns**: Layered architecture with dependency injection via constructors
- **Naming conventions**:
  - Files: kebab-case (`config-manager.ts`)
  - Functions/variables: camelCase
  - Classes/types: PascalCase
  - Config keys: camelCase (no snake_case transformation)
- **Similar implementations**:
  - `src/components/App.tsx` - React functional component pattern
  - `src/index.tsx` - Entry point with Ink rendering
- **Integration patterns**: Callback interfaces, structured responses
- **Testing approaches**: Jest + ts-jest, co-located `__tests__/` directories, 85% coverage
- **External libraries**: Zod 3.24.x, dotenv for env loading

### Key Python → TypeScript Mappings

| Python (Pydantic) | TypeScript (Zod) |
|-------------------|------------------|
| `class Config(BaseModel)` | `const ConfigSchema = z.object({...})` |
| `Field(default=...)` | `z.string().default(...)` |
| `field_validator` | `z.string().refine(...)` or `.transform()` |
| `model_validator(mode="after")` | Custom function after parse |
| `model_dump_json()` | Custom serialization function |

## Archon Project

**project_id**: `9f2449ae-242e-475d-904a-ac64b5e15fe2`

## Relevant Files

### Existing Files
- `docs/architecture.md:209-268`: Config architecture documentation
- `docs/decisions/0004-validation-zod.md`: Zod validation patterns
- `package.json`: Zod 3.24.x dependency
- `src/config/__tests__/.gitkeep`: Test directory placeholder
- `src/config/providers/.gitkeep`: Provider config directory placeholder

### Python Source Reference
- `agent-base/src/agent/config/schema.py`: Pydantic models (768 lines)
- `agent-base/src/agent/config/manager.py`: Load/save/merge logic (466 lines)
- `agent-base/src/agent/config/constants.py`: Default values (31 lines)

### New Files
- `src/config/constants.ts`: Default configuration values
- `src/config/schema.ts`: Zod schemas and inferred types
- `src/config/manager.ts`: ConfigManager class
- `src/config/env.ts`: Environment variable parsing utilities
- `src/config/types.ts`: Additional TypeScript interfaces (callbacks, errors)
- `src/config/index.ts`: Public exports
- `src/config/__tests__/schema.test.ts`: Schema validation tests
- `src/config/__tests__/manager.test.ts`: ConfigManager tests
- `src/config/__tests__/env.test.ts`: Environment parsing tests

## Implementation Plan

### Phase 1: Foundation (Constants and Schemas)

Define default values and Zod schemas that mirror the Python Pydantic models.

**Key decisions:**
- Use camelCase for all config keys (TypeScript convention)
- Use Zod `.default()` for schema defaults (replaces Python Field defaults)
- Use `z.infer<>` for type inference (no manual type definitions)
- Support 7 providers: local, openai, anthropic, azure, foundry, gemini, github

### Phase 2: Core Implementation (Manager)

Implement the ConfigManager class with:
- Constructor-based dependency injection
- Multi-level config loading and merging
- Environment variable override support
- Validation on load/save

### Phase 3: Integration

- Export public API from index.ts
- Ensure all tests pass with 85%+ coverage
- Validate against Python config files for compatibility

## Step by Step Tasks

### Task 1: Create configuration constants

- **Description**: Define default values for all providers, telemetry, memory settings
- **Files to modify**: Create `src/config/constants.ts`
- **Details**:
  - Port `DEFAULT_*` constants from Python `constants.py`
  - Use TypeScript const assertions for type safety
  - Include all 7 provider defaults (local, openai, anthropic, azure, foundry, gemini, github)

### Task 2: Define provider Zod schemas

- **Description**: Create Zod schemas for each LLM provider configuration
- **Files to modify**: Create `src/config/schema.ts`
- **Details**:
  - `LocalProviderConfigSchema`: baseUrl, model
  - `OpenAIProviderConfigSchema`: apiKey, model
  - `AnthropicProviderConfigSchema`: apiKey, model
  - `AzureOpenAIProviderConfigSchema`: endpoint, deployment, apiVersion, apiKey
  - `FoundryProviderConfigSchema`: projectEndpoint, modelDeployment
  - `GeminiProviderConfigSchema`: apiKey, model, useVertexai, projectId, location
  - `GitHubProviderConfigSchema`: token, model, endpoint, org
  - `ProvidersConfigSchema`: combines all providers with `default` field

### Task 3: Define remaining Zod schemas

- **Description**: Create Zod schemas for agent, telemetry, memory, skills sections
- **Files to modify**: Update `src/config/schema.ts`
- **Details**:
  - `AgentConfigSchema`: dataDir, logLevel, systemPromptFile, workspaceRoot, filesystemWritesEnabled
  - `TelemetryConfigSchema`: enabled, enableSensitiveData, otlpEndpoint, applicationinsightsConnectionString
  - `Mem0ConfigSchema`: storagePath, apiKey, orgId, userId, projectId
  - `MemoryConfigSchema`: enabled, type, historyLimit, mem0
  - `SkillsConfigSchema`: plugins, disabledBundled, enabledBundled, userDir, scriptTimeout
  - `AppConfigSchema`: Root schema combining all sections with version field

### Task 4: Create environment variable parser

- **Description**: Implement environment variable reading and type coercion
- **Files to modify**: Create `src/config/env.ts`
- **Details**:
  - Map environment variables to config paths (e.g., `OPENAI_API_KEY` → `providers.openai.apiKey`)
  - Handle type coercion (strings to booleans, numbers)
  - Support `LLM_PROVIDER` for default provider selection
  - Support `AGENT_MODEL` for model override

### Task 5: Implement deep merge utility

- **Description**: Create utility for recursively merging config objects
- **Files to modify**: Update `src/config/manager.ts`
- **Details**:
  - Deep merge with override precedence
  - Handle array merging (replace, not concat)
  - Preserve type safety through generics

### Task 6: Implement ConfigManager class

- **Description**: Create the main configuration manager with load/save/validate
- **Files to modify**: Create `src/config/manager.ts`
- **Details**:
  - Constructor accepts optional dependencies (file system, env reader)
  - `load(projectPath?)`: Load and merge config hierarchy
  - `save(config, path?)`: Validate and save to disk
  - `validate(config)`: Return validation errors
  - `getDefaults()`: Return schema defaults
  - Use structured `ToolResponse<T>` pattern for return values

### Task 7: Implement config file reading and writing

- **Description**: Add file I/O operations to ConfigManager
- **Files to modify**: Update `src/config/manager.ts`
- **Details**:
  - Read JSON from `~/.agent/settings.json` (user config)
  - Read JSON from `./.agent/settings.json` (project config)
  - Write minimal JSON (only enabled providers, non-null values)
  - Set restrictive permissions (0o600) on POSIX for security
  - Create parent directories if missing

### Task 8: Define types and interfaces

- **Description**: Create TypeScript interfaces for callbacks, errors, file system abstraction
- **Files to modify**: Create `src/config/types.ts`
- **Details**:
  - `ConfigCallbacks`: onConfigLoad, onConfigSave, onValidationError
  - `IFileSystem`: readFile, writeFile, exists (for dependency injection)
  - `IEnvReader`: get, getBoolean, getNumber (for dependency injection)
  - `ConfigError`: Custom error class for config failures

### Task 9: Create public exports

- **Description**: Set up the module's public API
- **Files to modify**: Create `src/config/index.ts`
- **Details**:
  - Export all schemas (for external validation)
  - Export inferred types
  - Export ConfigManager class
  - Export utility functions (getDefaultConfig, loadConfig)
  - Export constants

### Task 10: Write schema validation tests

- **Description**: Test Zod schema validation with valid and invalid inputs
- **Files to modify**: Create `src/config/__tests__/schema.test.ts`
- **Details**:
  - Test each provider schema with valid config
  - Test validation errors for missing required fields
  - Test default value application
  - Test type coercion (string → boolean, etc.)
  - Test nested schema validation

### Task 11: Write ConfigManager tests

- **Description**: Test config loading, merging, and saving
- **Files to modify**: Create `src/config/__tests__/manager.test.ts`
- **Details**:
  - Mock file system operations
  - Test config hierarchy merging (defaults < user < project < env)
  - Test save with minimal JSON output
  - Test validation error handling
  - Test callback invocation

### Task 12: Write environment parsing tests

- **Description**: Test environment variable parsing and type coercion
- **Files to modify**: Create `src/config/__tests__/env.test.ts`
- **Details**:
  - Test each environment variable mapping
  - Test boolean coercion (true/false strings)
  - Test number coercion
  - Test provider selection via LLM_PROVIDER
  - Test AGENT_MODEL override

## Testing Strategy

### Unit Tests

- **Schema tests**: Validate each Zod schema with valid/invalid inputs
- **Env tests**: Test environment variable parsing and type coercion
- **Merge tests**: Test deep merge with various nested structures
- **Manager tests**: Test load/save/validate operations with mocked I/O

### Integration Tests

- Load real config files from `tests/fixtures/` directory
- Verify Python-to-TypeScript config compatibility
- Test full load → modify → save → reload cycle

### Edge Cases

- Empty config file (should use defaults)
- Missing config file (should use defaults, no error)
- Invalid JSON (should return validation error)
- Partial config (should merge with defaults)
- Environment variables with invalid values (should use defaults)
- Config file with unknown fields (should be stripped on save)

## Acceptance Criteria

- [ ] All 7 provider schemas defined with correct field types
- [ ] AppConfig type is inferred from Zod schema (no manual type definition)
- [ ] ConfigManager loads from user (~/.agent) and project (./.agent) paths
- [ ] Environment variables override config file values
- [ ] Validation returns structured errors (not exceptions)
- [ ] Save produces minimal JSON (only enabled providers, non-null values)
- [ ] File permissions set to 0o600 on POSIX systems
- [ ] 85%+ test coverage for all config module files
- [ ] All tests pass with `bun run test`
- [ ] TypeScript strict mode passes with `bun run typecheck`
- [ ] ESLint passes with `bun run lint`

## Validation Commands

```bash
# Run all quality checks
bun run typecheck && bun run lint && bun run test

# Run only config tests
bun run test src/config/

# Run tests with coverage
bun run test:coverage

# Verify build works
bun run build
```

## Notes

### Python Config Keys vs TypeScript

The Python version uses `snake_case` for config keys (e.g., `api_key`, `base_url`). The TypeScript version uses `camelCase` (e.g., `apiKey`, `baseUrl`) per TypeScript conventions. This means:

1. Config files created by the Python version will need migration
2. A migration tool (Feature 40) will handle the conversion
3. For now, TypeScript version uses its own config format

### Minimal JSON Output

The `save()` method produces minimal JSON like the Python `model_dump_json_minimal()`:

```json
{
  "version": "1.0",
  "providers": {
    "default": "openai",
    "openai": {
      "apiKey": "sk-...",
      "model": "gpt-4o"
    }
  },
  "telemetry": {
    "enabled": false
  }
}
```

Instead of the verbose full config with all 7 providers. This improves:
- Readability (20 lines vs 100+ lines)
- Git diffs (smaller changes)
- User understanding (only see what's configured)

### Environment Variable Mapping

| Environment Variable | Config Path | Notes |
|---------------------|-------------|-------|
| `LLM_PROVIDER` | `providers.default` | Also adds to enabled list |
| `AGENT_MODEL` | `providers.{default}.model` | Uses current default provider |
| `OPENAI_API_KEY` | `providers.openai.apiKey` | |
| `ANTHROPIC_API_KEY` | `providers.anthropic.apiKey` | |
| `AZURE_OPENAI_ENDPOINT` | `providers.azure.endpoint` | |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | `providers.azure.deployment` | |
| `AZURE_OPENAI_API_KEY` | `providers.azure.apiKey` | |
| `AZURE_PROJECT_ENDPOINT` | `providers.foundry.projectEndpoint` | |
| `AZURE_MODEL_DEPLOYMENT` | `providers.foundry.modelDeployment` | |
| `GEMINI_API_KEY` | `providers.gemini.apiKey` | |
| `GEMINI_USE_VERTEXAI` | `providers.gemini.useVertexai` | Boolean coercion |
| `GEMINI_PROJECT_ID` | `providers.gemini.projectId` | |
| `GEMINI_LOCATION` | `providers.gemini.location` | |
| `AGENT_DATA_DIR` | `agent.dataDir` | |
| `ENABLE_OTEL` | `telemetry.enabled` | Boolean coercion |
| `OTLP_ENDPOINT` | `telemetry.otlpEndpoint` | |
| `MEMORY_ENABLED` | `memory.enabled` | Boolean coercion |
| `MEMORY_TYPE` | `memory.type` | |
| `MEMORY_HISTORY_LIMIT` | `memory.historyLimit` | Number coercion |

### Dependency Injection Pattern

The ConfigManager uses constructor injection for testability:

```typescript
class ConfigManager {
  constructor(
    private readonly fileSystem?: IFileSystem,
    private readonly envReader?: IEnvReader,
    private readonly callbacks?: ConfigCallbacks
  ) {
    // Use real implementations if not provided
    this.fileSystem = fileSystem ?? new NodeFileSystem();
    this.envReader = envReader ?? new ProcessEnvReader();
  }
}
```

This allows tests to inject mocks while production code uses real implementations.

## Execution

This spec can be implemented using: `/sdlc:implement docs/specs/config-schemas-and-manager.md`
