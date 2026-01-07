# Contributing

Development guide for Agent Harness contributors.

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/danielscholl/ai-harness.git
cd ai-harness
bun install

# 2. Verify setup
bun run typecheck && bun run test

# 3. Build
bun run build
```

## Development Workflow

### 1. Run Tests Before Changes

```bash
# Run all quality checks (CI equivalent)
bun run typecheck && bun run lint && bun run test
```

### 2. Make Your Changes

Follow the patterns in existing code and see [CLAUDE.md](CLAUDE.md) for architectural guidelines.

### 3. Run Tests After Changes

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
│   └── __tests__/
│       └── manager.test.ts
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

# Watch mode for development
bun run test --watch
```

### Writing Tests

Use dependency injection for testability:

```typescript
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
- **View report:** `bun run test --coverage`

## Code Style

**Type hints required** for all public APIs:

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
export const MyConfigSchema = z.object({
  name: z.string(),
  enabled: z.boolean().default(false),
});

export type MyConfig = z.infer<typeof MyConfigSchema>;
```

**Structured responses** for all tools:

```typescript
// Success
return { success: true, result: data, message: 'Operation completed' };

// Error
return { success: false, error: 'INVALID_INPUT', message: 'Validation failed' };
```

**Tool docstrings** should be concise for LLM consumption:

```typescript
// GOOD - Simple tool (10-20 tokens)
/** Say hello to someone. Returns greeting message. */

// GOOD - Complex tool (25-40 tokens)
/** Read config file with hierarchical merging. Sources: defaults < user < project < env. */

// BAD - Verbose (100+ tokens)
/** Read configuration file from the filesystem... [50 more lines] */
```

**Line length:** 100 characters (enforced by Prettier)

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`

**Scopes:** `agent`, `tools`, `skills`, `config`, `cli`, `model`, `utils`, `tests`

**Examples:**
```bash
git commit -m "feat(config): add Azure Foundry provider support"
git commit -m "fix(agent): handle empty tool list gracefully"
git commit -m "test(config): add env validation tests"
```

## Pull Request Process

1. **Create branch:** `git checkout -b feat/your-feature`
2. **Make changes** following code style
3. **Run quality checks** (see above)
4. **Commit** using conventional format
5. **Push:** `git push origin feat/your-feature`
6. **Create PR** with clear description

**PR Requirements:**
- All CI checks pass (typecheck, lint, test, build)
- Coverage >= 85%
- Type annotations on all public functions
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

# 2. Fill in sections and commit
git commit -m "docs(adr): add ADR for [decision topic]"
```

See existing ADRs in `docs/decisions/` for examples.

## Releases

Releases use [release-please](https://github.com/googleapis/release-please):
- `feat:` -> minor version bump
- `fix:` -> patch version bump
- `BREAKING CHANGE:` -> major version bump

Merging the release PR automatically creates a GitHub release.

## License

By contributing, you agree your contributions will be licensed under the MIT License.
