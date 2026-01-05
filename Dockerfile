# Agent Base v2 Container Image
#
# Build options:
#   docker build -t agent .                          # Default: try binary, fallback to source
#   docker build --build-arg SOURCE=true -t agent .  # Force build from source
#
# Usage:
#   docker run -it --rm agent --version
#   docker run -it --rm -v ~/.agent:/home/agent/.agent agent

ARG SOURCE=false
ARG VERSION=latest

# =============================================================================
# Stage 1: Build from source
# =============================================================================
FROM oven/bun:1.3-alpine AS source-builder

ARG TARGETARCH

WORKDIR /app

# Copy source
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Build assets first
RUN bun run build:assets

# Compile to standalone binary for the target architecture
RUN case "${TARGETARCH}" in \
      amd64) TARGET="bun-linux-x64" ;; \
      arm64) TARGET="bun-linux-arm64" ;; \
      *) echo "Unsupported arch: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    bun build src/index.tsx --compile --outfile /app/agent --target ${TARGET}

# Package binary with assets
RUN mkdir -p /app/package && \
    cp /app/agent /app/package/ && \
    cp -r dist/prompts /app/package/ && \
    cp -r dist/_bundled_skills /app/package/

# =============================================================================
# Stage 2: Download pre-built binary (optional)
# =============================================================================
FROM alpine:latest AS binary-downloader

ARG TARGETARCH
ARG VERSION

RUN apk add --no-cache curl jq

WORKDIR /download

# Determine platform
RUN case "${TARGETARCH}" in \
      amd64) PLATFORM="linux-x64" ;; \
      arm64) PLATFORM="linux-arm64" ;; \
      *) echo "Unsupported arch: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    echo "PLATFORM=${PLATFORM}" > /download/env

# Get version and try to download
RUN . /download/env && \
    REPO="danielscholl/agent-base-v2" && \
    if [ "${VERSION}" = "latest" ]; then \
      VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null | jq -r '.tag_name // empty') || true; \
    fi && \
    if [ -n "${VERSION}" ]; then \
      ARCHIVE_URL="https://github.com/${REPO}/releases/download/${VERSION}/agent-${PLATFORM}.tar.gz" && \
      echo "Downloading from: ${ARCHIVE_URL}" && \
      curl -fsSL "${ARCHIVE_URL}" -o /download/agent.tar.gz && \
      mkdir -p /download/package && \
      tar -xzf /download/agent.tar.gz -C /download/package && \
      echo "SUCCESS" > /download/status; \
    fi || echo "FAILED" > /download/status

# =============================================================================
# Stage 3: Final minimal image
# =============================================================================
FROM alpine:latest AS runtime

# Install runtime dependencies
RUN apk add --no-cache libstdc++ libgcc

WORKDIR /app

# Copy from both stages - we'll pick the right one based on SOURCE arg and download status
COPY --from=source-builder /app/package /app/source-package
COPY --from=binary-downloader /download/package /app/binary-package
COPY --from=binary-downloader /download/status /app/download-status

ARG SOURCE

# Select the right package: binary if available and SOURCE!=true, otherwise source
RUN if [ "${SOURCE}" = "true" ]; then \
      echo "Using source build (forced)"; \
      mv /app/source-package/* /app/; \
    elif [ -f /app/download-status ] && grep -q "SUCCESS" /app/download-status && [ -f /app/binary-package/agent ]; then \
      echo "Using pre-built binary"; \
      mv /app/binary-package/* /app/; \
    else \
      echo "Binary not available, using source build"; \
      mv /app/source-package/* /app/; \
    fi && \
    rm -rf /app/source-package /app/binary-package /app/download-status && \
    chmod +x /app/agent

# Create non-root user
RUN adduser -D -h /home/agent agent
USER agent
WORKDIR /home/agent

# Config volume
VOLUME ["/home/agent/.agent"]

ENTRYPOINT ["/app/agent"]
CMD ["--help"]
