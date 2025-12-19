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
export { SkillContextProvider, createSkillContextProvider } from './context-provider.js';
export type { ContextProviderOptions } from './context-provider.js';
