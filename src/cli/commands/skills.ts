/**
 * Skill management command handlers.
 * Provides /skill show, /skill install, /skill manage subcommands.
 */

import type { CommandHandler, CommandResult } from './types.js';
import { SkillLoader } from '../../skills/loader.js';
import {
  installSkill,
  updateSkill,
  removeSkill,
  listInstalledPlugins,
  getPluginsDir,
  extractRepoName,
} from '../../skills/installer.js';
import { ConfigManager, loadConfig } from '../../config/manager.js';
import type { AppConfig, PluginDefinition } from '../../config/schema.js';

/**
 * Maximum length for skill descriptions before truncation.
 */
const DESCRIPTION_MAX_LENGTH = 60;

/**
 * Find a plugin by name, supporting both named plugins and legacy string-only plugins.
 * Legacy plugins (created from string URLs) have no name field, so we derive name from URL.
 */
function findPluginByName(
  plugins: PluginDefinition[],
  skillName: string
): { plugin: PluginDefinition; index: number } | undefined {
  const index = plugins.findIndex((p) => {
    // Check explicit name first
    if (p.name === skillName) {
      return true;
    }
    // Fall back to derived name from URL for legacy string-only plugins
    if (p.name === undefined && extractRepoName(p.url) === skillName) {
      return true;
    }
    return false;
  });

  if (index >= 0) {
    const plugin = plugins[index];
    if (plugin !== undefined) {
      return { plugin, index };
    }
  }
  return undefined;
}

/**
 * Main skill command handler.
 * Routes to subcommands based on first argument.
 */
export const skillHandler: CommandHandler = async (args, context): Promise<CommandResult> => {
  const [subcommand, ...rest] = args.trim().split(/\s+/);
  const subArgs = rest.join(' ');

  switch (subcommand?.toLowerCase()) {
    case 'show':
    case 'list': // Alias for backward compatibility
    case undefined:
    case '':
      return skillShowHandler(subArgs, context);
    case 'install':
      return skillInstallHandler(subArgs, context);
    case 'manage':
      return skillManageHandler(subArgs, context);
    default:
      context.onOutput(`Unknown subcommand: ${subcommand ?? ''}`, 'warning');
      context.onOutput('Run "agent skill --help" for usage.', 'info');
      return { success: false, message: 'Unknown subcommand' };
  }
};

/**
 * Handler for /skill show command.
 * Shows all discovered skills grouped by source with enabled/disabled status.
 */
export const skillShowHandler: CommandHandler = async (_args, context): Promise<CommandResult> => {
  // Load config for filtering options
  const configResult = await loadConfig();
  const config = configResult.success ? (configResult.result as AppConfig) : null;

  // Build loader options from config - include disabled for display
  const loaderOptions = config
    ? {
        userDir: config.skills.userDir,
        pluginsDir: config.skills.pluginsDir,
        plugins: config.skills.plugins,
        disabledBundled: config.skills.disabledBundled,
        enabledBundled: config.skills.enabledBundled,
        includeDisabled: true, // Include disabled skills for management UI
      }
    : { includeDisabled: true };

  const loader = new SkillLoader(loaderOptions);
  const { skills, errors } = await loader.discover();

  if (skills.length === 0 && errors.length === 0) {
    context.onOutput('No skills found.', 'info');
    context.onOutput('\nSkills are loaded from:', 'info');
    context.onOutput('  - Bundled skills (included with the agent)', 'info');
    const userSkillsPath = config?.skills.userDir ?? '~/.agent/skills/';
    context.onOutput(`  - User skills (${userSkillsPath})`, 'info');
    context.onOutput('  - Project skills (./.agent/skills/)', 'info');
    context.onOutput('  - Plugin skills (installed via git)', 'info');
    context.onOutput('\nUse "agent skill install <url>" to install a plugin.', 'info');
    return { success: true, data: { skills: [], errors: [] } };
  }

  context.onOutput('\nSkill Management', 'success');
  context.onOutput('═══════════════════════════════════════', 'info');

  // Group by source
  const bundled = skills.filter((s) => s.source === 'bundled');
  const plugins = skills.filter((s) => s.source === 'plugin');
  const user = skills.filter((s) => s.source === 'user');
  const project = skills.filter((s) => s.source === 'project');

  if (bundled.length > 0) {
    context.onOutput('\n[Bundled Skills]', 'info');
    for (const skill of bundled) {
      // Use the disabled flag from the skill object
      const isDisabled = skill.disabled === true;
      const status = isDisabled ? '○ ' : '✓ ';
      const statusText = isDisabled ? '(disabled)' : '(enabled)';
      const desc = skill.manifest.description;
      const truncatedDesc =
        desc.length > DESCRIPTION_MAX_LENGTH
          ? desc.slice(0, DESCRIPTION_MAX_LENGTH - 3) + '...'
          : desc;
      context.onOutput(`  ${status}${skill.manifest.name}`, isDisabled ? 'warning' : 'success');
      context.onOutput(`      ${truncatedDesc} ${statusText}`, 'info');
    }
  }

  if (plugins.length > 0) {
    context.onOutput('\n[Plugin Skills]', 'info');
    for (const skill of plugins) {
      // Use the disabled flag from the skill object
      const isDisabled = skill.disabled === true;
      const status = isDisabled ? '○ ' : '✓ ';
      const statusText = isDisabled ? '(disabled)' : '(enabled)';
      const desc = skill.manifest.description;
      const truncatedDesc =
        desc.length > DESCRIPTION_MAX_LENGTH
          ? desc.slice(0, DESCRIPTION_MAX_LENGTH - 3) + '...'
          : desc;
      context.onOutput(`  ${status}${skill.manifest.name}`, isDisabled ? 'warning' : 'success');
      context.onOutput(`      ${truncatedDesc} ${statusText}`, 'info');
      context.onOutput(`      ${skill.directory}`, 'info');
    }
  }

  if (user.length > 0) {
    context.onOutput('\n[User Skills]', 'info');
    for (const skill of user) {
      const desc = skill.manifest.description;
      const truncatedDesc =
        desc.length > DESCRIPTION_MAX_LENGTH
          ? desc.slice(0, DESCRIPTION_MAX_LENGTH - 3) + '...'
          : desc;
      context.onOutput(`  ✓ ${skill.manifest.name}`, 'success');
      context.onOutput(`      ${truncatedDesc}`, 'info');
    }
  }

  if (project.length > 0) {
    context.onOutput('\n[Project Skills]', 'info');
    for (const skill of project) {
      const desc = skill.manifest.description;
      const truncatedDesc =
        desc.length > DESCRIPTION_MAX_LENGTH
          ? desc.slice(0, DESCRIPTION_MAX_LENGTH - 3) + '...'
          : desc;
      context.onOutput(`  ✓ ${skill.manifest.name}`, 'success');
      context.onOutput(`      ${truncatedDesc}`, 'info');
    }
  }

  if (errors.length > 0) {
    context.onOutput(`\nWarnings (${String(errors.length)})`, 'warning');
    for (const error of errors) {
      context.onOutput(`  ${error.path}: ${error.message}`, 'warning');
    }
  }

  context.onOutput("\nUse 'agent skill manage' to enable/disable skills", 'info');

  return { success: true, data: { skills, errors } };
};

/**
 * Handler for /skill install command.
 * Installs a plugin skill from a git repository.
 */
export const skillInstallHandler: CommandHandler = async (
  args,
  context
): Promise<CommandResult> => {
  const parts = args.trim().split(/\s+/);
  const url = parts[0] ?? '';

  if (url === '') {
    context.onOutput(
      'Usage: agent skill install <git-url> [--name <name>] [--ref <branch>]',
      'info'
    );
    context.onOutput('\nExamples:', 'info');
    context.onOutput('  agent skill install https://github.com/user/my-skill', 'info');
    context.onOutput(
      '  agent skill install https://github.com/user/my-skill --name custom-name',
      'info'
    );
    context.onOutput('  agent skill install https://github.com/user/my-skill --ref v1.0.0', 'info');
    return { success: false, message: 'Git URL required' };
  }

  // Parse optional flags
  let name: string | undefined;
  let ref: string | undefined;

  for (let i = 1; i < parts.length; i++) {
    const nextPart = parts[i + 1] ?? '';
    if (parts[i] === '--name' && nextPart !== '' && !nextPart.startsWith('--')) {
      name = nextPart;
      i++;
    } else if (parts[i] === '--ref' && nextPart !== '' && !nextPart.startsWith('--')) {
      ref = nextPart;
      i++;
    }
  }

  context.onOutput(`\nInstalling skill from ${url}...`, 'info');

  // Get config to determine plugins directory
  const configResult = await loadConfig();
  const config = configResult.success ? (configResult.result as AppConfig) : null;
  const baseDir = config?.skills.pluginsDir;

  // Install the skill
  const result = await installSkill({ url, ref, name, baseDir });

  if (!result.success) {
    context.onOutput(`\nInstallation failed: ${result.error ?? 'Unknown error'}`, 'error');
    return { success: false, message: result.error };
  }

  context.onOutput(`\nInstalled: ${result.skillName}`, 'success');
  context.onOutput(`Location: ${result.path}`, 'info');

  // Update config to track the plugin
  if (configResult.success && config) {
    // Check if already in plugins list
    const existingIndex = config.skills.plugins.findIndex(
      (p) => p.url === url || p.name === result.skillName
    );

    const pluginEntry: PluginDefinition = {
      url,
      name: result.skillName,
      enabled: true,
      installedAt: new Date().toISOString(),
    };

    if (ref !== undefined) {
      pluginEntry.ref = ref;
    }

    if (existingIndex >= 0 && existingIndex < config.skills.plugins.length) {
      // Update existing entry using a copied array for clarity and safety
      const updatedPlugins = [...config.skills.plugins];
      updatedPlugins.splice(existingIndex, 1, pluginEntry);
      config.skills.plugins = updatedPlugins;
    } else {
      // Add new entry using a new array instance
      config.skills.plugins = [...config.skills.plugins, pluginEntry];
    }

    // Save updated config
    const manager = new ConfigManager();
    const saveResult = await manager.save(config);

    if (saveResult.success) {
      context.onOutput('Config updated.', 'success');
    } else {
      context.onOutput(`Warning: Failed to update config: ${saveResult.message}`, 'warning');
    }
  }

  return { success: true, data: result };
};

/**
 * Handler for /skill manage command.
 * Provides interactive skill management (enable/disable/update/remove).
 */
export const skillManageHandler: CommandHandler = async (args, context): Promise<CommandResult> => {
  const parts = args.trim().split(/\s+/);
  const action = parts[0] ?? '';
  const skillName = parts[1] ?? '';

  // If no action, show available actions
  if (action === '') {
    context.onOutput('\nSkill Management Actions', 'success');
    context.onOutput('════════════════════════════════════════', 'info');
    context.onOutput('\nUsage: agent skill manage <action> <skill-name>', 'info');
    context.onOutput('\nActions:', 'info');
    context.onOutput('  enable <name>      Enable a disabled skill', 'info');
    context.onOutput('  disable <name>     Disable a skill (bundled or plugin)', 'info');
    context.onOutput('  update <name>      Update a plugin skill (git pull)', 'info');
    context.onOutput('  remove <name>      Remove a plugin skill', 'info');
    context.onOutput('  list               List installed plugins', 'info');
    context.onOutput('\nExamples:', 'info');
    context.onOutput('  agent skill manage disable gh', 'info');
    context.onOutput('  agent skill manage enable gh', 'info');
    context.onOutput('  agent skill manage update my-plugin', 'info');
    context.onOutput('  agent skill manage remove my-plugin', 'info');
    return { success: true };
  }

  const configResult = await loadConfig();
  if (!configResult.success) {
    context.onOutput(`Failed to load config: ${configResult.message}`, 'error');
    return { success: false, message: configResult.message };
  }

  const config = configResult.result as AppConfig;
  const manager = new ConfigManager();
  const pluginsDir = config.skills.pluginsDir;

  switch (action.toLowerCase()) {
    case 'enable': {
      if (skillName === '') {
        context.onOutput('Usage: agent skill manage enable <skill-name>', 'error');
        return { success: false, message: 'Skill name required' };
      }

      // Check if it's a disabled bundled skill
      const bundledIndex = config.skills.disabledBundled.indexOf(skillName);
      if (bundledIndex >= 0) {
        config.skills.disabledBundled.splice(bundledIndex, 1);
        const saveResult = await manager.save(config);
        if (saveResult.success) {
          context.onOutput(`Enabled bundled skill: ${skillName}`, 'success');
          return { success: true };
        }
        context.onOutput(`Failed to save config: ${saveResult.message}`, 'error');
        return { success: false, message: saveResult.message };
      }

      // Check if it's a disabled plugin (supports legacy string-only plugins)
      const pluginMatch = findPluginByName(config.skills.plugins, skillName);
      if (pluginMatch !== undefined && !pluginMatch.plugin.enabled) {
        pluginMatch.plugin.enabled = true;
        const saveResult = await manager.save(config);
        if (saveResult.success) {
          context.onOutput(`Enabled plugin skill: ${skillName}`, 'success');
          return { success: true };
        }
        context.onOutput(`Failed to save config: ${saveResult.message}`, 'error');
        return { success: false, message: saveResult.message };
      }

      context.onOutput(`Skill "${skillName}" is not disabled or not found`, 'warning');
      return { success: false, message: 'Skill not found or not disabled' };
    }

    case 'disable': {
      if (skillName === '') {
        context.onOutput('Usage: agent skill manage disable <skill-name>', 'error');
        return { success: false, message: 'Skill name required' };
      }

      // Check if it's a plugin (supports legacy string-only plugins)
      const pluginMatch = findPluginByName(config.skills.plugins, skillName);
      if (pluginMatch !== undefined) {
        pluginMatch.plugin.enabled = false;
        const saveResult = await manager.save(config);
        if (saveResult.success) {
          context.onOutput(`Disabled plugin skill: ${skillName}`, 'success');
          return { success: true };
        }
        context.onOutput(`Failed to save config: ${saveResult.message}`, 'error');
        return { success: false, message: saveResult.message };
      }

      // Assume it's a bundled skill
      if (!config.skills.disabledBundled.includes(skillName)) {
        config.skills.disabledBundled.push(skillName);
        const saveResult = await manager.save(config);
        if (saveResult.success) {
          context.onOutput(`Disabled bundled skill: ${skillName}`, 'success');
          return { success: true };
        }
        context.onOutput(`Failed to save config: ${saveResult.message}`, 'error');
        return { success: false, message: saveResult.message };
      }

      context.onOutput(`Skill "${skillName}" is already disabled`, 'warning');
      return { success: false, message: 'Skill already disabled' };
    }

    case 'update': {
      if (skillName === '') {
        context.onOutput('Usage: agent skill manage update <skill-name>', 'error');
        return { success: false, message: 'Skill name required' };
      }

      context.onOutput(`Updating ${skillName}...`, 'info');
      const result = await updateSkill(skillName, pluginsDir);

      if (!result.success) {
        context.onOutput(`Update failed: ${result.error ?? 'Unknown error'}`, 'error');
        return { success: false, message: result.error };
      }

      if (result.updated) {
        context.onOutput(`Updated: ${skillName}`, 'success');
      } else if (result.error !== undefined) {
        // Pinned ref case
        context.onOutput(result.error, 'info');
      } else {
        context.onOutput(`${skillName} is already up to date`, 'info');
      }

      return { success: true, data: result };
    }

    case 'remove': {
      if (skillName === '') {
        context.onOutput('Usage: agent skill manage remove <skill-name>', 'error');
        return { success: false, message: 'Skill name required' };
      }

      // Remove from filesystem
      const removed = await removeSkill(skillName, pluginsDir);

      if (!removed) {
        context.onOutput(`Skill "${skillName}" not found or could not be removed`, 'error');
        return { success: false, message: 'Skill not found' };
      }

      // Remove from config (supports legacy string-only plugins)
      const pluginMatch = findPluginByName(config.skills.plugins, skillName);
      if (pluginMatch !== undefined) {
        config.skills.plugins.splice(pluginMatch.index, 1);
        await manager.save(config);
      }

      context.onOutput(`Removed: ${skillName}`, 'success');
      return { success: true };
    }

    case 'list': {
      const installed = await listInstalledPlugins(pluginsDir);

      if (installed.length === 0) {
        context.onOutput('No plugins installed.', 'info');
        context.onOutput(`\nPlugins directory: ${getPluginsDir(pluginsDir)}`, 'info');
        return { success: true, data: [] };
      }

      context.onOutput('\nInstalled Plugins', 'success');
      context.onOutput('═════════════════════════════', 'info');

      for (const name of installed) {
        // Find plugin config (supports legacy string-only plugins)
        const pluginMatch = findPluginByName(config.skills.plugins, name);
        const plugin = pluginMatch?.plugin;
        const status = plugin?.enabled === false ? '(disabled)' : '(enabled)';
        context.onOutput(`  ${name} ${status}`, plugin?.enabled === false ? 'warning' : 'success');
        if (plugin !== undefined) {
          context.onOutput(`    ${plugin.url}`, 'info');
        }
      }

      return { success: true, data: installed };
    }

    default:
      context.onOutput(`Unknown action: ${action}`, 'error');
      context.onOutput('Valid actions: enable, disable, update, remove, list', 'info');
      return { success: false, message: 'Unknown action' };
  }
};
