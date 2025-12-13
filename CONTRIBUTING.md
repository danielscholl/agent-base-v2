# Contributing

Development guide for Agent Base v2 contributors.

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/danielscholl/agent-base-v2.git
cd agent-base-v2
bun install

# 2. Verify setup
bun run typecheck
bun run test

# 3. Build
bun run build
```

## AI-Assisted Development with Archon

When using AI coding assistants (Claude Code, Cursor, Windsurf, etc.) on this project, we recommend [Archon](https://github.com/coleam00/Archon) as a backing system for task management and knowledge sharing.

**What is Archon?**

Archon is an MCP (Model Context Protocol) server that provides:
- **Task Management**: Track project tasks with status (todo → doing → review → done)
- **Knowledge Base**: RAG-powered documentation search for your AI assistant
- **Project Organization**: Manage features, documents, and version history

**Setup:**

1. Clone and run Archon via Docker (see [Archon README](https://github.com/coleam00/Archon#readme))
2. Configure your AI coding assistant to connect to the Archon MCP server
3. Create a project for your feature work

**Usage with this project:**

```bash
# AI assistant commands (via MCP tools)
find_tasks(filter_by="status", filter_value="todo")  # Get pending tasks
manage_task("update", task_id="...", status="doing") # Start working
manage_task("update", task_id="...", status="done")  # Complete task
```

See [CLAUDE.md](CLAUDE.md) for detailed Archon workflow integration.

## Git Hooks (Automatic Quality Gates)

Git hooks are automatically installed when you run `bun install` (via Husky).

### Pre-commit Hook

Runs `lint-staged` on staged files before each commit:

| File Type | Checks |
|-----------|--------|
| `*.ts`, `*.tsx` | Prettier format + ESLint fix |
| `*.json`, `*.md` | Prettier format |

If any check fails, the commit is blocked until you fix the issues.

### Commit Message Hook

Enforces commit message standards:
- Blocks commits with `Co-Authored-By: Claude` in the footer
- Use `aipr` tool to generate commit messages (see Commit Convention below)

### Bypassing Hooks (Not Recommended)

```bash
# Skip pre-commit checks (emergency only)
git commit --no-verify -m "message"
```

## Development Workflow

### 1. Run Quality Checks Before Changes

```bash
# Run all quality checks (CI equivalent)
bun run typecheck && bun run lint && bun run test && bun run build
```

### 2. Make Your Changes

Follow the patterns in existing code and see [CLAUDE.md](CLAUDE.md) for architectural guidelines.

### 3. Run Quality Checks After Changes

```bash
# TypeScript type checking
bun run typecheck

# ESLint + Prettier
bun run lint

# Tests with coverage (85% minimum)
bun run test --coverage

# Build
bun run build
```

### 4. Commit and Push

```bash
# Use conventional commits format
git commit -m "feat(config): add new provider support"

# Push and create PR
git push origin feat/your-feature
```

## Testing

### Test Organization

Tests are co-located with source files in `__tests__` directories:

```
src/
├── config/
│   ├── manager.ts
│   ├── schema.ts
│   └── __tests__/
│       ├── manager.test.ts
│       └── schema.test.ts
```

Integration tests and shared fixtures are in `tests/`:

```
tests/
├── integration/
└── fixtures/
```

### Common Test Commands

```bash
# Run all tests
bun run test

# Run with coverage report
bun run test --coverage

# Run specific module tests
bun run test src/config

# Run single test file
bun run test src/config/__tests__/manager.test.ts

# Run tests matching pattern
bun run test --testNamePattern="should load"

# Watch mode for development
bun run test --watch
```

### Writing Tests

Use dependency injection for testability:

```typescript
// Create mock implementations
class MockFileSystem implements IFileSystem {
  private files: Map<string, string> = new Map();

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return content;
  }

  // Test helper
  setFile(path: string, content: string): void {
    this.files.set(path, content);
  }
}

// Use in tests
describe('ConfigManager', () => {
  let mockFs: MockFileSystem;
  let manager: ConfigManager;

  beforeEach(() => {
    mockFs = new MockFileSystem();
    manager = new ConfigManager({ fileSystem: mockFs });
  });

  it('should load config from file', async () => {
    mockFs.setFile('/path/config.json', JSON.stringify({ version: '1.0' }));
    const result = await manager.load();
    expect(result.success).toBe(true);
  });
});
```

**Key testing patterns:**
- Mock all external dependencies (filesystem, environment, LLM providers)
- Never make real API calls in tests
- Use factory functions for test objects
- Clear mocks in `beforeEach` for test isolation

### Coverage Requirements

- **Minimum:** 85% overall coverage (enforced by CI)
- **View report:** `bun run test --coverage` displays coverage table
- **HTML report:** Configure Jest for `html` reporter if needed

## Code Style

### TypeScript

**Strict mode required** - no `any` types without explicit justification:

```typescript
// GOOD - Explicit types
function processConfig(config: AppConfig): ConfigResponse<void> {
  // ...
}

// BAD - Implicit any
function processConfig(config) {  // Error: implicit any
  // ...
}
```

**Use Zod for validation with inferred types:**

```typescript
// Define schema
export const MyConfigSchema = z.object({
  name: z.string(),
  enabled: z.boolean().default(false),
});

// Infer type from schema (don't duplicate)
export type MyConfig = z.infer<typeof MyConfigSchema>;
```

### Structured Responses

All tools return structured responses:

```typescript
// Success
return {
  success: true,
  result: data,
  message: 'Operation completed'
};

// Error
return {
  success: false,
  error: 'INVALID_INPUT',
  message: 'Input validation failed'
};
```

### Tool Docstrings

Keep tool descriptions concise for LLM consumption:

```typescript
// GOOD - Simple tool (10-20 tokens)
/**
 * Say hello to someone. Returns greeting message.
 */

// GOOD - Complex tool (25-40 tokens)
/**
 * Read config file with hierarchical merging.
 * Sources: defaults < user < project < env.
 */

// BAD - Verbose (100+ tokens)
/**
 * Read configuration file from the filesystem.
 *
 * This function reads a JSON configuration file and parses it
 * into the appropriate configuration object. It supports...
 * [50 more lines]
 */
```

**What to include:**
- What the tool does (first sentence)
- Critical constraints
- Key defaults

**What to exclude:**
- Code examples
- Complete response format structures
- Multi-line Args/Returns sections

### Line Length

100 characters (enforced by Prettier)

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `refactor` - Code refactoring
- `test` - Tests
- `chore` - Maintenance
- `ci` - CI/CD changes

**Scopes:** `agent`, `tools`, `skills`, `config`, `cli`, `model`, `utils`, `tests`

### Using `aipr` for Commit Messages (Recommended)

This project uses `aipr` (AI Pull Request) to generate commit messages and PR descriptions.

**Install from PyPI:**

```bash
# Install globally with pip
pip install aipr

# Or with pipx (recommended for CLI tools)
pipx install aipr
```

**PyPI:** https://pypi.org/project/aipr/

**Usage:**

```bash
# Generate commit message from staged changes
git commit -m "$(aipr commit -s)"

# Generate PR description
gh pr create --title "feat: add new feature" --body "$(aipr pr -s)"
```

The commit-msg hook blocks manually-added `Co-Authored-By: Claude` footers to encourage using `aipr`.

### Manual Commit Examples

```bash
git commit -m "feat(config): add Azure Foundry provider support"
git commit -m "fix(agent): handle empty tool list gracefully"
git commit -m "test(config): add env validation tests"
```

## Pull Request Process

1. **Create branch:** `git checkout -b feat/your-feature`
2. **Make changes** following code style
3. **Run quality checks:**
   ```bash
   bun run typecheck && bun run lint && bun run test && bun run build
   ```
4. **Commit** using conventional format
5. **Push:** `git push origin feat/your-feature`
6. **Create PR** with clear description

**PR Requirements:**
- All CI checks pass (typecheck, lint, test, build)
- Coverage ≥ 85%
- Type annotations on all public functions
- JSDoc for public classes and complex functions
- Conventional commit format

## Architecture Decisions

For significant architectural changes, document decisions in `docs/decisions/`:

**When to create an ADR:**
- Adding new architectural patterns
- Choosing between design alternatives
- Making technology/library selections
- Changing core system behaviors

**Process:**

```bash
# 1. Copy template
cp docs/decisions/adr-template.md docs/decisions/NNNN-your-decision.md

# 2. Fill in sections:
#    - Context and Problem Statement
#    - Decision Drivers
#    - Considered Options
#    - Decision Outcome
#    - Consequences

# 3. Commit with decision
git commit -m "docs(adr): add ADR for [decision topic]"
```

See existing ADRs in `docs/decisions/` for examples.

## Tech Stack Reference

| Component | Technology | Notes |
|-----------|------------|-------|
| Language | TypeScript 5.x | Strict mode required |
| Runtime | Bun 1.x | Development and runtime |
| UI Framework | React 19 + Ink 6 | Terminal UI rendering |
| LLM Integration | LangChain.js 1.x | Multi-provider abstraction |
| Schema Validation | Zod 3.x | Runtime validation + type inference |
| Observability | OpenTelemetry | OTLP export |
| Testing | Jest + ts-jest | Run via `bun run test` |
| Linting | ESLint + Prettier | Consistent code style |

## License

By contributing, you agree your contributions will be licensed under the MIT License.
