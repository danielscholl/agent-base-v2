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

  const lines = skills.map((s) => {
    const desc = s.manifest.description;
    const truncated = desc.length > 60 ? `${desc.substring(0, 57)}...` : desc;
    return `  - ${s.manifest.name} (${s.source}): ${truncated}`;
  });

  return `Available skills (${String(skills.length)}):\n${lines.join('\n')}`;
}
