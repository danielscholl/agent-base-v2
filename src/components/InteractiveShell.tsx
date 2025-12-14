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
import { VERSION } from '../cli/version.js';
import { Header } from './Header.js';
import { Spinner } from './Spinner.js';
import { ErrorDisplay } from './ErrorDisplay.js';
import type { InteractiveShellProps, ShellMessage } from '../cli/types.js';
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
  });

  // Load config on mount
  useEffect(() => {
    async function loadConfiguration(): Promise<void> {
      const result = await loadConfig();
      if (result.success) {
        setState((s) => ({
          ...s,
          config: result.result ?? null,
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

  // Handle input submission
  const handleSubmit = useCallback(async () => {
    const query = state.input.trim();

    if (query === '') return;

    // Check for exit command
    if (query === '/exit' || query === '/quit') {
      exit();
      return;
    }

    // Check for help command
    if (query === '/help') {
      setState((s) => ({
        ...s,
        input: '',
        messages: [
          ...s.messages,
          {
            role: 'system' as const,
            content:
              'Commands:\n  /exit, /quit - Exit the shell\n  /help - Show this help\n  /clear - Clear message history',
            timestamp: new Date(),
          },
        ],
      }));
      return;
    }

    // Check for clear command
    if (query === '/clear') {
      setState((s) => ({
        ...s,
        input: '',
        messages: [],
        streamingOutput: '',
        error: null,
      }));
      return;
    }

    // Add user message
    setState((s) => ({
      ...s,
      input: '',
      messages: [...s.messages, { role: 'user' as const, content: query, timestamp: new Date() }],
      isProcessing: true,
      spinnerMessage: 'Thinking...',
      streamingOutput: '',
      error: null,
    }));

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
          setState((s) => ({
            ...s,
            messages: [
              ...s.messages,
              { role: 'assistant' as const, content: answer, timestamp: new Date() },
            ],
            streamingOutput: '',
            isProcessing: false,
          }));
        },
      });

      agentRef.current = new Agent({
        config: state.config,
        callbacks,
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

    // Run the agent with streaming - runStream() emits onLLMStream callbacks
    // Note: runStream() does not support tool calling (documented limitation)
    // Convert ShellMessage[] to Message[] for agent history
    // state.messages is from closure (before current user message was added)
    const history: Message[] = state.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    try {
      for await (const _chunk of agentRef.current.runStream(query, history)) {
        // Chunks are handled via onLLMStream callback (appendToOutput)
        // The loop just drives iteration; we don't need to use _chunk here
      }
      // onAgentEnd callback fires at end of runStream, triggering onComplete
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
  }, [state.input, state.config, state.messages, exit]);

  // Handle key input - gated until config loads
  useInput((input, key) => {
    // Always allow Ctrl+C to exit, even during loading or processing
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    // Don't process input until config is loaded
    if (!state.configLoaded) return;

    // Don't process other input while agent is working
    if (state.isProcessing) return;

    if (key.return) {
      void handleSubmit();
    } else if (key.backspace || key.delete) {
      setState((s) => ({ ...s, input: s.input.slice(0, -1) }));
    } else if (!key.ctrl && !key.meta && input.length === 1) {
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

      {/* Streaming output */}
      {state.streamingOutput !== '' && (
        <Box marginBottom={1}>
          <Text color="green">{state.streamingOutput}</Text>
        </Box>
      )}

      {/* Spinner during processing (only when not streaming) */}
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
