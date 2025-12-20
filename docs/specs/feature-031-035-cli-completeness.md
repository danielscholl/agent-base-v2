# Feature: Phase 5 - CLI Completeness

## Feature Description

Implement full CLI parity with the Python agent-base version by adding comprehensive command-line management capabilities. This phase includes five features (31-35):

1. **Config Subcommands** - Interactive configuration management (`/config init|show|edit`)
2. **Provider Setup Wizards** - Guided setup for each LLM provider with validation
3. **Skill Management Commands** - Skill discovery, inspection, and validation (`/skill list|info|validate`)
4. **Session Management Commands** - Already implemented (Features 20)
5. **Help System** - Comprehensive help documentation for all commands and shortcuts

This phase transforms the agent from a functional prototype into a polished CLI tool with full feature discoverability and guided setup experiences.

## User Story

As an agent user,
I want comprehensive CLI commands for configuration, skills, and help,
So that I can easily set up, customize, and learn how to use the agent framework.

## Problem Statement

The current TypeScript agent framework lacks:
- Interactive configuration setup (users must manually edit JSON)
- Provider-specific setup wizards (no guided API key/endpoint configuration)
- Skill management commands (no way to inspect or validate skills from CLI)
- Complete help documentation (current `/help` is minimal)

Users must manually create and edit `~/.agent/settings.json` with no validation feedback, making initial setup error-prone and frustrating.

## Solution Statement

Implement a complete CLI command suite that provides:

1. **Config Commands** - `/config init` for interactive setup, `/config show` for displaying current settings, `/config edit` for modifying specific values
2. **Provider Wizards** - Step-by-step setup flows for each of the 7 providers with connection validation
3. **Skill Commands** - `/skill list` to show discovered skills, `/skill info <name>` for details, `/skill validate <path>` to check manifest validity
4. **Enhanced Help** - Comprehensive `/help` with all commands, shortcuts, and examples

## Related Documentation

### Requirements
- `docs/plans/typescript-rewrite-features.md` - Features 31-35 specification
- `docs/plans/typescript-rewrite.md` - Phase 5: CLI Completeness
- `docs/architecture.md` - CLI Layer, Config Architecture, Skills Architecture

### Architecture Decisions
- `docs/decisions/0005-terminal-ui-react-ink.md` - React/Ink for terminal UI
- `docs/decisions/0004-validation-zod.md` - Zod validation patterns
- `docs/decisions/0007-callbacks-over-eventbus.md` - Callback patterns

## Codebase Analysis Findings

### Architecture Patterns
- **Command Registry**: Commands defined in `src/cli/commands/index.ts` with `CommandDefinition[]`
- **Command Handler**: `(args: string, context: CommandContext) => Promise<CommandResult>`
- **Component Pattern**: React functional components with `useApp()`, `useState`, `useEffect`
- **Config Loading**: `loadConfig()` returns `ConfigResponse` with success/error
- **Skill Discovery**: `SkillLoader.discover()` returns `SkillDiscoveryResult`

### Naming Conventions
- Files: `kebab-case.ts` (e.g., `config.ts`, `skills.ts`)
- Components: `PascalCase.tsx` (e.g., `ConfigForm.tsx`)
- Handlers: `camelCaseHandler` (e.g., `configShowHandler`)
- Constants: `COMMAND_CONFIG`, `COMMAND_SKILL`

### Similar Implementations
- `src/cli/commands/session.ts` - Reference for command handler patterns
- `src/cli/commands/telemetry.ts` - Reference for subcommand parsing
- `src/cli/commands/help.ts` - Reference for help text formatting
- `src/components/HealthCheck.tsx` - Reference for display-only components

### Integration Patterns
- Commands receive `CommandContext` with `config`, `onOutput`, `onPrompt`, `exit`
- Results use `CommandResult` with flags like `shouldExit`, `shouldClear`, custom data
- InteractiveShell dispatches commands via `executeCommand()` from registry

### Key Python Patterns to Port
From `agent-base/src/agent/config/providers/`:
- Provider-specific validation (API key format, endpoint URL)
- Connection testing before saving
- Graceful error messages for auth failures

From `agent-base/src/agent/cli/commands.py`:
- `/config show` - Pretty-printed YAML output
- `/config edit` - Interactive field selection
- `/skill list` - Tabular skill display

## Archon Project

**Project ID:** `6370165e-f893-47c5-a8f2-787052be27eb`
**Title:** Phase 5: CLI Completeness

## Relevant Files

### Existing Files
- `src/cli/commands/index.ts`: Command registry and dispatcher
- `src/cli/commands/types.ts`: CommandHandler, CommandContext, CommandResult
- `src/cli/commands/help.ts`: Current help handler (needs update)
- `src/cli/constants.ts`: Command alias definitions
- `src/config/schema.ts`: Zod schemas for all config sections
- `src/config/manager.ts`: loadConfig(), saveConfig() functions
- `src/config/constants.ts`: Default values for all providers
- `src/skills/loader.ts`: SkillLoader class
- `src/skills/manifest.ts`: SkillManifestSchema
- `src/skills/parser.ts`: parseSkillMd() function
- `src/components/HealthCheck.tsx`: Display component pattern
- `src/components/InteractiveShell.tsx`: Main CLI integration point

### New Files
- `src/cli/commands/config.ts`: Config command handlers
- `src/cli/commands/skills.ts`: Skill command handlers
- `src/config/providers/index.ts`: Provider wizard exports
- `src/config/providers/openai.ts`: OpenAI setup wizard
- `src/config/providers/anthropic.ts`: Anthropic setup wizard
- `src/config/providers/azure.ts`: Azure OpenAI setup wizard
- `src/config/providers/foundry.ts`: Azure AI Foundry setup wizard
- `src/config/providers/gemini.ts`: Google Gemini setup wizard
- `src/config/providers/github.ts`: GitHub Models setup wizard
- `src/config/providers/local.ts`: Local (Docker) setup wizard
- `src/cli/commands/__tests__/config.test.ts`: Config command tests
- `src/cli/commands/__tests__/skills.test.ts`: Skill command tests

## Implementation Plan

### Phase 1: Foundation
Add command aliases and types for new commands. Create skeleton handlers.

### Phase 2: Config Show Command
Implement `/config show` to display formatted current configuration.

### Phase 3: Provider Setup Wizards
Create provider-specific setup wizards with validation.

### Phase 4: Config Init/Edit Commands
Implement `/config init` using provider wizards and `/config edit` for field updates.

### Phase 5: Skill Commands
Add `/skill list`, `/skill info`, and `/skill validate` commands.

### Phase 6: Help System
Update `/help` with comprehensive documentation.

## Step by Step Tasks

### Task 1: Add command constants for new commands
- Description: Define command aliases in constants.ts
- Files to modify: `src/cli/constants.ts`
- Implementation details:
  ```typescript
  /** Config command aliases */
  export const COMMAND_CONFIG = ['/config'] as const;

  /** Skill command aliases */
  export const COMMAND_SKILL = ['/skill', '/skills'] as const;
  ```

### Task 2: Create config command handler skeleton
- Description: Set up config command structure with subcommand routing
- Files to create: `src/cli/commands/config.ts`
- Implementation details:
  ```typescript
  /**
   * Config command handlers.
   * Provides /config init, /config show, /config edit subcommands.
   */

  import type { CommandHandler, CommandResult, CommandContext } from './types.js';
  import { loadConfig, saveConfig } from '../../config/manager.js';
  import type { AppConfig } from '../../config/schema.js';

  /**
   * Main config command handler.
   * Routes to subcommands based on first argument.
   */
  export const configHandler: CommandHandler = async (args, context): Promise<CommandResult> => {
    const [subcommand, ...rest] = args.trim().split(/\s+/);
    const subArgs = rest.join(' ');

    switch (subcommand?.toLowerCase()) {
      case 'init':
        return configInitHandler(subArgs, context);
      case 'show':
        return configShowHandler(subArgs, context);
      case 'edit':
        return configEditHandler(subArgs, context);
      case undefined:
      case '':
        return configShowHandler('', context); // Default to show
      default:
        context.onOutput(`Unknown subcommand: ${subcommand}`, 'warning');
        context.onOutput('Usage: /config [init|show|edit]', 'info');
        return { success: false, message: 'Unknown subcommand' };
    }
  };
  ```

### Task 3: Implement /config show command
- Description: Display current configuration in formatted output
- Files to modify: `src/cli/commands/config.ts`
- Implementation details:
  ```typescript
  /**
   * Handler for /config show command.
   * Displays current configuration in readable format.
   */
  export const configShowHandler: CommandHandler = async (_args, context): Promise<CommandResult> => {
    const configResult = await loadConfig();

    if (!configResult.success) {
      context.onOutput(`Failed to load config: ${configResult.message}`, 'error');
      return { success: false, message: configResult.message };
    }

    const config = configResult.result as AppConfig;

    // Format and display each section
    context.onOutput('Current Configuration:', 'success');
    context.onOutput('─────────────────────', 'info');

    // Provider section
    context.onOutput('\n[Providers]', 'info');
    context.onOutput(`  Default: ${config.providers.default}`, 'info');

    // Show configured providers
    const providers = ['openai', 'anthropic', 'azure', 'foundry', 'gemini', 'github', 'local'] as const;
    for (const name of providers) {
      const providerConfig = config.providers[name];
      if (providerConfig) {
        const model = 'model' in providerConfig ? providerConfig.model :
                      'modelAlias' in providerConfig ? providerConfig.modelAlias : 'N/A';
        const hasAuth = 'apiKey' in providerConfig && providerConfig.apiKey ||
                        'token' in providerConfig && providerConfig.token ||
                        name === 'local';
        context.onOutput(`  ${name}: ${model} ${hasAuth ? '(configured)' : '(no auth)'}`, 'info');
      }
    }

    // Agent section
    context.onOutput('\n[Agent]', 'info');
    context.onOutput(`  Data Dir: ${config.agent.dataDir}`, 'info');
    context.onOutput(`  Log Level: ${config.agent.logLevel}`, 'info');
    context.onOutput(`  Filesystem Writes: ${config.agent.filesystemWritesEnabled ? 'enabled' : 'disabled'}`, 'info');

    // Memory section
    context.onOutput('\n[Memory]', 'info');
    context.onOutput(`  Enabled: ${config.memory.enabled}`, 'info');
    context.onOutput(`  Type: ${config.memory.type}`, 'info');
    context.onOutput(`  History Limit: ${config.memory.historyLimit}`, 'info');

    // Session section
    context.onOutput('\n[Session]', 'info');
    context.onOutput(`  Auto Save: ${config.session.autoSave}`, 'info');
    context.onOutput(`  Max Sessions: ${config.session.maxSessions}`, 'info');

    // Skills section
    context.onOutput('\n[Skills]', 'info');
    context.onOutput(`  Disabled Bundled: ${config.skills.disabledBundled.length > 0 ? config.skills.disabledBundled.join(', ') : 'none'}`, 'info');
    context.onOutput(`  Plugins: ${config.skills.plugins.length > 0 ? config.skills.plugins.join(', ') : 'none'}`, 'info');

    // Telemetry section
    context.onOutput('\n[Telemetry]', 'info');
    context.onOutput(`  Enabled: ${config.telemetry.enabled}`, 'info');
    if (config.telemetry.otlpEndpoint) {
      context.onOutput(`  OTLP Endpoint: ${config.telemetry.otlpEndpoint}`, 'info');
    }

    context.onOutput('\n─────────────────────', 'info');
    context.onOutput('Use /config edit to modify settings', 'info');

    return { success: true, data: config };
  };
  ```

### Task 4: Create provider wizard interface and base implementation
- Description: Define common interface and utilities for provider wizards
- Files to create: `src/config/providers/index.ts`
- Implementation details:
  ```typescript
  /**
   * Provider setup wizards.
   * Guided setup flows for each LLM provider.
   */

  import type { CommandContext } from '../../cli/commands/types.js';

  /**
   * Result of a provider setup wizard.
   */
  export interface ProviderSetupResult {
    success: boolean;
    config?: Record<string, unknown>;
    message: string;
  }

  /**
   * Provider setup wizard function signature.
   */
  export type ProviderSetupWizard = (context: CommandContext) => Promise<ProviderSetupResult>;

  /**
   * Provider information for display.
   */
  export interface ProviderInfo {
    name: string;
    displayName: string;
    description: string;
    authMethod: string;
    wizard: ProviderSetupWizard;
  }

  // Import all provider wizards
  export { setupOpenAI } from './openai.js';
  export { setupAnthropic } from './anthropic.js';
  export { setupAzure } from './azure.js';
  export { setupFoundry } from './foundry.js';
  export { setupGemini } from './gemini.js';
  export { setupGitHub } from './github.js';
  export { setupLocal } from './local.js';

  /**
   * Get all available provider wizards.
   */
  export function getProviderWizards(): ProviderInfo[] {
    return [
      {
        name: 'openai',
        displayName: 'OpenAI',
        description: 'GPT-4, GPT-4o, o1, and other OpenAI models',
        authMethod: 'API Key',
        wizard: setupOpenAI,
      },
      {
        name: 'anthropic',
        displayName: 'Anthropic',
        description: 'Claude Sonnet, Claude Opus, and Claude Haiku models',
        authMethod: 'API Key',
        wizard: setupAnthropic,
      },
      {
        name: 'azure',
        displayName: 'Azure OpenAI',
        description: 'Azure-hosted OpenAI models with enterprise security',
        authMethod: 'API Key or Azure CLI',
        wizard: setupAzure,
      },
      {
        name: 'foundry',
        displayName: 'Azure AI Foundry',
        description: 'Azure AI managed models (local or cloud)',
        authMethod: 'Azure CLI',
        wizard: setupFoundry,
      },
      {
        name: 'gemini',
        displayName: 'Google Gemini',
        description: 'Gemini Pro and Gemini Flash models',
        authMethod: 'API Key',
        wizard: setupGemini,
      },
      {
        name: 'github',
        displayName: 'GitHub Models',
        description: 'Models via GitHub Copilot infrastructure',
        authMethod: 'GitHub Token',
        wizard: setupGitHub,
      },
      {
        name: 'local',
        displayName: 'Local (Docker)',
        description: 'Local models via Docker Model Runner',
        authMethod: 'None (local)',
        wizard: setupLocal,
      },
    ];
  }
  ```

### Task 5: Implement OpenAI provider wizard
- Description: Create guided setup for OpenAI provider
- Files to create: `src/config/providers/openai.ts`
- Implementation details:
  ```typescript
  /**
   * OpenAI provider setup wizard.
   */

  import type { CommandContext } from '../../cli/commands/types.js';
  import type { ProviderSetupResult } from './index.js';
  import { DEFAULT_OPENAI_MODEL } from '../constants.js';

  /**
   * Interactive setup wizard for OpenAI provider.
   * Prompts for API key and model, validates before returning.
   */
  export async function setupOpenAI(context: CommandContext): Promise<ProviderSetupResult> {
    context.onOutput('\n🔧 OpenAI Setup', 'success');
    context.onOutput('─────────────────', 'info');
    context.onOutput('Get your API key from: https://platform.openai.com/api-keys\n', 'info');

    if (!context.onPrompt) {
      return { success: false, message: 'Interactive prompts not available' };
    }

    // Prompt for API key
    const apiKey = await context.onPrompt('OpenAI API Key (sk-...):');

    if (!apiKey || !apiKey.startsWith('sk-')) {
      context.onOutput('Invalid API key format. Expected key starting with "sk-"', 'error');
      return { success: false, message: 'Invalid API key format' };
    }

    // Prompt for model with default
    const modelInput = await context.onPrompt(`Model (default: ${DEFAULT_OPENAI_MODEL}):`);
    const model = modelInput.trim() || DEFAULT_OPENAI_MODEL;

    // Optional: Test connection
    context.onOutput('\nTesting connection...', 'info');

    // For now, we trust the API key format. Real validation would make an API call.
    // Future enhancement: Use OpenAI client to validate key

    context.onOutput('✓ Configuration ready', 'success');

    return {
      success: true,
      config: { apiKey, model },
      message: 'OpenAI configured successfully',
    };
  }
  ```

### Task 6: Implement remaining provider wizards
- Description: Create setup wizards for Anthropic, Azure, Foundry, Gemini, GitHub, Local
- Files to create:
  - `src/config/providers/anthropic.ts`
  - `src/config/providers/azure.ts`
  - `src/config/providers/foundry.ts`
  - `src/config/providers/gemini.ts`
  - `src/config/providers/github.ts`
  - `src/config/providers/local.ts`
- Implementation details:
  - Each follows similar pattern to OpenAI wizard
  - Provider-specific validation (e.g., Azure endpoint URL, GitHub token format)
  - Display provider-specific help URLs
  - Local provider checks Docker availability

### Task 7: Implement /config init command
- Description: Interactive configuration initialization wizard
- Files to modify: `src/cli/commands/config.ts`
- Implementation details:
  ```typescript
  /**
   * Handler for /config init command.
   * Interactive setup wizard for initial configuration.
   */
  export const configInitHandler: CommandHandler = async (_args, context): Promise<CommandResult> => {
    context.onOutput('\n🚀 Agent Configuration Setup', 'success');
    context.onOutput('════════════════════════════\n', 'info');

    if (!context.onPrompt) {
      context.onOutput('Interactive mode required for config init', 'error');
      return { success: false, message: 'No prompt handler available' };
    }

    // Step 1: Select provider
    context.onOutput('Step 1: Choose your LLM provider\n', 'info');

    const providers = getProviderWizards();
    for (let i = 0; i < providers.length; i++) {
      const p = providers[i];
      context.onOutput(`  ${i + 1}. ${p.displayName} - ${p.description}`, 'info');
      context.onOutput(`     Auth: ${p.authMethod}`, 'info');
    }

    const choice = await context.onPrompt('\nSelect provider (1-7):');
    const providerIndex = parseInt(choice, 10) - 1;

    if (isNaN(providerIndex) || providerIndex < 0 || providerIndex >= providers.length) {
      context.onOutput('Invalid selection', 'error');
      return { success: false, message: 'Invalid provider selection' };
    }

    const selectedProvider = providers[providerIndex];

    // Step 2: Run provider wizard
    context.onOutput(`\nStep 2: Configure ${selectedProvider.displayName}\n`, 'info');
    const wizardResult = await selectedProvider.wizard(context);

    if (!wizardResult.success) {
      return { success: false, message: wizardResult.message };
    }

    // Step 3: Save configuration
    context.onOutput('\nStep 3: Saving configuration...\n', 'info');

    const configResult = await loadConfig();
    const existingConfig = configResult.success ? configResult.result : getDefaultConfig();

    // Merge provider config
    const newConfig = {
      ...existingConfig,
      providers: {
        ...existingConfig.providers,
        default: selectedProvider.name,
        [selectedProvider.name]: wizardResult.config,
      },
    };

    const saveResult = await saveConfig(newConfig);

    if (!saveResult.success) {
      context.onOutput(`Failed to save: ${saveResult.message}`, 'error');
      return { success: false, message: saveResult.message };
    }

    context.onOutput('✓ Configuration saved successfully!', 'success');
    context.onOutput(`  Provider: ${selectedProvider.displayName}`, 'info');
    context.onOutput('  Location: ~/.agent/settings.json\n', 'info');
    context.onOutput('Run /config show to view your configuration', 'info');

    return { success: true, message: 'Configuration initialized' };
  };
  ```

### Task 8: Implement /config edit command
- Description: Interactive field editing for configuration
- Files to modify: `src/cli/commands/config.ts`
- Implementation details:
  ```typescript
  /**
   * Handler for /config edit command.
   * Interactive editing of configuration fields.
   */
  export const configEditHandler: CommandHandler = async (args, context): Promise<CommandResult> => {
    // Parse field path if provided (e.g., /config edit providers.default)
    const fieldPath = args.trim();

    if (!context.onPrompt) {
      context.onOutput('Interactive mode required for config edit', 'error');
      return { success: false, message: 'No prompt handler available' };
    }

    const configResult = await loadConfig();
    if (!configResult.success) {
      context.onOutput(`Failed to load config: ${configResult.message}`, 'error');
      return { success: false, message: configResult.message };
    }

    const config = configResult.result as AppConfig;

    if (!fieldPath) {
      // Show editable sections
      context.onOutput('\nEditable Configuration Sections:', 'success');
      context.onOutput('─────────────────────────────────', 'info');
      context.onOutput('  1. providers.default  - Default LLM provider', 'info');
      context.onOutput('  2. agent.logLevel     - Logging level (debug/info/warn/error)', 'info');
      context.onOutput('  3. memory.enabled     - Enable/disable memory', 'info');
      context.onOutput('  4. telemetry.enabled  - Enable/disable telemetry', 'info');
      context.onOutput('  5. session.autoSave   - Auto-save sessions on exit', 'info');
      context.onOutput('\nUsage: /config edit <field.path>', 'info');
      context.onOutput('Example: /config edit providers.default', 'info');
      return { success: true };
    }

    // Handle specific field edits
    // Implementation would parse field path and prompt for new value
    // Then validate and save

    context.onOutput(`Editing: ${fieldPath}`, 'info');
    // ... field-specific edit logic

    return { success: true, message: `Updated ${fieldPath}` };
  };
  ```

### Task 9: Create skill command handler
- Description: Implement /skill list, /skill info, /skill validate commands
- Files to create: `src/cli/commands/skills.ts`
- Implementation details:
  ```typescript
  /**
   * Skill management command handlers.
   * Provides /skill list, /skill info, /skill validate subcommands.
   */

  import type { CommandHandler, CommandResult } from './types.js';
  import { SkillLoader } from '../../skills/loader.js';
  import { parseSkillMd } from '../../skills/parser.js';
  import { readFile } from 'node:fs/promises';

  /**
   * Main skill command handler.
   * Routes to subcommands based on first argument.
   */
  export const skillHandler: CommandHandler = async (args, context): Promise<CommandResult> => {
    const [subcommand, ...rest] = args.trim().split(/\s+/);
    const subArgs = rest.join(' ');

    switch (subcommand?.toLowerCase()) {
      case 'list':
      case undefined:
      case '':
        return skillListHandler(subArgs, context);
      case 'info':
        return skillInfoHandler(subArgs, context);
      case 'validate':
        return skillValidateHandler(subArgs, context);
      default:
        context.onOutput(`Unknown subcommand: ${subcommand}`, 'warning');
        context.onOutput('Usage: /skill [list|info <name>|validate <path>]', 'info');
        return { success: false, message: 'Unknown subcommand' };
    }
  };

  /**
   * Handler for /skill list command.
   * Shows all discovered skills with their sources.
   */
  export const skillListHandler: CommandHandler = async (_args, context): Promise<CommandResult> => {
    const loader = new SkillLoader();
    const { skills, errors } = await loader.discover();

    if (skills.length === 0 && errors.length === 0) {
      context.onOutput('No skills found.', 'info');
      context.onOutput('\nSkill locations:', 'info');
      context.onOutput('  Bundled: src/_bundled_skills/', 'info');
      context.onOutput('  User: ~/.agent/skills/', 'info');
      context.onOutput('  Project: ./.agent/skills/', 'info');
      return { success: true, data: { skills: [], errors: [] } };
    }

    context.onOutput(`\nDiscovered Skills (${skills.length})`, 'success');
    context.onOutput('══════════════════════════════', 'info');

    // Group by source
    const bundled = skills.filter(s => s.source === 'bundled');
    const user = skills.filter(s => s.source === 'user');
    const project = skills.filter(s => s.source === 'project');

    if (bundled.length > 0) {
      context.onOutput('\n[Bundled Skills]', 'info');
      for (const skill of bundled) {
        context.onOutput(`  ${skill.manifest.name}`, 'success');
        context.onOutput(`    ${skill.manifest.description.slice(0, 80)}...`, 'info');
      }
    }

    if (user.length > 0) {
      context.onOutput('\n[User Skills]', 'info');
      for (const skill of user) {
        context.onOutput(`  ${skill.manifest.name}`, 'success');
        context.onOutput(`    ${skill.manifest.description.slice(0, 80)}...`, 'info');
      }
    }

    if (project.length > 0) {
      context.onOutput('\n[Project Skills]', 'info');
      for (const skill of project) {
        context.onOutput(`  ${skill.manifest.name}`, 'success');
        context.onOutput(`    ${skill.manifest.description.slice(0, 80)}...`, 'info');
      }
    }

    if (errors.length > 0) {
      context.onOutput(`\n⚠ Errors (${errors.length})`, 'warning');
      for (const error of errors) {
        context.onOutput(`  ${error.path}: ${error.message}`, 'warning');
      }
    }

    context.onOutput('\nUse /skill info <name> for details', 'info');

    return { success: true, data: { skills, errors } };
  };

  /**
   * Handler for /skill info command.
   * Displays detailed information about a specific skill.
   */
  export const skillInfoHandler: CommandHandler = async (args, context): Promise<CommandResult> => {
    const skillName = args.trim();

    if (!skillName) {
      context.onOutput('Usage: /skill info <name>', 'info');
      return { success: false, message: 'Skill name required' };
    }

    const loader = new SkillLoader();
    const { skills } = await loader.discover();

    const skill = skills.find(s => s.manifest.name === skillName);

    if (!skill) {
      context.onOutput(`Skill not found: ${skillName}`, 'error');
      context.onOutput('Use /skill list to see available skills', 'info');
      return { success: false, message: 'Skill not found' };
    }

    context.onOutput(`\n📦 Skill: ${skill.manifest.name}`, 'success');
    context.onOutput('══════════════════════════════', 'info');
    context.onOutput(`\nDescription:\n  ${skill.manifest.description}`, 'info');
    context.onOutput(`\nSource: ${skill.source}`, 'info');
    context.onOutput(`Path: ${skill.path}`, 'info');

    if (skill.manifest.license) {
      context.onOutput(`License: ${skill.manifest.license}`, 'info');
    }

    if (skill.manifest.compatibility) {
      context.onOutput(`Compatibility: ${skill.manifest.compatibility}`, 'info');
    }

    if (skill.manifest['allowed-tools']) {
      context.onOutput(`Allowed Tools: ${skill.manifest['allowed-tools']}`, 'info');
    }

    // Read full SKILL.md content
    try {
      const content = await readFile(skill.path, 'utf-8');
      const lines = content.split('\n').slice(0, 30); // First 30 lines
      context.onOutput('\n─── SKILL.md Preview ───', 'info');
      for (const line of lines) {
        context.onOutput(line, 'info');
      }
      if (content.split('\n').length > 30) {
        context.onOutput('... (truncated)', 'info');
      }
    } catch {
      // Ignore read errors
    }

    return { success: true, data: skill };
  };

  /**
   * Handler for /skill validate command.
   * Validates a skill directory or SKILL.md file.
   */
  export const skillValidateHandler: CommandHandler = async (args, context): Promise<CommandResult> => {
    const skillPath = args.trim();

    if (!skillPath) {
      context.onOutput('Usage: /skill validate <path-to-SKILL.md>', 'info');
      return { success: false, message: 'Path required' };
    }

    context.onOutput(`\nValidating: ${skillPath}`, 'info');
    context.onOutput('─────────────────────────', 'info');

    try {
      const content = await readFile(skillPath, 'utf-8');

      // Extract directory name for validation
      const dirMatch = skillPath.match(/([^/\\]+)[/\\]SKILL\.md$/);
      const dirName = dirMatch ? dirMatch[1] : 'unknown';

      const result = parseSkillMd(content, dirName);

      if (!result.success) {
        context.onOutput(`\n✗ Validation FAILED`, 'error');
        context.onOutput(`  Error: ${result.error}`, 'error');
        context.onOutput(`  Type: ${result.type}`, 'info');
        return { success: false, message: result.error };
      }

      context.onOutput(`\n✓ Validation PASSED`, 'success');
      context.onOutput(`\nManifest:`, 'info');
      context.onOutput(`  Name: ${result.content.manifest.name}`, 'info');
      context.onOutput(`  Description: ${result.content.manifest.description.slice(0, 60)}...`, 'info');

      if (result.content.manifest.license) {
        context.onOutput(`  License: ${result.content.manifest.license}`, 'info');
      }

      return { success: true, data: result.content };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      context.onOutput(`\n✗ Failed to read file: ${message}`, 'error');
      return { success: false, message };
    }
  };
  ```

### Task 10: Register new commands in command registry
- Description: Add config and skill commands to registry
- Files to modify: `src/cli/commands/index.ts`, `src/cli/constants.ts`
- Implementation details:
  - Add imports for new handlers
  - Add command definitions to COMMANDS array
  - Export new handlers

### Task 11: Update help command with comprehensive documentation
- Description: Expand /help to cover all commands and shortcuts
- Files to modify: `src/cli/commands/help.ts`
- Implementation details:
  ```typescript
  /**
   * Help command handler.
   */

  import type { CommandHandler, CommandResult } from './types.js';

  export const helpHandler: CommandHandler = (_args, context): Promise<CommandResult> => {
    const helpText = `
  ══════════════════════════════════════════════════════════════
                        Agent Framework Help
  ══════════════════════════════════════════════════════════════

  CONFIGURATION
    /config              Show current configuration
    /config init         Interactive setup wizard
    /config show         Display all settings
    /config edit [field] Edit specific configuration field

  SKILLS
    /skill, /skills      List all discovered skills
    /skill list          Show skills by source (bundled/user/project)
    /skill info <name>   Display skill details and SKILL.md preview
    /skill validate <path> Validate a SKILL.md manifest

  SESSION MANAGEMENT
    /save [name]         Save current session
    /sessions            List all saved sessions
    /resume <id>         Resume a saved session
    /continue            Resume the last session
    /purge [count]       Delete old sessions (keep N most recent)

  TELEMETRY
    /telemetry start     Start Aspire Dashboard (Docker required)
    /telemetry stop      Stop Aspire Dashboard
    /telemetry status    Show telemetry status
    /telemetry url       Open dashboard URL

  GENERAL
    /help, ?, help       Show this help message
    /history             Show conversation history
    /clear, clear        Clear screen and history
    /exit, /quit, q      Exit the shell

  SHELL COMMANDS
    !<command>           Execute shell command (e.g., !ls -la)
    !!                   Repeat last shell command

  KEYBOARD SHORTCUTS
    ESC                  Clear current input
    Ctrl+C               Cancel current operation / Exit
    Ctrl+D               Exit the shell
    Up/Down              Navigate command history
    Tab                  Auto-complete (future)

  SPECIAL INPUT
    //path               Send message starting with / (escape)
                         Example: //etc/hosts sends "/etc/hosts"

  TIPS
    • Use --provider <name> to override the default provider
    • Use --model <name> to override the model
    • Use --continue to resume the last session
    • Use -p "<prompt>" for single-prompt mode

  ══════════════════════════════════════════════════════════════
  `.trim();

    context.onOutput(helpText, 'info');
    return Promise.resolve({ success: true });
  };
  ```

### Task 12: Add onPrompt support to CommandContext in InteractiveShell
- Description: Enable interactive prompts for config wizards
- Files to modify: `src/components/InteractiveShell.tsx`, `src/cli/commands/types.ts`
- Implementation details:
  - Add `onPrompt?: (question: string) => Promise<string>` to CommandContext
  - Implement prompt handling in InteractiveShell using React state
  - Queue prompts and resolve them when user submits input

### Task 13: Write unit tests for config commands
- Description: Comprehensive tests for config command handlers
- Files to create: `src/cli/commands/__tests__/config.test.ts`
- Test cases:
  - configShowHandler displays formatted output
  - configInitHandler validates provider selection
  - configEditHandler shows field options when no path provided
  - Error handling for missing config file
  - Mock onPrompt for interactive tests

### Task 14: Write unit tests for skill commands
- Description: Comprehensive tests for skill command handlers
- Files to create: `src/cli/commands/__tests__/skills.test.ts`
- Test cases:
  - skillListHandler shows discovered skills grouped by source
  - skillInfoHandler displays skill details
  - skillValidateHandler validates valid SKILL.md
  - skillValidateHandler reports errors for invalid manifests
  - Error handling for missing skills/files

### Task 15: Write tests for provider wizards
- Description: Test provider setup wizard flows
- Files to create: `src/config/providers/__tests__/wizards.test.ts`
- Test cases:
  - Each provider wizard returns correct config structure
  - API key validation (format checks)
  - Default model selection
  - Error handling for invalid input

### Task 16: Update meow help text in index.tsx
- Description: Ensure CLI --help reflects all available options
- Files to modify: `src/index.tsx`
- Implementation details:
  ```typescript
  const cli = meow(
    `
    Usage
      $ agent [options]
      $ agent -p <prompt> [options]

    Options
      -p, --prompt <text>    Execute single prompt and exit
      --check                Show configuration and connectivity
      --tools                Show tool configuration
      --version              Show version
      --provider <name>      Override provider (openai|anthropic|azure|...)
      --model <name>         Override model name
      --continue             Resume last session
      --verbose              Show detailed execution

    Interactive Commands
      /help                  Show all available commands
      /config init           Interactive configuration setup
      /skill list            Show available skills
      /save [name]           Save current session

    Examples
      $ agent                           # Interactive mode
      $ agent -p "Say hello"            # Single prompt
      $ agent --provider anthropic      # Use specific provider
      $ agent --continue                # Resume last session
  `,
    { /* ... */ }
  );
  ```

### Task 17: Integration testing and validation
- Description: Verify end-to-end functionality
- Implementation details:
  - Test /config init → /config show flow
  - Test /skill list → /skill info flow
  - Test /skill validate with bundled skill
  - Run full validation suite (typecheck, lint, test)
  - Manual testing in interactive shell

## Testing Strategy

### Unit Tests

**Config Commands:**
- `/config show` displays all sections formatted correctly
- `/config init` walks through provider selection and wizard
- `/config edit` shows field list when no argument provided
- Error handling for corrupted config

**Provider Wizards:**
- Each wizard prompts for required fields
- Validation catches invalid API key formats
- Default values applied when user skips optional fields
- Wizard returns correct config structure

**Skill Commands:**
- `/skill list` groups skills by source
- `/skill info` displays manifest fields
- `/skill validate` catches missing required fields
- `/skill validate` catches name mismatch with directory

**Help Command:**
- Displays all command sections
- Includes keyboard shortcuts
- Includes tips section

### Integration Tests
- Save config → show config → verify values match
- Run skill discovery → list skills → info on specific skill
- Validate bundled hello-world skill

### Edge Cases
- Empty config file (use defaults)
- No skills found (display locations)
- Invalid SKILL.md (clear error message)
- Provider wizard cancelled mid-flow
- No prompt handler available (non-interactive mode)

## Acceptance Criteria

- [ ] `/config show` displays formatted current configuration
- [ ] `/config init` provides interactive setup with provider selection
- [ ] `/config edit [field]` allows modifying specific settings
- [ ] Provider wizards implemented for all 7 providers
- [ ] `/skill list` shows discovered skills grouped by source
- [ ] `/skill info <name>` displays skill details and preview
- [ ] `/skill validate <path>` validates SKILL.md manifests
- [ ] `/help` includes comprehensive documentation for all commands
- [ ] Commands registered in command registry
- [ ] CLI --help updated with all options
- [ ] Unit tests with 85%+ coverage
- [ ] TypeScript strict mode passes
- [ ] ESLint passes with no errors

## Validation Commands

```bash
# TypeScript type checking
bun run typecheck

# Linting
bun run lint

# Run all tests
bun run test

# Run config command tests
bun run test -- src/cli/commands/__tests__/config.test.ts

# Run skill command tests
bun run test -- src/cli/commands/__tests__/skills.test.ts

# Run with coverage
bun run test:coverage

# Build
bun run build
```

## Notes

### Session Commands Already Implemented

Feature 34 (Session Management Commands) is already complete from Feature 20. The following commands are functional:
- `/save [name]` - Save current session
- `/sessions` - List saved sessions
- `/resume <id>` - Resume a session
- `/continue` - Resume last session
- `/purge [count]` - Delete old sessions

### Interactive Prompts

The `/config init` and provider wizards require interactive input. The `CommandContext.onPrompt` method needs to be implemented in InteractiveShell to support this. For single-prompt mode (`-p`), these commands should gracefully fail with a message about requiring interactive mode.

### Provider Validation

For MVP, provider wizards validate format only (e.g., API key starts with expected prefix). Real connection validation (making an API call to verify credentials) is deferred to post-MVP to avoid adding provider dependencies to the config layer.

### Config File Locations

- User config: `~/.agent/settings.json` (created by /config init)
- Project config: `./.agent/settings.json` (optional, team-shared)
- Environment variables override both (highest priority)

### Skill Discovery Order

Skills are discovered in order: bundled → user → project. Later sources override earlier ones if names conflict. This allows projects to override bundled skills.

## Execution

This spec can be implemented using: `/sdlc:implement docs/specs/feature-031-035-cli-completeness.md`
