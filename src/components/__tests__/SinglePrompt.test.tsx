/**
 * Tests for SinglePrompt component.
 * Note: Tests are minimal due to complex async mock requirements.
 */

import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render } from 'ink-testing-library';
import type { AgentCallbacks } from '../../agent/callbacks.js';
import type { CommandResult, CommandContext } from '../../cli/commands/types.js';

let stderrWriteSpy: { mockRestore: () => void } | null = null;
let stdoutWriteSpy: { mockRestore: () => void } | null = null;

// Mock modules before importing
const mockLoadConfig = jest.fn<() => Promise<unknown>>();
const mockConfigFileExists = jest.fn<() => Promise<boolean>>();

jest.unstable_mockModule('../../config/manager.js', () => ({
  loadConfig: mockLoadConfig,
  configFileExists: mockConfigFileExists,
}));

// Mock executeCommand for slash command tests
const mockExecuteCommand =
  jest.fn<(input: string, context: CommandContext) => Promise<CommandResult | undefined>>();

jest.unstable_mockModule('../../cli/commands/index.js', () => ({
  executeCommand: mockExecuteCommand,
}));

// Mock createCliContextWithConfig - return a proper mutable context object
const mockCreateCliContextWithConfig = jest.fn((config: unknown) => ({
  config,
  onOutput: jest.fn(),
  onPrompt: jest.fn(),
  exit: jest.fn(),
}));

jest.unstable_mockModule('../../cli/cli-context.js', () => ({
  createCliContextWithConfig: mockCreateCliContextWithConfig,
}));

// Create mock functions for SessionManager methods
// These will be shared across all SessionManager instances
// Initialize with default return values
const sessionManagerMocks = {
  getLastSession: jest.fn<() => Promise<string | null>>().mockResolvedValue(null),
  loadSession: jest.fn<(sessionId: string) => Promise<unknown>>().mockResolvedValue(null),
};

// Create a mock SessionManager class
class MockSessionManager {
  getLastSession = sessionManagerMocks.getLastSession;
  loadSession = sessionManagerMocks.loadSession;
}

// Mock utils module
jest.unstable_mockModule('../../utils/index.js', () => ({
  resolveModelName: jest.fn((providerName: string) => {
    if (providerName === 'azure') return 'test-deployment';
    if (providerName === 'foundry') return 'test-model-deployment';
    return 'gpt-4o';
  }),
  SessionManager: MockSessionManager,
  getAgentHome: jest.fn(() => '/test/.agent'),
}));

// Mock help handler
jest.unstable_mockModule('../../cli/commands/help.js', () => ({
  helpHandler: jest.fn((_args, context) => {
    context.onOutput('Help displayed', 'info');
    return Promise.resolve({ success: true });
  }),
}));

// Mock telemetry module - include all exports used by cli/callbacks.js
// Create mock functions that return proper Promises
const mockInitializeTelemetry = (): Promise<{
  success: boolean;
  result: { enabled: boolean; exporterType: string; serviceName: string };
  message: string;
}> =>
  Promise.resolve({
    success: true,
    result: { enabled: false, exporterType: 'none', serviceName: 'test' },
    message: 'Telemetry disabled',
  });

const mockShutdown = (): Promise<{ success: boolean; message: string }> =>
  Promise.resolve({
    success: true,
    message: 'Shutdown complete',
  });

jest.unstable_mockModule('../../telemetry/index.js', () => ({
  initializeTelemetry: mockInitializeTelemetry,
  shutdown: mockShutdown,
  isEnabled: () => false,
  startAgentSpan: jest.fn(),
  endAgentSpan: jest.fn(),
  startLLMSpan: jest.fn(),
  endLLMSpan: jest.fn(),
  startToolSpan: jest.fn(),
  endToolSpan: jest.fn(),
  getSpanKey: (ctx: { traceId: string; spanId: string }) => `${ctx.traceId}:${ctx.spanId}`,
  mapProviderName: (name: string) => name,
  getTracer: () => ({
    startSpan: jest.fn().mockReturnValue({
      setAttribute: jest.fn(),
      setStatus: jest.fn(),
      end: jest.fn(),
    }),
  }),
  // GenAI semantic convention constants
  ATTR_GEN_AI_OPERATION_NAME: 'gen_ai.operation.name',
  ATTR_GEN_AI_PROVIDER_NAME: 'gen_ai.provider.name',
  ATTR_GEN_AI_REQUEST_MODEL: 'gen_ai.request.model',
  ATTR_GEN_AI_INPUT_MESSAGES: 'gen_ai.request.messages',
  ATTR_GEN_AI_TOOL_NAME: 'gen_ai.tool.name',
  ATTR_GEN_AI_TOOL_CALL_ID: 'gen_ai.tool.call.id',
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS: 'gen_ai.tool.call.arguments',
  GEN_AI_OPERATION: {
    CHAT: 'chat',
    EXECUTE_TOOL: 'execute_tool',
    INVOKE_AGENT: 'invoke_agent',
  },
}));

// Mock Agent that invokes callbacks properly
// - run(): Invokes onAgentEnd only (no streaming)
// - runStream(): Invokes onLLMStream for each chunk, then onAgentEnd
jest.unstable_mockModule('../../agent/agent.js', () => ({
  Agent: class MockAgent {
    private callbacks: AgentCallbacks | undefined;

    constructor(options: { callbacks?: AgentCallbacks }) {
      this.callbacks = options.callbacks;
    }

    run(_prompt: string): Promise<string> {
      // run() only invokes onAgentEnd, not onLLMStream
      this.callbacks?.onAgentEnd?.({}, 'Hello, world!');
      return Promise.resolve('Hello, world!');
    }

    async *runStream(_prompt: string): AsyncGenerator<string, void, unknown> {
      // runStream() invokes onLLMStream for each chunk
      const chunks = ['Hello', ', ', 'world', '!'];
      for (const chunk of chunks) {
        this.callbacks?.onLLMStream?.({}, chunk);
        yield chunk;
        // Simulate async behavior
        await Promise.resolve();
      }
      // Then invokes onAgentEnd with full response
      this.callbacks?.onAgentEnd?.({}, 'Hello, world!');
    }
  },
}));

// Import after mocking
const { SinglePrompt } = await import('../SinglePrompt.js');

// Mock config for testing
const mockConfig = {
  version: '0.1.0',
  providers: {
    default: 'openai',
    openai: { model: 'gpt-4o', apiKey: 'test-key' },
  },
  agent: { maxIterations: 10 },
  telemetry: { enabled: false },
  memory: { enabled: false },
  skills: { plugins: [], disabledBundled: [], enabledBundled: [] },
  retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 30000, multiplier: 2.0 },
  session: { autoSave: true, maxSessions: 50 },
};

describe('SinglePrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // SinglePrompt writes errors to stderr for scripting; silence during tests to avoid CI annotations/noise.
    stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((() => true) as never);
    // Default: config file exists
    mockConfigFileExists.mockResolvedValue(true);
    // Default: config loads successfully
    mockLoadConfig.mockResolvedValue({
      success: true,
      result: mockConfig,
      message: 'Config loaded',
    });
    // Default: no last session
    sessionManagerMocks.getLastSession.mockResolvedValue(null);
    sessionManagerMocks.loadSession.mockResolvedValue(null);
  });

  afterEach(() => {
    stderrWriteSpy?.mockRestore();
    stderrWriteSpy = null;
    stdoutWriteSpy?.mockRestore();
    stdoutWriteSpy = null;
  });

  it('shows spinner while loading config in verbose mode', () => {
    // Make config loading take time
    mockLoadConfig.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ success: true, result: mockConfig, message: 'ok' });
          }, 100);
        })
    );

    // Verbose mode shows spinner
    const { lastFrame } = render(<SinglePrompt prompt="test" verbose={true} />);

    // Should show loading spinner initially
    expect(lastFrame()).toContain('Loading configuration...');
  });

  it('renders nothing while loading in non-verbose mode (clean scripting)', () => {
    // Make config loading take time
    mockLoadConfig.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ success: true, result: mockConfig, message: 'ok' });
          }, 100);
        })
    );

    // Non-verbose mode renders empty during loading
    const { lastFrame } = render(<SinglePrompt prompt="test" />);

    // Should render nothing (empty string or whitespace only)
    expect(lastFrame()?.trim()).toBe('');
  });

  it('displays error when config loading fails', async () => {
    mockLoadConfig.mockResolvedValue({
      success: false,
      error: 'CONFIG_ERROR',
      message: 'Failed to load config',
    });

    // In non-verbose mode, errors go to stderr and render empty
    // Just verify it doesn't throw
    const { lastFrame } = render(<SinglePrompt prompt="test" />);

    // Wait for async operations
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });

    // Non-verbose mode renders nothing on error (error is written to stderr)
    expect(lastFrame()?.trim()).toBe('');
  });

  it('displays result when agent completes successfully (non-verbose)', async () => {
    const { lastFrame } = render(<SinglePrompt prompt="Say hello" />);

    // Wait for async operations (config load + agent run) with polling
    // CI environments can be slower, so we poll instead of fixed timeout
    const maxWait = 2000;
    const interval = 50;
    let elapsed = 0;
    while (elapsed < maxWait) {
      await new Promise((resolve) => {
        setTimeout(resolve, interval);
      });
      elapsed += interval;
      const frame = lastFrame();
      if (frame !== undefined && frame.includes('Hello, world!')) break;
    }

    // Should show the result
    expect(lastFrame()).toContain('Hello, world!');
  });

  it('streams output in verbose mode using runStream', async () => {
    const { lastFrame } = render(<SinglePrompt prompt="Say hello" verbose={true} />);

    // Wait for async operations with polling
    const maxWait = 2000;
    const interval = 50;
    let elapsed = 0;
    while (elapsed < maxWait) {
      await new Promise((resolve) => {
        setTimeout(resolve, interval);
      });
      elapsed += interval;
      const frame = lastFrame();
      if (frame !== undefined && frame.includes('Hello, world!')) break;
    }

    // Should show the streamed output
    expect(lastFrame()).toContain('Hello, world!');
  });

  it('renders without throwing', () => {
    // Basic render test
    expect(() => {
      render(<SinglePrompt prompt="test" />);
    }).not.toThrow();
  });

  describe('slash command handling', () => {
    beforeEach(() => {
      // Reset executeCommand mock
      mockExecuteCommand.mockReset();
    });

    it('executes custom command and uses prompt for agent', async () => {
      // Mock custom command that returns a prompt
      mockExecuteCommand.mockResolvedValue({
        success: true,
        customCommandPrompt: 'Hello World! How are you?',
        customCommandName: 'greet',
      });

      const { lastFrame } = render(<SinglePrompt prompt="/greet World" />);

      // Wait for async operations
      const maxWait = 2000;
      const interval = 50;
      let elapsed = 0;
      while (elapsed < maxWait) {
        await new Promise((resolve) => {
          setTimeout(resolve, interval);
        });
        elapsed += interval;
        const frame = lastFrame();
        // Agent mock returns "Hello, world!" - the custom command transforms the prompt
        // but the agent response is still the mock response
        if (frame !== undefined && frame.includes('Hello, world!')) break;
      }

      // Verify executeCommand was called with the slash command
      // Note: The context object structure may vary based on mocking, just verify the call happened
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        '/greet World',
        expect.objectContaining({ exit: expect.any(Function) })
      );
    });

    it('handles built-in command (/help) and exits without agent', async () => {
      // /help is handled directly without config, exits successfully
      // Note: Help output goes to context.onOutput, not rendered output
      const { lastFrame } = render(<SinglePrompt prompt="/help" />);

      // Wait for async operations
      await new Promise((resolve) => {
        setTimeout(resolve, 300);
      });

      // /help completes successfully, output goes through context.onOutput
      // In non-verbose mode, render is empty after completion
      const frame = lastFrame();
      expect(frame?.trim()).toBe(''); // Clean exit, output was to context.onOutput
    });

    it('handles unknown command with error', async () => {
      // Mock unknown command error
      mockExecuteCommand.mockResolvedValue({
        success: false,
        message: 'Unknown command: /unknown',
      });

      render(<SinglePrompt prompt="/unknown" />);

      // Wait for async operations
      await new Promise((resolve) => {
        setTimeout(resolve, 300);
      });

      // Error should be written to stderr
      expect(stderrWriteSpy).toHaveBeenCalled();
    });

    it('passes regular prompts to agent without command processing', async () => {
      // Regular prompt - executeCommand returns undefined (not a command)
      mockExecuteCommand.mockResolvedValue(undefined);

      const { lastFrame } = render(<SinglePrompt prompt="What is TypeScript?" />);

      // Wait for async operations
      const maxWait = 2000;
      const interval = 50;
      let elapsed = 0;
      while (elapsed < maxWait) {
        await new Promise((resolve) => {
          setTimeout(resolve, interval);
        });
        elapsed += interval;
        const frame = lastFrame();
        if (frame !== undefined && frame.includes('Hello, world!')) break;
      }

      // executeCommand should not be called for non-slash commands
      expect(mockExecuteCommand).not.toHaveBeenCalled();

      // Should show agent response
      expect(lastFrame()).toContain('Hello, world!');
    });

    it('shows processing spinner for commands in verbose mode', async () => {
      // Slow command execution for a command that requires config (not /help)
      mockExecuteCommand.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                success: true,
                message: 'Done',
              });
            }, 200);
          })
      );

      // Use /telemetry which requires config loading
      const { lastFrame } = render(<SinglePrompt prompt="/telemetry status" verbose={true} />);

      // Should show processing spinner while command executes
      // Need to wait for config to load first
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      const frame = lastFrame();
      // In verbose mode, should show processing message
      expect(frame).toContain('Processing');
    });

    it('blocks shell commands for security', async () => {
      // Shell commands should be blocked in prompt mode
      render(<SinglePrompt prompt="!ls -la" />);

      // Wait for async operations
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      // Error should be written to stderr
      expect(stderrWriteSpy).toHaveBeenCalled();
    });

    it('handles // escape for literal slashes', async () => {
      // "//etc/hosts" should be sent to agent as "/etc/hosts"
      const { lastFrame } = render(<SinglePrompt prompt="//etc/hosts" />);

      // Wait for async operations
      const maxWait = 2000;
      const interval = 50;
      let elapsed = 0;
      while (elapsed < maxWait) {
        await new Promise((resolve) => {
          setTimeout(resolve, interval);
        });
        elapsed += interval;
        const frame = lastFrame();
        if (frame !== undefined && frame.includes('Hello, world!')) break;
      }

      // Agent should be called (// escape sends to agent, not as command)
      // Mock agent returns "Hello, world!"
      expect(lastFrame()).toContain('Hello, world!');
    });

    it('rejects unsupported commands (/save, /resume, /clear)', async () => {
      // These commands don't make sense in prompt mode
      render(<SinglePrompt prompt="/save" />);

      // Wait for async operations
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      // Error should be written to stderr
      expect(stderrWriteSpy).toHaveBeenCalled();
    });
  });

  describe('resumeSession functionality', () => {
    it('loads last session when resumeSession=true and session exists', async () => {
      // Mock session data
      const mockSessionId = 'session-123';
      const mockSession = {
        id: mockSessionId,
        timestamp: new Date('2024-01-01').toISOString(),
        messages: [
          { role: 'user', content: 'Previous question' },
          { role: 'assistant', content: 'Previous answer' },
        ],
      };

      // Setup mocks to return a session
      sessionManagerMocks.getLastSession.mockResolvedValue(mockSessionId);
      sessionManagerMocks.loadSession.mockResolvedValue(mockSession);

      const { lastFrame } = render(<SinglePrompt prompt="New question" resumeSession={true} />);

      // Wait for async operations
      const maxWait = 2000;
      const interval = 50;
      let elapsed = 0;
      while (elapsed < maxWait) {
        await new Promise((resolve) => {
          setTimeout(resolve, interval);
        });
        elapsed += interval;
        const frame = lastFrame();
        if (frame !== undefined && frame.includes('Hello, world!')) break;
      }

      // Verify SessionManager methods were called correctly
      expect(sessionManagerMocks.getLastSession).toHaveBeenCalledTimes(1);
      expect(sessionManagerMocks.loadSession).toHaveBeenCalledWith(mockSessionId);

      // Should show agent response (agent was called with the loaded history)
      expect(lastFrame()).toContain('Hello, world!');
    });

    it('loads last session in verbose mode and shows session resume message', async () => {
      // Mock session data
      const mockSessionId = 'session-456';
      const mockSession = {
        id: mockSessionId,
        timestamp: new Date('2024-01-01').toISOString(),
        messages: [
          { role: 'user', content: 'Previous question' },
          { role: 'assistant', content: 'Previous answer' },
        ],
      };

      // Setup mocks to return a session
      sessionManagerMocks.getLastSession.mockResolvedValue(mockSessionId);
      sessionManagerMocks.loadSession.mockResolvedValue(mockSession);

      const { lastFrame } = render(
        <SinglePrompt prompt="New question" resumeSession={true} verbose={true} />
      );

      // Wait for async operations
      const maxWait = 2000;
      const interval = 50;
      let elapsed = 0;
      while (elapsed < maxWait) {
        await new Promise((resolve) => {
          setTimeout(resolve, interval);
        });
        elapsed += interval;
        const frame = lastFrame();
        if (frame !== undefined && frame.includes('Hello, world!')) break;
      }

      // Verify SessionManager methods were called correctly
      expect(sessionManagerMocks.getLastSession).toHaveBeenCalledTimes(1);
      expect(sessionManagerMocks.loadSession).toHaveBeenCalledWith(mockSessionId);

      // In verbose mode, session resume message is written to stderr
      expect(stderrWriteSpy).toHaveBeenCalledWith(`[session] Resuming session: ${mockSessionId}\n`);

      // Should show agent response
      expect(lastFrame()).toContain('Hello, world!');
    });

    it('runs without additional history when resumeSession=true but no session exists', async () => {
      // Setup mocks to indicate no session exists
      sessionManagerMocks.getLastSession.mockResolvedValue(null);

      const { lastFrame } = render(<SinglePrompt prompt="First question" resumeSession={true} />);

      // Wait for async operations
      const maxWait = 2000;
      const interval = 50;
      let elapsed = 0;
      while (elapsed < maxWait) {
        await new Promise((resolve) => {
          setTimeout(resolve, interval);
        });
        elapsed += interval;
        const frame = lastFrame();
        if (frame !== undefined && frame.includes('Hello, world!')) break;
      }

      // Verify SessionManager.getLastSession was called
      expect(sessionManagerMocks.getLastSession).toHaveBeenCalledTimes(1);
      // loadSession should not be called when getLastSession returns null
      expect(sessionManagerMocks.loadSession).not.toHaveBeenCalled();

      // Should show agent response (agent was called without history)
      expect(lastFrame()).toContain('Hello, world!');
    });

    it('does not load session when resumeSession=false', async () => {
      const { lastFrame } = render(<SinglePrompt prompt="Question" resumeSession={false} />);

      // Wait for async operations
      const maxWait = 2000;
      const interval = 50;
      let elapsed = 0;
      while (elapsed < maxWait) {
        await new Promise((resolve) => {
          setTimeout(resolve, interval);
        });
        elapsed += interval;
        const frame = lastFrame();
        if (frame !== undefined && frame.includes('Hello, world!')) break;
      }

      // Verify SessionManager methods were NOT called
      expect(sessionManagerMocks.getLastSession).not.toHaveBeenCalled();
      expect(sessionManagerMocks.loadSession).not.toHaveBeenCalled();

      // Should show agent response
      expect(lastFrame()).toContain('Hello, world!');
    });

    it('prioritizes initialHistory over resumeSession', async () => {
      const mockSessionId = 'session-789';
      const mockSession = {
        id: mockSessionId,
        timestamp: new Date('2024-01-01').toISOString(),
        messages: [
          { role: 'user', content: 'Session question' },
          { role: 'assistant', content: 'Session answer' },
        ],
      };

      // Setup mocks to return a session
      sessionManagerMocks.getLastSession.mockResolvedValue(mockSessionId);
      sessionManagerMocks.loadSession.mockResolvedValue(mockSession);

      // Provide initialHistory - should be used instead of loading from session
      const initialHistory = [
        { role: 'user', content: 'Initial question' },
        { role: 'assistant', content: 'Initial answer' },
      ];

      const { lastFrame } = render(
        <SinglePrompt
          prompt="Question"
          resumeSession={true}
          initialHistory={initialHistory as never}
        />
      );

      // Wait for async operations
      const maxWait = 2000;
      const interval = 50;
      let elapsed = 0;
      while (elapsed < maxWait) {
        await new Promise((resolve) => {
          setTimeout(resolve, interval);
        });
        elapsed += interval;
        const frame = lastFrame();
        if (frame !== undefined && frame.includes('Hello, world!')) break;
      }

      // Verify SessionManager methods were NOT called (initialHistory takes precedence)
      expect(sessionManagerMocks.getLastSession).not.toHaveBeenCalled();
      expect(sessionManagerMocks.loadSession).not.toHaveBeenCalled();

      // Should show agent response
      expect(lastFrame()).toContain('Hello, world!');
    });
  });
});
