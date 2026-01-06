/**
 * Custom command discovery and loading.
 * Scans bundled, user, and project directories for slash command definitions.
 */

import { readFile, readdir, stat, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { parseCustomCommandMd } from './parser.js';
import type {
  CustomCommandLoaderOptions,
  CustomCommandDiscoveryResult,
  DiscoveredCustomCommand,
  CustomCommandError,
  CustomCommandSource,
} from './types.js';
import { getWorkspaceRoot } from '../../../tools/workspace.js';
import { getBundledCommandsDir } from '../../../utils/paths.js';

// Default directories
const DEFAULT_BUNDLED_DIR = getBundledCommandsDir();
const DEFAULT_USER_DIR = join(homedir(), '.agent', 'commands');

/**
 * Custom command loader that discovers commands from bundled, user, and project directories.
 */
export class CustomCommandLoader {
  private readonly workspaceRoot: string;
  private readonly bundledDir: string;
  private readonly userDir: string;
  private readonly onDebug?: (msg: string, data?: unknown) => void;

  constructor(options: CustomCommandLoaderOptions = {}) {
    this.workspaceRoot = options.workspaceRoot ?? getWorkspaceRoot();
    this.bundledDir = options.bundledDir ?? DEFAULT_BUNDLED_DIR;
    this.userDir = options.userDir ?? DEFAULT_USER_DIR;
    this.onDebug = options.onDebug;
  }

  private debug(msg: string, data?: unknown): void {
    this.onDebug?.(msg, data);
  }

  /**
   * Discover all custom commands from bundled, user, and project directories.
   * Priority order (later wins on name conflict): bundled < user < project.
   *
   * @returns Discovery result with commands and errors
   */
  async discover(): Promise<CustomCommandDiscoveryResult> {
    const commands: DiscoveredCustomCommand[] = [];
    const errors: CustomCommandError[] = [];

    // Scan directories in order: bundled first, then user, then project (project wins on conflict)
    const sources: Array<{ dir: string; source: CustomCommandSource }> = [
      { dir: this.bundledDir, source: 'bundled' },
      { dir: this.userDir, source: 'user' },
      { dir: join(this.workspaceRoot, '.agent', 'commands'), source: 'project' },
    ];

    for (const { dir, source } of sources) {
      this.debug(`Scanning ${source} commands directory`, { dir });

      // Check if directory exists
      const exists = await this.directoryExists(dir);
      if (!exists) {
        this.debug(`Directory does not exist, skipping`, { dir });
        continue;
      }

      // Scan directory for commands
      const result = await this.scanDirectory(dir, source);
      commands.push(...result.commands);
      errors.push(...result.errors);
    }

    // Deduplicate by command name (later sources win)
    const seen = new Map<string, DiscoveredCustomCommand>();
    for (const cmd of commands) {
      if (seen.has(cmd.name)) {
        this.debug(`Duplicate command name, later definition wins`, {
          name: cmd.name,
          previous: seen.get(cmd.name)?.path,
          current: cmd.path,
        });
      }
      seen.set(cmd.name, cmd);
    }

    const uniqueCommands = Array.from(seen.values());

    this.debug(`Discovery complete`, {
      total: uniqueCommands.length,
      errors: errors.length,
    });

    return { commands: uniqueCommands, errors };
  }

  /**
   * Scan a directory for custom command files.
   * Recursively scans subdirectories for namespacing.
   */
  private async scanDirectory(
    dir: string,
    source: CustomCommandSource,
    namespace?: string
  ): Promise<CustomCommandDiscoveryResult> {
    const commands: DiscoveredCustomCommand[] = [];
    const errors: CustomCommandError[] = [];

    try {
      // Resolve the base directory to its real path for security validation
      const resolvedBaseDir = await realpath(dir);
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          // Security: Verify subdirectory doesn't escape via symlink
          try {
            const resolvedSubdir = await realpath(entryPath);
            const relativePath = relative(resolvedBaseDir, resolvedSubdir);

            if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
              this.debug('Rejected command directory symlink escape attempt', {
                path: entryPath,
                resolvedPath: resolvedSubdir,
              });
              errors.push({
                path: entryPath,
                message: 'Command directory symlink escapes base directory',
                type: 'IO_ERROR',
              });
              continue;
            }
          } catch {
            // realpath failed - directory may not be accessible
            continue;
          }

          // Recurse into subdirectory with namespace
          const subNamespace =
            namespace !== undefined && namespace !== '' ? `${namespace}:${entry.name}` : entry.name;
          const subResult = await this.scanDirectory(entryPath, source, subNamespace);
          commands.push(...subResult.commands);
          errors.push(...subResult.errors);
          continue;
        }

        // Skip non-markdown files
        if (!entry.name.endsWith('.md')) {
          continue;
        }

        // Load and parse the command file
        const result = await this.loadCommand(entryPath, entry.name, source, namespace);
        if (result.success) {
          commands.push(result.command);
        } else {
          errors.push(result.error);
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to scan directory';
      errors.push({
        path: dir,
        message,
        type: 'IO_ERROR',
      });
    }

    return { commands, errors };
  }

  /**
   * Load a single command from a markdown file.
   */
  private async loadCommand(
    filePath: string,
    fileName: string,
    source: CustomCommandSource,
    namespace?: string
  ): Promise<
    | { success: true; command: DiscoveredCustomCommand }
    | { success: false; error: CustomCommandError }
  > {
    try {
      const content = await readFile(filePath, 'utf-8');
      const result = parseCustomCommandMd(content, fileName);

      if (!result.success) {
        return {
          success: false,
          error: {
            path: filePath,
            message: result.error,
            type: result.type,
          },
        };
      }

      // Command name from filename (lowercase, without .md)
      const commandName = fileName.toLowerCase().replace(/\.md$/i, '');

      this.debug(`Loaded command`, { name: commandName, path: filePath, namespace });

      return {
        success: true,
        command: {
          content: result.content,
          path: filePath,
          name: commandName,
          source,
          namespace,
        },
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to read command file';
      return {
        success: false,
        error: {
          path: filePath,
          message,
          type: 'IO_ERROR',
        },
      };
    }
  }

  /**
   * Get a specific command by name.
   * Performs a fresh discovery and returns the matching command.
   */
  async getCommand(name: string): Promise<DiscoveredCustomCommand | null> {
    const { commands } = await this.discover();
    return commands.find((cmd) => cmd.name === name.toLowerCase()) ?? null;
  }

  /**
   * Check if a directory exists.
   */
  private async directoryExists(path: string): Promise<boolean> {
    try {
      const stats = await stat(path);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}

/**
 * Create a custom command loader with default options.
 */
export function createCustomCommandLoader(
  options?: CustomCommandLoaderOptions
): CustomCommandLoader {
  return new CustomCommandLoader(options);
}
