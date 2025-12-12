# Feature: Initialize Bun + TypeScript Workspace

## Feature Description
Create the foundational project structure for the TypeScript agent framework. This includes initializing a Bun project with strict TypeScript, setting up module resolution, and adding baseline tooling (Jest/ts-jest, ESLint, Prettier). The folder layout mirrors the final architecture so later feature ports land in stable locations. A minimal `index.tsx` boots an Ink app to validate the setup.

## User Story
As a developer
I want to have a properly configured Bun + TypeScript workspace
So that I can begin implementing the agent framework features in a consistent, type-safe environment

## Problem Statement
The repository currently contains only documentation (CLAUDE.md, architecture docs, ADRs, plans). There is no source code, no `package.json`, no TypeScript configuration, and no testing infrastructure. Without this foundation, no features can be implemented.

## Solution Statement
Create a complete project scaffold that:
1. Initializes Bun with all required dependencies
2. Enables strict TypeScript with proper module resolution for React/Ink
3. Configures Jest via ts-jest (NOT Bun's native test runner per ADR-0006)
4. Sets up ESLint and Prettier for code quality
5. Creates the full `src/` directory structure matching the architecture plan
6. Provides a minimal Ink app to verify the setup works

## Related Documentation

### Requirements
- `docs/plans/typescript-rewrite.md` - Phase 1a foundation requirements
- `docs/plans/typescript-rewrite-features.md` - Feature 1 specification

### Architecture Decisions
- `docs/decisions/0003-runtime-bun.md` - Why Bun is the runtime
- `docs/decisions/0004-validation-zod.md` - Zod 4.x for validation
- `docs/decisions/0005-terminal-ui-react-ink.md` - React 19 + Ink 6 for UI
- `docs/decisions/0006-testing-jest.md` - Jest over Bun's native test runner

## Codebase Analysis Findings
- **Current state**: Documentation-only project with NO source code
- **Architecture patterns**: Layered architecture (CLI → Agent → Tools/Model → Utils)
- **Naming conventions**: camelCase for config/variables, PascalCase for components/classes
- **Testing approach**: Co-located tests in `src/**/__tests__/`, Jest with ts-jest
- **Config directory**: `.agent/` (matches Python for migration compatibility)

## Relevant Files

### Existing Files
- `CLAUDE.md`: Governance and coding standards (must follow)
- `docs/architecture.md`: Target folder structure and patterns
- `docs/plans/typescript-rewrite.md`: Dependency versions and phase breakdown
- `.gitignore`: Already configured for TypeScript/Node projects

### New Files
- `package.json`: Bun project manifest with all dependencies
- `tsconfig.json`: Strict TypeScript configuration
- `jest.config.js`: Jest with ts-jest preset
- `.eslintrc.js`: ESLint configuration for TypeScript/React
- `.prettierrc.js`: Code formatting rules
- `src/index.tsx`: Minimal Ink app entry point

## Implementation Plan

### Phase 1: Project Configuration Files
Create all configuration files needed to establish the workspace.

### Phase 2: Directory Structure
Create the full `src/` directory structure with placeholder files.

### Phase 3: Minimal Bootstrap
Create a minimal Ink app that validates the setup.

### Phase 4: Verification
Run all quality gates to confirm the setup works.

## Step by Step Tasks

### Task 1: Create package.json
- Description: Initialize Bun project with all dependencies from the tech stack
- Files to create: `package.json`
- Dependencies include:
  - **Runtime**: react@19, ink@6, zod@^3.24 (latest stable for Zod 4.x line)
  - **LLM**: @langchain/core, @langchain/openai (initially)
  - **Telemetry**: @opentelemetry/api, @opentelemetry/sdk-node
  - **Utils**: dotenv, meow
  - **Dev**: typescript@5.x, @types/react, jest, ts-jest, eslint, prettier

### Task 2: Create tsconfig.json
- Description: Configure strict TypeScript with JSX support for Ink
- Files to create: `tsconfig.json`
- Key settings:
  - `strict: true` (CRITICAL per CLAUDE.md)
  - `jsx: "react"` for Ink components
  - `moduleResolution: "bundler"` for Bun compatibility
  - `target: "ES2022"` for modern JavaScript features

### Task 3: Create jest.config.js
- Description: Configure Jest with ts-jest preset
- Files to create: `jest.config.js`
- Key settings:
  - `preset: 'ts-jest'`
  - `testEnvironment: 'node'`
  - Test roots: `src/` and `tests/`
  - Coverage threshold: 85%

### Task 4: Create ESLint configuration
- Description: Set up ESLint for TypeScript and React
- Files to create: `.eslintrc.js`
- Key settings:
  - TypeScript parser
  - React plugin for Ink components
  - Strict rules per CLAUDE.md

### Task 5: Create Prettier configuration
- Description: Set up consistent code formatting
- Files to create: `.prettierrc.js`
- Key settings:
  - Single quotes
  - No semicolons (or with - team preference)
  - 100 character line width

### Task 6: Create src/ directory structure
- Description: Create all directories matching the architecture plan
- Directories to create:
  ```
  src/
  ├── agent/
  │   └── __tests__/
  ├── model/
  │   ├── providers/
  │   └── __tests__/
  ├── config/
  │   ├── providers/
  │   └── __tests__/
  ├── tools/
  │   └── __tests__/
  ├── skills/
  │   └── __tests__/
  ├── utils/
  │   └── __tests__/
  ├── components/
  ├── telemetry/
  ├── errors/
  ├── commands/
  └── _bundled_skills/
  tests/
  ├── integration/
  └── fixtures/
  ```

### Task 7: Create minimal src/index.tsx
- Description: Create a minimal Ink app that renders "Hello World"
- Files to create: `src/index.tsx`
- Requirements:
  - Import React and Ink
  - Render a simple Text component
  - Exit cleanly

### Task 8: Install dependencies
- Description: Run `bun install` to install all packages
- Command: `bun install`

### Task 9: Add npm scripts to package.json
- Description: Ensure all required scripts are defined
- Scripts:
  - `typecheck`: `tsc --noEmit`
  - `lint`: `eslint src/`
  - `format`: `prettier --write src/`
  - `test`: `jest`
  - `build`: `bun build src/index.tsx --outdir dist`
  - `dev`: `bun run src/index.tsx`

### Task 10: Verify setup
- Description: Run all quality gates to confirm setup works
- Commands:
  - `bun run typecheck` - should pass
  - `bun run lint` - should pass
  - `bun run test` - should pass (no tests is OK)
  - `bun run dev` - should boot Ink app and display "Hello World"

## Testing Strategy

### Unit Tests
- No unit tests required for this feature (infrastructure only)
- Test infrastructure is validated by running `bun run test` successfully

### Integration Tests
- Verify `bun run dev` starts the Ink app
- Verify all npm scripts execute without errors

### Edge Cases
- TypeScript strict mode catches common errors
- ESLint catches code quality issues
- Jest configuration handles TypeScript correctly

## Acceptance Criteria
- [ ] `package.json` exists with all required dependencies
- [ ] `tsconfig.json` has strict mode enabled
- [ ] `jest.config.js` is configured with ts-jest
- [ ] ESLint and Prettier configurations exist
- [ ] All `src/` directories exist matching architecture plan
- [ ] `src/index.tsx` exists and renders a minimal Ink app
- [ ] `bun install` completes successfully
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run test` passes (even with no tests)
- [ ] `bun run dev` boots the Ink app and displays output

## Validation Commands
```bash
# Install dependencies
bun install

# Run type checking (TypeScript strict mode)
bun run typecheck

# Run linting
bun run lint

# Run tests (should pass with no tests)
bun run test

# Boot the minimal Ink app
bun run dev
```

## Notes
- This is a greenfield project - all files are new
- The `.gitignore` already exists and is properly configured
- Use Zod 3.24.x (the latest stable version) - Zod 4.x stable hasn't been released yet
- React 19 is the target version per the tech stack
- Ink 6 is required for React 19 compatibility
- Jest is used over Bun's native test runner per ADR-0006
- The config directory is `.agent/` to match Python for migration compatibility

## Execution
This spec can be implemented using: `/implement docs/specs/feature-001-bun-typescript-workspace.md`
