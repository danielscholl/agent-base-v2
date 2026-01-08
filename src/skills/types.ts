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
  /** Allowed tool patterns - string (space-delimited) or array (experimental) */
  allowedTools?: string | string[];
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
 * - 'bundled': Shipped with the agent (src/_bundled_skills/)
 * - 'user': User's personal skills (~/.agent/skills/)
 * - 'claude': Claude Code compatible skills (./.claude/skills/)
 * - 'project': Project-specific skills (./.agent/skills/)
 * - 'plugin': Installed plugin skills (~/.agent/plugins/)
 */
export type SkillSource = 'bundled' | 'user' | 'claude' | 'project' | 'plugin';

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
  /** Source type (bundled, user, project, plugin) */
  source: SkillSource;
  /** Whether the skill is disabled by configuration */
  disabled?: boolean;
  /** Whether the skill is unavailable due to missing dependencies */
  unavailable?: boolean;
  /** Reason the skill is unavailable (e.g., "missing commands: gh, docker") */
  unavailableReason?: string;
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
  /** Claude skills directory (defaults to ./.claude/skills) for Claude Code compatibility */
  claudeDir?: string;
  /** Project skills directory (defaults to ./.agent/skills) */
  projectDir?: string;
  /** Plugins directory (defaults to ~/.agent/plugins) */
  pluginsDir?: string;
  /** Installed plugin definitions from config */
  plugins?: Array<{
    url: string;
    ref?: string;
    name?: string;
    enabled?: boolean;
    installedAt?: string;
  }>;
  /** Bundled skills to disable (by name) */
  disabledBundled?: string[];
  /** Bundled skills to enable (overrides defaults) */
  enabledBundled?: string[];
  /** Include disabled skills with disabled flag set (for management UI) */
  includeDisabled?: boolean;
  /** Include unavailable skills with unavailable flag set (for management UI) */
  includeUnavailable?: boolean;
  /** Debug callback */
  onDebug?: (msg: string, data?: unknown) => void;
}
