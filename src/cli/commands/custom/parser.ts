/**
 * YAML frontmatter parser for custom command markdown files.
 * Parses optional YAML front matter and extracts command body.
 */

import { parse as parseYaml, YAMLParseError } from 'yaml';
import { CustomCommandManifestSchema } from './types.js';
import type { CustomCommandManifest, CustomCommandContent } from './types.js';

/**
 * Result of parsing a custom command markdown file.
 */
export type ParseResult =
  | { success: true; content: CustomCommandContent }
  | { success: false; error: string; type: 'PARSE_ERROR' | 'VALIDATION_ERROR' };

/**
 * Parse custom command markdown content into manifest and body.
 * Front matter is optional - commands work without it.
 *
 * @param content - Raw markdown file content
 * @param fileName - File name for deriving command name (without .md extension)
 * @returns Parse result with content or error
 */
export function parseCustomCommandMd(content: string, fileName: string): ParseResult {
  const trimmed = content.trim();

  // Derive command name from filename (lowercase, without .md)
  const commandName = fileName.toLowerCase().replace(/\.md$/i, '');

  // Check for YAML frontmatter opening delimiter
  if (!trimmed.startsWith('---')) {
    // No front matter - use defaults
    return {
      success: true,
      content: {
        manifest: {
          name: commandName,
        },
        body: trimmed,
      },
    };
  }

  // Find closing delimiter
  const afterOpening = trimmed.substring(3);
  const closingMatch = afterOpening.match(/\r?\n---(?:\r?\n|$)/);

  if (!closingMatch || closingMatch.index === undefined) {
    // Has opening but no closing - treat as malformed, use whole content as body
    return {
      success: false,
      error: 'Front matter is not properly closed with ---',
      type: 'PARSE_ERROR',
    };
  }

  // Extract frontmatter and body
  const frontmatterContent = afterOpening.substring(0, closingMatch.index);
  const body = afterOpening.substring(closingMatch.index + closingMatch[0].length).trim();

  // Handle empty front matter (just ---)
  if (frontmatterContent.trim() === '') {
    return {
      success: true,
      content: {
        manifest: {
          name: commandName,
        },
        body,
      },
    };
  }

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

  // Handle null/undefined YAML (empty content between ---)
  if (yamlData === null || yamlData === undefined) {
    return {
      success: true,
      content: {
        manifest: {
          name: commandName,
        },
        body,
      },
    };
  }

  // Validate against schema (lenient - allows unknown fields)
  const validation = CustomCommandManifestSchema.safeParse(yamlData);
  if (!validation.success) {
    const errors = validation.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    );
    return {
      success: false,
      error: `Manifest validation failed: ${errors.join('; ')}`,
      type: 'VALIDATION_ERROR',
    };
  }

  const rawManifest = validation.data;

  // Transform to typed interface
  const manifest: CustomCommandManifest = {
    name: rawManifest.name ?? commandName,
    description: rawManifest.description,
    argumentHint: rawManifest['argument-hint'] ?? rawManifest.args,
    allowedTools: rawManifest['allowed-tools'],
    model: rawManifest.model,
    raw: rawManifest,
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
 * Check if content has YAML front matter (quick check).
 *
 * @param content - File content
 * @returns True if content starts with front matter delimiters
 */
export function hasYamlFrontmatter(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith('---') && /\r?\n---(?:\r?\n|$)/.test(trimmed.substring(3));
}
