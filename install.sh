#!/bin/bash
# AI Collab Swarm - Installation Script for Mac/Linux

set -e

echo "🤖 AI Collab Swarm Installer"
echo "=============================="
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Install globally
echo ""
echo "📦 Installing ai-collab-swarm globally..."
npm install -g .

echo ""
echo "✅ Installation complete!"
echo ""

# Check for Claude config
CLAUDE_CONFIG="$HOME/.config/claude/mcp.json"
CLAUDE_DIR="$HOME/.config/claude"

if [ ! -d "$CLAUDE_DIR" ]; then
    echo "📁 Creating Claude config directory..."
    mkdir -p "$CLAUDE_DIR"
fi

# Get installation path
INSTALL_PATH=$(npm root -g)/ai-collab-swarm/dist/mcp-server.js

echo "🔧 Configuration"
echo "================"
echo ""
echo "Add this to $CLAUDE_CONFIG:"
echo ""
cat <<EOF
{
  "mcpServers": {
    "ai-collab": {
      "command": "node",
      "args": ["$INSTALL_PATH"],
      "env": {
        "HF_TOKEN": "your_huggingface_token_here",
        "ANTHROPIC_API_KEY": "your_anthropic_key_here"
      }
    }
  }
}
EOF

echo ""
echo "📝 Get API keys:"
echo "  • HuggingFace: https://huggingface.co/settings/tokens"
echo "  • Anthropic: https://console.anthropic.com/settings/keys"
echo ""
echo "🎉 Done! Restart Claude Desktop to use the swarm."
