# AI Collab Swarm - Installation Guide

Complete installation guide for Mac and Windows with embedded Qdrant vector database.

## Quick Install

### Mac

```bash
# Clone and install
git clone https://github.com/your-repo/ai-collab-swarm.git
cd ai-collab-swarm
npm install
npm run build:mcp

# Run installer (downloads Qdrant, configures Claude Desktop)
chmod +x installer/install-mac.sh
./installer/install-mac.sh
```

Or one-liner:

```bash
git clone https://github.com/your-repo/ai-collab-swarm.git && cd ai-collab-swarm && npm install && npm run build:mcp && ./installer/install-mac.sh
```

### Windows (PowerShell as Administrator)

```powershell
# Clone and install
git clone https://github.com/your-repo/ai-collab-swarm.git
cd ai-collab-swarm
npm install
npm run build:mcp

# Run installer
Set-ExecutionPolicy Bypass -Scope Process -Force
.\installer\install-windows.ps1
```

### Cross-Platform (Node.js)

```bash
npm install
npm run build:mcp
npm run setup
```

## What Gets Installed

```
~/.ai-collab/
├── bin/
│   ├── qdrant           # Qdrant vector DB binary
│   ├── mcp-server.js    # MCP server
│   └── ai-collab        # Combined launcher
├── config/
│   └── qdrant.yaml      # Qdrant configuration
├── data/
│   └── qdrant/          # Vector database storage
└── logs/
    └── qdrant.log       # Qdrant logs
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `HF_TOKEN` | HuggingFace API token | **Yes** |
| `WORKSPACE_DIR` | Working directory | No (uses cwd) |
| `QDRANT_URL` | Qdrant server URL | No (localhost:6333) |

### Getting HF_TOKEN

1. Go to https://huggingface.co/settings/tokens
2. Create a new token with "Read" access
3. Set it before running the installer:

**Mac/Linux:**
```bash
export HF_TOKEN="hf_xxxxxx"
./installer/install-mac.sh
```

**Windows:**
```powershell
$env:HF_TOKEN = "hf_xxxxxx"
.\installer\install-windows.ps1
```

## Claude Desktop Configuration

The installer automatically configures Claude Desktop. The config is at:

- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Manual configuration:

```json
{
  "mcpServers": {
    "ai-collab": {
      "command": "/Users/you/.ai-collab/bin/ai-collab",
      "env": {
        "HF_TOKEN": "hf_xxxxxx",
        "WORKSPACE_DIR": "/your/project/path"
      }
    }
  }
}
```

## Docker Alternative (No Binary Install)

If you prefer Docker for Qdrant:

```bash
# Start Qdrant
docker run -d -p 6333:6333 -p 6334:6334 \
  -v ~/.ai-collab/data/qdrant:/qdrant/storage \
  qdrant/qdrant

# Then just run the MCP server
npm run mcp:start
```

## Verifying Installation

### Check Qdrant

```bash
curl http://localhost:6333/health
# Should return: {"status":"ok"}
```

### Check MCP Server

```bash
# Mac/Linux
~/.ai-collab/bin/ai-collab

# Windows
%USERPROFILE%\.ai-collab\bin\ai-collab.bat
```

You should see:
```
AI Collab MCP Server running on stdio
Workspace: /your/path
Swarm size: 4 agents
```

### Test in Claude Desktop

1. Restart Claude Desktop
2. Ask: "What MCP tools do you have?"
3. You should see: `review_code`, `search_code`, `index_code`, `plan_task`, `full_pipeline`

## VS Code Extension (Optional)

The VS Code extension is still available:

```bash
npm run build:extension
npm run package
code --install-extension ai-collab-vscode-1.0.0.vsix
```

## Troubleshooting

### "HF_TOKEN not set"

Add your token to the Claude Desktop config file or set it in your environment.

### "Connection refused" (Qdrant)

Qdrant might not be running. Start it manually:

```bash
# Mac/Linux
~/.ai-collab/bin/start-qdrant.sh

# Windows
%USERPROFILE%\.ai-collab\bin\start-qdrant.bat
```

### "Permission denied" (Mac)

```bash
chmod +x ~/.ai-collab/bin/*
```

### "Cannot be opened" (Mac - Gatekeeper)

```bash
xattr -d com.apple.quarantine ~/.ai-collab/bin/qdrant
```

### MCP Server Not Loading

1. Check Claude Desktop logs
2. Verify the path in `claude_desktop_config.json`
3. Try running the launcher directly to see errors

## Uninstalling

### Mac/Linux

```bash
rm -rf ~/.ai-collab
# Remove from Claude Desktop config manually
```

### Windows

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.ai-collab"
# Remove from Claude Desktop config manually
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Claude Desktop                          │
│  "Review this code with the swarm"                      │
└─────────────────────┬───────────────────────────────────┘
                      │ MCP Protocol (stdio)
                      ▼
┌─────────────────────────────────────────────────────────┐
│              AI Collab MCP Server                        │
├─────────────────────────────────────────────────────────┤
│  Tools:                                                  │
│  • review_code → HuggingFace Swarm (4 agents)          │
│  • search_code → Qdrant Vector Search                   │
│  • index_code  → Qdrant Indexing                        │
│  • plan_task   → Qwen Planning                          │
│  • full_pipeline → Complete Workflow                    │
└─────────────────────┬───────────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
┌─────────────────┐    ┌─────────────────────┐
│  HuggingFace    │    │  Qdrant (local)     │
│  Inference API  │    │  Vector Database    │
│  - Qwen 32B     │    │  Port 6333          │
│  - Llama 3 8B   │    │  Cosine similarity  │
└─────────────────┘    └─────────────────────┘
```
