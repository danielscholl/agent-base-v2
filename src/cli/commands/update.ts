/**
 * Update command handler.
 * Checks for and installs updates from GitHub releases.
 * Supports multiple installation types: shell script (binary/source), bun global, local dev.
 */

import type { CommandHandler, CommandResult } from './types.js';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { VERSION } from '../version.js';

/** GitHub repository info */
const REPO_OWNER = 'danielscholl';
const REPO_NAME = 'agent-base-v2';
const GIT_REPO_URL = `github:${REPO_OWNER}/${REPO_NAME}`;
const RELEASES_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

/** Installation directory for shell script installs */
const INSTALL_DIR = join(homedir(), '.agent');
const BIN_DIR = join(homedir(), '.local', 'bin');

/**
 * Installation types supported by the update command.
 */
type InstallationType = 'bun-global' | 'shell-binary' | 'shell-source' | 'local-dev' | 'unknown';

/**
 * GitHub release information.
 */
interface GitHubRelease {
  tag_name: string;
  html_url: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
}

/**
 * Version check result with caching metadata.
 */
export interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl: string;
  checkedAt: number;
}

/**
 * Detect installation type based on executable path.
 * Resolves symlinks to get the actual installation location.
 */
function detectInstallationType(): InstallationType {
  const execPath = process.argv[1] ?? '';

  // Resolve symlinks to get the real path
  let resolvedPath = execPath;
  try {
    resolvedPath = realpathSync(execPath);
  } catch {
    // If realpath fails, continue with original path
  }

  const normalizedPath = resolvedPath.replace(/\\/g, '/');

  // Shell script binary install: ~/.agent/bin/
  if (normalizedPath.includes('/.agent/bin/')) {
    return 'shell-binary';
  }

  // Shell script source build: ~/.agent/repo/
  if (normalizedPath.includes('/.agent/repo/')) {
    return 'shell-source';
  }

  // Bun global install: ~/.bun/install/global/
  if (
    /(^|\/)\.bun\/install\/global(\/|$)/.test(normalizedPath) ||
    /(^|\/)node_modules\/\.bin(\/|$)/.test(normalizedPath)
  ) {
    return 'bun-global';
  }

  // Local development: running from src/ or project dist/
  // More specific check - must be in a development context
  if (/(^|\/)src\/index\.tsx$/.test(normalizedPath)) {
    return 'local-dev';
  }

  // Check if running from project dist but not shell-source
  if (/(^|\/)dist\/index\.js$/.test(normalizedPath)) {
    // Could be local dev or unknown - check if in a git repo
    const execDir = dirname(execPath);
    if (!execDir.includes('/.agent/')) {
      return 'local-dev';
    }
  }

  return 'unknown';
}

/**
 * Get display name for installation type.
 */
function getInstallTypeDisplayName(type: InstallationType): string {
  const names: Record<InstallationType, string> = {
    'bun-global': 'Bun global',
    'shell-binary': 'Shell script (binary)',
    'shell-source': 'Shell script (source)',
    'local-dev': 'Local development',
    unknown: 'Unknown',
  };
  return names[type];
}

/**
 * Run a command and return the result.
 */
async function runCommand(
  command: string,
  args: string[],
  options?: { cwd?: string }
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: options?.cwd,
    });

    let output = '';
    let errorOutput = '';
    let settled = false;

    const stdoutHandler = (data: Buffer): void => {
      output += data.toString();
    };

    const stderrHandler = (data: Buffer): void => {
      errorOutput += data.toString();
    };

    const cleanup = (): void => {
      proc.stdout.removeListener('data', stdoutHandler);
      proc.stderr.removeListener('data', stderrHandler);
    };

    proc.stdout.on('data', stdoutHandler);
    proc.stderr.on('data', stderrHandler);

    proc.once('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (code === 0) {
        resolve({ success: true, output });
      } else {
        resolve({ success: false, output: errorOutput || output });
      }
    });

    proc.once('error', (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ success: false, output: err.message });
    });
  });
}

/**
 * Get current version from the bundled VERSION constant.
 * This is the single source of truth for the version.
 */
function getCurrentVersion(): string {
  return VERSION || 'unknown';
}

/**
 * Fetch latest release info from GitHub API.
 */
async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 10000);

    const response = await fetch(RELEASES_API_URL, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'agent-base-v2-updater',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as GitHubRelease;
  } catch {
    return null;
  }
}

/**
 * Compare two semver versions.
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareSemver(a: string, b: string): number {
  // Strip 'v' prefix if present
  const cleanA = a.replace(/^v/, '');
  const cleanB = b.replace(/^v/, '');

  const partsA = cleanA.split('.').map((n) => parseInt(n, 10) || 0);
  const partsB = cleanB.split('.').map((n) => parseInt(n, 10) || 0);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

/**
 * Check for updates and return version info.
 * This is exported for use by other components (e.g., startup banner).
 * Returns null only if we can't reach GitHub API.
 */
export async function checkForUpdates(): Promise<VersionCheckResult | null> {
  const currentVersion = getCurrentVersion();

  const release = await fetchLatestRelease();
  if (release === null) {
    return null;
  }

  const latestVersion = release.tag_name.replace(/^v/, '');
  // If version is unknown, assume update is available to allow --force updates
  const updateAvailable =
    currentVersion === 'unknown' || compareSemver(currentVersion, latestVersion) < 0;

  return {
    currentVersion,
    latestVersion,
    updateAvailable,
    releaseUrl: release.html_url,
    checkedAt: Date.now(),
  };
}

/**
 * Get the version check cache file path.
 */
function getVersionCacheFile(): string {
  return join(INSTALL_DIR, 'version-check.json');
}

/**
 * Load cached version check result.
 */
export async function loadVersionCache(): Promise<VersionCheckResult | null> {
  try {
    const content = await readFile(getVersionCacheFile(), 'utf-8');
    return JSON.parse(content) as VersionCheckResult;
  } catch {
    return null;
  }
}

/**
 * Save version check result to cache.
 */
export async function saveVersionCache(result: VersionCheckResult): Promise<void> {
  try {
    await mkdir(INSTALL_DIR, { recursive: true });
    await writeFile(getVersionCacheFile(), JSON.stringify(result, null, 2));
  } catch {
    // Ignore cache write failures
  }
}

/**
 * Check for updates with caching (24 hour TTL).
 */
export async function checkForUpdatesWithCache(
  forceCheck = false
): Promise<VersionCheckResult | null> {
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  if (!forceCheck) {
    const cached = await loadVersionCache();
    if (cached !== null && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
      // Update currentVersion in case it changed (e.g., after update)
      const currentVersion = getCurrentVersion();
      if (currentVersion !== 'unknown') {
        cached.currentVersion = currentVersion;
        cached.updateAvailable = compareSemver(currentVersion, cached.latestVersion) < 0;
      }
      return cached;
    }
  }

  const result = await checkForUpdates();
  if (result !== null) {
    await saveVersionCache(result);
  }
  return result;
}

/**
 * Detect platform for binary downloads.
 * Returns null for unsupported platforms (Windows).
 */
function detectPlatform(): string | null {
  // Windows doesn't support shell-binary installs
  if (process.platform === 'win32') {
    return null;
  }
  const os = process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `${os}-${arch}`;
}

/**
 * Verify SHA256 checksum of downloaded file.
 */
function verifyChecksum(data: Buffer, expectedHash: string): boolean {
  const hash = createHash('sha256').update(data).digest('hex');
  return hash.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * Fetch checksum file from GitHub releases.
 */
async function fetchChecksumFile(release: GitHubRelease): Promise<Map<string, string>> {
  const checksums = new Map<string, string>();

  // Look for checksums file (SHA256SUMS or similar)
  const checksumAsset = release.assets.find(
    (a) => a.name === 'SHA256SUMS' || a.name === 'checksums.txt' || a.name.endsWith('.sha256')
  );

  if (checksumAsset === undefined) {
    return checksums;
  }

  try {
    const response = await fetch(checksumAsset.browser_download_url);
    if (!response.ok) {
      return checksums;
    }

    const content = await response.text();
    // Parse format: "hash  filename" or "hash filename"
    for (const line of content.split('\n')) {
      const match = line.match(/^([a-fA-F0-9]{64})\s+(.+)$/);
      if (match !== null && match[1] !== undefined && match[2] !== undefined) {
        checksums.set(match[2].trim(), match[1]);
      }
    }
  } catch {
    // Ignore checksum fetch failures
  }

  return checksums;
}

/** Output handler type for update functions */
type OutputHandler = (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;

/**
 * Update strategy for shell-binary installations.
 * Downloads the latest binary from GitHub releases.
 */
async function updateShellBinary(
  context: { onOutput: OutputHandler },
  release: GitHubRelease
): Promise<boolean> {
  const platform = detectPlatform();

  // Windows is not supported for shell-binary installs
  if (platform === null) {
    context.onOutput('Binary installation not supported on Windows', 'warning');
    context.onOutput('Falling back to source build...', 'info');
    return updateShellSource(context);
  }

  const archiveName = `agent-${platform}.tar.gz`;

  // Find the binary asset
  const asset = release.assets.find((a) => a.name === archiveName);
  if (asset === undefined) {
    context.onOutput(`Binary not available for ${platform}`, 'error');
    context.onOutput('Falling back to source build...', 'info');
    return updateShellSource(context);
  }

  context.onOutput(`Downloading ${archiveName}...`, 'info');

  try {
    // Download archive
    const response = await fetch(asset.browser_download_url);
    if (!response.ok) {
      throw new Error(`Download failed: ${String(response.status)}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const downloadedData = Buffer.from(arrayBuffer);
    const tmpDir = join(INSTALL_DIR, `tmp.${String(Date.now())}`);
    const archivePath = join(tmpDir, archiveName);

    // Verify checksum if available
    context.onOutput('Verifying checksum...', 'info');
    const checksums = await fetchChecksumFile(release);
    const expectedHash = checksums.get(archiveName);

    if (expectedHash !== undefined) {
      const isValid = verifyChecksum(downloadedData, expectedHash);
      if (!isValid) {
        throw new Error('Checksum verification failed - download may be corrupted');
      }
      context.onOutput('Checksum verified', 'success');
    } else {
      context.onOutput('No checksum available, skipping verification', 'warning');
    }

    await mkdir(tmpDir, { recursive: true });
    await writeFile(archivePath, downloadedData);

    // Extract archive
    context.onOutput('Extracting...', 'info');
    const extractDir = join(INSTALL_DIR, 'bin');
    await mkdir(extractDir, { recursive: true });

    const tarResult = await runCommand('tar', ['-xzf', archivePath, '-C', extractDir]);
    if (!tarResult.success) {
      throw new Error(`Extraction failed: ${tarResult.output}`);
    }

    // Update symlink with proper error checking
    await mkdir(BIN_DIR, { recursive: true });

    const rmResult = await runCommand('rm', ['-f', join(BIN_DIR, 'agent')]);
    if (!rmResult.success) {
      context.onOutput(`Warning: Failed to remove old symlink: ${rmResult.output}`, 'warning');
    }

    const lnResult = await runCommand('ln', [
      '-sf',
      join(extractDir, 'agent'),
      join(BIN_DIR, 'agent'),
    ]);
    if (!lnResult.success) {
      throw new Error(`Failed to create symlink: ${lnResult.output}`);
    }

    const chmodResult = await runCommand('chmod', ['+x', join(extractDir, 'agent')]);
    if (!chmodResult.success) {
      context.onOutput(
        `Warning: Failed to set executable permission: ${chmodResult.output}`,
        'warning'
      );
    }

    // Cleanup
    await runCommand('rm', ['-rf', tmpDir]);

    return true;
  } catch (error) {
    context.onOutput(
      `Binary update failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'error'
    );
    return false;
  }
}

/**
 * Update strategy for shell-source installations.
 * Runs git pull and rebuilds.
 */
async function updateShellSource(context: { onOutput: OutputHandler }): Promise<boolean> {
  const repoPath = join(INSTALL_DIR, 'repo');

  context.onOutput('Pulling latest changes...', 'info');
  const pullResult = await runCommand('git', ['pull', '--ff-only'], { cwd: repoPath });
  if (!pullResult.success) {
    context.onOutput(`Git pull failed: ${pullResult.output}`, 'error');
    return false;
  }

  context.onOutput('Installing dependencies...', 'info');
  const installResult = await runCommand('bun', ['install'], { cwd: repoPath });
  if (!installResult.success) {
    context.onOutput(`Dependency install failed: ${installResult.output}`, 'error');
    return false;
  }

  context.onOutput('Building...', 'info');
  const buildResult = await runCommand('bun', ['run', 'build'], { cwd: repoPath });
  if (!buildResult.success) {
    context.onOutput(`Build failed: ${buildResult.output}`, 'error');
    return false;
  }

  return true;
}

/**
 * Update strategy for bun global installations.
 */
async function updateBunGlobal(
  context: { onOutput: OutputHandler },
  force: boolean
): Promise<boolean> {
  const updateArgs = ['install', '-g'];
  if (force) {
    updateArgs.push('--force');
  }
  updateArgs.push(GIT_REPO_URL);

  context.onOutput(`Running: bun ${updateArgs.join(' ')}`, 'info');
  const result = await runCommand('bun', updateArgs);

  if (!result.success) {
    context.onOutput(`Update failed: ${result.output}`, 'error');
    return false;
  }

  return true;
}

/**
 * Main update command handler.
 */
export const updateHandler: CommandHandler = async (args, context): Promise<CommandResult> => {
  const parts = args.trim().split(/\s+/).filter(Boolean);

  const checkOnly = parts.includes('--check');
  const force = parts.includes('--force');

  const installType = detectInstallationType();
  const currentVersion = getCurrentVersion();

  context.onOutput('', 'info');
  context.onOutput('Update Check', 'success');
  context.onOutput('────────────────────────', 'info');
  context.onOutput(`Current version: ${currentVersion}`, 'info');
  context.onOutput(`Installation: ${getInstallTypeDisplayName(installType)}`, 'info');
  context.onOutput('', 'info');

  // Local development - just show instructions
  if (installType === 'local-dev') {
    context.onOutput('Running from local development source.', 'info');
    context.onOutput('', 'info');
    context.onOutput('To update, run:', 'info');
    context.onOutput('  git pull', 'info');
    context.onOutput('  bun install', 'info');
    return { success: true, message: 'Local development detected' };
  }

  // Unknown installation - show help
  if (installType === 'unknown') {
    context.onOutput('Could not determine installation type.', 'warning');
    context.onOutput('', 'info');
    context.onOutput('Recommended installation:', 'info');
    context.onOutput(
      '  curl -fsSL https://raw.githubusercontent.com/danielscholl/agent-base-v2/main/install.sh | bash',
      'info'
    );
    context.onOutput('', 'info');
    context.onOutput('Or install via Bun:', 'info');
    context.onOutput(`  bun install -g ${GIT_REPO_URL}`, 'info');
    return { success: false, message: 'Unknown installation type' };
  }

  // Check for updates
  context.onOutput('Checking for updates...', 'info');
  const versionInfo = await checkForUpdates();

  if (versionInfo === null) {
    context.onOutput('Could not check for updates (network error or rate limit).', 'warning');
    if (!force) {
      context.onOutput('Use --force to update anyway.', 'info');
      return { success: false, message: 'Version check failed' };
    }
  } else {
    context.onOutput(`Latest version: ${versionInfo.latestVersion}`, 'info');
    context.onOutput('', 'info');

    if (!versionInfo.updateAvailable && !force) {
      context.onOutput('You are already on the latest version!', 'success');
      return { success: true, message: 'Already up to date' };
    }

    if (versionInfo.updateAvailable) {
      context.onOutput(
        `Update available: ${versionInfo.currentVersion} → ${versionInfo.latestVersion}`,
        'success'
      );
    }
  }

  // Check only mode - don't actually update
  if (checkOnly) {
    context.onOutput('', 'info');
    context.onOutput('Run `agent update` to install the update.', 'info');
    return { success: true, message: 'Check complete' };
  }

  // Perform update based on installation type
  context.onOutput('', 'info');
  context.onOutput('Updating...', 'info');

  let success = false;

  switch (installType) {
    case 'shell-binary': {
      if (versionInfo !== null) {
        const release = await fetchLatestRelease();
        if (release !== null) {
          success = await updateShellBinary(context, release);
        }
      }
      if (!success) {
        context.onOutput('Binary update failed, trying source build...', 'warning');
        success = await updateShellSource(context);
      }
      break;
    }

    case 'shell-source':
      success = await updateShellSource(context);
      break;

    case 'bun-global':
      success = await updateBunGlobal(context, force);
      break;
  }

  context.onOutput('', 'info');

  if (success) {
    // Clear version cache so next check reflects new version
    try {
      await writeFile(getVersionCacheFile(), '{}');
    } catch {
      // Ignore
    }

    context.onOutput('Update successful!', 'success');
    context.onOutput('Restart the agent to use the new version.', 'info');
    return { success: true, message: 'Update complete' };
  } else {
    context.onOutput('Update failed.', 'error');
    context.onOutput('', 'info');
    context.onOutput('Try manually:', 'info');
    context.onOutput(
      `  curl -fsSL https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/install.sh | bash`,
      'info'
    );
    return { success: false, message: 'Update failed' };
  }
};
