/**
 * Runtime boundary module.
 *
 * Provides abstractions for runtime-specific APIs (Bun vs Node)
 * to enable clean testing with Jest while using Bun in production.
 */

export { spawnProcess, isBunRuntime } from './subprocess.js';
export type { SpawnOptions, SubprocessResult } from './subprocess.js';
