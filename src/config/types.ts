/**
 * TypeScript interfaces and types for configuration management.
 * Provides abstractions for file system, environment, and callbacks.
 */

import type { AppConfig } from './schema.js';

// Re-export IEnvReader from env.ts for convenience
export type { IEnvReader } from './env.js';

// -----------------------------------------------------------------------------
// File System Abstraction
// -----------------------------------------------------------------------------

/**
 * Interface for file system operations.
 * Enables dependency injection for testing.
 */
export interface IFileSystem {
  /**
   * Read file contents as string.
   * @throws Error if file doesn't exist or can't be read
   */
  readFile(path: string): Promise<string>;

  /**
   * Write string contents to a file.
   * Creates parent directories if they don't exist.
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Check if a file or directory exists.
   */
  exists(path: string): Promise<boolean>;

  /**
   * Create a directory and any necessary parent directories.
   */
  mkdir(path: string): Promise<void>;

  /**
   * Set file permissions (Unix-like systems only).
   * No-op on Windows.
   */
  chmod(path: string, mode: number): Promise<void>;

  /**
   * Resolve a path, expanding ~ to home directory.
   */
  resolvePath(path: string): string;

  /**
   * Join path segments.
   */
  joinPath(...segments: string[]): string;

  /**
   * Get the user's home directory.
   */
  getHomeDir(): string;

  /**
   * Get the current working directory.
   */
  getCwd(): string;

  /**
   * Get the directory name of a path.
   */
  dirname(filePath: string): string;

  /**
   * Delete a file.
   * @throws Error if file doesn't exist or can't be deleted
   */
  unlink(path: string): Promise<void>;

  /**
   * Read directory contents.
   * @returns Array of filenames (not full paths)
   */
  readdir(path: string): Promise<string[]>;
}

// -----------------------------------------------------------------------------
// Callback Interfaces
// -----------------------------------------------------------------------------

/**
 * Callbacks for configuration events.
 * Used to notify consumers of config changes.
 */
export interface ConfigCallbacks {
  /**
   * Called when configuration is loaded.
   */
  onConfigLoad?: (config: AppConfig, source: ConfigSource) => void;

  /**
   * Called when configuration is saved.
   */
  onConfigSave?: (config: AppConfig, path: string) => void;

  /**
   * Called when a validation error occurs.
   */
  onValidationError?: (errors: ConfigValidationError[]) => void;
}

/**
 * Source of configuration data.
 */
export type ConfigSource = 'defaults' | 'user' | 'project' | 'environment' | 'merged';

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

/**
 * Validation error details for a specific field.
 */
export interface ConfigValidationError {
  path: string;
  message: string;
  code: string;
}

/**
 * Custom error class for configuration failures.
 */
export class ConfigError extends Error {
  public readonly code: ConfigErrorCode;
  public readonly path?: string;
  public readonly details?: ConfigValidationError[];

  constructor(
    message: string,
    code: ConfigErrorCode,
    path?: string,
    details?: ConfigValidationError[]
  ) {
    super(message);
    this.name = 'ConfigError';
    this.code = code;
    this.path = path;
    this.details = details;

    // Maintain proper stack trace in V8
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, ConfigError);
    }
  }
}

/**
 * Error codes for configuration errors.
 */
export type ConfigErrorCode =
  | 'VALIDATION_FAILED'
  | 'FILE_NOT_FOUND'
  | 'FILE_READ_ERROR'
  | 'FILE_WRITE_ERROR'
  | 'PARSE_ERROR'
  | 'PERMISSION_ERROR'
  | 'INVALID_PATH';

// -----------------------------------------------------------------------------
// Tool Response Pattern
// -----------------------------------------------------------------------------

/**
 * Structured response for configuration operations.
 * Follows the project's ToolResponse pattern.
 */
export interface ConfigResponse<T> {
  success: boolean;
  result?: T;
  error?: string;
  message: string;
}

/**
 * Create a successful config response.
 */
export function successResponse<T>(result: T, message: string): ConfigResponse<T> {
  return { success: true, result, message };
}

/**
 * Create an error config response.
 */
export function errorResponse<T>(error: string, message: string): ConfigResponse<T> {
  return { success: false, error, message };
}

// -----------------------------------------------------------------------------
// Config Manager Options
// -----------------------------------------------------------------------------

/**
 * Options for ConfigManager constructor.
 */
export interface ConfigManagerOptions {
  /**
   * File system implementation (defaults to NodeFileSystem).
   */
  fileSystem?: IFileSystem;

  /**
   * Environment reader implementation (defaults to ProcessEnvReader).
   */
  envReader?: import('./env.js').IEnvReader;

  /**
   * Callbacks for configuration events.
   */
  callbacks?: ConfigCallbacks;

  /**
   * User config directory (defaults to ~/.agent).
   */
  userConfigDir?: string;

  /**
   * Project config directory name (defaults to .agent).
   */
  projectConfigDirName?: string;
}
