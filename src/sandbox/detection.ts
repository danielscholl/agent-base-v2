/**
 * Container detection utilities for sandbox mode.
 * Detects whether the agent is running inside a Docker container.
 */

import { existsSync, readFileSync } from 'node:fs';

/**
 * Detection result with method used.
 */
export interface ContainerDetection {
  /** Whether running inside a container */
  isContainer: boolean;
  /** Detection method that succeeded */
  method: 'env' | 'marker' | 'dockerenv' | 'cgroup' | 'none';
  /** Additional details */
  details?: string;
}

/**
 * Check if running inside a Docker container.
 *
 * Detection methods (in order):
 * 1. AGENT_SANDBOX env var (set by our Dockerfile.sandbox)
 * 2. /.agent-sandbox marker file (set by our Dockerfile.sandbox)
 * 3. /.dockerenv file (standard Docker marker)
 * 4. /proc/1/cgroup contains "docker" or "containerd"
 *
 * @returns Detection result with method used
 */
export function detectContainer(): ContainerDetection {
  // 1. Check our explicit env var (fastest, most reliable for our containers)
  if (process.env['AGENT_SANDBOX'] === 'true') {
    return { isContainer: true, method: 'env', details: 'AGENT_SANDBOX=true' };
  }

  // 2. Check our marker file
  if (existsSync('/.agent-sandbox')) {
    return { isContainer: true, method: 'marker', details: '/.agent-sandbox exists' };
  }

  // 3. Check standard Docker marker
  if (existsSync('/.dockerenv')) {
    return { isContainer: true, method: 'dockerenv', details: '/.dockerenv exists' };
  }

  // 4. Check cgroups (Linux-specific)
  try {
    if (existsSync('/proc/1/cgroup')) {
      const cgroup = readFileSync('/proc/1/cgroup', 'utf-8');
      if (
        cgroup.includes('docker') ||
        cgroup.includes('containerd') ||
        cgroup.includes('kubepods')
      ) {
        return { isContainer: true, method: 'cgroup', details: 'cgroup indicates container' };
      }
    }
  } catch {
    // Not on Linux or can't read cgroup
  }

  return { isContainer: false, method: 'none' };
}

/**
 * Check if running in our sandbox container specifically.
 * More restrictive than detectContainer() - only true for our Dockerfile.sandbox.
 */
export function isAgentSandbox(): boolean {
  return process.env['AGENT_SANDBOX'] === 'true' || existsSync('/.agent-sandbox');
}
