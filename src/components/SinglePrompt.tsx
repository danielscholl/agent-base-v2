/**
 * SinglePrompt component.
 * Executes a single query and exits.
 * Used for -p/--prompt CLI mode for scripting and automation.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useApp } from 'ink';
import { Agent } from '../agent/agent.js';
import { loadConfig, configFileExists } from '../config/manager.js';
import { validateProviderCredentials } from '../config/schema.js';
import { createCallbacks, wrapWithTelemetry } from '../cli/callbacks.js';
import { initializeTelemetry, shutdown as shutdownTelemetry } from '../telemetry/index.js';
import { Spinner } from './Spinner.js';
import { ExecutionStatus } from './ExecutionStatus.js';
import type { ToolNode, ExecutionPhase } from './ExecutionStatus.js';
import { getUserFriendlyMessage } from '../errors/index.js';
import { resolveModelName } from '../utils/index.js';
import type { SinglePromptProps } from '../cli/types.js';
import type { AgentErrorResponse } from '../errors/index.js';
import type { AppConfig } from '../config/schema.js';

/**
 * Tool execution tracking for verbose mode.
 */
interface ActiveTask {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  startTime: number;
  phase: number;
}

interface CompletedTask {
  id: string;
  name: string;
  success: boolean;
  duration: number;
  error?: string;
  phase: number;
}

/**
 * Format tool arguments for display.
 */
function formatToolArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  const formatted = entries
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v.slice(0, 30) : String(v)}`)
    .join(', ');
  return entries.length > 2 ? `${formatted}, ...` : formatted;
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
}: SinglePromptProps): React.ReactElement {
  const { exit } = useApp();

  const [state, setState] = useState<{
    phase: 'loading' | 'executing' | 'done' | 'error';
    spinnerMessage: string;
    output: string;
    error: AgentErrorResponse | null;
    // Verbose mode phase tracking
    currentPhase: number;
    phaseStartTimes: number[];
    phaseMessageCounts: number[];
    messageCount: number;
    activeTasks: ActiveTask[];
    completedTasks: CompletedTask[];
    executionStartTime: number | null;
  }>({
    phase: 'loading',
    spinnerMessage: 'Loading configuration...',
    output: '',
    error: null,
    currentPhase: 0,
    phaseStartTimes: [],
    phaseMessageCounts: [],
    messageCount: 0,
    activeTasks: [],
    completedTasks: [],
    executionStartTime: null,
  });

  // Track if component is mounted to prevent state updates after unmount
  const mountedRef = useRef(true);

  // State ref for callbacks to avoid stale closures
  const stateRef = useRef(state);
  stateRef.current = state;

  // Execute the prompt
  useEffect(() => {
    mountedRef.current = true;

    async function execute(): Promise<void> {
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

      // Validate provider credentials
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
        currentPhase: 0,
        phaseStartTimes: [],
        phaseMessageCounts: [],
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
              setState((s) => ({
                ...s,
                phase: 'done',
                // In verbose mode, use streamed output; in non-verbose, use final answer
                output: verbose === true && s.output !== '' ? s.output : answer,
              }));
            }
          },
          // Phase and tool tracking for verbose mode
          setMessageCount: (count) => {
            if (mountedRef.current) {
              setState((s) => {
                const newPhaseMessageCounts = [...s.phaseMessageCounts];
                if (s.currentPhase > 0) {
                  newPhaseMessageCounts[s.currentPhase - 1] = count;
                }
                return {
                  ...s,
                  messageCount: count,
                  phaseMessageCounts: newPhaseMessageCounts,
                };
              });
            }
          },
          incrementPhase: () => {
            if (mountedRef.current) {
              setState((s) => ({
                ...s,
                currentPhase: s.currentPhase + 1,
                phaseStartTimes: [...s.phaseStartTimes, Date.now()],
                phaseMessageCounts: [...s.phaseMessageCounts, 0],
              }));
            }
          },
          getCurrentPhase: () => stateRef.current.currentPhase,
          addActiveTask: (id, name, args) => {
            if (mountedRef.current) {
              setState((s) => ({
                ...s,
                activeTasks: [
                  ...s.activeTasks,
                  { id, name, args, startTime: Date.now(), phase: s.currentPhase },
                ],
              }));
            }
          },
          completeTask: (id, name, success, _duration, error) => {
            if (mountedRef.current) {
              setState((s) => {
                const task = s.activeTasks.find((t) => t.id === id);
                const duration = task !== undefined ? Date.now() - task.startTime : -1;
                const phase = task?.phase ?? s.currentPhase;
                return {
                  ...s,
                  activeTasks: s.activeTasks.filter((t) => t.id !== id),
                  completedTasks: [
                    ...s.completedTasks,
                    { id, name, success, duration, error, phase },
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

      // Create agent with ToolRegistry
      const agent = new Agent({
        config,
        callbacks,
        useToolRegistry: true,
      });

      try {
        // Both modes use run() to support tool calling
        // Verbose mode gets streaming output via onLLMStream callback
        // Non-verbose mode gets clean final answer
        // Pass initialHistory if provided for context continuation
        const result = await agent.run(prompt, initialHistory);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- mountedRef may be false after await
        if (mountedRef.current) {
          setState((s) => {
            // Don't override error state - onError callback may have already set it
            if (s.phase === 'error') return s;
            return {
              ...s,
              phase: 'done',
              // In verbose mode, prefer streamed output if available; otherwise use final result
              output: verbose === true && s.output !== '' ? s.output : result,
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
  }, [prompt, verbose, initialHistory]);

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

  if (state.phase === 'error') {
    // Error already written to stderr
    return <></>;
  }

  if (state.phase === 'executing') {
    // Build phases for ExecutionStatus
    const phases: ExecutionPhase[] = [];
    const now = Date.now();
    for (let i = 0; i < state.currentPhase; i++) {
      const phaseNumber = i + 1;
      const isCurrentPhase = phaseNumber === state.currentPhase;
      const startTime = state.phaseStartTimes[i] ?? now;
      const nextPhaseStart = state.phaseStartTimes[i + 1];
      const phaseDuration = isCurrentPhase
        ? undefined
        : nextPhaseStart !== undefined
          ? (nextPhaseStart - startTime) / 1000
          : (now - startTime) / 1000;

      const phaseCompletedTools = state.completedTasks.filter((t) => t.phase === phaseNumber);
      const phaseActiveTools = state.activeTasks.filter((t) => t.phase === phaseNumber);

      const toolNodes: ToolNode[] = [
        ...phaseCompletedTools.map(
          (task): ToolNode => ({
            id: task.id,
            name: task.name,
            status: task.success ? 'complete' : 'error',
            duration: task.duration >= 0 ? task.duration / 1000 : undefined,
            error: task.error,
            phase: phaseNumber,
          })
        ),
        ...phaseActiveTools.map(
          (task): ToolNode => ({
            id: task.id,
            name: task.name,
            args: task.args !== undefined ? formatToolArgs(task.args) : undefined,
            status: 'running',
            phase: phaseNumber,
          })
        ),
      ];

      phases.push({
        number: phaseNumber,
        status: isCurrentPhase ? 'working' : 'complete',
        duration: phaseDuration,
        messageCount: state.phaseMessageCounts[i] ?? state.messageCount,
        isThinking: isCurrentPhase && state.spinnerMessage !== '' && state.output === '',
        toolNodes,
      });
    }

    // Show ExecutionStatus with phase info
    // Note: toolNodes are already included in phases, so we don't need to pass them separately
    return (
      <Box flexDirection="column">
        {state.currentPhase > 0 && (
          <ExecutionStatus
            status="working"
            messageCount={state.messageCount}
            toolCount={state.completedTasks.length + state.activeTasks.length}
            thinkingState={{
              messageCount: state.messageCount,
              isActive: state.spinnerMessage !== '' && state.output === '',
            }}
            phases={phases}
            showToolHistory={true}
          />
        )}
        {state.currentPhase === 0 && state.spinnerMessage !== '' && (
          <Spinner message={state.spinnerMessage} />
        )}
        {state.output !== '' && <Text>{state.output}</Text>}
      </Box>
    );
  }

  // Done - show final output
  return (
    <Box flexDirection="column">
      <Text>{state.output}</Text>
    </Box>
  );
}
