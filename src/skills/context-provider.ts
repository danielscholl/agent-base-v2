/**
 * Progressive disclosure context provider for skills.
 * Implements the 3-tier disclosure model from Agent Skills spec.
 *
 * Tiers:
 * 1. Metadata (~100 tokens/skill) - <available_skills> XML at startup
 * 2. Instructions (<5000 tokens) - Full SKILL.md body when activated
 * 3. Resources (as needed) - scripts/, references/, assets/ on demand
 */

import { readFile, readdir, stat, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import type { DiscoveredSkill } from './types.js';
import { generateAvailableSkillsXml, estimateSkillTokens } from './prompt.js';

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
  private readonly onDebug?: (msg: string, data?: unknown) => void;

  constructor(skills: DiscoveredSkill[], options: ContextProviderOptions = {}) {
    this.skills = skills;
    this.maxTier1Tokens = options.maxTier1Tokens ?? 1000;
    // maxTier2Tokens available in options for future token counting
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
      const files = entries.filter((e) => e.isFile()).map((e) => join(resourceType, e.name));

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

    // Security: Ensure resource path doesn't escape skill directory (pre-check)
    const fullPath = join(skill.directory, resourcePath);
    const relativePath = relative(skill.directory, fullPath);
    // Check for escape: starts with "..", or is absolute (Windows: D:\...)
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      this.debug('Rejected tier 3 resource path escape attempt (pre-check)', {
        skillName,
        resourcePath,
      });
      return null;
    }

    try {
      // Security: Resolve symlinks and verify path stays within skill directory
      const resolvedSkillDir = await realpath(skill.directory);
      const resolvedPath = await realpath(fullPath);
      const resolvedRelative = relative(resolvedSkillDir, resolvedPath);

      // Reject if resolved path escapes skill directory (Windows: check isAbsolute too)
      if (resolvedRelative.startsWith('..') || isAbsolute(resolvedRelative)) {
        this.debug('Rejected tier 3 resource symlink escape attempt', {
          skillName,
          resourcePath,
          resolvedPath,
        });
        return null;
      }

      const content = await readFile(resolvedPath, 'utf-8');
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
