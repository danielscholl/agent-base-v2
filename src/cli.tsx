/**
 * CLI router component.
 * Routes to appropriate mode (HealthCheck, ToolsInfo, SinglePrompt, InteractiveShell)
 * based on parsed CLI flags.
 *
 * Note: --version is handled by meow's autoVersion feature before this runs.
 */

import React from 'react';
import type { CLIProps } from './cli/types.js';
import { HealthCheck } from './components/HealthCheck.js';
import { ToolsInfo } from './components/ToolsInfo.js';
import { SinglePrompt } from './components/SinglePrompt.js';
import { InteractiveShell } from './components/InteractiveShell.js';

/**
 * Main CLI router component.
 * Inspects flags and renders the appropriate mode component.
 *
 * Priority order:
 * 1. --check → HealthCheck
 * 2. --tools → ToolsInfo
 * 3. -p/--prompt → SinglePrompt
 * 4. (default) → InteractiveShell
 *
 * Note: --version is handled by meow before rendering.
 */
export function CLI({ flags }: CLIProps): React.ReactElement {
  // Health check display
  if (flags.check === true) {
    return <HealthCheck />;
  }

  // Tools info display
  if (flags.tools === true) {
    return <ToolsInfo />;
  }

  // Single prompt mode
  if (flags.prompt !== undefined && flags.prompt !== '') {
    return <SinglePrompt prompt={flags.prompt} verbose={flags.verbose} />;
  }

  // Default: Interactive mode
  return <InteractiveShell resumeSession={flags.continue} verbose={flags.verbose} />;
}
