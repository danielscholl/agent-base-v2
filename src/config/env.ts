/**
 * Environment variable parsing utilities for configuration.
 * Maps environment variables to config paths with type coercion.
 */

import type { ProviderName, LogLevel, MemoryType } from './constants.js';
import { PROVIDER_NAMES, LOG_LEVELS, MEMORY_TYPES } from './constants.js';
import type { AppConfig } from './schema.js';

/**
 * Interface for reading environment variables.
 * Enables dependency injection for testing.
 */
export interface IEnvReader {
  /**
   * Get a string environment variable.
   */
  get(name: string): string | undefined;

  /**
   * Get a boolean environment variable with coercion.
   * Recognizes 'true', '1', 'yes' as true; 'false', '0', 'no' as false.
   */
  getBoolean(name: string): boolean | undefined;

  /**
   * Get a number environment variable with coercion.
   */
  getNumber(name: string): number | undefined;
}

/**
 * Default implementation using process.env.
 */
export class ProcessEnvReader implements IEnvReader {
  get(name: string): string | undefined {
    return process.env[name];
  }

  getBoolean(name: string): boolean | undefined {
    const value = this.get(name);
    if (value === undefined) return undefined;

    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;

    return undefined;
  }

  getNumber(name: string): number | undefined {
    const value = this.get(name);
    if (value === undefined) return undefined;

    const num = Number(value);
    return Number.isNaN(num) ? undefined : num;
  }
}

/**
 * Validator function type for env values.
 */
type EnvValidator = (value: string) => boolean;

/**
 * Environment variable to config path mappings.
 * Each mapping specifies: envVar, configPath, optional type coercion, and optional validator.
 */
interface EnvMapping {
  envVar: string;
  path: string[];
  type: 'string' | 'boolean' | 'number';
  /** Optional validator - if provided and returns false, the value is dropped */
  validate?: EnvValidator;
}

/**
 * URL validator for env values.
 */
function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Log level validator.
 */
function isValidLogLevel(value: string): value is LogLevel {
  return LOG_LEVELS.includes(value as LogLevel);
}

/**
 * Memory type validator.
 */
function isValidMemoryType(value: string): value is MemoryType {
  return MEMORY_TYPES.includes(value as MemoryType);
}

/**
 * Positive integer validator (for historyLimit, etc.).
 * Validates raw string value before number coercion.
 */
function isPositiveInteger(value: string): boolean {
  const num = Number(value);
  return !Number.isNaN(num) && Number.isInteger(num) && num > 0;
}

/**
 * Static environment variable mappings.
 * Invalid values for validated fields are silently dropped (fall back to defaults).
 */
const ENV_MAPPINGS: EnvMapping[] = [
  // OpenAI
  { envVar: 'OPENAI_API_KEY', path: ['providers', 'openai', 'apiKey'], type: 'string' },
  {
    envVar: 'OPENAI_BASE_URL',
    path: ['providers', 'openai', 'baseUrl'],
    type: 'string',
    validate: isValidUrl,
  },

  // Anthropic
  { envVar: 'ANTHROPIC_API_KEY', path: ['providers', 'anthropic', 'apiKey'], type: 'string' },

  // Azure OpenAI
  {
    envVar: 'AZURE_OPENAI_ENDPOINT',
    path: ['providers', 'azure', 'endpoint'],
    type: 'string',
    validate: isValidUrl,
  },
  {
    envVar: 'AZURE_OPENAI_DEPLOYMENT_NAME',
    path: ['providers', 'azure', 'deployment'],
    type: 'string',
  },
  { envVar: 'AZURE_OPENAI_API_KEY', path: ['providers', 'azure', 'apiKey'], type: 'string' },
  {
    envVar: 'AZURE_OPENAI_API_VERSION',
    path: ['providers', 'azure', 'apiVersion'],
    type: 'string',
  },

  // Azure AI Foundry
  {
    envVar: 'AZURE_PROJECT_ENDPOINT',
    path: ['providers', 'foundry', 'projectEndpoint'],
    type: 'string',
    validate: isValidUrl,
  },
  {
    envVar: 'AZURE_MODEL_DEPLOYMENT',
    path: ['providers', 'foundry', 'modelDeployment'],
    type: 'string',
  },

  // Gemini
  { envVar: 'GEMINI_API_KEY', path: ['providers', 'gemini', 'apiKey'], type: 'string' },
  { envVar: 'GEMINI_USE_VERTEXAI', path: ['providers', 'gemini', 'useVertexai'], type: 'boolean' },
  { envVar: 'GEMINI_PROJECT_ID', path: ['providers', 'gemini', 'projectId'], type: 'string' },
  { envVar: 'GEMINI_LOCATION', path: ['providers', 'gemini', 'location'], type: 'string' },

  // GitHub Models
  { envVar: 'GITHUB_TOKEN', path: ['providers', 'github', 'token'], type: 'string' },
  {
    envVar: 'GITHUB_MODELS_ENDPOINT',
    path: ['providers', 'github', 'endpoint'],
    type: 'string',
    validate: isValidUrl,
  },

  // Agent
  { envVar: 'AGENT_DATA_DIR', path: ['agent', 'dataDir'], type: 'string' },
  {
    envVar: 'AGENT_LOG_LEVEL',
    path: ['agent', 'logLevel'],
    type: 'string',
    validate: isValidLogLevel,
  },
  { envVar: 'AGENT_WORKSPACE_ROOT', path: ['agent', 'workspaceRoot'], type: 'string' },

  // Telemetry
  { envVar: 'ENABLE_OTEL', path: ['telemetry', 'enabled'], type: 'boolean' },
  {
    envVar: 'OTLP_ENDPOINT',
    path: ['telemetry', 'otlpEndpoint'],
    type: 'string',
    validate: isValidUrl,
  },
  {
    envVar: 'APPLICATIONINSIGHTS_CONNECTION_STRING',
    path: ['telemetry', 'applicationinsightsConnectionString'],
    type: 'string',
  },

  // Memory
  { envVar: 'MEMORY_ENABLED', path: ['memory', 'enabled'], type: 'boolean' },
  { envVar: 'MEMORY_TYPE', path: ['memory', 'type'], type: 'string', validate: isValidMemoryType },
  {
    envVar: 'MEMORY_HISTORY_LIMIT',
    path: ['memory', 'historyLimit'],
    type: 'number',
    validate: isPositiveInteger,
  },
];

/**
 * Set a value at a nested path in an object.
 * Creates intermediate objects as needed.
 */
function setNestedValue(obj: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) return;

  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (key === undefined) continue;
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = path[path.length - 1];
  if (lastKey !== undefined) {
    current[lastKey] = value;
  }
}

/**
 * Check if a provider name is valid.
 */
function isValidProviderName(name: string): name is ProviderName {
  return PROVIDER_NAMES.includes(name as ProviderName);
}

/**
 * Read environment variables and return a partial config object.
 * Only includes values that are present in environment variables.
 */
export function readEnvConfig(envReader: IEnvReader = new ProcessEnvReader()): Partial<AppConfig> {
  const config: Record<string, unknown> = {};

  // Process static mappings
  for (const mapping of ENV_MAPPINGS) {
    let value: string | boolean | number | undefined;
    const rawValue = envReader.get(mapping.envVar);

    // Skip if no value set
    if (rawValue === undefined) {
      continue;
    }

    // Validate string values if validator is provided (before type coercion for booleans/numbers)
    if (mapping.validate !== undefined && !mapping.validate(rawValue)) {
      // Invalid value - silently skip to fall back to defaults
      continue;
    }

    switch (mapping.type) {
      case 'boolean':
        value = envReader.getBoolean(mapping.envVar);
        break;
      case 'number':
        value = envReader.getNumber(mapping.envVar);
        break;
      default:
        value = rawValue;
    }

    if (value !== undefined) {
      setNestedValue(config, mapping.path, value);
    }
  }

  // Handle LLM_PROVIDER (sets providers.default)
  const llmProvider = envReader.get('LLM_PROVIDER');
  if (llmProvider !== undefined && llmProvider !== '' && isValidProviderName(llmProvider)) {
    setNestedValue(config, ['providers', 'default'], llmProvider);
  }

  // Note: AGENT_MODEL is handled in ConfigManager.load() after merging,
  // so it applies to the final providers.default (which may come from user/project config)

  return config as Partial<AppConfig>;
}

/**
 * Get the default provider from environment variables.
 */
export function getEnvDefaultProvider(
  envReader: IEnvReader = new ProcessEnvReader()
): ProviderName | undefined {
  const provider = envReader.get('LLM_PROVIDER');
  if (provider !== undefined && provider !== '' && isValidProviderName(provider)) {
    return provider;
  }
  return undefined;
}

/**
 * Get the model from environment variables.
 */
export function getEnvModel(envReader: IEnvReader = new ProcessEnvReader()): string | undefined {
  return envReader.get('AGENT_MODEL');
}
