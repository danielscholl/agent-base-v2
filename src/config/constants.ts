/**
 * Default configuration values for the agent framework.
 * These constants provide sensible defaults for all configuration sections.
 */

// Config file and directory names
export const CONFIG_DIR_NAME = '.agent' as const;
export const CONFIG_FILE_NAME = 'config.yaml' as const;
export const CONFIG_VERSION = '1.0' as const;

// Provider names
export const PROVIDER_NAMES = [
  'local',
  'openai',
  'anthropic',
  'azure',
  'foundry',
  'gemini',
  'github',
] as const;

export type ProviderName = (typeof PROVIDER_NAMES)[number];

// Default provider
export const DEFAULT_PROVIDER: ProviderName = 'openai';

// Provider-specific defaults
// Local provider defaults to Ollama (accessible from host)
// For Docker Model Runner, use: http://model-runner.docker.internal/engines/llama.cpp/v1
export const DEFAULT_LOCAL_BASE_URL = 'http://localhost:11434/v1';
export const DEFAULT_LOCAL_MODEL = 'qwen3:latest';

export const DEFAULT_OPENAI_MODEL = 'gpt-4o';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

export const DEFAULT_AZURE_API_VERSION = '2024-06-01';
export const DEFAULT_AZURE_MODEL = 'gpt-4o';

export const DEFAULT_FOUNDRY_MODEL = 'gpt-4o';
export const DEFAULT_FOUNDRY_MODE = 'cloud' as const;
export const DEFAULT_FOUNDRY_LOCAL_MODEL = 'qwen2.5-coder-14b';

// Foundry modes
export const FOUNDRY_MODES = ['local', 'cloud'] as const;
export type FoundryMode = (typeof FOUNDRY_MODES)[number];

export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash-exp';
export const DEFAULT_GEMINI_LOCATION = 'us-central1';
export const DEFAULT_GEMINI_USE_VERTEXAI = false;

export const DEFAULT_GITHUB_MODEL = 'gpt-4o';
export const DEFAULT_GITHUB_ENDPOINT = 'https://models.github.ai/inference';

// Agent defaults
export const DEFAULT_DATA_DIR = '~/.agent';
export const DEFAULT_LOG_LEVEL = 'info' as const;
export const DEFAULT_FILESYSTEM_WRITES_ENABLED = true;

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

// Telemetry defaults
export const DEFAULT_TELEMETRY_ENABLED = false;
export const DEFAULT_ENABLE_SENSITIVE_DATA = false;

// Memory defaults
export const DEFAULT_MEMORY_ENABLED = true;
export const DEFAULT_MEMORY_TYPE = 'local' as const;
export const DEFAULT_MEMORY_HISTORY_LIMIT = 100;

export const MEMORY_TYPES = ['local', 'mem0'] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

// Skills defaults
export const DEFAULT_SKILL_SCRIPT_TIMEOUT = 30000; // 30 seconds in ms

// Retry defaults (from architecture.md)
export const DEFAULT_RETRY_ENABLED = true;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_BASE_DELAY_MS = 1000; // 1 second
export const DEFAULT_MAX_DELAY_MS = 10000; // 10 seconds
export const DEFAULT_ENABLE_JITTER = true;
export const DEFAULT_JITTER_FACTOR = 0.2; // 20% variance

// File permissions (POSIX)
export const CONFIG_FILE_PERMISSIONS = 0o600;

/**
 * Default configuration object for providers.
 * Uses const assertion for type inference.
 */
export const DEFAULT_PROVIDERS_CONFIG = {
  default: DEFAULT_PROVIDER,
  local: {
    baseUrl: DEFAULT_LOCAL_BASE_URL,
    model: DEFAULT_LOCAL_MODEL,
  },
  openai: {
    apiKey: undefined,
    model: DEFAULT_OPENAI_MODEL,
  },
  anthropic: {
    apiKey: undefined,
    model: DEFAULT_ANTHROPIC_MODEL,
  },
  azure: {
    endpoint: undefined,
    deployment: undefined,
    apiVersion: DEFAULT_AZURE_API_VERSION,
    apiKey: undefined,
  },
  foundry: {
    mode: DEFAULT_FOUNDRY_MODE,
    projectEndpoint: undefined,
    modelDeployment: undefined,
    apiKey: undefined,
    modelAlias: DEFAULT_FOUNDRY_LOCAL_MODEL,
    temperature: undefined,
  },
  gemini: {
    apiKey: undefined,
    model: DEFAULT_GEMINI_MODEL,
    useVertexai: DEFAULT_GEMINI_USE_VERTEXAI,
    projectId: undefined,
    location: DEFAULT_GEMINI_LOCATION,
  },
  github: {
    token: undefined,
    model: DEFAULT_GITHUB_MODEL,
    endpoint: DEFAULT_GITHUB_ENDPOINT,
    org: undefined,
  },
} as const;

/**
 * Default agent configuration.
 */
export const DEFAULT_AGENT_CONFIG = {
  dataDir: DEFAULT_DATA_DIR,
  logLevel: DEFAULT_LOG_LEVEL,
  systemPromptFile: undefined,
  workspaceRoot: undefined,
  filesystemWritesEnabled: DEFAULT_FILESYSTEM_WRITES_ENABLED,
} as const;

/**
 * Default telemetry configuration.
 */
export const DEFAULT_TELEMETRY_CONFIG = {
  enabled: DEFAULT_TELEMETRY_ENABLED,
  enableSensitiveData: DEFAULT_ENABLE_SENSITIVE_DATA,
  otlpEndpoint: undefined,
  applicationinsightsConnectionString: undefined,
} as const;

/**
 * Default Mem0 configuration.
 */
export const DEFAULT_MEM0_CONFIG = {
  storagePath: undefined,
  apiKey: undefined,
  orgId: undefined,
  userId: undefined,
  projectId: undefined,
} as const;

/**
 * Default memory configuration.
 */
export const DEFAULT_MEMORY_CONFIG = {
  enabled: DEFAULT_MEMORY_ENABLED,
  type: DEFAULT_MEMORY_TYPE,
  historyLimit: DEFAULT_MEMORY_HISTORY_LIMIT,
  mem0: DEFAULT_MEM0_CONFIG,
} as const;

/**
 * Default skills configuration.
 */
export const DEFAULT_SKILLS_CONFIG = {
  plugins: [] as string[],
  disabledBundled: [] as string[],
  enabledBundled: [] as string[],
  userDir: undefined,
  scriptTimeout: DEFAULT_SKILL_SCRIPT_TIMEOUT,
} as const;

// Session defaults
export const DEFAULT_SESSION_DIR = '~/.agent/sessions';
export const DEFAULT_MAX_SESSIONS = 50;
export const DEFAULT_AUTO_SAVE = true;
export const DEFAULT_SESSION_NAME_MAX_LENGTH = 64;

/**
 * Default session configuration.
 */
export const DEFAULT_SESSION_CONFIG = {
  autoSave: DEFAULT_AUTO_SAVE,
  maxSessions: DEFAULT_MAX_SESSIONS,
} as const;
