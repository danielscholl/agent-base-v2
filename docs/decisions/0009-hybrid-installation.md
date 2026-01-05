---
status: accepted
date: 2025-01-05
deciders: Daniel Scholl
---

# Hybrid Installation: Pre-built Binaries with Source Fallback

## Context and Problem Statement

Users installing agent-base-v2 face several challenges with the current source-only installation:

1. **Bun dependency**: Users must have Bun installed with the correct version
2. **Build time**: Installation takes 30-60 seconds for clone + install + build
3. **CI/CD friction**: Pipelines need extra steps to set up Bun before using the agent
4. **Container bloat**: Images include full Bun runtime (~500MB+) instead of just the binary
5. **Build failures**: Different environments can cause unpredictable build issues

How should we distribute the agent to support diverse installation scenarios while maintaining simplicity?

## Decision Drivers

- **Zero-dependency installation** for end users without Bun
- **Fast CI/CD integration** without setup overhead
- **Minimal container images** for production deployments
- **Cross-platform support** (macOS, Linux, Windows)
- **Developer experience** for bleeding-edge and contribution workflows
- **Maintainability** of the release process

## Considered Options

1. **Source-only installation** (current)
2. **Pre-built binaries only** (like Claude Code)
3. **Hybrid: Pre-built with source fallback**
4. **npm/bun package publishing**

## Decision Outcome

Chosen option: **"Hybrid: Pre-built with source fallback"**, because it provides the best user experience for most scenarios while maintaining flexibility for developers and graceful degradation when binaries aren't available.

### Consequences

- Good, because users without Bun can install via single binary download
- Good, because CI/CD pipelines need only `curl + chmod + run` (~5 seconds)
- Good, because container images can be minimal (~60MB with just binary)
- Good, because developers can still use `--source` for latest main branch
- Good, because fallback ensures installation works even before first release
- Neutral, because release process now includes multi-platform builds
- Bad, because GitHub Actions minutes increase due to matrix builds

## Validation

- Test installer script on macOS, Linux, and Windows
- Verify binary downloads work after first tagged release
- Confirm source fallback triggers when no release exists
- Validate container builds with both binary and source options

## Pros and Cons of the Options

### Source-only Installation

Build from source on every install using Bun.

- Good, because simple release process (just tag)
- Good, because always latest code
- Bad, because requires Bun installed
- Bad, because slow (~60s install time)
- Bad, because build can fail in different environments
- Bad, because large container images

### Pre-built Binaries Only

Distribute only compiled binaries, no source install option.

- Good, because zero dependencies
- Good, because fast installation
- Good, because deterministic
- Bad, because no bleeding-edge option
- Bad, because contributors need separate dev setup
- Bad, because fails if binary not available for platform

### Hybrid: Pre-built with Source Fallback

Try binary download first, fall back to source build if unavailable.

- Good, because best of both worlds
- Good, because graceful degradation
- Good, because supports all user types
- Neutral, because slightly more complex installer logic
- Neutral, because two installation paths to maintain

### npm/bun Package Publishing

Publish pre-built package to npm registry.

- Good, because familiar `npm install -g` workflow
- Good, because handles updates automatically
- Bad, because requires npm account and publishing workflow
- Bad, because still requires Node.js or Bun runtime
- Bad, because doesn't solve container size issue

## More Information

### Implementation Details

**Installer scripts** (`install.sh`, `install.ps1`, `install.cmd`):
1. Detect platform (darwin/linux/windows × x64/arm64)
2. Fetch latest release version from GitHub
3. Attempt binary download with SHA256 verification
4. Fall back to source build if binary unavailable
5. Support `--source` flag to force source build
6. Support `--version` flag for specific versions

**Release workflow** (`.github/workflows/release.yml`):
1. Triggered by release-please tags
2. Matrix build for 5 platforms
3. Uses `bun build --compile` for standalone binaries
4. Packages binary with prompts/ and _bundled_skills/ assets
5. Creates tar.gz (Unix) or zip (Windows) archives
6. Generates SHA256 checksums
7. Uploads all artifacts to GitHub Release

**Container support** (`Dockerfile`):
- Multi-stage build with binary and source options
- `--build-arg SOURCE=true` forces source build
- Final image based on Alpine (~60MB)
- Non-root user for security

### Platform Matrix

| Platform | Target | Artifact |
|----------|--------|----------|
| macOS ARM | `bun-darwin-arm64` | `agent-darwin-arm64` |
| macOS Intel | `bun-darwin-x64` | `agent-darwin-x64` |
| Linux x64 | `bun-linux-x64` | `agent-linux-x64` |
| Linux ARM | `bun-linux-arm64` | `agent-linux-arm64` |
| Windows | `bun-windows-x64` | `agent-windows-x64.exe` |

### Related Decisions

- [ADR-0003: Bun Runtime](0003-runtime-bun.md) - Bun's `--compile` flag enables this approach
