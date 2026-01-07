/**
 * Docker sandbox execution module.
 * Handles launching the agent inside a Docker container for isolation.
 */

import { spawnProcess } from '../runtime/subprocess.js';
import { detectContainer, isAgentSandbox } from './detection.js';
import { VERSION } from '../cli/version.js';
import type { SandboxOptions, SandboxResponse, SandboxStatus, SandboxErrorCode } from './types.js';

/**
 * Default sandbox image from GitHub Container Registry.
 * Uses the current version tag, falling back to 'latest'.
 */
const SANDBOX_REGISTRY = 'ghcr.io/danielscholl/agent-harness-sandbox';
const DEFAULT_SANDBOX_IMAGE = `${SANDBOX_REGISTRY}:${VERSION}`;

/**
 * Environment variables to pass through to the sandbox container.
 * These are checked for existence and passed if set.
 */
const PASSTHROUGH_ENV_VARS = [
  // LLM API Keys
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GITHUB_TOKEN',
  // Azure OpenAI
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_DEPLOYMENT',
  'AZURE_OPENAI_API_VERSION',
  // Azure AI Foundry
  'AZURE_AI_PROJECT_ENDPOINT',
  'AZURE_AI_MODEL_DEPLOYMENT',
  // Provider selection
  'LLM_PROVIDER',
  'AGENT_MODEL',
  // Telemetry
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'APPLICATIONINSIGHTS_CONNECTION_STRING',
  // Agent configuration
  'AGENT_WORKSPACE_ROOT', // Host workspace root (informational, overridden in container)
];

/**
 * Get the current sandbox status.
 *
 * @returns Sandbox status information
 */
export function getSandboxStatus(): SandboxStatus {
  const detection = detectContainer();
  return {
    isInSandbox: detection.isContainer,
    isAgentSandbox: isAgentSandbox(),
    detectionMethod: detection.method,
    details: detection.details,
  };
}

/**
 * Check if Docker CLI is available.
 *
 * @returns Success response if Docker is available
 */
export async function checkDockerAvailable(): Promise<SandboxResponse<string>> {
  const result = await spawnProcess(['docker', '--version'], {
    stdout: 'pipe',
    stderr: 'pipe',
    timeoutMs: 5000,
  });

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: 'DOCKER_NOT_INSTALLED' as SandboxErrorCode,
      message: 'Docker CLI not found. Install Docker from https://docs.docker.com/get-docker/',
    };
  }

  return {
    success: true,
    result: result.stdout,
    message: 'Docker CLI available',
  };
}

/**
 * Check if Docker daemon is running.
 *
 * @returns Success response if daemon is running
 */
export async function checkDockerDaemon(): Promise<SandboxResponse> {
  const result = await spawnProcess(['docker', 'info'], {
    stdout: 'pipe',
    stderr: 'pipe',
    timeoutMs: 10000,
  });

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: 'DOCKER_NOT_RUNNING' as SandboxErrorCode,
      message:
        'Docker daemon not running. Start Docker Desktop or run: sudo systemctl start docker',
    };
  }

  return {
    success: true,
    message: 'Docker daemon running',
  };
}

/**
 * Check if the sandbox image exists locally.
 *
 * @param imageName - Image name to check
 * @returns Success response if image exists
 */
export async function checkSandboxImage(
  imageName: string = DEFAULT_SANDBOX_IMAGE
): Promise<SandboxResponse> {
  const result = await spawnProcess(['docker', 'image', 'inspect', imageName], {
    stdout: 'pipe',
    stderr: 'pipe',
    timeoutMs: 5000,
  });

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: 'IMAGE_NOT_FOUND' as SandboxErrorCode,
      message: `Sandbox image '${imageName}' not found locally`,
    };
  }

  return {
    success: true,
    message: `Sandbox image '${imageName}' available`,
  };
}

/**
 * Pull the sandbox image from the registry.
 *
 * @param imageName - Image name to pull
 * @param onDebug - Debug callback for progress messages
 * @returns Success response if pull succeeds
 */
export async function pullSandboxImage(
  imageName: string = DEFAULT_SANDBOX_IMAGE,
  onDebug?: (message: string) => void
): Promise<SandboxResponse> {
  const debug = onDebug ?? (() => {});
  debug(`Pulling sandbox image '${imageName}'...`);

  const result = await spawnProcess(['docker', 'pull', imageName], {
    stdout: 'inherit',
    stderr: 'inherit',
    timeoutMs: 5 * 60 * 1000, // 5 minutes for pull
  });

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: 'IMAGE_NOT_FOUND' as SandboxErrorCode,
      message: `Failed to pull sandbox image '${imageName}'. You can build it locally with: docker build -f Dockerfile.sandbox -t ${imageName} .`,
    };
  }

  return {
    success: true,
    message: `Sandbox image '${imageName}' pulled successfully`,
  };
}

/**
 * Ensure the sandbox image is available, pulling if necessary.
 *
 * @param imageName - Image name to check/pull
 * @param onDebug - Debug callback for progress messages
 * @returns Success response if image is available
 */
export async function ensureSandboxImage(
  imageName: string = DEFAULT_SANDBOX_IMAGE,
  onDebug?: (message: string) => void
): Promise<SandboxResponse> {
  const debug = onDebug ?? (() => {});

  // Check if image exists locally
  const localCheck = await checkSandboxImage(imageName);
  if (localCheck.success) {
    return localCheck;
  }

  // Image not found locally - try to pull from registry
  debug('Image not found locally, attempting to pull from registry...');

  // If using a custom image (not from our registry), don't auto-pull
  if (!imageName.startsWith(SANDBOX_REGISTRY) && !imageName.startsWith('agent-harness-sandbox')) {
    return {
      success: false,
      error: 'IMAGE_NOT_FOUND' as SandboxErrorCode,
      message: `Custom sandbox image '${imageName}' not found. Please pull or build it first.`,
    };
  }

  // Try pulling the versioned image
  const pullResult = await pullSandboxImage(imageName, onDebug);
  if (pullResult.success) {
    return pullResult;
  }

  // If versioned pull failed and we're using default, try 'latest' as fallback
  if (imageName === DEFAULT_SANDBOX_IMAGE) {
    const latestImage = `${SANDBOX_REGISTRY}:latest`;
    debug(`Versioned image not found, trying '${latestImage}'...`);
    const latestPull = await pullSandboxImage(latestImage, onDebug);
    if (latestPull.success) {
      // Tag the 'latest' image with the originally requested versioned tag so
      // subsequent Docker runs using `imageName` will work as expected.
      debug(`Tagging '${latestImage}' as '${imageName}'...`);
      const tagResult = await spawnProcess(['docker', 'tag', latestImage, imageName], {
        stdout: 'pipe',
        stderr: 'pipe',
        timeoutMs: 5000,
      });
      if (tagResult.exitCode === 0) {
        debug(`Successfully tagged '${latestImage}' as '${imageName}'`);
        return {
          success: true,
          message: `Sandbox image '${imageName}' available (pulled from latest and tagged)`,
        };
      } else {
        debug(`Failed to tag '${latestImage}' as '${imageName}': ${tagResult.stderr}`);
        return {
          success: false,
          error: 'IMAGE_NOT_FOUND' as SandboxErrorCode,
          message: `Pulled '${latestImage}' but failed to tag as '${imageName}'. ${tagResult.stderr}`,
        };
      }
    }
  }

  return {
    success: false,
    error: 'IMAGE_NOT_FOUND' as SandboxErrorCode,
    message: `Sandbox image '${imageName}' not found. Build it locally with: docker build -f Dockerfile.sandbox -t ${SANDBOX_REGISTRY}:${VERSION} .`,
  };
}

/**
 * Build the Docker run command for sandbox execution.
 *
 * @param options - Sandbox options
 * @returns Array of command arguments
 */
export function buildDockerCommand(options: SandboxOptions): string[] {
  const envImage = process.env['AGENT_SANDBOX_IMAGE'];
  const image =
    options.image ??
    (envImage !== undefined && envImage.trim() !== '' ? envImage : DEFAULT_SANDBOX_IMAGE);
  const workspacePath = options.workspacePath ?? process.cwd();
  // Support custom AGENT_HOME, fall back to ~/.agent
  const agentHome = process.env['AGENT_HOME'] ?? `${process.env['HOME'] ?? '/tmp'}/.agent`;
  const configPath = options.configPath ?? agentHome;
  // Default to interactive only if stdin is a TTY
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const interactive = options.interactive ?? process.stdin.isTTY ?? false;

  const cmd: string[] = ['docker', 'run', '--rm'];

  // Interactive mode (only when TTY is available)
  if (interactive) {
    cmd.push('-it');
  }

  // Mount workspace (read-write)
  cmd.push('-v', `${workspacePath}:/workspace`);
  cmd.push('-w', '/workspace');

  // Mount config directory (read-write for sessions/plugins)
  cmd.push('-v', `${configPath}:/home/agent/.agent`);

  // Pass AGENT_HOME so container knows where config is mounted
  cmd.push('-e', 'AGENT_HOME=/home/agent/.agent');

  // Pass through environment variables
  for (const envVar of PASSTHROUGH_ENV_VARS) {
    // Security note: We check for both undefined and empty string to ensure proper
    // credential isolation. Empty API keys are not useful and should not be passed.
    // This prevents conflating "unset" with "set but empty" for security-sensitive
    // values. If an attacker could set these to empty strings in the host environment,
    // they would not bypass credential isolation as empty strings are excluded.
    const envValue = process.env[envVar];
    if (envValue !== undefined && envValue !== '') {
      cmd.push('-e', envVar);
    }
  }

  // Mark as sandbox environment
  cmd.push('-e', 'AGENT_SANDBOX=true');

  // Set workspace root constraint inside container
  cmd.push('-e', 'AGENT_WORKSPACE_ROOT=/workspace');

  // Set hostname for visibility
  cmd.push('--hostname', 'agent-sandbox');

  // Image name
  cmd.push(image);

  // Pass through agent arguments, filtering out --sandbox flag
  if (options.agentArgs && options.agentArgs.length > 0) {
    const filteredArgs = options.agentArgs.filter((arg) => arg !== '--sandbox');
    cmd.push(...filteredArgs);
  }

  return cmd;
}

/**
 * Execute the agent inside a Docker sandbox.
 *
 * This function:
 * 1. Checks if already in a container (prevents nested sandboxing)
 * 2. Verifies Docker is available and running
 * 3. Verifies the sandbox image exists
 * 4. Builds and executes the Docker command
 *
 * @param options - Sandbox execution options
 * @returns Sandbox response with exit code
 */
export async function executeSandbox(
  options: SandboxOptions = {}
): Promise<SandboxResponse<number>> {
  const debug = options.onDebug ?? (() => {});

  // Check if already in a container
  const status = getSandboxStatus();
  if (status.isInSandbox) {
    debug(`Already in container (${status.detectionMethod}), skipping sandbox`);
    return {
      success: false,
      error: 'ALREADY_IN_CONTAINER' as SandboxErrorCode,
      message: 'Already running inside a container. Nested sandboxing is not supported.',
    };
  }

  // Check Docker CLI
  debug('Checking Docker CLI...');
  const cliCheck = await checkDockerAvailable();
  if (!cliCheck.success) {
    return {
      success: false,
      error: cliCheck.error as SandboxErrorCode,
      message: cliCheck.message,
    };
  }
  debug(`Docker CLI: ${cliCheck.result ?? 'available'}`);

  // Check Docker daemon
  debug('Checking Docker daemon...');
  const daemonCheck = await checkDockerDaemon();
  if (!daemonCheck.success) {
    return {
      success: false,
      error: daemonCheck.error as SandboxErrorCode,
      message: daemonCheck.message,
    };
  }
  debug('Docker daemon running');

  // Ensure sandbox image is available (auto-pull if needed)
  const envImage = process.env['AGENT_SANDBOX_IMAGE'];
  const imageName =
    options.image ??
    (envImage !== undefined && envImage.trim() !== '' ? envImage : DEFAULT_SANDBOX_IMAGE);
  debug(`Ensuring sandbox image '${imageName}' is available...`);
  const imageCheck = await ensureSandboxImage(imageName, debug);
  if (!imageCheck.success) {
    return {
      success: false,
      error: imageCheck.error as SandboxErrorCode,
      message: imageCheck.message,
    };
  }
  debug('Sandbox image ready');

  // Build and execute Docker command
  const cmd = buildDockerCommand(options);
  debug(`Running: ${cmd.join(' ')}`);

  // Determine timeout: no timeout for interactive sessions, 30 min for non-interactive
  // Check if --prompt/-p was passed (non-interactive even with TTY)
  const hasPromptArg =
    options.agentArgs?.some((arg) => arg === '-p' || arg === '--prompt') ?? false;
  const stdinIsTTY =
    typeof process.stdin === 'object' &&
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    process.stdin !== null &&
    'isTTY' in process.stdin
      ? Boolean((process.stdin as { isTTY?: unknown }).isTTY)
      : false;
  const isInteractive = !hasPromptArg && (options.interactive ?? stdinIsTTY);
  const timeoutMs = options.timeout ?? (isInteractive ? undefined : 30 * 60 * 1000);

  const result = await spawnProcess(cmd, {
    stdout: 'inherit',
    stderr: 'inherit',
    timeoutMs,
  });

  if (result.exitCode === -1 && result.stderr === 'Command timed out') {
    return {
      success: false,
      error: 'TIMEOUT' as SandboxErrorCode,
      result: result.exitCode,
      message: 'Sandbox execution timed out',
    };
  }

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: 'EXECUTION_FAILED' as SandboxErrorCode,
      result: result.exitCode,
      message: `Sandbox execution failed with exit code ${String(result.exitCode)}`,
    };
  }

  return {
    success: true,
    result: result.exitCode,
    message: 'Sandbox execution completed successfully',
  };
}
