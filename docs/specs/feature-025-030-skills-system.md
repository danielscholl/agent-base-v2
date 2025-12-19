# Feature 25-30: Phase 4 Skills System (Spec-Compliant)

## Feature Description

Implement a complete Agent Skills system following the official [agentskills.io](https://agentskills.io) specification. This phase includes:

- **Feature 25**: SKILL.md Manifest Schema with Spec-Compliant Zod Validation
- **Feature 26**: Skill Discovery and Loader
- **Feature 27**: Skill Prompt Generation (`<available_skills>` XML)
- **Feature 28**: Progressive Disclosure (3-Tier Spec Model)
- **Feature 30**: Bundled hello-world Skill (Spec-Compliant Example)

Skills are portable across Claude Code, Claude.ai, and any spec-compliant agent. The implementation uses LLM-driven activation based on description matching rather than custom trigger systems.

## User Story

As a developer using the agent framework,
I want to extend agent capabilities through a standard skills format,
So that I can share, reuse, and compose domain expertise across different AI agent platforms without vendor lock-in.

## Problem Statement

Currently, the agent framework has no extensibility mechanism beyond built-in tools. Developers cannot:
- Add domain-specific capabilities (e.g., PDF handling, API integrations)
- Share reusable agent configurations across projects
- Use skills from the broader Agent Skills ecosystem

This limits the framework to general-purpose use cases and creates friction for specialized workflows.

## Solution Statement

Implement the official Agent Skills specification with:

1. **Zod-validated manifest parsing** - Parse SKILL.md YAML frontmatter with strict validation
2. **Multi-directory discovery** - Scan bundled, user, and project skill directories
3. **XML prompt injection** - Generate `<available_skills>` block for system prompts
4. **Progressive disclosure** - 3-tier token-efficient context loading
5. **Reference implementation** - Bundled hello-world skill as documentation and testing

## Related Documentation

### Requirements
- Feature defined in: `docs/plans/typescript-rewrite-features.md` (Features 25-30, lines 176-255)
- Phase: 4 (Skills System)
- Dependencies: Phase 1 (Core), Phases 2-3 (Providers, CLI, Memory)

### Architecture Decisions
- Skills Architecture section in `docs/architecture.md` (lines 489-618)
- CLAUDE.md Skills System section (progressive disclosure principles)

### External Specification
- [Agent Skills Specification](https://agentskills.io/specification)
- [Integration Guide](https://agentskills.io/integrate-skills)

## Codebase Analysis Findings

### Architecture Patterns

**Zod Schema Pattern** (from `src/config/schema.ts`):
```typescript
// Define constants first
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_SKILL_NAME_LENGTH = 64;

// Create schema with validation
export const SkillManifestSchema = z.object({
  name: z.string()
    .min(1)
    .max(MAX_SKILL_NAME_LENGTH)
    .regex(SKILL_NAME_PATTERN)
    .describe('Skill identifier'),
  description: z.string().min(1).max(1024).describe('What skill does'),
});

// Infer type
export type SkillManifest = z.infer<typeof SkillManifestSchema>;
```

**Manager Pattern** (from `src/utils/context.ts`):
```typescript
export interface LoaderOptions {
  bundledDir?: string;
  userDir?: string;
  projectDir?: string;
  onDebug?: (msg: string, data?: unknown) => void;
}

export class SkillLoader {
  private readonly bundledDir: string;
  private readonly userDir: string;
  private readonly onDebug?: (msg: string, data?: unknown) => void;

  constructor(options: LoaderOptions = {}) {
    this.bundledDir = options.bundledDir ?? DEFAULT_BUNDLED_DIR;
    this.userDir = options.userDir ?? DEFAULT_USER_DIR;
    this.onDebug = options.onDebug;
  }

  async discover(): Promise<DiscoveredSkill[]> { /* ... */ }
}
```

**Response Pattern** (from `src/tools/base.ts`):
```typescript
// Skills use simpler result types (not ToolResponse) since they're not tools
interface SkillLoadResult {
  success: true;
  skills: LoadedSkill[];
  errors: SkillError[];
}
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Schema file | `manifest.ts` | `src/skills/manifest.ts` |
| Type file | `types.ts` | `src/skills/types.ts` |
| Loader class | `SkillLoader` | `src/skills/loader.ts` |
| Generator function | `generateAvailableSkillsXML` | `src/skills/prompt.ts` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_SKILL_NAME_LENGTH` |

### Similar Implementations

| Need | Reference File | Pattern |
|------|----------------|---------|
| Zod schema with regex | `src/config/schema.ts` | Validation patterns |
| Directory scanning | N/A | Use `fs.readdir` + recursive |
| YAML parsing | N/A | Add `yaml` package |
| XML generation | N/A | Template literals with escaping |
| System prompt integration | `src/agent/prompts.ts` | Placeholder or append |

### Integration Points

1. **Config** (`src/config/schema.ts`): Already has `SkillsConfigSchema`
2. **Agent** (`src/agent/prompts.ts`): Add skills injection after loading system prompt
3. **CLI** (future Phase 5): Commands for skill management

## Archon Project

Project ID: `71dbbd3c-6e56-4f6a-b83f-307be5a5a6a7`

## Relevant Files

### Existing Files to Modify
- `src/config/constants.ts`: Add skill-related constants
- `src/agent/prompts.ts`: Add skill prompt injection
- `package.json`: Add `yaml` dependency

### New Files to Create
- `src/skills/manifest.ts`: Zod schemas for SKILL.md frontmatter
- `src/skills/parser.ts`: YAML frontmatter parser
- `src/skills/types.ts`: Type definitions
- `src/skills/loader.ts`: Skill discovery and loading
- `src/skills/prompt.ts`: XML generation for system prompt
- `src/skills/context-provider.ts`: Progressive disclosure logic
- `src/skills/index.ts`: Public exports
- `src/skills/__tests__/manifest.test.ts`: Schema tests
- `src/skills/__tests__/parser.test.ts`: Parser tests
- `src/skills/__tests__/loader.test.ts`: Loader tests
- `src/skills/__tests__/prompt.test.ts`: XML generation tests
- `src/_bundled_skills/hello-world/SKILL.md`: Reference skill manifest
- `src/_bundled_skills/hello-world/scripts/greet.sh`: Example script
- `src/_bundled_skills/hello-world/references/EXAMPLES.md`: Example docs

### Reference Files (Read Only)
- `src/config/schema.ts`: Zod schema patterns
- `src/utils/context.ts`: Manager class pattern
- `src/agent/prompts.ts`: System prompt loading

## Implementation Plan

### Phase 1: Foundation (Feature 25)
Implement Zod schemas for SKILL.md frontmatter validation with exact spec compliance.

### Phase 2: Parser (Feature 25)
Create YAML frontmatter parser that extracts metadata and body content.

### Phase 3: Discovery (Feature 26)
Implement skill loader that scans directories and validates manifests.

### Phase 4: Prompt Generation (Feature 27)
Generate `<available_skills>` XML block for system prompt injection.

### Phase 5: Progressive Disclosure (Feature 28)
Implement 3-tier context loading (metadata → instructions → resources).

### Phase 6: Bundled Skill (Feature 30)
Create hello-world reference skill validating the full flow.

## Step by Step Tasks

### Task 1: Add yaml Package Dependency

**Description**: Install the `yaml` package for parsing SKILL.md frontmatter.

**Commands**:
```bash
bun add yaml
```

**Verification**: Package appears in `package.json` dependencies.

---

### Task 2: Create Skill Type Definitions

**Description**: Define TypeScript types for skills system.

**Files to create**: `src/skills/types.ts`

**Implementation**:
```typescript
/**
 * Type definitions for the Skills system.
 * Based on the official Agent Skills specification.
 */

/**
 * Parsed SKILL.md manifest (frontmatter only).
 */
export interface SkillManifest {
  /** Skill name (1-64 chars, lowercase alphanumeric + hyphens) */
  name: string;
  /** Skill description (1-1024 chars) */
  description: string;
  /** License name or file reference */
  license?: string;
  /** Environment requirements (1-500 chars) */
  compatibility?: string;
  /** Arbitrary key-value metadata */
  metadata?: Record<string, string>;
  /** Space-delimited allowed tool patterns (experimental) */
  allowedTools?: string;
}

/**
 * Full skill content including body.
 */
export interface SkillContent {
  /** Parsed frontmatter */
  manifest: SkillManifest;
  /** Markdown body (instructions) */
  body: string;
}

/**
 * Discovered skill with filesystem location.
 */
export interface DiscoveredSkill {
  /** Parsed manifest */
  manifest: SkillManifest;
  /** Absolute path to SKILL.md */
  path: string;
  /** Parent directory path */
  directory: string;
  /** Source type (bundled, user, project) */
  source: SkillSource;
}

/**
 * Skill source location type.
 */
export type SkillSource = 'bundled' | 'user' | 'project';

/**
 * Error encountered during skill loading.
 */
export interface SkillError {
  /** Path to the problematic skill directory */
  path: string;
  /** Error message */
  message: string;
  /** Error type */
  type: 'PARSE_ERROR' | 'VALIDATION_ERROR' | 'NOT_FOUND' | 'IO_ERROR';
}

/**
 * Result of skill discovery.
 */
export interface SkillDiscoveryResult {
  /** Successfully loaded skills */
  skills: DiscoveredSkill[];
  /** Errors encountered */
  errors: SkillError[];
}

/**
 * Options for skill loader.
 */
export interface SkillLoaderOptions {
  /** Bundled skills directory (defaults to src/_bundled_skills) */
  bundledDir?: string;
  /** User skills directory (defaults to ~/.agent/skills) */
  userDir?: string;
  /** Project skills directory (defaults to ./.agent/skills) */
  projectDir?: string;
  /** Debug callback */
  onDebug?: (msg: string, data?: unknown) => void;
}
```

---

### Task 3: Create Skill Manifest Schema

**Description**: Implement Zod schemas for SKILL.md frontmatter with exact spec compliance.

**Files to create**: `src/skills/manifest.ts`

**Implementation**:
```typescript
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
  .max(MAX_SKILL_NAME_LENGTH, `Skill name cannot exceed ${MAX_SKILL_NAME_LENGTH} characters`)
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
    `Skill description cannot exceed ${MAX_SKILL_DESCRIPTION_LENGTH} characters`
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
  .max(MAX_COMPATIBILITY_LENGTH, `Compatibility cannot exceed ${MAX_COMPATIBILITY_LENGTH} characters`)
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
 */
export const SkillManifestSchema = z.object({
  // Required fields
  name: SkillNameSchema,
  description: SkillDescriptionSchema,

  // Optional fields
  license: z.string().optional().describe('License name or file reference'),
  compatibility: CompatibilitySchema,
  metadata: MetadataSchema,
  'allowed-tools': AllowedToolsSchema,
});

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
export function validateManifest(data: unknown): z.SafeParseReturnType<unknown, SkillManifestRaw> {
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
```

---

### Task 4: Create YAML Frontmatter Parser

**Description**: Implement parser for SKILL.md files with YAML frontmatter.

**Files to create**: `src/skills/parser.ts`

**Implementation**:
```typescript
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
  if (nameError) {
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
```

---

### Task 5: Create Skill Loader

**Description**: Implement skill discovery scanning configured directories.

**Files to create**: `src/skills/loader.ts`

**Implementation**:
```typescript
/**
 * Skill discovery and loading.
 * Scans configured directories for valid skills.
 */

import { readFile, readdir, stat, access, constants } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type {
  SkillLoaderOptions,
  SkillDiscoveryResult,
  DiscoveredSkill,
  SkillError,
  SkillSource,
} from './types.js';
import { parseSkillMd } from './parser.js';

// Default directories
const DEFAULT_BUNDLED_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '_bundled_skills'
);
const DEFAULT_USER_DIR = join(homedir(), '.agent', 'skills');
const DEFAULT_PROJECT_DIR = join(process.cwd(), '.agent', 'skills');

/**
 * Skill loader that discovers and validates skills from configured directories.
 */
export class SkillLoader {
  private readonly bundledDir: string;
  private readonly userDir: string;
  private readonly projectDir: string;
  private readonly onDebug?: (msg: string, data?: unknown) => void;

  constructor(options: SkillLoaderOptions = {}) {
    this.bundledDir = options.bundledDir ?? DEFAULT_BUNDLED_DIR;
    this.userDir = options.userDir ?? DEFAULT_USER_DIR;
    this.projectDir = options.projectDir ?? DEFAULT_PROJECT_DIR;
    this.onDebug = options.onDebug;
  }

  private debug(msg: string, data?: unknown): void {
    this.onDebug?.(msg, data);
  }

  /**
   * Discover all skills from configured directories.
   * Scans bundled, user, and project directories in order.
   *
   * @returns Discovery result with skills and errors
   */
  async discover(): Promise<SkillDiscoveryResult> {
    const skills: DiscoveredSkill[] = [];
    const errors: SkillError[] = [];

    // Scan each directory with appropriate source type
    const sources: Array<{ dir: string; source: SkillSource }> = [
      { dir: this.bundledDir, source: 'bundled' },
      { dir: this.userDir, source: 'user' },
      { dir: this.projectDir, source: 'project' },
    ];

    for (const { dir, source } of sources) {
      this.debug(`Scanning ${source} skills directory`, { dir });

      // Check if directory exists
      const exists = await this.directoryExists(dir);
      if (!exists) {
        this.debug(`Directory does not exist, skipping`, { dir });
        continue;
      }

      // Scan directory for skills
      const result = await this.scanDirectory(dir, source);
      skills.push(...result.skills);
      errors.push(...result.errors);
    }

    // Check for duplicate skill names (later sources win)
    const seen = new Map<string, DiscoveredSkill>();
    for (const skill of skills) {
      if (seen.has(skill.manifest.name)) {
        this.debug(`Duplicate skill name, later definition wins`, {
          name: skill.manifest.name,
          previous: seen.get(skill.manifest.name)?.path,
          current: skill.path,
        });
      }
      seen.set(skill.manifest.name, skill);
    }

    const uniqueSkills = Array.from(seen.values());

    this.debug(`Discovery complete`, {
      total: uniqueSkills.length,
      errors: errors.length,
    });

    return { skills: uniqueSkills, errors };
  }

  /**
   * Scan a single directory for skills.
   */
  private async scanDirectory(
    dir: string,
    source: SkillSource
  ): Promise<SkillDiscoveryResult> {
    const skills: DiscoveredSkill[] = [];
    const errors: SkillError[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillDir = join(dir, entry.name);
        const skillMdPath = join(skillDir, 'SKILL.md');

        // Check for SKILL.md
        const hasMd = await this.fileExists(skillMdPath);
        if (!hasMd) {
          this.debug(`No SKILL.md found, skipping`, { dir: skillDir });
          continue;
        }

        // Load and parse SKILL.md
        const result = await this.loadSkill(skillMdPath, entry.name, source);
        if (result.success) {
          skills.push(result.skill);
        } else {
          errors.push(result.error);
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to scan directory';
      errors.push({
        path: dir,
        message,
        type: 'IO_ERROR',
      });
    }

    return { skills, errors };
  }

  /**
   * Load a single skill from SKILL.md path.
   */
  private async loadSkill(
    skillMdPath: string,
    directoryName: string,
    source: SkillSource
  ): Promise<
    | { success: true; skill: DiscoveredSkill }
    | { success: false; error: SkillError }
  > {
    try {
      const content = await readFile(skillMdPath, 'utf-8');
      const result = parseSkillMd(content, directoryName);

      if (!result.success) {
        return {
          success: false,
          error: {
            path: skillMdPath,
            message: result.error,
            type: result.type,
          },
        };
      }

      this.debug(`Loaded skill`, { name: result.content.manifest.name, path: skillMdPath });

      return {
        success: true,
        skill: {
          manifest: result.content.manifest,
          path: skillMdPath,
          directory: dirname(skillMdPath),
          source,
        },
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to read SKILL.md';
      return {
        success: false,
        error: {
          path: skillMdPath,
          message,
          type: 'IO_ERROR',
        },
      };
    }
  }

  /**
   * Get the full content of a skill (for progressive disclosure tier 2).
   *
   * @param skillPath - Absolute path to SKILL.md
   * @returns Full skill content including body
   */
  async getSkillContent(skillPath: string): Promise<string | null> {
    try {
      return await readFile(skillPath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Check if a directory exists.
   */
  private async directoryExists(path: string): Promise<boolean> {
    try {
      const stats = await stat(path);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if a file exists and is readable.
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a skill loader with default options.
 */
export function createSkillLoader(options?: SkillLoaderOptions): SkillLoader {
  return new SkillLoader(options);
}
```

---

### Task 6: Create Skill Prompt Generator

**Description**: Generate `<available_skills>` XML for system prompt injection.

**Files to create**: `src/skills/prompt.ts`

**Implementation**:
```typescript
/**
 * Skill prompt generation for system prompt injection.
 * Generates <available_skills> XML block per Agent Skills spec.
 */

import type { DiscoveredSkill } from './types.js';

/**
 * Escape HTML/XML special characters in content.
 *
 * @param text - Text to escape
 * @returns Escaped text safe for XML
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate a single skill XML element.
 *
 * @param skill - Discovered skill
 * @returns XML string for the skill
 */
function generateSkillXml(skill: DiscoveredSkill): string {
  const name = escapeXml(skill.manifest.name);
  const description = escapeXml(skill.manifest.description);
  const location = escapeXml(skill.path);

  return `<skill>
<name>${name}</name>
<description>${description}</description>
<location>${location}</location>
</skill>`;
}

/**
 * Generate the complete <available_skills> XML block.
 * This is injected into the system prompt to inform the LLM
 * about available skills.
 *
 * @param skills - Array of discovered skills
 * @returns XML string for system prompt
 *
 * @example Output:
 * ```xml
 * <available_skills>
 * <skill>
 * <name>hello-world</name>
 * <description>A simple greeting skill for testing</description>
 * <location>/path/to/hello-world/SKILL.md</location>
 * </skill>
 * </available_skills>
 * ```
 */
export function generateAvailableSkillsXml(skills: DiscoveredSkill[]): string {
  if (skills.length === 0) {
    return '';
  }

  const skillElements = skills.map(generateSkillXml).join('\n');

  return `<available_skills>
${skillElements}
</available_skills>`;
}

/**
 * Estimate token count for skills metadata.
 * Uses rough approximation of ~100 tokens per skill.
 *
 * @param skills - Array of discovered skills
 * @returns Estimated token count
 */
export function estimateSkillTokens(skills: DiscoveredSkill[]): number {
  // Each skill contributes approximately:
  // - XML structure: ~20 tokens
  // - Name: ~5 tokens
  // - Description: ~50-80 tokens (varies by length)
  // - Location path: ~20-30 tokens
  // Average ~100 tokens per skill
  return skills.length * 100;
}

/**
 * Format skills for debug/display output.
 *
 * @param skills - Array of discovered skills
 * @returns Human-readable skill summary
 */
export function formatSkillsSummary(skills: DiscoveredSkill[]): string {
  if (skills.length === 0) {
    return 'No skills available';
  }

  const lines = skills.map(
    (s) => `  - ${s.manifest.name} (${s.source}): ${s.manifest.description.substring(0, 60)}...`
  );

  return `Available skills (${skills.length}):\n${lines.join('\n')}`;
}
```

---

### Task 7: Create Context Provider for Progressive Disclosure

**Description**: Implement the 3-tier progressive disclosure model.

**Files to create**: `src/skills/context-provider.ts`

**Implementation**:
```typescript
/**
 * Progressive disclosure context provider for skills.
 * Implements the 3-tier disclosure model from Agent Skills spec.
 *
 * Tiers:
 * 1. Metadata (~100 tokens/skill) - <available_skills> XML at startup
 * 2. Instructions (<5000 tokens) - Full SKILL.md body when activated
 * 3. Resources (as needed) - scripts/, references/, assets/ on demand
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { DiscoveredSkill } from './types.js';
import { generateAvailableSkillsXml, estimateSkillTokens } from './prompt.js';
import { parseSkillMd } from './parser.js';

/**
 * Options for context provider.
 */
export interface ContextProviderOptions {
  /** Maximum tokens for tier 1 (metadata) - default 1000 */
  maxTier1Tokens?: number;
  /** Maximum tokens for tier 2 (instructions) - default 5000 */
  maxTier2Tokens?: number;
  /** Debug callback */
  onDebug?: (msg: string, data?: unknown) => void;
}

/**
 * Context provider that manages progressive skill disclosure.
 */
export class SkillContextProvider {
  private readonly skills: DiscoveredSkill[];
  private readonly maxTier1Tokens: number;
  private readonly maxTier2Tokens: number;
  private readonly onDebug?: (msg: string, data?: unknown) => void;

  constructor(skills: DiscoveredSkill[], options: ContextProviderOptions = {}) {
    this.skills = skills;
    this.maxTier1Tokens = options.maxTier1Tokens ?? 1000;
    this.maxTier2Tokens = options.maxTier2Tokens ?? 5000;
    this.onDebug = options.onDebug;
  }

  private debug(msg: string, data?: unknown): void {
    this.onDebug?.(msg, data);
  }

  /**
   * Get Tier 1 context: Metadata for all skills.
   * Injected into system prompt at startup.
   *
   * @returns <available_skills> XML block
   */
  getTier1Context(): string {
    const tokens = estimateSkillTokens(this.skills);
    this.debug('Generating tier 1 context (metadata)', { skillCount: this.skills.length, tokens });

    if (tokens > this.maxTier1Tokens) {
      this.debug('Tier 1 token limit exceeded, truncating skills', {
        limit: this.maxTier1Tokens,
        estimated: tokens,
      });
      // Truncate to fit token limit (rough estimate)
      const maxSkills = Math.floor(this.maxTier1Tokens / 100);
      return generateAvailableSkillsXml(this.skills.slice(0, maxSkills));
    }

    return generateAvailableSkillsXml(this.skills);
  }

  /**
   * Get Tier 2 context: Full instructions for a specific skill.
   * Agent reads this when activating a skill.
   *
   * @param skillName - Name of skill to activate
   * @returns Full SKILL.md content or null if not found
   */
  async getTier2Context(skillName: string): Promise<string | null> {
    const skill = this.skills.find((s) => s.manifest.name === skillName);
    if (!skill) {
      this.debug('Skill not found for tier 2 context', { skillName });
      return null;
    }

    try {
      const content = await readFile(skill.path, 'utf-8');
      this.debug('Loaded tier 2 context (instructions)', {
        skillName,
        chars: content.length,
      });
      return content;
    } catch (e) {
      this.debug('Failed to load tier 2 context', { skillName, error: e });
      return null;
    }
  }

  /**
   * Get Tier 3 context: Resource listing for a skill.
   * Agent reads specific resources on demand.
   *
   * @param skillName - Name of skill
   * @param resourceType - Type of resource (scripts, references, assets)
   * @returns Array of resource paths relative to skill directory
   */
  async getTier3ResourceList(
    skillName: string,
    resourceType: 'scripts' | 'references' | 'assets'
  ): Promise<string[]> {
    const skill = this.skills.find((s) => s.manifest.name === skillName);
    if (!skill) {
      return [];
    }

    const resourceDir = join(skill.directory, resourceType);

    try {
      const stats = await stat(resourceDir);
      if (!stats.isDirectory()) {
        return [];
      }

      const entries = await readdir(resourceDir, { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile())
        .map((e) => join(resourceType, e.name));

      this.debug('Listed tier 3 resources', {
        skillName,
        resourceType,
        count: files.length,
      });

      return files;
    } catch {
      return [];
    }
  }

  /**
   * Get a specific tier 3 resource content.
   *
   * @param skillName - Name of skill
   * @param resourcePath - Relative path to resource (e.g., "scripts/greet.sh")
   * @returns Resource content or null if not found
   */
  async getTier3Resource(skillName: string, resourcePath: string): Promise<string | null> {
    const skill = this.skills.find((s) => s.manifest.name === skillName);
    if (!skill) {
      return null;
    }

    // Security: Ensure resource path doesn't escape skill directory
    const fullPath = join(skill.directory, resourcePath);
    const relativePath = relative(skill.directory, fullPath);
    if (relativePath.startsWith('..') || relativePath.startsWith('/')) {
      this.debug('Rejected tier 3 resource path escape attempt', {
        skillName,
        resourcePath,
      });
      return null;
    }

    try {
      const content = await readFile(fullPath, 'utf-8');
      this.debug('Loaded tier 3 resource', {
        skillName,
        resourcePath,
        chars: content.length,
      });
      return content;
    } catch {
      return null;
    }
  }

  /**
   * Get skill by name.
   */
  getSkill(name: string): DiscoveredSkill | undefined {
    return this.skills.find((s) => s.manifest.name === name);
  }

  /**
   * Get all skill names.
   */
  getSkillNames(): string[] {
    return this.skills.map((s) => s.manifest.name);
  }
}

/**
 * Create a context provider from discovered skills.
 */
export function createSkillContextProvider(
  skills: DiscoveredSkill[],
  options?: ContextProviderOptions
): SkillContextProvider {
  return new SkillContextProvider(skills, options);
}
```

---

### Task 8: Create Skills Module Index

**Description**: Export public API for skills module.

**Files to create**: `src/skills/index.ts`

**Implementation**:
```typescript
/**
 * Skills module - Agent Skills specification implementation.
 *
 * @see https://agentskills.io
 */

// Types
export type {
  SkillManifest,
  SkillContent,
  DiscoveredSkill,
  SkillSource,
  SkillError,
  SkillDiscoveryResult,
  SkillLoaderOptions,
} from './types.js';

// Manifest schema and validation
export {
  MAX_SKILL_NAME_LENGTH,
  MAX_SKILL_DESCRIPTION_LENGTH,
  MAX_COMPATIBILITY_LENGTH,
  SKILL_NAME_PATTERN,
  SkillManifestSchema,
  SkillNameSchema,
  SkillDescriptionSchema,
  validateManifest,
  validateNameMatchesDirectory,
  formatValidationErrors,
} from './manifest.js';
export type { SkillManifestRaw } from './manifest.js';

// Parser
export { parseSkillMd, hasYamlFrontmatter } from './parser.js';
export type { ParseResult } from './parser.js';

// Loader
export { SkillLoader, createSkillLoader } from './loader.js';

// Prompt generation
export {
  escapeXml,
  generateAvailableSkillsXml,
  estimateSkillTokens,
  formatSkillsSummary,
} from './prompt.js';

// Context provider
export {
  SkillContextProvider,
  createSkillContextProvider,
} from './context-provider.js';
export type { ContextProviderOptions } from './context-provider.js';
```

---

### Task 9: Create Bundled hello-world Skill

**Description**: Create reference skill implementation for testing and documentation.

**Files to create**: `src/_bundled_skills/hello-world/SKILL.md`

**Content**:
```markdown
---
name: hello-world
description: A simple greeting skill that demonstrates the Agent Skills specification. Use this skill when the user asks for a greeting, wants to say hello, or needs an example of how skills work.
license: MIT
compatibility: Works with all agents that support the Agent Skills specification.
metadata:
  author: Agent Framework Team
  version: 1.0.0
  tags: example demo greeting
---

# Hello World Skill

This skill demonstrates the Agent Skills specification by providing simple greeting functionality.

## When to Use

- User asks for a greeting ("hello", "hi", "greet me")
- User wants to test skill functionality
- User asks about how skills work (show this as an example)

## Instructions

1. When activated, greet the user warmly
2. You may customize the greeting based on context (time of day, user's name if known)
3. Optionally execute the `greet.sh` script for a formatted greeting

## Example Greetings

- "Hello! How can I help you today?"
- "Good morning! Ready to assist you."
- "Hi there! What would you like to work on?"

## Using the Script

If available, run the greeting script:

```bash
./scripts/greet.sh [name]
```

The script accepts an optional name parameter and returns a formatted greeting.

## Resources

- `scripts/greet.sh` - Executable greeting script
- `references/EXAMPLES.md` - More greeting examples and patterns
```

**Files to create**: `src/_bundled_skills/hello-world/scripts/greet.sh`

**Content**:
```bash
#!/usr/bin/env bash
# Simple greeting script for hello-world skill

NAME="${1:-World}"
HOUR=$(date +%H)

if [ "$HOUR" -lt 12 ]; then
    GREETING="Good morning"
elif [ "$HOUR" -lt 18 ]; then
    GREETING="Good afternoon"
else
    GREETING="Good evening"
fi

echo "{ \"success\": true, \"result\": { \"greeting\": \"$GREETING, $NAME!\" }, \"message\": \"Greeted $NAME\" }"
```

**Files to create**: `src/_bundled_skills/hello-world/references/EXAMPLES.md`

**Content**:
```markdown
# Hello World Skill Examples

## Basic Greetings

| Context | Greeting |
|---------|----------|
| Morning | "Good morning! Ready to help." |
| Afternoon | "Good afternoon! How can I assist?" |
| Evening | "Good evening! What can I do for you?" |

## Personalized Greetings

If you know the user's name:

- "Hello, Alice! How are you today?"
- "Hi Bob! Great to see you again."

## Multilingual Examples

- Spanish: "Hola, mundo!"
- French: "Bonjour, monde!"
- German: "Hallo, Welt!"
- Japanese: "Konnichiwa, sekai!"
```

---

### Task 10: Update Agent Prompts for Skill Injection

**Description**: Modify `loadSystemPrompt` to inject skills XML.

**Files to modify**: `src/agent/prompts.ts`

**Changes**: Add new function and integrate with existing flow.

```typescript
// Add import at top
import {
  createSkillLoader,
  createSkillContextProvider,
  type DiscoveredSkill,
} from '../skills/index.js';

// Add new interface for extended options
export interface PromptOptionsWithSkills extends PromptOptions {
  /** Include discovered skills in system prompt */
  includeSkills?: boolean;
  /** Skills loader options */
  skillLoaderOptions?: SkillLoaderOptions;
}

// Add helper function for skills injection
/**
 * Load skills and generate context for system prompt.
 */
export async function loadSkillsContext(
  options?: SkillLoaderOptions
): Promise<{ xml: string; skills: DiscoveredSkill[] }> {
  const loader = createSkillLoader(options);
  const result = await loader.discover();

  if (result.errors.length > 0) {
    // Log errors but continue with valid skills
    for (const error of result.errors) {
      console.error(`Skill load error: ${error.path}: ${error.message}`);
    }
  }

  const provider = createSkillContextProvider(result.skills);
  const xml = provider.getTier1Context();

  return { xml, skills: result.skills };
}

// Update loadSystemPrompt to accept skills option
export async function loadSystemPromptWithSkills(
  options: PromptOptionsWithSkills
): Promise<{ prompt: string; skills: DiscoveredSkill[] }> {
  const basePrompt = await loadSystemPrompt(options);

  if (!options.includeSkills) {
    return { prompt: basePrompt, skills: [] };
  }

  const { xml, skills } = await loadSkillsContext(options.skillLoaderOptions);

  // Append skills XML after base prompt
  const prompt = xml ? `${basePrompt}\n\n${xml}` : basePrompt;

  return { prompt, skills };
}
```

---

### Task 11: Create Manifest Schema Tests

**Description**: Write comprehensive tests for manifest validation.

**Files to create**: `src/skills/__tests__/manifest.test.ts`

**Test cases**:
- Valid skill name patterns (alphanumeric, hyphens)
- Invalid skill names (uppercase, special chars, consecutive hyphens)
- Skill name at min/max length boundaries
- Valid description at various lengths
- Description exceeding max length
- Valid compatibility field
- Valid metadata key-value pairs
- Valid allowed-tools patterns
- Missing required fields (name, description)
- Empty string handling
- Full manifest validation with all fields

---

### Task 12: Create Parser Tests

**Description**: Write tests for YAML frontmatter parser.

**Files to create**: `src/skills/__tests__/parser.test.ts`

**Test cases**:
- Valid SKILL.md with all fields
- Valid SKILL.md with only required fields
- Invalid YAML syntax
- Missing frontmatter delimiter
- Unclosed frontmatter
- Name not matching directory
- Body content extraction
- hasYamlFrontmatter utility function

---

### Task 13: Create Loader Tests

**Description**: Write tests for skill discovery and loading.

**Files to create**: `src/skills/__tests__/loader.test.ts`

**Test cases**:
- Discovers bundled skills
- Discovers user skills
- Discovers project skills
- Skips directories without SKILL.md
- Handles missing directories gracefully
- Reports parse errors without failing
- Handles duplicate skill names (later wins)
- Creates loader with default options
- Creates loader with custom directories

---

### Task 14: Create Prompt Generation Tests

**Description**: Write tests for XML generation.

**Files to create**: `src/skills/__tests__/prompt.test.ts`

**Test cases**:
- Generates valid XML for single skill
- Generates valid XML for multiple skills
- Returns empty string for no skills
- Escapes HTML/XML special characters
- Correct token estimation
- formatSkillsSummary output

---

### Task 15: Run Quality Checks

**Description**: Verify implementation passes all quality gates.

**Commands**:
```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

---

### Task 16: Integration Testing

**Description**: Test full skill discovery → prompt injection → activation flow.

**Manual testing**:
1. Start agent with default config
2. Verify hello-world skill appears in system prompt
3. Ask agent "what skills are available?"
4. Ask agent to greet you
5. Verify agent reads full SKILL.md when activating skill

## Testing Strategy

### Unit Tests

Tests in `src/skills/__tests__/` covering:

1. **Manifest validation** (`manifest.test.ts`):
   - All field constraints (lengths, patterns)
   - Required vs optional fields
   - Error message formatting

2. **Parser** (`parser.test.ts`):
   - YAML extraction and parsing
   - Body content separation
   - Error handling

3. **Loader** (`loader.test.ts`):
   - Multi-directory scanning
   - Error collection
   - Duplicate handling

4. **Prompt generation** (`prompt.test.ts`):
   - XML structure
   - Character escaping
   - Token estimation

### Mock Patterns

```typescript
// Mock filesystem for loader tests
import { jest } from '@jest/globals';

jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
  access: jest.fn(),
}));
```

### Integration Tests

Manual testing with agent:
1. Skill discovery at startup
2. System prompt contains `<available_skills>`
3. Agent can read skill instructions on activation
4. Agent can access skill resources

### Edge Cases

- Empty skills directories
- Malformed YAML in SKILL.md
- Very long descriptions
- Special characters in skill names
- Path traversal attempts in resources

## Acceptance Criteria

- [x] `yaml` package installed (v2.8.2)
- [x] Zod schemas validate all spec fields correctly
- [x] Parser extracts frontmatter and body from SKILL.md
- [x] Loader discovers skills from bundled/user/project directories
- [x] `<available_skills>` XML generated correctly
- [x] Context provider implements 3-tier progressive disclosure
- [x] hello-world bundled skill passes validation
- [x] All unit tests pass with 85%+ coverage (82 tests passing, 92%+ coverage)
- [x] TypeScript strict mode passes
- [x] ESLint and Prettier pass
- [x] Build succeeds

## Validation Commands

```bash
# Run all quality checks
bun run typecheck && bun run lint && bun run test && bun run build

# Run specific tests
bun run test src/skills/__tests__/

# Type check only
bun run typecheck

# Lint only
bun run lint

# Build only
bun run build
```

## Notes

### Agent Skills Specification Compliance

This implementation follows the official specification at agentskills.io:

| Spec Requirement | Implementation |
|------------------|----------------|
| name: 1-64 chars, lowercase alphanumeric + hyphens | `SkillNameSchema` with regex |
| description: 1-1024 chars | `SkillDescriptionSchema` with max length |
| Must match directory name | `validateNameMatchesDirectory()` |
| Optional: license, compatibility, metadata, allowed-tools | All optional in schema |
| YAML frontmatter format | `parseSkillMd()` with yaml package |
| `<available_skills>` XML | `generateAvailableSkillsXml()` |
| 3-tier progressive disclosure | `SkillContextProvider` class |

### No Custom Trigger Matching

Unlike the original Python implementation which had explicit triggers (keywords, verbs, patterns), this implementation relies on the LLM to match user intent to skill descriptions. This is:
- Simpler to implement
- More portable across agents
- Aligned with the spec philosophy

### Script Execution Deferred

Script execution (running files in `scripts/`) is deferred to post-MVP (Feature 43). The current implementation:
- Discovers and lists scripts in tier 3 resources
- Does not execute scripts
- Does not provide sandboxing

### Token Budget Management

The context provider estimates tokens:
- ~100 tokens per skill for tier 1 (metadata)
- Configurable max tokens (default 1000 for tier 1)
- Truncates skills list if budget exceeded

### Future Considerations

- Script execution with Bun subprocess sandboxing
- Git-based skill installation
- Skill versioning and updates
- Skill dependencies
- Remote skill registries

## Execution

This spec can be implemented using: `/sdlc:implement docs/specs/feature-025-030-skills-system.md`
