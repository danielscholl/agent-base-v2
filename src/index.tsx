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

const cli = meow(
  `
  Usage
    $ agent [options]
    $ agent config [show|init|edit]
    $ agent skill [list|info|validate]
    $ agent -p <prompt> [options]

  Commands
    config                 Manage agent configuration
      config show          Display current configuration
      config init          Interactive configuration setup
      config edit          Edit configuration fields

    skill                  Manage agent skills
      skill list           List available skills
      skill info <name>    Show skill details
      skill validate       Validate skill file

  Options
    -p, --prompt <text>    Execute single prompt and exit
    --check                Show configuration and connectivity
    --tools                Show tool configuration
    --version              Show version
    --provider <name>      Override provider (openai|anthropic|azure|...)
    --model <name>         Override model name
    --continue             Resume last session
    --verbose              Show detailed execution

  Interactive Commands
    /help                  Show all available commands
    /save [name]           Save current session
    /history               Show conversation history
    /clear                 Clear conversation
    /exit                  Exit the agent
`,
  {
    importMeta: import.meta,
    flags: {
      prompt: { type: 'string', shortFlag: 'p' },
      check: { type: 'boolean', default: false },
      tools: { type: 'boolean', default: false },
      version: { type: 'boolean', default: false },
      provider: { type: 'string' },
      model: { type: 'string' },
      continue: { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
    },
  }
);

// Handle subcommands before rendering React
const [command, ...restArgs] = cli.input;

if (command === 'config') {
  const context = await createCliContext();
  const subArgs = restArgs.join(' ');
  const result = await configHandler(subArgs, context);
  process.exit(result.success ? 0 : 1);
}

if (command === 'skill') {
  const context = await createCliContext();
  const subArgs = restArgs.join(' ');
  const result = await skillHandler(subArgs, context);
  process.exit(result.success ? 0 : 1);
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
  version: cli.flags.version,
  provider: cli.flags.provider,
  model: cli.flags.model,
  continue: cli.flags.continue,
  verbose: cli.flags.verbose,
};

const { waitUntilExit } = render(<CLI flags={flags} />);
await waitUntilExit();
