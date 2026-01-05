---
status: accepted
date: 2025-01-05
deciders: Daniel Scholl
---

# Self-Update Strategy: Installation-Aware Updates with Version Caching

## Context and Problem Statement

Users need a way to keep their agent installation current without manual intervention. Different installation methods require different update mechanisms:

1. **Bun global installs**: Use `bun install -g` from git repository
2. **Shell binary installs**: Download pre-built binaries from GitHub releases
3. **Shell source installs**: Pull latest and rebuild from source
4. **Local development**: Manual git pull (not auto-updated)

How should we implement self-updates that work correctly across all installation types while being secure and user-friendly?

## Decision Drivers

- **Installation-aware updates**: Different install methods need different update strategies
- **Security**: Validate downloaded binaries, sanitize network data, prevent attacks
- **User experience**: Non-intrusive update notifications, fast version checks
- **Rate limit avoidance**: Minimize GitHub API calls to avoid hitting limits
- **Graceful fallbacks**: Handle network failures and missing binaries

## Considered Options

1. **Single update strategy** (always rebuild from source)
2. **Package manager delegation** (defer to bun/npm for updates)
3. **Installation-aware update strategies** (detect and adapt)
4. **External update service** (hosted version check API)

## Decision Outcome

Chosen option: **"Installation-aware update strategies"**, because it provides the optimal update experience for each installation type while maintaining security and graceful degradation.

### Consequences

- Good, because binary installs get fast binary updates without Bun
- Good, because source installs get latest code with proper rebuild
- Good, because version caching reduces GitHub API calls
- Good, because update banner provides non-intrusive notifications
- Good, because fallback chain handles edge cases (binary unavailable → source build)
- Neutral, because detection logic adds complexity
- Bad, because multiple code paths to maintain and test

## Validation

- Test update command for each installation type
- Verify version cache TTL behavior
- Confirm checksum verification works with various checksum file formats
- Validate security measures (input sanitization, tar path traversal prevention)

## Pros and Cons of the Options

### Single Update Strategy (Source Only)

Always clone/pull repository and build from source.

- Good, because simple implementation
- Good, because always gets latest code
- Bad, because requires Bun for all users
- Bad, because slow (~60s) even for binary installs
- Bad, because can fail due to build environment issues

### Package Manager Delegation

Use `bun update -g` or similar package manager commands.

- Good, because leverages existing update infrastructure
- Good, because handles dependency resolution
- Bad, because only works for bun/npm installs
- Bad, because doesn't support shell script binary installs
- Bad, because requires package manager runtime

### Installation-Aware Update Strategies

Detect installation type and use appropriate update mechanism.

- Good, because optimal experience for each install type
- Good, because binary installs stay dependency-free
- Good, because source installs get proper rebuilds
- Neutral, because more complex detection logic
- Neutral, because multiple strategies to maintain

### External Update Service

Host a version check API to reduce GitHub dependency.

- Good, because avoids GitHub rate limits entirely
- Good, because can add telemetry/analytics
- Bad, because requires infrastructure to maintain
- Bad, because additional point of failure
- Bad, because privacy concerns with telemetry

## More Information

### Installation Type Detection

Detection uses process paths, falling back to `process.execPath` for compiled binaries:

| Path Pattern | Installation Type | Update Strategy |
|--------------|-------------------|-----------------|
| `~/.bun/install/global/` | bun-global | `bun install -g` from repo |
| `~/.agent/bin/` | shell-binary | Download binary from release |
| `~/.agent/repo/` | shell-source | `git pull && bun install && bun run build` |
| `*/src/index.tsx` | local-dev | Manual (show instructions) |
| Other | unknown | Show installation instructions |

### Version Caching

To minimize GitHub API calls:

1. **Cache file**: `~/.agent/version-check.json`
2. **TTL**: 24 hours
3. **Contents**: `currentVersion`, `latestVersion`, `updateAvailable`, `releaseUrl`, `checkedAt`
4. **Validation**: Cache data is validated on read to detect tampering

### Security Measures

1. **Input sanitization**: Network data validated before caching
   - Version strings must match semver pattern
   - Release URLs must be valid github.com URLs for the repository

2. **Checksum verification**: SHA256 checksums verified when available
   - Supports `SHA256SUMS`, `checksums.txt`, and per-file `.sha256`
   - Normalizes filenames (strips `./`, `*` prefixes)

3. **Tar extraction safety**: Uses `--no-absolute-names` to prevent path traversal

4. **GitHub token support**: Authenticated requests via `GITHUB_TOKEN`/`GH_TOKEN` for higher rate limits

### Update Flow

```
agent update [--check] [--force]

1. Detect installation type
2. Check version cache (or fetch if stale/forced)
3. Compare versions
4. If update available (or --force):
   - bun-global: Run bun install -g from git repo
   - shell-binary: Download, verify, extract, symlink
   - shell-source: git pull, bun install, bun run build
5. Clear version cache on success
```

### Update Banner

Interactive shell shows non-blocking update notification:

```
Update available: 0.2.0 -> 0.3.0 • Run agent update to upgrade
```

- Checks version in background on startup
- Uses cached result if within TTL
- Suppressed when current version is unknown

### Related Decisions

- [ADR-0009: Hybrid Installation](0009-hybrid-installation.md) - Installation strategy this builds upon
- [ADR-0003: Bun Runtime](0003-runtime-bun.md) - Runtime enabling `--compile` for binaries
