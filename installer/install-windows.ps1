# ============================================================
# AI Collab Swarm - Windows Installer
# Installs MCP server + Qdrant for semantic code search
# ============================================================

#Requires -Version 5.1

param(
    [string]$HfToken = $env:HF_TOKEN,
    [switch]$SkipQdrant,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# Config
$INSTALL_DIR = "$env:USERPROFILE\.ai-collab"
$QDRANT_VERSION = "1.12.1"
$NODE_MIN_VERSION = 18

# Colors
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) { Write-Output $args }
    $host.UI.RawUI.ForegroundColor = $fc
}

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         AI Collab Swarm - Windows Installer               ║" -ForegroundColor Cyan
Write-Host "║   Multi-agent code review + semantic search               ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# Pre-flight checks
# ============================================================

Write-Host "[1/6] Checking prerequisites..." -ForegroundColor Blue

# Check Node.js
try {
    $nodeVersion = (node -v) -replace 'v', ''
    $nodeMajor = [int]($nodeVersion.Split('.')[0])
    if ($nodeMajor -lt $NODE_MIN_VERSION) {
        throw "Node.js $NODE_MIN_VERSION+ required (found v$nodeVersion)"
    }
    Write-Host "  [OK] Node.js v$nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Node.js is not installed or version too low" -ForegroundColor Red
    Write-Host "  Install from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check npm
try {
    $npmVersion = npm -v
    Write-Host "  [OK] npm v$npmVersion" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] npm is not installed" -ForegroundColor Red
    exit 1
}

# ============================================================
# Create install directory
# ============================================================

Write-Host "[2/6] Setting up install directory..." -ForegroundColor Blue

$dirs = @("$INSTALL_DIR", "$INSTALL_DIR\bin", "$INSTALL_DIR\data", "$INSTALL_DIR\logs", "$INSTALL_DIR\config")
foreach ($dir in $dirs) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

Write-Host "  [OK] Created $INSTALL_DIR" -ForegroundColor Green

# ============================================================
# Download and install Qdrant
# ============================================================

Write-Host "[3/6] Installing Qdrant vector database..." -ForegroundColor Blue

if (!$SkipQdrant) {
    $qdrantExe = "$INSTALL_DIR\bin\qdrant.exe"

    if (!(Test-Path $qdrantExe) -or $Force) {
        $arch = if ([Environment]::Is64BitOperatingSystem) { "x86_64" } else { "i686" }
        $qdrantUrl = "https://github.com/qdrant/qdrant/releases/download/v$QDRANT_VERSION/qdrant-$arch-pc-windows-msvc.zip"

        Write-Host "  Downloading Qdrant v$QDRANT_VERSION..." -ForegroundColor Gray

        $zipPath = "$env:TEMP\qdrant.zip"
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $qdrantUrl -OutFile $zipPath -UseBasicParsing

            Write-Host "  Extracting..." -ForegroundColor Gray
            Expand-Archive -Path $zipPath -DestinationPath "$INSTALL_DIR\bin" -Force
            Remove-Item $zipPath -Force

            Write-Host "  [OK] Qdrant installed" -ForegroundColor Green
        } catch {
            Write-Host "  [WARNING] Failed to download Qdrant: $_" -ForegroundColor Yellow
            Write-Host "  You can run Qdrant via Docker instead: docker run -p 6333:6333 qdrant/qdrant" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  [OK] Qdrant already installed" -ForegroundColor Green
    }

    # Create Qdrant config
    $qdrantConfig = @"
storage:
  storage_path: ./data/qdrant

service:
  http_port: 6333
  grpc_port: 6334

log_level: WARN
"@
    Set-Content -Path "$INSTALL_DIR\config\qdrant.yaml" -Value $qdrantConfig
    Write-Host "  [OK] Qdrant configured" -ForegroundColor Green
} else {
    Write-Host "  [SKIP] Qdrant installation skipped" -ForegroundColor Yellow
}

# ============================================================
# Install MCP Server
# ============================================================

Write-Host "[4/6] Installing AI Collab MCP server..." -ForegroundColor Blue

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceDir = Split-Path -Parent $scriptDir

$mcpServerSrc = "$sourceDir\dist\mcp-server.js"
$mcpServerDst = "$INSTALL_DIR\bin\mcp-server.js"

if (Test-Path $mcpServerSrc) {
    Copy-Item $mcpServerSrc $mcpServerDst -Force
    if (Test-Path "$sourceDir\dist\mcp-server.js.map") {
        Copy-Item "$sourceDir\dist\mcp-server.js.map" "$INSTALL_DIR\bin\" -Force
    }
    Write-Host "  [OK] MCP server installed" -ForegroundColor Green
} else {
    Write-Host "  Pre-built server not found, building..." -ForegroundColor Yellow
    Push-Location $sourceDir
    try {
        npm install
        npm run build:mcp
        Copy-Item "$sourceDir\dist\mcp-server.js" $mcpServerDst -Force
        Write-Host "  [OK] MCP server built and installed" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

# ============================================================
# Create launcher scripts
# ============================================================

Write-Host "[5/6] Creating launcher scripts..." -ForegroundColor Blue

# Qdrant launcher (batch)
$qdrantBat = @"
@echo off
cd /d "$INSTALL_DIR"
bin\qdrant.exe --config-path config\qdrant.yaml
"@
Set-Content -Path "$INSTALL_DIR\bin\start-qdrant.bat" -Value $qdrantBat

# MCP server launcher (batch)
$mcpBat = @"
@echo off
set QDRANT_URL=http://localhost:6333
if "%WORKSPACE_DIR%"=="" set WORKSPACE_DIR=%CD%
node "$INSTALL_DIR\bin\mcp-server.js"
"@
Set-Content -Path "$INSTALL_DIR\bin\start-mcp.bat" -Value $mcpBat

# Combined launcher
$combinedBat = @"
@echo off
setlocal

set INSTALL_DIR=$INSTALL_DIR

:: Check if Qdrant is running
tasklist /FI "IMAGENAME eq qdrant.exe" 2>NUL | find /I /N "qdrant.exe">NUL
if "%ERRORLEVEL%"=="1" (
    echo Starting Qdrant...
    start /B "" "%INSTALL_DIR%\bin\qdrant.exe" --config-path "%INSTALL_DIR%\config\qdrant.yaml" > "%INSTALL_DIR%\logs\qdrant.log" 2>&1
    timeout /t 2 /nobreak > NUL
)

:: Start MCP server
set QDRANT_URL=http://localhost:6333
if "%WORKSPACE_DIR%"=="" set WORKSPACE_DIR=%CD%
node "%INSTALL_DIR%\bin\mcp-server.js"
"@
Set-Content -Path "$INSTALL_DIR\bin\ai-collab.bat" -Value $combinedBat

# Stop script
$stopBat = @"
@echo off
echo Stopping AI Collab services...
taskkill /IM qdrant.exe /F 2>NUL && echo Qdrant stopped || echo Qdrant not running
echo Done
"@
Set-Content -Path "$INSTALL_DIR\bin\stop-all.bat" -Value $stopBat

Write-Host "  [OK] Launcher scripts created" -ForegroundColor Green

# ============================================================
# Configure Claude Desktop
# ============================================================

Write-Host "[6/6] Configuring Claude Desktop..." -ForegroundColor Blue

$claudeConfigDir = "$env:APPDATA\Claude"
$claudeConfig = "$claudeConfigDir\claude_desktop_config.json"

if (!(Test-Path $claudeConfigDir)) {
    New-Item -ItemType Directory -Path $claudeConfigDir -Force | Out-Null
}

# Backup existing config
if (Test-Path $claudeConfig) {
    $timestamp = Get-Date -Format "yyyyMMddHHmmss"
    Copy-Item $claudeConfig "$claudeConfig.backup.$timestamp"
    Write-Host "  [OK] Backed up existing config" -ForegroundColor Green
}

# Check for HF_TOKEN
if ([string]::IsNullOrEmpty($HfToken)) {
    Write-Host "  [WARNING] HF_TOKEN not set. You'll need to add it manually." -ForegroundColor Yellow
    Write-Host "  Get a token from: https://huggingface.co/settings/tokens" -ForegroundColor Yellow
    $HfToken = ""
} else {
    Write-Host "  [OK] Using HF_TOKEN from parameter/environment" -ForegroundColor Green
}

# Create/update config
$mcpServerConfig = @{
    command = "$INSTALL_DIR\bin\ai-collab.bat"
    env = @{
        HF_TOKEN = $HfToken
        WORKSPACE_DIR = $env:USERPROFILE
    }
}

if (Test-Path $claudeConfig) {
    try {
        $config = Get-Content $claudeConfig -Raw | ConvertFrom-Json
        if ($null -eq $config.mcpServers) {
            $config | Add-Member -NotePropertyName "mcpServers" -NotePropertyValue @{} -Force
        }
        $config.mcpServers | Add-Member -NotePropertyName "ai-collab" -NotePropertyValue $mcpServerConfig -Force
        $config | ConvertTo-Json -Depth 10 | Set-Content $claudeConfig
        Write-Host "  [OK] Updated existing Claude config" -ForegroundColor Green
    } catch {
        # Fallback: create new config
        $newConfig = @{
            mcpServers = @{
                "ai-collab" = $mcpServerConfig
            }
        }
        $newConfig | ConvertTo-Json -Depth 10 | Set-Content $claudeConfig
        Write-Host "  [OK] Created new Claude config" -ForegroundColor Green
    }
} else {
    $newConfig = @{
        mcpServers = @{
            "ai-collab" = $mcpServerConfig
        }
    }
    $newConfig | ConvertTo-Json -Depth 10 | Set-Content $claudeConfig
    Write-Host "  [OK] Created Claude config" -ForegroundColor Green
}

# ============================================================
# Add to PATH
# ============================================================

$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$INSTALL_DIR\bin*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$INSTALL_DIR\bin", "User")
    Write-Host "  [OK] Added to PATH" -ForegroundColor Green
}

# ============================================================
# Done!
# ============================================================

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║              Installation Complete!                       ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Installed to: $INSTALL_DIR" -ForegroundColor Cyan
Write-Host ""
Write-Host "Quick Start:" -ForegroundColor Cyan
Write-Host "  1. Restart Claude Desktop to load the MCP server"
Write-Host "  2. Ask Claude: `"Review this code with the swarm`""
Write-Host ""
Write-Host "Manual Commands:" -ForegroundColor Cyan
Write-Host "  Start Qdrant:    $INSTALL_DIR\bin\start-qdrant.bat"
Write-Host "  Start MCP:       $INSTALL_DIR\bin\start-mcp.bat"
Write-Host "  Stop all:        $INSTALL_DIR\bin\stop-all.bat"
Write-Host ""

if ([string]::IsNullOrEmpty($HfToken)) {
    Write-Host "[!] Don't forget to add your HF_TOKEN to:" -ForegroundColor Yellow
    Write-Host "    $claudeConfig" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "Tools available in Claude:" -ForegroundColor Cyan
Write-Host "  - review_code   - 4-agent swarm review"
Write-Host "  - search_code   - Semantic code search"
Write-Host "  - index_code    - Index files for search"
Write-Host "  - plan_task     - AI task planning"
Write-Host "  - full_pipeline - Complete workflow"
Write-Host ""
