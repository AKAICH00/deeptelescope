#!/bin/bash

# AI Collaboration Extension Installer
# Self-installing script for macOS
# Supports: VS Code, Antigravity IDE, Cursor

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
RESOURCES_DIR="$SCRIPT_DIR/../Resources"

clear
echo ""
echo -e "${BLUE}${BOLD}"
echo "  ╔═══════════════════════════════════════════════════════════╗"
echo "  ║                                                           ║"
echo "  ║        🤖  AI Collaboration Extension Installer  🤖       ║"
echo "  ║                                                           ║"
echo "  ║   Multi-Agent AI Orchestration                            ║"
echo "  ║   • Opus Planner + Codex Coder                           ║"
echo "  ║   • Self-Correcting Swarm Review                         ║"
echo "  ║                                                           ║"
echo "  ║   Supports: Antigravity IDE, VS Code, Cursor             ║"
echo "  ║                                                           ║"
echo "  ╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# Find VSIX file first
VSIX_FILE="$RESOURCES_DIR/ai-collab-vscode-0.1.0.vsix"
if [ ! -f "$VSIX_FILE" ]; then
    echo -e "${RED}✗${NC} Extension file not found: $VSIX_FILE"
    exit 1
fi

# Detect available editors
echo -e "${YELLOW}Detecting compatible editors...${NC}"
echo ""

EDITORS=()
EDITOR_NAMES=()
EDITOR_CMDS=()

# Check for Antigravity IDE
if [ -f "$HOME/.antigravity/antigravity/bin/antigravity" ]; then
    EDITORS+=("antigravity")
    EDITOR_NAMES+=("Antigravity IDE")
    EDITOR_CMDS+=("$HOME/.antigravity/antigravity/bin/antigravity")
    echo -e "${GREEN}✓${NC} Antigravity IDE found"
elif [ -d "/Applications/Antigravity.app" ]; then
    EDITORS+=("antigravity")
    EDITOR_NAMES+=("Antigravity IDE")
    EDITOR_CMDS+=("/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity")
    echo -e "${GREEN}✓${NC} Antigravity IDE found"
fi

# Check for VS Code
if command -v code &> /dev/null; then
    EDITORS+=("vscode")
    EDITOR_NAMES+=("Visual Studio Code")
    EDITOR_CMDS+=("code")
    echo -e "${GREEN}✓${NC} Visual Studio Code found"
elif [ -d "/Applications/Visual Studio Code.app" ]; then
    EDITORS+=("vscode")
    EDITOR_NAMES+=("Visual Studio Code")
    EDITOR_CMDS+=("/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code")
    echo -e "${GREEN}✓${NC} Visual Studio Code found"
fi

# Check for Cursor
if command -v cursor &> /dev/null; then
    EDITORS+=("cursor")
    EDITOR_NAMES+=("Cursor")
    EDITOR_CMDS+=("cursor")
    echo -e "${GREEN}✓${NC} Cursor found"
elif [ -d "/Applications/Cursor.app" ]; then
    EDITORS+=("cursor")
    EDITOR_NAMES+=("Cursor")
    EDITOR_CMDS+=("/Applications/Cursor.app/Contents/Resources/app/bin/cursor")
    echo -e "${GREEN}✓${NC} Cursor found"
fi

# No editors found
if [ ${#EDITORS[@]} -eq 0 ]; then
    echo -e "${RED}✗${NC} No compatible editors found!"
    echo ""
    echo "Please install one of the following:"
    echo "  • Antigravity IDE: https://antigravity.dev"
    echo "  • VS Code: https://code.visualstudio.com"
    echo "  • Cursor: https://cursor.sh"
    echo ""
    echo "Press any key to exit..."
    read -n 1 -s
    exit 1
fi

echo ""
echo -e "${GREEN}✓${NC} Extension package found"

# Select editor if multiple found
SELECTED_IDX=0
if [ ${#EDITORS[@]} -gt 1 ]; then
    echo ""
    echo -e "${BOLD}Multiple editors found. Select one to install:${NC}"
    echo ""
    for i in "${!EDITOR_NAMES[@]}"; do
        echo "  $((i+1)). ${EDITOR_NAMES[$i]}"
    done
    echo ""
    read -p "Enter choice (1-${#EDITORS[@]}): " choice
    SELECTED_IDX=$((choice-1))

    if [ $SELECTED_IDX -lt 0 ] || [ $SELECTED_IDX -ge ${#EDITORS[@]} ]; then
        SELECTED_IDX=0
    fi
fi

SELECTED_EDITOR="${EDITOR_NAMES[$SELECTED_IDX]}"
SELECTED_CMD="${EDITOR_CMDS[$SELECTED_IDX]}"

# Ask for confirmation
echo ""
echo -e "${BOLD}Ready to install:${NC}"
echo "  • AI Collaboration Extension v0.1.0"
echo "  • Target: ${CYAN}${SELECTED_EDITOR}${NC}"
echo "  • Features: Plan Task, Execute Pipeline, Review Code"
echo ""
read -p "Continue with installation? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Installation cancelled."
    exit 0
fi

# Install extension
echo ""
echo -e "${YELLOW}Installing extension to ${SELECTED_EDITOR}...${NC}"

"$SELECTED_CMD" --install-extension "$VSIX_FILE" 2>&1 | grep -v "createInstance" || true

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Extension installed successfully!"
else
    echo -e "${RED}✗${NC} Installation failed"
    exit 1
fi

# Configuration prompt
echo ""
echo -e "${BOLD}Configuration${NC}"
echo ""

# Ask for API keys
read -p "Would you like to configure API keys now? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${YELLOW}Note: Keys are stored in editor settings${NC}"
    echo ""

    # Determine settings directory based on editor
    case "${EDITORS[$SELECTED_IDX]}" in
        "antigravity")
            SETTINGS_DIR="$HOME/Library/Application Support/Antigravity/User"
            ;;
        "vscode")
            SETTINGS_DIR="$HOME/Library/Application Support/Code/User"
            ;;
        "cursor")
            SETTINGS_DIR="$HOME/Library/Application Support/Cursor/User"
            ;;
    esac

    SETTINGS_FILE="$SETTINGS_DIR/settings.json"
    mkdir -p "$SETTINGS_DIR"

    # Anthropic API Key
    echo -e "Enter your ${BOLD}Anthropic API Key${NC} (for Claude Opus/Codex):"
    echo -e "${BLUE}(Get one at: https://console.anthropic.com/settings/keys)${NC}"
    read -s ANTHROPIC_KEY
    echo ""

    if [ -n "$ANTHROPIC_KEY" ]; then
        python3 << EOF
import json
import os

settings_file = "$SETTINGS_FILE"
try:
    with open(settings_file, 'r') as f:
        settings = json.load(f)
except:
    settings = {}

settings['aiCollab.anthropicApiKey'] = "$ANTHROPIC_KEY"

with open(settings_file, 'w') as f:
    json.dump(settings, f, indent=4)

print("✓ Anthropic API key saved")
EOF
    fi

    # HuggingFace Token
    echo ""
    echo -e "Enter your ${BOLD}HuggingFace Token${NC} (for Swarm Review):"
    echo -e "${BLUE}(Get one at: https://huggingface.co/settings/tokens)${NC}"
    read -s HF_TOKEN
    echo ""

    if [ -n "$HF_TOKEN" ]; then
        python3 << EOF
import json

settings_file = "$SETTINGS_FILE"
try:
    with open(settings_file, 'r') as f:
        settings = json.load(f)
except:
    settings = {}

settings['aiCollab.hfToken'] = "$HF_TOKEN"

with open(settings_file, 'w') as f:
    json.dump(settings, f, indent=4)

print("✓ HuggingFace token saved")
EOF
    fi
fi

# Success message
echo ""
echo -e "${GREEN}${BOLD}"
echo "  ╔═══════════════════════════════════════════════════════════╗"
echo "  ║                                                           ║"
echo "  ║          ✅  Installation Complete!  ✅                   ║"
echo "  ║                                                           ║"
echo "  ╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo -e "${BOLD}How to use:${NC}"
echo ""
echo "  1. Open/Restart ${CYAN}${SELECTED_EDITOR}${NC}"
echo "  2. Press ${BOLD}Cmd+Shift+P${NC} to open Command Palette"
echo "  3. Type ${BOLD}AI Collab${NC} to see available commands:"
echo ""
echo "     • ${BLUE}AI Collab: Plan Task with Opus${NC}"
echo "       Plan any coding task with Claude Opus"
echo ""
echo "     • ${BLUE}AI Collab: Execute Full Pipeline${NC}"
echo "       Plan → Execute → Review in one go"
echo ""
echo "     • ${BLUE}AI Collab: Review Code with Swarm${NC}"
echo "       Self-correcting multi-agent review"
echo ""
echo "     • ${BLUE}AI Collab: Configure Settings${NC}"
echo "       Set API keys and preferences"
echo ""

# Ask to open editor
read -p "Open ${SELECTED_EDITOR} now? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ "${EDITORS[$SELECTED_IDX]}" == "antigravity" ]; then
        open -a "Antigravity" &
    else
        "$SELECTED_CMD" &
    fi
fi

echo ""
echo "Enjoy AI-powered coding! 🚀"
echo ""
echo "Press any key to close this window..."
read -n 1 -s
