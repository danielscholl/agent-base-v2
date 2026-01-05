@echo off
REM Agent Base v2 Installer for Windows CMD
REM Usage: curl -fsSL https://raw.githubusercontent.com/danielscholl/agent-base-v2/main/install.cmd -o install.cmd && install.cmd && del install.cmd
REM
REM This script bootstraps the PowerShell installer for full functionality.
REM For direct CMD installation, it falls back to source build.

setlocal enabledelayedexpansion

echo.
echo Agent Base v2 Installer
echo.

REM Try PowerShell installer first (supports binary download)
where powershell >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo Launching PowerShell installer...
    powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/danielscholl/agent-base-v2/main/install.ps1 | iex"
    exit /b %ERRORLEVEL%
)

REM Fallback: Direct CMD installation (source build only)
echo PowerShell not available, using CMD fallback...

set "REPO=danielscholl/agent-base-v2"
set "INSTALL_DIR=%LOCALAPPDATA%\Programs\agent-base-v2"
set "BIN_DIR=%LOCALAPPDATA%\Microsoft\WindowsApps"

REM Check for git
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Git not found. Please install Git for Windows first:
    echo   https://git-scm.com/downloads/win
    exit /b 1
)

REM Check for bun
where bun >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Bun not found. Please install Bun first:
    echo   irm bun.sh/install.ps1 ^| iex
    echo Or visit: https://bun.sh
    exit /b 1
)

for /f "tokens=*" %%i in ('bun --version') do set BUN_VERSION=%%i
echo Using Bun %BUN_VERSION%

echo Installing agent-base-v2...

REM Create directories
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

set "REPO_PATH=%INSTALL_DIR%\repo"

REM Clone or update
if exist "%REPO_PATH%" (
    echo Updating existing installation...
    pushd "%REPO_PATH%"
    git fetch --quiet origin
    git reset --hard origin/main --quiet
    popd
) else (
    echo Cloning repository...
    git clone --quiet --depth 1 "https://github.com/%REPO%.git" "%REPO_PATH%"
)

pushd "%REPO_PATH%"

REM Install and build
echo Installing dependencies...
call bun install --frozen-lockfile 2>nul || call bun install

echo Building...
call bun run build

popd

REM Create batch wrapper
echo @echo off > "%BIN_DIR%\agent.cmd"
echo bun "%INSTALL_DIR%\repo\dist\index.js" %%* >> "%BIN_DIR%\agent.cmd"

echo.
echo Installation complete!
echo Run 'agent' to start!
echo.

endlocal
