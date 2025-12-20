/**
 * Config command handlers.
 * Provides /config init, /config show, /config edit subcommands.
 */

import type { CommandHandler, CommandResult } from './types.js';
import { loadConfig, ConfigManager } from '../../config/manager.js';
import { getDefaultConfig, type AppConfig } from '../../config/schema.js';
import { getProviderWizards } from '../../config/providers/index.js';
import { PROVIDER_NAMES, type ProviderName } from '../../config/constants.js';

/**
 * Type guard to check if a string is a valid provider name.
 */
function isValidProviderName(name: string): name is ProviderName {
  return (PROVIDER_NAMES as readonly string[]).includes(name);
}

/**
 * Main config command handler.
 * Routes to subcommands based on first argument.
 */
export const configHandler: CommandHandler = async (args, context): Promise<CommandResult> => {
  const [subcommand, ...rest] = args.trim().split(/\s+/);
  const subArgs = rest.join(' ');

  switch (subcommand?.toLowerCase()) {
    case 'init':
      return configInitHandler(subArgs, context);
    case 'show':
      return configShowHandler(subArgs, context);
    case 'edit':
      return configEditHandler(subArgs, context);
    case undefined:
    case '':
      return configShowHandler('', context); // Default to show
    default:
      context.onOutput(`Unknown subcommand: ${subcommand ?? ''}`, 'warning');
      context.onOutput('Usage: /config [init|show|edit]', 'info');
      return { success: false, message: 'Unknown subcommand' };
  }
};

/**
 * Handler for /config show command.
 * Displays current configuration in readable format.
 */
export const configShowHandler: CommandHandler = async (_args, context): Promise<CommandResult> => {
  const configResult = await loadConfig();

  if (!configResult.success) {
    context.onOutput(`Failed to load config: ${configResult.message}`, 'error');
    return { success: false, message: configResult.message };
  }

  const config = configResult.result as AppConfig;

  // Format and display each section
  context.onOutput('Current Configuration:', 'success');
  context.onOutput('─────────────────────', 'info');

  // Provider section
  context.onOutput('\n[Providers]', 'info');
  context.onOutput(`  Default: ${config.providers.default}`, 'info');

  // Show configured providers
  const providers = [
    'openai',
    'anthropic',
    'azure',
    'foundry',
    'gemini',
    'github',
    'local',
  ] as const;
  for (const name of providers) {
    const providerConfig = config.providers[name];
    if (providerConfig) {
      const model =
        'model' in providerConfig
          ? providerConfig.model
          : 'modelAlias' in providerConfig
            ? providerConfig.modelAlias
            : 'deployment' in providerConfig
              ? providerConfig.deployment
              : 'N/A';
      const hasAuth =
        ('apiKey' in providerConfig &&
          providerConfig.apiKey !== undefined &&
          providerConfig.apiKey !== '') ||
        ('token' in providerConfig &&
          providerConfig.token !== undefined &&
          providerConfig.token !== '') ||
        name === 'local';
      context.onOutput(
        `  ${name}: ${model ?? 'N/A'} ${hasAuth ? '(configured)' : '(no auth)'}`,
        'info'
      );
    }
  }

  // Agent section
  context.onOutput('\n[Agent]', 'info');
  context.onOutput(`  Data Dir: ${config.agent.dataDir}`, 'info');
  context.onOutput(`  Log Level: ${config.agent.logLevel}`, 'info');
  context.onOutput(
    `  Filesystem Writes: ${config.agent.filesystemWritesEnabled ? 'enabled' : 'disabled'}`,
    'info'
  );

  // Memory section
  context.onOutput('\n[Memory]', 'info');
  context.onOutput(`  Enabled: ${String(config.memory.enabled)}`, 'info');
  context.onOutput(`  Type: ${config.memory.type}`, 'info');
  context.onOutput(`  History Limit: ${String(config.memory.historyLimit)}`, 'info');

  // Session section
  context.onOutput('\n[Session]', 'info');
  context.onOutput(`  Auto Save: ${String(config.session.autoSave)}`, 'info');
  context.onOutput(`  Max Sessions: ${String(config.session.maxSessions)}`, 'info');

  // Skills section
  context.onOutput('\n[Skills]', 'info');
  context.onOutput(
    `  Disabled Bundled: ${config.skills.disabledBundled.length > 0 ? config.skills.disabledBundled.join(', ') : 'none'}`,
    'info'
  );
  context.onOutput(
    `  Enabled Bundled: ${config.skills.enabledBundled.length > 0 ? config.skills.enabledBundled.join(', ') : 'all'}`,
    'info'
  );
  context.onOutput(
    `  Plugins: ${config.skills.plugins.length > 0 ? config.skills.plugins.join(', ') : 'none'}`,
    'info'
  );
  context.onOutput(`  Script Timeout: ${String(config.skills.scriptTimeout)}ms`, 'info');

  // Telemetry section
  context.onOutput('\n[Telemetry]', 'info');
  context.onOutput(`  Enabled: ${String(config.telemetry.enabled)}`, 'info');
  context.onOutput(`  Sensitive Data: ${String(config.telemetry.enableSensitiveData)}`, 'info');
  if (config.telemetry.otlpEndpoint !== undefined && config.telemetry.otlpEndpoint !== '') {
    context.onOutput(`  OTLP Endpoint: ${config.telemetry.otlpEndpoint}`, 'info');
  }

  // Retry section
  context.onOutput('\n[Retry]', 'info');
  context.onOutput(`  Enabled: ${String(config.retry.enabled)}`, 'info');
  context.onOutput(`  Max Retries: ${String(config.retry.maxRetries)}`, 'info');
  context.onOutput(`  Base Delay: ${String(config.retry.baseDelayMs)}ms`, 'info');
  context.onOutput(`  Max Delay: ${String(config.retry.maxDelayMs)}ms`, 'info');
  context.onOutput(`  Jitter: ${String(config.retry.enableJitter)}`, 'info');

  context.onOutput('\n─────────────────────', 'info');
  context.onOutput('Use /config edit to modify settings', 'info');

  return { success: true, data: config };
};

/**
 * Handler for /config init command.
 * Interactive setup wizard for initial configuration.
 */
export const configInitHandler: CommandHandler = async (_args, context): Promise<CommandResult> => {
  // Check for interactive mode
  if (!context.onPrompt) {
    context.onOutput('Interactive mode required for /config init', 'error');
    context.onOutput('Run the agent in interactive mode (without -p flag)', 'info');
    return { success: false, message: 'No prompt handler available' };
  }

  context.onOutput('\nAgent Configuration Setup', 'success');
  context.onOutput('═══════════════════════════\n', 'info');
  context.onOutput('This wizard will help you configure an LLM provider.', 'info');
  context.onOutput('Run /config init again to add more providers.\n', 'info');

  // Get provider wizards
  const providerWizards = getProviderWizards();

  // List available providers
  context.onOutput('Available providers:', 'info');
  for (let i = 0; i < providerWizards.length; i++) {
    const provider = providerWizards[i];
    if (provider) {
      context.onOutput(
        `  ${String(i + 1)}. ${provider.displayName.padEnd(12)} - ${provider.description}`,
        'info'
      );
    }
  }
  context.onOutput('', 'info');

  const choice = await context.onPrompt('Select provider (1-7):');
  const providerIndex = parseInt(choice, 10) - 1;

  if (isNaN(providerIndex) || providerIndex < 0 || providerIndex >= providerWizards.length) {
    context.onOutput('Invalid selection. Run /config init to try again.', 'error');
    return { success: false, message: 'Invalid provider selection' };
  }

  const selectedProvider = providerWizards[providerIndex];
  if (!selectedProvider) {
    context.onOutput('Invalid selection. Run /config init to try again.', 'error');
    return { success: false, message: 'Invalid provider selection' };
  }

  // Run provider wizard
  context.onOutput(`\nStep 2: Configure ${selectedProvider.displayName}\n`, 'info');
  const wizardResult = await selectedProvider.wizard(context);

  if (!wizardResult.success) {
    context.onOutput(`\nSetup failed: ${wizardResult.message}`, 'error');
    return { success: false, message: wizardResult.message };
  }

  // Save configuration
  context.onOutput('\nStep 3: Saving configuration...\n', 'info');

  const configResult = await loadConfig();
  const existingConfig: AppConfig = configResult.success
    ? (configResult.result as AppConfig)
    : getDefaultConfig();

  // Validate provider name before using it
  if (!isValidProviderName(selectedProvider.name)) {
    context.onOutput(
      `Invalid provider name: ${selectedProvider.name}. Expected one of: ${PROVIDER_NAMES.join(', ')}`,
      'error'
    );
    return { success: false, message: 'Invalid provider name' };
  }

  // Merge provider config
  const newConfig: AppConfig = {
    ...existingConfig,
    providers: {
      ...existingConfig.providers,
      default: selectedProvider.name,
      [selectedProvider.name]: wizardResult.config,
    },
  };

  const manager = new ConfigManager();
  const saveResult = await manager.save(newConfig);

  if (!saveResult.success) {
    context.onOutput(`Failed to save: ${saveResult.message}`, 'error');
    return { success: false, message: saveResult.message };
  }

  context.onOutput('Configuration saved successfully!', 'success');
  context.onOutput(`  Provider: ${selectedProvider.displayName}`, 'info');
  context.onOutput('  Location: ~/.agent/settings.json\n', 'info');
  context.onOutput('Note: Restart the agent for changes to take effect.', 'warning');
  context.onOutput('Run /config show to view your configuration', 'info');

  return { success: true, message: 'Configuration initialized' };
};

/**
 * Handler for /config edit command.
 * Interactive editing of configuration fields.
 */
export const configEditHandler: CommandHandler = async (args, context): Promise<CommandResult> => {
  const fieldPath = args.trim();

  if (!context.onPrompt) {
    context.onOutput('Interactive mode required for /config edit', 'error');
    return { success: false, message: 'No prompt handler available' };
  }

  const configResult = await loadConfig();
  if (!configResult.success) {
    context.onOutput(`Failed to load config: ${configResult.message}`, 'error');
    return { success: false, message: configResult.message };
  }

  const config = configResult.result as AppConfig;

  if (!fieldPath) {
    // Show editable sections
    context.onOutput('\nEditable Configuration Sections:', 'success');
    context.onOutput('─────────────────────────────────', 'info');
    context.onOutput('  providers.default  - Default LLM provider', 'info');
    context.onOutput('  agent.logLevel     - Logging level (debug/info/warn/error)', 'info');
    context.onOutput('  memory.enabled     - Enable/disable memory', 'info');
    context.onOutput('  telemetry.enabled  - Enable/disable telemetry', 'info');
    context.onOutput('  session.autoSave   - Auto-save sessions on exit', 'info');
    context.onOutput('\nUsage: /config edit <field.path>', 'info');
    context.onOutput('Example: /config edit providers.default', 'info');
    return { success: true };
  }

  // Handle specific field edits
  let newValue: string;

  switch (fieldPath) {
    case 'providers.default': {
      context.onOutput(`Current value: ${config.providers.default}`, 'info');
      context.onOutput(`Valid options: ${PROVIDER_NAMES.join(', ')}`, 'info');
      newValue = await context.onPrompt('New value:');
      if (!isValidProviderName(newValue)) {
        context.onOutput('Invalid provider name', 'error');
        return { success: false, message: 'Invalid provider' };
      }
      config.providers.default = newValue;
      break;
    }

    case 'agent.logLevel': {
      const levels = ['debug', 'info', 'warn', 'error'];
      context.onOutput(`Current value: ${config.agent.logLevel}`, 'info');
      context.onOutput(`Valid options: ${levels.join(', ')}`, 'info');
      newValue = await context.onPrompt('New value:');
      if (!levels.includes(newValue)) {
        context.onOutput('Invalid log level', 'error');
        return { success: false, message: 'Invalid log level' };
      }
      config.agent.logLevel = newValue as 'debug' | 'info' | 'warn' | 'error';
      break;
    }

    case 'memory.enabled': {
      context.onOutput(`Current value: ${String(config.memory.enabled)}`, 'info');
      newValue = await context.onPrompt('New value (true/false):');
      if (newValue !== 'true' && newValue !== 'false') {
        context.onOutput('Invalid value. Enter true or false', 'error');
        return { success: false, message: 'Invalid boolean' };
      }
      config.memory.enabled = newValue === 'true';
      break;
    }

    case 'telemetry.enabled': {
      context.onOutput(`Current value: ${String(config.telemetry.enabled)}`, 'info');
      newValue = await context.onPrompt('New value (true/false):');
      if (newValue !== 'true' && newValue !== 'false') {
        context.onOutput('Invalid value. Enter true or false', 'error');
        return { success: false, message: 'Invalid boolean' };
      }
      config.telemetry.enabled = newValue === 'true';
      break;
    }

    case 'session.autoSave': {
      context.onOutput(`Current value: ${String(config.session.autoSave)}`, 'info');
      newValue = await context.onPrompt('New value (true/false):');
      if (newValue !== 'true' && newValue !== 'false') {
        context.onOutput('Invalid value. Enter true or false', 'error');
        return { success: false, message: 'Invalid boolean' };
      }
      config.session.autoSave = newValue === 'true';
      break;
    }

    default:
      context.onOutput(`Unknown field: ${fieldPath}`, 'error');
      context.onOutput('Use /config edit to see available fields', 'info');
      return { success: false, message: 'Unknown field' };
  }

  // Save the updated config
  const manager = new ConfigManager();
  const saveResult = await manager.save(config);

  if (!saveResult.success) {
    context.onOutput(`Failed to save: ${saveResult.message}`, 'error');
    return { success: false, message: saveResult.message };
  }

  context.onOutput(`Updated ${fieldPath} successfully`, 'success');
  context.onOutput('Note: Restart the agent for changes to take effect.', 'warning');
  return { success: true, message: `Updated ${fieldPath}` };
};
