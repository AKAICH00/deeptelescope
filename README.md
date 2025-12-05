# 🐝 Deep Telescope - AI Code Review Swarm

> Self-correcting multi-agent code review system powered by a 4-agent swarm

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io/)

**Deep Telescope** uses a self-correcting 4-agent swarm to review your code with unprecedented accuracy. Each agent goes through a 3-phase protocol (Generate → Correct → Vote) to provide weighted consensus on code quality.

## ✨ Features

- 🐝 **4-Agent Swarm** - Qwen 2.5 Coder 32B + Llama 3 8B working in parallel
- 🔄 **Self-Correcting Protocol** - Generate (diverse) → Correct (precise) → Vote (consensus)
- ⚡ **15-Second Reviews** - Get comprehensive feedback in seconds, not hours
- 🔌 **MCP Server** - Works with Claude Desktop, Cursor, and any MCP client
- 🌐 **REST API** - Easy integration into your workflow
- 🔍 **Vector Search** - Semantic code search with Qdrant (coming soon)

## 🚀 Quick Start

### Install as MCP Server (Recommended)

```bash
npm install -g ai-collab-swarm
```

Add to your Claude Desktop config (`~/.config/claude/mcp.json`):

```json
{
  "mcpServers": {
    "deep-telescope": {
      "command": "node",
      "args": ["/path/to/ai-collab-swarm/dist/mcp-server.js"],
      "env": {
        "HF_TOKEN": "your_huggingface_token"
      }
    }
  }
}
```

### Use as CLI

```bash
git clone https://github.com/AKAICH00/deeptelescope.git
cd deeptelescope/ai-collab-plugin
npm install
npm run cli
```

### Deploy as API

```bash
# Using Docker
docker build -t deep-telescope .
docker run -p 3000:3000 -e HF_TOKEN=your_token deep-telescope

# Or deploy to Coolify/Railway/Fly.io
# See deployment guide in docs/
```

## 🎯 How It Works

### The 3-Phase Self-Correcting Protocol

```
┌─────────────────────────────────────────────────────┐
│  Agent Swarm (4 agents in parallel)                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Phase 1: GENERATE (T=0.8)                         │
│  → Diverse initial assessments                      │
│  → High temperature for creativity                  │
│                                                     │
│  Phase 2: CORRECT (T=0.1)                          │
│  → Self-critique and error correction               │
│  → Low temperature for precision                    │
│                                                     │
│  Phase 3: VOTE (T=0.0)                             │
│  → Deterministic final decision                     │
│  → Weighted consensus calculation                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Result**: 100% consensus in 14.5 seconds (tested)

## 📊 Example Output

```json
{
  "verdict": "APPROVED",
  "score": "92.5%",
  "threshold": "60%",
  "summary": "No significant issues found",
  "agents": [
    {
      "agent": "#0",
      "model": "Qwen2.5-Coder-32B-Instruct",
      "vote": "APPROVE",
      "confidence": "90%",
      "issues": []
    },
    // ... 3 more agents
  ]
}
```

## 🛠️ MCP Tools

When installed as an MCP server, Deep Telescope provides:

- **`review_code`** - 4-agent swarm review with consensus
- **`search_code`** - Semantic code search (Qdrant)
- **`index_code`** - Index workspace for search
- **`plan_task`** - AI-powered task planning
- **`full_pipeline`** - Complete Plan → Review workflow

## 💰 Hosted Service (Coming Soon)

Don't want to self-host? We're launching a hosted API:

- **Free Tier**: 10 reviews/month
- **Pro**: $49/month - 500 reviews
- **Team**: $199/month - 2,500 reviews
- **Enterprise**: Custom pricing

[Join the waitlist →](https://github.com/AKAICH00/deeptelescope/issues/1)

## 🏗️ Architecture

```
Deep Telescope
├── MCP Server (src/mcp-server.ts)
│   ├── review_code tool
│   ├── search_code tool
│   └── plan_task tool
├── REST API (api/server.ts)
│   └── POST /api/review
├── CLI (src/cli.ts)
│   └── Interactive terminal interface
└── Swarm Engine (src/agents/reviewer-swarm.ts)
    └── 4-agent self-correcting protocol
```

## 📦 Installation

### Prerequisites

- Node.js 18+
- HuggingFace API token ([get one here](https://huggingface.co/settings/tokens))

### From Source

```bash
git clone https://github.com/AKAICH00/deeptelescope.git
cd deeptelescope/ai-collab-plugin
npm install
npm run build:mcp
```

### From npm (Coming Soon)

```bash
npm install -g deep-telescope
```

## 🧪 Testing

```bash
# Test the swarm reviewer
npm run test:swarm

# Test the MCP server
npm run mcp

# Test the API
npm run api:dev
```

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
git clone https://github.com/AKAICH00/deeptelescope.git
cd deeptelescope/ai-collab-plugin
npm install
npm run cli -- --auto-confirm
```

## 📝 License

MIT License - see [LICENSE](LICENSE) for details

## 🙏 Acknowledgments

Built with:
- [HuggingFace Inference API](https://huggingface.co/inference-api)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Qdrant](https://qdrant.tech/) for vector search
- [OpenAI SDK](https://github.com/openai/openai-node) (HF compatibility)

## 📧 Contact

- **Author**: [@AKAICH00](https://github.com/AKAICH00)
- **Issues**: [GitHub Issues](https://github.com/AKAICH00/deeptelescope/issues)
- **Discussions**: [GitHub Discussions](https://github.com/AKAICH00/deeptelescope/discussions)

---

**⭐ Star this repo if you find it useful!**

Built with ❤️ by developers, for developers.
