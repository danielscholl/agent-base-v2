#!/usr/bin/env bun
/**
 * CLI entry point for the agent framework.
 * Parses command-line arguments with meow and renders the appropriate mode.
 */

import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import { CLI } from './cli.js';
import type { CLIFlags } from './cli/types.js';

const cli = meow(
  `
  Usage
    $ agent [options]
    $ agent -p <prompt> [options]

  Options
    -p, --prompt <text>    Execute single prompt and exit
    --check                Show configuration and connectivity
    --tools                Show tool configuration
    --version              Show version
    --provider <name>      Override provider
    --model <name>         Override model name
    --continue             Resume last session
    --verbose              Show detailed execution

  Examples
    $ agent                           # Interactive mode
    $ agent -p "Say hello"            # Single prompt
    $ agent --provider anthropic      # Use specific provider
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
