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
import { getUserFriendlyMessage } from '../errors/index.js';
import type { SinglePromptProps } from '../cli/types.js';
import type { AgentErrorResponse } from '../errors/index.js';
import type { AppConfig } from '../config/schema.js';

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
  }>({
    phase: 'loading',
    spinnerMessage: 'Loading configuration...',
    output: '',
    error: null,
  });

  // Track if component is mounted to prevent state updates after unmount
  const mountedRef = useRef(true);

  // Execute the prompt
  useEffect(() => {
    mountedRef.current = true;

    async function execute(): Promise<void> {
      // Check if any config file exists (user or project)
      const hasConfigFile = await configFileExists();
      if (!hasConfigFile) {
        setState({
          phase: 'error',
          spinnerMessage: '',
          output: '',
          error: {
            success: false,
            error: 'CONFIG_ERROR',
            message: 'No configuration found. Run "agent config init" to set up your provider.',
          },
        });
        return;
      }

      // Load configuration
      const configResult = await loadConfig();

      if (!mountedRef.current) return;

      if (!configResult.success) {
        setState({
          phase: 'error',
          spinnerMessage: '',
          output: '',
          error: {
            success: false,
            error: 'CONFIG_ERROR',
            message: configResult.message,
          },
        });
        return;
      }

      const config = configResult.result as AppConfig;

      // Validate provider credentials
      const validation = validateProviderCredentials(config);
      if (!validation.isValid) {
        setState({
          phase: 'error',
          spinnerMessage: '',
          output: '',
          error: {
            success: false,
            error: 'CONFIG_ERROR',
            message: validation.errors.join('\n'),
          },
        });
        return;
      }

      setState((s) => ({
        ...s,
        phase: 'executing',
        spinnerMessage: 'Thinking...',
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
        },
        { verbose: verbose === true }
      );

      // Wrap callbacks with telemetry spans if enabled
      const providerName = config.providers.default;
      const providerConfig = config.providers[providerName] as Record<string, unknown> | undefined;
      const modelName =
        providerConfig !== undefined
          ? providerName === 'azure'
            ? ((providerConfig['deployment'] as string | undefined) ?? 'unknown')
            : providerName === 'foundry'
              ? ((providerConfig['modelDeployment'] as string | undefined) ?? 'unknown')
              : ((providerConfig['model'] as string | undefined) ?? 'unknown')
          : 'unknown';

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
    // Show streaming output as it arrives, with spinner if no output yet
    return (
      <Box flexDirection="column">
        {state.output !== '' && <Text>{state.output}</Text>}
        {state.output === '' && state.spinnerMessage !== '' && (
          <Spinner message={state.spinnerMessage} />
        )}
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
