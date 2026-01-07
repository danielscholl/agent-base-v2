/**
 * Sandbox module for Docker container isolation.
 *
 * Provides detection utilities and execution helpers for running the agent
 * inside a Docker container for enhanced security isolation.
 *
 * @example
 * ```typescript
 * import { getSandboxStatus, executeSandbox } from './sandbox/index.js';
 *
 * // Check if running in sandbox
 * const status = getSandboxStatus();
 * if (!status.isInSandbox) {
 *   await executeSandbox({ agentArgs: process.argv.slice(2) });
 * }
 * ```
 */

// Re-export types
export type { SandboxResponse, SandboxOptions, SandboxStatus, SandboxErrorCode } from './types.js';

// Re-export detection functions
export { detectContainer, isAgentSandbox } from './detection.js';
export type { ContainerDetection } from './detection.js';

// Re-export executor functions
export {
  getSandboxStatus,
  checkDockerAvailable,
  checkDockerDaemon,
  checkSandboxImage,
  pullSandboxImage,
  ensureSandboxImage,
  buildDockerCommand,
  executeSandbox,
} from './executor.js';
