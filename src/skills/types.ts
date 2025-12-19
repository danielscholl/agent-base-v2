/**
 * Type definitions for the Skills system.
 * Based on the official Agent Skills specification.
 *
 * @see https://agentskills.io/specification
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
 * Skill source location type.
 */
export type SkillSource = 'bundled' | 'user' | 'project';

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
 * Error encountered during skill loading.
 */
export interface SkillError {
  /** Path to the problematic skill directory */
  path: string;
  /** Error message */
  message: string;
  /** Error type */
  type: 'PARSE_ERROR' | 'VALIDATION_ERROR' | 'NOT_FOUND' | 'IO_ERROR' | 'SECURITY_ERROR';
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
