# Agent Base v2 Container Image
#
# Build options:
#   docker build -t agent .                     # Default: download binary
#   docker build --build-arg SOURCE=true -t agent .  # Build from source
#
# Usage:
#   docker run -it --rm agent --version
#   docker run -it --rm -v ~/.agent:/root/.agent agent

ARG SOURCE=false

# =============================================================================
# Stage 1: Download pre-built binary (default, fast)
# =============================================================================
FROM alpine:latest AS binary-installer

ARG TARGETARCH
ARG VERSION=latest

RUN apk add --no-cache curl jq

WORKDIR /install

# Determine platform
RUN case "${TARGETARCH}" in \
      amd64) PLATFORM="linux-x64" ;; \
      arm64) PLATFORM="linux-arm64" ;; \
      *) echo "Unsupported arch: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    echo "PLATFORM=${PLATFORM}" > /install/env

# Get latest version if needed
RUN . /install/env && \
    if [ "${VERSION}" = "latest" ]; then \
      VERSION=$(curl -fsSL -o /dev/null -w '%{url_effective}' \
        https://github.com/danielscholl/agent-base-v2/releases/latest 2>/dev/null | \
        grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' || echo ""); \
    fi && \
    echo "VERSION=${VERSION}" >> /install/env

# Download binary
RUN . /install/env && \
    BINARY_URL="https://github.com/danielscholl/agent-base-v2/releases/download/${VERSION}/agent-${PLATFORM}" && \
    echo "Downloading from: ${BINARY_URL}" && \
    curl -fsSL "${BINARY_URL}" -o /install/agent && \
    chmod +x /install/agent

# =============================================================================
# Stage 2: Build from source (fallback)
# =============================================================================
FROM oven/bun:1.3-alpine AS source-builder

WORKDIR /app

# Copy source
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# Compile to standalone binary
RUN bun build src/index.tsx --compile --outfile /app/agent --target bun-linux-x64

# =============================================================================
# Stage 3: Final minimal image
# =============================================================================
FROM alpine:latest AS runtime

# Install runtime dependencies (minimal)
RUN apk add --no-cache libstdc++ libgcc

WORKDIR /app

# Copy binary from appropriate stage based on SOURCE arg
ARG SOURCE
COPY --from=binary-installer /install/agent /tmp/binary-agent
COPY --from=source-builder /app/agent /tmp/source-agent

RUN if [ "${SOURCE}" = "true" ]; then \
      mv /tmp/source-agent /usr/local/bin/agent; \
    else \
      mv /tmp/binary-agent /usr/local/bin/agent 2>/dev/null || \
      mv /tmp/source-agent /usr/local/bin/agent; \
    fi && \
    rm -f /tmp/*-agent && \
    chmod +x /usr/local/bin/agent

# Create non-root user
RUN adduser -D -h /home/agent agent
USER agent
WORKDIR /home/agent

# Config volume
VOLUME ["/home/agent/.agent"]

ENTRYPOINT ["agent"]
CMD ["--help"]
