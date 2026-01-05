# Permissions Architecture

> **Status:** Partial Implementation
> **Source of truth:** [`src/tools/registry.ts`](../../src/tools/registry.ts), [`src/tools/index.ts`](../../src/tools/index.ts)

This document describes the permission model used to control tool capabilities.

---

## Overview

The permission system provides:

- **Permission-based tool filtering** at registry level
- **Four permission types** for different operation categories
- **Registration-time declaration** of required permissions

> **Note:** The following features are **planned but not yet implemented**:
> - Hierarchical settings (project -> user -> interactive)
> - Config-driven permission rules
> - Callback-based prompting for user approval
> - Sensitive path protection

---

## Current Implementation

### Permission Types

| Permission | Description | Example Tools |
|------------|-------------|---------------|
| `read` | Read files and directories | read, list, glob, grep, todoread, todowrite |
| `write` | Create or modify files | write, edit |
| `execute` | Run shell commands or subprocesses | bash, task |
| `network` | Make network requests | webfetch |

### Permission Declaration

Tools declare required permissions during registration in `src/tools/index.ts`:

```typescript
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
```

### Permission Filtering

The `ToolRegistry.tools()` method accepts an `enabledPermissions` filter:

```typescript
// Get only tools that require 'read' permission
const readTools = await ToolRegistry.tools({
  initCtx: { workingDir: '/project' },
  createContext: (toolId, callId) => myContext,
  enabledPermissions: new Set(['read']),
});

// Get all tools (no permission filtering)
const allTools = await ToolRegistry.tools({
  initCtx: { workingDir: '/project' },
  createContext: (toolId, callId) => myContext,
});
```

### ToolPermissions Interface

```typescript
type ToolPermission = 'read' | 'write' | 'execute' | 'network';

interface ToolPermissions {
  /** Permissions that must all be granted */
  required: ToolPermission[];
  /** Optional permissions that enhance capability if available */
  optional?: ToolPermission[];
}
```

---

## Built-in Tool Permissions

| Tool | Required Permissions | Description |
|------|---------------------|-------------|
| `read` | `read` | Read file contents |
| `write` | `write` | Create or overwrite files |
| `edit` | `write` | In-place file editing |
| `list` | `read` | Directory listing |
| `bash` | `execute` | Shell command execution |
| `glob` | `read` | File pattern matching |
| `grep` | `read` | Content searching |
| `webfetch` | `network` | URL fetching |
| `task` | `execute` | Subagent spawning (planned) |
| `todowrite` | `read` | Write task list |
| `todoread` | `read` | Read task list |

---

## Planned Features

The following features are documented for future implementation:

### Hierarchical Permission Settings (Planned)

```
Tool requests permission --> Check settings hierarchy
                                   |
                  +----------------+----------------+
                  v                v                v
            Project rules     User rules      Interactive
            (committed)       (personal)       prompt
                  |                |              |
                  +----------------+--------------+
                                   |
                                   v
                              Allow / Deny
```

### Config-Based Permissions (Planned)

Project settings (`./.agent/config.yaml`):

```yaml
permissions:
  read: true
  write: false
  execute: false
```

User settings (`~/.agent/config.yaml`):

```yaml
permissions:
  write: true
  trusted-paths:
    - /home/user/projects/*
```

### Sensitive Path Protection (Planned)

Paths that would require explicit per-session approval:

| Path Pattern | Content |
|--------------|---------|
| `~/.ssh/*` | SSH keys and config |
| `~/.gnupg/*` | GPG keys |
| `.env*` | Environment files |
| `*credentials*` | Credential files |
| `*secret*` | Secret files |
| OS keychains | System credential stores |

### Permission Callback Flow (Planned)

```
Tool.execute(input)
       |
       v
callbacks.onPermissionRequest({
  scope: 'write',
  resource: '/path/to/file',
  action: 'write file'
})
       |
       v
+------+------+
|   Allowed?  |
+------+------+
       |
  +----+----+
  v         v
true      false
  |         |
  v         v
Proceed   Return Permission Denied
```

---

## Adding Permissions to a New Tool

1. **Declare permissions in registration** (`src/tools/index.ts`):

```typescript
const toolPermissions: Record<string, ToolPermissions> = {
  // ... existing
  mytool: { required: ['read', 'network'] },
};
```

2. **Register with permissions**:

```typescript
ToolRegistry.register(myTool, {
  permissions: toolPermissions.mytool,
  descriptionPath: 'src/tools/mytool.txt',
});
```

---

## Related Documentation

- [Tools Architecture](./tools.md) - Tool system and registry
- [Configuration](./configuration.md) - Permission settings (planned)
