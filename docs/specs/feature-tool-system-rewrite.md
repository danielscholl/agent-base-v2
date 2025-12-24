# Feature: Tool System Rewrite (OpenCode Pattern)

## Feature Description

Rewrite the agent-base-v2 tool system to adopt OpenCode's proven architecture pattern. This involves creating a new `Tool.define()` factory with async initialization, implementing a tool registry with dynamic loading, migrating to external `.txt` description files, adding metadata streaming support, and updating all existing tools to the new pattern.

The OpenCode pattern provides several advantages over the current implementation:
- **Async Initialization**: Tools can perform setup tasks (load configs, discover resources) before being used
- **External Descriptions**: `.txt` files keep descriptions maintainable and under version control separately
- **Metadata Streaming**: Real-time progress updates via `ctx.metadata()` callback
- **Simplified Response**: `{ title, metadata, output, attachments? }` instead of `ToolResponse` discriminated union
- **Registry System**: Centralized tool management with plugin support and permission filtering
- **Context Object**: Rich execution context with session info, abort signals, and metadata callbacks

## User Story

As an agent framework developer
I want a tool system that matches OpenCode's proven architecture
So that tools can initialize asynchronously, stream progress, and integrate with a centralized registry

## Problem Statement

The current tool system has limitations:
1. **Synchronous Initialization**: Tools cannot perform async setup (e.g., load available agents for Task tool)
2. **Inline Descriptions**: Tool descriptions are embedded in code, making them harder to maintain and review
3. **No Metadata Streaming**: Cannot provide real-time progress updates during tool execution
4. **No Registry**: Tools are manually passed to agent; no centralized management or dynamic loading
5. **Complex Response Type**: `ToolResponse<T>` discriminated union adds boilerplate; LangChain handles errors anyway
6. **No Abort Support**: Tools cannot respond to cancellation signals

## Solution Statement

Adopt OpenCode's tool architecture:

1. **New Tool Interface** (`src/tools/tool.ts`):
   - `Tool.define()` factory with async `init` function
   - `Tool.Context` with session info, abort signal, and metadata callback
   - Standardized response: `{ title, metadata, output, attachments? }`

2. **Tool Registry** (`src/tools/registry.ts`):
   - Central registry for all built-in and custom tools
   - Plugin tool loading from config directories
   - Permission-based tool filtering
   - Async tool initialization with caching

3. **External Descriptions** (`src/tools/*.txt`):
   - Move all tool descriptions to separate `.txt` files
   - Loaded at runtime via imports
   - Supports template variables (e.g., `${directory}`)

4. **Migrate Existing Tools**:
   - Convert filesystem tools to new pattern
   - Add bash, glob, grep, list, edit, webfetch tools
   - Implement task and todo tools with new patterns

## Related Documentation

### Requirements
- Feature defined in: This specification
- Depends on: Feature 3 (existing tool wrapper), Feature 5 (agent orchestration)

### Architecture Decisions
- ADR-0002: LangChain.js for LLM Integration (tools still bind to LangChain)
- ADR-0004: Zod for Validation (schemas remain Zod-based)
- ADR-0007: Callbacks over EventBus (metadata streaming uses callbacks)

## Codebase Analysis Findings

### OpenCode Tool Architecture (source: `../opencode/packages/opencode/src/tool/`)

**Core Pattern (`tool.ts`)**:
```typescript
export namespace Tool {
  export type Context<M extends Metadata> = {
    sessionID: string
    messageID: string
    agent: string
    abort: AbortSignal
    callID?: string
    extra?: { [key: string]: any }
    metadata(input: { title?: string; metadata?: M }): void
  }

  export interface Info<Parameters extends z.ZodType, M extends Metadata> {
    id: string
    init: (ctx?: InitContext) => Promise<{
      description: string
      parameters: Parameters
      execute(args: z.infer<Parameters>, ctx: Context): Promise<{
        title: string
        metadata: M
        output: string
        attachments?: MessageV2.FilePart[]
      }>
    }>
  }

  export function define<P extends z.ZodType, M extends Metadata>(
    id: string,
    init: Info<P, M>["init"] | Awaited<ReturnType<Info<P, M>["init"]>>
  ): Info<P, M>
}
```

**Key Features**:
- Async `init()` allows loading descriptions, discovering resources
- `ctx.metadata()` enables real-time progress updates
- `ctx.abort` enables cancellation support
- Simple response format without discriminated union complexity

**Registry Pattern (`registry.ts`)**:
- Static registry with lazy initialization
- Plugin tool loading from config directories
- Permission-based filtering
- Provider-specific tool filtering (e.g., Exa tools only for certain providers)

### Current agent-base-v2 Tool Architecture

**Current Pattern (`base.ts`)**:
```typescript
export function createTool<TInput, TResult>(
  options: CreateToolOptions<TInput, TResult>
): StructuredToolInterface {
  // Wraps LangChain DynamicStructuredTool
  // Returns ToolResponse<T> discriminated union
}
```

**Limitations**:
- No async initialization
- No context object with abort/metadata
- ToolResponse adds complexity (LangChain catches errors anyway)
- No registry or dynamic loading

### Tools to Implement

Based on the target tool interface provided:

| Tool | Purpose | Exists? |
|------|---------|---------|
| bash | Execute shell commands with timeout/workdir | No |
| read | Read files with offset/limit | Partial (readFileTool) |
| write | Create/overwrite files | Partial (writeFileTool) |
| edit | Exact string replacements | Partial (applyTextEditTool) |
| list | List directory contents | Partial (listDirectoryTool) |
| glob | Fast file pattern matching | No (uses native glob in searchTextTool) |
| grep | Regex content search | Partial (searchTextTool) |
| webfetch | HTTP fetch with format conversion | No |
| task | Subagent delegation | No |
| todowrite | Task list management | No |
| todoread | Read task list | No |

## Archon Project

**Project ID**: `ad38c2be-b291-4c72-afb8-7ec6560b1455`

## Relevant Files

### Existing Files to Modify
- `src/tools/base.ts`: Replace with new Tool.define factory
- `src/tools/types.ts`: Simplify response types
- `src/tools/index.ts`: Update exports
- `src/tools/filesystem.ts`: Migrate to new pattern
- `src/tools/hello.ts`: Migrate reference implementation
- `src/agent/agent.ts`: Update tool binding to use registry

### New Files to Create
- `src/tools/tool.ts`: New Tool namespace with define(), Context, Info
- `src/tools/registry.ts`: Tool registry with loading and filtering
- `src/tools/bash.ts`: Shell command execution
- `src/tools/bash.txt`: Bash tool description
- `src/tools/read.ts`: File reading (refactored)
- `src/tools/read.txt`: Read tool description
- `src/tools/write.ts`: File writing (refactored)
- `src/tools/write.txt`: Write tool description
- `src/tools/edit.ts`: Text editing (refactored)
- `src/tools/edit.txt`: Edit tool description
- `src/tools/list.ts`: Directory listing (refactored)
- `src/tools/list.txt`: List tool description
- `src/tools/glob.ts`: File pattern matching
- `src/tools/glob.txt`: Glob tool description
- `src/tools/grep.ts`: Content search
- `src/tools/grep.txt`: Grep tool description
- `src/tools/webfetch.ts`: HTTP fetching
- `src/tools/webfetch.txt`: WebFetch tool description
- `src/tools/task.ts`: Subagent delegation
- `src/tools/task.txt`: Task tool description
- `src/tools/todo.ts`: Todo list management
- `src/tools/todowrite.txt`: TodoWrite tool description
- `src/tools/todoread.txt`: TodoRead tool description

### Files to Delete
- `src/tools/filesystem.ts`: Split into individual tool files

## Implementation Plan

### Phase 1: Core Infrastructure
Create the new tool interface, context types, and registry system.

### Phase 2: Description Files
Create `.txt` description files for all tools with appropriate content.

### Phase 3: Tool Migration
Migrate existing filesystem tools to individual files with new pattern.

### Phase 4: New Tools
Implement bash, glob, grep, webfetch, task, and todo tools.

### Phase 5: Agent Integration
Update agent to use registry and new tool binding.

### Phase 6: Testing & Cleanup
Comprehensive tests and removal of deprecated code.

## Step by Step Tasks

### Task 1: Create Tool Namespace and Types
- **Description**: Create `src/tools/tool.ts` with Tool namespace, Context, Info, and define()
- **Files**: Create `src/tools/tool.ts`
- **Details**:
  - Define `Tool.Context<M>` with sessionID, messageID, agent, abort, callID, extra, metadata()
  - Define `Tool.InitContext` with optional agent info
  - Define `Tool.Info<P, M>` with id and async init function
  - Define `Tool.Result` type: `{ title, metadata, output, attachments? }`
  - Implement `Tool.define()` factory with validation wrapper
  - Handle both sync and async init patterns

### Task 2: Create Tool Registry
- **Description**: Create `src/tools/registry.ts` with centralized tool management
- **Files**: Create `src/tools/registry.ts`
- **Details**:
  - Define `ToolRegistry` namespace with state management
  - Implement `all()` to get all registered tools
  - Implement `tools(providerID, agent?)` for initialized tools
  - Implement `enabled(agent)` for permission checking
  - Support future plugin loading (stub for now)

### Task 3: Create Bash Tool
- **Description**: Implement shell command execution tool
- **Files**: Create `src/tools/bash.ts`, `src/tools/bash.txt`
- **Details**:
  - Schema: command (string), description (string), timeout (number?), workdir (string?)
  - Execute shell commands with spawn/exec
  - Timeout enforcement (default 2 min, max 10 min)
  - Output truncation (max 30KB)
  - Working directory support
  - Abort signal handling
  - Metadata streaming for long-running commands

### Task 4: Create Read Tool
- **Description**: Implement file reading tool (refactor from filesystem.ts)
- **Files**: Create `src/tools/read.ts`, `src/tools/read.txt`
- **Details**:
  - Schema: filePath (string), offset (number?), limit (number?)
  - Line-numbered output format
  - Binary file detection
  - Image/PDF support with attachments
  - 2000 line default limit
  - Path validation and workspace checks

### Task 5: Create Write Tool
- **Description**: Implement file writing tool (refactor from filesystem.ts)
- **Files**: Create `src/tools/write.ts`, `src/tools/write.txt`
- **Details**:
  - Schema: filePath (string), content (string)
  - Create parent directories if needed
  - Permission checking
  - Path validation

### Task 6: Create Edit Tool
- **Description**: Implement text editing tool (refactor from filesystem.ts)
- **Files**: Create `src/tools/edit.ts`, `src/tools/edit.txt`
- **Details**:
  - Schema: filePath (string), oldString (string), newString (string), replaceAll (boolean?)
  - Exact string replacement
  - Diff generation in output
  - File locking consideration
  - Error on no match found

### Task 7: Create List Tool
- **Description**: Implement directory listing tool (refactor from filesystem.ts)
- **Files**: Create `src/tools/list.ts`, `src/tools/list.txt`
- **Details**:
  - Schema: path (string?), ignore (string[]?)
  - Tree-style output
  - Respect .gitignore patterns
  - Limit to reasonable depth/entries

### Task 8: Create Glob Tool
- **Description**: Implement file pattern matching tool
- **Files**: Create `src/tools/glob.ts`, `src/tools/glob.txt`
- **Details**:
  - Schema: pattern (string), path (string?)
  - Fast file discovery using Bun.Glob or fast-glob
  - Sort by modification time
  - Limit results (100 files)

### Task 9: Create Grep Tool
- **Description**: Implement content search tool
- **Files**: Create `src/tools/grep.ts`, `src/tools/grep.txt`
- **Details**:
  - Schema: pattern (string), path (string?), include (string?)
  - Regex pattern matching
  - File type filtering
  - Line numbers in output
  - Limit results

### Task 10: Create WebFetch Tool
- **Description**: Implement HTTP fetching tool
- **Files**: Create `src/tools/webfetch.ts`, `src/tools/webfetch.txt`
- **Details**:
  - Schema: url (string), format ("text" | "markdown" | "html"), timeout (number?)
  - Fetch with appropriate headers
  - HTML to markdown conversion
  - Size limits (5MB)
  - Timeout handling

### Task 11: Create Task Tool
- **Description**: Implement subagent delegation tool
- **Files**: Create `src/tools/task.ts`, `src/tools/task.txt`
- **Details**:
  - Schema: description (string), prompt (string), subagent_type (string), session_id (string?)
  - Session creation/continuation
  - Progress streaming via metadata
  - Abort handling
  - Tool filtering for subagents

### Task 12: Create Todo Tools
- **Description**: Implement task list management tools
- **Files**: Create `src/tools/todo.ts`, `src/tools/todowrite.txt`, `src/tools/todoread.txt`
- **Details**:
  - TodoWrite schema: todos array with id, content, status, priority
  - TodoRead: no parameters
  - Session-scoped state management
  - JSON output

### Task 13: Migrate Hello Tools
- **Description**: Update hello tools to new pattern as reference implementation
- **Files**: Modify `src/tools/hello.ts`, create `src/tools/hello.txt`
- **Details**:
  - Convert to Tool.define() pattern
  - Add description file
  - Update tests

### Task 14: Update Index Exports
- **Description**: Update `src/tools/index.ts` with new exports
- **Files**: Modify `src/tools/index.ts`
- **Details**:
  - Export Tool namespace
  - Export ToolRegistry
  - Export all individual tools
  - Maintain backward compatibility where possible

### Task 15: Update Agent Integration
- **Description**: Update agent to use tool registry
- **Files**: Modify `src/agent/agent.ts`
- **Details**:
  - Get tools from registry instead of constructor
  - Pass context to tool execution
  - Handle metadata streaming via callbacks
  - Support abort signals

### Task 16: Remove Deprecated Code
- **Description**: Remove old filesystem.ts and update imports
- **Files**: Delete `src/tools/filesystem.ts`, update all imports
- **Details**:
  - Remove monolithic filesystem.ts
  - Update any imports to use new individual tools
  - Clean up old types if no longer needed

### Task 17: Comprehensive Testing
- **Description**: Add/update tests for all tools
- **Files**: Update test files in `src/tools/__tests__/`
- **Details**:
  - Test each tool's happy path
  - Test error cases
  - Test metadata streaming
  - Test abort handling
  - Maintain 85% coverage

## Testing Strategy

### Unit Tests
- Each tool tested independently
- Mock file system operations
- Mock HTTP requests
- Mock subprocess execution
- Test metadata callback invocation
- Test abort signal handling

### Integration Tests
- Tool registry initialization
- Agent tool binding
- End-to-end tool execution flow

### Edge Cases
- Binary file detection
- Large file handling
- Timeout scenarios
- Permission denied cases
- Network failures
- Invalid inputs

## Acceptance Criteria

- [ ] `Tool.define()` factory creates tools with async initialization
- [ ] `Tool.Context` provides sessionID, abort signal, and metadata callback
- [ ] `ToolRegistry` manages all tools with permission filtering
- [ ] All 11 tools implemented: bash, read, write, edit, list, glob, grep, webfetch, task, todowrite, todoread
- [ ] External `.txt` description files for all tools
- [ ] Metadata streaming works via callbacks
- [ ] Abort signals respected by long-running tools
- [ ] Agent integrates with registry for tool binding
- [ ] All tests pass with 85%+ coverage
- [ ] All quality gates pass (typecheck, lint, test, build)

## Validation Commands

```bash
# Run all validation commands
bun run typecheck && bun run lint && bun run test && bun run build

# Run just the tools tests
bun run test src/tools

# Run with coverage
bun run test --coverage src/tools

# Test individual tool
bun run test src/tools/__tests__/bash.test.ts
```

## Notes

### Backward Compatibility
The old `createTool()` and `ToolResponse<T>` types can be deprecated but maintained temporarily for any external consumers. The new pattern is strictly better and should be the only one documented.

### LangChain Integration
Tools still bind to LangChain for the agent loop. The `Tool.Info` interface is converted to `StructuredToolInterface` when passed to the model. The registry handles this conversion.

### Description File Format
Description files use plain text with optional template variables:
- `${directory}` - Current working directory
- `${workspace}` - Workspace root

### Future Considerations
- Plugin tool loading from `~/.agent/tools/`
- Permission prompting via callbacks
- LSP integration for edit tool diagnostics
- Batch tool for parallel execution (experimental)

## Execution

This spec can be implemented using: `/sdlc:implement docs/specs/feature-tool-system-rewrite.md`
