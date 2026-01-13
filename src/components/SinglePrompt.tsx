/**
 * SinglePrompt component.
 * Executes a single query and exits.
 * Used for -p/--prompt CLI mode for scripting and automation.
 * Supports slash commands (e.g., /clone, /help) in addition to regular prompts.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useApp } from 'ink';
import { Agent } from '../agent/agent.js';
import { loadConfig, configFileExists } from '../config/manager.js';
import { validateProviderCredentials } from '../config/schema.js';
import { createCallbacks, wrapWithTelemetry } from '../cli/callbacks.js';
import { initializeTelemetry, shutdown as shutdownTelemetry } from '../telemetry/index.js';
import { Spinner } from './Spinner.js';
import { SpanFooter } from './SpanFooter.js';
import type { ToolNode, ExecutionSpan } from './ExecutionStatus.js';
import { getUserFriendlyMessage } from '../errors/index.js';
import {
  resolveModelName,
  SessionManager,
  getAgentHome,
  truncateReasoning,
} from '../utils/index.js';
import type { SinglePromptProps } from '../cli/types.js';
import type { AgentErrorResponse } from '../errors/index.js';
import type { AppConfig } from '../config/schema.js';
import type { Message } from '../agent/types.js';
import { isSlashCommand, isShellCommand, unescapeSlash } from '../cli/constants.js';
import { executeCommand } from '../cli/commands/index.js';
import { helpHandler } from '../cli/commands/help.js';
import { createCliContextWithConfig } from '../cli/cli-context.js';
import type { CommandContext, CommandResult } from '../cli/commands/types.js';

/** Commands that are not supported in prompt mode */
const UNSUPPORTED_PROMPT_MODE_COMMANDS = ['/save', '/resume', '/clear'];

/**
 * Tool execution tracking for verbose mode.
 */
interface ActiveTask {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  primaryArg?: string;
  startTime: number;
  span: number;
}

interface CompletedTask {
  id: string;
  name: string;
  success: boolean;
  duration: number;
  error?: string;
  span: number;
  primaryArg?: string;
  resultSummary?: string;
  hasDetailedOutput?: boolean;
}

/**
 * SinglePrompt mode component.
 * Loads config, creates agent, executes query, displays result, and exits.
 *
 * In verbose mode: Shows spinner and streams output as it arrives (uses runStream).
 * In non-verbose mode: Silent execution, only final output (clean for scripting/piping).
 *
 * Errors are written to stderr with non-zero exit code for scripting compatibility.
 */
export function SinglePrompt({
  prompt,
  verbose,
  initialHistory,
  resumeSession,
}: SinglePromptProps): React.ReactElement {
  const { exit } = useApp();

  const [state, setState] = useState<{
    phase: 'loading' | 'processing-command' | 'executing' | 'done' | 'error';
    spinnerMessage: string;
    output: string;
    error: AgentErrorResponse | null;
    // Verbose mode span tracking
    currentSpan: number;
    spanStartTimes: number[];
    spanMessageCounts: number[];
    spanReasoningBuffers: string[];
    messageCount: number;
    activeTasks: ActiveTask[];
    completedTasks: CompletedTask[];
    executionStartTime: number | null;
    // Final snapshot for done state (persists execution trace)
    finalSpans: ExecutionSpan[] | null;
    finalDuration: number | null;
  }>({
    phase: 'loading',
    spinnerMessage: 'Loading configuration...',
    output: '',
    error: null,
    currentSpan: 0,
    spanStartTimes: [],
    spanMessageCounts: [],
    spanReasoningBuffers: [],
    messageCount: 0,
    activeTasks: [],
    completedTasks: [],
    executionStartTime: null,
    finalSpans: null,
    finalDuration: null,
  });

  // Track if component is mounted to prevent state updates after unmount
  const mountedRef = useRef(true);

  // State ref for callbacks to avoid stale closures
  const stateRef = useRef(state);
  stateRef.current = state;

  /**
   * Process a slash command and return the result.
   * Returns the command result, which may include a customCommandPrompt.
   */
  async function processSlashCommand(
    input: string,
    config: AppConfig | null
  ): Promise<{ result: CommandResult | undefined; shouldContinueToAgent: boolean }> {
    // Create a CLI context for command execution
    // Override exit to not actually exit (we handle exit via state/useApp)
    const context: CommandContext = {
      ...createCliContextWithConfig(config),
      exit: () => {
        // No-op - we handle exit via state/useApp
      },
    };

    const result = await executeCommand(input, context);

    // Determine if we should continue to agent execution
    // - If command has customCommandPrompt, use it as the agent prompt
    // - If command executed successfully but no prompt (e.g., /help), we're done
    // - If command failed, we're done with error
    // - If result is undefined, it's not a command - pass to agent as-is
    if (result === undefined) {
      // Not a command - should not happen since we checked isSlashCommand/isShellCommand
      return { result: undefined, shouldContinueToAgent: true };
    }

    if (result.customCommandPrompt !== undefined) {
      // Custom command with prompt injection - continue to agent with new prompt
      return { result, shouldContinueToAgent: true };
    }

    // Built-in command or failed custom command - don't continue to agent
    return { result, shouldContinueToAgent: false };
  }

  // Execute the prompt
  useEffect(() => {
    mountedRef.current = true;

    async function execute(): Promise<void> {
      // Handle // escape: "//foo" becomes "/foo" (literal slash, not a command)
      let processedPrompt = prompt;
      if (prompt.trim().startsWith('//')) {
        const unescaped = unescapeSlash(prompt);
        if (unescaped !== undefined) {
          processedPrompt = unescaped;
        }
        // Fall through to normal agent execution with the unescaped prompt
      }

      // Block shell commands in prompt mode for security
      if (isShellCommand(processedPrompt)) {
        setState((s) => ({
          ...s,
          phase: 'error',
          spinnerMessage: '',
          output: '',
          error: {
            success: false,
            error: 'PERMISSION_DENIED',
            message:
              'Shell commands (!) are not supported in prompt mode for security reasons. Use interactive mode instead.',
          },
        }));
        return;
      }

      // Check if this is a slash command
      const isCommand = isSlashCommand(processedPrompt);

      // Handle /help before config loading (doesn't need config)
      if (isCommand) {
        const commandName = processedPrompt.split(/\s+/)[0]?.toLowerCase() ?? '';
        const commandArgs = processedPrompt.slice(commandName.length).trim();

        // Check for unsupported commands in prompt mode
        if (UNSUPPORTED_PROMPT_MODE_COMMANDS.includes(commandName)) {
          setState((s) => ({
            ...s,
            phase: 'error',
            spinnerMessage: '',
            output: '',
            error: {
              success: false,
              error: 'UNKNOWN',
              message: `Command "${commandName}" is not supported in prompt mode. Use interactive mode instead.`,
            },
          }));
          return;
        }

        // Handle /help without config
        if (commandName === '/help') {
          const context: CommandContext = {
            ...createCliContextWithConfig(null),
            exit: () => {
              // No-op
            },
          };
          await helpHandler(commandArgs, context);
          setState((s) => ({
            ...s,
            phase: 'done',
            spinnerMessage: '',
            output: '',
          }));
          return;
        }

        // Handle /exit without config
        if (commandName === '/exit' || commandName === '/quit') {
          setState((s) => ({
            ...s,
            phase: 'done',
            spinnerMessage: '',
            output: '',
          }));
          return;
        }
      }

      // Check if any config file exists (user or project)
      const hasConfigFile = await configFileExists();
      if (!hasConfigFile) {
        setState((s) => ({
          ...s,
          phase: 'error',
          spinnerMessage: '',
          output: '',
          error: {
            success: false,
            error: 'CONFIG_ERROR',
            message: 'No configuration found. Run "agent config init" to set up your provider.',
          },
        }));
        return;
      }

      // Load configuration
      const configResult = await loadConfig();

      if (!mountedRef.current) return;

      if (!configResult.success) {
        setState((s) => ({
          ...s,
          phase: 'error',
          spinnerMessage: '',
          output: '',
          error: {
            success: false,
            error: 'CONFIG_ERROR',
            message: configResult.message,
          },
        }));
        return;
      }

      const config = configResult.result as AppConfig;

      // The prompt to actually send to the agent (may be transformed by custom command)
      let actualPrompt = processedPrompt;

      // Process slash commands that require config
      if (isCommand) {
        // Process slash command before agent execution
        if (verbose === true) {
          const commandName = processedPrompt.split(/\s+/)[0] ?? processedPrompt;
          setState((s) => ({
            ...s,
            phase: 'processing-command',
            spinnerMessage: `Processing ${commandName}...`,
          }));
        }

        const { result: cmdResult, shouldContinueToAgent } = await processSlashCommand(
          processedPrompt,
          config
        );

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- mountedRef may change during await
        if (!mountedRef.current) return;

        if (!shouldContinueToAgent) {
          // Command executed but doesn't need agent
          // Check if it was successful or had an error
          if (cmdResult !== undefined && !cmdResult.success) {
            // Command failed - exit with error
            setState((s) => ({
              ...s,
              phase: 'error',
              spinnerMessage: '',
              output: '',
              error: {
                success: false,
                error: 'UNKNOWN', // Using UNKNOWN for command errors
                message: cmdResult.message ?? 'Command failed',
              },
            }));
            return;
          }

          // Command succeeded (e.g., /telemetry) - exit gracefully
          // For commands that output directly, the output was already written
          setState((s) => ({
            ...s,
            phase: 'done',
            spinnerMessage: '',
            output: cmdResult?.message ?? '',
          }));
          return;
        }

        // Custom command with prompt - use transformed prompt for agent
        if (cmdResult?.customCommandPrompt !== undefined) {
          actualPrompt = cmdResult.customCommandPrompt;
        }
      }

      // Load session history if --continue flag was passed
      let historyToUse: Message[] | undefined = initialHistory;
      if (resumeSession === true && historyToUse === undefined) {
        const agentHome = getAgentHome();
        const sessionManager = new SessionManager({
          sessionDir: `${agentHome}/sessions`,
          maxSessions: config.session.maxSessions,
        });
        const lastSessionId = await sessionManager.getLastSession();
        if (lastSessionId !== null) {
          const session = await sessionManager.loadSession(lastSessionId);
          if (session !== null) {
            historyToUse = session.messages;
            if (verbose === true) {
              process.stderr.write(`[session] Resuming session: ${lastSessionId}\n`);
            }
          }
        }
      }

      // Validate provider credentials (only needed if we're going to use the agent)
      const validation = validateProviderCredentials(config);
      if (!validation.isValid) {
        setState((s) => ({
          ...s,
          phase: 'error',
          spinnerMessage: '',
          output: '',
          error: {
            success: false,
            error: 'CONFIG_ERROR',
            message: validation.errors.join('\n'),
          },
        }));
        return;
      }

      setState((s) => ({
        ...s,
        phase: 'executing',
        spinnerMessage: 'Thinking...',
        currentSpan: 0,
        spanStartTimes: [],
        spanMessageCounts: [],
        spanReasoningBuffers: [],
        messageCount: 0,
        activeTasks: [],
        completedTasks: [],
        executionStartTime: Date.now(),
      }));

      // Initialize telemetry if enabled
      if (config.telemetry.enabled) {
        const debugOtel = process.env['DEBUG_OTEL'] === 'true';
        try {
          const telemetryResult = await initializeTelemetry({
            config: config.telemetry,
            serviceName: 'agent-cli',
            onDebug: (msg) => {
              if (debugOtel) {
                process.stderr.write(`[OTEL] ${msg}\n`);
              }
            },
          });
          if (debugOtel) {
            process.stderr.write(`[OTEL] Init result: ${JSON.stringify(telemetryResult)}\n`);
          }
        } catch (err: unknown) {
          if (debugOtel) {
            process.stderr.write(
              `[OTEL] Init error: ${err instanceof Error ? err.message : String(err)}\n`
            );
          }
        }
      }

      // Propagate filesystem writes config to env var for tools to check
      if (!config.agent.filesystemWritesEnabled) {
        process.env['AGENT_FILESYSTEM_WRITES_ENABLED'] = 'false';
      } else {
        // Ensure env var is set to true if config allows writes
        process.env['AGENT_FILESYSTEM_WRITES_ENABLED'] = 'true';
      }

      // Create agent with callbacks wired to state
      const baseCallbacks = createCallbacks(
        {
          setSpinnerMessage: (msg) => {
            if (mountedRef.current) {
              setState((s) => ({ ...s, spinnerMessage: msg ?? '' }));
            }
          },
          setIsProcessing: () => {
            // Not used in single-prompt mode
          },
          appendToOutput: (chunk) => {
            // Only append in verbose mode - runStream emits onLLMStream
            if (mountedRef.current && verbose === true) {
              setState((s) => ({ ...s, output: s.output + chunk }));
            }
          },
          setError: (err) => {
            if (mountedRef.current) {
              setState((s) => ({ ...s, phase: 'error', error: err }));
            }
          },
          onComplete: (answer) => {
            if (mountedRef.current) {
              setState((s) => {
                // Build final spans snapshot for done state
                const now = Date.now();
                const finalSpans: ExecutionSpan[] = [];
                for (let i = 0; i < s.currentSpan; i++) {
                  const spanNumber = i + 1;
                  const startTime = s.spanStartTimes[i] ?? now;
                  const nextSpanStart = s.spanStartTimes[i + 1];
                  const spanDuration =
                    nextSpanStart !== undefined
                      ? (nextSpanStart - startTime) / 1000
                      : (now - startTime) / 1000;

                  const spanCompletedTools = s.completedTasks.filter((t) => t.span === spanNumber);
                  const toolNodes: ToolNode[] = spanCompletedTools.map(
                    (task): ToolNode => ({
                      id: task.id,
                      name: task.name,
                      status: task.success ? 'complete' : 'error',
                      duration: task.duration >= 0 ? task.duration / 1000 : undefined,
                      error: task.error,
                      span: spanNumber,
                      primaryArg: task.primaryArg,
                      resultSummary: task.resultSummary,
                      hasDetailedOutput: task.hasDetailedOutput,
                    })
                  );

                  // Truncate reasoning for storage (keep tail, most relevant)
                  const fullReasoning = s.spanReasoningBuffers[i] ?? '';
                  const { truncated, fullLength } = truncateReasoning(fullReasoning);

                  finalSpans.push({
                    number: spanNumber,
                    status: 'complete',
                    duration: spanDuration,
                    messageCount: s.spanMessageCounts[i] ?? s.messageCount,
                    isThinking: false,
                    toolNodes,
                    reasoning: truncated.length > 0 ? truncated : undefined,
                    reasoningFullLength: fullLength > 0 ? fullLength : undefined,
                  });
                }

                const totalDuration =
                  s.executionStartTime !== null ? (now - s.executionStartTime) / 1000 : null;

                return {
                  ...s,
                  phase: 'done',
                  // In verbose mode, use streamed output; in non-verbose, use final answer
                  output: verbose === true && s.output !== '' ? s.output : answer,
                  finalSpans,
                  finalDuration: totalDuration,
                };
              });
            }
          },
          // Span and tool tracking for verbose mode
          setMessageCount: (count) => {
            if (mountedRef.current) {
              setState((s) => {
                const newSpanMessageCounts = [...s.spanMessageCounts];
                if (s.currentSpan > 0) {
                  newSpanMessageCounts[s.currentSpan - 1] = count;
                }
                return {
                  ...s,
                  messageCount: count,
                  spanMessageCounts: newSpanMessageCounts,
                };
              });
            }
          },
          incrementSpan: () => {
            if (mountedRef.current) {
              setState((s) => ({
                ...s,
                currentSpan: s.currentSpan + 1,
                spanStartTimes: [...s.spanStartTimes, Date.now()],
                spanMessageCounts: [...s.spanMessageCounts, 0],
                spanReasoningBuffers: [...s.spanReasoningBuffers, ''],
              }));
            }
          },
          getCurrentSpan: () => stateRef.current.currentSpan,
          appendToSpanReasoning: (chunk) => {
            if (mountedRef.current) {
              setState((s) => {
                if (s.currentSpan === 0) return s;
                const idx = s.currentSpan - 1;
                const buffers = [...s.spanReasoningBuffers];
                buffers[idx] = (buffers[idx] ?? '') + chunk;
                return { ...s, spanReasoningBuffers: buffers };
              });
            }
          },
          addActiveTask: (id, name, args, primaryArg) => {
            if (mountedRef.current) {
              setState((s) => ({
                ...s,
                activeTasks: [
                  ...s.activeTasks,
                  { id, name, args, primaryArg, startTime: Date.now(), span: s.currentSpan },
                ],
              }));
            }
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
            if (mountedRef.current) {
              setState((s) => {
                const task = s.activeTasks.find((t) => t.id === id);
                const duration = task !== undefined ? Date.now() - task.startTime : -1;
                const span = task?.span ?? s.currentSpan;
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
                      span,
                      primaryArg,
                      resultSummary,
                      hasDetailedOutput,
                    },
                  ],
                };
              });
            }
          },
        },
        { verbose: verbose === true }
      );

      // Wrap callbacks with telemetry spans if enabled
      const providerName = config.providers.default;
      const providerConfig = config.providers[providerName] as Record<string, unknown> | undefined;
      const modelName = resolveModelName(providerName, providerConfig);

      const callbacks = wrapWithTelemetry(baseCallbacks, {
        providerName,
        modelName,
        enableSensitiveData: config.telemetry.enableSensitiveData,
      });

      // Create agent (tools loaded from ToolRegistry)
      const agent = new Agent({
        config,
        callbacks,
      });

      try {
        // Both modes use run() to support tool calling
        // Verbose mode gets streaming output via onLLMStream callback
        // Non-verbose mode gets clean final answer
        // Pass initialHistory if provided for context continuation
        // Use actualPrompt which may have been transformed from a custom command
        const result = await agent.run(actualPrompt, historyToUse);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- mountedRef may be false after await
        if (mountedRef.current) {
          setState((s) => {
            // Don't override error state - onError callback may have already set it
            if (s.phase === 'error') return s;
            // Don't override if already done (onComplete may have been called)
            if (s.phase === 'done') return s;

            // Build final spans snapshot for done state
            const now = Date.now();
            const finalSpans: ExecutionSpan[] = [];
            for (let i = 0; i < s.currentSpan; i++) {
              const spanNumber = i + 1;
              const startTime = s.spanStartTimes[i] ?? now;
              const nextSpanStart = s.spanStartTimes[i + 1];
              const spanDuration =
                nextSpanStart !== undefined
                  ? (nextSpanStart - startTime) / 1000
                  : (now - startTime) / 1000;

              const spanCompletedTools = s.completedTasks.filter((t) => t.span === spanNumber);
              const toolNodes: ToolNode[] = spanCompletedTools.map(
                (task): ToolNode => ({
                  id: task.id,
                  name: task.name,
                  status: task.success ? 'complete' : 'error',
                  duration: task.duration >= 0 ? task.duration / 1000 : undefined,
                  error: task.error,
                  span: spanNumber,
                  primaryArg: task.primaryArg,
                  resultSummary: task.resultSummary,
                  hasDetailedOutput: task.hasDetailedOutput,
                })
              );

              // Truncate reasoning for storage (keep tail, most relevant)
              const fullReasoning = s.spanReasoningBuffers[i] ?? '';
              const { truncated, fullLength } = truncateReasoning(fullReasoning);

              finalSpans.push({
                number: spanNumber,
                status: 'complete',
                duration: spanDuration,
                messageCount: s.spanMessageCounts[i] ?? s.messageCount,
                isThinking: false,
                toolNodes,
                reasoning: truncated.length > 0 ? truncated : undefined,
                reasoningFullLength: fullLength > 0 ? fullLength : undefined,
              });
            }

            const totalDuration =
              s.executionStartTime !== null ? (now - s.executionStartTime) / 1000 : null;

            return {
              ...s,
              phase: 'done',
              // In verbose mode, prefer streamed output if available; otherwise use final result
              output: verbose === true && s.output !== '' ? s.output : result,
              finalSpans,
              finalDuration: totalDuration,
            };
          });
        }
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- mountedRef may be false after await
        if (mountedRef.current) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          setState((s) => ({
            ...s,
            phase: 'error',
            error: {
              success: false,
              error: 'UNKNOWN',
              message: errorMessage,
            },
          }));
        }
      }
    }

    void execute();

    return () => {
      mountedRef.current = false;
    };
  }, [prompt, verbose, initialHistory, resumeSession]);

  // Exit after completion or error
  useEffect(() => {
    if (state.phase === 'done') {
      const timer = setTimeout(() => {
        // Shutdown telemetry before exiting to flush spans
        void shutdownTelemetry().finally(() => {
          exit();
        });
      }, 100);
      return () => {
        clearTimeout(timer);
      };
    }
    if (state.phase === 'error') {
      // Write error to stderr and exit with non-zero code for scripting
      if (state.error !== null) {
        // Use message from error, or fall back to getUserFriendlyMessage for the error code
        const message =
          state.error.message !== ''
            ? state.error.message
            : getUserFriendlyMessage(state.error.error);
        process.stderr.write(`Error: ${message}\n`);
      }
      const timer = setTimeout(() => {
        // Shutdown telemetry before exiting to flush spans
        void shutdownTelemetry().finally(() => {
          exit(new Error('Command failed'));
        });
      }, 100);
      return () => {
        clearTimeout(timer);
      };
    }
    return undefined;
  }, [state.phase, state.error, exit]);

  // Non-verbose mode: clean output for scripting (no spinner, no UI chrome)
  if (verbose !== true) {
    // Error already written to stderr above
    if (state.phase === 'error') {
      return <></>;
    }

    if (state.phase === 'done') {
      return (
        <Box flexDirection="column">
          <Text>{state.output}</Text>
        </Box>
      );
    }

    // Loading/executing: render nothing (clean stdout for piping)
    return <></>;
  }

  // Verbose mode: show spinner and streaming output
  if (state.phase === 'loading') {
    return <Spinner message={state.spinnerMessage} />;
  }

  if (state.phase === 'processing-command') {
    return <Spinner message={state.spinnerMessage} />;
  }

  if (state.phase === 'error') {
    // Error already written to stderr
    return <></>;
  }

  if (state.phase === 'executing') {
    // In -p mode, just show spinner during execution to avoid screen clearing
    // The complete span summary will be shown in the 'done' phase via SpanFooter
    const firstTask = state.activeTasks[0];
    const activeToolName = firstTask !== undefined ? firstTask.name : null;
    const message =
      activeToolName !== null
        ? `Executing ${activeToolName}...`
        : state.spinnerMessage || 'Thinking...';

    return (
      <Box flexDirection="column">
        <Spinner message={message} />
        {state.output !== '' && <Text>{state.output}</Text>}
      </Box>
    );
  }

  // Done - show compact span summary and output with separator in verbose mode
  const SEPARATOR = '\u2550'.repeat(60); // ═ double line separator
  const totalToolCount = state.completedTasks.length;

  return (
    <Box flexDirection="column">
      {/* Show compact span summary in verbose mode (non-interactive, auto-expand all spans) */}
      {state.finalSpans !== null && state.finalSpans.length > 0 && (
        <SpanFooter
          spans={state.finalSpans}
          duration={state.finalDuration ?? 0}
          toolCount={totalToolCount}
          expandedSpans={new Set(state.finalSpans.map((s) => s.number))}
        />
      )}
      {/* Separator line between trace and answer in verbose mode */}
      <Text dimColor>{SEPARATOR}</Text>
      <Text>{state.output}</Text>
    </Box>
  );
}
