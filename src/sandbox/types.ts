/**
 * Type definitions for sandbox functionality.
 */

/**
 * Response from sandbox operations.
 */
export interface SandboxResponse<T = void> {
  success: boolean;
  result?: T;
  error?: string;
  message: string;
}

/**
 * Options for sandbox execution.
 */
export interface SandboxOptions {
  /** Docker image to use (defaults to AGENT_SANDBOX_IMAGE or 'ai-harness-sandbox') */
  image?: string;
  /** Workspace directory to mount (defaults to cwd) */
  workspacePath?: string;
  /** Config directory to mount (defaults to ~/.agent) */
  configPath?: string;
  /** Arguments to pass to agent inside container */
  agentArgs?: string[];
  /** Whether to run interactively (defaults to true) */
  interactive?: boolean;
  /** Execution timeout in ms (defaults to 10 minutes) */
  timeout?: number;
  /** Debug callback */
  onDebug?: (message: string) => void;
}

/**
 * Sandbox status information.
 */
export interface SandboxStatus {
  /** Whether running inside any container */
  isInSandbox: boolean;
  /** Whether running in our specific agent sandbox */
  isAgentSandbox: boolean;
  /** How container was detected */
  detectionMethod: 'env' | 'marker' | 'dockerenv' | 'cgroup' | 'none';
  /** Additional detection details */
  details?: string;
}

/**
 * Error codes for sandbox operations.
 */
export type SandboxErrorCode =
  | 'DOCKER_NOT_INSTALLED'
  | 'DOCKER_NOT_RUNNING'
  | 'DOCKER_ERROR'
  | 'IMAGE_NOT_FOUND'
  | 'ALREADY_IN_CONTAINER'
  | 'EXECUTION_FAILED'
  | 'TIMEOUT';
