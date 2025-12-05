#!/bin/bash
# ============================================================
# AI Collab Swarm - Mac Installer
# Installs MCP server + Qdrant for semantic code search
# ============================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Config
INSTALL_DIR="$HOME/.ai-collab"
QDRANT_VERSION="1.12.1"
NODE_MIN_VERSION="18"

# Save script location BEFORE any cd commands
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           AI Collab Swarm - Mac Installer                 ║"
echo "║   Multi-agent code review + semantic search               ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ============================================================
# Pre-flight checks
# ============================================================

echo -e "${BLUE}[1/6]${NC} Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Install from: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt "$NODE_MIN_VERSION" ]; then
    echo -e "${RED}Error: Node.js $NODE_MIN_VERSION+ required (found v$NODE_VERSION)${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Node.js v$(node -v | cut -d'v' -f2)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} npm v$(npm -v)"

# ============================================================
# Create install directory
# ============================================================

echo -e "${BLUE}[2/6]${NC} Setting up install directory..."

mkdir -p "$INSTALL_DIR"/{bin,config,data,logs}
cd "$INSTALL_DIR"

echo -e "  ${GREEN}✓${NC} Created $INSTALL_DIR"

# ============================================================
# Download and install Qdrant
# ============================================================

echo -e "${BLUE}[3/6]${NC} Installing Qdrant vector database..."

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    QDRANT_ARCH="aarch64-apple-darwin"
else
    QDRANT_ARCH="x86_64-apple-darwin"
fi

QDRANT_URL="https://github.com/qdrant/qdrant/releases/download/v${QDRANT_VERSION}/qdrant-${QDRANT_ARCH}.tar.gz"

if [ ! -f "$INSTALL_DIR/bin/qdrant" ]; then
    echo "  Downloading Qdrant v${QDRANT_VERSION} for ${ARCH}..."
    curl -sL "$QDRANT_URL" -o /tmp/qdrant.tar.gz
    tar -xzf /tmp/qdrant.tar.gz -C "$INSTALL_DIR/bin/"
    rm /tmp/qdrant.tar.gz
    chmod +x "$INSTALL_DIR/bin/qdrant"
    echo -e "  ${GREEN}✓${NC} Qdrant installed"
else
    echo -e "  ${GREEN}✓${NC} Qdrant already installed"
fi

# Create Qdrant config
cat > "$INSTALL_DIR/config/qdrant.yaml" << 'EOF'
storage:
  storage_path: ./data/qdrant

service:
  http_port: 6333
  grpc_port: 6334

log_level: WARN
EOF

echo -e "  ${GREEN}✓${NC} Qdrant configured"

# ============================================================
# Install MCP Server
# ============================================================

echo -e "${BLUE}[4/6]${NC} Installing AI Collab MCP server..."

# Copy the built server
if [ -f "$SOURCE_DIR/dist/mcp-server.js" ]; then
    cp "$SOURCE_DIR/dist/mcp-server.js" "$INSTALL_DIR/bin/"
    cp "$SOURCE_DIR/dist/mcp-server.js.map" "$INSTALL_DIR/bin/" 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} MCP server installed"
else
    echo -e "${YELLOW}  Warning: Pre-built server not found, building...${NC}"
    cd "$SOURCE_DIR"
    npm install
    npm run build:mcp
    cp "$SOURCE_DIR/dist/mcp-server.js" "$INSTALL_DIR/bin/"
    echo -e "  ${GREEN}✓${NC} MCP server built and installed"
fi

# ============================================================
# Create launcher scripts
# ============================================================

echo -e "${BLUE}[5/6]${NC} Creating launcher scripts..."

# Qdrant launcher
cat > "$INSTALL_DIR/bin/start-qdrant.sh" << EOF
#!/bin/bash
cd "$INSTALL_DIR"
./bin/qdrant --config-path ./config/qdrant.yaml
EOF
chmod +x "$INSTALL_DIR/bin/start-qdrant.sh"

# MCP server launcher
cat > "$INSTALL_DIR/bin/start-mcp.sh" << EOF
#!/bin/bash
export QDRANT_URL="http://localhost:6333"
export WORKSPACE_DIR="\${WORKSPACE_DIR:-\$(pwd)}"
node "$INSTALL_DIR/bin/mcp-server.js"
EOF
chmod +x "$INSTALL_DIR/bin/start-mcp.sh"

# Combined launcher (starts Qdrant in background)
cat > "$INSTALL_DIR/bin/ai-collab" << 'EOF'
#!/bin/bash
INSTALL_DIR="$HOME/.ai-collab"

# Start Qdrant if not running
if ! pgrep -x "qdrant" > /dev/null; then
    echo "Starting Qdrant..."
    "$INSTALL_DIR/bin/start-qdrant.sh" > "$INSTALL_DIR/logs/qdrant.log" 2>&1 &
    sleep 2
fi

# Start MCP server
export QDRANT_URL="http://localhost:6333"
export WORKSPACE_DIR="${WORKSPACE_DIR:-$(pwd)}"
node "$INSTALL_DIR/bin/mcp-server.js"
EOF
chmod +x "$INSTALL_DIR/bin/ai-collab"

# Stop script
cat > "$INSTALL_DIR/bin/stop-all.sh" << 'EOF'
#!/bin/bash
echo "Stopping AI Collab services..."
pkill -f "qdrant" 2>/dev/null && echo "Qdrant stopped" || echo "Qdrant not running"
echo "Done"
EOF
chmod +x "$INSTALL_DIR/bin/stop-all.sh"

echo -e "  ${GREEN}✓${NC} Launcher scripts created"

# ============================================================
# Configure Claude Desktop
# ============================================================

echo -e "${BLUE}[6/6]${NC} Configuring Claude Desktop..."

CLAUDE_CONFIG_DIR="$HOME/Library/Application Support/Claude"
CLAUDE_CONFIG="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"

mkdir -p "$CLAUDE_CONFIG_DIR"

# Check if config exists
if [ -f "$CLAUDE_CONFIG" ]; then
    echo -e "  ${YELLOW}Existing config found. Backing up...${NC}"
    cp "$CLAUDE_CONFIG" "$CLAUDE_CONFIG.backup.$(date +%Y%m%d%H%M%S)"
fi

# Check for HF_TOKEN
if [ -z "$HF_TOKEN" ]; then
    echo -e "${YELLOW}"
    echo "  ⚠️  HF_TOKEN not set. You'll need to add it manually."
    echo "     Get a token from: https://huggingface.co/settings/tokens"
    echo -e "${NC}"
    HF_TOKEN_VALUE=""
else
    HF_TOKEN_VALUE="$HF_TOKEN"
    echo -e "  ${GREEN}✓${NC} Using HF_TOKEN from environment"
fi

# Create or update config
if [ -f "$CLAUDE_CONFIG" ]; then
    # Try to merge with existing config using Node.js
    node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$CLAUDE_CONFIG', 'utf8'));
config.mcpServers = config.mcpServers || {};
config.mcpServers['ai-collab'] = {
    command: '$INSTALL_DIR/bin/ai-collab',
    env: {
        HF_TOKEN: '$HF_TOKEN_VALUE',
        WORKSPACE_DIR: process.env.HOME
    }
};
fs.writeFileSync('$CLAUDE_CONFIG', JSON.stringify(config, null, 2));
console.log('  ✓ Updated existing Claude config');
" 2>/dev/null || {
    # Fallback: create new config
    cat > "$CLAUDE_CONFIG" << EOF
{
  "mcpServers": {
    "ai-collab": {
      "command": "$INSTALL_DIR/bin/ai-collab",
      "env": {
        "HF_TOKEN": "$HF_TOKEN_VALUE",
        "WORKSPACE_DIR": "$HOME"
      }
    }
  }
}
EOF
    echo -e "  ${GREEN}✓${NC} Created new Claude config"
}
else
    cat > "$CLAUDE_CONFIG" << EOF
{
  "mcpServers": {
    "ai-collab": {
      "command": "$INSTALL_DIR/bin/ai-collab",
      "env": {
        "HF_TOKEN": "$HF_TOKEN_VALUE",
        "WORKSPACE_DIR": "$HOME"
      }
    }
  }
}
EOF
    echo -e "  ${GREEN}✓${NC} Created Claude config"
fi

# ============================================================
# Add to PATH (optional)
# ============================================================

SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
fi

if [ -n "$SHELL_RC" ]; then
    if ! grep -q "ai-collab" "$SHELL_RC"; then
        echo "" >> "$SHELL_RC"
        echo "# AI Collab Swarm" >> "$SHELL_RC"
        echo "export PATH=\"\$HOME/.ai-collab/bin:\$PATH\"" >> "$SHELL_RC"
        echo -e "  ${GREEN}✓${NC} Added to PATH in $SHELL_RC"
    fi
fi

# ============================================================
# Done!
# ============================================================

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Installation Complete! 🎉                    ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Installed to:${NC} $INSTALL_DIR"
echo ""
echo -e "${CYAN}Quick Start:${NC}"
echo "  1. Restart Claude Desktop to load the MCP server"
echo "  2. Ask Claude: \"Review this code with the swarm\""
echo ""
echo -e "${CYAN}Manual Commands:${NC}"
echo "  Start Qdrant:    $INSTALL_DIR/bin/start-qdrant.sh"
echo "  Start MCP:       $INSTALL_DIR/bin/start-mcp.sh"
echo "  Stop all:        $INSTALL_DIR/bin/stop-all.sh"
echo ""

if [ -z "$HF_TOKEN_VALUE" ]; then
    echo -e "${YELLOW}⚠️  Don't forget to add your HF_TOKEN to:${NC}"
    echo "   $CLAUDE_CONFIG"
    echo ""
fi

echo -e "${CYAN}Tools available in Claude:${NC}"
echo "  • review_code   - 4-agent swarm review"
echo "  • search_code   - Semantic code search"
echo "  • index_code    - Index files for search"
echo "  • plan_task     - AI task planning"
echo "  • full_pipeline - Complete workflow"
echo ""
