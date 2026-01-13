/**
 * InteractiveShell component.
 * Provides an interactive chat experience with the agent.
 * This is the default CLI mode.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { Agent } from '../agent/agent.js';
import { loadConfig, configFileExists } from '../config/manager.js';
import { validateProviderCredentials } from '../config/schema.js';
import { createCallbacks, wrapWithTelemetry } from '../cli/callbacks.js';
import { VERSION } from '../cli/version.js';
import {
  executeCommand,
  isCommand,
  getAutocompleteCommands,
  getAutocompleteCommandsAsync,
  extractArgs,
} from '../cli/commands/index.js';
import { CommandAutocomplete, filterCommands } from './CommandAutocomplete.js';
import type { AutocompleteCommand } from './CommandAutocomplete.js';
import { configInitHandler } from '../cli/commands/config.js';
import { unescapeSlash } from '../cli/constants.js';
import { InputHistory } from '../cli/input/index.js';
import {
  MessageHistory,
  SessionManager,
  resolveModelName,
  readClipboard,
  truncateReasoning,
} from '../utils/index.js';
import type { StoredMessage, SessionTokenUsage, SessionMetadata } from '../utils/index.js';
import { SessionSelector } from './SessionSelector.js';
import { resumeHandler } from '../cli/commands/session.js';
import { checkForUpdatesWithCache, type VersionCheckResult } from '../cli/commands/update.js';
import { Header } from './Header.js';
import { Spinner } from './Spinner.js';
import { ErrorDisplay } from './ErrorDisplay.js';
import { AnswerBox } from './AnswerBox.js';
import { ExecutionStatus } from './ExecutionStatus.js';
import { SpanFooter } from './SpanFooter.js';
import { PromptDivider } from './PromptDivider.js';
import type { ToolNode, ExecutionSpan } from './ExecutionStatus.js';
import { initializeTelemetry } from '../telemetry/index.js';
import type { InteractiveShellProps, ShellMessage } from '../cli/types.js';

// Re-use task types from TaskProgress for consistency
import type { ActiveTask, CompletedTask } from './TaskProgress.js';
import type { CommandContext } from '../cli/commands/types.js';
import type { AgentErrorResponse } from '../errors/index.js';
import type { AppConfig } from '../config/schema.js';
import type { Message } from '../agent/types.js';

/**
 * Initial token usage state.
 * Used for both initial state and reset operations.
 */
const INITIAL_TOKEN_USAGE: SessionTokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  tokens: 0,
  queryCount: 0,
};

/**
 * Format tool arguments for display.
 * Shows first arg value, truncated.
 */
function formatToolArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  const [key, value] = entries[0] as [string, unknown];
  const strValue = String(value);
  const truncated = strValue.length > 30 ? strValue.slice(0, 27) + '...' : strValue;
  return `${key}: ${truncated}`;
}

/**
 * Helper to restore a session from resumeHandler result.
 * Centralizes logic for clearing message history, filtering messages,
 * and updating state with restored session data.
 */
function applySessionRestore(
  result: {
    sessionToResume?: string;
    sessionMessages?: StoredMessage[];
    sessionContextSummary?: string;
  },
  messageHistoryRef: React.RefObject<MessageHistory | null>,
  setState: React.Dispatch<React.SetStateAction<ShellState>>
): void {
  if (
    result.sessionToResume !== undefined &&
    result.sessionMessages !== undefined &&
    result.sessionMessages.length > 0
  ) {
    // Clear current message history and populate with restored messages
    messageHistoryRef.current?.clear();
    for (const msg of result.sessionMessages) {
      messageHistoryRef.current?.add(msg);
    }

    // Convert StoredMessage to ShellMessage for UI (filter out 'tool' roles)
    const shellMessages: ShellMessage[] = result.sessionMessages
      .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        timestamp: new Date(m.timestamp),
      }));

    // If there's a context summary, add it as a system message
    if (result.sessionContextSummary !== undefined && result.sessionContextSummary !== '') {
      shellMessages.unshift({
        role: 'system' as const,
        content: `Session context: ${result.sessionContextSummary}`,
        timestamp: new Date(),
      });
    }

    setState((s) => ({
      ...s,
      messages: shellMessages,
      resumedSessionId: result.sessionToResume ?? null,
    }));
  }
}

/**
 * Prompt state for interactive command prompts.
 */
interface PromptState {
  /** The question being asked */
  question: string;
  /** Resolver function to complete the prompt */
  resolve: (value: string) => void;
}

/**
 * Span tracking state for execution visualization.
 * Note: "Span" aligns with OpenTelemetry terminology.
 */
interface SpanState {
  /** Current span number (1-indexed) */
  currentSpan: number;
  /** Start time of each span (indexed by span number - 1) */
  spanStartTimes: number[];
  /** Message count for each span (indexed by span number - 1) */
  spanMessageCounts: number[];
  /** Per-span reasoning accumulator (indexed by span number - 1) */
  spanReasoningBuffers: string[];
}

/**
 * Shell state interface.
 */
interface ShellState {
  input: string;
  /** Cursor position within input (index into string) */
  cursorPosition: number;
  isProcessing: boolean;
  spinnerMessage: string;
  streamingOutput: string;
  messages: ShellMessage[];
  error: AgentErrorResponse | null;
  config: AppConfig | null;
  configLoaded: boolean;
  configError: string | null;
  /** Whether initial setup wizard is needed */
  needsSetup: boolean;
  activeTasks: ActiveTask[];
  completedTasks: CompletedTask[];
  /** Session ID if resuming a session */
  resumedSessionId: string | null;
  /** Session-level token usage statistics */
  tokenUsage: SessionTokenUsage;
  /** Active prompt state for interactive commands */
  promptState: PromptState | null;
  /** Whether config init is currently running */
  runningConfigInit: boolean;
  /** Selected index in command autocomplete */
  autocompleteIndex: number;
  /** Message count sent to LLM (for execution status) */
  messageCount: number;
  /** Execution start time in ms (for duration calculation) */
  executionStartTime: number | null;
  /** Last execution duration in seconds (calculated when execution completes) */
  lastExecutionDuration: number | null;
  /** Session selection state for interactive /resume */
  sessionSelection: {
    active: boolean;
    sessions: SessionMetadata[];
    selectedIndex: number;
  } | null;
  /** Tool nodes from the last completed execution (for verbose mode) */
  lastExecutionToolNodes: ToolNode[];
  /** Spans from the last completed execution (for verbose mode) */
  lastExecutionSpans: ExecutionSpan[];
  /** Span tracking state */
  spanState: SpanState;
  /** Version check result for update banner */
  versionCheck: VersionCheckResult | null;
}

/**
 * InteractiveShell component.
 * Provides a chat interface for conversing with the agent.
 */
export function InteractiveShell({
  resumeSession,
  verbose = false,
}: InteractiveShellProps): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const agentRef = useRef<Agent | null>(null);
  const historyRef = useRef<InputHistory>(new InputHistory());
  const messageHistoryRef = useRef<MessageHistory | null>(null);
  const sessionManagerRef = useRef<SessionManager | null>(null);
  const currentQueryRef = useRef<string>('');
  // Track if exit was via Ctrl+C - spec says "do NOT save on Ctrl+C"
  const exitViaCtrlCRef = useRef(false);
  // Track if config loading has been initiated to prevent duplicate loads
  const configLoadInitiatedRef = useRef(false);

  // Get autocomplete commands - start with built-in, load custom async
  const autocompleteCommandsRef = useRef<AutocompleteCommand[]>(getAutocompleteCommands());
  const customCommandsLoadedRef = useRef(false);

  const [state, setState] = useState<ShellState>({
    input: '',
    cursorPosition: 0,
    isProcessing: false,
    spinnerMessage: '',
    streamingOutput: '',
    messages: [],
    error: null,
    config: null,
    configLoaded: false,
    configError: null,
    needsSetup: false,
    activeTasks: [],
    completedTasks: [],
    resumedSessionId: null,
    tokenUsage: INITIAL_TOKEN_USAGE,
    promptState: null,
    runningConfigInit: false,
    autocompleteIndex: 0,
    messageCount: 0,
    executionStartTime: null,
    lastExecutionDuration: null,
    sessionSelection: null,
    lastExecutionToolNodes: [],
    lastExecutionSpans: [],
    spanState: {
      currentSpan: 0,
      spanStartTimes: [],
      spanMessageCounts: [],
      spanReasoningBuffers: [],
    },
    versionCheck: null,
  });

  // Load config on mount and handle session resume
  useEffect(() => {
    // Prevent duplicate loading using ref instead of state to avoid dependency issues
    if (configLoadInitiatedRef.current) {
      return;
    }
    configLoadInitiatedRef.current = true;

    async function loadConfiguration(): Promise<void> {
      // Check if any config file exists (user or project)
      const hasConfigFile = await configFileExists();
      if (!hasConfigFile) {
        // Show setup wizard instead of error
        setState((s) => ({
          ...s,
          configLoaded: true,
          needsSetup: true,
        }));
        return;
      }

      const result = await loadConfig();
      if (result.success) {
        const config = result.result ?? null;
        // Initialize MessageHistory only if memory is enabled in config
        // LIMITATION: MessageHistory is initialized once at component mount based on initial config.
        // Runtime config changes to memory.enabled (e.g., via a future /config command) are NOT
        // supported. If the user changes the memory.enabled setting during runtime, MessageHistory
        // will not be created or destroyed accordingly. This could lead to inconsistent behavior
        // where memory appears enabled in config but MessageHistory remains null, or vice versa.
        // WORKAROUND: Users must restart the interactive session to apply memory config changes.
        // TODO: This is a known limitation that may be addressed in a future enhancement.
        if (config !== null && config.memory.enabled && messageHistoryRef.current === null) {
          messageHistoryRef.current = new MessageHistory({
            historyLimit: config.memory.historyLimit,
          });
        }

        // Initialize SessionManager (config may be null, use defaults via optional chain)
        if (sessionManagerRef.current === null) {
          sessionManagerRef.current = new SessionManager({
            maxSessions: config?.session.maxSessions,
          });
        }

        // Handle session resume from --continue flag
        if (resumeSession === true) {
          try {
            const sessionManager = sessionManagerRef.current;
            // Get the last session ID first
            const lastSessionId = await sessionManager.getLastSession();

            if (lastSessionId !== null) {
              const restored = await sessionManager.restoreSession(lastSessionId);

              if (restored !== null) {
                // Populate message history with restored messages
                for (const msg of restored.messages) {
                  if (messageHistoryRef.current !== null) {
                    messageHistoryRef.current.add(msg);
                  }
                }

                // Convert StoredMessage to ShellMessage for UI (filter out 'tool' roles)
                const shellMessages: ShellMessage[] = restored.messages
                  .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system')
                  .map((m) => ({
                    role: m.role as 'user' | 'assistant' | 'system',
                    content: m.content,
                    timestamp: new Date(m.timestamp),
                  }));

                setState((s) => ({
                  ...s,
                  config,
                  configLoaded: true,
                  messages: shellMessages,
                  resumedSessionId: lastSessionId,
                }));
                return;
              }
            }
          } catch {
            // Log but continue - session restore failure shouldn't block shell
            if (process.env.AGENT_DEBUG !== undefined) {
              process.stderr.write(`[DEBUG] Failed to restore session\n`);
            }
          }
        }

        // Validate provider credentials before proceeding
        if (config !== null) {
          const validation = validateProviderCredentials(config);
          if (!validation.isValid) {
            const errorMsg =
              `Provider configuration error:\n${validation.errors.join('\n')}\n\n` +
              `Run 'agent config init' to configure your provider.`;
            setState((s) => ({
              ...s,
              configLoaded: true,
              configError: errorMsg,
            }));
            return;
          }

          // Initialize telemetry if enabled in config
          if (config.telemetry.enabled) {
            const debugOtel = process.env.DEBUG_OTEL === 'true';
            initializeTelemetry({
              config: config.telemetry,
              serviceName: 'agent-cli',
              onDebug: (msg) => {
                if (debugOtel) {
                  process.stderr.write(`[OTEL] ${msg}\n`);
                }
              },
            })
              .then((result) => {
                if (debugOtel) {
                  process.stderr.write(`[OTEL] Init result: ${JSON.stringify(result)}\n`);
                }
              })
              .catch((err: unknown) => {
                process.stderr.write(
                  `[OTEL] Init error: ${err instanceof Error ? err.message : String(err)}\n`
                );
              });
          }
        }

        setState((s) => ({
          ...s,
          config,
          configLoaded: true,
        }));

        // Check for updates in background (non-blocking)
        checkForUpdatesWithCache()
          .then((versionResult) => {
            if (versionResult !== null) {
              setState((s) => ({ ...s, versionCheck: versionResult }));
            }
          })
          .catch(() => {
            // Silently ignore version check failures
          });
      } else {
        setState((s) => ({
          ...s,
          configLoaded: true,
          configError: result.message,
        }));
      }
    }

    void loadConfiguration();
  }, [resumeSession]);

  // Load custom commands after config is loaded
  useEffect(() => {
    if (!state.configLoaded || state.needsSetup || customCommandsLoadedRef.current) return;

    customCommandsLoadedRef.current = true;

    // Load custom commands asynchronously
    getAutocompleteCommandsAsync()
      .then((commands) => {
        autocompleteCommandsRef.current = commands;
        // Trigger re-render to update autocomplete - since autocompleteCommandsRef is a ref
        // (not state), React won't re-render when it changes. This setState forces a re-render
        // so the CommandAutocomplete component picks up the newly loaded custom commands.
        setState((s) => ({ ...s }));
      })
      .catch((err: unknown) => {
        // Log but don't fail - custom commands are optional
        if (process.env.AGENT_DEBUG !== undefined) {
          process.stderr.write(
            `[DEBUG] Failed to load custom commands: ${err instanceof Error ? err.message : String(err)}\n`
          );
        }
      });
  }, [state.configLoaded, state.needsSetup]);

  // Run config init when setup is needed (no config.yaml)
  useEffect(() => {
    if (!state.needsSetup || state.runningConfigInit) return;

    // Mark as running to prevent re-entry
    setState((s) => ({ ...s, runningConfigInit: true }));

    async function runConfigInit(): Promise<void> {
      // Create a command context for configInitHandler
      const context: CommandContext = {
        config: {
          version: '1.0',
          providers: { default: 'local' },
          agent: { dataDir: '~/.agent', logLevel: 'info', filesystemWritesEnabled: true },
          memory: { enabled: false, type: 'local', historyLimit: 100 },
          session: { autoSave: true, maxSessions: 50 },
          skills: { disabledBundled: [], enabledBundled: [], plugins: [], scriptTimeout: 30000 },
          telemetry: { enabled: false, enableSensitiveData: false },
          retry: {
            enabled: true,
            maxRetries: 3,
            baseDelayMs: 1000,
            maxDelayMs: 10000,
            enableJitter: true,
          },
        },
        onOutput: (content: string, _type?: string) => {
          // Display output as system messages
          if (content.trim() !== '') {
            setState((s) => ({
              ...s,
              messages: [
                ...s.messages,
                {
                  role: 'system' as const,
                  content,
                  timestamp: new Date(),
                },
              ],
            }));
          }
        },
        onPrompt: (question: string): Promise<string> => {
          return new Promise((resolve) => {
            setState((s) => ({
              ...s,
              promptState: { question, resolve },
              input: '',
              cursorPosition: 0,
            }));
          });
        },
        exit: () => {
          exit();
        },
      };

      const result = await configInitHandler('', context);

      if (result.success) {
        // Config saved successfully, exit so user can restart
        exit();
      } else {
        // Config init failed or was cancelled
        setState((s) => ({
          ...s,
          configError: result.message ?? 'Configuration setup failed',
          needsSetup: false,
          runningConfigInit: false,
        }));
      }
    }

    void runConfigInit();
  }, [state.needsSetup, state.runningConfigInit, exit]);

  // Auto-save session on exit if enabled in config
  // We use a ref to access latest state in cleanup without causing re-renders
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    // Return cleanup function for auto-save on unmount
    return () => {
      const currentState = stateRef.current;
      const sessionManager = sessionManagerRef.current;

      // Skip auto-save if exit was via Ctrl+C (spec requirement)
      if (exitViaCtrlCRef.current) {
        return;
      }

      // Only auto-save if enabled and we have messages
      if (
        currentState.config?.session.autoSave !== true ||
        sessionManager === null ||
        currentState.messages.length === 0
      ) {
        return;
      }

      // Get messages to save - prefer MessageHistory, fall back to shell messages
      // Filter out 'tool' role messages (architecture: context/tool outputs are NOT restored)
      const allStored = messageHistoryRef.current?.getAllStored() ?? [];
      const storedMessages: StoredMessage[] = allStored.filter((m) => m.role !== 'tool');

      // If no message history, convert current shell messages (adding required id field)
      if (storedMessages.length === 0) {
        let msgIndex = 0;
        for (const msg of currentState.messages) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            storedMessages.push({
              id: `msg-${String(Date.now())}-${String(msgIndex++)}`,
              role: msg.role,
              content: msg.content,
              timestamp: msg.timestamp.toISOString(),
            });
          }
        }
      }

      if (storedMessages.length === 0) {
        return;
      }

      // Fire and forget - we can't await in cleanup
      // Use existing session name if we resumed one (to update), otherwise create new
      const sessionName = currentState.resumedSessionId ?? undefined;

      // Extract provider/model from config for session metadata
      const config = currentState.config;
      const autoSaveProvider = config.providers.default;
      const autoSaveProviderConfig = config.providers[
        autoSaveProvider as keyof typeof config.providers
      ] as Record<string, unknown> | undefined;
      const autoSaveModel = resolveModelName(autoSaveProvider, autoSaveProviderConfig);

      void sessionManager
        .saveSession(storedMessages, {
          name: sessionName,
          provider: autoSaveProvider,
          model: autoSaveModel,
        })
        .catch((err: unknown) => {
          // Log but don't throw - we're in cleanup
          if (process.env.AGENT_DEBUG !== undefined) {
            process.stderr.write(`[DEBUG] Auto-save failed: ${String(err)}\n`);
          }
        });
    };
  }, []); // Empty deps - cleanup runs on unmount

  /**
   * Add a system message to the conversation.
   */
  const addSystemMessage = useCallback((content: string) => {
    setState((s) => ({
      ...s,
      messages: [...s.messages, { role: 'system' as const, content, timestamp: new Date() }],
    }));
  }, []);

  /**
   * Synchronize filesystem writes config to env var.
   * This must be called before each agent run to ensure config changes are propagated.
   */
  const syncFilesystemWritesEnvVar = useCallback((config: AppConfig | null) => {
    if (config === null) return;

    if (!config.agent.filesystemWritesEnabled) {
      process.env['AGENT_FILESYSTEM_WRITES_ENABLED'] = 'false';
    } else {
      // Ensure env var is set to true if config allows writes
      process.env['AGENT_FILESYSTEM_WRITES_ENABLED'] = 'true';
    }
  }, []);

  // Handle input submission
  const handleSubmit = useCallback(async () => {
    // Use stateRef to access current state without adding state to dependencies
    const currentState = stateRef.current;
    let query = currentState.input.trim();

    if (query === '') return;

    // Handle escaped slash (// => /) - allows sending messages like "/etc/hosts"
    const unescaped = unescapeSlash(query);
    if (unescaped !== undefined) {
      query = unescaped;
    }

    // Add to history (original input, not unescaped)
    historyRef.current.add(currentState.input.trim());
    historyRef.current.reset();

    // Check if this is a command (after unescape, so // is not a command)
    if (isCommand(query)) {
      // Clear input first
      setState((s) => ({ ...s, input: '', cursorPosition: 0 }));

      // Add placeholder system message for command output
      addSystemMessage('');

      // Create command context with fresh output array
      const outputLines: string[] = [];
      const context: CommandContext = {
        config: currentState.config,
        onOutput: (content: string, _type?: 'info' | 'success' | 'warning' | 'error') => {
          // Collect all output lines
          outputLines.push(content);
          // Update the message with all output
          setState((s) => {
            // Find and update the last system message, or add if none
            const lastMsgIndex = s.messages.length - 1;
            const lastMsg = s.messages[lastMsgIndex];

            if (lastMsg && lastMsg.role === 'system') {
              const updatedMessages = [...s.messages];
              updatedMessages[lastMsgIndex] = {
                ...lastMsg,
                content: outputLines.join('\n'),
              };
              return { ...s, messages: updatedMessages };
            }

            return {
              ...s,
              messages: [
                ...s.messages,
                { role: 'system' as const, content: outputLines.join('\n'), timestamp: new Date() },
              ],
            };
          });
        },
        onPrompt: (question: string): Promise<string> => {
          return new Promise((resolve) => {
            setState((s) => ({
              ...s,
              promptState: { question, resolve },
              input: '', // Clear any existing input
              cursorPosition: 0,
            }));
          });
        },
        exit,
        isInteractive: true,
      };

      const result = await executeCommand(query, context);

      if (result !== undefined) {
        // Handle command result flags
        if (result.shouldExit === true) {
          exit();
          return;
        }

        if (result.shouldClear === true) {
          setState((s) => ({
            ...s,
            messages: [],
            streamingOutput: '',
            error: null,
            tokenUsage: INITIAL_TOKEN_USAGE,
          }));
          // Also clear input history and message history if shouldClearHistory is set
          if (result.shouldClearHistory === true) {
            historyRef.current.clear();
            messageHistoryRef.current?.clear();
          }
          return;
        }
        // If shouldClearHistory is set but shouldClear is not, still clear histories
        if (result.shouldClearHistory === true) {
          historyRef.current.clear();
          messageHistoryRef.current?.clear();
        }
        // Handle /save command - save current session
        if (result.shouldSaveSession === true) {
          const sessionManager = sessionManagerRef.current;
          if (sessionManager !== null) {
            try {
              // Get all messages from MessageHistory for persistence
              // Filter out 'tool' role messages (architecture: context/tool outputs are NOT restored)
              const allStored = messageHistoryRef.current?.getAllStored() ?? [];
              const storedMessages: StoredMessage[] = allStored.filter((m) => m.role !== 'tool');

              // If no message history, convert current shell messages (adding required id field)
              if (storedMessages.length === 0 && currentState.messages.length > 0) {
                let msgIndex = 0;
                for (const msg of currentState.messages) {
                  if (msg.role === 'user' || msg.role === 'assistant') {
                    storedMessages.push({
                      id: `msg-${String(Date.now())}-${String(msgIndex++)}`,
                      role: msg.role,
                      content: msg.content,
                      timestamp: msg.timestamp.toISOString(),
                    });
                  }
                }
              }

              if (storedMessages.length === 0) {
                // Update the last system message
                setState((s) => {
                  const lastMsgIndex = s.messages.length - 1;
                  const lastMsg = s.messages[lastMsgIndex];
                  if (lastMsg && lastMsg.role === 'system') {
                    const updatedMessages = [...s.messages];
                    updatedMessages[lastMsgIndex] = {
                      ...lastMsg,
                      content: 'No messages to save.',
                    };
                    return { ...s, messages: updatedMessages };
                  }
                  return s;
                });
                return;
              }

              // Extract provider/model from config for session metadata
              const saveProvider = currentState.config?.providers.default ?? 'unknown';
              const saveProviderConfig = currentState.config?.providers[
                saveProvider as keyof typeof currentState.config.providers
              ] as Record<string, unknown> | undefined;
              const saveModel = resolveModelName(saveProvider, saveProviderConfig);

              const sessionMeta = await sessionManager.saveSession(storedMessages, {
                name: result.sessionName,
                provider: saveProvider,
                model: saveModel,
              });

              // Update the last system message with success
              setState((s) => {
                const lastMsgIndex = s.messages.length - 1;
                const lastMsg = s.messages[lastMsgIndex];
                if (lastMsg && lastMsg.role === 'system') {
                  const updatedMessages = [...s.messages];
                  updatedMessages[lastMsgIndex] = {
                    ...lastMsg,
                    content: `Session saved: ${sessionMeta.id}`,
                  };
                  return { ...s, messages: updatedMessages, resumedSessionId: sessionMeta.id };
                }
                return s;
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              setState((s) => {
                const lastMsgIndex = s.messages.length - 1;
                const lastMsg = s.messages[lastMsgIndex];
                if (lastMsg && lastMsg.role === 'system') {
                  const updatedMessages = [...s.messages];
                  updatedMessages[lastMsgIndex] = {
                    ...lastMsg,
                    content: `Failed to save session: ${errorMessage}`,
                  };
                  return { ...s, messages: updatedMessages };
                }
                return s;
              });
            }
          }
          return;
        }

        // Handle /resume command - restore session messages
        if (result.sessionToResume !== undefined && result.sessionMessages !== undefined) {
          applySessionRestore(result, messageHistoryRef, setState);
          return;
        }

        // Handle /resume command - show interactive session selector
        if (result.shouldShowSessionSelector === true && result.availableSessions !== undefined) {
          // Remove the placeholder system message and enter session selection mode
          setState((s) => {
            // Remove the last empty system message that was added
            const messagesWithoutPlaceholder =
              s.messages.length > 0 && s.messages[s.messages.length - 1]?.role === 'system'
                ? s.messages.slice(0, -1)
                : s.messages;
            return {
              ...s,
              messages: messagesWithoutPlaceholder,
              sessionSelection: {
                active: true,
                sessions: result.availableSessions ?? [],
                selectedIndex: 0,
              },
            };
          });
          return;
        }

        // Handle custom command - inject prompt into agent
        if (result.customCommandPrompt !== undefined) {
          // Remove the placeholder system message
          setState((s) => {
            const messagesWithoutPlaceholder =
              s.messages.length > 0 && s.messages[s.messages.length - 1]?.role === 'system'
                ? s.messages.slice(0, -1)
                : s.messages;
            return { ...s, messages: messagesWithoutPlaceholder };
          });

          // Use the custom command prompt as the query
          // Update query variable to fall through to regular agent execution
          const displayMessage =
            `/${result.customCommandName ?? 'custom'} ${extractArgs(query)}`.trim();
          query = result.customCommandPrompt;

          // Store current query for message history tracking
          currentQueryRef.current = query;

          // Add user message showing the custom command invocation
          setState((s) => ({
            ...s,
            input: '',
            cursorPosition: 0,
            messages: [
              ...s.messages,
              { role: 'user' as const, content: displayMessage, timestamp: new Date() },
            ],
            isProcessing: true,
            spinnerMessage: 'Thinking...',
            streamingOutput: '',
            error: null,
            activeTasks: [],
            completedTasks: [],
            messageCount: 0,
            executionStartTime: Date.now(),
            lastExecutionToolNodes: [],
            spanState: {
              currentSpan: 0,
              spanStartTimes: [],
              spanMessageCounts: [],
              spanReasoningBuffers: [],
            },
          }));

          // Sync filesystem writes and fall through to agent execution
          syncFilesystemWritesEnvVar(currentState.config);
        } else {
          // Non-custom command result - return as before
          return;
        }
      } else {
        // No result from command execution
        return;
      }
    } else {
      // Not a command - set up state for regular agent execution
      // Store current query for message history tracking
      currentQueryRef.current = query;

      // Add user message and clear tasks from previous query
      setState((s) => ({
        ...s,
        input: '',
        cursorPosition: 0,
        messages: [...s.messages, { role: 'user' as const, content: query, timestamp: new Date() }],
        isProcessing: true,
        spinnerMessage: 'Thinking...',
        streamingOutput: '',
        error: null,
        activeTasks: [],
        completedTasks: [],
        messageCount: 0,
        executionStartTime: Date.now(),
        lastExecutionToolNodes: [], // Clear previous execution history
        spanState: {
          currentSpan: 0,
          spanStartTimes: [],
          spanMessageCounts: [],
          spanReasoningBuffers: [],
        },
      }));

      // Synchronize filesystem writes config to env var before each run
      // This ensures config changes (e.g., via /config command) are propagated
      syncFilesystemWritesEnvVar(currentState.config);
    }

    // Initialize agent lazily with callbacks wired to state
    if (agentRef.current === null && currentState.config !== null) {
      const callbacks = createCallbacks({
        setSpinnerMessage: (msg) => {
          setState((s) => ({ ...s, spinnerMessage: msg ?? '' }));
        },
        setIsProcessing: (val) => {
          setState((s) => ({ ...s, isProcessing: val }));
        },
        appendToOutput: (chunk) => {
          setState((s) => ({ ...s, streamingOutput: s.streamingOutput + chunk }));
        },
        setError: (err) => {
          setState((s) => ({ ...s, error: err, isProcessing: false }));
        },
        onComplete: (answer) => {
          // Add assistant message to history and clear streaming output
          // Skip if error already set (emitError calls both onError and onAgentEnd)
          setState((s) => {
            // Calculate duration when execution completes
            const duration =
              s.executionStartTime !== null ? (Date.now() - s.executionStartTime) / 1000 : null;
            const now = Date.now();

            // Save tool nodes for verbose mode display
            const toolNodes: ToolNode[] = s.completedTasks.map((task) => ({
              id: task.id,
              name: task.name,
              status: task.success ? ('complete' as const) : ('error' as const),
              duration: task.duration >= 0 ? task.duration / 1000 : undefined,
              error: task.error,
              span: task.span,
              primaryArg: task.primaryArg,
              resultSummary: task.resultSummary,
              hasDetailedOutput: task.hasDetailedOutput,
            }));

            // Build completed spans for verbose mode display
            const spans: ExecutionSpan[] = [];
            for (let i = 0; i < s.spanState.currentSpan; i++) {
              const spanNumber = i + 1;
              const startTime = s.spanState.spanStartTimes[i] ?? now;
              const nextSpanStart = s.spanState.spanStartTimes[i + 1];
              const spanDuration =
                nextSpanStart !== undefined
                  ? (nextSpanStart - startTime) / 1000
                  : (now - startTime) / 1000;

              // Truncate reasoning for storage (keep tail, most relevant)
              const fullReasoning = s.spanState.spanReasoningBuffers[i] ?? '';
              const { truncated, fullLength } = truncateReasoning(fullReasoning);

              spans.push({
                number: spanNumber,
                status: 'complete',
                duration: spanDuration,
                messageCount: s.spanState.spanMessageCounts[i] ?? s.messageCount,
                isThinking: false,
                toolNodes: s.completedTasks
                  .filter((t) => t.span === spanNumber)
                  .map((task) => ({
                    id: task.id,
                    name: task.name,
                    status: task.success ? ('complete' as const) : ('error' as const),
                    duration: task.duration >= 0 ? task.duration / 1000 : undefined,
                    error: task.error,
                    span: task.span,
                    primaryArg: task.primaryArg,
                    resultSummary: task.resultSummary,
                    hasDetailedOutput: task.hasDetailedOutput,
                  })),
                reasoning: truncated.length > 0 ? truncated : undefined,
                reasoningFullLength: fullLength > 0 ? fullLength : undefined,
              });
            }

            if (s.error !== null || answer.startsWith('Error:')) {
              // Error already displayed via ErrorDisplay, don't duplicate
              return {
                ...s,
                streamingOutput: '',
                isProcessing: false,
                lastExecutionDuration: duration,
                lastExecutionToolNodes: toolNodes,
                lastExecutionSpans: spans,
              };
            }
            // State management design:
            // - state.messages: UI display for current session (always populated)
            // - messageHistoryRef.current (MessageHistory): LLM context (only when memory.enabled)
            // When memory is disabled, state.messages still tracks all exchanges for UI display,
            // but messageHistoryRef.current is null so no context is passed to the LLM.
            // This separation is intentional: UI needs to show conversation, but LLM context is optional.
            const query = currentQueryRef.current;
            if (query !== '' && messageHistoryRef.current !== null) {
              messageHistoryRef.current.addExchange(query, answer);
            }
            return {
              ...s,
              messages: [
                ...s.messages,
                { role: 'assistant' as const, content: answer, timestamp: new Date() },
              ],
              streamingOutput: '',
              isProcessing: false,
              lastExecutionDuration: duration,
              lastExecutionToolNodes: toolNodes,
              lastExecutionSpans: spans,
            };
          });
        },
        addActiveTask: (id, name, args) => {
          setState((s) => ({
            ...s,
            activeTasks: [
              ...s.activeTasks,
              { id, name, args, startTime: Date.now(), span: s.spanState.currentSpan },
            ],
          }));
        },
        completeTask: (
          id,
          name,
          success,
          _duration,
          error,
          primaryArg,
          resultSummary,
          hasDetailedOutput
        ) => {
          setState((s) => {
            // Match by unique id to handle concurrent calls of same tool
            const task = s.activeTasks.find((t) => t.id === id);
            if (task === undefined) {
              // Task not found - use -1 to indicate unknown duration, current span
              // Log debug message if verbose mode enabled
              if (process.env.AGENT_DEBUG !== undefined) {
                process.stderr.write(
                  `[DEBUG] completeTask called for unknown task: ${name} (id: ${id})\n`
                );
              }
              return {
                ...s,
                completedTasks: [
                  ...s.completedTasks,
                  {
                    id,
                    name,
                    success,
                    duration: -1,
                    error,
                    span: s.spanState.currentSpan,
                    primaryArg,
                    resultSummary,
                    hasDetailedOutput,
                  },
                ],
              };
            }
            const duration = Date.now() - task.startTime;
            return {
              ...s,
              activeTasks: s.activeTasks.filter((t) => t.id !== id),
              completedTasks: [
                ...s.completedTasks,
                {
                  id,
                  name,
                  success,
                  duration,
                  error,
                  span: task.span,
                  primaryArg,
                  resultSummary,
                  hasDetailedOutput,
                },
              ],
            };
          });
        },
        updateTokenUsage: (usage) => {
          // Accumulate per-request token usage across multiple LLM calls
          setState((s) => ({
            ...s,
            tokenUsage: {
              promptTokens: s.tokenUsage.promptTokens + usage.promptTokens,
              completionTokens: s.tokenUsage.completionTokens + usage.completionTokens,
              tokens: s.tokenUsage.tokens + usage.tokens,
              queryCount: s.tokenUsage.queryCount + usage.queryCount,
            },
          }));
        },
        setMessageCount: (count) => {
          setState((s) => {
            // Also track message count for the current span
            const newSpanMessageCounts = [...s.spanState.spanMessageCounts];
            if (s.spanState.currentSpan > 0) {
              newSpanMessageCounts[s.spanState.currentSpan - 1] = count;
            }
            return {
              ...s,
              messageCount: count,
              spanState: {
                ...s.spanState,
                spanMessageCounts: newSpanMessageCounts,
              },
            };
          });
        },
        incrementSpan: () => {
          setState((s) => {
            const newSpan = s.spanState.currentSpan + 1;
            return {
              ...s,
              spanState: {
                currentSpan: newSpan,
                spanStartTimes: [...s.spanState.spanStartTimes, Date.now()],
                spanMessageCounts: [...s.spanState.spanMessageCounts, 0],
                spanReasoningBuffers: [...s.spanState.spanReasoningBuffers, ''],
              },
            };
          });
        },
        getCurrentSpan: () => stateRef.current.spanState.currentSpan,
        appendToSpanReasoning: (content) => {
          setState((s) => {
            if (s.spanState.currentSpan === 0) return s;
            const idx = s.spanState.currentSpan - 1;
            const buffers = [...s.spanState.spanReasoningBuffers];
            // Append LLM response to span's reasoning buffer
            buffers[idx] = (buffers[idx] ?? '') + content;
            return {
              ...s,
              spanState: { ...s.spanState, spanReasoningBuffers: buffers },
            };
          });
        },
      });

      // Wrap callbacks with telemetry if enabled
      // This adds automatic OpenTelemetry spans for agent, LLM, and tool operations
      const providerName = currentState.config.providers.default;
      const providerConfig = currentState.config.providers[providerName] as
        | Record<string, unknown>
        | undefined;
      const modelName = resolveModelName(providerName, providerConfig);

      const tracedCallbacks = wrapWithTelemetry(callbacks, {
        providerName,
        modelName,
        enableSensitiveData: currentState.config.telemetry.enableSensitiveData,
      });

      try {
        agentRef.current = new Agent({
          config: currentState.config,
          callbacks: tracedCallbacks,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setState((s) => ({
          ...s,
          error: {
            success: false,
            error: 'INITIALIZATION_ERROR',
            message: `Failed to initialize agent: ${errorMessage}`,
          },
          isProcessing: false,
        }));
        return;
      }
    }

    if (agentRef.current === null) {
      setState((s) => ({
        ...s,
        error: {
          success: false,
          error: 'INITIALIZATION_ERROR',
          message: 'Failed to initialize agent: configuration not loaded',
        },
        isProcessing: false,
      }));
      return;
    }

    // Run the agent with tools - run() supports tool calling
    // (runStream() does not support tool calling - documented limitation)
    // Use MessageHistory for multi-turn context when memory is enabled
    // When memory is disabled (messageHistoryRef.current is null), pass empty history
    // to avoid unbounded growth and polluting prompts with system/command output
    const history: Message[] =
      messageHistoryRef.current !== null ? messageHistoryRef.current.getRecent() : [];

    try {
      // Use run() instead of runStream() to support tool calling
      // The result is handled by onComplete callback - do NOT duplicate message here
      await agentRef.current.run(query, history);
      // onAgentEnd callback fires at end of run, triggering onComplete
      // which adds the assistant message and sets isProcessing=false
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState((s) => ({
        ...s,
        error: {
          success: false,
          error: 'UNKNOWN',
          message: errorMessage,
        },
        isProcessing: false,
      }));
    }
    // Note: We use stateRef.current to access state without adding it to dependencies.
    // This avoids unnecessary re-creation of the callback on every state change.
    // Runtime config changes to memory.enabled are not supported and require a session restart.
  }, [exit, addSystemMessage, syncFilesystemWritesEnvVar]);

  // Handle key input - gated until config loads
  useInput((input, key) => {
    // Always allow Ctrl+C to exit, even during loading or processing
    if (key.ctrl && input === 'c') {
      // Mark as Ctrl+C exit to skip auto-save (spec requirement)
      exitViaCtrlCRef.current = true;
      exit();
      return;
    }

    // Ctrl+D to exit
    if (key.ctrl && input === 'd') {
      exit();
      return;
    }

    // Handle Ctrl+V for clipboard paste
    // Check both: ASCII control character 0x16 AND key.ctrl + 'v' (terminal-dependent)
    if (input === '\x16' || (key.ctrl && input.toLowerCase() === 'v')) {
      const clipboardContent = readClipboard();
      if (clipboardContent !== null && clipboardContent.trim() !== '') {
        historyRef.current.reset();
        setState((s) => ({
          ...s,
          input:
            s.input.slice(0, s.cursorPosition) + clipboardContent + s.input.slice(s.cursorPosition),
          cursorPosition: s.cursorPosition + clipboardContent.length,
          autocompleteIndex: 0,
        }));
      }
      return;
    }

    // Don't process input until config is loaded
    // Use stateRef to avoid stale closure issues with config loading
    const currentState = stateRef.current;
    if (!currentState.configLoaded) return;

    // Handle prompt mode input
    if (state.promptState !== null) {
      if (key.escape) {
        // Cancel prompt with empty response
        const { resolve } = state.promptState;
        setState((s) => ({ ...s, promptState: null, input: '', cursorPosition: 0 }));
        resolve('');
        return;
      }
      // Handle Shift+Enter for newline in prompt mode
      // Check both: \r without key.return flag AND key.shift + key.return (CSI u terminals)
      // NOTE: Unlike main input mode, prompt mode does not track cursor position.
      // Newlines are always appended to the end, and cursor stays at the end.
      // This is intentional - prompt mode is simpler and doesn't support cursor navigation.
      if ((input === '\r' && !key.return) || (key.shift && key.return)) {
        setState((s) => ({ ...s, input: s.input + '\n' }));
        return;
      }
      if (key.return && !key.shift) {
        // Resolve prompt with current input
        const { resolve } = state.promptState;
        const response = state.input;
        setState((s) => ({ ...s, promptState: null, input: '', cursorPosition: 0 }));
        resolve(response);
        return;
      }
      // Handle Ctrl+V for clipboard paste in prompt mode
      // Check both: ASCII control character 0x16 AND key.ctrl + 'v' (terminal-dependent)
      if (input === '\x16' || (key.ctrl && input.toLowerCase() === 'v')) {
        const clipboardContent = readClipboard();
        if (clipboardContent !== null && clipboardContent.trim() !== '') {
          setState((s) => ({ ...s, input: s.input + clipboardContent }));
        }
        return;
      }
      // Handle text input in prompt mode (including multi-character paste)
      if (key.backspace || key.delete) {
        setState((s) => ({ ...s, input: s.input.slice(0, -1) }));
      } else if (!key.ctrl && !key.meta && input.length >= 1) {
        setState((s) => ({ ...s, input: s.input + input }));
      }
      return;
    }

    // Handle session selection mode input
    if (state.sessionSelection !== null && state.sessionSelection.active) {
      const { sessions, selectedIndex } = state.sessionSelection;

      if (key.escape) {
        // Cancel session selection
        setState((s) => ({ ...s, sessionSelection: null }));
        addSystemMessage('Session selection cancelled');
        return;
      }

      if (key.upArrow) {
        // Navigate up (clamped at top)
        setState((s) => ({
          ...s,
          sessionSelection: s.sessionSelection
            ? {
                ...s.sessionSelection,
                selectedIndex: Math.max(0, selectedIndex - 1),
              }
            : null,
        }));
        return;
      }

      if (key.downArrow) {
        // Navigate down (clamped at bottom)
        setState((s) => ({
          ...s,
          sessionSelection: s.sessionSelection
            ? {
                ...s.sessionSelection,
                selectedIndex: Math.min(sessions.length - 1, selectedIndex + 1),
              }
            : null,
        }));
        return;
      }

      if (key.return) {
        // Select the session
        const selectedSession = sessions[selectedIndex];
        if (selectedSession) {
          // Close selector and trigger resume
          setState((s) => ({ ...s, sessionSelection: null }));

          // Resume the selected session by calling the handler directly
          const context: CommandContext = {
            config: state.config,
            onOutput: (content: string) => {
              if (content.trim() !== '') {
                addSystemMessage(content);
              }
            },
            exit,
            isInteractive: true,
          };

          resumeHandler(selectedSession.id, context)
            .then((result) => {
              applySessionRestore(result, messageHistoryRef, setState);
            })
            .catch((error: unknown) => {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              addSystemMessage(`Failed to resume session: ${errorMessage}`);
            });
        }
        return;
      }

      // Ignore other input during session selection
      return;
    }

    // Handle escape key during processing - abort the current operation
    if (state.isProcessing) {
      if (key.escape) {
        // Abort the agent and reset state
        agentRef.current?.abort();
        setState((s) => {
          // Calculate duration if we had a start time
          const duration =
            s.executionStartTime !== null ? (Date.now() - s.executionStartTime) / 1000 : null;
          return {
            ...s,
            isProcessing: false,
            spinnerMessage: '',
            streamingOutput: '',
            lastExecutionDuration: duration,
          };
        });
        // Add a system message indicating the operation was cancelled
        addSystemMessage('Operation cancelled');
      }
      return;
    }

    // Check if autocomplete should be active
    // Active when input starts with '/' but not '//' (escape sequence)
    const showAutocomplete =
      state.input.startsWith('/') &&
      !state.input.startsWith('//') &&
      state.input.indexOf(' ') === -1;
    const autocompleteFilter = showAutocomplete ? state.input.slice(1) : '';
    const filteredCommands = showAutocomplete
      ? filterCommands(autocompleteCommandsRef.current, autocompleteFilter)
      : [];
    const hasAutocomplete = filteredCommands.length > 0;

    // ESC to clear input (or close autocomplete)
    if (key.escape) {
      setState((s) => ({ ...s, input: '', cursorPosition: 0, autocompleteIndex: 0 }));
      historyRef.current.reset();
      return;
    }

    // Check if input is multi-line (contains newlines)
    const isMultiLineInput = state.input.includes('\n');

    // Left arrow - move cursor left
    if (key.leftArrow) {
      setState((s) => ({
        ...s,
        cursorPosition: Math.max(0, s.cursorPosition - 1),
      }));
      return;
    }

    // Right arrow - move cursor right
    if (key.rightArrow) {
      setState((s) => ({
        ...s,
        cursorPosition: Math.min(s.input.length, s.cursorPosition + 1),
      }));
      return;
    }

    // Up arrow - navigate autocomplete, history, or move cursor up in multi-line
    if (key.upArrow) {
      if (hasAutocomplete) {
        // Navigate autocomplete up
        setState((s) => ({
          ...s,
          autocompleteIndex:
            s.autocompleteIndex > 0 ? s.autocompleteIndex - 1 : filteredCommands.length - 1,
        }));
      } else if (isMultiLineInput) {
        // Move cursor to previous line or navigate history if on first line
        const linesBeforeCursor = state.input.slice(0, state.cursorPosition).split('\n');
        if (linesBeforeCursor.length <= 1) {
          // On first line, navigate history instead
          const previousEntry = historyRef.current.previous(state.input);
          if (previousEntry !== undefined) {
            setState((s) => ({ ...s, input: previousEntry, cursorPosition: previousEntry.length }));
          }
        } else {
          // Move cursor to previous line (same column or end of line if shorter)
          setState((s) => {
            const lines = s.input.slice(0, s.cursorPosition).split('\n');
            const currentLineStart = s.cursorPosition - (lines[lines.length - 1]?.length ?? 0);
            const currentCol = s.cursorPosition - currentLineStart;
            const prevLineStart = currentLineStart - 1 - (lines[lines.length - 2]?.length ?? 0);
            const prevLineLength = lines[lines.length - 2]?.length ?? 0;
            const newCol = Math.min(currentCol, prevLineLength);
            return { ...s, cursorPosition: prevLineStart + newCol };
          });
        }
      } else {
        // Navigate history backward (only when not in multi-line mode)
        const previousEntry = historyRef.current.previous(state.input);
        if (previousEntry !== undefined) {
          setState((s) => ({ ...s, input: previousEntry, cursorPosition: previousEntry.length }));
        }
      }
      return;
    }

    // Down arrow - navigate autocomplete, history, or move cursor down in multi-line
    if (key.downArrow) {
      if (hasAutocomplete) {
        // Navigate autocomplete down
        setState((s) => ({
          ...s,
          autocompleteIndex:
            s.autocompleteIndex < filteredCommands.length - 1 ? s.autocompleteIndex + 1 : 0,
        }));
      } else if (isMultiLineInput) {
        // Move cursor to next line (same column or end of line if shorter)
        setState((s) => {
          const beforeCursor = s.input.slice(0, s.cursorPosition);
          const afterCursor = s.input.slice(s.cursorPosition);
          const linesBeforeCursor = beforeCursor.split('\n');
          const currentCol = linesBeforeCursor[linesBeforeCursor.length - 1]?.length ?? 0;
          const nextNewline = afterCursor.indexOf('\n');
          if (nextNewline === -1) {
            // Already on last line, move to end
            return { ...s, cursorPosition: s.input.length };
          }
          const restAfterNewline = afterCursor.slice(nextNewline + 1);
          const nextLineEnd = restAfterNewline.indexOf('\n');
          const nextLineLength = nextLineEnd === -1 ? restAfterNewline.length : nextLineEnd;
          const newCol = Math.min(currentCol, nextLineLength);
          return { ...s, cursorPosition: s.cursorPosition + nextNewline + 1 + newCol };
        });
      } else {
        // Navigate history forward (only when not in multi-line mode)
        const nextEntry = historyRef.current.next();
        if (nextEntry !== undefined) {
          setState((s) => ({ ...s, input: nextEntry, cursorPosition: nextEntry.length }));
        }
      }
      return;
    }

    // Tab to accept autocomplete selection
    if (key.tab && hasAutocomplete) {
      const selectedCommand = filteredCommands[state.autocompleteIndex];
      if (selectedCommand !== undefined) {
        const newInput = `/${selectedCommand.name} `;
        setState((s) => ({
          ...s,
          input: newInput,
          cursorPosition: newInput.length,
          autocompleteIndex: 0,
        }));
      }
      return;
    }

    // Handle Shift+Enter for newline (don't submit)
    // Check both: \r without key.return flag AND key.shift + key.return (CSI u terminals)
    if ((input === '\r' && !key.return) || (key.shift && key.return)) {
      historyRef.current.reset();
      setState((s) => ({
        ...s,
        input: s.input.slice(0, s.cursorPosition) + '\n' + s.input.slice(s.cursorPosition),
        cursorPosition: s.cursorPosition + 1,
        autocompleteIndex: 0,
      }));
      return;
    }

    if (key.return && !key.shift) {
      // If autocomplete is showing and has a selection, select it first
      if (hasAutocomplete && filteredCommands.length > 0) {
        const selectedCommand = filteredCommands[state.autocompleteIndex];
        if (selectedCommand !== undefined) {
          // If it's an exact match, submit it; otherwise fill in and add space
          if (autocompleteFilter.toLowerCase() === selectedCommand.name.toLowerCase()) {
            void handleSubmit();
          } else {
            const newInput = `/${selectedCommand.name} `;
            setState((s) => ({
              ...s,
              input: newInput,
              cursorPosition: newInput.length,
              autocompleteIndex: 0,
            }));
          }
          return;
        }
      }
      void handleSubmit();
    } else if (key.backspace || key.delete) {
      // Delete character before cursor (backspace behavior)
      // Both backspace and delete keys delete backward for intuitive typing
      // On Mac, the "delete" key sends key.delete but users expect backspace behavior
      historyRef.current.reset();
      setState((s) => {
        if (s.cursorPosition === 0) return s;
        return {
          ...s,
          input: s.input.slice(0, s.cursorPosition - 1) + s.input.slice(s.cursorPosition),
          cursorPosition: s.cursorPosition - 1,
          autocompleteIndex: 0,
        };
      });
    } else if (!key.ctrl && !key.meta && input.length >= 1) {
      // Handle both single character input and multi-character paste
      // Insert at cursor position
      historyRef.current.reset();
      setState((s) => ({
        ...s,
        input: s.input.slice(0, s.cursorPosition) + input + s.input.slice(s.cursorPosition),
        cursorPosition: s.cursorPosition + input.length,
        autocompleteIndex: 0,
      }));
    }
  });

  // Render config loading state
  if (!state.configLoaded) {
    return <Spinner message="Loading configuration..." />;
  }

  // Render config init flow if no config.yaml exists
  if (state.needsSetup) {
    return (
      <Box flexDirection="column" padding={1}>
        {/* Config init output messages */}
        {state.messages.map((msg, index) => (
          <Box key={index}>
            <Text>{msg.content}</Text>
          </Box>
        ))}

        {/* Interactive prompt for config init */}
        {state.promptState !== null && (
          <Box>
            <Text>{state.promptState.question} </Text>
            <Text color="cyan">{state.input}</Text>
            <Text color="cyan">{'█'}</Text>
          </Box>
        )}
      </Box>
    );
  }

  // Render config error - display full message for provider validation errors
  if (state.configError !== null) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>
          Configuration Error
        </Text>
        <Box marginTop={1}>
          <Text>{state.configError}</Text>
        </Box>
      </Box>
    );
  }

  // Get provider and model from config
  const provider = state.config?.providers.default ?? 'unknown';
  const providerConfig = state.config?.providers[
    provider as keyof typeof state.config.providers
  ] as Record<string, unknown> | undefined;
  const model = resolveModelName(provider, providerConfig);

  return (
    <Box flexDirection="column" padding={1}>
      <Header version={VERSION} model={model} provider={provider} cwd={process.cwd()} />

      {/* Update available banner */}
      {state.versionCheck?.updateAvailable === true && (
        <Box marginBottom={1}>
          <Text>
            <Text color="yellow">
              Update available: {state.versionCheck.currentVersion} -&gt;{' '}
              {state.versionCheck.latestVersion}
            </Text>
            <Text dimColor> • Run </Text>
            <Text color="cyan">agent update</Text>
            <Text dimColor> to upgrade</Text>
          </Text>
        </Box>
      )}

      {/* Message history */}
      {state.messages.map((msg, index) => {
        const isLastMessage = index === state.messages.length - 1;

        // Show horizontal rule after assistant messages that aren't the last
        const showDividerAfter = msg.role === 'assistant' && !isLastMessage;

        // No bottom margin on last message when not processing (PromptDivider follows)
        const hasBottomMargin = !(isLastMessage && !state.isProcessing);

        // Create horizontal rule for history dividers
        const hrWidth = Math.max(10, stdout.columns - 2);
        const horizontalRule = '─'.repeat(hrWidth);

        return (
          <React.Fragment key={index}>
            <Box marginBottom={hasBottomMargin ? 1 : 0}>
              <Text
                color={msg.role === 'user' ? 'blue' : msg.role === 'system' ? 'yellow' : 'green'}
              >
                {msg.role === 'user' ? '> ' : msg.role === 'system' ? '! ' : ''}
              </Text>
              <Text>{msg.content}</Text>
            </Box>
            {/* Horizontal rule after assistant messages in history */}
            {showDividerAfter && <Text dimColor>{horizontalRule}</Text>}
          </React.Fragment>
        );
      })}

      {/* Execution status - working state with tree display */}
      {state.isProcessing && (
        <ExecutionStatus
          status="working"
          messageCount={state.messageCount}
          toolCount={state.completedTasks.length + state.activeTasks.length}
          thinkingState={{
            messageCount: state.messageCount,
            isActive: state.spinnerMessage !== '' && state.streamingOutput === '',
          }}
          toolNodes={[
            ...state.completedTasks.map(
              (task): ToolNode => ({
                id: task.id,
                name: task.name,
                status: task.success ? 'complete' : 'error',
                duration: task.duration >= 0 ? task.duration / 1000 : undefined,
                error: task.error,
                span: task.span,
                primaryArg: task.primaryArg,
                resultSummary: task.resultSummary,
                hasDetailedOutput: task.hasDetailedOutput,
              })
            ),
            ...state.activeTasks.map(
              (task): ToolNode => ({
                id: task.id,
                name: task.name,
                args: task.args !== undefined ? formatToolArgs(task.args) : undefined,
                status: 'running',
                span: task.span,
              })
            ),
          ]}
        />
      )}

      {/* Streaming output with AnswerBox */}
      {(state.streamingOutput !== '' || (state.isProcessing && state.spinnerMessage === '')) && (
        <AnswerBox content={state.streamingOutput} isStreaming={state.isProcessing} />
      )}

      {/* Error display */}
      {state.error !== null && (
        <Box marginBottom={1}>
          <ErrorDisplay error={state.error} />
        </Box>
      )}

      {/* Interactive prompt for commands (e.g., /config init) */}
      {state.promptState !== null && (
        <Box>
          <Text color="yellow">{state.promptState.question} </Text>
          <Text>{state.input}</Text>
          <Text color="yellow">{'█'}</Text>
        </Box>
      )}

      {/* Session selector for /resume command */}
      {state.sessionSelection !== null && state.sessionSelection.active && (
        <SessionSelector
          sessions={state.sessionSelection.sessions}
          selectedIndex={state.sessionSelection.selectedIndex}
        />
      )}

      {/* Prompt divider with path+branch and horizontal rule (only after messages exist) */}
      {!state.isProcessing &&
        state.promptState === null &&
        (state.sessionSelection === null || !state.sessionSelection.active) &&
        state.messages.length > 0 && <PromptDivider cwd={process.cwd()} />}

      {/* SpanFooter for verbose mode - shows execution summary with auto-expanded spans */}
      {verbose &&
        !state.isProcessing &&
        state.promptState === null &&
        (state.sessionSelection === null || !state.sessionSelection.active) &&
        state.lastExecutionSpans.length > 0 && (
          <SpanFooter
            spans={state.lastExecutionSpans}
            duration={state.lastExecutionDuration ?? 0}
            toolCount={state.lastExecutionToolNodes.length}
            expandedSpans={new Set(state.lastExecutionSpans.map((s) => s.number))}
          />
        )}

      {/* Input prompt with autocomplete - supports multi-line via Shift+Enter */}
      {!state.isProcessing &&
        state.promptState === null &&
        (state.sessionSelection === null || !state.sessionSelection.active) && (
          <>
            <Box flexDirection="column">
              {(() => {
                const lines = state.input.split('\n');
                // Calculate cursor line and column
                let charCount = 0;
                let cursorLine = 0;
                let cursorCol = state.cursorPosition;
                for (let i = 0; i < lines.length; i++) {
                  const lineLength = lines[i]?.length ?? 0;
                  if (charCount + lineLength >= state.cursorPosition) {
                    cursorLine = i;
                    cursorCol = state.cursorPosition - charCount;
                    break;
                  }
                  charCount += lineLength + 1; // +1 for newline
                  cursorLine = i + 1;
                  cursorCol = 0;
                }
                return lines.map((line, index) => (
                  <Box key={index}>
                    <Text color="cyan">{index === 0 ? '> ' : '. '}</Text>
                    {index === cursorLine ? (
                      <>
                        {/* Underline cursor: shows position without implying "delete this" */}
                        <Text>{line.slice(0, cursorCol)}</Text>
                        {cursorCol < line.length ? (
                          <Text underline color="cyan">
                            {line[cursorCol]}
                          </Text>
                        ) : (
                          <Text color="cyan">{'█'}</Text>
                        )}
                        <Text>{line.slice(cursorCol + 1)}</Text>
                      </>
                    ) : (
                      <Text>{line}</Text>
                    )}
                  </Box>
                ));
              })()}
            </Box>
            {/* Command autocomplete - show when typing slash commands (single line only) */}
            {!state.input.includes('\n') &&
              state.input.startsWith('/') &&
              !state.input.startsWith('//') &&
              state.input.indexOf(' ') === -1 && (
                <CommandAutocomplete
                  commands={autocompleteCommandsRef.current}
                  filter={state.input.slice(1)}
                  selectedIndex={state.autocompleteIndex}
                />
              )}
          </>
        )}
    </Box>
  );
}
