/**
 * YAML frontmatter parser for SKILL.md files.
 * Extracts frontmatter and body content from markdown files.
 */

import { parse as parseYaml, YAMLParseError } from 'yaml';
import type { SkillManifest, SkillContent } from './types.js';
import {
  validateManifest,
  formatValidationErrors,
  validateNameMatchesDirectory,
} from './manifest.js';

/**
 * Result of parsing a SKILL.md file.
 */
export type ParseResult =
  | { success: true; content: SkillContent }
  | { success: false; error: string; type: 'PARSE_ERROR' | 'VALIDATION_ERROR' };

/**
 * Parse SKILL.md content into manifest and body.
 * Validates frontmatter against the Agent Skills spec.
 *
 * @param content - Raw SKILL.md file content
 * @param directoryName - Parent directory name for name validation
 * @returns Parse result with content or error
 */
export function parseSkillMd(content: string, directoryName: string): ParseResult {
  const trimmed = content.trim();

  // Check for YAML frontmatter opening delimiter
  if (!trimmed.startsWith('---')) {
    return {
      success: false,
      error: 'SKILL.md must start with YAML frontmatter (---)',
      type: 'PARSE_ERROR',
    };
  }

  // Find closing delimiter
  const afterOpening = trimmed.substring(3);
  const closingMatch = afterOpening.match(/\r?\n---(?:\r?\n|$)/);

  if (!closingMatch || closingMatch.index === undefined) {
    return {
      success: false,
      error: 'SKILL.md frontmatter is not properly closed with ---',
      type: 'PARSE_ERROR',
    };
  }

  // Extract frontmatter and body
  const frontmatterContent = afterOpening.substring(0, closingMatch.index);
  const body = afterOpening.substring(closingMatch.index + closingMatch[0].length).trim();

  // Parse YAML
  let yamlData: unknown;
  try {
    yamlData = parseYaml(frontmatterContent);
  } catch (e) {
    const message = e instanceof YAMLParseError ? e.message : 'Invalid YAML syntax';
    return {
      success: false,
      error: `YAML parse error: ${message}`,
      type: 'PARSE_ERROR',
    };
  }

  // Validate against schema
  const validation = validateManifest(yamlData);
  if (!validation.success) {
    const errors = formatValidationErrors(validation.error);
    return {
      success: false,
      error: `Manifest validation failed: ${errors.join('; ')}`,
      type: 'VALIDATION_ERROR',
    };
  }

  const rawManifest = validation.data;

  // Validate name matches directory
  const nameError = validateNameMatchesDirectory(rawManifest.name, directoryName);
  if (nameError !== undefined) {
    return {
      success: false,
      error: nameError,
      type: 'VALIDATION_ERROR',
    };
  }

  // Transform raw manifest to typed interface
  // (handles allowed-tools -> allowedTools conversion)
  const manifest: SkillManifest = {
    name: rawManifest.name,
    description: rawManifest.description,
    license: rawManifest.license,
    compatibility: rawManifest.compatibility,
    metadata: rawManifest.metadata,
    allowedTools: rawManifest['allowed-tools'],
  };

  return {
    success: true,
    content: {
      manifest,
      body,
    },
  };
}

/**
 * Check if a file looks like a valid SKILL.md (quick check).
 * Doesn't parse or validate, just checks for frontmatter presence.
 *
 * @param content - File content
 * @returns True if content appears to have frontmatter
 */
export function hasYamlFrontmatter(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith('---') && /\r?\n---(?:\r?\n|$)/.test(trimmed.substring(3));
}
