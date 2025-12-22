/**
 * HealthCheck component.
 * Displays configuration and connectivity status in grouped sections.
 * Follows osdu-agent CLI style with System, Agent, Memory, Docker, and LLM Providers sections.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import { loadConfig, loadConfigFromFiles } from '../config/manager.js';
import { VERSION } from '../cli/version.js';
import { Spinner } from './Spinner.js';
import type { AppConfig } from '../config/schema.js';
import { PROVIDER_NAMES, type ProviderName } from '../config/constants.js';

/**
 * Status types for color coding.
 * - ok: green - success, enabled, working
 * - warning: yellow - disabled, attention needed
 * - error: red - failed, critical issues
 * - info: cyan - informational, system data
 */
type ItemStatus = 'ok' | 'warning' | 'error' | 'info';

/**
 * Item within a health check section.
 */
interface SectionItem {
  label: string;
  value: string;
  status: ItemStatus;
  isDefault?: boolean;
}

/**
 * A section of related health check items.
 */
interface HealthSection {
  name: string;
  items: SectionItem[];
}

/**
 * Docker status information.
 */
interface DockerStatus {
  running: boolean;
  version?: string;
  cpus?: number;
  memoryBytes?: number;
}

/**
 * Mask a secret value, showing only the last 6 characters.
 */
function maskSecret(secret: string | undefined): string {
  if (secret === undefined || secret === '') return 'Not configured';
  if (secret.length <= 8) return '****';
  return '****' + secret.slice(-6);
}

/**
 * Format bytes as GiB.
 */
function formatMemory(bytes: number): string {
  const gib = bytes / 1024 ** 3;
  return `${gib.toFixed(1)} GiB`;
}

/**
 * Get the provider display name (capitalized).
 */
function getProviderDisplayName(name: ProviderName): string {
  const displayNames: Record<ProviderName, string> = {
    local: 'Local',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    azure: 'Azure OpenAI',
    foundry: 'Azure AI Foundry',
    gemini: 'Google Gemini',
    github: 'GitHub Models',
  };
  return displayNames[name];
}

/**
 * Get model name for a provider config.
 */
function getModelName(providerName: ProviderName, providerConfig: Record<string, unknown>): string {
  if (providerName === 'azure') {
    return (providerConfig.deployment as string) || 'default';
  }
  if (providerName === 'foundry') {
    const mode = providerConfig.mode as string;
    if (mode === 'local') {
      return (providerConfig.modelAlias as string) || 'default';
    }
    return (providerConfig.modelDeployment as string) || 'default';
  }
  return (providerConfig.model as string) || 'default';
}

/**
 * Get secret/key for a provider config.
 */
function getProviderSecret(
  providerName: ProviderName,
  providerConfig: Record<string, unknown>
): string | undefined {
  if (providerName === 'local') {
    return 'N/A';
  }
  if (providerName === 'github') {
    return providerConfig.token as string | undefined;
  }
  return providerConfig.apiKey as string | undefined;
}

/**
 * Check Docker status asynchronously using child_process.
 * Queries Docker for version, allocated CPUs, and memory.
 */
async function getDockerStatus(): Promise<DockerStatus> {
  const { spawn } = await import('node:child_process');

  return new Promise((resolve) => {
    try {
      // Query version, NCPU, and MemTotal from Docker
      const proc = spawn('docker', [
        'info',
        '--format',
        '{{.ServerVersion}}|{{.NCPU}}|{{.MemTotal}}',
      ]);
      let output = '';

      proc.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      proc.on('error', () => {
        resolve({ running: false });
      });

      proc.on('close', (code: number | null) => {
        if (code === 0 && output.trim()) {
          const parts = output.trim().split('|');
          const version = parts[0];
          const cpus = parts[1] !== undefined ? parseInt(parts[1], 10) : undefined;
          const memoryBytes = parts[2] !== undefined ? parseInt(parts[2], 10) : undefined;

          resolve({
            running: true,
            version,
            cpus: cpus !== undefined && !isNaN(cpus) ? cpus : undefined,
            memoryBytes: memoryBytes !== undefined && !isNaN(memoryBytes) ? memoryBytes : undefined,
          });
        } else {
          resolve({ running: false });
        }
      });
    } catch {
      resolve({ running: false });
    }
  });
}

/**
 * Build the System section.
 * System info uses 'info' status (cyan) for neutral informational items.
 */
function buildSystemSection(config: AppConfig): HealthSection {
  return {
    name: 'System',
    items: [
      { label: `Node.js ${process.version}`, value: '', status: 'info' },
      { label: `Platform: ${process.platform} (${process.arch})`, value: '', status: 'info' },
      { label: `Data: ${config.agent.dataDir}`, value: '', status: 'info' },
    ],
  };
}

/**
 * Build the Agent section.
 * Agent config uses 'ok' status (green) for configured items.
 */
function buildAgentSection(config: AppConfig): HealthSection {
  const systemPromptFile = config.agent.systemPromptFile;
  let promptDisplay = 'Default';
  if (systemPromptFile !== undefined && systemPromptFile !== '') {
    const filename = systemPromptFile.split('/').pop();
    promptDisplay = '~/' + (filename ?? 'system.md');
  }
  return {
    name: 'Agent',
    items: [
      { label: `Version: ${VERSION}`, value: '', status: 'ok' },
      { label: `Log Level: ${config.agent.logLevel.toUpperCase()}`, value: '', status: 'ok' },
      { label: `System Prompt: ${promptDisplay}`, value: '', status: 'ok' },
    ],
  };
}

/**
 * Build the Memory section.
 * Shows 'warning' (yellow) if disabled, 'ok' (green) if enabled.
 */
function buildMemorySection(config: AppConfig): HealthSection {
  const isEnabled = config.memory.enabled;
  const backend = isEnabled ? config.memory.type : 'disabled';
  return {
    name: 'Memory',
    items: [{ label: `Backend: ${backend}`, value: '', status: isEnabled ? 'ok' : 'warning' }],
  };
}

/**
 * Build the Docker section.
 * Shows 'ok' (green) if running, 'warning' (yellow) if not running.
 * Displays Docker's allocated resources (CPUs and memory), not system totals.
 */
function buildDockerSection(dockerStatus: DockerStatus): HealthSection {
  if (dockerStatus.running) {
    const version = dockerStatus.version ?? 'unknown';
    const cpuCount = dockerStatus.cpus !== undefined ? String(dockerStatus.cpus) : 'unknown';
    const totalMemory =
      dockerStatus.memoryBytes !== undefined ? formatMemory(dockerStatus.memoryBytes) : 'unknown';

    return {
      name: 'Docker',
      items: [
        {
          label: `Running (${version}) · ${cpuCount} allocated cores, ${totalMemory} allocated`,
          value: '',
          status: 'ok',
        },
      ],
    };
  }

  return {
    name: 'Docker',
    items: [{ label: 'Not Running', value: '', status: 'warning' }],
  };
}

/**
 * Check if a provider is explicitly configured in settings (not just env vars).
 * A provider is considered "configured" if it has any properties set in the config file.
 */
function isProviderConfigured(
  providerName: ProviderName,
  providerConfig: Record<string, unknown> | undefined
): boolean {
  // Provider config must be defined and not an empty object
  if (providerConfig === undefined) return false;

  // Local provider is always configured if present (even if empty)
  if (providerName === 'local') return true;

  // Check if any property is set (model, apiKey, endpoint, etc.)
  // An empty object {} is not considered configured
  return Object.keys(providerConfig).length > 0;
}

/**
 * Build the LLM Providers section.
 * Shows 'ok' (green) if API key configured, 'warning' (yellow) if not configured.
 *
 * @param config - Full config with env vars merged (for display values like API keys)
 * @param fileConfig - Config from files only (to determine which providers are explicitly configured)
 */
function buildProvidersSection(config: AppConfig, fileConfig: AppConfig): HealthSection {
  const defaultProvider = config.providers.default;
  const items: SectionItem[] = [];

  for (const providerName of PROVIDER_NAMES) {
    // Check if provider is explicitly configured in file-based config (not env vars)
    const fileProviderConfig = fileConfig.providers[providerName] as
      | Record<string, unknown>
      | undefined;
    if (!isProviderConfigured(providerName, fileProviderConfig)) continue;

    // Use full config (with env vars) for display values
    const providerConfig = config.providers[providerName] as Record<string, unknown> | undefined;

    const displayName = getProviderDisplayName(providerName);
    const modelName = getModelName(providerName, providerConfig ?? {});
    const secret = getProviderSecret(providerName, providerConfig ?? {});
    const hasSecret = secret !== undefined && secret !== '' && secret !== 'N/A';
    const maskedSecret = providerName === 'local' ? '' : ` · ${maskSecret(secret)}`;

    // Determine status: ok if has credentials, warning if not configured
    const status: ItemStatus = hasSecret || providerName === 'local' ? 'ok' : 'warning';

    items.push({
      label: `${displayName} (${modelName})`,
      value: maskedSecret,
      status,
      isDefault: providerName === defaultProvider,
    });
  }

  // If no providers configured, show an error
  if (items.length === 0) {
    items.push({
      label: 'No providers configured',
      value: '',
      status: 'error',
    });
  }

  return {
    name: 'LLM Providers',
    items,
  };
}

/**
 * HealthCheck component.
 * Shows configuration status, environment, and provider availability in grouped sections.
 */
export function HealthCheck(): React.ReactElement {
  const { exit } = useApp();
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<HealthSection[]>([]);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    async function runChecks(): Promise<void> {
      // Load full config (with env vars) for display values
      const configResult = await loadConfig();

      if (!configResult.success) {
        setConfigError(configResult.message);
        setLoading(false);
        setTimeout(() => {
          exit();
        }, 100);
        return;
      }

      const config = configResult.result as NonNullable<typeof configResult.result>;

      // Load file-only config to determine which providers are explicitly configured
      const fileConfigResult = await loadConfigFromFiles();
      const fileConfig = fileConfigResult.success
        ? (fileConfigResult.result as NonNullable<typeof fileConfigResult.result>)
        : config;

      // Get Docker status
      const dockerStatus = await getDockerStatus();

      // Build all sections
      const allSections: HealthSection[] = [
        buildSystemSection(config),
        buildAgentSection(config),
        buildMemorySection(config),
        buildDockerSection(dockerStatus),
        buildProvidersSection(config, fileConfig),
      ];

      setSections(allSections);
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

  if (configError !== null) {
    return (
      <Box flexDirection="column" paddingTop={1}>
        <Text color="red">Configuration Error:</Text>
        <Box paddingLeft={2}>
          <Text color="red">◉</Text>
          <Text> {configError}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingTop={1}>
      {sections.map((section, sectionIndex) => (
        <Box
          key={section.name}
          flexDirection="column"
          marginBottom={sectionIndex < sections.length - 1 ? 1 : 0}
        >
          {/* Section header */}
          <Text>{section.name}:</Text>

          {/* Section items */}
          {section.items.map((item, itemIndex) => {
            // Determine bullet color based on status
            const bulletColor =
              item.status === 'ok'
                ? 'green'
                : item.status === 'warning'
                  ? 'yellow'
                  : item.status === 'error'
                    ? 'red'
                    : 'cyan'; // info

            return (
              <Box key={itemIndex} paddingLeft={2}>
                {/* Show checkmark for default provider */}
                {section.name === 'LLM Providers' && item.isDefault === true ? (
                  <Text color="green">✓ </Text>
                ) : (
                  <Text> </Text>
                )}
                <Text color={bulletColor}>◉</Text>
                <Text> {item.label}</Text>
                {item.value !== '' && <Text dimColor>{item.value}</Text>}
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
