/**
 * HealthCheck component.
 * Displays configuration and connectivity status.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import { loadConfig } from '../config/manager.js';
import { VERSION } from '../cli/version.js';
import { Spinner } from './Spinner.js';

/**
 * Health check status for a single item.
 */
interface HealthStatus {
  name: string;
  status: 'ok' | 'error' | 'warning';
  message: string;
}

/**
 * HealthCheck component.
 * Shows configuration status, environment, and provider availability.
 */
export function HealthCheck(): React.ReactElement {
  const { exit } = useApp();
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<HealthStatus[]>([]);

  useEffect(() => {
    async function runChecks(): Promise<void> {
      const results: HealthStatus[] = [];

      // System info
      results.push({
        name: 'Platform',
        status: 'ok',
        message: `${process.platform} (${process.arch})`,
      });

      results.push({
        name: 'Node.js',
        status: 'ok',
        message: process.version,
      });

      results.push({
        name: 'Version',
        status: 'ok',
        message: VERSION,
      });

      // Config loading
      const configResult = await loadConfig();
      if (configResult.success) {
        results.push({
          name: 'Config',
          status: 'ok',
          message: 'Loaded successfully',
        });

        // Check default provider - safe to access since success is true
        const config = configResult.result as NonNullable<typeof configResult.result>;
        const provider = config.providers.default;
        results.push({
          name: 'Default Provider',
          status: 'ok',
          message: provider,
        });

        // Check for API key presence (without revealing it)
        const providerConfig = config.providers[provider as keyof typeof config.providers] as
          | Record<string, unknown>
          | undefined;

        if (providerConfig !== undefined) {
          const hasApiKey =
            providerConfig.apiKey !== undefined ||
            providerConfig.token !== undefined ||
            provider === 'local';

          results.push({
            name: 'API Key',
            status: hasApiKey ? 'ok' : 'warning',
            message: hasApiKey ? 'Configured' : 'Not configured (may use env vars)',
          });
        }
      } else {
        results.push({
          name: 'Config',
          status: 'error',
          message: configResult.message,
        });
      }

      setChecks(results);
      setLoading(false);

      // Exit after a brief delay to show results
      setTimeout(() => {
        exit();
      }, 100);
    }

    void runChecks();
  }, [exit]);

  if (loading) {
    return <Spinner message="Running health checks..." />;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="green" bold>
        Health Check
      </Text>
      <Text dimColor>─────────────────────────</Text>
      {checks.map((check) => (
        <Box key={check.name} gap={1}>
          <Text
            color={check.status === 'ok' ? 'green' : check.status === 'warning' ? 'yellow' : 'red'}
          >
            {check.status === 'ok' ? '✓' : check.status === 'warning' ? '!' : '✗'}
          </Text>
          <Text>{check.name}:</Text>
          <Text dimColor>{check.message}</Text>
        </Box>
      ))}
    </Box>
  );
}
