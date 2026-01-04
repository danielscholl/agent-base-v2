/**
 * Configuration manager for loading, validating, and saving config.
 * Implements hierarchical config merging: defaults < user < project < env
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { parse as parseYaml, stringify as stringifyYaml, YAMLParseError } from 'yaml';

import { CONFIG_DIR_NAME, CONFIG_FILE_NAME, CONFIG_FILE_PERMISSIONS } from './constants.js';
import { ProcessEnvReader, readEnvConfig, getEnvModel, type IEnvReader } from './env.js';
import { AppConfigSchema, getDefaultConfig, type AppConfig } from './schema.js';
import type {
  ConfigCallbacks,
  ConfigManagerOptions,
  ConfigResponse,
  ConfigValidationError,
  IFileSystem,
} from './types.js';
import { ConfigError, errorResponse, successResponse } from './types.js';

// -----------------------------------------------------------------------------
// Deep Merge Utility
// -----------------------------------------------------------------------------

/**
 * Check if a value is a plain object (not null, array, or other special types).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    value.constructor === Object
  );
}

/**
 * Deep merge two objects, with source values overriding target values.
 * Arrays are replaced (not concatenated).
 *
 * @param target - Base object
 * @param source - Object to merge in (overrides target)
 * @returns Merged object
 */
type DeepPartial<T> =
  T extends Array<infer U>
    ? Array<U>
    : T extends Record<string, unknown>
      ? { [K in keyof T]?: DeepPartial<T[K]> } & Record<string, unknown>
      : T;

export function deepMerge<T extends Record<string, unknown>>(target: T, source: DeepPartial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = (source as Record<string, unknown>)[key];
    const targetValue = (result as Record<string, unknown>)[key];

    if (sourceValue === undefined) {
      continue;
    }

    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      // Recursively merge nested objects
      (result as Record<string, unknown>)[key] = deepMerge(
        targetValue,
        sourceValue as DeepPartial<typeof targetValue>
      );
    } else {
      // Replace value (including arrays)
      (result as Record<string, unknown>)[key] = sourceValue;
    }
  }

  return result;
}

// -----------------------------------------------------------------------------
// Node.js File System Implementation
// -----------------------------------------------------------------------------

/**
 * Default file system implementation using Node.js fs module.
 */
export class NodeFileSystem implements IFileSystem {
  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  async chmod(filePath: string, mode: number): Promise<void> {
    // Only apply chmod on Unix-like systems
    if (process.platform !== 'win32') {
      await fs.chmod(filePath, mode);
    }
  }

  resolvePath(inputPath: string): string {
    if (inputPath.startsWith('~')) {
      return path.join(os.homedir(), inputPath.slice(1));
    }
    return path.resolve(inputPath);
  }

  joinPath(...segments: string[]): string {
    return path.join(...segments);
  }

  getHomeDir(): string {
    return os.homedir();
  }

  getCwd(): string {
    return process.cwd();
  }

  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  async unlink(filePath: string): Promise<void> {
    await fs.unlink(filePath);
  }

  async readdir(dirPath: string): Promise<string[]> {
    return fs.readdir(dirPath);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fs.rename(oldPath, newPath);
  }
}

// -----------------------------------------------------------------------------
// Config Manager
// -----------------------------------------------------------------------------

/**
 * ConfigManager handles loading, validating, and saving configuration.
 *
 * Config hierarchy (highest to lowest priority):
 * 1. Environment variables
 * 2. Project config (./.agent/config.yaml)
 * 3. User config (~/.agent/config.yaml)
 * 4. Schema defaults
 */
export class ConfigManager {
  private readonly fileSystem: IFileSystem;
  private readonly envReader: IEnvReader;
  private readonly callbacks?: ConfigCallbacks;
  private readonly userConfigDir: string;
  private readonly projectConfigDirName: string;

  constructor(options: ConfigManagerOptions = {}) {
    this.fileSystem = options.fileSystem ?? new NodeFileSystem();
    this.envReader = options.envReader ?? new ProcessEnvReader();
    this.callbacks = options.callbacks;
    this.userConfigDir = options.userConfigDir ?? `~/${CONFIG_DIR_NAME}`;
    this.projectConfigDirName = options.projectConfigDirName ?? CONFIG_DIR_NAME;
  }

  /**
   * Get the default configuration with all schema defaults applied.
   */
  getDefaults(): AppConfig {
    return getDefaultConfig();
  }

  /**
   * Get the user config file path.
   */
  getUserConfigPath(): string {
    return this.fileSystem.resolvePath(
      this.fileSystem.joinPath(this.userConfigDir, CONFIG_FILE_NAME)
    );
  }

  /**
   * Get the project config file path.
   * @param projectPath - Optional project root path (defaults to cwd)
   */
  getProjectConfigPath(projectPath?: string): string {
    const root = projectPath ?? this.fileSystem.getCwd();
    return this.fileSystem.joinPath(root, this.projectConfigDirName, CONFIG_FILE_NAME);
  }

  /**
   * Load configuration from a YAML file.
   * @param filePath - Path to the config file
   * @returns Partial config or undefined if file doesn't exist
   */
  private async loadConfigFile(filePath: string): Promise<Partial<AppConfig> | undefined> {
    try {
      if (!(await this.fileSystem.exists(filePath))) {
        return undefined;
      }

      const content = await this.fileSystem.readFile(filePath);
      return parseYaml(content) as Partial<AppConfig>;
    } catch (error) {
      if (error instanceof YAMLParseError) {
        throw new ConfigError(`Invalid YAML in config file: ${filePath}`, 'PARSE_ERROR', filePath);
      }
      throw error;
    }
  }

  /**
   * Load and merge configuration from all sources.
   * Hierarchy: defaults < user < project < environment
   *
   * @param projectPath - Optional project root path for project config
   * @returns ConfigResponse with the merged configuration
   */
  async load(projectPath?: string): Promise<ConfigResponse<AppConfig>> {
    try {
      // Start with schema defaults
      let config = this.getDefaults();

      // Load user config (~/.agent/config.yaml)
      const userConfigPath = this.getUserConfigPath();
      const userConfig = await this.loadConfigFile(userConfigPath);
      if (userConfig) {
        config = deepMerge(config, userConfig);
        this.callbacks?.onConfigLoad?.(config, 'user');
      }

      // Load project config (./.agent/config.yaml)
      const projectConfigPath = this.getProjectConfigPath(projectPath);
      const projectConfig = await this.loadConfigFile(projectConfigPath);
      if (projectConfig) {
        config = deepMerge(config, projectConfig);
        this.callbacks?.onConfigLoad?.(config, 'project');
      }

      // Apply environment variable overrides
      const envConfig = readEnvConfig(this.envReader);
      if (Object.keys(envConfig).length > 0) {
        config = deepMerge(config, envConfig);
        this.callbacks?.onConfigLoad?.(config, 'environment');
      }

      // Apply AGENT_MODEL to the final default provider (after all merging)
      const agentModel = getEnvModel(this.envReader);
      if (agentModel !== undefined && agentModel !== '') {
        const defaultProvider = config.providers.default;
        // Determine the correct field name for the model
        // azure uses 'deployment', foundry uses 'modelDeployment', others use 'model'
        const modelFieldName =
          defaultProvider === 'azure'
            ? 'deployment'
            : defaultProvider === 'foundry'
              ? 'modelDeployment'
              : 'model';

        // Set model on the default provider
        // Use unknown cast to allow dynamic key access, Zod validates during safeParse
        const providers = config.providers as unknown as Record<
          string,
          Record<string, unknown> | undefined
        >;
        const providerConfig = providers[defaultProvider];
        if (providerConfig === undefined) {
          providers[defaultProvider] = { [modelFieldName]: agentModel };
        } else {
          providerConfig[modelFieldName] = agentModel;
        }
      }

      // Validate the final merged config
      const validation = AppConfigSchema.safeParse(config);
      if (!validation.success) {
        const errors = this.formatZodErrors(validation.error);
        this.callbacks?.onValidationError?.(errors);
        return errorResponse(
          'VALIDATION_FAILED',
          `Config validation failed: ${errors[0]?.message ?? 'Unknown error'}`
        );
      }

      this.callbacks?.onConfigLoad?.(validation.data, 'merged');
      return successResponse(validation.data, 'Configuration loaded successfully');
    } catch (error) {
      if (error instanceof ConfigError) {
        return errorResponse(error.code, error.message);
      }
      const message = error instanceof Error ? error.message : 'Unknown error loading config';
      return errorResponse('FILE_READ_ERROR', message);
    }
  }

  /**
   * Validate a configuration object.
   * @param config - Configuration to validate
   * @returns ConfigResponse with validation result
   */
  validate(config: unknown): ConfigResponse<AppConfig> {
    const validation = AppConfigSchema.safeParse(config);

    if (!validation.success) {
      const errors = this.formatZodErrors(validation.error);
      this.callbacks?.onValidationError?.(errors);
      return errorResponse(
        'VALIDATION_FAILED',
        `Config validation failed: ${errors[0]?.message ?? 'Unknown error'}`
      );
    }

    return successResponse(validation.data, 'Configuration is valid');
  }

  /**
   * Save configuration to a file.
   * Produces minimal YAML (only non-default, non-null values).
   *
   * @param config - Configuration to save
   * @param filePath - Optional file path (defaults to user config)
   * @returns ConfigResponse indicating success or failure
   */
  async save(config: AppConfig, filePath?: string): Promise<ConfigResponse<void>> {
    // Validate before saving
    const validation = this.validate(config);
    if (!validation.success) {
      return errorResponse(validation.error ?? 'VALIDATION_FAILED', validation.message);
    }

    // Use the validated/parsed config (Zod strips unknown fields)
    const validatedConfig = validation.result as AppConfig;
    const targetPath = filePath ?? this.getUserConfigPath();

    try {
      // Create minimal config (only enabled providers, non-default values)
      const minimalConfig = this.createMinimalConfig(validatedConfig);

      // Ensure parent directory exists
      const dir = this.fileSystem.dirname(targetPath);
      await this.fileSystem.mkdir(dir);

      // Write the config file as YAML
      const content = stringifyYaml(minimalConfig, { indent: 2 });
      await this.fileSystem.writeFile(targetPath, content);

      // Set restrictive permissions on Unix
      await this.fileSystem.chmod(targetPath, CONFIG_FILE_PERMISSIONS);

      this.callbacks?.onConfigSave?.(validatedConfig, targetPath);
      return successResponse(undefined, `Configuration saved to ${targetPath}`);
    } catch (error) {
      if (error instanceof ConfigError) {
        return errorResponse(error.code, error.message);
      }
      const message = error instanceof Error ? error.message : 'Unknown error saving config';
      return errorResponse('FILE_WRITE_ERROR', message);
    }
  }

  /**
   * Create a minimal config object for serialization.
   * Only includes:
   * - version (always)
   * - providers.default (always)
   * - Provider configs that have apiKey, token, or endpoint set
   * - Non-default values in other sections
   */
  private createMinimalConfig(config: AppConfig): Partial<AppConfig> {
    const minimal: Partial<AppConfig> = {
      version: config.version,
    };

    // Always include providers section with default
    const providers: Record<string, unknown> = {
      default: config.providers.default,
    };

    // Include provider configs that have credentials or are the default
    const providerKeys = [
      'local',
      'openai',
      'anthropic',
      'azure',
      'foundry',
      'gemini',
      'github',
    ] as const;
    for (const key of providerKeys) {
      const providerConfig = config.providers[key];
      if (
        providerConfig &&
        this.shouldIncludeProvider(key, providerConfig, config.providers.default)
      ) {
        providers[key] = this.cleanProviderConfig(providerConfig);
      }
    }

    minimal.providers = providers as AppConfig['providers'];

    // Include agent section if non-default values exist
    const agentDiff = this.getNonDefaultValues(config.agent, getDefaultConfig().agent);
    if (Object.keys(agentDiff).length > 0) {
      minimal.agent = agentDiff as AppConfig['agent'];
    }

    // Include telemetry section if enabled or has endpoints configured
    if (
      config.telemetry.enabled ||
      config.telemetry.otlpEndpoint !== undefined ||
      config.telemetry.applicationinsightsConnectionString !== undefined
    ) {
      minimal.telemetry = this.cleanObject(config.telemetry) as AppConfig['telemetry'];
    }

    // Include memory section if enabled
    if (config.memory.enabled) {
      minimal.memory = this.cleanObject(config.memory) as AppConfig['memory'];
    }

    // Include skills section if plugins or customizations exist
    if (
      config.skills.plugins.length > 0 ||
      config.skills.disabledBundled.length > 0 ||
      config.skills.enabledBundled.length > 0 ||
      config.skills.userDir !== undefined
    ) {
      minimal.skills = this.cleanObject(config.skills) as AppConfig['skills'];
    }

    return minimal;
  }

  /**
   * Check if a provider config should be included in minimal output.
   * Includes provider if it's the default or has any non-undefined keys after cleaning.
   */
  private shouldIncludeProvider(
    name: string,
    config: Record<string, unknown>,
    defaultProvider: string
  ): boolean {
    // Always include the default provider
    if (name === defaultProvider) return true;

    // Include if the cleaned config has any non-undefined keys
    // This captures Gemini Vertex (useVertexai, projectId, location),
    // OpenAI with custom baseUrl, and any other meaningful configuration
    const cleaned = this.cleanProviderConfig(config);
    return Object.keys(cleaned).length > 0;
  }

  /**
   * Remove undefined values from provider config.
   */
  private cleanProviderConfig(config: Record<string, unknown>): Record<string, unknown> {
    return this.cleanObject(config);
  }

  /**
   * Remove undefined and null values from an object.
   */
  private cleanObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
    const result: Partial<T> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined && value !== null) {
        if (isPlainObject(value)) {
          const cleaned = this.cleanObject(value);
          if (Object.keys(cleaned).length > 0) {
            result[key as keyof T] = cleaned as T[keyof T];
          }
        } else if (Array.isArray(value) && value.length > 0) {
          result[key as keyof T] = value as T[keyof T];
        } else if (!Array.isArray(value)) {
          result[key as keyof T] = value as T[keyof T];
        }
      }
    }
    return result;
  }

  /**
   * Get values that differ from defaults.
   */
  private getNonDefaultValues<T extends Record<string, unknown>>(
    current: T,
    defaults: T
  ): Partial<T> {
    const result: Partial<T> = {};
    for (const [key, value] of Object.entries(current)) {
      const defaultValue = defaults[key];
      if (value !== defaultValue && value !== undefined) {
        result[key as keyof T] = value as T[keyof T];
      }
    }
    return result;
  }

  /**
   * Format Zod validation errors into ConfigValidationError array.
   */
  private formatZodErrors(error: import('zod').ZodError): ConfigValidationError[] {
    return error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));
  }
}

/**
 * Convenience function to load config with default options.
 */
export async function loadConfig(projectPath?: string): Promise<ConfigResponse<AppConfig>> {
  const manager = new ConfigManager();
  return manager.load(projectPath);
}

/**
 * Check if user configuration file exists.
 * Returns true if ~/.agent/config.yaml exists.
 */
export async function userConfigExists(): Promise<boolean> {
  const manager = new ConfigManager();
  const userConfigPath = manager.getUserConfigPath();
  const fs = new NodeFileSystem();
  return fs.exists(userConfigPath);
}

/**
 * Check if any configuration file exists (user or project).
 * Returns true if either ~/.agent/config.yaml or ./.agent/config.yaml exists.
 */
export async function configFileExists(projectPath?: string): Promise<boolean> {
  const manager = new ConfigManager();
  const fs = new NodeFileSystem();

  const userConfigPath = manager.getUserConfigPath();
  if (await fs.exists(userConfigPath)) {
    return true;
  }

  const projectConfigPath = manager.getProjectConfigPath(projectPath);
  if (await fs.exists(projectConfigPath)) {
    return true;
  }

  return false;
}

/**
 * Load configuration from files only (no environment variable merging).
 * Use this for health checks and validation where you need to know
 * which providers are explicitly configured in config files.
 */
export async function loadConfigFromFiles(
  projectPath?: string
): Promise<ConfigResponse<AppConfig>> {
  const manager = new ConfigManager();
  const fs = new NodeFileSystem();

  try {
    // Start with schema defaults
    let config = manager.getDefaults();

    // Load user config (~/.agent/config.yaml)
    const userConfigPath = manager.getUserConfigPath();
    if (await fs.exists(userConfigPath)) {
      const content = await fs.readFile(userConfigPath);
      try {
        const userConfig = parseYaml(content) as Partial<AppConfig>;
        config = deepMerge(config, userConfig);
      } catch (error) {
        if (error instanceof YAMLParseError) {
          throw new ConfigError(
            `Invalid YAML in config file: ${userConfigPath}`,
            'PARSE_ERROR',
            userConfigPath
          );
        }
        throw error;
      }
    }

    // Load project config (./.agent/config.yaml)
    const projectConfigPath = manager.getProjectConfigPath(projectPath);
    if (await fs.exists(projectConfigPath)) {
      const content = await fs.readFile(projectConfigPath);
      try {
        const projectConfig = parseYaml(content) as Partial<AppConfig>;
        config = deepMerge(config, projectConfig);
      } catch (error) {
        if (error instanceof YAMLParseError) {
          throw new ConfigError(
            `Invalid YAML in config file: ${projectConfigPath}`,
            'PARSE_ERROR',
            projectConfigPath
          );
        }
        throw error;
      }
    }

    // Validate the merged config
    const validation = AppConfigSchema.safeParse(config);
    if (!validation.success) {
      return errorResponse('VALIDATION_FAILED', 'Config validation failed');
    }

    return successResponse(validation.data, 'Configuration loaded from files');
  } catch (error) {
    if (error instanceof ConfigError) {
      return errorResponse(error.code, error.message);
    }
    const message = error instanceof Error ? error.message : 'Unknown error loading config';
    return errorResponse('FILE_READ_ERROR', message);
  }
}
