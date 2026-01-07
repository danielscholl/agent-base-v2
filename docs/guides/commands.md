# Custom Commands Guide

This guide covers the custom slash command system and how to create your own commands.

---

## Design Philosophy

Custom commands extend the agent with reusable prompts that execute in response to `/command` invocations. Commands follow a **source priority** model—from bundled defaults up to project-specific overrides.

**Important:** Built-in CLI commands (`/help`, `/exit`, `/clear`, `/save`, `/resume`, `/telemetry`) cannot be overridden by custom commands. The source priority applies only to custom commands:

```
┌─────────────────────────────────────────────────────────────────┐
│                     SOURCE PRIORITY                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   LOWEST ────────────────────────────────────────► HIGHEST      │
│                                                                 │
│   Bundled         User               Project                    │
│   Commands    →   Commands       →   Commands                   │
│                                                                 │
│   src/_bundled_commands/  ~/.agent/   .agent/commands/          │
│                           commands/                             │
│                                                                 │
│   "Built-in       "Personal          "Project-specific          │
│    defaults"       workflows"         conventions"              │
└─────────────────────────────────────────────────────────────────┘
```

### Why Source Priority?

| Problem | Solution |
|---------|----------|
| Teams need shared commands | Project commands in `.agent/commands/` are version-controlled |
| Users have personal workflows | User commands in `~/.agent/commands/` work across projects |
| Framework needs extensible defaults | Bundled commands ship with the agent |
| Name conflicts need predictable resolution | Later source wins (project > user > bundled) |
| Safety and consistency for CLI operations | Built-in commands (`/help`, `/exit`, etc.) are protected and cannot be overridden |

### Mental Model

Think of command discovery as **layered override** with protected built-ins:

1. **Built-in CLI** commands are checked first and cannot be overridden (`/help`, `/exit`, `/clear`, `/save`, `/resume`, `/telemetry`)
2. **Custom commands** follow source priority:
   - **Bundled** commands ship with the agent (e.g., `/prime`)
   - **User** commands are personal shortcuts that work anywhere
   - **Project** commands are team-shared workflows for a specific repository

When custom commands share a name, later sources **replace** earlier ones—project commands override user commands, which override bundled commands. Built-in CLI commands are never replaced.

---

## Layer Reference

| Layer | Location | Autocomplete | Purpose |
|-------|----------|--------------|---------|
| **Bundled** | `src/_bundled_commands/*.md` | `(bundled)` | Framework defaults |
| **User** | `~/.agent/commands/*.md` | `(user)` | Personal workflows |
| **Project** | `.agent/commands/*.md` | `(project)` | Team-shared commands |

**Note:** Bundled commands do not appear in `/help`—they're discovered through autocomplete with a `(bundled)` suffix.

---

## File Structure

```
~/.agent/commands/           # User commands (global)
├── review.md               # Personal code review workflow
├── morning.md              # Daily standup prep
└── deploy.md               # Deployment checklist

{project}/.agent/commands/   # Project commands (version-controlled)
├── test.md                 # Project-specific test runner
├── db/                     # Namespaced commands
│   └── migrate.md          # Database migration workflow
└── deploy.md               # Overrides user deploy.md

src/_bundled_commands/       # Bundled commands (framework)
└── prime.md                 # Codebase exploration
```

**Namespace support:** Subdirectories create namespaced commands. A file at `.agent/commands/db/migrate.md` becomes `/db:migrate`.

---

## YAML Front Matter

Commands use YAML front matter for metadata. The body after the front matter is the prompt template.

```markdown
---
name: deploy
description: Deploy application to staging environment
args: "<environment> [flags]"
required_args: ["arg0"]
examples:
  - "/deploy staging"
  - "/deploy production --dry-run"
---

Deploy the application to the $1 environment.

Run the following steps:
1. Verify environment is valid
2. Run pre-deployment checks
3. Execute deployment
```

### Front Matter Fields

| Field | Type | Functional | Description |
|-------|------|------------|-------------|
| `name` | string | No | Ignored—command name always comes from filename |
| `description` | string | **Yes** | Brief description shown in autocomplete |
| `argument-hint` | string | **Yes** | Usage hint shown when command is selected |
| `args` | string | **Yes** | Alternative to `argument-hint` |
| `required_args` | string[] | No | Documentation only (no validation) |
| `examples` | string[] | No | Documentation only |
| `model` | string | No | Reserved for future use |
| `allowed-tools` | string | No | Reserved for future use |

**Functional fields:**
- `description` — Appears in autocomplete dropdown
- `argument-hint` or `args` — Shown as "Usage: /command [hint]" when the command is selected or exactly matched in autocomplete

**Documentation-only fields:**
- `name`, `required_args`, `examples` — Stored but not currently used functionally

---

## Argument Substitution

Commands support multiple placeholder syntaxes for arguments:

| Placeholder | Description | Example Input | Example Output |
|-------------|-------------|---------------|----------------|
| `$ARGUMENTS` | All arguments as raw string | `/cmd foo bar` | `foo bar` |
| `$1`, `$2`...`$9` | Positional arguments | `/cmd foo bar` | `foo`, `bar` |
| `{{arg0}}`, `{{arg1}}` | Zero-indexed positional | `/cmd foo bar` | `foo`, `bar` |
| `{{repos_root}}` | Workspace root path | - | `/Users/dev/project` |

### Example: Positional Arguments

```markdown
---
name: review
description: Review changes in a specific file
args: "<filepath>"
---

Review the code in $1 and provide feedback on:
- Code quality
- Potential bugs
- Performance concerns
```

Usage: `/review src/main.ts`

### Example: Multiple Arguments

```markdown
---
name: compare
description: Compare two files
args: "<file1> <file2>"
required_args: ["arg0", "arg1"]
---

Compare the implementations in these two files:
- File 1: $1
- File 2: $2

Highlight key differences and suggest which approach is better.
```

Usage: `/compare src/old.ts src/new.ts`

### Quoted Arguments

Arguments can include spaces when quoted:

```bash
/deploy "my project" staging
# $1 = "my project"
# $2 = "staging"
```

---

## File References

Commands can embed file contents using `@filepath` syntax:

```markdown
---
name: explain
description: Explain a file's purpose
args: "<filepath>"
---

Read and explain this code:

@$1

Focus on:
- Overall architecture
- Key functions
- Dependencies
```

### File Reference Behavior

| Scenario | Result |
|----------|--------|
| File exists | Contents inserted inline |
| File not found | `[File not found: path]` placeholder |
| File > 100KB | `[File too large: path (size > 100KB)]` placeholder |
| Trailing punctuation | Stripped automatically (e.g., `@README.` → `@README`) |

### Path Resolution

- **Relative paths**: Resolved from workspace root
- **Absolute paths**: Used as-is
- **Windows paths**: Supported (`@C:\path\file.ts`)

### Example: Dynamic File Inclusion

```markdown
---
name: audit
description: Security audit for a component
args: "<component-path>"
---

Perform a security audit on this component:

@$1

Check for:
- Injection vulnerabilities
- Authentication issues
- Data exposure risks

Reference the project security guidelines:
@.agent/security-guidelines.md
```

---

## Bash Context

Commands can execute shell commands and embed output using `` !`command` `` syntax:

```markdown
---
name: status
description: Project status overview
---

## Current Status

### Git Branch
!`git branch --show-current`

### Recent Commits
!`git log --oneline -5`

### Uncommitted Changes
!`git status --short`

Summarize the current project state based on the above.
```

### Bash Context Behavior

| Scenario | Result |
|----------|--------|
| Command succeeds | stdout inserted inline |
| Command fails | `[Command failed: error message]` placeholder |
| Command times out | `[Command timed out after 5000ms]` placeholder |

### Security Considerations

- Commands run in the workspace directory
- Default timeout: 5 seconds
- Use for read-only operations (git status, file listings)
- Avoid commands that modify state or require user input

### Example: Dynamic Context

```markdown
---
name: deps
description: Analyze project dependencies
---

## Dependency Analysis

### Installed Packages
!`npm ls --depth=0 2>/dev/null || pip list 2>/dev/null || echo "No package manager found"`

### Outdated Dependencies
!`npm outdated 2>/dev/null || pip list --outdated 2>/dev/null || echo "Unable to check"`

Review the dependencies above and identify:
1. Security concerns
2. Major version updates available
3. Unused dependencies
```

---

## Best Practices

### Keep Prompts Focused

Each command should do one thing well:

```markdown
# Good: Single purpose
---
name: review-types
description: Review TypeScript types
---
Review the type definitions and suggest improvements for type safety.

# Avoid: Multiple unrelated tasks
---
name: review-all
description: Review everything
---
Review types, tests, docs, performance, security, accessibility...
```

### Use Descriptive Names

Names should indicate what the command does:

```markdown
# Good
/review-pr
/run-tests
/check-deps

# Avoid
/r
/do-stuff
/cmd1
```

### Provide Examples

Help users understand how to use your command:

```markdown
---
name: migrate
description: Generate database migration
args: "<migration-name>"
examples:
  - "/migrate add-users-table"
  - "/migrate update-posts-schema"
---
```

### Handle Missing Arguments Gracefully

Design prompts to work with or without optional arguments:

```markdown
---
name: test
description: Run tests
args: "[pattern]"
---

Run tests for this project.

$1

If a pattern was provided above, focus on matching tests.
Otherwise, run the full test suite.
```

### Document Project Commands

For team-shared commands, add comments explaining the workflow:

```markdown
---
name: release
description: Prepare a release
args: "<version>"
required_args: ["arg0"]
examples:
  - "/release 1.2.0"
---

<!--
  Team workflow: This command guides the release process.
  Requires: main branch, clean working tree, passing tests.
  See CONTRIBUTING.md for full release checklist.
-->

Prepare release version $1:

1. Verify we're on main branch
2. Check for uncommitted changes
3. Update version in package.json
4. Generate changelog entry
5. Create release commit and tag
```

---

## Command Discovery

Commands are discovered at shell startup and cached for performance. To see available commands:

1. **Type `/` and press Tab** - Shows autocomplete suggestions
2. **Built-in commands** - Appear in `/help`
3. **Custom commands** - Show with source suffix: `(bundled)`, `(user)`, `(project)`

### Cache Behavior

- Commands are scanned on shell startup
- File changes during a session require restart to detect
- Invalid commands (parse errors) are silently skipped

### Debugging Discovery

If a command isn't appearing:

1. Check the file location matches expected paths
2. Verify YAML front matter is valid
3. Ensure the file has `.md` extension
4. Check for filename conflicts with higher-priority sources
