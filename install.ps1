# Agent Base v2 Installer for Windows PowerShell
# Usage: irm https://raw.githubusercontent.com/danielscholl/agent-base-v2/main/install.ps1 | iex
#
# Options (when running locally):
#   .\install.ps1 -Source        # Force build from source
#   .\install.ps1 -Version v0.2.0  # Install specific version

param(
    [switch]$Source,
    [string]$Version = "latest"
)

$ErrorActionPreference = "Stop"

$REPO = "danielscholl/agent-base-v2"
$REPO_URL = "https://github.com/$REPO"
$INSTALL_DIR = "$env:LOCALAPPDATA\Programs\agent-base-v2"
$BIN_DIR = "$env:LOCALAPPDATA\Microsoft\WindowsApps"

function Write-Info { param($msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host $msg -ForegroundColor Yellow }
function Write-Err { param($msg) Write-Host "Error: $msg" -ForegroundColor Red; exit 1 }

function Test-Platform {
    if ([Environment]::Is64BitOperatingSystem -eq $false) {
        Write-Err "Agent requires 64-bit Windows"
    }
    $script:PLATFORM = "windows-x64"
    Write-Info "Detected platform: $PLATFORM"
}

function Get-LatestVersion {
    try {
        $response = Invoke-WebRequest -Uri "$REPO_URL/releases/latest" -MaximumRedirection 0 -ErrorAction SilentlyContinue
    } catch {
        $redirectUrl = $_.Exception.Response.Headers.Location
        if ($redirectUrl -match 'v\d+\.\d+\.\d+') {
            $script:Version = $matches[0]
        }
    }
}

function Install-Binary {
    $binaryName = "agent-$PLATFORM.exe"
    $downloadUrl = "$REPO_URL/releases/download/$Version/$binaryName"
    $checksumUrl = "$downloadUrl.sha256"
    $tmpDir = "$INSTALL_DIR\tmp"
    $binaryPath = "$tmpDir\$binaryName"

    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

    Write-Info "Downloading agent $Version for $PLATFORM..."

    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $binaryPath -ErrorAction Stop
    } catch {
        Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
        return $false
    }

    # Download and verify checksum
    try {
        Invoke-WebRequest -Uri $checksumUrl -OutFile "$binaryPath.sha256" -ErrorAction SilentlyContinue
        if (Test-Path "$binaryPath.sha256") {
            Write-Info "Verifying checksum..."
            $expectedHash = (Get-Content "$binaryPath.sha256" | Select-Object -First 1).Split()[0]
            $actualHash = (Get-FileHash $binaryPath -Algorithm SHA256).Hash.ToLower()

            if ($expectedHash -ne $actualHash) {
                Write-Err "Checksum verification failed!"
            }
            Write-Success "Checksum verified"
        }
    } catch {
        # Checksum verification optional
    }

    # Install binary
    Move-Item -Path $binaryPath -Destination "$BIN_DIR\agent.exe" -Force
    Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue

    Write-Success "Binary installed successfully!"
    return $true
}

function Build-FromSource {
    Write-Info "Building from source..."

    # Check for git
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Err "git is required. Please install Git for Windows: https://git-scm.com/downloads/win"
    }

    # Check for bun
    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
        Write-Info "Bun not found. Installing Bun..."
        try {
            irm bun.sh/install.ps1 | iex
            $env:BUN_INSTALL = "$env:USERPROFILE\.bun"
            $env:PATH = "$env:BUN_INSTALL\bin;$env:PATH"
        } catch {
            Write-Err "Bun installation failed. Please install manually: https://bun.sh"
        }

        if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
            Write-Err "Bun not found after installation"
        }
    }

    $bunVersion = bun --version
    Write-Info "Using Bun $bunVersion"

    $repoPath = "$INSTALL_DIR\repo"

    # Clone or update
    if (Test-Path $repoPath) {
        Write-Info "Updating existing installation..."
        Push-Location $repoPath
        try {
            git fetch --quiet origin
            git reset --hard origin/main --quiet
        } finally {
            Pop-Location
        }
    } else {
        Write-Info "Cloning repository..."
        git clone --quiet --depth 1 "$REPO_URL.git" $repoPath
    }

    # Install and build
    Push-Location $repoPath
    try {
        Write-Info "Installing dependencies..."
        bun install --frozen-lockfile 2>$null
        if ($LASTEXITCODE -ne 0) {
            bun install
        }

        Write-Info "Building..."
        bun run build
    } finally {
        Pop-Location
    }

    # Create wrapper script
    $wrapperPath = "$BIN_DIR\agent.cmd"
    @"
@echo off
bun "$INSTALL_DIR\repo\dist\index.js" %*
"@ | Out-File -FilePath $wrapperPath -Encoding ASCII -NoNewline

    Write-Success "Built from source successfully!"
}

function Test-Installation {
    $agentExe = "$BIN_DIR\agent.exe"
    $agentCmd = "$BIN_DIR\agent.cmd"

    if ((Test-Path $agentExe) -or (Test-Path $agentCmd)) {
        try {
            if (Test-Path $agentExe) {
                $version = & "$agentExe" --version 2>$null
            } else {
                $version = & bun "$INSTALL_DIR\repo\dist\index.js" --version 2>$null
            }
            Write-Success "Agent v$version installed successfully!"
        } catch {
            Write-Success "Agent installed successfully!"
        }
    } else {
        Write-Err "Installation verification failed"
    }
}

# Main
function Main {
    Write-Host ""
    Write-Info "Agent Base v2 Installer"
    Write-Host ""

    Test-Platform

    if (-not (Test-Path $INSTALL_DIR)) {
        New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
    }

    # Determine version
    if ($Version -eq "latest") {
        Get-LatestVersion
    }

    # Try binary download first (unless -Source flag)
    if (-not $Source -and $Version) {
        if (Install-Binary) {
            Test-Installation
            Write-Host ""
            Write-Success "Run 'agent' to start!"
            Write-Host ""
            exit 0
        } else {
            Write-Warn "Binary not available, falling back to source build..."
        }
    }

    # Fallback to building from source
    Build-FromSource
    Test-Installation

    Write-Host ""
    Write-Success "Run 'agent' to start!"
    Write-Host ""
}

Main
