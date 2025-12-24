# Feature: GitLab CLI (glab) Bundled Skill

## Feature Description

Add a bundled skill that provides expert guidance for using the GitLab CLI (glab) to manage GitLab issues, merge requests, CI/CD pipelines, repositories, and other GitLab operations from the command line. This skill enables the agent to assist users with GitLab workflows by providing contextual documentation, command examples, and troubleshooting guidance.

## User Story

As a developer using GitLab
I want the agent to provide expert guidance on glab CLI commands
So that I can efficiently manage merge requests, issues, pipelines, and repositories from the terminal

## Problem Statement

Developers working with GitLab need to perform various operations like creating merge requests, managing issues, monitoring CI/CD pipelines, and interacting with repositories. While glab provides comprehensive CLI functionality, remembering command syntax, flags, and best practices can be challenging. Users need contextual, on-demand guidance that adapts to their current task.

## Solution Statement

Create a bundled skill at `src/_bundled_skills/glab/` that:
1. Provides a `SKILL.md` manifest with comprehensive glab guidance
2. Includes reference documentation for detailed commands, quick reference, and troubleshooting
3. Leverages the existing skills system for progressive disclosure
4. Works with the Bash tool for executing glab commands

## Related Documentation

### Requirements
- Follows the Agent Skills specification as documented in `docs/architecture.md`
- Uses the existing skills infrastructure in `src/skills/`

### Architecture Decisions
- [ADR-001: Skills Execution Model](../decisions/0001-skills-execution-model.md) - Skills structure and manifest format

## Codebase Analysis Findings

### Skills System Architecture
- **Location**: Bundled skills reside in `src/_bundled_skills/<skill-name>/`
- **Discovery**: Skills are discovered from bundled, user (`~/.agent/skills/`), and project (`./.agent/skills/`) directories
- **Manifest**: `SKILL.md` with YAML frontmatter + markdown instructions
- **Progressive Disclosure**: Three-tier model (metadata → instructions → resources)

### YAML Frontmatter Fields
| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | 1-64 chars, lowercase alphanumeric + hyphens, matches directory |
| `description` | Yes | 1-1024 chars, explains purpose and when to use |
| `license` | No | License name or file reference |
| `compatibility` | No | Environment requirements |
| `metadata` | No | Key-value string mapping (author, version, tags) |
| `allowed-tools` | No | Space-delimited tool patterns (experimental) |

### Existing Patterns (hello-world skill)
```
src/_bundled_skills/hello-world/
├── SKILL.md              # Manifest with YAML frontmatter
├── scripts/
│   └── greet.sh         # Executable script (returns JSON)
└── references/
    └── EXAMPLES.md      # Additional documentation
```

### Integration Points
- Skills inject `<available_skills>` XML into system prompt
- LLM decides when to activate skills based on description matching
- Resources loaded on-demand via `SkillContextProvider`

## Relevant Files

### Existing Files
- `src/_bundled_skills/hello-world/SKILL.md`: Example skill manifest to follow
- `src/skills/loader.ts`: Skill discovery and loading
- `src/skills/manifest.ts`: Zod schemas for manifest validation
- `src/skills/parser.ts`: YAML frontmatter parsing
- `src/skills/context-provider.ts`: Progressive disclosure implementation
- `docs/architecture.md`: Skills architecture documentation

### New Files
- `src/_bundled_skills/glab/SKILL.md`: Main skill manifest with glab guidance
- `src/_bundled_skills/glab/references/commands-detailed.md`: Comprehensive command reference
- `src/_bundled_skills/glab/references/quick-reference.md`: Quick command lookup
- `src/_bundled_skills/glab/references/troubleshooting.md`: Common issues and solutions

## Source Content URLs

The content for this skill should be adapted from the following reference implementation:

| File to Create | Source URL |
|----------------|------------|
| `SKILL.md` | https://raw.githubusercontent.com/NikiforovAll/claude-code-rules/main/plugins/handbook-glab/skills/glab-skill/SKILL.md |
| `references/commands-detailed.md` | https://raw.githubusercontent.com/NikiforovAll/claude-code-rules/main/plugins/handbook-glab/skills/glab-skill/references/commands-detailed.md |
| `references/quick-reference.md` | https://raw.githubusercontent.com/NikiforovAll/claude-code-rules/main/plugins/handbook-glab/skills/glab-skill/references/quick-reference.md |
| `references/troubleshooting.md` | https://raw.githubusercontent.com/NikiforovAll/claude-code-rules/main/plugins/handbook-glab/skills/glab-skill/references/troubleshooting.md |

**Implementation Notes:**
- Fetch the raw content from each URL during implementation
- Adapt the YAML frontmatter in `SKILL.md` to match this project's manifest schema (name, description, license, metadata fields)
- The `allowed-tools` field should be set to `Bash Read Grep Glob` to enable glab command execution
- Reference files can be used as-is or adapted as needed

## Implementation Plan

### Phase 1: Foundation
Create the skill directory structure and basic manifest.

### Phase 2: Core Implementation
Write comprehensive glab documentation in SKILL.md and reference files.

### Phase 3: Integration
Test skill discovery and verify integration with agent.

## Step by Step Tasks

### Task 1: Create Skill Directory Structure
- Description: Create the `glab` skill directory with required structure
- Files to create:
  - `src/_bundled_skills/glab/` (directory)
  - `src/_bundled_skills/glab/references/` (directory)

### Task 2: Create SKILL.md Manifest
- Description: Create the main skill manifest with YAML frontmatter and comprehensive glab instructions
- Files to create: `src/_bundled_skills/glab/SKILL.md`
- Content includes:
  - Prerequisites (glab installation verification)
  - Authentication guidance
  - Core workflows (MRs, issues, CI/CD, repos)
  - Common patterns and best practices
  - Quick reference section

### Task 3: Create commands-detailed.md Reference
- Description: Create detailed command reference with examples for all glab command categories
- Files to create: `src/_bundled_skills/glab/references/commands-detailed.md`
- Content includes:
  - Merge request commands (list, create, view, approve, merge)
  - Issue commands (list, create, manage)
  - CI/CD commands (pipelines, jobs, logs)
  - Repository commands (clone, view, fork)
  - API access commands
  - Variable and label management

### Task 4: Create quick-reference.md Reference
- Description: Create condensed quick reference for common commands
- Files to create: `src/_bundled_skills/glab/references/quick-reference.md`
- Content includes:
  - Authentication commands
  - Most common MR/issue/CI commands
  - Common flags
  - Environment variables
  - Tips and shortcuts

### Task 5: Create troubleshooting.md Reference
- Description: Create troubleshooting guide for common glab issues
- Files to create: `src/_bundled_skills/glab/references/troubleshooting.md`
- Content includes:
  - Installation issues
  - Authentication problems
  - Repository context errors
  - MR and pipeline issues
  - Network/connection problems

### Task 6: Verify Skill Discovery
- Description: Run the agent and verify the glab skill is discovered
- Commands to run:
  - `bun run dev` and use `/skills list` command
  - Verify skill appears in available skills

## Testing Strategy

### Unit Tests
- No new unit tests required - skill uses existing skills infrastructure
- Existing tests in `src/skills/__tests__/` cover loader, parser, and manifest

### Integration Tests
- Manual verification that skill is discovered
- Manual verification that skill content is injected when relevant queries are made

### Edge Cases
- Skill name validation (must match directory name)
- YAML frontmatter parsing with special characters in description
- Reference file loading on demand

## Acceptance Criteria

- [x] Skill directory exists at `src/_bundled_skills/glab/`
- [x] `SKILL.md` contains valid YAML frontmatter with required fields (name, description)
- [x] Skill name in manifest matches directory name ("glab")
- [x] References directory contains all three reference files
- [x] Skill is discovered by the loader (appears in `/skills list`)
- [x] Skill description enables LLM to activate it for GitLab-related queries
- [x] Reference files are loadable via context provider
- [x] All existing tests continue to pass

## Validation Commands

```bash
# Type checking
bun run typecheck

# Linting
bun run lint

# Run tests to ensure no regressions
bun run test

# Manual verification - start agent and check skills
bun run dev
# Then use /skills list command in the agent
```

## Notes

### Skill Description Best Practices
The description field is crucial for LLM-driven activation. Include:
- Clear statement of what the skill does
- Keywords that match user queries (GitLab, glab, merge request, MR, issue, pipeline, CI/CD)
- When to use the skill

### Tool Integration
The glab skill uses `allowed-tools: Bash Read Grep Glob` to indicate which tools are relevant. The Bash tool enables executing glab commands, while Read/Grep/Glob support analyzing repository context.

### No Custom Triggers
This implementation uses LLM-driven activation based on description matching, not custom trigger keywords. The LLM reads skill descriptions in the `<available_skills>` XML block and decides when to activate.

### Future Enhancements
- Could add scripts for common workflows (e.g., `create-mr.sh`)
- Could add more references for specific workflows (code review, release management)

## Execution

This spec can be implemented using: `/implement docs/specs/feature-glab-skill.md`
