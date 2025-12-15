/**
 * Zod schemas for configuration validation.
 * Types are inferred from schemas using z.infer<> - no manual type definitions.
 */

import { z } from 'zod';
import {
  CONFIG_VERSION,
  DEFAULT_LOCAL_BASE_URL,
  DEFAULT_LOCAL_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_AZURE_API_VERSION,
  DEFAULT_FOUNDRY_MODE,
  DEFAULT_FOUNDRY_LOCAL_MODEL,
  FOUNDRY_MODES,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_LOCATION,
  DEFAULT_GEMINI_USE_VERTEXAI,
  DEFAULT_GITHUB_MODEL,
  DEFAULT_GITHUB_ENDPOINT,
  DEFAULT_DATA_DIR,
  DEFAULT_LOG_LEVEL,
  DEFAULT_FILESYSTEM_WRITES_ENABLED,
  DEFAULT_TELEMETRY_ENABLED,
  DEFAULT_ENABLE_SENSITIVE_DATA,
  DEFAULT_MEMORY_ENABLED,
  DEFAULT_MEMORY_TYPE,
  DEFAULT_MEMORY_HISTORY_LIMIT,
  DEFAULT_SKILL_SCRIPT_TIMEOUT,
  DEFAULT_RETRY_ENABLED,
  DEFAULT_MAX_RETRIES,
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_DELAY_MS,
  DEFAULT_ENABLE_JITTER,
  DEFAULT_AUTO_SAVE,
  DEFAULT_MAX_SESSIONS,
  LOG_LEVELS,
  MEMORY_TYPES,
  PROVIDER_NAMES,
} from './constants.js';

// -----------------------------------------------------------------------------
// Provider Schemas
// -----------------------------------------------------------------------------

/**
 * Local provider configuration (e.g., Ollama).
 */
export const LocalProviderConfigSchema = z.object({
  baseUrl: z.url().default(DEFAULT_LOCAL_BASE_URL).describe('Base URL for local LLM server'),
  model: z.string().default(DEFAULT_LOCAL_MODEL).describe('Model name to use'),
});

export type LocalProviderConfig = z.infer<typeof LocalProviderConfigSchema>;

/**
 * OpenAI provider configuration.
 */
export const OpenAIProviderConfigSchema = z.object({
  apiKey: z.string().optional().describe('OpenAI API key'),
  model: z.string().default(DEFAULT_OPENAI_MODEL).describe('Model name to use'),
  baseUrl: z.url().optional().describe('Custom base URL for OpenAI-compatible APIs'),
});

export type OpenAIProviderConfig = z.infer<typeof OpenAIProviderConfigSchema>;

/**
 * Anthropic provider configuration.
 */
export const AnthropicProviderConfigSchema = z.object({
  apiKey: z.string().optional().describe('Anthropic API key'),
  model: z.string().default(DEFAULT_ANTHROPIC_MODEL).describe('Model name to use'),
});

export type AnthropicProviderConfig = z.infer<typeof AnthropicProviderConfigSchema>;

/**
 * Azure OpenAI provider configuration.
 */
export const AzureOpenAIProviderConfigSchema = z.object({
  endpoint: z.url().optional().describe('Azure OpenAI endpoint URL'),
  deployment: z.string().optional().describe('Deployment name'),
  apiVersion: z.string().default(DEFAULT_AZURE_API_VERSION).describe('API version'),
  apiKey: z.string().optional().describe('Azure OpenAI API key'),
});

export type AzureOpenAIProviderConfig = z.infer<typeof AzureOpenAIProviderConfigSchema>;

/**
 * Azure AI Foundry provider configuration.
 * Supports both local (on-device) and cloud modes.
 *
 * Local mode: Uses foundry-local-sdk to run models on-device via Docker.
 * Cloud mode: Uses Azure AI Foundry managed endpoints.
 */
export const FoundryProviderConfigSchema = z.object({
  mode: z
    .enum(FOUNDRY_MODES)
    .default(DEFAULT_FOUNDRY_MODE)
    .describe('Foundry mode: "local" for on-device models, "cloud" for Azure-managed'),
  // Cloud mode configuration
  projectEndpoint: z
    .url()
    .optional()
    .describe(
      '[Cloud] Azure AI Foundry project endpoint (e.g., https://my-resource.services.ai.azure.com/)'
    ),
  modelDeployment: z
    .string()
    .optional()
    .describe('[Cloud] Model deployment name (e.g., claude-sonnet-4-5)'),
  apiKey: z
    .string()
    .optional()
    .describe('[Cloud] Azure API key (falls back to AZURE_FOUNDRY_API_KEY env var)'),
  // Local mode configuration
  modelAlias: z
    .string()
    .default(DEFAULT_FOUNDRY_LOCAL_MODEL)
    .describe('[Local] Model alias for foundry-local-sdk (e.g., phi-3-mini-4k)'),
  // Shared configuration
  temperature: z.number().min(0).max(2).optional().describe('Temperature for generation'),
});

export type FoundryProviderConfig = z.infer<typeof FoundryProviderConfigSchema>;

/**
 * Google Gemini provider configuration.
 *
 * Note: This implementation currently supports only the Gemini Developer API
 * via @langchain/google-genai. Vertex AI support requires the separate
 * @langchain/google-vertexai package and is not yet implemented.
 */
export const GeminiProviderConfigSchema = z.object({
  apiKey: z.string().optional().describe('Gemini API key'),
  model: z.string().default(DEFAULT_GEMINI_MODEL).describe('Model name to use'),
  useVertexai: z
    .boolean()
    .default(DEFAULT_GEMINI_USE_VERTEXAI)
    .describe(
      '[RESERVED] Use Vertex AI instead of Gemini API. ' +
        'Not yet implemented - requires @langchain/google-vertexai package. ' +
        'Keep as false to use Gemini Developer API.'
    ),
  projectId: z
    .string()
    .optional()
    .describe('[RESERVED] Google Cloud project ID for future Vertex AI support'),
  location: z
    .string()
    .default(DEFAULT_GEMINI_LOCATION)
    .describe('[RESERVED] Google Cloud location for future Vertex AI support'),
});

export type GeminiProviderConfig = z.infer<typeof GeminiProviderConfigSchema>;

/**
 * GitHub Models provider configuration.
 */
export const GitHubProviderConfigSchema = z.object({
  token: z.string().optional().describe('GitHub token'),
  model: z.string().default(DEFAULT_GITHUB_MODEL).describe('Model name to use'),
  endpoint: z.url().default(DEFAULT_GITHUB_ENDPOINT).describe('GitHub Models endpoint'),
  org: z.string().optional().describe('GitHub organization'),
});

export type GitHubProviderConfig = z.infer<typeof GitHubProviderConfigSchema>;

/**
 * Combined providers configuration with default provider selection.
 */
export const ProvidersConfigSchema = z.object({
  default: z.enum(PROVIDER_NAMES).default('openai').describe('Default provider to use'),
  local: LocalProviderConfigSchema.optional().describe('Local LLM provider (e.g., Ollama)'),
  openai: OpenAIProviderConfigSchema.optional().describe('OpenAI provider'),
  anthropic: AnthropicProviderConfigSchema.optional().describe('Anthropic provider'),
  azure: AzureOpenAIProviderConfigSchema.optional().describe('Azure OpenAI provider'),
  foundry: FoundryProviderConfigSchema.optional().describe('Azure AI Foundry provider'),
  gemini: GeminiProviderConfigSchema.optional().describe('Google Gemini provider'),
  github: GitHubProviderConfigSchema.optional().describe('GitHub Models provider'),
});

export type ProvidersConfig = z.infer<typeof ProvidersConfigSchema>;

// -----------------------------------------------------------------------------
// Agent Schema
// -----------------------------------------------------------------------------

/**
 * Agent configuration.
 */
export const AgentConfigSchema = z.object({
  dataDir: z.string().default(DEFAULT_DATA_DIR).describe('Directory for agent data storage'),
  logLevel: z.enum(LOG_LEVELS).default(DEFAULT_LOG_LEVEL).describe('Logging level'),
  systemPromptFile: z.string().optional().describe('Path to custom system prompt file'),
  workspaceRoot: z.string().optional().describe('Root directory for workspace operations'),
  filesystemWritesEnabled: z
    .boolean()
    .default(DEFAULT_FILESYSTEM_WRITES_ENABLED)
    .describe('Allow filesystem write operations'),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// -----------------------------------------------------------------------------
// Telemetry Schema
// -----------------------------------------------------------------------------

/**
 * Telemetry configuration.
 */
export const TelemetryConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_TELEMETRY_ENABLED).describe('Enable telemetry collection'),
  enableSensitiveData: z
    .boolean()
    .default(DEFAULT_ENABLE_SENSITIVE_DATA)
    .describe('Include sensitive data in telemetry'),
  otlpEndpoint: z.url().optional().describe('OpenTelemetry Protocol endpoint'),
  applicationinsightsConnectionString: z
    .string()
    .optional()
    .describe('Azure Application Insights connection string'),
});

export type TelemetryConfig = z.infer<typeof TelemetryConfigSchema>;

// -----------------------------------------------------------------------------
// Memory Schemas
// -----------------------------------------------------------------------------

/**
 * Mem0 memory backend configuration.
 */
export const Mem0ConfigSchema = z.object({
  storagePath: z.string().optional().describe('Local storage path for Mem0'),
  apiKey: z.string().optional().describe('Mem0 API key'),
  orgId: z.string().optional().describe('Mem0 organization ID'),
  userId: z.string().optional().describe('Mem0 user ID'),
  projectId: z.string().optional().describe('Mem0 project ID'),
});

export type Mem0Config = z.infer<typeof Mem0ConfigSchema>;

/**
 * Memory configuration.
 */
export const MemoryConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_MEMORY_ENABLED).describe('Enable memory features'),
  type: z.enum(MEMORY_TYPES).default(DEFAULT_MEMORY_TYPE).describe('Memory backend type'),
  historyLimit: z
    .number()
    .int()
    .positive()
    .default(DEFAULT_MEMORY_HISTORY_LIMIT)
    .describe('Max history entries'),
  mem0: Mem0ConfigSchema.optional().describe('Mem0 backend configuration'),
});

export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

// -----------------------------------------------------------------------------
// Skills Schema
// -----------------------------------------------------------------------------

/**
 * Skills configuration.
 */
export const SkillsConfigSchema = z.object({
  plugins: z.array(z.string()).default([]).describe('Plugin paths or URLs to load'),
  disabledBundled: z.array(z.string()).default([]).describe('Bundled skills to disable'),
  enabledBundled: z
    .array(z.string())
    .default([])
    .describe('Bundled skills to enable (overrides defaults)'),
  userDir: z.string().optional().describe('Directory for user skills'),
  scriptTimeout: z
    .number()
    .int()
    .positive()
    .default(DEFAULT_SKILL_SCRIPT_TIMEOUT)
    .describe('Script execution timeout in milliseconds'),
});

export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;

// -----------------------------------------------------------------------------
// Retry Schema
// -----------------------------------------------------------------------------

/**
 * Retry configuration for LLM operations.
 */
export const RetryConfigSchema = z
  .object({
    enabled: z.boolean().default(DEFAULT_RETRY_ENABLED).describe('Enable retry logic'),
    maxRetries: z
      .number()
      .int()
      .min(0)
      .max(10)
      .default(DEFAULT_MAX_RETRIES)
      .describe('Maximum retry attempts'),
    baseDelayMs: z
      .number()
      .int()
      .positive()
      .default(DEFAULT_BASE_DELAY_MS)
      .describe('Base delay in milliseconds'),
    maxDelayMs: z
      .number()
      .int()
      .positive()
      .default(DEFAULT_MAX_DELAY_MS)
      .describe('Maximum delay in milliseconds'),
    enableJitter: z
      .boolean()
      .default(DEFAULT_ENABLE_JITTER)
      .describe('Add jitter to prevent thundering herd'),
  })
  // Note: baseDelayMs > 0 is already enforced by the .positive() constraint above (line 263).
  // This refinement only needs to validate the relationship between maxDelayMs and baseDelayMs.
  .refine((data) => data.maxDelayMs >= data.baseDelayMs, {
    message: 'maxDelayMs must be greater than or equal to baseDelayMs',
    path: ['maxDelayMs'],
  });

export type RetryConfig = z.infer<typeof RetryConfigSchema>;

// -----------------------------------------------------------------------------
// Session Schema
// -----------------------------------------------------------------------------

/**
 * Session configuration for save/restore functionality.
 */
export const SessionConfigSchema = z.object({
  autoSave: z.boolean().default(DEFAULT_AUTO_SAVE).describe('Auto-save session on exit'),
  maxSessions: z
    .number()
    .int()
    .positive()
    .default(DEFAULT_MAX_SESSIONS)
    .describe('Maximum sessions to keep'),
});

export type SessionConfig = z.infer<typeof SessionConfigSchema>;

// -----------------------------------------------------------------------------
// Root Application Config Schema
// -----------------------------------------------------------------------------

/**
 * Root application configuration schema.
 * This is the complete configuration structure for the agent framework.
 */
export const AppConfigSchema = z.object({
  version: z.string().default(CONFIG_VERSION).describe('Configuration schema version'),
  providers: ProvidersConfigSchema.default(() => ProvidersConfigSchema.parse({})).describe(
    'LLM provider configurations'
  ),
  agent: AgentConfigSchema.default(() => AgentConfigSchema.parse({})).describe(
    'Agent behavior configuration'
  ),
  telemetry: TelemetryConfigSchema.default(() => TelemetryConfigSchema.parse({})).describe(
    'Telemetry configuration'
  ),
  memory: MemoryConfigSchema.default(() => MemoryConfigSchema.parse({})).describe(
    'Memory configuration'
  ),
  skills: SkillsConfigSchema.default(() => SkillsConfigSchema.parse({})).describe(
    'Skills configuration'
  ),
  retry: RetryConfigSchema.default(() => RetryConfigSchema.parse({})).describe(
    'Retry configuration for LLM operations'
  ),
  session: SessionConfigSchema.default(() => SessionConfigSchema.parse({})).describe(
    'Session save/restore configuration'
  ),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

/**
 * Get the default configuration with all defaults applied.
 */
export function getDefaultConfig(): AppConfig {
  return AppConfigSchema.parse({});
}

/**
 * Parse and validate a configuration object.
 * Applies schema defaults and returns the parsed config.
 * Unknown fields are stripped by Zod.
 */
export function parseConfig(input: unknown): z.ZodSafeParseResult<AppConfig> {
  return AppConfigSchema.safeParse(input);
}
