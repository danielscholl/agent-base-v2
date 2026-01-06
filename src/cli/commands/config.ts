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
import { getWorkspaceInfo } from '../../tools/workspace.js';

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
    case 'show':
      return configShowHandler(subArgs, context);
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
    case 'workspace':
      // Workspace command - read-only operations allowed in interactive mode
      // Set/clear operations will check isInteractive inside the handler
      return configWorkspaceHandler(subArgs, context);
    default:
      context.onOutput(`Unknown subcommand: ${subcommand ?? ''}`, 'warning');
      context.onOutput('Run "agent config --help" for usage.', 'info');
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
 * ANSI color codes for table output.
 */
const ansi = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
};

/**
 * Create a table row with proper padding and coloring.
 */
function tableRow(
  setting: string,
  value: string,
  settingWidth: number,
  valueWidth: number,
  isHeader = false
): string {
  const paddedSetting = setting.padEnd(settingWidth);
  const paddedValue = value.padEnd(valueWidth);

  if (isHeader) {
    // Header row: cyan text
    return `│ ${ansi.cyan}${paddedSetting}${ansi.reset} │ ${ansi.cyan}${paddedValue}${ansi.reset} │`;
  } else {
    // Data row: yellow setting, white value
    return `│ ${ansi.yellow}${paddedSetting}${ansi.reset} │ ${paddedValue} │`;
  }
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
      // Handle foundry specially - show mode and appropriate settings
      if (defaultProvider === 'foundry') {
        const mode = (defaultConfig.mode as string | undefined) ?? 'cloud';
        rows.push({
          setting: `  ${defaultProvider} Mode`,
          value: mode,
        });

        if (mode === 'local') {
          // Local mode: show modelAlias
          const modelAlias = defaultConfig.modelAlias as string | undefined;
          if (modelAlias !== undefined) {
            rows.push({
              setting: `  ${defaultProvider} Model`,
              value: modelAlias,
            });
          }
        } else {
          // Cloud mode: show endpoint and deployment
          const endpoint = defaultConfig.projectEndpoint as string | undefined;
          if (endpoint !== undefined) {
            rows.push({
              setting: `  ${defaultProvider} Endpoint`,
              value: endpoint,
            });
          }
          const modelDeployment = defaultConfig.modelDeployment as string | undefined;
          if (modelDeployment !== undefined) {
            rows.push({
              setting: `  ${defaultProvider} Deployment`,
              value: modelDeployment,
            });
          }
        }
      } else if (defaultProvider === 'azure') {
        // Azure: show endpoint and deployment
        const endpoint = defaultConfig.endpoint as string | undefined;
        if (endpoint !== undefined) {
          rows.push({
            setting: `  ${defaultProvider} Endpoint`,
            value: endpoint,
          });
        }
        const deployment = defaultConfig.deployment as string | undefined;
        if (deployment !== undefined) {
          rows.push({
            setting: `  ${defaultProvider} Deployment`,
            value: deployment,
          });
        }
      } else {
        // Other providers: show model
        const model = defaultConfig.model as string | undefined;
        if (model !== undefined) {
          rows.push({
            setting: `  ${defaultProvider} Model`,
            value: model,
          });
        }
      }
    }
  }

  // Telemetry row
  const telemetryParts: string[] = [config.telemetry.enabled ? 'Enabled' : 'Disabled'];
  if (config.telemetry.enabled) {
    telemetryParts.push(
      config.telemetry.enableSensitiveData ? 'sensitive data: on' : 'sensitive data: off'
    );
  }
  rows.push({
    setting: 'Telemetry',
    value: telemetryParts.join(', '),
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

  // Workspace Root row - get effective workspace and source (read-only, no env mutation)
  const workspaceResult = await getWorkspaceInfo(fileConfig.agent.workspaceRoot);
  rows.push({
    setting: 'Workspace Root',
    value: workspaceResult.workspaceRoot,
  });

  // Source indicator - map source to human-readable string
  const sourceLabels: Record<'env' | 'config' | 'cwd', string> = {
    env: 'env variable',
    config: 'config file',
    cwd: 'current directory',
  };
  let sourceValue = sourceLabels[workspaceResult.source];

  // If there's a warning (config was overridden by env), show indicator
  if (workspaceResult.warning !== undefined) {
    sourceValue = `${sourceValue} (⚠ config overridden)`;
  }

  rows.push({
    setting: '  Source',
    value: sourceValue,
  });

  // Calculate column widths
  const settingWidth = Math.max(...rows.map((r) => r.setting.length), 'Setting'.length);
  const valueWidth = Math.max(...rows.map((r) => r.value.length), 'Value'.length);

  // Build table
  const topBorder = `┏${'━'.repeat(settingWidth + 2)}┳${'━'.repeat(valueWidth + 2)}┓`;
  const headerSep = `┡${'━'.repeat(settingWidth + 2)}╇${'━'.repeat(valueWidth + 2)}┩`;
  const bottomBorder = `└${'─'.repeat(settingWidth + 2)}┴${'─'.repeat(valueWidth + 2)}┘`;

  // Output title (white/default)
  context.onOutput('');
  context.onOutput('                            Agent Configuration');

  // Output table (white borders, colored content)
  context.onOutput(topBorder);
  context.onOutput(tableRow('Setting', 'Value', settingWidth, valueWidth, true)); // header row
  context.onOutput(headerSep);

  for (const row of rows) {
    context.onOutput(tableRow(row.setting, row.value, settingWidth, valueWidth));
  }

  context.onOutput(bottomBorder);

  // Output config file location (white label, yellow path)
  context.onOutput('');
  context.onOutput(`Configuration file: ${ansi.yellow}~/.agent/config.yaml${ansi.reset}`);

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
 * Handler for /config workspace command.
 * Manages workspace root configuration.
 *
 * Usage:
 *   config workspace           - Show current workspace root with source
 *   config workspace set <path> - Set workspace root in config
 *   config workspace clear      - Remove workspace root from config
 */
export const configWorkspaceHandler: CommandHandler = async (
  args,
  context
): Promise<CommandResult> => {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  const [action, ...rest] = parts;

  // Load file-only config (not env vars)
  const fileConfigResult = await loadConfigFromFiles();
  const fileConfig: AppConfig = fileConfigResult.success
    ? (fileConfigResult.result as AppConfig)
    : getDefaultConfig();

  // Get effective workspace root with source information (read-only, no env mutation)
  const workspaceResult = await getWorkspaceInfo(fileConfig.agent.workspaceRoot);

  // Human-readable source labels
  const sourceLabels: Record<'env' | 'config' | 'cwd', string> = {
    env: 'env variable (AGENT_WORKSPACE_ROOT)',
    config: 'config file (~/.agent/config.yaml)',
    cwd: 'current directory',
  };

  // No action - display current workspace
  if (action === undefined || action === '') {
    context.onOutput('');
    context.onOutput(`${ansi.yellow}Workspace Configuration${ansi.reset}`);
    context.onOutput('');
    context.onOutput(`  Current:  ${ansi.cyan}${workspaceResult.workspaceRoot}${ansi.reset}`);
    context.onOutput(`  Source:   ${sourceLabels[workspaceResult.source]}`);

    // Show warning if config was overridden
    if (workspaceResult.warning !== undefined) {
      context.onOutput('');
      context.onOutput(`  ${ansi.yellow}⚠ Warning:${ansi.reset} ${workspaceResult.warning}`);
    }

    // Show configured value if different from effective
    if (fileConfig.agent.workspaceRoot !== undefined && fileConfig.agent.workspaceRoot !== '') {
      if (workspaceResult.source === 'env') {
        context.onOutput('');
        context.onOutput(
          `  Config value: ${ansi.cyan}${fileConfig.agent.workspaceRoot}${ansi.reset} (not used)`
        );
      }
    }

    context.onOutput('');
    return { success: true, data: workspaceResult };
  }

  // Handle 'set' action
  if (action === 'set') {
    let pathArg = rest.join(' ');

    // If no path provided and we have prompts, ask interactively
    if (pathArg === '' && context.onPrompt !== undefined) {
      context.onOutput('');
      pathArg = await context.onPrompt('Enter workspace root path:');
      if (pathArg.trim() === '') {
        context.onOutput('No path provided, operation cancelled.', 'warning');
        return { success: false, message: 'No path provided' };
      }
    } else if (pathArg === '') {
      context.onOutput('Usage: agent config workspace set <path>', 'error');
      context.onOutput('Examples:', 'info');
      context.onOutput('  agent config workspace set ~/projects', 'info');
      context.onOutput('  agent config workspace set ./myproject', 'info');
      context.onOutput('  agent config workspace set /absolute/path', 'info');
      return { success: false, message: 'Path required' };
    }

    // Expand ~ and resolve to absolute path
    const expandedPath = pathArg.startsWith('~')
      ? pathArg.replace('~', process.env.HOME ?? process.env.USERPROFILE ?? '')
      : pathArg;
    const absolutePath = expandedPath.startsWith('/')
      ? expandedPath
      : (await import('node:path')).resolve(process.cwd(), expandedPath);

    // Check if path exists
    const fs = await import('node:fs/promises');
    let pathExists = false;
    let isDirectory = false;
    try {
      const stat = await fs.stat(absolutePath);
      pathExists = true;
      isDirectory = stat.isDirectory();
    } catch {
      pathExists = false;
    }

    if (pathExists && !isDirectory) {
      context.onOutput(`Warning: ${absolutePath} is not a directory`, 'warning');
    }

    // If path doesn't exist and we have prompts, offer to create it
    if (!pathExists && context.onPrompt !== undefined) {
      const create = await context.onPrompt(
        `Directory ${absolutePath} does not exist. Create it? (y/N):`
      );
      if (create.toLowerCase().startsWith('y')) {
        try {
          await fs.mkdir(absolutePath, { recursive: true });
          context.onOutput(`Created directory: ${absolutePath}`, 'success');
        } catch (err) {
          context.onOutput(
            `Failed to create directory: ${err instanceof Error ? err.message : String(err)}`,
            'error'
          );
          return { success: false, message: 'Failed to create directory' };
        }
      } else {
        context.onOutput(`Note: ${absolutePath} does not exist yet`, 'warning');
      }
    } else if (!pathExists) {
      context.onOutput(`Note: ${absolutePath} does not exist yet`, 'warning');
    }

    // Update config
    const newConfig: AppConfig = {
      ...fileConfig,
      agent: {
        ...fileConfig.agent,
        workspaceRoot: absolutePath,
      },
    };

    const manager = new ConfigManager();
    const saveResult = await manager.save(newConfig);

    if (!saveResult.success) {
      context.onOutput(`Failed to save: ${saveResult.message}`, 'error');
      return { success: false, message: saveResult.message };
    }

    context.onOutput(
      `${ansi.cyan}✓${ansi.reset} Workspace root set to: ${absolutePath}`,
      'success'
    );

    // Warn if env var will override this
    const envRoot = process.env['AGENT_WORKSPACE_ROOT'];
    if (envRoot !== undefined && envRoot !== '') {
      context.onOutput('');
      context.onOutput(
        `${ansi.yellow}⚠ Note:${ansi.reset} AGENT_WORKSPACE_ROOT env var is set and will override this config`,
        'warning'
      );
    }

    return { success: true, message: `Workspace set to ${absolutePath}` };
  }

  // Handle 'clear' action
  if (action === 'clear') {
    // Remove workspaceRoot from config
    const newConfig: AppConfig = {
      ...fileConfig,
      agent: {
        ...fileConfig.agent,
        workspaceRoot: undefined,
      },
    };

    const manager = new ConfigManager();
    const saveResult = await manager.save(newConfig);

    if (!saveResult.success) {
      context.onOutput(`Failed to save: ${saveResult.message}`, 'error');
      return { success: false, message: saveResult.message };
    }

    context.onOutput(`${ansi.cyan}✓${ansi.reset} Workspace root cleared from config`, 'success');
    context.onOutput('  Will use current directory or AGENT_WORKSPACE_ROOT env var', 'info');

    return { success: true, message: 'Workspace cleared' };
  }

  // Unknown action
  context.onOutput(`Unknown workspace command: ${action}`, 'error');
  context.onOutput('Usage:', 'info');
  context.onOutput('  agent config workspace           Show current workspace', 'info');
  context.onOutput('  agent config workspace set <path>  Set workspace root', 'info');
  context.onOutput('  agent config workspace clear       Clear workspace from config', 'info');
  return { success: false, message: 'Unknown command' };
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

      context.onOutput('');
      context.onOutput(`${ansi.yellow}Agent Configuration Setup${ansi.reset}`);
      context.onOutput('');
      context.onOutput('Select LLM Provider:');

      // Show numbered list of providers (matching osdu-agent format)
      for (let i = 0; i < providerWizards.length; i++) {
        const provider = providerWizards[i];
        if (provider) {
          const num = `${ansi.cyan}${String(i + 1)}.${ansi.reset}`;
          const name = provider.name.padEnd(10);
          context.onOutput(`${num} ${name} - ${provider.description}`);
        }
      }
      context.onOutput('');

      const defaultChoice = `${ansi.cyan}(1)${ansi.reset}`;
      const choice = await context.onPrompt(`Which provider do you want to use? ${defaultChoice}:`);
      // Default to 1 if empty
      const providerIndex = (choice.trim() === '' ? 1 : parseInt(choice, 10)) - 1;

      if (isNaN(providerIndex) || providerIndex < 0 || providerIndex >= providerWizards.length) {
        context.onOutput('Invalid selection.', 'error');
        return { success: false, message: 'Invalid provider selection' };
      }

      const selectedProvider = providerWizards[providerIndex];
      if (!selectedProvider) {
        return { success: false, message: 'Invalid provider selection' };
      }

      // Run the wizard for the selected provider
      context.onOutput('');
      context.onOutput(`Configuring ${ansi.cyan}${selectedProvider.displayName}${ansi.reset}...`);
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

      context.onOutput('');
      context.onOutput(
        `${ansi.cyan}✓${ansi.reset} ${selectedProvider.displayName} configured as default provider`
      );
      context.onOutput(
        `  Config saved to: ${ansi.yellow}${manager.getUserConfigPath()}${ansi.reset}`
      );
      return { success: true, message: `${selectedProvider.name} configured` };
    }

    // Providers exist - show status list
    context.onOutput('', 'info');
    context.onOutput('Provider Status', 'success');
    context.onOutput('', 'info');

    const effectiveDefault = configuredProviders.includes(fileConfig.providers.default)
      ? fileConfig.providers.default
      : configuredProviders[0];

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

    context.onOutput('', 'info');
    context.onOutput('Run "agent config provider --help" for commands.', 'info');

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

  context.onOutput('');
  context.onOutput(`Configuring ${ansi.cyan}${wizard.displayName}${ansi.reset}`);
  context.onOutput('═'.repeat(30));
  context.onOutput('');

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
  context.onOutput('');
  context.onOutput('Saving configuration...');

  const manager = new ConfigManager();
  const saveResult = await manager.save(newConfig);

  if (!saveResult.success) {
    context.onOutput(`Failed to save: ${saveResult.message}`, 'error');
    return { success: false, message: saveResult.message };
  }

  context.onOutput('');
  context.onOutput(`${ansi.cyan}✓${ansi.reset} Configuration saved successfully!`);
  context.onOutput(`  Provider: ${ansi.cyan}${wizard.displayName}${ansi.reset}`);
  if (setAsDefault) {
    context.onOutput(`  Set as default: yes`);
  }
  context.onOutput(`  Location: ${ansi.yellow}~/.agent/config.yaml${ansi.reset}`);
  context.onOutput('');

  return { success: true, message: `${wizard.displayName} configured successfully` };
};
