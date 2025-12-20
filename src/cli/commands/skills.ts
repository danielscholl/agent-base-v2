/**
 * Skill management command handlers.
 * Provides /skill list, /skill info, /skill validate subcommands.
 */

import type { CommandHandler, CommandResult } from './types.js';
import { SkillLoader } from '../../skills/loader.js';
import { parseSkillMd } from '../../skills/parser.js';
import { readFile } from 'node:fs/promises';

/**
 * Main skill command handler.
 * Routes to subcommands based on first argument.
 */
export const skillHandler: CommandHandler = async (args, context): Promise<CommandResult> => {
  const [subcommand, ...rest] = args.trim().split(/\s+/);
  const subArgs = rest.join(' ');

  switch (subcommand?.toLowerCase()) {
    case 'list':
    case undefined:
    case '':
      return skillListHandler(subArgs, context);
    case 'info':
      return skillInfoHandler(subArgs, context);
    case 'validate':
      return skillValidateHandler(subArgs, context);
    default:
      context.onOutput(`Unknown subcommand: ${subcommand ?? ''}`, 'warning');
      context.onOutput('Usage: /skill [list|info <name>|validate <path>]', 'info');
      return { success: false, message: 'Unknown subcommand' };
  }
};

/**
 * Handler for /skill list command.
 * Shows all discovered skills with their sources.
 */
export const skillListHandler: CommandHandler = async (_args, context): Promise<CommandResult> => {
  // Pass config's userDir to SkillLoader if specified
  const userDir = context.config?.skills.userDir;
  const loaderOptions = userDir !== undefined ? { userDir } : {};
  const loader = new SkillLoader(loaderOptions);
  const { skills, errors } = await loader.discover();

  if (skills.length === 0 && errors.length === 0) {
    context.onOutput('No skills found.', 'info');
    context.onOutput('\nSkills are loaded from:', 'info');
    context.onOutput('  - Bundled skills (included with the agent)', 'info');
    const userSkillsPath = userDir ?? '~/.agent/skills/';
    context.onOutput(`  - User skills (${userSkillsPath})`, 'info');
    context.onOutput('  - Project skills (./.agent/skills/)', 'info');
    return { success: true, data: { skills: [], errors: [] } };
  }

  context.onOutput(`\nDiscovered Skills (${String(skills.length)})`, 'success');
  context.onOutput('══════════════════════════════', 'info');

  // Group by source
  const bundled = skills.filter((s) => s.source === 'bundled');
  const user = skills.filter((s) => s.source === 'user');
  const project = skills.filter((s) => s.source === 'project');

  if (bundled.length > 0) {
    context.onOutput('\n[Bundled Skills]', 'info');
    for (const skill of bundled) {
      context.onOutput(`  ${skill.manifest.name}`, 'success');
      const desc = skill.manifest.description;
      context.onOutput(`    ${desc.length > 80 ? desc.slice(0, 77) + '...' : desc}`, 'info');
    }
  }

  if (user.length > 0) {
    context.onOutput('\n[User Skills]', 'info');
    for (const skill of user) {
      context.onOutput(`  ${skill.manifest.name}`, 'success');
      const desc = skill.manifest.description;
      context.onOutput(`    ${desc.length > 80 ? desc.slice(0, 77) + '...' : desc}`, 'info');
    }
  }

  if (project.length > 0) {
    context.onOutput('\n[Project Skills]', 'info');
    for (const skill of project) {
      context.onOutput(`  ${skill.manifest.name}`, 'success');
      const desc = skill.manifest.description;
      context.onOutput(`    ${desc.length > 80 ? desc.slice(0, 77) + '...' : desc}`, 'info');
    }
  }

  if (errors.length > 0) {
    context.onOutput(`\nWarnings (${String(errors.length)})`, 'warning');
    for (const error of errors) {
      context.onOutput(`  ${error.path}: ${error.message}`, 'warning');
    }
  }

  context.onOutput('\nUse /skill info <name> for details', 'info');

  return { success: true, data: { skills, errors } };
};

/**
 * Handler for /skill info command.
 * Displays detailed information about a specific skill.
 */
export const skillInfoHandler: CommandHandler = async (args, context): Promise<CommandResult> => {
  const skillName = args.trim();

  if (!skillName) {
    context.onOutput('Usage: /skill info <name>', 'info');
    return { success: false, message: 'Skill name required' };
  }

  // Pass config's userDir to SkillLoader if specified
  const userDir = context.config?.skills.userDir;
  const loaderOptions = userDir !== undefined ? { userDir } : {};
  const loader = new SkillLoader(loaderOptions);
  const { skills } = await loader.discover();

  const skill = skills.find((s) => s.manifest.name === skillName);

  if (!skill) {
    context.onOutput(`Skill not found: ${skillName}`, 'error');
    context.onOutput('Use /skill list to see available skills', 'info');
    return { success: false, message: 'Skill not found' };
  }

  context.onOutput(`\nSkill: ${skill.manifest.name}`, 'success');
  context.onOutput('══════════════════════════════', 'info');
  context.onOutput(`\nDescription:\n  ${skill.manifest.description}`, 'info');
  context.onOutput(`\nSource: ${skill.source}`, 'info');
  context.onOutput(`Path: ${skill.path}`, 'info');

  if (skill.manifest.license !== undefined && skill.manifest.license !== '') {
    context.onOutput(`License: ${skill.manifest.license}`, 'info');
  }

  if (skill.manifest.compatibility !== undefined && skill.manifest.compatibility !== '') {
    context.onOutput(`Compatibility: ${skill.manifest.compatibility}`, 'info');
  }

  if (skill.manifest.allowedTools !== undefined && skill.manifest.allowedTools !== '') {
    context.onOutput(`Allowed Tools: ${skill.manifest.allowedTools}`, 'info');
  }

  // Read full SKILL.md content for preview
  try {
    const content = await readFile(skill.path, 'utf-8');
    const lines = content.split('\n').slice(0, 30); // First 30 lines
    context.onOutput('\n─── SKILL.md Preview ───', 'info');
    for (const line of lines) {
      context.onOutput(line, 'info');
    }
    if (content.split('\n').length > 30) {
      context.onOutput('... (truncated)', 'info');
    }
  } catch {
    // Ignore read errors
  }

  return { success: true, data: skill };
};

/**
 * Handler for /skill validate command.
 * Validates a skill directory or SKILL.md file.
 */
export const skillValidateHandler: CommandHandler = async (
  args,
  context
): Promise<CommandResult> => {
  const skillPath = args.trim();

  if (!skillPath) {
    context.onOutput('Usage: /skill validate <path-to-SKILL.md>', 'info');
    return { success: false, message: 'Path required' };
  }

  context.onOutput(`\nValidating: ${skillPath}`, 'info');
  context.onOutput('─────────────────────────', 'info');

  try {
    const content = await readFile(skillPath, 'utf-8');

    // Extract directory name for validation
    const dirMatch = skillPath.match(/([^/\\]+)[/\\]SKILL\.md$/i);
    const dirName = dirMatch?.[1] ?? 'unknown';

    const result = parseSkillMd(content, dirName);

    if (!result.success) {
      context.onOutput('\nValidation FAILED', 'error');
      context.onOutput(`  Error: ${result.error}`, 'error');
      context.onOutput(`  Type: ${result.type}`, 'info');
      return { success: false, message: result.error };
    }

    context.onOutput('\nValidation PASSED', 'success');
    context.onOutput('\nManifest:', 'info');
    context.onOutput(`  Name: ${result.content.manifest.name}`, 'info');
    const desc = result.content.manifest.description;
    context.onOutput(
      `  Description: ${desc.length > 60 ? desc.slice(0, 57) + '...' : desc}`,
      'info'
    );

    if (result.content.manifest.license !== undefined && result.content.manifest.license !== '') {
      context.onOutput(`  License: ${result.content.manifest.license}`, 'info');
    }

    return { success: true, data: result.content };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    context.onOutput(`\nFailed to read file: ${message}`, 'error');
    return { success: false, message };
  }
};
