# Permissions Architecture

This document describes the permission model used to control tool capabilities.

---

## Overview

The permission system provides:

- **Scope-based access control** for tool operations
- **Hierarchical settings** (project → user → interactive)
- **Sensitive path protection** regardless of general permissions
- **Callback-based prompting** for user approval

---

## Permission Model

```
┌─────────────────────────────────────────────────────────┐
│                    Permission Check                      │
│                                                          │
│  Tool requests permission ──► Check settings hierarchy   │
│                                      │                   │
│                    ┌─────────────────┼─────────────────┐ │
│                    ▼                 ▼                 ▼ │
│              Project rules     User rules      Interactive│
│              (committed)       (personal)       prompt    │
│                    │                 │              │     │
│                    └─────────────────┴──────────────┘     │
│                                      │                    │
│                                      ▼                    │
│                              Allow / Deny                 │
└─────────────────────────────────────────────────────────┘
```

---

## Permission Scopes

| Scope | Description | Default |
|-------|-------------|---------|
| `fs-read` | Read files in working directory | Allowed within project |
| `fs-write` | Create/modify files | Denied |
| `fs-delete` | Delete files | Denied |
| `shell-run` | Execute shell commands | Denied |

---

## Sensitive Paths

Regardless of `fs-read` permissions, these paths require explicit per-session approval:

| Path Pattern | Content |
|--------------|---------|
| `~/.ssh/*` | SSH keys and config |
| `~/.gnupg/*` | GPG keys |
| `.env*` | Environment files |
| `*credentials*` | Credential files |
| `*secret*` | Secret files |
| OS keychains | System credential stores |

---

## Permission Callback Flow

```
Tool.execute(input)
       │
       ▼
callbacks.onPermissionRequest({
  scope: 'fs-write',
  resource: '/path/to/file',
  action: 'write file'
})
       │
       ▼
┌──────┴──────┐
│   Allowed?  │
└──────┬──────┘
       │
  ┌────┴────┐
  ▼         ▼
true      false
  │         │
  ▼         ▼
Proceed   Return Permission Denied
```

---

## Tool Permission Declaration

Tools declare their required permissions during registration:

```typescript
ToolRegistry.register(writeTool, {
  permissions: {
    required: ['write'],      // Must have all
    optional: ['execute'],    // Enhanced if available
  },
});
```

---

## Permission Checking in Tools

```typescript
execute: async (input, config) => {
  const callbacks = config?.callbacks;

  const permitted = await callbacks?.onPermissionRequest?.({
    scope: 'fs-write',
    resource: input.path,
    action: 'write file',
  });

  if (!permitted) {
    return {
      title: 'Permission Denied',
      metadata: {},
      output: `Write permission denied for ${input.path}`,
    };
  }

  // Proceed with operation
}
```

---

## Permission Configuration

### Project Settings (`./.agent/config.yaml`)

```json
{
  "permissions": {
    "fs-read": true,
    "fs-write": false,
    "shell-run": false
  }
}
```

### User Settings (`~/.agent/config.yaml`)

```json
{
  "permissions": {
    "fs-write": true,
    "trusted-paths": ["/home/user/projects/*"]
  }
}
```

---

## Related Documentation

- [Tools Architecture](./tools.md) - Tool permission integration
- [Configuration](./configuration.md) - Permission settings
