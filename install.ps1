# AI Collab Swarm - Installation Script for Windows

Write-Host "🤖 AI Collab Swarm Installer" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

# Check for Node.js
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org"
    exit 1
}

# Install globally
Write-Host ""
Write-Host "📦 Installing ai-collab-swarm globally..." -ForegroundColor Yellow
npm install -g .

Write-Host ""
Write-Host "✅ Installation complete!" -ForegroundColor Green
Write-Host ""

# Check for Claude config
$claudeConfig = "$env:APPDATA\Claude\mcp.json"
$claudeDir = "$env:APPDATA\Claude"

if (!(Test-Path $claudeDir)) {
    Write-Host "📁 Creating Claude config directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null
}

# Get installation path
$installPath = (npm root -g) + "\ai-collab-swarm\dist\mcp-server.js"

Write-Host "🔧 Configuration" -ForegroundColor Cyan
Write-Host "================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Add this to $claudeConfig :" -ForegroundColor Yellow
Write-Host ""

$config = @"
{
  "mcpServers": {
    "ai-collab": {
      "command": "node",
      "args": ["$installPath"],
      "env": {
        "HF_TOKEN": "your_huggingface_token_here",
        "ANTHROPIC_API_KEY": "your_anthropic_key_here"
      }
    }
  }
}
"@

Write-Host $config -ForegroundColor White

Write-Host ""
Write-Host "📝 Get API keys:" -ForegroundColor Cyan
Write-Host "  • HuggingFace: https://huggingface.co/settings/tokens"
Write-Host "  • Anthropic: https://console.anthropic.com/settings/keys"
Write-Host ""
Write-Host "🎉 Done! Restart Claude Desktop to use the swarm." -ForegroundColor Green
