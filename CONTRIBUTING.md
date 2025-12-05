# Contributing to DeepTelescope

Thank you for your interest in contributing to DeepTelescope! This document provides guidelines for contributing to the project.

## Getting Started

### Prerequisites

- Node.js 18+
- HuggingFace API token ([get one here](https://huggingface.co/settings/tokens))
- Optional: LM Studio for local models
- Optional: Groq API key for ultra-fast inference

### Development Setup

```bash
# Clone the repository
git clone https://github.com/AKAICH00/deeptelescope.git
cd deeptelescope/ai-collab-plugin

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your API keys

# Build the MCP server
npm run build:mcp

# Test the CLI
npm run cli
```

## How to Contribute

### Reporting Bugs

1. Check [existing issues](https://github.com/AKAICH00/deeptelescope/issues) to avoid duplicates
2. Use the bug report template
3. Include:
   - Node.js version
   - Operating system
   - Steps to reproduce
   - Expected vs actual behavior
   - Error messages/logs

### Suggesting Features

1. Open a [new issue](https://github.com/AKAICH00/deeptelescope/issues/new)
2. Describe the feature and its use case
3. Explain how it fits with the swarm review concept

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run tests: `npm test`
5. Build: `npm run build:mcp`
6. Commit with descriptive messages
7. Push and open a PR

## Code Style

- Use TypeScript for all new code
- Follow existing patterns in the codebase
- Add JSDoc comments for public APIs
- Keep functions focused and small

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Test the swarm manually
npm run cli -- --auto-confirm
```

## Architecture Overview

```
src/
├── mcp-server.ts      # Main MCP server with swarm review
├── cli.ts             # Interactive CLI interface
├── agents/            # Agent implementations
│   └── reviewer-swarm.ts
└── utils/             # Shared utilities

api/
└── server.ts          # REST API server
```

### Key Concepts

- **Self-Correcting Protocol**: Generate (T=0.8) → Correct (T=0.1) → Vote (T=0.0)
- **Weighted Consensus**: Larger models get higher voting weight
- **Hybrid Inference**: Local (LM Studio) + Cloud (HuggingFace, Groq)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

- Open an issue for questions
- Join discussions on GitHub

Thank you for contributing!
