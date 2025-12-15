/**
 * InteractiveShell component.
 * Provides an interactive chat experience with the agent.
 * This is the default CLI mode.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { Agent } from '../agent/agent.js';
import { loadConfig } from '../config/manager.js';
import { createCallbacks } from '../cli/callbacks.js';
import {
  getPathInfoTool,
  listDirectoryTool,
  readFileTool,
  searchTextTool,
  writeFileTool,
  applyTextEditTool,
  createDirectoryTool,
  applyFilePatchTool,
} from '../tools/index.js';
import { VERSION } from '../cli/version.js';
import { executeCommand, isCommand } from '../cli/commands/index.js';
import { unescapeSlash } from '../cli/constants.js';
import { InputHistory } from '../cli/input/index.js';
import { MessageHistory } from '../utils/index.js';
import { Header } from './Header.js';
import { Spinner } from './Spinner.js';
import { ErrorDisplay } from './ErrorDisplay.js';
import { TaskProgress } from './TaskProgress.js';
import { AnswerBox } from './AnswerBox.js';
import type { ActiveTask, CompletedTask } from './TaskProgress.js';
import type { InteractiveShellProps, ShellMessage } from '../cli/types.js';
import type { CommandContext } from '../cli/commands/types.js';
import type { AgentErrorResponse } from '../errors/index.js';
import type { AppConfig } from '../config/schema.js';
import type { Message } from '../agent/types.js';

/**
 * Shell state interface.
 */
interface ShellState {
  input: string;
  isProcessing: boolean;
  spinnerMessage: string;
  streamingOutput: string;
  messages: ShellMessage[];
  error: AgentErrorResponse | null;
  config: AppConfig | null;
  configLoaded: boolean;
  configError: string | null;
  activeTasks: ActiveTask[];
  completedTasks: CompletedTask[];
}

/**
 * InteractiveShell component.
 * Provides a chat interface for conversing with the agent.
 */
export function InteractiveShell({
  // TODO(Feature 20): _resumeSession is intentionally unused; placeholder for session resume functionality
  resumeSession: _resumeSession,
}: InteractiveShellProps): React.ReactElement {
  const { exit } = useApp();
  const agentRef = useRef<Agent | null>(null);
  const historyRef = useRef<InputHistory>(new InputHistory());
  const messageHistoryRef = useRef<MessageHistory | null>(null);
  const currentQueryRef = useRef<string>('');

  const [state, setState] = useState<ShellState>({
    input: '',
    isProcessing: false,
    spinnerMessage: '',
    streamingOutput: '',
    messages: [],
    error: null,
    config: null,
    configLoaded: false,
    configError: null,
    activeTasks: [],
    completedTasks: [],
  });

  // Load config on mount
  useEffect(() => {
    async function loadConfiguration(): Promise<void> {
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
        setState((s) => ({
          ...s,
          config,
          configLoaded: true,
        }));
      } else {
        setState((s) => ({
          ...s,
          configLoaded: true,
          configError: result.message,
        }));
      }
    }

    void loadConfiguration();
  }, []);

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
    let query = state.input.trim();

    if (query === '') return;

    // Handle escaped slash (// => /) - allows sending messages like "/etc/hosts"
    const unescaped = unescapeSlash(query);
    if (unescaped !== undefined) {
      query = unescaped;
    }

    // Add to history (original input, not unescaped)
    historyRef.current.add(state.input.trim());
    historyRef.current.reset();

    // Check if this is a command (after unescape, so // is not a command)
    if (isCommand(query)) {
      // Clear input first
      setState((s) => ({ ...s, input: '' }));

      // Add placeholder system message for command output
      addSystemMessage('');

      // Create command context with fresh output array
      const outputLines: string[] = [];
      const context: CommandContext = {
        config: state.config,
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
        exit,
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
        // Handle /history command - show conversation history
        if (result.shouldShowHistory === true) {
          const msgHistory = messageHistoryRef.current;
          if (msgHistory !== null && !msgHistory.isEmpty) {
            const stored = msgHistory.getAllStored();
            const historyOutput = stored
              .map((m, i) => {
                let rolePrefix = '';
                if (m.role === 'user') {
                  rolePrefix = '> ';
                } else if (m.role === 'system') {
                  rolePrefix = '! ';
                } else if (m.role === 'assistant') {
                  rolePrefix = '< ';
                  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                } else if (m.role === 'tool') {
                  rolePrefix = '# ';
                }
                const prefix = `[${String(i + 1)}] ${rolePrefix}`;
                return `${prefix}${m.content.slice(0, 200)}${m.content.length > 200 ? '...' : ''}`;
              })
              .join('\n');
            // Update the last system message with history output
            setState((s) => {
              const lastMsgIndex = s.messages.length - 1;
              const lastMsg = s.messages[lastMsgIndex];
              if (lastMsg && lastMsg.role === 'system') {
                const updatedMessages = [...s.messages];
                updatedMessages[lastMsgIndex] = {
                  ...lastMsg,
                  content: `Conversation history (${String(stored.length)} messages):\n${historyOutput}`,
                };
                return { ...s, messages: updatedMessages };
              }
              return s;
            });
          } else {
            // No history to show
            setState((s) => {
              const lastMsgIndex = s.messages.length - 1;
              const lastMsg = s.messages[lastMsgIndex];
              if (lastMsg && lastMsg.role === 'system') {
                const updatedMessages = [...s.messages];
                updatedMessages[lastMsgIndex] = {
                  ...lastMsg,
                  content: 'No conversation history yet.',
                };
                return { ...s, messages: updatedMessages };
              }
              return s;
            });
          }
          return;
        }
      }
      return;
    }

    // Store current query for message history tracking
    currentQueryRef.current = query;

    // Add user message and clear tasks from previous query
    setState((s) => ({
      ...s,
      input: '',
      messages: [...s.messages, { role: 'user' as const, content: query, timestamp: new Date() }],
      isProcessing: true,
      spinnerMessage: 'Thinking...',
      streamingOutput: '',
      error: null,
      activeTasks: [],
      completedTasks: [],
    }));

    // Synchronize filesystem writes config to env var before each run
    // This ensures config changes (e.g., via /config command) are propagated
    syncFilesystemWritesEnvVar(state.config);

    // Initialize agent lazily with callbacks wired to state
    if (agentRef.current === null && state.config !== null) {
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
            if (s.error !== null || answer.startsWith('Error:')) {
              // Error already displayed via ErrorDisplay, don't duplicate
              return { ...s, streamingOutput: '', isProcessing: false };
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
            };
          });
        },
        addActiveTask: (id, name, args) => {
          setState((s) => ({
            ...s,
            activeTasks: [...s.activeTasks, { id, name, args, startTime: Date.now() }],
          }));
        },
        completeTask: (id, name, success, _duration, error) => {
          setState((s) => {
            // Match by unique id to handle concurrent calls of same tool
            const task = s.activeTasks.find((t) => t.id === id);
            if (task === undefined) {
              // Task not found - use -1 to indicate unknown duration
              // Log debug message if verbose mode enabled
              if (process.env.AGENT_DEBUG !== undefined) {
                process.stderr.write(
                  `[DEBUG] completeTask called for unknown task: ${name} (id: ${id})\n`
                );
              }
              return {
                ...s,
                completedTasks: [...s.completedTasks, { id, name, success, duration: -1, error }],
              };
            }
            const duration = Date.now() - task.startTime;
            return {
              ...s,
              activeTasks: s.activeTasks.filter((t) => t.id !== id),
              completedTasks: [...s.completedTasks, { id, name, success, duration, error }],
            };
          });
        },
      });

      // Create filesystem tools array
      const filesystemTools = [
        getPathInfoTool,
        listDirectoryTool,
        readFileTool,
        searchTextTool,
        writeFileTool,
        applyTextEditTool,
        createDirectoryTool,
        applyFilePatchTool,
      ];

      agentRef.current = new Agent({
        config: state.config,
        callbacks,
        tools: filesystemTools,
      });
    }

    if (agentRef.current === null) {
      setState((s) => ({
        ...s,
        error: {
          success: false,
          error: 'INITIALIZATION_ERROR',
          message: 'Failed to initialize agent',
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
    // Note: state.config?.memory?.enabled is intentionally NOT in the dependency array.
    // Runtime config changes to memory.enabled are not supported and require a session restart.
    // messageHistoryRef is initialized once on mount (lines 91-95) and doesn't change during runtime.
  }, [state.input, state.config, exit, addSystemMessage, syncFilesystemWritesEnvVar]);

  // Handle key input - gated until config loads
  useInput((input, key) => {
    // Always allow Ctrl+C to exit, even during loading or processing
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    // Ctrl+D to exit
    if (key.ctrl && input === 'd') {
      exit();
      return;
    }

    // Don't process input until config is loaded
    if (!state.configLoaded) return;

    // Don't process other input while agent is working
    if (state.isProcessing) return;

    // ESC to clear input
    if (key.escape) {
      setState((s) => ({ ...s, input: '' }));
      historyRef.current.reset();
      return;
    }

    // Up arrow - navigate history backward
    if (key.upArrow) {
      const previousEntry = historyRef.current.previous(state.input);
      if (previousEntry !== undefined) {
        setState((s) => ({ ...s, input: previousEntry }));
      }
      return;
    }

    // Down arrow - navigate history forward
    if (key.downArrow) {
      const nextEntry = historyRef.current.next();
      if (nextEntry !== undefined) {
        setState((s) => ({ ...s, input: nextEntry }));
      }
      return;
    }

    if (key.return) {
      void handleSubmit();
    } else if (key.backspace || key.delete) {
      // Reset history navigation on edit
      historyRef.current.reset();
      setState((s) => ({ ...s, input: s.input.slice(0, -1) }));
    } else if (!key.ctrl && !key.meta && input.length === 1) {
      // Reset history navigation on edit
      historyRef.current.reset();
      setState((s) => ({ ...s, input: s.input + input }));
    }
  });

  // Render config loading state
  if (!state.configLoaded) {
    return <Spinner message="Loading configuration..." />;
  }

  // Render config error
  if (state.configError !== null) {
    return (
      <ErrorDisplay
        error={{
          success: false,
          error: 'CONFIG_ERROR',
          message: state.configError,
        }}
      />
    );
  }

  // Get provider and model from config
  const provider = state.config?.providers.default ?? 'unknown';
  const providerConfig = state.config?.providers[
    provider as keyof typeof state.config.providers
  ] as Record<string, unknown> | undefined;
  const model = (providerConfig?.model ?? providerConfig?.deployment ?? 'unknown') as string;

  return (
    <Box flexDirection="column" padding={1}>
      <Header version={VERSION} model={model} provider={provider} />

      {/* Welcome message */}
      {state.messages.length === 0 && !state.isProcessing && (
        <Box marginBottom={1}>
          <Text dimColor>Type a message to chat with the agent. Use /help for commands.</Text>
        </Box>
      )}

      {/* Message history */}
      {state.messages.map((msg, index) => (
        <Box key={index} marginBottom={1}>
          <Text color={msg.role === 'user' ? 'blue' : msg.role === 'system' ? 'yellow' : 'green'}>
            {msg.role === 'user' ? '> ' : msg.role === 'system' ? '! ' : ''}
          </Text>
          <Text>{msg.content}</Text>
        </Box>
      ))}

      {/* Task progress - show active and completed tool executions */}
      {(state.activeTasks.length > 0 || state.completedTasks.length > 0) && (
        <TaskProgress activeTasks={state.activeTasks} completedTasks={state.completedTasks} />
      )}

      {/* Streaming output with AnswerBox */}
      {/* Show when: has output OR (processing AND no spinner showing) */}
      {(state.streamingOutput !== '' || (state.isProcessing && state.spinnerMessage === '')) && (
        <AnswerBox content={state.streamingOutput} isStreaming={state.isProcessing} />
      )}

      {/* Spinner during processing (only when not streaming and spinner message is set) */}
      {state.isProcessing && state.spinnerMessage !== '' && state.streamingOutput === '' && (
        <Box marginBottom={1}>
          <Spinner message={state.spinnerMessage} />
        </Box>
      )}

      {/* Error display */}
      {state.error !== null && (
        <Box marginBottom={1}>
          <ErrorDisplay error={state.error} />
        </Box>
      )}

      {/* Input prompt */}
      {!state.isProcessing && (
        <Box>
          <Text color="cyan">{'> '}</Text>
          <Text>{state.input}</Text>
          <Text color="cyan">{'█'}</Text>
        </Box>
      )}
    </Box>
  );
}
