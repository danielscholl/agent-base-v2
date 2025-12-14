/**
 * Telemetry command handler.
 * Wraps src/telemetry/aspire.ts functions for CLI usage.
 */

import type { CommandHandler, CommandResult } from './types.js';
import {
  startAspireDashboardWithConfig,
  stopAspireDashboardWithConfig,
  getAspireStatus,
  getAspireUrl,
} from '../../telemetry/aspire.js';

export const telemetryHandler: CommandHandler = async (args, context): Promise<CommandResult> => {
  const action = args.trim().toLowerCase() || 'help';

  switch (action) {
    case 'start': {
      context.onOutput('Starting telemetry dashboard...', 'info');
      const result = await startAspireDashboardWithConfig({
        autoUpdateConfig: true,
      });

      if (result.success) {
        context.onOutput('Dashboard started successfully!', 'success');
        context.onOutput(`Dashboard: ${result.result.dashboardUrl}`, 'info');
        context.onOutput(`OTLP Endpoint: ${result.result.otlpEndpoint}`, 'info');
        return { success: true };
      } else {
        context.onOutput(`Failed to start dashboard: ${result.message}`, 'error');
        return { success: false, message: result.message };
      }
    }

    case 'stop': {
      context.onOutput('Stopping telemetry dashboard...', 'info');
      const result = await stopAspireDashboardWithConfig({
        autoUpdateConfig: true,
      });

      if (result.success) {
        context.onOutput('Dashboard stopped', 'success');
        return { success: true };
      } else {
        context.onOutput(`Failed to stop dashboard: ${result.message}`, 'error');
        return { success: false, message: result.message };
      }
    }

    case 'status': {
      const result = await getAspireStatus();

      if (result.success) {
        if (result.result.running) {
          context.onOutput('Telemetry dashboard is running', 'success');
          context.onOutput(`Status: ${result.result.uptime ?? 'Unknown'}`, 'info');
          context.onOutput(`Dashboard: ${result.result.dashboardUrl}`, 'info');
          context.onOutput(`OTLP Endpoint: ${result.result.otlpEndpoint}`, 'info');
        } else {
          context.onOutput('Telemetry dashboard is not running', 'warning');
          context.onOutput('Start with: /telemetry start', 'info');
        }
        return { success: true };
      } else {
        context.onOutput(`Failed to get status: ${result.message}`, 'error');
        return { success: false, message: result.message };
      }
    }

    case 'url': {
      const info = getAspireUrl(process.env.ENABLE_OTEL === 'true');
      context.onOutput('Telemetry Dashboard:', 'info');
      context.onOutput(`  ${info.dashboardUrl}`, 'info');
      context.onOutput('', 'info');
      context.onOutput('Telemetry status:', 'info');
      if (info.telemetryStatus === 'enabled') {
        context.onOutput('  Enabled (ENABLE_OTEL=true)', 'success');
      } else if (info.telemetryStatus === 'disabled') {
        context.onOutput('  Disabled (ENABLE_OTEL=false)', 'warning');
      } else {
        context.onOutput('  Auto-detection (activates when dashboard is running)', 'info');
      }
      return { success: true };
    }

    default:
      context.onOutput('Telemetry Commands:', 'info');
      context.onOutput('  /telemetry start   - Start telemetry dashboard', 'info');
      context.onOutput('  /telemetry stop    - Stop telemetry dashboard', 'info');
      context.onOutput('  /telemetry status  - Check if running', 'info');
      context.onOutput('  /telemetry url     - Show URLs and setup', 'info');
      return { success: true };
  }
};
