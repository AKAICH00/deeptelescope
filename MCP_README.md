# AI Collab MCP Server

Multi-agent code review and planning server for Claude Desktop and other MCP clients.

## Features

- **🐝 Swarm Code Review**: 4-agent self-correcting review (Qwen + Llama)
- **🔍 Semantic Search**: Vector-based code search with Qdrant
- **📋 Task Planning**: Opus-powered planning with confidence scores

## Quick Start

### 1. Install Dependencies

```bash
npm install
npm run build:mcp
```

### 2. Configure Claude Desktop

Add to `~/.config/claude/mcp.json` (Mac) or `%APPDATA%\Claude\mcp.json` (Windows):

```json
{
  "mcpServers": {
    "ai-collab": {
      "command": "node",
      "args": [
        "/absolute/path/to/ai-collab-plugin/dist/mcp-server.js"
      ],
      "env": {
        "HF_TOKEN": "your_huggingface_token",
        "ANTHROPIC_API_KEY": "your_anthropic_key"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

The server will appear in Claude's available tools.

## Tools

### `review_code`

Review code with 4-agent swarm consensus.

```typescript
{
  code: string,      // Code to review
  task: string,      // What the code should do
  language?: string  // Programming language
}
```

**Example:**
```
Claude, review this code:
[paste code]
Task: Implement a calculator with error handling
```

### `search_code`

Semantic search across your codebase.

```typescript
{
  query: string,      // Natural language query
  limit?: number,     // Max results (default: 5)
  workspace?: string  // Directory to search
}
```

**Example:**
```
Claude, search for authentication logic in my codebase
```

### `plan_task`

Generate execution plan with confidence scores.

```typescript
{
  task: string,        // Task description
  context?: string[]   // Additional context
}
```

**Example:**
```
Claude, plan how to add user authentication to my app
```

## Development

```bash
# Run in dev mode
npm run mcp

# Build
npm run build:mcp

# Test swarm reviewer
npx ts-node src/test-swarm-review.ts
```

## Architecture

```
MCP Server (stdio)
├── review_code → ReviewerAgent (HuggingFace swarm)
├── search_code → Qdrant vector search
└── plan_task → OpusPlannerAgent (Claude Opus)
```

## Requirements

- Node.js 18+
- HuggingFace API token (for swarm review)
- Anthropic API key (for planning)

## License

MIT
