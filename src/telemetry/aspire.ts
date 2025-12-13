/**
 * Aspire Dashboard Docker container management.
 * Provides functions to start/stop/status the Aspire Dashboard for local observability.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/aspire/fundamentals/dashboard/overview
 */

import type { TelemetryResponse, TelemetryErrorCode } from './types.js';
import { spawnProcess } from '../runtime/subprocess.js';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Docker container name for the Aspire Dashboard */
export const ASPIRE_CONTAINER_NAME = 'aspire-dashboard';

/** URL for accessing the Aspire Dashboard UI */
export const ASPIRE_DASHBOARD_URL = 'http://localhost:18888';

/** OTLP gRPC endpoint exposed by the Aspire Dashboard */
export const ASPIRE_OTLP_GRPC_ENDPOINT = 'http://localhost:4317';

/** OTLP HTTP endpoint - NOT exposed by default; add `-p 4318:18890` to docker run if needed */
export const ASPIRE_OTLP_HTTP_ENDPOINT = 'http://localhost:4318';

/** Docker image for the Aspire Dashboard */
export const ASPIRE_IMAGE = 'mcr.microsoft.com/dotnet/aspire-dashboard:latest';

/** Default timeout for Docker commands in milliseconds */
export const DOCKER_COMMAND_TIMEOUT_MS = 30000;

/** Short timeout for quick checks (version, info) */
export const DOCKER_CHECK_TIMEOUT_MS = 10000;

/** Startup wait time after container starts */
export const CONTAINER_STARTUP_WAIT_MS = 3000;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Result of checking Aspire Dashboard status.
 */
export interface AspireStatus {
  /** Whether the container is currently running */
  running: boolean;
  /** Container uptime status (e.g., "Up 5 minutes") */
  uptime?: string;
  /** URL for the dashboard UI */
  dashboardUrl: string;
  /** OTLP gRPC endpoint for sending traces */
  otlpEndpoint: string;
}

/**
 * Options for Aspire operations.
 */
export interface AspireOptions {
  /** Callback for debug messages */
  onDebug?: (message: string) => void;
  /** Custom timeout for Docker commands */
  timeout?: number;
}

/**
 * Result of a Docker command execution.
 */
interface DockerCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// -----------------------------------------------------------------------------
// Response Helpers
// -----------------------------------------------------------------------------

function successResponse<T>(result: T, message: string): TelemetryResponse<T> {
  return { success: true, result, message };
}

function errorResponse(error: TelemetryErrorCode, message: string): TelemetryResponse<never> {
  return { success: false, error, message };
}

// -----------------------------------------------------------------------------
// Docker Command Helpers
// -----------------------------------------------------------------------------

/**
 * Run a Docker command with timeout handling.
 *
 * @param args - Docker command arguments (without 'docker' prefix)
 * @param timeoutMs - Command timeout in milliseconds
 * @returns Command result with exit code, stdout, and stderr
 */
async function runDockerCommand(
  args: string[],
  timeoutMs: number = DOCKER_COMMAND_TIMEOUT_MS
): Promise<DockerCommandResult> {
  try {
    return await spawnProcess(['docker', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
      timeoutMs,
    });
  } catch (error) {
    // Handle spawn errors (Docker not installed)
    if (error instanceof Error && error.message.includes('ENOENT')) {
      return { exitCode: -1, stdout: '', stderr: 'Docker not found' };
    }

    if (error instanceof Error && error.message.includes('timed out')) {
      return { exitCode: -1, stdout: '', stderr: 'Command timed out' };
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return { exitCode: -1, stdout: '', stderr: message };
  }
}

/**
 * Check if Docker CLI is installed and daemon is running.
 *
 * @param onDebug - Debug callback
 * @returns Error response if Docker is not available, undefined if OK
 */
async function checkDockerAvailability(
  onDebug?: (message: string) => void
): Promise<TelemetryResponse<never> | undefined> {
  const debug = onDebug ?? ((_msg: string): void => {});

  // Check Docker CLI
  debug('Checking Docker CLI availability...');
  const versionResult = await runDockerCommand(['--version'], DOCKER_CHECK_TIMEOUT_MS);

  if (versionResult.exitCode !== 0) {
    if (versionResult.stderr.includes('timed out')) {
      return errorResponse('TIMEOUT', 'Docker availability check timed out.');
    }
    if (versionResult.stderr.includes('not found') || versionResult.stderr.includes('ENOENT')) {
      return errorResponse(
        'DOCKER_NOT_INSTALLED',
        'Docker is not installed. Install from: https://docs.docker.com/get-docker/'
      );
    }
    return errorResponse('DOCKER_NOT_INSTALLED', `Docker check failed: ${versionResult.stderr}`);
  }

  debug(`Docker CLI found: ${versionResult.stdout}`);

  // Check Docker daemon
  debug('Checking Docker daemon...');
  const infoResult = await runDockerCommand(['info'], DOCKER_CHECK_TIMEOUT_MS);

  if (infoResult.exitCode !== 0) {
    if (infoResult.stderr.includes('timed out')) {
      return errorResponse('TIMEOUT', 'Docker daemon check timed out.');
    }
    return errorResponse(
      'DOCKER_NOT_RUNNING',
      'Docker daemon is not running. Please start Docker Desktop or the Docker daemon.'
    );
  }

  debug('Docker daemon is running');
  return undefined;
}

/**
 * Check if the Aspire container is currently running.
 *
 * @param onDebug - Debug callback
 * @returns Status information if running, undefined if not
 */
async function checkContainerRunning(
  onDebug?: (message: string) => void
): Promise<{ running: boolean; uptime?: string }> {
  const debug = onDebug ?? ((_msg: string): void => {});

  debug('Checking if container is running...');
  const psResult = await runDockerCommand(
    ['ps', '--filter', `name=${ASPIRE_CONTAINER_NAME}`, '--format', '{{.Names}}'],
    DOCKER_CHECK_TIMEOUT_MS
  );

  if (psResult.stdout.includes(ASPIRE_CONTAINER_NAME)) {
    // Get uptime
    const uptimeResult = await runDockerCommand(
      ['ps', '--filter', `name=${ASPIRE_CONTAINER_NAME}`, '--format', '{{.Status}}'],
      DOCKER_CHECK_TIMEOUT_MS
    );

    debug(`Container is running: ${uptimeResult.stdout}`);
    return { running: true, uptime: uptimeResult.stdout || undefined };
  }

  debug('Container is not running');
  return { running: false };
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Start the Aspire Dashboard Docker container.
 *
 * This function:
 * 1. Checks if Docker is installed and running
 * 2. Checks if the container is already running
 * 3. Starts the container if not running
 * 4. Waits for startup
 *
 * @param options - Aspire operation options
 * @returns Status of the dashboard after starting
 *
 * @example
 * ```typescript
 * const result = await startAspireDashboard();
 * if (result.success) {
 *   console.log(`Dashboard: ${result.result.dashboardUrl}`);
 * }
 * ```
 */
export async function startAspireDashboard(
  options: AspireOptions = {}
): Promise<TelemetryResponse<AspireStatus>> {
  const debug = options.onDebug ?? ((_msg: string): void => {});

  // Check Docker availability
  const dockerError = await checkDockerAvailability(debug);
  if (dockerError) {
    return dockerError;
  }

  // Check if already running
  const status = await checkContainerRunning(debug);
  if (status.running) {
    return successResponse(
      {
        running: true,
        uptime: status.uptime,
        dashboardUrl: ASPIRE_DASHBOARD_URL,
        otlpEndpoint: ASPIRE_OTLP_GRPC_ENDPOINT,
      },
      'Dashboard is already running'
    );
  }

  // Start container
  debug('Starting Aspire Dashboard container...');
  const timeout = options.timeout ?? DOCKER_COMMAND_TIMEOUT_MS;

  const startResult = await runDockerCommand(
    [
      'run',
      '--rm',
      '-d',
      '-p',
      '127.0.0.1:18888:18888',
      '-p',
      '127.0.0.1:4317:18889',
      '--name',
      ASPIRE_CONTAINER_NAME,
      '-e',
      'DOTNET_DASHBOARD_UNSECURED_ALLOW_ANONYMOUS=true',
      ASPIRE_IMAGE,
    ],
    timeout
  );

  if (startResult.exitCode !== 0) {
    // Check for common errors
    if (startResult.stderr.includes('port is already allocated')) {
      return errorResponse(
        'CONTAINER_START_FAILED',
        'Port 18888 or 4317 is already in use. Stop the conflicting service or use different ports.'
      );
    }
    if (startResult.stderr.includes('Conflict')) {
      return errorResponse(
        'CONTAINER_START_FAILED',
        `Container "${ASPIRE_CONTAINER_NAME}" already exists. Run: docker rm ${ASPIRE_CONTAINER_NAME}`
      );
    }
    return errorResponse(
      'CONTAINER_START_FAILED',
      `Failed to start container: ${startResult.stderr}`
    );
  }

  // Wait for startup
  debug(`Container started. Waiting ${String(CONTAINER_STARTUP_WAIT_MS)}ms for initialization...`);
  await new Promise((resolve) => setTimeout(resolve, CONTAINER_STARTUP_WAIT_MS));

  // Verify it's running
  const verifyStatus = await checkContainerRunning(debug);
  if (!verifyStatus.running) {
    return errorResponse(
      'CONTAINER_START_FAILED',
      'Container started but is no longer running. Check Docker logs for errors.'
    );
  }

  debug('Dashboard started successfully');
  return successResponse(
    {
      running: true,
      uptime: verifyStatus.uptime,
      dashboardUrl: ASPIRE_DASHBOARD_URL,
      otlpEndpoint: ASPIRE_OTLP_GRPC_ENDPOINT,
    },
    'Dashboard started successfully'
  );
}

/**
 * Stop the Aspire Dashboard Docker container.
 *
 * @param options - Aspire operation options
 * @returns Success/failure status
 *
 * @example
 * ```typescript
 * const result = await stopAspireDashboard();
 * if (result.success) {
 *   console.log('Dashboard stopped');
 * }
 * ```
 */
export async function stopAspireDashboard(options: AspireOptions = {}): Promise<TelemetryResponse> {
  const debug = options.onDebug ?? ((_msg: string): void => {});

  // Check Docker availability
  const dockerError = await checkDockerAvailability(debug);
  if (dockerError) {
    return dockerError;
  }

  // Check if running
  const status = await checkContainerRunning(debug);
  if (!status.running) {
    return successResponse(undefined, 'Dashboard was not running');
  }

  // Stop container
  debug('Stopping Aspire Dashboard container...');
  const timeout = options.timeout ?? DOCKER_COMMAND_TIMEOUT_MS;

  const stopResult = await runDockerCommand(['stop', ASPIRE_CONTAINER_NAME], timeout);

  if (stopResult.exitCode !== 0) {
    return errorResponse('CONTAINER_STOP_FAILED', `Failed to stop container: ${stopResult.stderr}`);
  }

  debug('Dashboard stopped successfully');
  return successResponse(undefined, 'Dashboard stopped');
}

/**
 * Get the current status of the Aspire Dashboard.
 *
 * @param options - Aspire operation options
 * @returns Current dashboard status
 *
 * @example
 * ```typescript
 * const result = await getAspireStatus();
 * if (result.success && result.result.running) {
 *   console.log(`Uptime: ${result.result.uptime}`);
 * }
 * ```
 */
export async function getAspireStatus(
  options: AspireOptions = {}
): Promise<TelemetryResponse<AspireStatus>> {
  const debug = options.onDebug ?? ((_msg: string): void => {});

  // Check Docker availability
  const dockerError = await checkDockerAvailability(debug);
  if (dockerError) {
    return dockerError;
  }

  // Check container status
  const status = await checkContainerRunning(debug);

  return successResponse(
    {
      running: status.running,
      uptime: status.uptime,
      dashboardUrl: ASPIRE_DASHBOARD_URL,
      otlpEndpoint: ASPIRE_OTLP_GRPC_ENDPOINT,
    },
    status.running ? 'Dashboard is running' : 'Dashboard is not running'
  );
}

/**
 * Get the Aspire Dashboard URL and current telemetry configuration status.
 *
 * @param envEnabled - Whether telemetry is enabled via environment variable
 * @returns URL information and telemetry status
 *
 * @example
 * ```typescript
 * const info = getAspireUrl(process.env.ENABLE_OTEL === 'true');
 * console.log(`Dashboard: ${info.dashboardUrl}`);
 * ```
 */
export function getAspireUrl(envEnabled?: boolean): {
  dashboardUrl: string;
  otlpEndpoint: string;
  telemetryStatus: 'enabled' | 'disabled' | 'auto';
} {
  let telemetryStatus: 'enabled' | 'disabled' | 'auto' = 'auto';

  if (envEnabled !== undefined) {
    telemetryStatus = envEnabled ? 'enabled' : 'disabled';
  }

  return {
    dashboardUrl: ASPIRE_DASHBOARD_URL,
    otlpEndpoint: ASPIRE_OTLP_GRPC_ENDPOINT,
    telemetryStatus,
  };
}

// -----------------------------------------------------------------------------
// Config Integration
// -----------------------------------------------------------------------------

import { ConfigManager } from '../config/manager.js';

/**
 * Options for config-aware Aspire operations.
 */
export interface AspireConfigOptions extends AspireOptions {
  /** Config manager instance (creates new one if not provided) */
  configManager?: ConfigManager;
  /** Whether to auto-update telemetry config */
  autoUpdateConfig?: boolean;
}

/**
 * Update telemetry.enabled in config.
 * Silently fails if config operations fail (not critical).
 *
 * @param enabled - Whether to enable telemetry
 * @param manager - Config manager instance
 * @param onDebug - Debug callback
 */
async function updateTelemetryConfig(
  enabled: boolean,
  manager: ConfigManager,
  onDebug?: (message: string) => void
): Promise<void> {
  const debug = onDebug ?? ((_msg: string): void => {});

  try {
    debug(`Updating telemetry config: enabled=${String(enabled)}`);
    const loadResult = await manager.load();

    if (!loadResult.success || !loadResult.result) {
      debug(`Failed to load config: ${loadResult.message}`);
      return;
    }

    const config = loadResult.result;
    config.telemetry.enabled = enabled;

    const saveResult = await manager.save(config);
    if (!saveResult.success) {
      debug(`Failed to save config: ${saveResult.message}`);
      return;
    }

    debug('Telemetry config updated successfully');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    debug(`Config update failed: ${message}`);
    // Silent fail - not critical
  }
}

/**
 * Start the Aspire Dashboard with automatic config update.
 *
 * @param options - Operation options including config integration
 * @returns Status of the dashboard after starting
 *
 * @example
 * ```typescript
 * const result = await startAspireDashboardWithConfig({
 *   autoUpdateConfig: true,
 * });
 * ```
 */
export async function startAspireDashboardWithConfig(
  options: AspireConfigOptions = {}
): Promise<TelemetryResponse<AspireStatus>> {
  const result = await startAspireDashboard(options);

  // Auto-enable telemetry in config on successful start
  if (result.success && options.autoUpdateConfig !== false) {
    const manager = options.configManager ?? new ConfigManager();
    await updateTelemetryConfig(true, manager, options.onDebug);
  }

  return result;
}

/**
 * Stop the Aspire Dashboard with automatic config update.
 *
 * @param options - Operation options including config integration
 * @returns Success/failure status
 *
 * @example
 * ```typescript
 * const result = await stopAspireDashboardWithConfig({
 *   autoUpdateConfig: true,
 * });
 * ```
 */
export async function stopAspireDashboardWithConfig(
  options: AspireConfigOptions = {}
): Promise<TelemetryResponse> {
  const result = await stopAspireDashboard(options);

  // Auto-disable telemetry in config on successful stop
  if (result.success && options.autoUpdateConfig !== false) {
    const manager = options.configManager ?? new ConfigManager();
    await updateTelemetryConfig(false, manager, options.onDebug);
  }

  return result;
}
