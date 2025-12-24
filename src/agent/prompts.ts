/**
 * System prompt loading and composition utilities.
 *
 * ## Overview
 *
 * The prompt system uses a compositional architecture that assembles prompts from:
 * 1. **Base prompt**: Core agent instructions (model-agnostic)
 * 2. **Provider layer**: Optional provider-specific guidance
 * 3. **Environment section**: Runtime context (working dir, git status, etc.)
 * 4. **Skills section**: Progressive skill disclosure XML
 * 5. **User override**: Custom instructions from config or user files
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
}

/**
 * Extended options for compositional prompt assembly.
 */
export interface PromptAssemblyOptions extends PromptOptions {
  /** Include environment context section (default: true) */
  includeEnvironment?: boolean;
  /** Include provider-specific layer (default: true) */
  includeProviderLayer?: boolean;
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
 * Handles both source and bundled execution.
 */
function getPromptsDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const moduleDir = dirname(currentFile);

  // In bundled dist, prompts are at dist/prompts/ (same dir as index.js)
  // In source, prompts are at src/prompts/ (sibling to agent/)
  const isBundled = basename(moduleDir) === 'dist';
  const baseDir = isBundled ? moduleDir : join(moduleDir, '..');

  return join(baseDir, 'prompts');
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
 * Load the base prompt from src/prompts/base.md.
 * Falls back to legacy system.md then inline default.
 *
 * @param options - Prompt options
 * @returns Base prompt content with placeholders replaced
 */
export async function loadBasePrompt(options: PromptOptions): Promise<string> {
  const { config, model, provider } = options;
  const promptsDir = getPromptsDir();

  let promptContent: string | null = null;

  // Try base.md first (new compositional system)
  const basePath = join(promptsDir, 'base.md');
  if (await fileExists(basePath)) {
    promptContent = await readFile(basePath, 'utf-8');
  }

  // Fall back to legacy system.md
  if (promptContent === null) {
    const legacyPath = join(promptsDir, 'system.md');
    if (await fileExists(legacyPath)) {
      promptContent = await readFile(legacyPath, 'utf-8');
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
 * @param provider - Provider name (e.g., 'anthropic', 'openai')
 * @returns Provider layer content, or empty string
 */
export async function loadProviderLayer(provider: string): Promise<string> {
  const promptsDir = getPromptsDir();
  const providerPath = join(promptsDir, 'providers', `${provider}.md`);

  if (!(await fileExists(providerPath))) {
    return '';
  }

  const content = await readFile(providerPath, 'utf-8');
  return stripYamlFrontMatter(content);
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
 * 4. User override (if provided)
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
    workingDir,
    userOverride,
    onDebug,
  } = options;

  const sections: string[] = [];

  // 1. Load base prompt
  const basePrompt = await loadBasePrompt({ config, model, provider });
  sections.push(basePrompt);
  onDebug?.('Loaded base prompt', { length: basePrompt.length });

  // 2. Load provider layer (if enabled and exists)
  if (includeProviderLayer) {
    const providerLayer = await loadProviderLayer(provider);
    if (providerLayer) {
      sections.push(providerLayer);
      onDebug?.('Loaded provider layer', { provider, length: providerLayer.length });
    } else {
      onDebug?.('No provider layer found', { provider });
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

  // 4. Add user override (if provided)
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
 * 3. Package default (src/prompts/base.md or src/prompts/system.md)
 *
 * @param options - Prompt options including config, model, and provider
 * @returns Processed system prompt string
 */
export async function loadSystemPrompt(options: PromptOptions): Promise<string> {
  const { config, model, provider } = options;

  let promptContent: string | null = null;

  // Tier 1: Explicit config override
  if (config.agent.systemPromptFile !== undefined && config.agent.systemPromptFile !== '') {
    const configPath = config.agent.systemPromptFile;
    if (await fileExists(configPath)) {
      promptContent = await readFile(configPath, 'utf-8');
    }
  }

  // Tier 2: User's default (~/.agent/system.md)
  if (promptContent === null) {
    const userPath = getUserPromptPath();
    if (await fileExists(userPath)) {
      promptContent = await readFile(userPath, 'utf-8');
    }
  }

  // Tier 3: Package default (try base.md first, then system.md)
  if (promptContent === null) {
    const promptsDir = getPromptsDir();

    // Try base.md first
    const basePath = join(promptsDir, 'base.md');
    if (await fileExists(basePath)) {
      promptContent = await readFile(basePath, 'utf-8');
    }

    // Fall back to legacy system.md
    if (promptContent === null) {
      const legacyPath = join(promptsDir, 'system.md');
      if (await fileExists(legacyPath)) {
        promptContent = await readFile(legacyPath, 'utf-8');
      }
    }

    // Ultimate fallback
    if (promptContent === null) {
      promptContent = getDefaultPrompt();
    }
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
