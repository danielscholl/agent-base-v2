#!/usr/bin/env bun
/**
 * CLI entry point for the agent framework.
 * Parses command-line arguments with meow and renders the appropriate mode.
 * Handles subcommands (config, skill) before rendering React.
 */

import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import { CLI } from './cli.js';
import type { CLIFlags } from './cli/types.js';
import { createCliContext } from './cli/cli-context.js';
import { configHandler } from './cli/commands/config.js';
import { skillHandler } from './cli/commands/skills.js';
import { updateHandler } from './cli/commands/update.js';
import { telemetryHandler } from './cli/commands/telemetry.js';
import { VERSION } from './cli/version.js';
import { getSandboxStatus, executeSandbox } from './sandbox/index.js';

const cli = meow(
  `
  Usage: agent [OPTIONS] COMMAND [ARGS]...

  Commands
    config        Manage agent configuration
    skill         Manage agent skills
    telemetry     Manage telemetry dashboard
    update        Check for and install updates

  Options
    -p, --prompt  Execute single prompt and exit (supports slash commands)
    --check       Show configuration and connectivity
    --tools       Show tool configuration
    --version     Show version
    --provider    Override provider
    --model       Override model name
    --continue    Resume last session
    --verbose     Show detailed execution
    --sandbox     Run inside Docker container

  Examples
    agent -p "What is TypeScript?"    Run a single query
    agent -p "/greet World"           Execute custom command
    agent -p "/help"                  Show help and exit
    agent --continue -p "And more?"   Continue last session

  Run 'agent <command> --help' for command details.
`,
  {
    importMeta: import.meta,
    version: VERSION,
    flags: {
      prompt: { type: 'string', shortFlag: 'p' },
      check: { type: 'boolean', default: false },
      tools: { type: 'boolean', default: false },
      provider: { type: 'string' },
      model: { type: 'string' },
      continue: { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
      sandbox: { type: 'boolean', default: false },
    },
  }
);

// Handle subcommands before rendering React
const [command, ...restArgs] = cli.input;

// Check if --help was passed (root meow consumes it, so check process.argv)
const wantsHelp = process.argv.includes('--help') || process.argv.includes('-h');

if (command === 'config') {
  // Check for nested subcommands first
  if (restArgs[0] === 'provider') {
    // Pass --help to subcommand meow if requested
    const providerArgv = wantsHelp ? ['--help'] : restArgs.slice(1);
    meow(
      `
  Usage: agent config provider [command]

    Manage provider configurations

  Commands
    (none)              List providers (or setup wizard)
    <name>              Interactive wizard for provider
    set <name> k=v      Non-interactive configuration
    default <name>      Set default provider
    remove <name>       Remove provider configuration

  Providers: local, openai, anthropic, azure, foundry, gemini, github
`,
      { importMeta: import.meta, argv: providerArgv, description: false }
    );
  } else if (restArgs[0] === 'workspace') {
    // Pass --help to subcommand meow if requested
    const workspaceArgv = wantsHelp ? ['--help'] : restArgs.slice(1);
    meow(
      `
  Usage: agent config workspace [command]

    Manage workspace root configuration

  Commands
    (none)              Show current workspace root and source
    set <path>          Set workspace root in config file
    clear               Remove workspace root from config

  Examples
    agent config workspace                 Show workspace info
    agent config workspace set ~/projects  Set workspace to ~/projects
    agent config workspace set ./myapp     Set workspace to relative path
    agent config workspace clear           Clear workspace (use cwd)

  Notes
    - AGENT_WORKSPACE_ROOT env var takes precedence over config
    - Relative paths are resolved from current directory
    - ~ is expanded to home directory
`,
      { importMeta: import.meta, argv: workspaceArgv, description: false }
    );
  } else {
    // Show help if --help requested OR no subcommand provided (like osdu-agent)
    const configArgv = wantsHelp || restArgs.length === 0 ? ['--help'] : restArgs;
    meow(
      `
  Usage: agent config [command]

    Manage agent configuration

  Commands
    show             Display current configuration
    init             Interactive configuration wizard
    edit             Open config file in text editor
    provider         Manage provider configurations
    workspace        Manage workspace root setting

  Run 'agent config <command> --help' for subcommand details.
`,
      { importMeta: import.meta, argv: configArgv, description: false }
    );
  }

  const context = await createCliContext();
  const result = await configHandler(restArgs.join(' '), context);
  process.exit(result.success ? 0 : 1);
}

if (command === 'skill') {
  // Pass --help to subcommand meow if requested
  const skillArgv = wantsHelp ? ['--help'] : restArgs;
  meow(
    `
  Usage: agent skill [command]

    Manage agent skills (bundled and plugins)

  Commands
    show                    Show all skills with status
    install <url>           Install plugin from git repository
    manage                  Manage skills (enable/disable/update/remove)

  Examples
    agent skill                           Show all skills
    agent skill show                      Show all skills with status
    agent skill install <git-url>         Install a plugin skill
    agent skill manage disable gh         Disable the gh skill
    agent skill manage list               List installed plugins
`,
    { importMeta: import.meta, argv: skillArgv, description: false }
  );

  const context = await createCliContext();
  const result = await skillHandler(restArgs.join(' '), context);
  process.exit(result.success ? 0 : 1);
}

if (command === 'update') {
  // Pass --help to subcommand meow if requested
  const updateArgv = wantsHelp ? ['--help'] : restArgs;
  meow(
    `
  Usage: agent update [options]

    Check for and install updates from GitHub

  Options
    --check        Check for updates without installing
    --force        Force reinstall even if up to date

  Examples
    agent update              Update to latest version
    agent update --check      Check for updates only
    agent update --force      Force reinstall
`,
    { importMeta: import.meta, argv: updateArgv, description: false }
  );

  const context = await createCliContext();
  const result = await updateHandler(restArgs.join(' '), context);
  process.exit(result.success ? 0 : 1);
}

if (command === 'telemetry') {
  // Pass --help to subcommand meow if requested
  const telemetryArgv = wantsHelp ? ['--help'] : restArgs;
  meow(
    `
  Usage: agent telemetry [command]

    Manage telemetry dashboard (Aspire)

  Commands
    start          Start the telemetry dashboard
    stop           Stop the telemetry dashboard
    status         Check if dashboard is running
    url            Show dashboard URLs

  Examples
    agent telemetry start     Start Aspire dashboard
    agent telemetry status    Check dashboard status
`,
    { importMeta: import.meta, argv: telemetryArgv, description: false }
  );

  const context = await createCliContext();
  const result = await telemetryHandler(restArgs.join(' '), context);
  process.exit(result.success ? 0 : 1);
}

// Handle --sandbox flag: re-exec inside Docker container
if (cli.flags.sandbox) {
  const status = getSandboxStatus();
  if (!status.isInSandbox) {
    // Not in sandbox - execute inside Docker
    const debug = cli.flags.verbose ? console.error : () => {};

    // Check if interactive mode is requested but no TTY is available
    const hasPromptArg = cli.flags.prompt !== undefined && cli.flags.prompt !== '';
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const stdinIsTTY = process.stdin.isTTY ?? false;
    const wantsInteractive = !hasPromptArg && !cli.flags.check && !cli.flags.tools;

    if (wantsInteractive && !stdinIsTTY) {
      console.error(
        '[sandbox] Error: Interactive mode requires a terminal (TTY).\n' +
          '  Use -p/--prompt for non-interactive mode, or run from a real terminal.\n' +
          '  Example: agent --sandbox -p "your prompt here"'
      );
      process.exit(1);
    }

    debug('[sandbox] Launching in Docker container...');

    const result = await executeSandbox({
      agentArgs: process.argv.slice(2),
      // configPath is auto-detected from AGENT_HOME or defaults to ~/.agent
      onDebug: debug,
    });

    if (!result.success) {
      console.error(`[sandbox] Error: ${result.message}`);
    }

    process.exit(result.result ?? (result.success ? 0 : 1));
  }
  // Already in sandbox - fall through to normal execution
  if (cli.flags.verbose) {
    console.error(`[sandbox] Running inside container (${status.detectionMethod})`);
  }
}

// Apply overrides to environment before rendering
if (cli.flags.provider !== undefined && cli.flags.provider !== '') {
  process.env.LLM_PROVIDER = cli.flags.provider;
}
if (cli.flags.model !== undefined && cli.flags.model !== '') {
  process.env.AGENT_MODEL = cli.flags.model;
}

// Cast meow flags to our CLIFlags type
const flags: CLIFlags = {
  prompt: cli.flags.prompt,
  check: cli.flags.check,
  tools: cli.flags.tools,
  provider: cli.flags.provider,
  model: cli.flags.model,
  continue: cli.flags.continue,
  verbose: cli.flags.verbose,
  sandbox: cli.flags.sandbox,
};

const { waitUntilExit } = render(<CLI flags={flags} />);
await waitUntilExit();
