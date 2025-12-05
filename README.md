# AI Collaboration Plugin

This plugin orchestrates multiple AI CLI agents (Codex, Claude/Opus, Gemini) to collaboratively plan,
code, and review changes within the Antigravity IDE workspace.

## Prerequisites

- Node.js >= 14
- Installed AI CLI tools in your PATH:
  - `codex`
  - `claude` (used for Opus)
  - `ollama` (for code reviews)
- A Hugging Face API token in `$HF_TOKEN` to power the Reviewer swarm.

## Configuration

Agent settings live in `agents.config.json` at the project root:

```json
{
  "codex": { ... },
  "claude": { ... },
  "opus":  { ... },
  "gemini":{ ... },
  "reviewer":{ ... }
}
```

Edit this file to adjust binary names, CLI flags, sentinel tokens, and timeouts.

## Quickstart

```bash
cd ai-collab-plugin
npm install
ts-node src/index.ts
```

The orchestrator will:
1. Initialize context (`GeminiAgent`)
2. Generate a plan (`OpusPlannerAgent`)
3. Optionally request user approval
4. Execute steps (via Codex, Opus, Antigravity, etc.)
5. Review changes (`ReviewerAgent`)

## Testing

Unit and integration tests are forthcoming. Contributions welcome!

## Conversational Flow

This plugin drives the AI agents in a step-by-step conversational loop:
1. **Context Enrichment**: Gemini reads and summarizes relevant code/type definitions.
2. **Planning**: Opus (Claude) produces a structured plan with confidence metadata.
3. **User Approval**: Low-confidence plans pause for user confirmation.
4. **Execution**: Codex, Opus, and Antigravity execute each plan step via CLI prompts.
5. **Review Swarm**: A mini-swarm of Hugging Face models votes yes/no on each step’s output,
   ensuring robust validation beyond any single agent.
6. **Final Summary**: The orchestrator collects results, shows a conversational log,
   and highlights improvements over a single-agent run.
