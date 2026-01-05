#!/usr/bin/env bash
# Agent Base v2 Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/danielscholl/agent-base-v2/main/install.sh | bash
#
# Options:
#   --source    Force build from source (skip binary download)
#   --version   Install specific version (e.g., v0.2.0)

set -euo pipefail

REPO="danielscholl/agent-base-v2"
REPO_URL="https://github.com/${REPO}"
INSTALL_DIR="${HOME}/.agent"
BIN_DIR="${HOME}/.local/bin"

# Parse arguments
FORCE_SOURCE=false
VERSION="latest"
while [[ $# -gt 0 ]]; do
  case $1 in
    --source) FORCE_SOURCE=true; shift ;;
    --version) VERSION="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m'

info() { printf "${BLUE}%s${NC}\n" "$1"; }
success() { printf "${GREEN}%s${NC}\n" "$1"; }
warn() { printf "${YELLOW}%s${NC}\n" "$1"; }
error() { printf "${RED}Error: %s${NC}\n" "$1" >&2; exit 1; }

# Detect platform
detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin) PLATFORM_OS="darwin" ;;
    Linux) PLATFORM_OS="linux" ;;
    MINGW*|MSYS*|CYGWIN*) error "Please use install.ps1 or install.cmd on Windows" ;;
    *) error "Unsupported operating system: $os" ;;
  esac

  case "$arch" in
    x86_64|amd64) PLATFORM_ARCH="x64" ;;
    aarch64|arm64) PLATFORM_ARCH="arm64" ;;
    *) error "Unsupported architecture: $arch" ;;
  esac

  PLATFORM="${PLATFORM_OS}-${PLATFORM_ARCH}"
  info "Detected platform: ${PLATFORM}"
}

# Get latest release version
get_latest_version() {
  local url="${REPO_URL}/releases/latest"
  if command -v curl &> /dev/null; then
    VERSION=$(curl -fsSL -o /dev/null -w '%{url_effective}' "$url" 2>/dev/null | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' || echo "")
  elif command -v wget &> /dev/null; then
    VERSION=$(wget -q -O /dev/null --server-response "$url" 2>&1 | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | tail -1 || echo "")
  fi
}

# Download and verify binary package
download_binary() {
  local archive_name="agent-${PLATFORM}.tar.gz"
  local download_url="${REPO_URL}/releases/download/${VERSION}/${archive_name}"
  local checksum_url="${download_url}.sha256"
  local tmp_dir="${INSTALL_DIR}/tmp"
  local archive_path="${tmp_dir}/${archive_name}"

  mkdir -p "${tmp_dir}"

  info "Downloading agent ${VERSION} for ${PLATFORM}..."

  # Download archive
  if command -v curl &> /dev/null; then
    if ! curl -fsSL "$download_url" -o "$archive_path" 2>/dev/null; then
      rm -rf "${tmp_dir}"
      return 1
    fi
    curl -fsSL "$checksum_url" -o "${archive_path}.sha256" 2>/dev/null || true
  elif command -v wget &> /dev/null; then
    if ! wget -q "$download_url" -O "$archive_path" 2>/dev/null; then
      rm -rf "${tmp_dir}"
      return 1
    fi
    wget -q "$checksum_url" -O "${archive_path}.sha256" 2>/dev/null || true
  else
    rm -rf "${tmp_dir}"
    return 1
  fi

  # Verify checksum if available
  if [ -f "${archive_path}.sha256" ]; then
    info "Verifying checksum..."
    local expected_hash actual_hash
    expected_hash=$(awk '{print $1}' "${archive_path}.sha256")

    if command -v shasum &> /dev/null; then
      actual_hash=$(shasum -a 256 "$archive_path" | awk '{print $1}')
    elif command -v sha256sum &> /dev/null; then
      actual_hash=$(sha256sum "$archive_path" | awk '{print $1}')
    fi

    if [ -n "$actual_hash" ] && [ "$expected_hash" != "$actual_hash" ]; then
      error "Checksum verification failed! Expected: ${expected_hash}, Got: ${actual_hash}"
    fi
    success "Checksum verified"
  fi

  # Extract archive
  info "Extracting..."
  local extract_dir="${INSTALL_DIR}/bin"
  rm -rf "${extract_dir}"
  mkdir -p "${extract_dir}"
  tar -xzf "$archive_path" -C "${extract_dir}"

  # Create symlink to binary
  mkdir -p "${BIN_DIR}"
  rm -f "${BIN_DIR}/agent"
  ln -sf "${extract_dir}/agent" "${BIN_DIR}/agent"
  chmod +x "${extract_dir}/agent"

  rm -rf "${tmp_dir}"

  success "Binary installed successfully!"
  return 0
}

# Build from source (fallback)
build_from_source() {
  info "Building from source..."

  # Check for git
  if ! command -v git &> /dev/null; then
    error "git is required but not installed"
  fi

  # Check for bun, install if missing
  if ! command -v bun &> /dev/null; then
    info "Bun not found. Installing Bun..."
    if command -v curl &> /dev/null; then
      curl -fsSL https://bun.sh/install | bash
    elif command -v wget &> /dev/null; then
      wget -qO- https://bun.sh/install | bash
    else
      error "Neither curl nor wget found. Please install Bun manually: https://bun.sh"
    fi

    export BUN_INSTALL="${HOME}/.bun"
    export PATH="${BUN_INSTALL}/bin:${PATH}"

    if ! command -v bun &> /dev/null; then
      error "Bun installation failed"
    fi
  fi

  info "Using Bun $(bun --version)"

  local repo_path="${INSTALL_DIR}/repo"

  # Clone or update
  if [ -d "${repo_path}" ]; then
    info "Updating existing installation..."
    pushd "${repo_path}" > /dev/null
    git fetch --quiet origin --tags
    # Checkout specific version if provided, otherwise use main
    if [ -n "$VERSION" ] && [ "$VERSION" != "latest" ]; then
      info "Checking out ${VERSION}..."
      git checkout --quiet "${VERSION}" 2>/dev/null || git checkout --quiet "tags/${VERSION}"
    else
      git reset --hard origin/main --quiet
    fi
    popd > /dev/null
  else
    info "Cloning repository..."
    if [ -n "$VERSION" ] && [ "$VERSION" != "latest" ]; then
      git clone --quiet --branch "${VERSION}" --depth 1 "${REPO_URL}.git" "${repo_path}" 2>/dev/null || \
      git clone --quiet "${REPO_URL}.git" "${repo_path}" && \
      (cd "${repo_path}" && git checkout --quiet "${VERSION}")
    else
      git clone --quiet --depth 1 "${REPO_URL}.git" "${repo_path}"
    fi
  fi

  # Install and build
  pushd "${repo_path}" > /dev/null
  info "Installing dependencies..."
  bun install --frozen-lockfile 2>/dev/null || bun install

  info "Building..."
  bun run build
  popd > /dev/null

  # Create symlink
  mkdir -p "${BIN_DIR}"
  rm -f "${BIN_DIR}/agent"
  ln -sf "${repo_path}/dist/index.js" "${BIN_DIR}/agent"
  chmod +x "${repo_path}/dist/index.js"

  success "Built from source successfully!"
}

# Check PATH
check_path() {
  if [[ ":${PATH}:" != *":${BIN_DIR}:"* ]]; then
    echo ""
    warn "Add this to your shell profile:"
    echo ""
    local shell_name
    shell_name="$(basename "${SHELL:-bash}")"
    case "$shell_name" in
      fish) echo "  set -gx PATH \"${BIN_DIR}\" \$PATH" ;;
      *) echo "  export PATH=\"${BIN_DIR}:\$PATH\"" ;;
    esac
    echo ""
  fi
}

# Verify installation
verify_install() {
  if [ -x "${BIN_DIR}/agent" ] || [ -L "${BIN_DIR}/agent" ]; then
    local version
    version=$("${BIN_DIR}/agent" --version 2>/dev/null || echo "unknown")
    success "Agent v${version} installed successfully!"
  else
    error "Installation verification failed"
  fi
}

# Main
main() {
  echo ""
  info "Agent Base v2 Installer"
  echo ""

  detect_platform
  mkdir -p "${INSTALL_DIR}" "${BIN_DIR}"

  # Determine version
  if [ "$VERSION" = "latest" ]; then
    get_latest_version
  fi

  # Try binary download first (unless --source flag)
  if [ "$FORCE_SOURCE" = false ] && [ -n "$VERSION" ]; then
    if download_binary; then
      verify_install
      check_path
      echo ""
      success "Run 'agent' to start!"
      echo ""
      exit 0
    else
      warn "Binary not available for ${PLATFORM}, falling back to source build..."
    fi
  fi

  # Fallback to building from source
  build_from_source
  verify_install
  check_path

  echo ""
  success "Run 'agent' to start!"
  echo ""
}

main "$@"
