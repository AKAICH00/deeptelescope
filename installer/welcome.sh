#!/bin/bash
# ============================================================
# AI Collab Swarm - Interactive Welcome & Setup
# Beautiful onboarding experience for new users
# ============================================================

# Colors & Formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

# Unicode characters
CHECK="✓"
CROSS="✗"
ARROW="→"
STAR="★"
ROCKET="🚀"
BRAIN="🧠"
BEE="🐝"
SEARCH="🔍"
GEAR="⚙️"

clear

# ============================================================
# Animated Banner
# ============================================================

print_banner() {
    echo -e "${CYAN}"
    echo '    ╔═══════════════════════════════════════════════════════════════╗'
    echo '    ║                                                               ║'
    echo '    ║     █████╗ ██╗     ██████╗ ██████╗ ██╗     ██╗      █████╗ ██████╗  ║'
    echo '    ║    ██╔══██╗██║    ██╔════╝██╔═══██╗██║     ██║     ██╔══██╗██╔══██╗ ║'
    echo '    ║    ███████║██║    ██║     ██║   ██║██║     ██║     ███████║██████╔╝ ║'
    echo '    ║    ██╔══██║██║    ██║     ██║   ██║██║     ██║     ██╔══██║██╔══██╗ ║'
    echo '    ║    ██║  ██║██║    ╚██████╗╚██████╔╝███████╗███████╗██║  ██║██████╔╝ ║'
    echo '    ║    ╚═╝  ╚═╝╚═╝     ╚═════╝ ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝╚═════╝  ║'
    echo '    ║                                                               ║'
    echo -e "    ║          ${WHITE}Multi-Agent Code Review & Semantic Search${CYAN}          ║"
    echo '    ║                                                               ║'
    echo '    ╚═══════════════════════════════════════════════════════════════╝'
    echo -e "${NC}"
}

# ============================================================
# Progress Bar
# ============================================================

progress_bar() {
    local current=$1
    local total=$2
    local width=40
    local percent=$((current * 100 / total))
    local filled=$((current * width / total))
    local empty=$((width - filled))

    printf "\r    ${DIM}["
    printf "%${filled}s" | tr ' ' '█'
    printf "%${empty}s" | tr ' ' '░'
    printf "]${NC} ${WHITE}%3d%%${NC}" $percent
}

# ============================================================
# Typing Effect
# ============================================================

type_text() {
    local text="$1"
    local delay="${2:-0.02}"
    for ((i=0; i<${#text}; i++)); do
        printf "%s" "${text:$i:1}"
        sleep $delay
    done
    echo
}

# ============================================================
# Feature Cards
# ============================================================

print_features() {
    echo
    echo -e "    ${WHITE}${BOLD}What You're Getting:${NC}"
    echo
    echo -e "    ${BEE}  ${CYAN}Swarm Code Review${NC}"
    echo -e "       ${DIM}4 AI agents review your code with self-correction${NC}"
    echo -e "       ${DIM}Generate → Correct → Vote consensus system${NC}"
    echo
    echo -e "    ${SEARCH}  ${CYAN}Semantic Code Search${NC}"
    echo -e "       ${DIM}Natural language search through your codebase${NC}"
    echo -e "       ${DIM}Powered by Qdrant vector database${NC}"
    echo
    echo -e "    ${BRAIN}  ${CYAN}AI Task Planning${NC}"
    echo -e "       ${DIM}Generate implementation plans for complex tasks${NC}"
    echo -e "       ${DIM}Step-by-step guidance with risk assessment${NC}"
    echo
    echo -e "    ${ROCKET}  ${CYAN}Full Pipeline${NC}"
    echo -e "       ${DIM}Complete Plan → Execute → Review workflow${NC}"
    echo -e "       ${DIM}End-to-end AI collaboration${NC}"
    echo
}

# ============================================================
# Requirements Check
# ============================================================

check_requirements() {
    echo -e "    ${WHITE}${BOLD}Checking Requirements:${NC}"
    echo

    local all_ok=true

    # Node.js
    printf "    ${DIM}Node.js 18+${NC} "
    if command -v node &> /dev/null; then
        local node_ver=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$node_ver" -ge 18 ]; then
            echo -e "${GREEN}${CHECK} v$(node -v | cut -d'v' -f2)${NC}"
        else
            echo -e "${RED}${CROSS} v$(node -v | cut -d'v' -f2) (need 18+)${NC}"
            all_ok=false
        fi
    else
        echo -e "${RED}${CROSS} Not installed${NC}"
        all_ok=false
    fi

    # npm
    printf "    ${DIM}npm${NC} "
    if command -v npm &> /dev/null; then
        echo -e "${GREEN}${CHECK} v$(npm -v)${NC}"
    else
        echo -e "${RED}${CROSS} Not installed${NC}"
        all_ok=false
    fi

    # Disk space
    printf "    ${DIM}Disk space${NC} "
    local free_mb=$(df -m "$HOME" | awk 'NR==2 {print $4}')
    if [ "$free_mb" -gt 500 ]; then
        echo -e "${GREEN}${CHECK} ${free_mb}MB available${NC}"
    else
        echo -e "${YELLOW}⚠ Low space (${free_mb}MB)${NC}"
    fi

    echo

    if [ "$all_ok" = false ]; then
        echo -e "    ${RED}Please install missing requirements and try again.${NC}"
        exit 1
    fi
}

# ============================================================
# HuggingFace Token Setup
# ============================================================

setup_hf_token() {
    echo -e "    ${WHITE}${BOLD}HuggingFace API Token:${NC}"
    echo

    if [ -n "$HF_TOKEN" ]; then
        echo -e "    ${GREEN}${CHECK}${NC} Found HF_TOKEN in environment"
        echo -e "    ${DIM}Token: ${HF_TOKEN:0:10}...${NC}"
        return 0
    fi

    echo -e "    ${DIM}The swarm uses HuggingFace's free inference API.${NC}"
    echo -e "    ${DIM}Get a token at: ${CYAN}https://huggingface.co/settings/tokens${NC}"
    echo

    read -p "    Enter your HF_TOKEN (or press Enter to skip): " user_token

    if [ -n "$user_token" ]; then
        export HF_TOKEN="$user_token"
        echo -e "    ${GREEN}${CHECK}${NC} Token saved for this session"
    else
        echo -e "    ${YELLOW}⚠${NC} No token provided. You can add it later to:"
        echo -e "    ${DIM}~/Library/Application Support/Claude/claude_desktop_config.json${NC}"
    fi
    echo
}

# ============================================================
# Installation
# ============================================================

run_installation() {
    echo -e "    ${WHITE}${BOLD}Installing AI Collab Swarm...${NC}"
    echo

    local steps=6

    # Step 1: Create directories
    progress_bar 1 $steps
    echo -e " ${DIM}Creating directories${NC}"
    mkdir -p "$HOME/.ai-collab"/{bin,config,data,logs}
    sleep 0.5

    # Step 2: Download Qdrant
    progress_bar 2 $steps
    echo -e " ${DIM}Downloading Qdrant${NC}"

    local QDRANT_VERSION="1.12.1"
    local ARCH=$(uname -m)
    local QDRANT_ARCH="x86_64-apple-darwin"
    [ "$ARCH" = "arm64" ] && QDRANT_ARCH="aarch64-apple-darwin"

    if [ ! -f "$HOME/.ai-collab/bin/qdrant" ]; then
        curl -sL "https://github.com/qdrant/qdrant/releases/download/v${QDRANT_VERSION}/qdrant-${QDRANT_ARCH}.tar.gz" -o /tmp/qdrant.tar.gz
        tar -xzf /tmp/qdrant.tar.gz -C "$HOME/.ai-collab/bin/"
        rm /tmp/qdrant.tar.gz
        chmod +x "$HOME/.ai-collab/bin/qdrant"
    fi
    sleep 0.3

    # Step 3: Configure Qdrant
    progress_bar 3 $steps
    echo -e " ${DIM}Configuring Qdrant${NC}"
    cat > "$HOME/.ai-collab/config/qdrant.yaml" << 'EOF'
storage:
  storage_path: ./data/qdrant
service:
  http_port: 6333
  grpc_port: 6334
log_level: WARN
EOF
    sleep 0.3

    # Step 4: Install MCP Server
    progress_bar 4 $steps
    echo -e " ${DIM}Installing MCP Server${NC}"

    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

    if [ -f "$SOURCE_DIR/dist/mcp-server.js" ]; then
        cp "$SOURCE_DIR/dist/mcp-server.js" "$HOME/.ai-collab/bin/"
        cp "$SOURCE_DIR/dist/mcp-server.js.map" "$HOME/.ai-collab/bin/" 2>/dev/null || true
    fi
    sleep 0.3

    # Step 5: Create launchers
    progress_bar 5 $steps
    echo -e " ${DIM}Creating launchers${NC}"

    cat > "$HOME/.ai-collab/bin/ai-collab" << 'EOF'
#!/bin/bash
INSTALL_DIR="$HOME/.ai-collab"
if ! pgrep -x "qdrant" > /dev/null; then
    "$INSTALL_DIR/bin/qdrant" --config-path "$INSTALL_DIR/config/qdrant.yaml" > "$INSTALL_DIR/logs/qdrant.log" 2>&1 &
    sleep 2
fi
export QDRANT_URL="http://localhost:6333"
export WORKSPACE_DIR="${WORKSPACE_DIR:-$(pwd)}"
exec node "$INSTALL_DIR/bin/mcp-server.js"
EOF
    chmod +x "$HOME/.ai-collab/bin/ai-collab"
    sleep 0.3

    # Step 6: Configure Claude
    progress_bar 6 $steps
    echo -e " ${DIM}Configuring Claude Desktop${NC}"

    local CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
    mkdir -p "$(dirname "$CLAUDE_CONFIG")"

    if [ -f "$CLAUDE_CONFIG" ]; then
        node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$CLAUDE_CONFIG', 'utf8'));
config.mcpServers = config.mcpServers || {};
config.mcpServers['ai-collab'] = {
    command: '$HOME/.ai-collab/bin/ai-collab',
    env: { HF_TOKEN: '${HF_TOKEN:-}', WORKSPACE_DIR: '$HOME' }
};
fs.writeFileSync('$CLAUDE_CONFIG', JSON.stringify(config, null, 2));
" 2>/dev/null || true
    else
        cat > "$CLAUDE_CONFIG" << EOF
{
  "mcpServers": {
    "ai-collab": {
      "command": "$HOME/.ai-collab/bin/ai-collab",
      "env": {
        "HF_TOKEN": "${HF_TOKEN:-}",
        "WORKSPACE_DIR": "$HOME"
      }
    }
  }
}
EOF
    fi

    sleep 0.5

    echo
    echo
}

# ============================================================
# Success Screen
# ============================================================

print_success() {
    echo -e "${GREEN}"
    echo '    ╔═══════════════════════════════════════════════════════════════╗'
    echo '    ║                                                               ║'
    echo '    ║                    ✨ SUCCESS! ✨                             ║'
    echo '    ║                                                               ║'
    echo '    ╚═══════════════════════════════════════════════════════════════╝'
    echo -e "${NC}"

    echo -e "    ${WHITE}${BOLD}Next Steps:${NC}"
    echo
    echo -e "    ${CYAN}1.${NC} Restart Claude Desktop ${DIM}(Cmd+Q, then reopen)${NC}"
    echo
    echo -e "    ${CYAN}2.${NC} Try these commands in Claude:"
    echo
    echo -e "       ${DIM}\"${NC}${WHITE}Review this code with the swarm${NC}${DIM}\"${NC}"
    echo -e "       ${DIM}\"${NC}${WHITE}Search my codebase for authentication${NC}${DIM}\"${NC}"
    echo -e "       ${DIM}\"${NC}${WHITE}Plan how to add dark mode to this app${NC}${DIM}\"${NC}"
    echo
    echo -e "    ${CYAN}3.${NC} Index your code for semantic search:"
    echo -e "       ${DIM}\"${NC}${WHITE}Index the ./src directory${NC}${DIM}\"${NC}"
    echo

    if [ -z "$HF_TOKEN" ]; then
        echo -e "    ${YELLOW}⚠ Don't forget to add your HF_TOKEN!${NC}"
        echo -e "    ${DIM}Edit: ~/Library/Application Support/Claude/claude_desktop_config.json${NC}"
        echo
    fi

    echo -e "    ${DIM}─────────────────────────────────────────────────────────${NC}"
    echo -e "    ${DIM}Installed to: ~/.ai-collab${NC}"
    echo -e "    ${DIM}Docs: https://github.com/your-repo/ai-collab-swarm${NC}"
    echo -e "    ${DIM}─────────────────────────────────────────────────────────${NC}"
    echo
}

# ============================================================
# Main Flow
# ============================================================

main() {
    print_banner
    sleep 0.5

    print_features
    sleep 0.5

    echo -e "    ${DIM}Press Enter to continue...${NC}"
    read

    clear
    print_banner

    check_requirements
    sleep 0.3

    setup_hf_token
    sleep 0.3

    run_installation

    print_success
}

main "$@"
