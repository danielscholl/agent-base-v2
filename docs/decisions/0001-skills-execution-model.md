---
status: accepted
contact: AI Assistant
date: 2025-01-15
deciders: Project team
---

# Skills Execution Model: Toolsets vs Scripts

## Context and Problem Statement

The agent framework supports extensibility through skills, which can provide additional tools. When the agent is bundled to a single artifact (e.g., for npm distribution), how should skill code be executed? Dynamic loading of TypeScript from user plugin directories creates complexity around module resolution, bundling, and security.

## Decision Drivers

- **Bundling compatibility**: Single-artifact distribution should work without external dependencies
- **User extensibility**: Users should be able to add custom skills without rebuilding the agent
- **Security**: External code execution must have appropriate isolation
- **Performance**: Frequently-used tools should have low latency
- **Simplicity**: MVP should minimize complexity

## Considered Options

1. **All skills in-process via dynamic import**
   - Bundled and plugin skills both use `import()` to load TypeScript modules
   - Requires bundler configuration to handle dynamic imports
   - Plugin skills need compatible TypeScript/module format

2. **Bundled in-process, plugins as subprocess scripts**
   - Bundled skills compiled into the agent bundle (in-process, low latency)
   - Plugin skills must be scripts executed via `Bun.spawn()` (subprocess isolation)
   - Clear boundary: bundled = fast + trusted, plugin = isolated + slower

3. **All skills as subprocess scripts**
   - Maximum isolation but high latency for all tool calls
   - Loses benefits of in-process execution for bundled skills

## Decision Outcome

Chosen option: **"Bundled in-process, plugins via dynamic import (MVP); scripts post-MVP"**

For MVP:
- **Bundled skills** (`src/_bundled_skills/`): Compiled into bundle, in-process execution
- **Plugin skills** (`~/.agent/skills/`): Loaded via dynamic import at runtime
- **Scripts**: Deferred to post-MVP

Post-MVP:
- Add subprocess script execution for skills that need isolated dependencies
- Scripts provide escape hatch for complex tools with external dependencies

### Consequences

**Good:**
- MVP is simpler (no subprocess management)
- Bundled skills have optimal performance (in-process)
- Plugin skills work via standard TypeScript/ESM dynamic import
- Clear upgrade path to scripts when needed

**Bad:**
- Plugin skills must be compatible TypeScript (no arbitrary languages)
- Plugin skills share the agent's dependency tree (potential conflicts)
- Post-MVP work needed for full script isolation

### Implementation Notes

1. **Bundled skills**: Located in `src/_bundled_skills/`, compiled with agent
2. **Plugin skills**: Located in `~/.agent/skills/`, loaded via `import()` at runtime
3. **Toolset format**: TypeScript classes extending base toolset, exporting `getTools()`
4. **Script format (post-MVP)**: Standalone scripts with JSON stdin/stdout interface

### Related Decisions

- SKILL.md manifest format documents both toolsets and scripts fields
- Scripts field is parsed but not executed in MVP
- See Feature 45 (post-MVP) for script execution implementation
