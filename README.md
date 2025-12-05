# AI Collab Swarm

Multi-agent AI orchestration MCP server with self-correcting swarm review, semantic code search, and task planning.

## Features

- **🐝 Swarm Review**: 4-agent self-correcting code review (Generate → Correct → Vote)
- **🔍 Semantic Search**: Qdrant-powered code search with natural language queries
- **📋 Task Planning**: AI-powered execution plan generation
- **🔄 Full Pipeline**: End-to-end Plan → Review workflow

## Quick Start

### As MCP Server (Recommended)

Add to your Claude Desktop config (`~/.config/claude/mcp.json` or `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ai-collab": {
      "command": "node",
      "args": ["/path/to/ai-collab-plugin/dist/mcp-server.js"],
      "env": {
        "HF_TOKEN": "your-huggingface-token",
        "WORKSPACE_DIR": "/your/project/directory"
      }
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "ai-collab": {
      "command": "ai-collab-swarm",
      "env": {
        "HF_TOKEN": "your-huggingface-token"
      }
    }
  }
}
```

### Build from Source

```bash
cd ai-collab-plugin
npm install
npm run build:mcp
```

## MCP Tools Available

### `review_code`
Self-correcting 4-agent swarm review with weighted consensus.

```
Input:
- code: string (required) - The code to review
- task: string (required) - What the code should do
- focus: "correctness" | "security" | "performance" | "quality" | "all"

Output:
- verdict: "APPROVED" | "REJECTED"
- score: weighted approval percentage
- agents: individual agent votes and issues
```

### `search_code`
Semantic search through indexed code using Qdrant.

```
Input:
- query: string (required) - Natural language search
- limit: number (default: 5) - Max results
- collection: string (default: "code_embeddings")

Output:
- results: [{score, file, content, line}]
```

### `index_code`
Index code files for semantic search.

```
Input:
- path: string (required) - File or directory to index
- collection: string (default: "code_embeddings")

Output:
- Indexed chunk count and file count
```

### `plan_task`
Generate execution plan for a development task.

```
Input:
- task: string (required) - Task description
- context: string - Additional context

Output:
- understanding: Task summary
- steps: [{id, action, target}]
- risks: Potential issues
```

### `full_pipeline`
Complete Plan → Review workflow.

```
Input:
- task: string (required) - Task to complete
- autoApprove: boolean (default: false)

Output:
- plan: Generated plan
- review: Swarm review of plan
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `HF_TOKEN` | HuggingFace API token for swarm models | Yes |
| `WORKSPACE_DIR` | Working directory (default: cwd) | No |
| `QDRANT_URL` | Qdrant server URL (default: http://localhost:6333) | No |

## VS Code Extension (Legacy)

The VS Code extension is still available for local IDE integration:

```bash
npm run build:extension
npm run package
# Install the .vsix file
```

## How the Swarm Works

```
┌─────────────────────────────────────────────────────────┐
│                 Self-Correcting Swarm                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Agent #0 ─┬─ Phase 1: GENERATE (T=0.8, diverse)       │
│  Agent #1 ─┤─ Phase 2: CORRECT  (T=0.1, precise)       │
│  Agent #2 ─┤─ Phase 3: VOTE     (T=0.0, deterministic) │
│  Agent #3 ─┘                                           │
│                                                         │
│  Consensus: Weighted by confidence (60% threshold)      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Models used:
- Qwen/Qwen2.5-Coder-32B-Instruct
- meta-llama/Meta-Llama-3-8B-Instruct

## CLI Usage

```bash
# Interactive CLI
npm run cli

# With auto-confirm
npm run cli -- --auto-confirm

# Direct MCP server
npm run mcp
```

## Architecture

```
┌─────────────────────────────────────────┐
│  MCP Server: ai-collab-swarm            │
├─────────────────────────────────────────┤
│                                         │
│  Tools:                                 │
│  • review_code (HF swarm)              │
│  • search_code (Qdrant)                │
│  • index_code (Qdrant)                 │
│  • plan_task (Qwen)                    │
│  • full_pipeline                       │
│                                         │
└─────────────────────────────────────────┘
         ↑
         │ MCP Protocol (stdio)
         │
    ┌────┴────┐
    │ Clients │
    ├─────────┤
    │ Claude  │
    │ Desktop │
    │ Cursor  │
    │ Zed     │
    └─────────┘
```

## License

MIT
