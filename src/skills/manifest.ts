/**
 * Zod schemas for SKILL.md manifest validation.
 * Follows the official Agent Skills specification exactly.
 *
 * @see https://agentskills.io/specification
 */

import { z } from 'zod';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Maximum length for skill name */
export const MAX_SKILL_NAME_LENGTH = 64;

/** Maximum length for skill description */
export const MAX_SKILL_DESCRIPTION_LENGTH = 1024;

/** Maximum length for compatibility field */
export const MAX_COMPATIBILITY_LENGTH = 500;

/**
 * Regex pattern for skill names.
 * - Lowercase alphanumeric and hyphens only
 * - Cannot start or end with hyphen
 * - Cannot have consecutive hyphens
 */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

/**
 * Schema for skill name field.
 * - 1-64 characters
 * - Lowercase alphanumeric + hyphens
 * - No leading/trailing/consecutive hyphens
 * - Must match parent directory name (validated separately)
 */
export const SkillNameSchema = z
  .string()
  .min(1, 'Skill name cannot be empty')
  .max(
    MAX_SKILL_NAME_LENGTH,
    `Skill name cannot exceed ${String(MAX_SKILL_NAME_LENGTH)} characters`
  )
  .regex(
    SKILL_NAME_PATTERN,
    'Skill name must be lowercase alphanumeric with single hyphens (e.g., "my-skill-name")'
  )
  .describe('Skill identifier (1-64 chars, lowercase alphanumeric + hyphens)');

/**
 * Schema for skill description field.
 * - 1-1024 characters
 * - Should explain functionality and use cases
 * - Should include keywords for agent matching
 */
export const SkillDescriptionSchema = z
  .string()
  .min(1, 'Skill description cannot be empty')
  .max(
    MAX_SKILL_DESCRIPTION_LENGTH,
    `Skill description cannot exceed ${String(MAX_SKILL_DESCRIPTION_LENGTH)} characters`
  )
  .describe('What the skill does and when to use it (1-1024 chars)');

/**
 * Schema for compatibility field.
 * - 1-500 characters if provided
 * - Describes environment requirements
 */
export const CompatibilitySchema = z
  .string()
  .min(1, 'Compatibility cannot be empty if provided')
  .max(
    MAX_COMPATIBILITY_LENGTH,
    `Compatibility cannot exceed ${String(MAX_COMPATIBILITY_LENGTH)} characters`
  )
  .optional()
  .describe('Environment requirements (1-500 chars)');

/**
 * Schema for metadata field.
 * - Arbitrary key-value string mapping
 * - Use reasonably unique keys to prevent conflicts
 */
export const MetadataSchema = z
  .record(z.string(), z.string())
  .optional()
  .describe('Arbitrary key-value mapping for extensions');

/**
 * Schema for allowed-tools field.
 * - Space-delimited list of tool patterns
 * - Experimental feature
 * - Format: "Bash(git:*) Bash(jq:*) Read"
 */
export const AllowedToolsSchema = z
  .string()
  .optional()
  .describe('Space-delimited tool patterns (experimental)');

/**
 * Complete SKILL.md manifest schema.
 * Validates all frontmatter fields per Agent Skills spec.
 * Uses .strict() to reject unknown fields for spec compliance.
 */
export const SkillManifestSchema = z
  .object({
    // Required fields
    name: SkillNameSchema,
    description: SkillDescriptionSchema,

    // Optional fields
    license: z.string().optional().describe('License name or file reference'),
    compatibility: CompatibilitySchema,
    metadata: MetadataSchema,
    'allowed-tools': AllowedToolsSchema,
  })
  .strict();

/**
 * Inferred type from schema.
 */
export type SkillManifestRaw = z.infer<typeof SkillManifestSchema>;

// -----------------------------------------------------------------------------
// Validation Functions
// -----------------------------------------------------------------------------

/**
 * Validate a skill manifest object.
 * Returns validation result with detailed error messages.
 *
 * @param data - Raw manifest data (parsed YAML)
 * @returns Zod safe parse result
 */
export function validateManifest(data: unknown): z.ZodSafeParseResult<SkillManifestRaw> {
  return SkillManifestSchema.safeParse(data);
}

/**
 * Validate that skill name matches directory name.
 *
 * @param skillName - Name from manifest
 * @param directoryName - Name of parent directory
 * @returns Error message if mismatch, undefined if valid
 */
export function validateNameMatchesDirectory(
  skillName: string,
  directoryName: string
): string | undefined {
  if (skillName !== directoryName) {
    return `Skill name "${skillName}" does not match directory name "${directoryName}"`;
  }
  return undefined;
}

/**
 * Format Zod validation errors into readable messages.
 *
 * @param error - Zod error object
 * @returns Array of formatted error messages
 */
export function formatValidationErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return `${path}${issue.message}`;
  });
}
