# Docker Sandbox Mode

Agent Harness supports running inside a Docker container for enhanced security isolation. This provides OS-level sandboxing on top of application-level workspace constraints.

## Quick Start

```bash
# Run with sandbox isolation (image auto-pulled on first use)
agent --sandbox -p "Analyze this codebase"

# Interactive mode in sandbox
agent --sandbox
```

The sandbox image is automatically pulled from `ghcr.io/danielscholl/ai-harness-sandbox` on first use. No manual setup required!

## How It Works

When you pass `--sandbox`, the harness:

1. **Detects** if it's already running inside a container
2. **Verifies** Docker is available and running
3. **Ensures** the sandbox image is available (auto-pulls if missing)
4. **Re-executes** itself inside the Docker container with:
   - Your workspace mounted at `/workspace` (read-write)
   - Your config directory at `~/.agent` (read-write for sessions/plugins)
   - API credentials passed via environment variables
   - `AGENT_WORKSPACE_ROOT=/workspace` to enforce workspace constraints

Inside the container, the agent runs as a non-root user with the `AGENT_SANDBOX=true` marker set.

## Security Model

Agent Harness provides two layers of security:

| Layer | Mechanism | Protection |
|-------|-----------|------------|
| **Application** | Workspace root constraints | Prevents tools from accessing files outside the designated workspace |
| **OS (with --sandbox)** | Docker container isolation | Provides OS-level process and filesystem isolation |

Using `--sandbox` adds defense-in-depth: even if application-level constraints fail, the container boundary limits damage.

## Building the Sandbox Image (Optional)

The sandbox image is automatically pulled from the registry on first use. Manual building is only needed for:
- Development/testing of the sandbox itself
- Offline environments without registry access
- Custom modifications

```bash
# Build from source
docker build -f Dockerfile.sandbox -t ai-harness-sandbox .

# Build with specific options
docker build -f Dockerfile.sandbox \
  --build-arg SOURCE=true \
  -t ai-harness-sandbox .
```

The sandbox image includes:
- The agent binary
- Git, curl, and common development tools
- Non-root user (`agent`)
- Sandbox markers (`/.agent-sandbox`, `AGENT_SANDBOX=true`)

## Environment Variables

The following environment variables are automatically passed through to the sandbox:

**LLM API Keys:**
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `GITHUB_TOKEN`

**Azure:**
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_API_VERSION`
- `AZURE_AI_PROJECT_ENDPOINT`
- `AZURE_AI_MODEL_DEPLOYMENT`

**Provider Selection:**
- `LLM_PROVIDER`
- `AGENT_MODEL`

**Telemetry:**
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `APPLICATIONINSIGHTS_CONNECTION_STRING`

**Agent Configuration:**
- `AGENT_HOME` - Custom agent home directory (automatically mounted and mapped)
- `AGENT_WORKSPACE_ROOT` - Passed through for reference (overridden to `/workspace` in container)

## Custom Sandbox Image

Override the default image name:

```bash
# Via environment variable
AGENT_SANDBOX_IMAGE=my-custom-sandbox:latest agent --sandbox

# Or set in your shell profile
export AGENT_SANDBOX_IMAGE=my-custom-sandbox:latest
```

## Manual Docker Usage

You can run the sandbox manually without the `--sandbox` flag:

```bash
docker run -it --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  -v ~/.agent:/home/agent/.agent \
  -e OPENAI_API_KEY \
  -e AGENT_SANDBOX=true \
  -e AGENT_WORKSPACE_ROOT=/workspace \
  --hostname agent-sandbox \
  ai-harness-sandbox \
  -p "Analyze this codebase"
```

## Verbose Mode

See detailed sandbox startup information:

```bash
agent --sandbox --verbose -p "Hello"
```

Output:
```
[sandbox] Launching in Docker container...
[sandbox] Docker CLI: Docker version 24.0.7
[sandbox] Docker daemon running
[sandbox] Sandbox image available
[sandbox] Running: docker run --rm -it ...
```

## Container Detection

The harness detects if it's running inside a container using multiple methods:

1. **`AGENT_SANDBOX=true`** environment variable (our containers)
2. **`/.agent-sandbox`** marker file (our containers)
3. **`/.dockerenv`** file (standard Docker marker)
4. **`/proc/1/cgroup`** containing "docker"/"containerd" (Linux)

Nested sandboxing is automatically prevented - if already in a container, `--sandbox` is a no-op.

## Troubleshooting

### Docker Not Found

```
[sandbox] Error: Docker CLI not found. Install Docker from https://docs.docker.com/get-docker/
```

Install Docker Desktop (macOS/Windows) or Docker Engine (Linux).

### Docker Not Running

```
[sandbox] Error: Docker daemon not running. Start Docker Desktop or run: sudo systemctl start docker
```

Start the Docker daemon or Docker Desktop application.

### Image Not Found

```
[sandbox] Error: Sandbox image 'ai-harness-sandbox' not found. Build it with: docker build -f Dockerfile.sandbox -t ai-harness-sandbox .
```

Build the sandbox image as described in [Building the Sandbox Image](#building-the-sandbox-image).

### Windows Considerations

On Windows without WSL2:
- Docker Desktop with Hyper-V backend is required
- Performance may be slower than native Linux containers
- Consider using WSL2 for better performance

### Credential Issues

If the agent can't authenticate with your LLM provider:
1. Verify the environment variable is set in your shell
2. Check that the variable is in the passthrough list
3. Use `--verbose` to see which variables are being passed

## Limitations

- **GUI tools**: No display access inside the container
- **Local network**: Container has its own network namespace
- **Docker-in-Docker**: Running Docker commands inside the sandbox requires additional configuration
- **Performance**: Container startup adds ~1-2 seconds of overhead
- **Workspace narrowing**: The sandbox always sets `AGENT_WORKSPACE_ROOT=/workspace`, limiting file access to the mounted directory (your cwd). This is intentional for security isolation, even if you have a broader workspace configured on the host.
- **Linux UID/GID**: The container runs as user `agent` (UID 1000). On Linux hosts where your user has a different UID, mounted directories may have permission issues. Workaround: run with explicit user mapping:
  ```bash
  docker run --user $(id -u):$(id -g) ...
  ```
