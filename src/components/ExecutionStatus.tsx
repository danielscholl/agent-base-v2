/**
 * ExecutionStatus component for agent execution visualization.
 * Displays working/complete/error states with tree-style rendering.
 * Adapted from agent-base Python implementation.
 */

import React from 'react';
import { Box, Text } from 'ink';

// Visual symbols (from agent-base)
const SYMBOL_ACTIVE = '●'; // Yellow - working/thinking
const SYMBOL_COMPLETE = '•'; // Dim - completed node
const SYMBOL_TOOL = '→'; // Tool executing
const SYMBOL_SUCCESS = '✓'; // Green - success/complete
const SYMBOL_ERROR = '✗'; // Red - error

// Tree drawing characters
const TREE_BRANCH = '├──';
const TREE_LAST = '└──';

/**
 * Tool node information for display.
 */
export interface ToolNode {
  /** Unique identifier */
  id: string;
  /** Tool name */
  name: string;
  /** Tool arguments (truncated for display) */
  args?: string;
  /** Execution status */
  status: 'running' | 'complete' | 'error';
  /** Duration in seconds (for completed tools) */
  duration?: number;
  /** Error message (if status is error) */
  error?: string;
  /** Phase number this tool belongs to (1-indexed) */
  phase?: number;
}

/**
 * Execution phase information.
 * Each phase represents one LLM reasoning cycle + its associated tool calls.
 */
export interface ExecutionPhase {
  /** Phase number (1-indexed) */
  number: number;
  /** Phase status */
  status: 'working' | 'complete' | 'error';
  /** Duration in seconds (for completed phases) */
  duration?: number;
  /** Message count for this phase's LLM call */
  messageCount: number;
  /** Whether LLM is actively thinking in this phase */
  isThinking: boolean;
  /** Tool nodes executed in this phase */
  toolNodes: ToolNode[];
}

/**
 * Props for ExecutionStatus component.
 */
export interface ExecutionStatusProps {
  /** Current execution status */
  status: 'working' | 'complete' | 'error';
  /** Number of messages sent to LLM */
  messageCount: number;
  /** Total tool count */
  toolCount: number;
  /** Duration in seconds (for completion status) */
  duration?: number;
  /** Thinking state - whether LLM is actively thinking */
  thinkingState?: {
    messageCount: number;
    isActive: boolean;
  };
  /** Tool execution nodes (flat list, legacy mode) */
  toolNodes?: ToolNode[];
  /** Execution phases (for multi-phase display in verbose mode) */
  phases?: ExecutionPhase[];
  /** Error message (if status is error) */
  errorMessage?: string;
  /** Whether to show detailed tool history (verbose mode) */
  showToolHistory?: boolean;
}

/**
 * Format duration as seconds with one decimal.
 */
function formatDuration(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

/**
 * Render a tool node in the tree.
 */
function ToolNodeRow({ node, isLast }: { node: ToolNode; isLast: boolean }): React.ReactElement {
  const prefix = isLast ? TREE_LAST : TREE_BRANCH;

  // Determine symbol and color based on status
  let symbol: string;
  let color: string;

  if (node.status === 'running') {
    symbol = SYMBOL_TOOL;
    color = 'yellow';
  } else if (node.status === 'complete') {
    symbol = SYMBOL_COMPLETE;
    color = 'gray';
  } else {
    symbol = SYMBOL_ERROR;
    color = 'red';
  }

  return (
    <Box>
      <Text dimColor>{prefix} </Text>
      <Text color={color}>{symbol} </Text>
      <Text color={color}>{node.name}</Text>
      {node.args !== undefined && node.args !== '' && <Text dimColor> ({node.args})</Text>}
      {node.status === 'complete' && node.duration !== undefined && (
        <Text dimColor> ({formatDuration(node.duration)})</Text>
      )}
      {node.status === 'error' && node.error !== undefined && (
        <Text color="red"> - {node.error}</Text>
      )}
    </Box>
  );
}

/**
 * ExecutionStatus component.
 * Displays execution status with tree-style visualization.
 *
 * Non-verbose working state:
 * ```
 * ● working... (msg:1 tool:0)
 * └── ● Thinking (1 messages)
 * ```
 *
 * Non-verbose complete state:
 * ```
 * ✓ Complete (3.9s) - msg:1 tool:0
 * ```
 *
 * Verbose working state (showToolHistory=true):
 * ```
 * ● Phase 1
 * └── ● Thinking (1 messages)
 * ```
 *
 * Verbose complete state (showToolHistory=true):
 * ```
 * • Phase 1 (3.9s)
 * └── • Thinking (1 messages) - Response received
 * ```
 */
export function ExecutionStatus({
  status,
  messageCount,
  toolCount,
  duration,
  thinkingState,
  toolNodes = [],
  phases,
  errorMessage,
  showToolHistory = false,
}: ExecutionStatusProps): React.ReactElement {
  // Completion state
  if (status === 'complete') {
    // Simple completion (non-verbose or no tools)
    if (!showToolHistory || toolNodes.length === 0) {
      return (
        <Box marginBottom={1}>
          <Text color="green">{SYMBOL_SUCCESS} Complete</Text>
          {duration !== undefined && <Text dimColor> ({formatDuration(duration)})</Text>}
          <Text dimColor>
            {' '}
            - msg:{messageCount} tool:{toolCount}
          </Text>
        </Box>
      );
    }

    // Verbose completion with phases (if provided)
    if (phases !== undefined && phases.length > 0) {
      return (
        <Box flexDirection="column" marginBottom={1}>
          {phases.map((phase) => (
            <React.Fragment key={phase.number}>
              {/* Phase header with duration */}
              <Box>
                <Text dimColor>
                  {SYMBOL_COMPLETE} Phase {phase.number}
                </Text>
                {phase.duration !== undefined && (
                  <Text dimColor> ({formatDuration(phase.duration)})</Text>
                )}
              </Box>

              {/* Thinking summary */}
              <Box>
                <Text dimColor>
                  {phase.toolNodes.length > 0 ? TREE_BRANCH : TREE_LAST} {SYMBOL_COMPLETE} Thinking
                  ({phase.messageCount} messages) - Response received
                </Text>
              </Box>

              {/* Tool nodes for this phase */}
              {phase.toolNodes.map((node, index) => {
                const isLast = index === phase.toolNodes.length - 1;
                const prefix = isLast ? TREE_LAST : TREE_BRANCH;

                return (
                  <Box key={node.id}>
                    <Text dimColor>
                      {prefix} {node.status === 'error' ? SYMBOL_ERROR : SYMBOL_COMPLETE}{' '}
                      {node.name}
                    </Text>
                    {node.args !== undefined && node.args !== '' && (
                      <Text dimColor> ({node.args})</Text>
                    )}
                    {node.duration !== undefined && (
                      <Text dimColor> ({formatDuration(node.duration)})</Text>
                    )}
                    {node.status === 'error' && node.error !== undefined && (
                      <Text color="red"> - {node.error}</Text>
                    )}
                  </Box>
                );
              })}
            </React.Fragment>
          ))}
        </Box>
      );
    }

    // Verbose completion with flat tool list (legacy mode - single phase)
    return (
      <Box flexDirection="column" marginBottom={1}>
        {/* Phase header with duration */}
        <Box>
          <Text dimColor>{SYMBOL_COMPLETE} Phase 1</Text>
          {duration !== undefined && <Text dimColor> ({formatDuration(duration)})</Text>}
        </Box>

        {/* Thinking summary */}
        <Box>
          <Text dimColor>
            {toolNodes.length > 0 ? TREE_BRANCH : TREE_LAST} {SYMBOL_COMPLETE} Thinking (
            {messageCount} messages) - Response received
          </Text>
        </Box>

        {/* Tool nodes (all dimmed since complete) */}
        {toolNodes.map((node, index) => {
          const isLast = index === toolNodes.length - 1;
          const prefix = isLast ? TREE_LAST : TREE_BRANCH;

          return (
            <Box key={node.id}>
              <Text dimColor>
                {prefix} {node.status === 'error' ? SYMBOL_ERROR : SYMBOL_COMPLETE} {node.name}
              </Text>
              {node.args !== undefined && node.args !== '' && <Text dimColor> ({node.args})</Text>}
              {node.duration !== undefined && (
                <Text dimColor> ({formatDuration(node.duration)})</Text>
              )}
              {node.status === 'error' && node.error !== undefined && (
                <Text color="red"> - {node.error}</Text>
              )}
            </Box>
          );
        })}
      </Box>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="red">{SYMBOL_ERROR} Error</Text>
          {duration !== undefined && <Text dimColor> ({formatDuration(duration)})</Text>}
          <Text dimColor>
            {' '}
            - msg:{messageCount} tool:{toolCount}
          </Text>
        </Box>
        {errorMessage !== undefined && (
          <Box>
            <Text dimColor>{TREE_LAST} </Text>
            <Text color="red">{errorMessage}</Text>
          </Box>
        )}
      </Box>
    );
  }

  // Working state - build tree structure
  const hasThinking = thinkingState?.isActive ?? false;
  const hasTools = toolNodes.length > 0;

  // Verbose mode with phases (if provided)
  if (showToolHistory && phases !== undefined && phases.length > 0) {
    const currentPhase = phases[phases.length - 1];
    const completedPhases = phases.slice(0, -1);

    return (
      <Box flexDirection="column" marginBottom={1}>
        {/* Completed phases (dimmed) */}
        {completedPhases.map((phase) => (
          <React.Fragment key={phase.number}>
            <Box>
              <Text dimColor>
                {SYMBOL_COMPLETE} Phase {phase.number}
              </Text>
              {phase.duration !== undefined && (
                <Text dimColor> ({formatDuration(phase.duration)})</Text>
              )}
            </Box>
            <Box>
              <Text dimColor>
                {phase.toolNodes.length > 0 ? TREE_BRANCH : TREE_LAST} {SYMBOL_COMPLETE} Thinking (
                {phase.messageCount} messages) - Response received
              </Text>
            </Box>
            {phase.toolNodes.map((node, index) => {
              const isLast = index === phase.toolNodes.length - 1;
              const prefix = isLast ? TREE_LAST : TREE_BRANCH;
              return (
                <Box key={node.id}>
                  <Text dimColor>
                    {prefix} {node.status === 'error' ? SYMBOL_ERROR : SYMBOL_COMPLETE} {node.name}
                  </Text>
                  {node.args !== undefined && node.args !== '' && (
                    <Text dimColor> ({node.args})</Text>
                  )}
                  {node.duration !== undefined && (
                    <Text dimColor> ({formatDuration(node.duration)})</Text>
                  )}
                </Box>
              );
            })}
          </React.Fragment>
        ))}

        {/* Current phase (active) */}
        {currentPhase !== undefined && (
          <>
            <Box>
              <Text color="yellow">
                {SYMBOL_ACTIVE} Phase {currentPhase.number}
              </Text>
            </Box>
            {currentPhase.isThinking && (
              <Box>
                <Text dimColor>{currentPhase.toolNodes.length > 0 ? TREE_BRANCH : TREE_LAST} </Text>
                <Text color="yellow">{SYMBOL_ACTIVE} Thinking</Text>
                <Text dimColor> ({currentPhase.messageCount} messages)</Text>
              </Box>
            )}
            {currentPhase.toolNodes.map((node, index) => (
              <ToolNodeRow
                key={node.id}
                node={node}
                isLast={index === currentPhase.toolNodes.length - 1}
              />
            ))}
          </>
        )}
      </Box>
    );
  }

  // Verbose mode without phases (legacy - single phase)
  if (showToolHistory) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        {/* Phase header */}
        <Box>
          <Text color="yellow">{SYMBOL_ACTIVE} Phase 1</Text>
        </Box>

        {/* Thinking node */}
        {hasThinking && (
          <Box>
            <Text dimColor>{hasTools ? TREE_BRANCH : TREE_LAST} </Text>
            <Text color="yellow">{SYMBOL_ACTIVE} Thinking</Text>
            <Text dimColor> ({thinkingState?.messageCount ?? 0} messages)</Text>
          </Box>
        )}

        {/* Tool nodes */}
        {toolNodes.map((node, index) => (
          <ToolNodeRow key={node.id} node={node} isLast={index === toolNodes.length - 1} />
        ))}
      </Box>
    );
  }

  // Non-verbose working state
  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Header line */}
      <Box>
        <Text color="yellow">{SYMBOL_ACTIVE} working...</Text>
        <Text dimColor>
          {' '}
          (msg:{messageCount} tool:{toolCount})
        </Text>
      </Box>

      {/* Thinking node */}
      {hasThinking && (
        <Box>
          <Text dimColor>{hasTools ? TREE_BRANCH : TREE_LAST} </Text>
          <Text color="yellow">{SYMBOL_ACTIVE} Thinking</Text>
          <Text dimColor> ({thinkingState?.messageCount ?? 0} messages)</Text>
        </Box>
      )}

      {/* Tool nodes */}
      {toolNodes.map((node, index) => (
        <ToolNodeRow key={node.id} node={node} isLast={index === toolNodes.length - 1} />
      ))}
    </Box>
  );
}
