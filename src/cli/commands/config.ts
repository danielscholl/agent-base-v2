/**
 * Config command handlers.
 * `config` with no subcommand shows the current configuration; `config init` and `config edit` are subcommands.
 */

import { spawn } from 'node:child_process';
import type { CommandHandler, CommandResult, CommandContext } from './types.js';
import { loadConfig, loadConfigFromFiles, ConfigManager } from '../../config/manager.js';
import { getDefaultConfig, type AppConfig } from '../../config/schema.js';
import { getProviderWizards } from '../../config/providers/index.js';
import { PROVIDER_NAMES, type ProviderName } from '../../config/constants.js';
import { isProviderConfigured } from '../../utils/index.js';

/**
 * Type guard to check if a string is a valid provider name.
 */
function isValidProviderName(name: string): name is ProviderName {
  return (PROVIDER_NAMES as readonly string[]).includes(name);
}

/**
 * Show config command help.
 */
function showConfigHelp(context: CommandContext): CommandResult {
  context.onOutput('\nConfiguration Management', 'success');
  context.onOutput('════════════════════════\n', 'info');
  context.onOutput('Usage: agent config [command]\n', 'info');
  context.onOutput('Commands:', 'info');
  context.onOutput('  (none)              Show current configuration', 'info');
  context.onOutput('  init                Interactive configuration wizard', 'info');
  context.onOutput('  edit                Open config file in text editor', 'info');
  context.onOutput('  provider            List all providers with status', 'info');
  context.onOutput('  provider <name>     Configure a specific provider', 'info');
  context.onOutput('  provider default <name>  Set default provider', 'info');
  context.onOutput('\nExamples:', 'info');
  context.onOutput('  agent config                    # Show current config', 'info');
  context.onOutput('  agent config provider           # List providers', 'info');
  context.onOutput('  agent config provider local     # Configure local provider', 'info');
  context.onOutput('  agent config provider default local  # Set default', 'info');
  context.onOutput('\nConfiguration file: ~/.agent/config.yaml', 'info');
  return { success: true, message: 'Showed help' };
}

/**
 * Main config command handler.
 * Routes to subcommands based on first argument.
 */
export const configHandler: CommandHandler = async (args, context): Promise<CommandResult> => {
  const [subcommand, ...rest] = args.trim().split(/\s+/);
  const subArgs = rest.join(' ');

  switch (subcommand?.toLowerCase()) {
    case 'help':
    case '--help':
    case '-h':
      return showConfigHelp(context);
    case 'init':
      // Config init is only available from CLI, not as a slash command in interactive mode
      if (context.isInteractive === true) {
        context.onOutput('To configure a new provider, exit and run: agent config init', 'info');
        return {
          success: false,
          message:
            'Configuration changes must be done from the command line. Exit and run: agent config init',
        };
      }
      return configInitHandler(subArgs, context);
    case 'edit':
      return configEditHandler(subArgs, context);
    case 'provider':
      // Config provider is only available from CLI, not as a slash command in interactive mode
      if (context.isInteractive === true) {
        context.onOutput(
          'To configure a provider, exit and run: agent config provider <name>',
          'info'
        );
        return {
          success: false,
          message:
            'Configuration changes must be done from the command line. Exit and run: agent config provider',
        };
      }
      return configProviderHandler(subArgs, context);
    case undefined:
    case '':
      return configShowHandler('', context); // Default to show
    default:
      context.onOutput(`Unknown subcommand: ${subcommand ?? ''}`, 'warning');
      showConfigHelp(context);
      return { success: false, message: 'Unknown subcommand' };
  }
};

function getConfiguredProviders(config: AppConfig): ProviderName[] {
  const configured: ProviderName[] = [];
  for (const name of PROVIDER_NAMES) {
    const providerConfig = config.providers[name] as Record<string, unknown> | undefined;
    if (providerConfig === undefined) continue;

    if (isProviderConfigured(name, providerConfig)) {
      configured.push(name);
    }
  }
  return configured;
}

/**
 * Create a table row with proper padding.
 */
function tableRow(
  setting: string,
  value: string,
  settingWidth: number,
  valueWidth: number
): string {
  const paddedSetting = setting.padEnd(settingWidth);
  const paddedValue = value.padEnd(valueWidth);
  return `│ ${paddedSetting} │ ${paddedValue} │`;
}

/**
 * Handler for /config show command.
 * Displays current configuration in a formatted table like osdu-agent.
 */
export const configShowHandler: CommandHandler = async (_args, context): Promise<CommandResult> => {
  // Load full config (with env vars) for display values
  const configResult = await loadConfig();

  if (!configResult.success) {
    context.onOutput(`Failed to load config: ${configResult.message}`, 'error');
    return { success: false, message: configResult.message };
  }

  const config = configResult.result as AppConfig;

  // Load file-only config to determine which providers are explicitly configured
  const fileConfigResult = await loadConfigFromFiles();
  const fileConfig = fileConfigResult.success ? (fileConfigResult.result as AppConfig) : config;

  // Build table rows
  const rows: Array<{ setting: string; value: string }> = [];

  // Get configured providers from file config (not env vars)
  const configuredProviders = getConfiguredProviders(fileConfig);

  // Enabled Providers row
  rows.push({
    setting: 'Enabled Providers',
    value: configuredProviders.length > 0 ? configuredProviders.join(', ') : 'none',
  });

  // Default Provider row - only meaningful if providers are configured
  // If only one provider, it's automatically the default
  // If no providers, show "none"
  let effectiveDefault: string;
  if (configuredProviders.length === 0) {
    effectiveDefault = 'none';
  } else if (configuredProviders.length === 1) {
    effectiveDefault = configuredProviders[0] as string;
  } else {
    // Multiple providers - use the configured default if it's in the list
    const configDefault = fileConfig.providers.default;
    effectiveDefault = configuredProviders.includes(configDefault)
      ? configDefault
      : (configuredProviders[0] as string);
  }

  rows.push({
    setting: 'Default Provider',
    value: effectiveDefault,
  });

  // Provider-specific settings (indented) - only if default is a real provider
  if (effectiveDefault !== 'none') {
    const defaultProvider = effectiveDefault as ProviderName;
    const defaultConfig = config.providers[defaultProvider] as Record<string, unknown> | undefined;

    if (defaultConfig !== undefined) {
      // Show endpoint for azure/foundry
      if (defaultProvider === 'azure') {
        const endpoint = defaultConfig.endpoint as string | undefined;
        if (endpoint !== undefined) {
          rows.push({
            setting: `  ${defaultProvider} Endpoint`,
            value: endpoint,
          });
        }
      }
      if (defaultProvider === 'foundry') {
        const endpoint = defaultConfig.projectEndpoint as string | undefined;
        if (endpoint !== undefined) {
          rows.push({
            setting: `  ${defaultProvider} Endpoint`,
            value: endpoint,
          });
        }
      }

      // Show model/deployment
      const deployment = defaultConfig.deployment as string | undefined;
      const modelDeployment = defaultConfig.modelDeployment as string | undefined;
      const model = defaultConfig.model as string | undefined;
      const modelAlias = defaultConfig.modelAlias as string | undefined;

      if (deployment !== undefined) {
        rows.push({
          setting: `  ${defaultProvider} Deployment`,
          value: deployment,
        });
      } else if (modelDeployment !== undefined) {
        rows.push({
          setting: `  ${defaultProvider} Deployment`,
          value: modelDeployment,
        });
      } else if (model !== undefined) {
        rows.push({
          setting: `  ${defaultProvider} Model`,
          value: model,
        });
      } else if (modelAlias !== undefined) {
        rows.push({
          setting: `  ${defaultProvider} Model`,
          value: modelAlias,
        });
      }
    }
  }

  // Telemetry row
  rows.push({
    setting: 'Telemetry',
    value: config.telemetry.enabled ? 'Enabled' : 'Disabled',
  });

  // Memory row
  const memoryValue = config.memory.enabled
    ? `${config.memory.type} (limit: ${String(config.memory.historyLimit)})`
    : 'Disabled';
  rows.push({
    setting: 'Memory',
    value: memoryValue,
  });

  // Data Directory row
  rows.push({
    setting: 'Data Directory',
    value: config.agent.dataDir,
  });

  // Calculate column widths
  const settingWidth = Math.max(...rows.map((r) => r.setting.length), 'Setting'.length);
  const valueWidth = Math.max(...rows.map((r) => r.value.length), 'Value'.length);

  // Build table
  const topBorder = `┏${'━'.repeat(settingWidth + 2)}┳${'━'.repeat(valueWidth + 2)}┓`;
  const headerSep = `┡${'━'.repeat(settingWidth + 2)}╇${'━'.repeat(valueWidth + 2)}┩`;
  const bottomBorder = `└${'─'.repeat(settingWidth + 2)}┴${'─'.repeat(valueWidth + 2)}┘`;

  // Output title
  context.onOutput('', 'info');
  context.onOutput('                            Agent Configuration', 'success');

  // Output table
  context.onOutput(topBorder, 'info');
  context.onOutput(tableRow('Setting', 'Value', settingWidth, valueWidth), 'info');
  context.onOutput(headerSep, 'info');

  for (const row of rows) {
    context.onOutput(tableRow(row.setting, row.value, settingWidth, valueWidth), 'info');
  }

  context.onOutput(bottomBorder, 'info');

  // Output config file location
  context.onOutput('', 'info');
  context.onOutput(`Configuration file: ~/.agent/config.yaml`, 'info');

  return { success: true, data: config };
};

/**
 * Handler for /config init command.
 * Interactive setup wizard for initial configuration.
 */
export const configInitHandler: CommandHandler = async (_args, context): Promise<CommandResult> => {
  // init is now just an alias for 'config provider' (which handles the setup flow)
  return configProviderHandler('', context);
};

/**
 * Open a file in the system's default editor.
 * Tries $EDITOR, $VISUAL, then falls back to platform-specific defaults.
 */
async function openInEditor(filePath: string): Promise<{ success: boolean; message?: string }> {
  return new Promise((resolve) => {
    let resolved = false;

    // Try environment variables first
    const editor = process.env.EDITOR ?? process.env.VISUAL;

    if (editor !== undefined && editor !== '') {
      // Use the specified editor
      const proc = spawn(editor, [filePath], {
        stdio: 'inherit',
        shell: true,
      });

      proc.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          resolve({ success: false, message: `Failed to open editor: ${err.message}` });
        }
      });

      proc.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          if (code === 0) {
            resolve({ success: true });
          } else {
            resolve({ success: false, message: `Editor exited with code ${String(code)}` });
          }
        }
      });
      return;
    }

    // Fall back to platform-specific defaults
    const platform = process.platform;
    let command: string;
    let args: string[];

    if (platform === 'darwin') {
      // macOS: use 'open' which opens with default app
      command = 'open';
      args = ['-t', filePath]; // -t opens in default text editor
    } else if (platform === 'win32') {
      // Windows: use 'notepad' or 'start'
      command = 'notepad';
      args = [filePath];
    } else {
      // Linux/Unix: try xdg-open, then common editors
      command = 'xdg-open';
      args = [filePath];
    }

    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: platform === 'win32',
    });

    proc.on('error', () => {
      // If xdg-open fails on Unix-like systems, try nano
      if (platform !== 'darwin' && platform !== 'win32') {
        const fallback = spawn('nano', [filePath], { stdio: 'inherit' });
        fallback.on('error', (err) => {
          if (!resolved) {
            resolved = true;
            resolve({ success: false, message: `No editor found: ${err.message}` });
          }
        });
        fallback.on('close', (code) => {
          if (!resolved) {
            resolved = true;
            resolve(code === 0 ? { success: true } : { success: false, message: 'Editor failed' });
          }
        });
      } else {
        if (!resolved) {
          resolved = true;
          resolve({ success: false, message: 'Failed to open editor' });
        }
      }
    });

    proc.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, message: `Editor exited with code ${String(code)}` });
        }
      }
    });
  });
}

/**
 * Handler for config edit command.
 * Opens the configuration file in the system's default text editor.
 */
export const configEditHandler: CommandHandler = async (_args, context): Promise<CommandResult> => {
  const manager = new ConfigManager();
  const configPath = manager.getUserConfigPath();

  context.onOutput(`Opening configuration file: ${configPath}`, 'info');

  const result = await openInEditor(configPath);

  if (!result.success) {
    context.onOutput(`Failed to open editor: ${result.message ?? 'Unknown error'}`, 'error');
    context.onOutput('You can manually edit the file at: ' + configPath, 'info');
    return { success: false, message: result.message };
  }

  context.onOutput('Configuration file opened in editor.', 'success');
  return { success: true, message: 'Opened config in editor' };
};

/**
 * Show available configuration keys for a provider.
 * Used by 'config provider set' when no keys are provided.
 */
function showProviderKeys(providerName: ProviderName, context: CommandContext): void {
  const keys: Record<ProviderName, string[]> = {
    local: ['baseUrl', 'model'],
    openai: ['apiKey', 'model', 'baseUrl'],
    anthropic: ['apiKey', 'model'],
    azure: ['endpoint', 'deployment', 'apiKey', 'apiVersion'],
    foundry: ['mode', 'projectEndpoint', 'modelDeployment', 'modelAlias', 'apiKey'],
    gemini: ['apiKey', 'model', 'useVertexai', 'projectId', 'location'],
    github: ['token', 'model', 'org'],
  };

  const providerKeys = keys[providerName];
  for (const key of providerKeys) {
    context.onOutput(`  ${key}`, 'info');
  }
}

/**
 * Handler for /config provider command.
 * Manages individual provider configuration.
 *
 * Usage:
 *   config provider           - List all providers with status
 *   config provider <name>    - Configure a specific provider
 *   config provider default <name> - Set default provider
 */
export const configProviderHandler: CommandHandler = async (
  args,
  context
): Promise<CommandResult> => {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  const [action, providerArg] = parts;

  // Get provider wizards for reference
  const providerWizards = getProviderWizards();

  // Load current config
  const configResult = await loadConfig();
  const fileConfigResult = await loadConfigFromFiles();
  const config: AppConfig = configResult.success
    ? (configResult.result as AppConfig)
    : getDefaultConfig();
  const fileConfig: AppConfig = fileConfigResult.success
    ? (fileConfigResult.result as AppConfig)
    : config;

  // Help for provider subcommand
  if (action === 'help' || action === '--help' || action === '-h') {
    context.onOutput('\nProvider Configuration', 'success');
    context.onOutput('══════════════════════\n', 'info');
    context.onOutput('Usage: agent config provider [command]\n', 'info');
    context.onOutput('Commands:', 'info');
    context.onOutput('  (none)              List providers (or setup wizard if none)', 'info');
    context.onOutput('  <name>              Interactive wizard for provider', 'info');
    context.onOutput('  set <name> k=v ...  Non-interactive: set provider config', 'info');
    context.onOutput('  default <name>      Set default provider', 'info');
    context.onOutput('  remove <name>       Remove provider configuration', 'info');
    context.onOutput('\nProviders: ' + PROVIDER_NAMES.join(', '), 'info');
    context.onOutput('\nExamples (interactive - for humans):', 'info');
    context.onOutput('  agent config provider              # List or setup', 'info');
    context.onOutput('  agent config provider local        # Wizard for local', 'info');
    context.onOutput('\nExamples (non-interactive - for AI/scripts):', 'info');
    context.onOutput(
      '  agent config provider set local baseUrl=http://localhost:11434/v1 model=qwen3:latest',
      'info'
    );
    context.onOutput('  agent config provider set openai apiKey=sk-xxx model=gpt-4o', 'info');
    context.onOutput('  agent config provider default local', 'info');
    context.onOutput('  agent config provider remove openai', 'info');
    return { success: true, message: 'Showed provider help' };
  }

  // No arguments - either show setup wizard (no config) or list status (has config)
  if (action === undefined || action === '') {
    const configuredProviders = getConfiguredProviders(fileConfig);

    // If no providers configured, start interactive setup (like init)
    if (configuredProviders.length === 0) {
      if (!context.onPrompt) {
        context.onOutput('Interactive mode required for provider setup', 'error');
        context.onOutput('Run: agent config provider <name>', 'info');
        context.onOutput('Available: ' + PROVIDER_NAMES.join(', '), 'info');
        return { success: false, message: 'No prompt handler available' };
      }

      context.onOutput('\nProvider Setup', 'success');
      context.onOutput('══════════════\n', 'info');
      context.onOutput('No providers configured. Select one to set up:\n', 'info');

      // Show numbered list of providers
      for (let i = 0; i < providerWizards.length; i++) {
        const provider = providerWizards[i];
        if (provider) {
          context.onOutput(
            `  ${String(i + 1)}. ${provider.displayName.padEnd(16)} ${provider.description}`,
            'info'
          );
        }
      }
      context.onOutput('', 'info');

      const choice = await context.onPrompt('Select provider (1-7):');
      const providerIndex = parseInt(choice, 10) - 1;

      if (isNaN(providerIndex) || providerIndex < 0 || providerIndex >= providerWizards.length) {
        context.onOutput('Invalid selection.', 'error');
        return { success: false, message: 'Invalid provider selection' };
      }

      const selectedProvider = providerWizards[providerIndex];
      if (!selectedProvider) {
        return { success: false, message: 'Invalid provider selection' };
      }

      // Run the wizard for the selected provider
      context.onOutput(`\nConfiguring ${selectedProvider.displayName}...`, 'success');
      const wizardResult = await selectedProvider.wizard(context);

      if (!wizardResult.success) {
        context.onOutput(`\nSetup failed: ${wizardResult.message}`, 'error');
        return { success: false, message: wizardResult.message };
      }

      // Save as default (first provider)
      if (!isValidProviderName(selectedProvider.name)) {
        return { success: false, message: 'Invalid provider name' };
      }

      // Use fileConfig (not config) to avoid saving env var values
      const newConfig: AppConfig = {
        ...fileConfig,
        providers: {
          ...fileConfig.providers,
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

      context.onOutput(
        `\n✓ ${selectedProvider.displayName} configured as default provider`,
        'success'
      );
      context.onOutput(`  Config saved to: ${manager.getUserConfigPath()}`, 'info');
      return { success: true, message: `${selectedProvider.name} configured` };
    }

    // Providers exist - show status list
    context.onOutput('\nProvider Configuration', 'success');
    context.onOutput('══════════════════════\n', 'info');

    const effectiveDefault = configuredProviders.includes(fileConfig.providers.default)
      ? fileConfig.providers.default
      : configuredProviders[0];

    context.onOutput('Available providers:', 'info');
    for (const wizard of providerWizards) {
      const isConfigured = configuredProviders.includes(wizard.name as ProviderName);
      const isDefault = effectiveDefault === wizard.name;
      const status = isDefault ? '✓ default' : isConfigured ? '✓ configured' : '○ not configured';
      const statusColor = isDefault || isConfigured ? 'success' : 'info';

      context.onOutput(
        `  ${wizard.name.padEnd(12)} ${wizard.displayName.padEnd(16)} [${status}]`,
        statusColor
      );
    }

    context.onOutput('\nCommands:', 'info');
    context.onOutput('  config provider <name>              Interactive wizard', 'info');
    context.onOutput('  config provider set <name> k=v ...  Non-interactive set', 'info');
    context.onOutput('  config provider default <name>      Set default', 'info');
    context.onOutput('  config provider remove <name>       Remove provider', 'info');

    return { success: true, message: 'Listed providers' };
  }

  // Handle 'default' action
  if (action === 'default') {
    if (providerArg === undefined || providerArg === '') {
      context.onOutput('Usage: config provider default <provider-name>', 'error');
      context.onOutput('Available providers: ' + PROVIDER_NAMES.join(', '), 'info');
      return { success: false, message: 'Provider name required' };
    }

    const providerName = providerArg.toLowerCase();
    if (!isValidProviderName(providerName)) {
      context.onOutput(`Unknown provider: ${providerArg}`, 'error');
      context.onOutput('Available providers: ' + PROVIDER_NAMES.join(', '), 'info');
      return { success: false, message: 'Invalid provider name' };
    }

    // Check if provider is configured
    const configuredProviders = getConfiguredProviders(fileConfig);
    if (!configuredProviders.includes(providerName)) {
      context.onOutput(`Provider '${providerName}' is not configured.`, 'warning');
      context.onOutput(`Run 'config provider ${providerName}' to configure it first.`, 'info');
      return { success: false, message: 'Provider not configured' };
    }

    // Update default provider - use fileConfig to avoid saving env vars
    const newConfig: AppConfig = {
      ...fileConfig,
      providers: {
        ...fileConfig.providers,
        default: providerName,
      },
    };

    const manager = new ConfigManager();
    const saveResult = await manager.save(newConfig);

    if (!saveResult.success) {
      context.onOutput(`Failed to save: ${saveResult.message}`, 'error');
      return { success: false, message: saveResult.message };
    }

    context.onOutput(`\nDefault provider set to: ${providerName}`, 'success');
    return { success: true, message: `Default provider set to ${providerName}` };
  }

  // Handle 'set' action - non-interactive configuration for AI/scripts
  if (action === 'set') {
    if (providerArg === undefined || providerArg === '') {
      context.onOutput('Usage: config provider set <provider> key=value [key=value...]', 'error');
      context.onOutput(
        'Example: config provider set local baseUrl=http://localhost:11434/v1 model=qwen3:latest',
        'info'
      );
      context.onOutput('Available providers: ' + PROVIDER_NAMES.join(', '), 'info');
      return { success: false, message: 'Provider name required' };
    }

    const targetProvider = providerArg.toLowerCase();
    if (!isValidProviderName(targetProvider)) {
      context.onOutput(`Unknown provider: ${providerArg}`, 'error');
      context.onOutput('Available providers: ' + PROVIDER_NAMES.join(', '), 'info');
      return { success: false, message: 'Invalid provider name' };
    }

    // Parse key=value pairs from remaining args
    const keyValuePairs = parts.slice(2); // Skip 'set' and provider name
    if (keyValuePairs.length === 0) {
      context.onOutput('No configuration values provided', 'error');
      context.onOutput('Usage: config provider set <provider> key=value [key=value...]', 'info');
      context.onOutput('', 'info');
      context.onOutput(`Keys for ${targetProvider}:`, 'info');
      showProviderKeys(targetProvider, context);
      return { success: false, message: 'No values provided' };
    }

    // Whitelist of known numeric fields across all providers
    // Only these fields will be auto-converted to numbers
    const numericFields = new Set([
      'temperature',
      'maxRetries',
      'timeout',
      'maxTokens',
      'topP',
      'topK',
      'frequencyPenalty',
      'presencePenalty',
      'maxConcurrency',
      'retryDelay',
      'maxResponseTokens',
      'n', // number of completions
    ]);

    const providerConfig: Record<string, unknown> = {};
    for (const pair of keyValuePairs) {
      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) {
        context.onOutput(`Invalid format: ${pair} (expected key=value)`, 'error');
        return { success: false, message: 'Invalid key=value format' };
      }
      const key = pair.slice(0, eqIndex);
      const value = pair.slice(eqIndex + 1);

      // Convert boolean strings
      if (value === 'true') {
        providerConfig[key] = true;
      } else if (value === 'false') {
        providerConfig[key] = false;
      } else if (numericFields.has(key) && !isNaN(Number(value)) && value !== '') {
        // Only convert to number if the key is in the whitelist
        providerConfig[key] = Number(value);
      } else {
        // Keep as string for all other fields (API keys, model names, URLs, etc.)
        providerConfig[key] = value;
      }
    }

    // Merge with existing file-based provider config (not env vars)
    const existingProviderConfig = fileConfig.providers[targetProvider] as
      | Record<string, unknown>
      | undefined;
    const mergedProviderConfig = { ...(existingProviderConfig ?? {}), ...providerConfig };

    // Determine if this should be the default
    const configuredProviders = getConfiguredProviders(fileConfig);
    const setAsDefault = configuredProviders.length === 0;

    // Build new config - use fileConfig to avoid saving env vars
    const newConfig: AppConfig = {
      ...fileConfig,
      providers: {
        ...fileConfig.providers,
        default: setAsDefault ? targetProvider : fileConfig.providers.default,
        [targetProvider]: mergedProviderConfig,
      },
    };

    // Save
    const manager = new ConfigManager();
    const saveResult = await manager.save(newConfig);

    if (!saveResult.success) {
      context.onOutput(`Failed to save: ${saveResult.message}`, 'error');
      return { success: false, message: saveResult.message };
    }

    const defaultNote = setAsDefault ? ' (set as default)' : '';
    context.onOutput(`✓ ${targetProvider} configured${defaultNote}`, 'success');
    return { success: true, message: `${targetProvider} configured` };
  }

  // Handle 'remove' action
  if (action === 'remove') {
    if (providerArg === undefined || providerArg === '') {
      context.onOutput('Usage: config provider remove <provider>', 'error');
      context.onOutput('Available providers: ' + PROVIDER_NAMES.join(', '), 'info');
      return { success: false, message: 'Provider name required' };
    }

    const targetProvider = providerArg.toLowerCase();
    if (!isValidProviderName(targetProvider)) {
      context.onOutput(`Unknown provider: ${providerArg}`, 'error');
      context.onOutput('Available providers: ' + PROVIDER_NAMES.join(', '), 'info');
      return { success: false, message: 'Invalid provider name' };
    }

    // Check if provider is configured
    const configuredProviders = getConfiguredProviders(fileConfig);
    if (!configuredProviders.includes(targetProvider)) {
      context.onOutput(`Provider '${targetProvider}' is not configured.`, 'warning');
      return { success: false, message: 'Provider not configured' };
    }

    // If removing the default, pick a new default
    let newDefault: ProviderName = config.providers.default;
    if (newDefault === targetProvider) {
      const remaining = configuredProviders.filter((p) => p !== targetProvider);
      const firstRemaining = remaining[0];
      newDefault = firstRemaining !== undefined ? firstRemaining : 'openai'; // Fallback to schema default
    }

    // Build new providers without the removed one - use fileConfig to avoid saving env vars
    const newConfig: AppConfig = {
      ...fileConfig,
      providers: {
        ...fileConfig.providers,
        default: newDefault,
        [targetProvider]:
          undefined as unknown as (typeof fileConfig.providers)[typeof targetProvider],
      },
    };

    // Save
    const manager = new ConfigManager();
    const saveResult = await manager.save(newConfig);

    if (!saveResult.success) {
      context.onOutput(`Failed to save: ${saveResult.message}`, 'error');
      return { success: false, message: saveResult.message };
    }

    context.onOutput(`✓ ${targetProvider} removed`, 'success');
    if (config.providers.default === targetProvider) {
      context.onOutput(`  New default: ${newDefault}`, 'info');
    }
    return { success: true, message: `${targetProvider} removed` };
  }

  // Configure a specific provider (interactive)
  const providerName = action.toLowerCase();
  const wizard = providerWizards.find((w) => w.name === providerName);

  if (!wizard) {
    context.onOutput(`Unknown provider: ${action}`, 'error');
    context.onOutput('Available providers: ' + PROVIDER_NAMES.join(', '), 'info');
    return { success: false, message: 'Invalid provider name' };
  }

  // Check for interactive mode
  if (!context.onPrompt) {
    context.onOutput('Interactive mode required for provider configuration', 'error');
    return { success: false, message: 'No prompt handler available' };
  }

  context.onOutput(`\nConfiguring ${wizard.displayName}`, 'success');
  context.onOutput('═'.repeat(30) + '\n', 'info');

  // Run the provider wizard
  const wizardResult = await wizard.wizard(context);

  if (!wizardResult.success) {
    context.onOutput(`\nSetup failed: ${wizardResult.message}`, 'error');
    return { success: false, message: wizardResult.message };
  }

  // Validate provider name
  if (!isValidProviderName(wizard.name)) {
    context.onOutput(`Invalid provider name: ${wizard.name}`, 'error');
    return { success: false, message: 'Invalid provider name' };
  }

  // Ask if this should be the default provider
  const configuredProviders = getConfiguredProviders(fileConfig);
  let setAsDefault = configuredProviders.length === 0; // Auto-default if first provider

  if (!setAsDefault && configuredProviders.length > 0) {
    const makeDefault = await context.onPrompt('\nSet as default provider? (y/N):');
    setAsDefault = makeDefault.toLowerCase().startsWith('y');
  }

  // Merge provider config - use fileConfig to avoid saving env vars
  const newConfig: AppConfig = {
    ...fileConfig,
    providers: {
      ...fileConfig.providers,
      default: setAsDefault ? wizard.name : fileConfig.providers.default,
      [wizard.name]: wizardResult.config,
    },
  };

  // Save configuration
  context.onOutput('\nSaving configuration...', 'info');

  const manager = new ConfigManager();
  const saveResult = await manager.save(newConfig);

  if (!saveResult.success) {
    context.onOutput(`Failed to save: ${saveResult.message}`, 'error');
    return { success: false, message: saveResult.message };
  }

  context.onOutput('\nConfiguration saved successfully!', 'success');
  context.onOutput(`  Provider: ${wizard.displayName}`, 'info');
  if (setAsDefault) {
    context.onOutput(`  Set as default: yes`, 'info');
  }
  context.onOutput('  Location: ~/.agent/config.yaml\n', 'info');

  return { success: true, message: `${wizard.displayName} configured successfully` };
};
