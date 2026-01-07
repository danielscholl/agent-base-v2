# Agent Harness Installer for Windows PowerShell
# Usage: irm https://raw.githubusercontent.com/danielscholl/agent-harness/main/install.ps1 | iex
#
# Options (when running locally):
#   .\install.ps1 -Source        # Force build from source
#   .\install.ps1 -Version v0.2.0  # Install specific version

param(
    [switch]$Source,
    [string]$Version = "latest"
)

$ErrorActionPreference = "Stop"

$REPO = "danielscholl/agent-harness"
$REPO_URL = "https://github.com/$REPO"
$INSTALL_DIR = "$env:LOCALAPPDATA\Programs\agent-harness"
$BIN_DIR = "$env:LOCALAPPDATA\Microsoft\WindowsApps"
$AGENT_HOME = "$env:USERPROFILE\.agent"

function Write-Info { param($msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host $msg -ForegroundColor Yellow }
function Write-Err { param($msg) Write-Host "Error: $msg" -ForegroundColor Red; throw $msg }

function Test-Platform {
    if ([Environment]::Is64BitOperatingSystem -eq $false) {
        Write-Err "Agent requires 64-bit Windows"
    }
    $script:PLATFORM = "windows-x64"
    Write-Info "Detected platform: $PLATFORM"
}

function Get-LatestVersion {
    try {
        # Use GitHub API for more reliable version detection
        $apiUrl = "https://api.github.com/repos/$REPO/releases/latest"
        $response = Invoke-RestMethod -Uri $apiUrl -ErrorAction Stop
        $script:Version = $response.tag_name
        if (-not $script:Version -or $script:Version -eq "latest") {
            Write-Err "Failed to extract version from GitHub API response"
        }
        Write-Info "Latest version: $Version"
    } catch {
        # Fallback to redirect method
        try {
            $null = Invoke-WebRequest -Uri "$REPO_URL/releases/latest" -MaximumRedirection 0 -ErrorAction Stop
        } catch {
            if ($_.Exception.Response.Headers.Location -match 'v\d+\.\d+\.\d+') {
                $script:Version = $matches[0]
                if (-not $script:Version -or $script:Version -eq "latest") {
                    Write-Err "Failed to extract version from redirect location"
                }
                Write-Info "Latest version: $Version"
            } else {
                Write-Warn "Could not determine latest version, will try source build"
                $script:Version = ""
            }
        }
    }
}

function Install-Binary {
    $archiveName = "agent-$PLATFORM.exe.zip"
    $downloadUrl = "$REPO_URL/releases/download/$Version/$archiveName"
    $checksumUrl = "$downloadUrl.sha256"
    $tmpDir = "$INSTALL_DIR\tmp"
    $archivePath = "$tmpDir\$archiveName"

    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

    Write-Info "Downloading agent $Version for $PLATFORM..."

    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath -ErrorAction Stop
    } catch {
        Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
        return $false
    }

    # Download and verify checksum
    try {
        Invoke-WebRequest -Uri $checksumUrl -OutFile "$archivePath.sha256" -ErrorAction SilentlyContinue
        if (Test-Path "$archivePath.sha256") {
            Write-Info "Verifying checksum..."
            $expectedHash = (Get-Content "$archivePath.sha256" | Select-Object -First 1).Split()[0]
            $actualHash = (Get-FileHash $archivePath -Algorithm SHA256).Hash.ToLower()

            if ($expectedHash -ne $actualHash) {
                Write-Err "Checksum verification failed!"
            }
            Write-Success "Checksum verified"
        }
    } catch {
        # Checksum verification optional
    }

    # Extract archive
    Write-Info "Extracting..."
    $extractDir = "$INSTALL_DIR\bin"
    if (Test-Path $extractDir) {
        Remove-Item -Path $extractDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
    Expand-Archive -Path $archivePath -DestinationPath $extractDir -Force

    # Copy binary to WindowsApps (in PATH)
    Copy-Item -Path "$extractDir\agent.exe" -Destination "$BIN_DIR\agent.exe" -Force

    # Copy assets to ~/.agent/ (canonical data location)
    if (-not (Test-Path $AGENT_HOME)) {
        New-Item -ItemType Directory -Path $AGENT_HOME -Force | Out-Null
    }
    if (Test-Path "$extractDir\prompts") {
        Copy-Item -Path "$extractDir\prompts" -Destination "$AGENT_HOME\prompts" -Recurse -Force
    }
    if (Test-Path "$extractDir\_bundled_skills") {
        Copy-Item -Path "$extractDir\_bundled_skills" -Destination "$AGENT_HOME\_bundled_skills" -Recurse -Force
    }
    if (Test-Path "$extractDir\_bundled_commands") {
        Copy-Item -Path "$extractDir\_bundled_commands" -Destination "$AGENT_HOME\_bundled_commands" -Recurse -Force
    }

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
        # Note: This downloads and executes the official Bun installer from bun.sh
        # Users should be aware this introduces a supply chain dependency on bun.sh
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
            git fetch --quiet origin --tags
            # Checkout specific version if provided, otherwise use main
            if ($Version -and $Version -ne "latest") {
                Write-Info "Checking out $Version..."
                git checkout --quiet $Version 2>$null
                if ($LASTEXITCODE -ne 0) {
                    git checkout --quiet "tags/$Version" 2>$null
                    if ($LASTEXITCODE -ne 0) {
                        throw "Failed to checkout version $Version. Verify the version exists."
                    }
                }
            } else {
                git reset --hard origin/main --quiet
            }
        } finally {
            Pop-Location
        }
    } else {
        Write-Info "Cloning repository..."
        if ($Version -and $Version -ne "latest") {
            git clone --quiet --branch $Version --depth 1 "$REPO_URL.git" $repoPath 2>$null
            if ($LASTEXITCODE -ne 0) {
                git clone --quiet "$REPO_URL.git" $repoPath
                Push-Location $repoPath
                try {
                    git checkout --quiet $Version 2>$null
                    if ($LASTEXITCODE -ne 0) {
                        git checkout --quiet "tags/$Version" 2>$null
                        if ($LASTEXITCODE -ne 0) {
                            throw "Failed to checkout version $Version. Verify the version exists."
                        }
                    }
                } finally {
                    Pop-Location
                }
            }
        } else {
            git clone --quiet --depth 1 "$REPO_URL.git" $repoPath
        }
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

    # Copy assets to ~/.agent/ (canonical data location)
    if (-not (Test-Path $AGENT_HOME)) {
        New-Item -ItemType Directory -Path $AGENT_HOME -Force | Out-Null
    }
    $distDir = "$repoPath\dist"
    if (Test-Path "$distDir\prompts") {
        Copy-Item -Path "$distDir\prompts" -Destination "$AGENT_HOME\prompts" -Recurse -Force
    }
    if (Test-Path "$distDir\_bundled_skills") {
        Copy-Item -Path "$distDir\_bundled_skills" -Destination "$AGENT_HOME\_bundled_skills" -Recurse -Force
    }
    if (Test-Path "$distDir\_bundled_commands") {
        Copy-Item -Path "$distDir\_bundled_commands" -Destination "$AGENT_HOME\_bundled_commands" -Recurse -Force
    }

    # Create wrapper script
    $wrapperPath = "$BIN_DIR\agent.cmd"
    @"
@echo off
bun "$INSTALL_DIR\repo\dist\index.js" %*
"@ | Out-File -FilePath $wrapperPath -Encoding ASCII

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
            if (-not $version) {
                Write-Err "Agent binary found but failed to execute"
            }
            Write-Success "Agent v$version installed successfully!"
        } catch {
            Write-Err "Installation verification failed: $($_.Exception.Message)"
        }
    } else {
        Write-Err "Installation verification failed"
    }
}

# Main
function Main {
    Write-Host ""
    Write-Info "Agent Harness Installer"
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
            return
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
