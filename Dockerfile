# Agent Harness Container Image
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
    echo "Building for ${TARGETARCH} using target ${TARGET}" && \
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
    REPO="danielscholl/ai-harness" && \
    if [ "${VERSION}" = "latest" ]; then \
      VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null | jq -r '.tag_name // empty') || true; \
    fi && \
    if [ -z "${VERSION}" ] || [ "${VERSION}" = "null" ]; then \
      echo "No releases found, will fallback to source build" && \
      echo "FAILED" > /download/status; \
    elif [ -n "${VERSION}" ]; then \
      ARCHIVE_URL="https://github.com/${REPO}/releases/download/${VERSION}/agent-${PLATFORM}.tar.gz" && \
      echo "Downloading from: ${ARCHIVE_URL}" && \
      if curl -fsSL "${ARCHIVE_URL}" -o /download/agent.tar.gz 2>/dev/null; then \
        mkdir -p /download/package && \
        tar -xzf /download/agent.tar.gz -C /download/package && \
        echo "SUCCESS" > /download/status; \
      else \
        echo "Download failed, will fallback to source build" && \
        echo "FAILED" > /download/status; \
      fi; \
    else \
      echo "FAILED" > /download/status; \
    fi

# =============================================================================
# Stage 3: Final minimal image
# =============================================================================
FROM alpine:latest AS runtime

# Install runtime dependencies
RUN apk add --no-cache libstdc++ libgcc

WORKDIR /app

ARG SOURCE

# Conditionally copy from the appropriate stage based on SOURCE arg
# This avoids copying unused artifacts from both stages
COPY --from=binary-downloader /download/status /tmp/download-status

# Select the right package: binary if available and SOURCE!=true, otherwise source
RUN if [ "${SOURCE}" = "true" ]; then \
      echo "Using source build (forced)" && \
      BUILD_SOURCE="source"; \
    elif [ -f /tmp/download-status ] && grep -q "SUCCESS" /tmp/download-status; then \
      echo "Using pre-built binary" && \
      BUILD_SOURCE="binary"; \
    else \
      echo "Binary not available, using source build" && \
      BUILD_SOURCE="source"; \
    fi && \
    echo "${BUILD_SOURCE}" > /tmp/build-source && \
    rm -f /tmp/download-status

# Copy only the selected package
COPY --from=source-builder /app/package /tmp/source-package
COPY --from=binary-downloader /download/package /tmp/binary-package

RUN BUILD_SOURCE=$(cat /tmp/build-source) && \
    if [ "${BUILD_SOURCE}" = "binary" ]; then \
      if [ ! -f /tmp/binary-package/agent ]; then \
        echo "ERROR: Binary package missing agent executable" && \
        exit 1; \
      fi && \
      mv /tmp/binary-package/* /app/ || { echo "ERROR: Failed to move binary package"; exit 1; }; \
    else \
      if [ ! -f /tmp/source-package/agent ]; then \
        echo "ERROR: Source package missing agent executable" && \
        exit 1; \
      fi && \
      mv /tmp/source-package/* /app/ || { echo "ERROR: Failed to move source package"; exit 1; }; \
    fi && \
    rm -rf /tmp/source-package /tmp/binary-package /tmp/build-source && \
    chmod +x /app/agent && \
    /app/agent --version || { echo "ERROR: Agent binary is not executable or corrupted"; exit 1; }

# Create non-root user
RUN adduser -D -h /home/agent agent
USER agent
WORKDIR /home/agent

# Config volume
VOLUME ["/home/agent/.agent"]

ENTRYPOINT ["/app/agent"]
CMD ["--help"]
