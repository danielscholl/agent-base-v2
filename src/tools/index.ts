/**
 * Tools module - LangChain tool wrapper, registry, and tool implementations.
 *
 * This module provides:
 * - Tool namespace with define() factory and types
 * - ToolRegistry for centralized tool management
 * - Individual tool implementations (read, write, edit, bash, etc.)
 * - Workspace utilities for path validation
 */

// =============================================================================
// New Tool System (OpenCode Pattern)
// =============================================================================

// Tool namespace and types
export { Tool } from './tool.js';

// Tool registry
export {
  ToolRegistry,
  registerBuiltinTools,
  type ToolPermission,
  type ToolPermissions,
  type ToolExecutionResult,
} from './registry.js';

// New pattern tools
export { readTool } from './read.js';
export { writeTool } from './write.js';
export { editTool } from './edit.js';
export { listTool } from './list.js';
export { bashTool } from './bash.js';
export { globTool } from './glob.js';
export { grepTool } from './grep.js';
export { webfetchTool } from './webfetch.js';
export { taskTool } from './task.js';
export { todoWriteTool, todoReadTool, clearTodos, getTodos } from './todo.js';

// =============================================================================
// Legacy Tool Types (for backward compatibility)
// =============================================================================

// Type exports (used by some external code)
export type { ToolErrorCode, ToolResponse, SuccessResponse, ErrorResponse } from './types.js';

// Type guards
export { isSuccessResponse, isErrorResponse } from './types.js';

// Filesystem utilities (used by new tools)
export {
  getWorkspaceRoot,
  getWorkspaceRootReal,
  resolveWorkspacePath,
  resolveWorkspacePathSafe,
  isFilesystemWritesEnabled,
  mapSystemErrorToToolError,
  DEFAULT_MAX_READ_BYTES,
  DEFAULT_MAX_WRITE_BYTES,
  DEFAULT_MAX_ENTRIES,
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_MATCHES,
  MAX_ENTRIES_CAP,
  MAX_LINES_CAP,
  SNIPPET_MAX_LENGTH,
  BINARY_CHECK_SIZE,
} from './workspace.js';

// =============================================================================
// Auto-Registration of Built-in Tools
// =============================================================================

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ToolRegistry, type ToolPermissions } from './registry.js';
import { readTool } from './read.js';
import { writeTool } from './write.js';
import { editTool } from './edit.js';
import { listTool } from './list.js';
import { bashTool } from './bash.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { webfetchTool } from './webfetch.js';
import { taskTool } from './task.js';
import { todoWriteTool, todoReadTool } from './todo.js';

// Get the directory containing tool description files
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Permission definitions for built-in tools
const toolPermissions: Record<string, ToolPermissions> = {
  read: { required: ['read'] },
  write: { required: ['write'] },
  edit: { required: ['write'] },
  list: { required: ['read'] },
  bash: { required: ['execute'] },
  glob: { required: ['read'] },
  grep: { required: ['read'] },
  webfetch: { required: ['network'] },
  task: { required: ['execute'] },
  todowrite: { required: ['read'] },
  todoread: { required: ['read'] },
};

// Auto-register all built-in tools
const builtinTools = [
  { tool: readTool, permissions: toolPermissions.read },
  { tool: writeTool, permissions: toolPermissions.write },
  { tool: editTool, permissions: toolPermissions.edit },
  { tool: listTool, permissions: toolPermissions.list },
  { tool: bashTool, permissions: toolPermissions.bash },
  { tool: globTool, permissions: toolPermissions.glob },
  { tool: grepTool, permissions: toolPermissions.grep },
  { tool: webfetchTool, permissions: toolPermissions.webfetch },
  { tool: taskTool, permissions: toolPermissions.task },
  { tool: todoWriteTool, permissions: toolPermissions.todowrite },
  { tool: todoReadTool, permissions: toolPermissions.todoread },
];

// Register tools with their description file paths
for (const { tool, permissions } of builtinTools) {
  const descriptionPath = path.join(__dirname, `${tool.id}.txt`);
  ToolRegistry.register(tool, { permissions, descriptionPath });
}
