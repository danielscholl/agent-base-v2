/**
 * Configuration module public API.
 *
 * @module config
 *
 * @example
 * import { ConfigManager, AppConfig, loadConfig } from './config';
 *
 * // Quick load with defaults
 * const result = await loadConfig();
 * if (result.success) {
 *   console.log('Provider:', result.result.providers.default);
 * }
 *
 * // Full control with ConfigManager
 * const manager = new ConfigManager({ callbacks: { onConfigLoad: console.log } });
 * const config = await manager.load('./my-project');
 */

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------
export {
  // Directory/file names
  CONFIG_DIR_NAME,
  CONFIG_FILE_NAME,
  CONFIG_VERSION,
  CONFIG_FILE_PERMISSIONS,
  // Provider constants
  PROVIDER_NAMES,
  DEFAULT_PROVIDER,
  // Provider-specific defaults
  DEFAULT_LOCAL_BASE_URL,
  DEFAULT_LOCAL_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_AZURE_API_VERSION,
  DEFAULT_AZURE_MODEL,
  DEFAULT_FOUNDRY_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_LOCATION,
  DEFAULT_GEMINI_USE_VERTEXAI,
  DEFAULT_GITHUB_MODEL,
  DEFAULT_GITHUB_ENDPOINT,
  // Agent defaults
  DEFAULT_DATA_DIR,
  DEFAULT_LOG_LEVEL,
  DEFAULT_FILESYSTEM_WRITES_ENABLED,
  LOG_LEVELS,
  // Telemetry defaults
  DEFAULT_TELEMETRY_ENABLED,
  DEFAULT_ENABLE_SENSITIVE_DATA,
  // Memory defaults
  DEFAULT_MEMORY_ENABLED,
  DEFAULT_MEMORY_TYPE,
  DEFAULT_MEMORY_HISTORY_LIMIT,
  MEMORY_TYPES,
  // Skills defaults
  DEFAULT_SKILL_SCRIPT_TIMEOUT,
  // Default config objects
  DEFAULT_PROVIDERS_CONFIG,
  DEFAULT_AGENT_CONFIG,
  DEFAULT_TELEMETRY_CONFIG,
  DEFAULT_MEM0_CONFIG,
  DEFAULT_MEMORY_CONFIG,
  DEFAULT_SKILLS_CONFIG,
} from './constants.js';

// Export types from constants
export type { ProviderName, LogLevel, MemoryType } from './constants.js';

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------
export {
  // Provider schemas
  LocalProviderConfigSchema,
  OpenAIProviderConfigSchema,
  AnthropicProviderConfigSchema,
  AzureOpenAIProviderConfigSchema,
  FoundryProviderConfigSchema,
  GeminiProviderConfigSchema,
  GitHubProviderConfigSchema,
  ProvidersConfigSchema,
  // Config section schemas
  AgentConfigSchema,
  TelemetryConfigSchema,
  Mem0ConfigSchema,
  MemoryConfigSchema,
  SkillsConfigSchema,
  // Root schema
  AppConfigSchema,
  // Utility functions
  getDefaultConfig,
  parseConfig,
} from './schema.js';

// Export inferred types from schemas
export type {
  LocalProviderConfig,
  OpenAIProviderConfig,
  AnthropicProviderConfig,
  AzureOpenAIProviderConfig,
  FoundryProviderConfig,
  GeminiProviderConfig,
  GitHubProviderConfig,
  ProvidersConfig,
  AgentConfig,
  TelemetryConfig,
  Mem0Config,
  MemoryConfig,
  SkillsConfig,
  AppConfig,
} from './schema.js';

// -----------------------------------------------------------------------------
// Environment Variable Utilities
// -----------------------------------------------------------------------------
export { ProcessEnvReader, readEnvConfig, getEnvDefaultProvider, getEnvModel } from './env.js';

export type { IEnvReader } from './env.js';

// -----------------------------------------------------------------------------
// Types and Interfaces
// -----------------------------------------------------------------------------
export { ConfigError, successResponse, errorResponse } from './types.js';

export type {
  IFileSystem,
  ConfigCallbacks,
  ConfigSource,
  ConfigValidationError,
  ConfigErrorCode,
  ConfigResponse,
  ConfigManagerOptions,
} from './types.js';

// -----------------------------------------------------------------------------
// Config Manager
// -----------------------------------------------------------------------------
export { ConfigManager, NodeFileSystem, deepMerge, loadConfig } from './manager.js';
