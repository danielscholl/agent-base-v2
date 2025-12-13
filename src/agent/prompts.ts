/**
 * System prompt loading utilities.
 * Implements three-tier fallback and placeholder replacement.
 */

import { readFile, access, constants } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import type { AppConfig } from '../config/schema.js';

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
  /** Additional custom placeholders */
  [key: string]: string | undefined;
}

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
 * Get the path to the package default system prompt.
 * Resolves relative to this module's location.
 * Uses fileURLToPath for cross-platform compatibility (Windows safe).
 */
function getPackagePromptPath(): string {
  // In bundled output, prompts are at src/prompts/system.md
  // Using fileURLToPath for Windows compatibility (handles URL-encoded paths)
  const currentFile = fileURLToPath(import.meta.url);
  const moduleDir = dirname(currentFile);
  return join(moduleDir, '..', 'prompts', 'system.md');
}

/**
 * Get the user's default system prompt path.
 * Located at ~/.agent/system.md
 */
function getUserPromptPath(): string {
  return join(homedir(), '.agent', 'system.md');
}

/**
 * Strip YAML front matter from markdown content.
 * Front matter is delimited by --- on its own line at start of file.
 * The closing --- must also be on its own line (not inside YAML values).
 *
 * @param content - Markdown content with optional YAML front matter
 * @returns Content with front matter removed
 */
export function stripYamlFrontMatter(content: string): string {
  const trimmed = content.trimStart();

  // Check for YAML front matter opening delimiter (--- followed by newline)
  if (!trimmed.startsWith('---')) {
    return content;
  }

  // Ensure opening delimiter is on its own line
  const afterOpening = trimmed.substring(3);
  if (afterOpening.length > 0 && afterOpening[0] !== '\n' && afterOpening[0] !== '\r') {
    // Not a valid front matter opening (e.g., "---something")
    return content;
  }

  // Find the closing delimiter on its own line
  // Look for newline followed by --- followed by newline or end of string
  const closingMatch = afterOpening.match(/\r?\n---(?:\r?\n|$)/);
  if (!closingMatch || closingMatch.index === undefined) {
    // No closing delimiter on its own line, return original
    return content;
  }

  // Skip past the closing delimiter and any following whitespace
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
      // Replace all instances of {{KEY}}
      const placeholder = `{{${key}}}`;
      result = result.split(placeholder).join(value);
    }
  }

  return result;
}

/**
 * Load system prompt with three-tier fallback.
 *
 * Priority order:
 * 1. config.agent.systemPromptFile (explicit env override)
 * 2. ~/.agent/system.md (user's default)
 * 3. Package default (src/prompts/system.md)
 *
 * Strips YAML front matter and replaces placeholders.
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

  // Tier 3: Package default
  if (promptContent === null) {
    const packagePath = getPackagePromptPath();
    if (await fileExists(packagePath)) {
      promptContent = await readFile(packagePath, 'utf-8');
    } else {
      // Fallback to inline default if file not found
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

  // Replace placeholders
  const processed = replacePlaceholders(stripped, values);

  return processed;
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
