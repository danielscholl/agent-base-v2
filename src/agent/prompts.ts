/**
 * System prompt loading and composition utilities.
 *
 * ## Overview
 *
 * The prompt system uses a compositional architecture that assembles prompts from:
 * 1. **Base prompt**: Core agent instructions (model-agnostic)
 * 2. **Provider layer**: Optional provider-specific guidance
 * 3. **Environment section**: Runtime context (working dir, git status, etc.)
 * 4. **AGENTS.md**: Project-specific agent instructions (https://agents.md/)
 * 5. **Skills section** (optional): Progressive skill disclosure XML, added via
 *    `loadSystemPromptWithSkills()` rather than `assembleSystemPrompt()` directly
 * 6. **User override**: Custom instructions from config or user files
 *
 * ## Backward Compatibility
 *
 * The legacy `loadSystemPrompt()` function is maintained for backward compatibility.
 * New code should prefer `assembleSystemPrompt()` for full composition features.
 *
 * ## Placeholder Substitution
 *
 * Prompts support `{{NAME}}` placeholder syntax:
 *
 * | Placeholder | Description | Example Value |
 * |-------------|-------------|---------------|
 * | `{{MODEL}}` | Current model name | `gpt-4o` |
 * | `{{PROVIDER}}` | Current provider | `openai` |
 * | `{{DATA_DIR}}` | Data directory path | `~/.agent-data` |
 * | `{{MEMORY_ENABLED}}` | Memory status | `enabled` or `disabled` |
 * | `{{WORKING_DIR}}` | Working directory | `/Users/dev/project` |
 * | `{{GIT_STATUS}}` | Git repo status | `Yes (branch: main, clean)` |
 * | `{{PLATFORM}}` | Platform name | `macOS` |
 * | `{{OS_VERSION}}` | OS version | `Darwin 24.1.0` |
 * | `{{DATE}}` | Current date | `2025-12-24` |
 *
 * @module agent/prompts
 *
 * @example Compositional Assembly
 * ```typescript
 * import { assembleSystemPrompt } from './prompts.js';
 *
 * const prompt = await assembleSystemPrompt({
 *   config,
 *   model: 'claude-3-opus',
 *   provider: 'anthropic',
 *   includeEnvironment: true,
 *   includeProviderLayer: true,
 * });
 * ```
 *
 * @example Legacy Usage (backward compatible)
 * ```typescript
 * import { loadSystemPrompt } from './prompts.js';
 *
 * const prompt = await loadSystemPrompt({
 *   config,
 *   model: 'gpt-4o',
 *   provider: 'openai',
 * });
 * ```
 */

import { readFile, access, constants } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import type { AppConfig } from '../config/schema.js';
import {
  createSkillLoader,
  createSkillContextProvider,
  type DiscoveredSkill,
  type SkillLoaderOptions,
} from '../skills/index.js';
import {
  detectEnvironment,
  formatEnvironmentSection,
  type EnvironmentContext,
} from './environment.js';
import { getWorkspaceRoot } from '../tools/workspace.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for loading system prompt.
 */
export interface PromptOptions {
  /** Application configuration */
  config: AppConfig;
  /** Current model name (for {{MODEL}} placeholder) */
  model: string;
  /** Current provider name (for {{PROVIDER}} placeholder) */
  provider: string;
  /** Debug callback for logging */
  onDebug?: (message: string, data?: Record<string, unknown>) => void;
}

/**
 * Extended options for compositional prompt assembly.
 */
export interface PromptAssemblyOptions extends PromptOptions {
  /** Include environment context section (default: true) */
  includeEnvironment?: boolean;
  /** Include provider-specific layer (default: true) */
  includeProviderLayer?: boolean;
  /** Include AGENTS.md content if found (default: true) */
  includeAgentsMd?: boolean;
  /** Provider mode for mode-specific prompts (e.g., 'local', 'cloud') */
  providerMode?: string;
  /** Working directory for environment context (default: process.cwd()) */
  workingDir?: string;
  /** User override content (appended at end) */
  userOverride?: string;
  /** Debug callback for logging */
  onDebug?: (message: string, data?: Record<string, unknown>) => void;
}

/**
 * Extended options for loading system prompt with skills.
 */
export interface PromptOptionsWithSkills extends PromptAssemblyOptions {
  /** Include discovered skills in system prompt */
  includeSkills?: boolean;
  /** Skills loader options */
  skillLoaderOptions?: SkillLoaderOptions;
}

/**
 * Placeholder values for prompt replacement.
 */
export interface PlaceholderValues {
  /** Model name */
  MODEL: string;
  /** Provider name */
  PROVIDER: string;
  /** Data directory path */
  DATA_DIR: string;
  /** Session directory path */
  SESSION_DIR?: string;
  /** Whether memory is enabled */
  MEMORY_ENABLED: string;
  /** Working directory */
  WORKING_DIR?: string;
  /** Git status string */
  GIT_STATUS?: string;
  /** Platform name */
  PLATFORM?: string;
  /** OS version */
  OS_VERSION?: string;
  /** Current date */
  DATE?: string;
  /** Additional custom placeholders */
  [key: string]: string | undefined;
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Check if a file exists and is readable.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the prompts directory path.
 * Handles source, bundled dist, and compiled binary execution.
 *
 * Resolution order:
 * 1. Compiled binary: Assets next to process.execPath (~/.agent/bin/prompts/)
 * 2. Bundled dist: dist/prompts/ (same dir as index.js)
 * 3. Source dev: src/prompts/ (sibling to agent/)
 */
function getPromptsDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const moduleDir = dirname(currentFile);

  // For compiled binaries, assets are packaged next to the executable
  // Check if prompts exist relative to process.execPath first
  const execDir = dirname(process.execPath);
  const compiledPromptsDir = join(execDir, 'prompts');

  // In bundled dist, prompts are at dist/prompts/ (same dir as index.js)
  // In source, prompts are at src/prompts/ (sibling to agent/)
  const isBundled = basename(moduleDir) === 'dist';
  const baseDir = isBundled ? moduleDir : join(moduleDir, '..');
  const standardPromptsDir = join(baseDir, 'prompts');

  // Prefer compiled binary location if the standard location doesn't exist
  // This handles the case where we're running as a standalone compiled binary
  if (!existsSync(standardPromptsDir) && existsSync(compiledPromptsDir)) {
    return compiledPromptsDir;
  }

  return standardPromptsDir;
}

/**
 * Get the user's default system prompt path.
 * Located at ~/.agent/system.md
 */
function getUserPromptPath(): string {
  return join(homedir(), '.agent', 'system.md');
}

/**
 * Get the inline default prompt.
 * Used as ultimate fallback if no file is found.
 */
function getDefaultPrompt(): string {
  return `You are a helpful AI assistant.

Model: {{MODEL}}
Provider: {{PROVIDER}}

You have access to various tools to help accomplish tasks. Use them when appropriate.

Guidelines:
- Be concise and direct in responses
- Use tools when they can help answer questions
- Explain your reasoning when helpful
- Ask for clarification if a request is ambiguous`;
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Strip YAML front matter from markdown content.
 * Front matter is delimited by --- on its own line at start of file.
 *
 * @param content - Markdown content with optional YAML front matter
 * @returns Content with front matter removed
 */
export function stripYamlFrontMatter(content: string): string {
  const trimmed = content.trimStart();

  // Check for YAML front matter opening delimiter
  if (!trimmed.startsWith('---')) {
    return content;
  }

  // Ensure opening delimiter is on its own line
  const afterOpening = trimmed.substring(3);
  if (afterOpening.length > 0 && afterOpening[0] !== '\n' && afterOpening[0] !== '\r') {
    return content;
  }

  // Find the closing delimiter on its own line
  const closingMatch = afterOpening.match(/\r?\n---(?:\r?\n|$)/);
  if (!closingMatch || closingMatch.index === undefined) {
    return content;
  }

  // Skip past the closing delimiter
  const endIndex = closingMatch.index + closingMatch[0].length;
  const afterFrontMatter = afterOpening.substring(endIndex).trimStart();
  return afterFrontMatter;
}

/**
 * Replace placeholders in prompt content.
 * Placeholders use {{NAME}} format.
 *
 * @param content - Prompt content with placeholders
 * @param values - Values to substitute
 * @returns Content with placeholders replaced
 */
export function replacePlaceholders(content: string, values: PlaceholderValues): string {
  let result = content;

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      const placeholder = `{{${key}}}`;
      result = result.split(placeholder).join(value);
    }
  }

  return result;
}

// =============================================================================
// Compositional Prompt Loading
// =============================================================================

/**
 * Load the base prompt using three-tier fallback:
 * 1. config.agent.systemPromptFile (explicit override)
 * 2. ~/.agent/system.md (user's default)
 * 3. Package default (src/prompts/base.md)
 *
 * @param options - Prompt options
 * @returns Base prompt content with placeholders replaced
 */
export async function loadBasePrompt(options: PromptOptions): Promise<string> {
  const { config, model, provider, onDebug } = options;
  const promptsDir = getPromptsDir();

  let promptContent: string | null = null;

  // Tier 1: Explicit config override (config.agent.systemPromptFile)
  if (config.agent.systemPromptFile !== undefined && config.agent.systemPromptFile !== '') {
    const configPath = config.agent.systemPromptFile;
    if (await fileExists(configPath)) {
      promptContent = await readFile(configPath, 'utf-8');
    } else {
      onDebug?.(
        `Configured system prompt file not found at path "${configPath}". Falling back to default prompts.`,
        { configPath, fallbackTier: 'user-default' }
      );
    }
  }

  // Tier 2: User's default (~/.agent/system.md)
  if (promptContent === null) {
    const userPath = getUserPromptPath();
    if (await fileExists(userPath)) {
      promptContent = await readFile(userPath, 'utf-8');
    }
  }

  // Tier 3: Package default (base.md)
  if (promptContent === null) {
    const basePath = join(promptsDir, 'base.md');
    if (await fileExists(basePath)) {
      promptContent = await readFile(basePath, 'utf-8');
    }
  }

  // Ultimate fallback to inline default
  if (promptContent === null) {
    promptContent = getDefaultPrompt();
  }

  // Strip YAML front matter
  const stripped = stripYamlFrontMatter(promptContent);

  // Build placeholder values
  const values: PlaceholderValues = {
    MODEL: model,
    PROVIDER: provider,
    DATA_DIR: config.agent.dataDir,
    MEMORY_ENABLED: config.memory.enabled ? 'enabled' : 'disabled',
  };

  return replacePlaceholders(stripped, values);
}

/**
 * Load provider-specific layer if it exists.
 * Returns empty string if no layer exists for the provider.
 *
 * Supports mode-specific files (e.g., foundry.local.md, foundry.cloud.md).
 * Falls back to generic provider file (e.g., foundry.md) if mode-specific doesn't exist.
 *
 * @param provider - Provider name (e.g., 'anthropic', 'openai', 'foundry')
 * @param mode - Optional mode (e.g., 'local', 'cloud') for mode-specific files
 * @returns Provider layer content, or empty string
 */
export async function loadProviderLayer(provider: string, mode?: string): Promise<string> {
  const promptsDir = getPromptsDir();

  // Try mode-specific file first (e.g., foundry.local.md)
  if (mode !== undefined && mode !== '') {
    const modeSpecificPath = join(promptsDir, 'providers', `${provider}.${mode}.md`);
    if (await fileExists(modeSpecificPath)) {
      const content = await readFile(modeSpecificPath, 'utf-8');
      return stripYamlFrontMatter(content);
    }
  }

  // Fall back to generic provider file (e.g., foundry.md)
  const providerPath = join(promptsDir, 'providers', `${provider}.md`);
  if (!(await fileExists(providerPath))) {
    return '';
  }

  const content = await readFile(providerPath, 'utf-8');
  return stripYamlFrontMatter(content);
}

/**
 * Load AGENTS.md from workspace root following spec precedence rules.
 *
 * AGENTS.md (https://agents.md/) is a standardized way for repositories to provide
 * context and instructions to AI coding agents. It complements README.md by containing
 * agent-specific guidance like build steps, tests, and conventions.
 *
 * Discovery order:
 * 1. {workspaceRoot}/AGENTS.md (workspace root)
 * 2. {workspaceRoot}/.agent/AGENTS.md (workspace config directory)
 *
 * **Always uses workspace root** from AGENT_WORKSPACE_ROOT env var, falling back to
 * process.cwd() if not set. The workingDir parameter is ignored for AGENTS.md discovery
 * since AGENTS.md should always be at the workspace root, not relative to the current
 * working directory. This ensures AGENTS.md is found even when the agent is invoked
 * from a subdirectory.
 *
 * Note: For config.agent.workspaceRoot to take effect, initializeWorkspaceRoot() must
 * be called at agent startup (which sets AGENT_WORKSPACE_ROOT env var).
 *
 * @param _workingDir - Ignored. AGENTS.md always loads from workspace root.
 * @param onDebug - Optional debug callback
 * @returns AGENTS.md content or empty string if not found
 */
export async function loadAgentsMd(
  _workingDir?: string,
  onDebug?: (message: string, data?: Record<string, unknown>) => void
): Promise<string> {
  // Always use workspace root for AGENTS.md, regardless of workingDir
  const dir = getWorkspaceRoot();

  // Try project root first (./AGENTS.md)
  const projectRootPath = join(dir, 'AGENTS.md');
  if (await fileExists(projectRootPath)) {
    try {
      const content = await readFile(projectRootPath, 'utf-8');
      onDebug?.('Loaded AGENTS.md from project root', { path: projectRootPath });
      return stripYamlFrontMatter(content);
    } catch {
      onDebug?.('Failed to read AGENTS.md from project root', { path: projectRootPath });
    }
  }

  // Try project config directory (./.agent/AGENTS.md)
  const configDirPath = join(dir, '.agent', 'AGENTS.md');
  if (await fileExists(configDirPath)) {
    try {
      const content = await readFile(configDirPath, 'utf-8');
      onDebug?.('Loaded AGENTS.md from .agent directory', { path: configDirPath });
      return stripYamlFrontMatter(content);
    } catch {
      onDebug?.('Failed to read AGENTS.md from .agent directory', { path: configDirPath });
    }
  }

  // No AGENTS.md found - this is fine, not all projects have one
  return '';
}

/**
 * Generate environment section with runtime context.
 *
 * @param workingDir - Working directory (default: process.cwd())
 * @param onDebug - Optional debug callback for diagnostic logging
 * @returns Markdown-formatted environment section
 */
export async function generateEnvironmentSectionForPrompt(
  workingDir?: string,
  onDebug?: (message: string, data?: unknown) => void
): Promise<{ section: string; context: EnvironmentContext }> {
  const context = await detectEnvironment(workingDir, onDebug);
  const section = formatEnvironmentSection(context);
  return { section, context };
}

/**
 * Build placeholder values including environment context.
 *
 * Internal helper exported primarily for testing and tooling.
 *
 * @internal
 */
function buildPlaceholderValues(
  config: AppConfig,
  model: string,
  provider: string,
  envContext?: EnvironmentContext
): PlaceholderValues {
  const values: PlaceholderValues = {
    MODEL: model,
    PROVIDER: provider,
    DATA_DIR: config.agent.dataDir,
    MEMORY_ENABLED: config.memory.enabled ? 'enabled' : 'disabled',
  };

  if (envContext) {
    values.WORKING_DIR = envContext.workingDir;
    values.PLATFORM = envContext.platform;
    values.OS_VERSION = envContext.osVersion;
    values.DATE = envContext.date;

    // Format git status
    if (envContext.gitRepo) {
      const branch = envContext.gitBranch ?? 'unknown';
      const clean =
        envContext.gitClean === true ? 'clean' : envContext.gitClean === false ? 'dirty' : '';
      values.GIT_STATUS = clean ? `Yes (branch: ${branch}, ${clean})` : `Yes (branch: ${branch})`;
    } else {
      values.GIT_STATUS = 'No';
    }
  }

  return values;
}

/**
 * Assemble a complete system prompt from all layers.
 *
 * Assembly order:
 * 1. Base prompt (core instructions)
 * 2. Provider layer (if exists and enabled)
 * 3. Environment section (if enabled)
 * 4. AGENTS.md content (if exists and enabled)
 * 5. User override (if provided)
 *
 * Note: Skills are added separately via loadSystemPromptWithSkills()
 *
 * @param options - Assembly options
 * @returns Assembled system prompt
 *
 * @example
 * ```typescript
 * const prompt = await assembleSystemPrompt({
 *   config,
 *   model: 'claude-3-opus',
 *   provider: 'anthropic',
 *   includeEnvironment: true,
 *   includeProviderLayer: true,
 *   includeAgentsMd: true,
 * });
 * ```
 */
export async function assembleSystemPrompt(options: PromptAssemblyOptions): Promise<string> {
  const {
    config,
    model,
    provider,
    includeEnvironment = true,
    includeProviderLayer = true,
    includeAgentsMd = true,
    providerMode,
    workingDir,
    userOverride,
    onDebug,
  } = options;

  const sections: string[] = [];

  // 1. Load base prompt
  const basePrompt = await loadBasePrompt({ config, model, provider, onDebug });
  sections.push(basePrompt);
  onDebug?.('Loaded base prompt', { length: basePrompt.length });

  // 2. Load provider layer (if enabled and exists)
  if (includeProviderLayer) {
    const providerLayer = await loadProviderLayer(provider, providerMode);
    if (providerLayer) {
      sections.push(providerLayer);
      onDebug?.('Loaded provider layer', {
        provider,
        mode: providerMode,
        length: providerLayer.length,
      });
    } else {
      onDebug?.('No provider layer found', { provider, mode: providerMode });
    }
  }

  // 3. Generate environment section (if enabled)
  if (includeEnvironment) {
    const { section: envSection, context: envContext } = await generateEnvironmentSectionForPrompt(
      workingDir,
      onDebug as ((message: string, data?: unknown) => void) | undefined
    );
    sections.push(envSection);
    onDebug?.('Generated environment section', {
      workingDir: envContext.workingDir,
      gitRepo: envContext.gitRepo,
      gitBranch: envContext.gitBranch,
    });
  }

  // 4. Load AGENTS.md (if enabled and exists)
  // Content is inserted as-is to preserve original structure and headers
  if (includeAgentsMd) {
    const agentsMdContent = await loadAgentsMd(workingDir, onDebug);
    if (agentsMdContent) {
      sections.push(agentsMdContent);
      onDebug?.('Loaded AGENTS.md', { length: agentsMdContent.length });
    }
  }

  // 5. Add user override (if provided)
  if (userOverride !== undefined && userOverride !== '') {
    const userSection = `# User Instructions\n\n${userOverride}`;
    sections.push(userSection);
    onDebug?.('Added user override', { length: userOverride.length });
  }

  // Join sections with double newlines
  return sections.join('\n\n');
}

// =============================================================================
// Legacy Functions (Backward Compatible)
// =============================================================================

/**
 * Load system prompt with three-tier fallback.
 *
 * This is the legacy function maintained for backward compatibility.
 * New code should prefer `assembleSystemPrompt()` for full composition features.
 *
 * Priority order:
 * 1. config.agent.systemPromptFile (explicit override)
 * 2. ~/.agent/system.md (user's default)
 * 3. Package default (src/prompts/base.md)
 *
 * @param options - Prompt options including config, model, and provider
 * @returns Processed system prompt string
 */
export async function loadSystemPrompt(options: PromptOptions): Promise<string> {
  const { config, model, provider, onDebug } = options;

  let promptContent: string | null = null;

  // Tier 1: Explicit config override
  if (config.agent.systemPromptFile !== undefined && config.agent.systemPromptFile !== '') {
    const configPath = config.agent.systemPromptFile;
    if (await fileExists(configPath)) {
      promptContent = await readFile(configPath, 'utf-8');
    } else {
      onDebug?.(
        `Configured system prompt file not found at path "${configPath}". Falling back to default prompts.`,
        { configPath, fallbackTier: 'user-default' }
      );
    }
  }

  // Tier 2: User's default (~/.agent/system.md)
  if (promptContent === null) {
    const userPath = getUserPromptPath();
    if (await fileExists(userPath)) {
      promptContent = await readFile(userPath, 'utf-8');
    }
  }

  // Tier 3: Package default (base.md)
  if (promptContent === null) {
    const promptsDir = getPromptsDir();
    const basePath = join(promptsDir, 'base.md');
    if (await fileExists(basePath)) {
      promptContent = await readFile(basePath, 'utf-8');
    }
  }

  // Ultimate fallback to inline default
  if (promptContent === null) {
    promptContent = getDefaultPrompt();
  }

  // Strip YAML front matter
  const stripped = stripYamlFrontMatter(promptContent);

  // Build placeholder values
  const values: PlaceholderValues = {
    MODEL: model,
    PROVIDER: provider,
    DATA_DIR: config.agent.dataDir,
    MEMORY_ENABLED: config.memory.enabled ? 'enabled' : 'disabled',
  };

  return replacePlaceholders(stripped, values);
}

// =============================================================================
// Skills Integration
// =============================================================================

/**
 * Load skills and generate context for system prompt.
 *
 * Skill loading errors are non-fatal - we continue with whatever
 * skills loaded successfully.
 *
 * @param options - Skill loader options
 * @returns Skills context with XML and discovered skills
 */
export async function loadSkillsContext(
  options?: SkillLoaderOptions
): Promise<{ xml: string; skills: DiscoveredSkill[] }> {
  const loader = createSkillLoader(options);
  const result = await loader.discover();

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      options?.onDebug?.(`Skill load error: ${error.path}: ${error.message}`, { error });
    }
  }

  const provider = createSkillContextProvider(result.skills, {
    onDebug: options?.onDebug,
  });
  const xml = provider.getTier1Context();

  return { xml, skills: result.skills };
}

/**
 * Load system prompt with full composition and skills integration.
 *
 * This is the recommended function for new code. It combines:
 * - Base prompt
 * - Provider layer
 * - Environment section
 * - Skills XML
 *
 * @param options - Prompt options including skills configuration
 * @returns System prompt with skills and list of discovered skills
 *
 * @example
 * ```typescript
 * const { prompt, skills } = await loadSystemPromptWithSkills({
 *   config,
 *   model: 'claude-3-opus',
 *   provider: 'anthropic',
 *   includeSkills: true,
 *   includeEnvironment: true,
 *   includeProviderLayer: true,
 * });
 * ```
 */
export async function loadSystemPromptWithSkills(
  options: PromptOptionsWithSkills
): Promise<{ prompt: string; skills: DiscoveredSkill[] }> {
  const {
    includeSkills = false,
    includeEnvironment = true,
    includeProviderLayer = true,
    skillLoaderOptions,
    ...assemblyOptions
  } = options;

  // Use compositional assembly
  const basePrompt = await assembleSystemPrompt({
    ...assemblyOptions,
    includeEnvironment,
    includeProviderLayer,
  });

  if (!includeSkills) {
    return { prompt: basePrompt, skills: [] };
  }

  // Load and append skills
  const { xml, skills } = await loadSkillsContext(skillLoaderOptions);
  const prompt = xml ? `${basePrompt}\n\n${xml}` : basePrompt;

  return { prompt, skills };
}

// =============================================================================
// Exports for buildPlaceholderValues (internal use)
// =============================================================================

export { buildPlaceholderValues };
