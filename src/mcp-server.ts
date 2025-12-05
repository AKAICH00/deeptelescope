#!/usr/bin/env node
/**
 * AI Collab MCP Server
 * Multi-agent swarm for code review, planning, and semantic search
 *
 * Tools:
 * - review_code: Self-correcting 4-agent swarm review
 * - search_code: Semantic code search with Qdrant
 * - plan_task: Generate execution plans with Opus
 * - full_pipeline: Complete planning + review workflow
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { QdrantClient } from '@qdrant/js-client-rest';
import { OpenAI } from 'openai';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================================
// CRT Visualizer (outputs to stderr so it doesn't interfere with MCP)
// ============================================================

const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const BLINK = `${ESC}[5m`;

const CYAN = `${ESC}[36m`;
const GREEN = `${ESC}[32m`;
const YELLOW = `${ESC}[33m`;
const RED = `${ESC}[31m`;
const MAGENTA = `${ESC}[35m`;
const GRAY = `${ESC}[90m`;

const BRIGHT_CYAN = `${ESC}[96m`;
const BRIGHT_GREEN = `${ESC}[92m`;
const BRIGHT_YELLOW = `${ESC}[93m`;
const BRIGHT_WHITE = `${ESC}[97m`;

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const CHECK = '✓';
const CROSS = '✗';
const BLOCK_FULL = '█';
const BLOCK_LIGHT = '░';

interface VisualState {
    agents: Array<{
        id: number;
        name: string;
        color: string;
        phase: 'idle' | 'generate' | 'correct' | 'vote' | 'done';
        thought: string;
        vote?: 'APPROVE' | 'REJECT';
        confidence?: number;
    }>;
    frameCount: number;
    startTime: number;
}

class SwarmVisualizerLive {
    private state: VisualState;
    private interval: NodeJS.Timeout | null = null;
    private lastLineCount = 0;

    constructor(agentCount: number, modelNames?: string[]) {
        const defaultNames = ['QWEN-32B', 'LLAMA-8B', 'QWEN-32B', 'LLAMA-8B'];
        const names = modelNames || defaultNames;
        const colors = [BRIGHT_CYAN, BRIGHT_GREEN, BRIGHT_YELLOW, MAGENTA, CYAN, GREEN, YELLOW, RED];

        this.state = {
            agents: Array.from({ length: agentCount }, (_, i) => ({
                id: i,
                name: names[i % names.length],
                color: colors[i % colors.length],
                phase: 'idle',
                thought: '',
            })),
            frameCount: 0,
            startTime: Date.now(),
        };
    }

    start() {
        this.render();
        this.interval = setInterval(() => {
            this.state.frameCount++;
            this.render();
        }, 100);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    setAgentPhase(id: number, phase: VisualState['agents'][0]['phase'], thought = '') {
        if (this.state.agents[id]) {
            this.state.agents[id].phase = phase;
            this.state.agents[id].thought = thought;
        }
    }

    setAgentVote(id: number, vote: 'APPROVE' | 'REJECT', confidence: number) {
        if (this.state.agents[id]) {
            this.state.agents[id].phase = 'done';
            this.state.agents[id].vote = vote;
            this.state.agents[id].confidence = confidence;
        }
    }

    private render() {
        const elapsed = ((Date.now() - this.state.startTime) / 1000).toFixed(1);
        const spinner = SPINNER[this.state.frameCount % SPINNER.length];

        // Move cursor up to overwrite previous output
        if (this.lastLineCount > 0) {
            process.stderr.write(`${ESC}[${this.lastLineCount}A`);
        }

        const lines: string[] = [];

        // Header
        lines.push(`${BRIGHT_CYAN}╔════════════════════════════════════════════════════════╗${RESET}`);
        lines.push(`${BRIGHT_CYAN}║${RESET}  ${BRIGHT_WHITE}${BOLD}🐝 SWARM REVIEW${RESET}  ${GRAY}│${RESET}  ${this.state.agents.length} agents  ${GRAY}│${RESET}  ${elapsed}s  ${BRIGHT_CYAN}║${RESET}`);
        lines.push(`${BRIGHT_CYAN}╠════════════════════════════════════════════════════════╣${RESET}`);

        // Agents
        for (const agent of this.state.agents) {
            let statusIcon = '';
            let statusText = '';
            let thoughtText = agent.thought.substring(0, 35);

            switch (agent.phase) {
                case 'idle':
                    statusIcon = `${GRAY}○${RESET}`;
                    statusText = `${GRAY}waiting...${RESET}`;
                    break;
                case 'generate':
                    statusIcon = `${agent.color}${spinner}${RESET}`;
                    statusText = `${agent.color}GENERATE${RESET} ${GRAY}T=0.8${RESET}`;
                    break;
                case 'correct':
                    statusIcon = `${YELLOW}${spinner}${RESET}`;
                    statusText = `${YELLOW}CORRECT${RESET} ${GRAY}T=0.1${RESET}`;
                    break;
                case 'vote':
                    statusIcon = `${BRIGHT_WHITE}${BLINK}▶${RESET}`;
                    statusText = `${BRIGHT_WHITE}VOTING...${RESET}`;
                    break;
                case 'done':
                    if (agent.vote === 'APPROVE') {
                        statusIcon = `${BRIGHT_GREEN}${CHECK}${RESET}`;
                        statusText = `${BRIGHT_GREEN}APPROVE${RESET} ${GRAY}${agent.confidence}%${RESET}`;
                    } else {
                        statusIcon = `${RED}${CROSS}${RESET}`;
                        statusText = `${RED}REJECT${RESET} ${GRAY}${agent.confidence}%${RESET}`;
                    }
                    break;
            }

            lines.push(`${BRIGHT_CYAN}║${RESET} ${statusIcon} ${agent.color}Agent #${agent.id}${RESET} ${GRAY}[${agent.name}]${RESET}`.padEnd(70) + `${BRIGHT_CYAN}║${RESET}`);
            lines.push(`${BRIGHT_CYAN}║${RESET}   ${statusText}`.padEnd(70) + `${BRIGHT_CYAN}║${RESET}`);
            if (thoughtText) {
                lines.push(`${BRIGHT_CYAN}║${RESET}   ${GRAY}${thoughtText}${RESET}`.padEnd(70) + `${BRIGHT_CYAN}║${RESET}`);
            }
        }

        // Consensus bar
        lines.push(`${BRIGHT_CYAN}╠════════════════════════════════════════════════════════╣${RESET}`);
        const doneAgents = this.state.agents.filter(a => a.phase === 'done');
        const approvals = doneAgents.filter(a => a.vote === 'APPROVE').length;

        if (doneAgents.length === 0) {
            lines.push(`${BRIGHT_CYAN}║${RESET}  ${GRAY}Awaiting votes...${RESET}`.padEnd(70) + `${BRIGHT_CYAN}║${RESET}`);
        } else {
            const percent = Math.round((approvals / this.state.agents.length) * 100);
            const barWidth = 30;
            const filledWidth = Math.round((approvals / this.state.agents.length) * barWidth);
            const partialWidth = Math.round((doneAgents.length / this.state.agents.length) * barWidth) - filledWidth;

            let bar = '';
            for (let i = 0; i < barWidth; i++) {
                if (i < filledWidth) {
                    bar += `${BRIGHT_GREEN}${BLOCK_FULL}${RESET}`;
                } else if (i < filledWidth + partialWidth) {
                    bar += `${RED}${BLOCK_FULL}${RESET}`;
                } else {
                    bar += `${GRAY}${BLOCK_LIGHT}${RESET}`;
                }
            }

            const percentColor = percent >= 60 ? BRIGHT_GREEN : percent >= 40 ? YELLOW : RED;
            lines.push(`${BRIGHT_CYAN}║${RESET}  Consensus: ${bar} ${percentColor}${percent}%${RESET}`.padEnd(80) + `${BRIGHT_CYAN}║${RESET}`);
        }

        lines.push(`${BRIGHT_CYAN}╚════════════════════════════════════════════════════════╝${RESET}`);

        // Clear to end of each line and write
        for (const line of lines) {
            process.stderr.write(`${ESC}[2K${line}\n`);
        }

        this.lastLineCount = lines.length;
    }
}

// ============================================================
// Configuration
// ============================================================

type ModelProvider = 'huggingface' | 'lmstudio' | 'groq' | 'auto';

interface ModelConfig {
    id: string;
    name: string;
    provider: ModelProvider;
    weight: number;  // Voting weight (higher = more trusted)
    maxTokens: number;
    contextSize: number;
}

// HuggingFace models (remote, rate-limited but powerful)
// Using models available on HF Inference API Pro tier
const HF_MODELS: ModelConfig[] = [
    { id: "Qwen/Qwen2.5-Coder-32B-Instruct", name: "QWEN-32B", provider: 'huggingface', weight: 1.5, maxTokens: 300, contextSize: 4000 },
    { id: "meta-llama/Meta-Llama-3-8B-Instruct", name: "LLAMA-8B", provider: 'huggingface', weight: 1.0, maxTokens: 300, contextSize: 3000 },
    { id: "Qwen/Qwen2.5-72B-Instruct", name: "QWEN-72B", provider: 'huggingface', weight: 1.8, maxTokens: 300, contextSize: 4000 },
    { id: "meta-llama/Llama-3.2-3B-Instruct", name: "LLAMA-3B", provider: 'huggingface', weight: 0.8, maxTokens: 250, contextSize: 3000 },
];

// LM Studio local models (no rate limits, depends on user's hardware)
// Detected models at ~/.lmstudio/models/
const LMSTUDIO_MODELS: ModelConfig[] = [
    { id: "gpt-oss-20b-MXFP4", name: "GPT-OSS-20B", provider: 'lmstudio', weight: 1.3, maxTokens: 500, contextSize: 4000 },
    { id: "local-model", name: "LOCAL", provider: 'lmstudio', weight: 1.2, maxTokens: 500, contextSize: 4000 }, // Fallback
];

// Groq models (blazing fast inference - <100ms latency, free tier generous)
// Free tier: 14,400 requests/day, ~100/min
const GROQ_MODELS: ModelConfig[] = [
    { id: "llama-3.1-70b-versatile", name: "GROQ-70B", provider: 'groq', weight: 1.8, maxTokens: 400, contextSize: 8000 },
    { id: "llama-3.1-8b-instant", name: "GROQ-8B", provider: 'groq', weight: 1.0, maxTokens: 300, contextSize: 8000 },
    { id: "mixtral-8x7b-32768", name: "GROQ-MIX", provider: 'groq', weight: 1.4, maxTokens: 400, contextSize: 8000 },
];

// LM Studio configuration
const LMSTUDIO_CONFIG = {
    baseURL: process.env.LMSTUDIO_URL || "http://localhost:1234/v1",
    timeout: 120000, // Local models can be slower on first load
};

// ============================================================
// Adaptive Rate Limiter (Token Bucket Algorithm)
// ============================================================

interface RateLimiterConfig {
    maxTokens: number;      // Max tokens in bucket
    refillRate: number;     // Tokens added per second
    minDelay: number;       // Minimum delay between requests (ms)
    maxDelay: number;       // Maximum backoff delay (ms)
    backoffMultiplier: number;
}

const HF_RATE_LIMITS: RateLimiterConfig = {
    maxTokens: 20,          // HF Pro allows ~20 concurrent
    refillRate: 1.5,        // ~90 requests per minute
    minDelay: 50,           // 50ms minimum between requests
    maxDelay: 10000,        // 10s max backoff
    backoffMultiplier: 1.5,
};

class AdaptiveRateLimiter {
    private tokens: number;
    private lastRefill: number;
    private currentDelay: number;
    private consecutiveFailures: number = 0;
    private config: RateLimiterConfig;

    constructor(config: RateLimiterConfig = HF_RATE_LIMITS) {
        this.config = config;
        this.tokens = config.maxTokens;
        this.lastRefill = Date.now();
        this.currentDelay = config.minDelay;
    }

    private refill() {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000;
        const tokensToAdd = elapsed * this.config.refillRate;
        this.tokens = Math.min(this.config.maxTokens, this.tokens + tokensToAdd);
        this.lastRefill = now;
    }

    async acquire(): Promise<void> {
        this.refill();

        if (this.tokens < 1) {
            // Calculate wait time until a token is available
            const waitTime = Math.max(
                this.currentDelay,
                ((1 - this.tokens) / this.config.refillRate) * 1000
            );
            await new Promise(r => setTimeout(r, waitTime));
            this.refill();
        }

        this.tokens -= 1;
        await new Promise(r => setTimeout(r, this.currentDelay));
    }

    onSuccess() {
        this.consecutiveFailures = 0;
        this.currentDelay = Math.max(
            this.config.minDelay,
            this.currentDelay * 0.9 // Gradually reduce delay on success
        );
    }

    onRateLimitError() {
        this.consecutiveFailures++;
        this.currentDelay = Math.min(
            this.config.maxDelay,
            this.currentDelay * this.config.backoffMultiplier
        );
        // Reduce available tokens on rate limit
        this.tokens = Math.max(0, this.tokens - 2);
    }

    getStatus(): { tokens: number; delay: number; failures: number } {
        this.refill();
        return {
            tokens: Math.floor(this.tokens),
            delay: Math.round(this.currentDelay),
            failures: this.consecutiveFailures,
        };
    }
}

interface SwarmConfig {
    swarmSize: number;
    generateTemp: number;
    correctTemp: number;
    consensusThreshold: number;
    preferLocal: boolean;  // Prefer local models when available
    hybridMode: boolean;   // Mix local + remote models
}

const DEFAULT_SWARM_CONFIG: SwarmConfig = {
    swarmSize: 4,
    generateTemp: 0.8,
    correctTemp: 0.1,
    consensusThreshold: 0.6,
    preferLocal: false,
    hybridMode: true,
};

interface AgentResult {
    agentId: number;
    model: string;
    vote: "APPROVE" | "REJECT";
    confidence: number;
    issues: string[];
    reasoning: string;
}

// ============================================================
// AI Collab MCP Server
// ============================================================

class AICollabServer {
    private server: Server;
    private hfClient: OpenAI;
    private localClient: OpenAI;
    private groqClient: OpenAI;
    private qdrant: QdrantClient;
    private swarmConfig: SwarmConfig;
    private workspaceDir: string;
    private localModelAvailable: boolean = false;
    private availableModels: ModelConfig[] = [];
    private rateLimiter: AdaptiveRateLimiter;

    constructor() {
        this.workspaceDir = process.env.WORKSPACE_DIR || process.cwd();
        this.swarmConfig = DEFAULT_SWARM_CONFIG;

        // HuggingFace client for swarm
        const hfToken = process.env.HF_TOKEN;
        this.hfClient = new OpenAI({
            baseURL: "https://router.huggingface.co/v1",
            apiKey: hfToken || "dummy",
        });

        // LM Studio local client (OpenAI-compatible)
        this.localClient = new OpenAI({
            baseURL: LMSTUDIO_CONFIG.baseURL,
            apiKey: "lm-studio", // LM Studio doesn't require a real key
            timeout: LMSTUDIO_CONFIG.timeout,
        });

        // Groq client (blazing fast inference - OpenAI-compatible)
        const groqKey = process.env.GROQ_API_KEY;
        this.groqClient = new OpenAI({
            baseURL: "https://api.groq.com/openai/v1",
            apiKey: groqKey || "dummy",
        });

        // Rate limiter for HuggingFace API
        this.rateLimiter = new AdaptiveRateLimiter();

        // Qdrant client (in-memory mode)
        this.qdrant = new QdrantClient({
            url: process.env.QDRANT_URL || "http://localhost:6333",
        });

        this.server = new Server(
            {
                name: 'deeptelescope',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                    resources: {},
                },
            }
        );

        this.setupHandlers();
        this.detectAvailableModels();
    }

    // Check which providers are available
    private async detectAvailableModels() {
        // Include Groq models if API key is set (free tier, super fast)
        const groqAvailable = !!process.env.GROQ_API_KEY;
        this.availableModels = [
            ...HF_MODELS,
            ...(groqAvailable ? GROQ_MODELS : []),
        ];

        // Check LM Studio availability
        try {
            const response = await fetch(`${LMSTUDIO_CONFIG.baseURL}/models`, {
                signal: AbortSignal.timeout(3000),
            });
            if (response.ok) {
                const data = await response.json() as { data?: Array<{ id: string }> };
                this.localModelAvailable = true;

                // Update local models with actual available models
                if (data.data && data.data.length > 0) {
                    const localModels: ModelConfig[] = data.data.map((m: { id: string }) => ({
                        id: m.id,
                        name: m.id.split('/').pop()?.substring(0, 12).toUpperCase() || 'LOCAL',
                        provider: 'lmstudio' as ModelProvider,
                        weight: 1.3,
                        maxTokens: 500,
                        contextSize: 4000,
                    }));
                    this.availableModels = [...localModels, ...HF_MODELS, ...(groqAvailable ? GROQ_MODELS : [])];
                } else {
                    this.availableModels = [...LMSTUDIO_MODELS, ...HF_MODELS, ...(groqAvailable ? GROQ_MODELS : [])];
                }
                console.error(`✓ LM Studio detected at ${LMSTUDIO_CONFIG.baseURL}`);
            }
        } catch {
            this.localModelAvailable = false;
            console.error(`○ LM Studio not available (start it for unlimited local inference)`);
        }

        console.error(`Available models: ${this.availableModels.map(m => m.name).join(', ')}`);
    }

    // Get the appropriate client for a model
    private getClientForModel(model: ModelConfig): OpenAI {
        switch (model.provider) {
            case 'lmstudio': return this.localClient;
            case 'groq': return this.groqClient;
            default: return this.hfClient;
        }
    }

    // Select models for the swarm based on availability and config
    private selectSwarmModels(count: number): ModelConfig[] {
        const models: ModelConfig[] = [];

        if (this.swarmConfig.preferLocal && this.localModelAvailable) {
            // All local models
            const localModels = this.availableModels.filter(m => m.provider === 'lmstudio');
            for (let i = 0; i < count; i++) {
                models.push(localModels[i % localModels.length]);
            }
        } else if (this.swarmConfig.hybridMode && this.localModelAvailable) {
            // Mix: half local, half remote for diversity
            const localModels = this.availableModels.filter(m => m.provider === 'lmstudio');
            const remoteModels = this.availableModels.filter(m => m.provider === 'huggingface');

            for (let i = 0; i < count; i++) {
                if (i % 2 === 0 && localModels.length > 0) {
                    models.push(localModels[Math.floor(i / 2) % localModels.length]);
                } else {
                    models.push(remoteModels[Math.floor(i / 2) % remoteModels.length]);
                }
            }
        } else {
            // Remote only (original behavior)
            const remoteModels = this.availableModels.filter(m => m.provider === 'huggingface');
            for (let i = 0; i < count; i++) {
                models.push(remoteModels[i % remoteModels.length]);
            }
        }

        return models;
    }

    private setupHandlers() {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'review_code',
                    description: 'Review code with a self-correcting multi-agent swarm. Supports hybrid local (LM Studio) + cloud (HuggingFace) models for unlimited scaling.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            code: {
                                type: 'string',
                                description: 'The code to review',
                            },
                            task: {
                                type: 'string',
                                description: 'What the code is supposed to do',
                            },
                            focus: {
                                type: 'string',
                                enum: ['correctness', 'security', 'performance', 'quality', 'all'],
                                description: 'Review focus area (default: all)',
                            },
                            preferLocal: {
                                type: 'boolean',
                                description: 'Use local LM Studio models only (no rate limits). Default: hybrid mode',
                            },
                        },
                        required: ['code', 'task'],
                    },
                },
                {
                    name: 'list_models',
                    description: 'List available models for swarm review. Shows both local (LM Studio) and remote (HuggingFace) models with their status.',
                    inputSchema: {
                        type: 'object',
                        properties: {},
                        required: [],
                    },
                },
                {
                    name: 'search_code',
                    description: 'Semantic search through indexed code using Qdrant vector database. Returns relevant code snippets based on natural language queries.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: 'Natural language search query',
                            },
                            limit: {
                                type: 'number',
                                description: 'Max results to return (default: 5)',
                            },
                            collection: {
                                type: 'string',
                                description: 'Qdrant collection name (default: code_embeddings)',
                            },
                        },
                        required: ['query'],
                    },
                },
                {
                    name: 'index_code',
                    description: 'Index code files into Qdrant for semantic search. Creates embeddings using simple TF-IDF hashing.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: {
                                type: 'string',
                                description: 'File or directory path to index',
                            },
                            collection: {
                                type: 'string',
                                description: 'Qdrant collection name (default: code_embeddings)',
                            },
                        },
                        required: ['path'],
                    },
                },
                {
                    name: 'plan_task',
                    description: 'Generate an execution plan for a development task. Analyzes project structure and creates step-by-step implementation plan.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            task: {
                                type: 'string',
                                description: 'Description of the task to plan',
                            },
                            context: {
                                type: 'string',
                                description: 'Additional context about the project or requirements',
                            },
                        },
                        required: ['task'],
                    },
                },
                {
                    name: 'full_pipeline',
                    description: 'Run the complete AI collaboration pipeline: Plan → Execute → Review. Best for complex tasks that need full orchestration.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            task: {
                                type: 'string',
                                description: 'The task to complete',
                            },
                            autoApprove: {
                                type: 'boolean',
                                description: 'Auto-approve plan execution (default: false)',
                            },
                        },
                        required: ['task'],
                    },
                },
            ],
        }));

        // List resources (indexed collections)
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
            try {
                const collections = await this.qdrant.getCollections();
                return {
                    resources: collections.collections.map(c => ({
                        uri: `qdrant://${c.name}`,
                        name: c.name,
                        description: `Code embeddings collection: ${c.name}`,
                        mimeType: 'application/json',
                    })),
                };
            } catch {
                return { resources: [] };
            }
        });

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case 'review_code':
                        return await this.handleReviewCode(args as any);
                    case 'list_models':
                        return await this.handleListModels();
                    case 'search_code':
                        return await this.handleSearchCode(args as any);
                    case 'index_code':
                        return await this.handleIndexCode(args as any);
                    case 'plan_task':
                        return await this.handlePlanTask(args as any);
                    case 'full_pipeline':
                        return await this.handleFullPipeline(args as any);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error) {
                return {
                    content: [{
                        type: 'text',
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                    }],
                    isError: true,
                };
            }
        });
    }

    // ============================================================
    // Tool: list_models (Show available providers and models)
    // ============================================================
    private async handleListModels() {
        // Refresh model detection
        await this.detectAvailableModels();

        const localModels = this.availableModels.filter(m => m.provider === 'lmstudio');
        const remoteModels = this.availableModels.filter(m => m.provider === 'huggingface');

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    status: {
                        lmStudio: this.localModelAvailable ? 'connected' : 'not available',
                        lmStudioUrl: LMSTUDIO_CONFIG.baseURL,
                        huggingFace: 'available (may rate limit)',
                    },
                    localModels: localModels.map(m => ({
                        name: m.name,
                        id: m.id,
                        weight: m.weight,
                        maxTokens: m.maxTokens,
                        contextSize: m.contextSize,
                    })),
                    remoteModels: remoteModels.map(m => ({
                        name: m.name,
                        id: m.id,
                        weight: m.weight,
                        maxTokens: m.maxTokens,
                        contextSize: m.contextSize,
                    })),
                    config: {
                        swarmSize: this.swarmConfig.swarmSize,
                        hybridMode: this.swarmConfig.hybridMode,
                        preferLocal: this.swarmConfig.preferLocal,
                        consensusThreshold: `${this.swarmConfig.consensusThreshold * 100}%`,
                    },
                    tip: this.localModelAvailable
                        ? 'Local models detected! Use preferLocal: true for unlimited inference.'
                        : 'Start LM Studio to enable local models (no rate limits).',
                }, null, 2),
            }],
        };
    }

    // ============================================================
    // Tool: review_code (Self-Correcting Swarm with Live Visualization)
    // ============================================================
    private async handleReviewCode(args: { code: string; task: string; focus?: string; preferLocal?: boolean }) {
        const { code, task, focus = 'all', preferLocal } = args;

        // Override preferLocal if specified
        if (preferLocal !== undefined) {
            this.swarmConfig.preferLocal = preferLocal;
        }

        // Select models for this swarm run
        const swarmModels = this.selectSwarmModels(this.swarmConfig.swarmSize);
        const modelNames = swarmModels.map(m => m.name);

        // Start live visualizer (outputs to stderr)
        const visualizer = new SwarmVisualizerLive(this.swarmConfig.swarmSize, modelNames);
        visualizer.start();

        // Log provider mix
        const localCount = swarmModels.filter(m => m.provider === 'lmstudio').length;
        const hfCount = swarmModels.filter(m => m.provider === 'huggingface').length;
        console.error(`Swarm: ${localCount} local + ${hfCount} HF agents`);

        // Run all agents in parallel with visualization updates
        const agentPromises: Promise<AgentResult>[] = [];
        for (let i = 0; i < this.swarmConfig.swarmSize; i++) {
            const model = swarmModels[i];
            agentPromises.push(this.runAgentWorkflowWithViz(i, model, task, code, focus, visualizer));
        }

        const results = await Promise.all(agentPromises);

        // Stop visualizer
        visualizer.stop();

        // Calculate consensus
        const consensus = this.calculateConsensus(results);

        // Final status line
        const verdictColor = consensus.approved ? BRIGHT_GREEN : RED;
        const verdictIcon = consensus.approved ? CHECK : CROSS;
        process.stderr.write(`\n${verdictColor}${verdictIcon} VERDICT: ${consensus.approved ? 'APPROVED' : 'REJECTED'} (${(consensus.score * 100).toFixed(1)}%)${RESET}\n\n`);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    verdict: consensus.approved ? 'APPROVED' : 'REJECTED',
                    score: `${(consensus.score * 100).toFixed(1)}%`,
                    threshold: `${this.swarmConfig.consensusThreshold * 100}%`,
                    summary: consensus.summary,
                    agents: results.map(r => ({
                        agent: `#${r.agentId}`,
                        model: r.model,
                        vote: r.vote,
                        confidence: `${r.confidence}%`,
                        issues: r.issues,
                    })),
                }, null, 2),
            }],
        };
    }

    // Rate-limited API call wrapper for HuggingFace
    private async rateLimitedCall<T>(
        modelConfig: ModelConfig,
        apiCall: () => Promise<T>
    ): Promise<T> {
        // Skip rate limiting for local models
        if (modelConfig.provider === 'lmstudio') {
            return apiCall();
        }

        // Apply rate limiting for HuggingFace
        await this.rateLimiter.acquire();

        try {
            const result = await apiCall();
            this.rateLimiter.onSuccess();
            return result;
        } catch (error: any) {
            if (error.status === 429 || error.message?.includes('rate limit')) {
                this.rateLimiter.onRateLimitError();
            }
            throw error;
        }
    }

    // Agent workflow with live visualization updates
    private async runAgentWorkflowWithViz(
        agentId: number,
        modelConfig: ModelConfig,
        task: string,
        code: string,
        focus: string,
        visualizer: SwarmVisualizerLive
    ): Promise<AgentResult> {
        const client = this.getClientForModel(modelConfig);
        const providerTag = modelConfig.provider === 'lmstudio' ? '🏠' : modelConfig.provider === 'groq' ? '⚡' : '☁️';

        // Truncate code based on model's context size
        const truncatedCode = code.length > modelConfig.contextSize
            ? code.substring(0, modelConfig.contextSize) + '\n...[truncated]'
            : code;

        try {
            // PHASE 1: GENERATE (High Temperature)
            visualizer.setAgentPhase(agentId, 'generate', `${providerTag} Analyzing code...`);

            const generatePrompt = `You are Agent #${agentId} reviewing code.
Focus: ${focus}
Task: ${task}

Code:
\`\`\`
${truncatedCode}
\`\`\`

Analyze for: correctness, error handling, edge cases, code quality.
Format:
ISSUES: [list problems or "None"]
QUALITY: [1-10]
NOTES: [observations]`;

            const generateResp = await this.rateLimitedCall(modelConfig, () =>
                client.chat.completions.create({
                    model: modelConfig.id,
                    messages: [{ role: 'user', content: generatePrompt }],
                    max_tokens: modelConfig.maxTokens,
                    temperature: this.swarmConfig.generateTemp,
                })
            );

            const initial = generateResp.choices[0]?.message?.content || '';

            // PHASE 2: CORRECT (Low Temperature)
            visualizer.setAgentPhase(agentId, 'correct', `${providerTag} Self-correcting...`);

            const correctPrompt = `Review and CORRECT your assessment:
${initial}

Self-critique:
1. Did I miss edge cases?
2. Was I too harsh/lenient?
3. Are scores justified?

CORRECTIONS: [changes or "None needed"]
FINAL_ISSUES: [updated list]
FINAL_QUALITY: [1-10]`;

            const correctResp = await this.rateLimitedCall(modelConfig, () =>
                client.chat.completions.create({
                    model: modelConfig.id,
                    messages: [{ role: 'user', content: correctPrompt }],
                    max_tokens: modelConfig.maxTokens,
                    temperature: this.swarmConfig.correctTemp,
                })
            );

            const corrected = correctResp.choices[0]?.message?.content || '';

            // PHASE 3: VOTE (Deterministic)
            visualizer.setAgentPhase(agentId, 'vote', `${providerTag} Voting...`);

            const votePrompt = `Cast your FINAL VOTE based on:
${corrected}

Task: ${task}

VOTE: APPROVE or REJECT
CONFIDENCE: [0-100]%
REASON: [one sentence]`;

            const voteResp = await this.rateLimitedCall(modelConfig, () =>
                client.chat.completions.create({
                    model: modelConfig.id,
                    messages: [{ role: 'user', content: votePrompt }],
                    max_tokens: 100,
                    temperature: 0.0,
                })
            );

            const voteContent = voteResp.choices[0]?.message?.content || 'APPROVE';
            const parsed = this.parseVote(voteContent);

            // Apply model weight to confidence
            const weightedConfidence = Math.min(100, Math.round(parsed.confidence * modelConfig.weight));

            // Update visualizer with final result
            visualizer.setAgentVote(agentId, parsed.vote, weightedConfidence);

            // Extract issues from corrected assessment
            const issueMatch = corrected.match(/FINAL_ISSUES:\s*([^\n]+(?:\n(?!FINAL_QUALITY)[^\n]+)*)/i);
            const issues = issueMatch
                ? issueMatch[1].split(/[,\n]/).map(s => s.trim()).filter(s => s && s.toLowerCase() !== 'none')
                : [];

            return {
                agentId,
                model: `${modelConfig.name}${providerTag}`,
                vote: parsed.vote,
                confidence: weightedConfidence,
                issues,
                reasoning: parsed.reasoning,
            };

        } catch (error: any) {
            const errorMsg = error.message?.substring(0, 50) || 'Unknown error';
            visualizer.setAgentVote(agentId, 'APPROVE', 30);
            return {
                agentId,
                model: `${modelConfig.name}${providerTag}`,
                vote: 'APPROVE',
                confidence: 30,
                issues: [],
                reasoning: `${modelConfig.provider} error: ${errorMsg}`,
            };
        }
    }

    private parseVote(content: string): { vote: "APPROVE" | "REJECT"; confidence: number; reasoning: string } {
        const vote = content.toUpperCase().includes('REJECT') ? 'REJECT' : 'APPROVE';
        const confMatch = content.match(/(\d+)/);
        const confidence = confMatch ? Math.min(100, parseInt(confMatch[1])) : 50;
        const reasonMatch = content.match(/REASON:\s*(.+)/i);
        const reasoning = reasonMatch ? reasonMatch[1].trim() : 'No reason provided';
        return { vote, confidence, reasoning };
    }

    private calculateConsensus(results: AgentResult[]): { approved: boolean; score: number; summary: string } {
        const approvals = results.filter(r => r.vote === 'APPROVE');
        const approvalWeight = approvals.reduce((sum, r) => sum + r.confidence, 0);
        const totalWeight = results.reduce((sum, r) => sum + r.confidence, 0);
        const score = totalWeight > 0 ? approvalWeight / totalWeight : 0.5;

        const allIssues = [...new Set(results.flatMap(r => r.issues))];
        const summary = allIssues.length > 0
            ? `Issues found: ${allIssues.slice(0, 3).join(', ')}${allIssues.length > 3 ? '...' : ''}`
            : 'No significant issues found';

        return {
            approved: score >= this.swarmConfig.consensusThreshold,
            score,
            summary,
        };
    }

    // ============================================================
    // Tool: search_code (Qdrant Vector Search)
    // ============================================================
    private async handleSearchCode(args: { query: string; limit?: number; collection?: string }) {
        const { query, limit = 5, collection = 'code_embeddings' } = args;

        // Simple embedding using hash (replace with real embeddings in production)
        const embedding = this.simpleEmbed(query);

        try {
            const results = await this.qdrant.search(collection, {
                vector: embedding,
                limit,
                with_payload: true,
            });

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        query,
                        results: results.map(r => ({
                            score: r.score.toFixed(3),
                            file: r.payload?.file || 'unknown',
                            content: r.payload?.content || '',
                            line: r.payload?.line || 0,
                        })),
                    }, null, 2),
                }],
            };
        } catch (error: any) {
            if (error.message?.includes('not found')) {
                return {
                    content: [{
                        type: 'text',
                        text: `Collection "${collection}" not found. Use index_code first to create it.`,
                    }],
                };
            }
            throw error;
        }
    }

    // ============================================================
    // Tool: index_code (Create Qdrant Collection)
    // ============================================================
    private async handleIndexCode(args: { path: string; collection?: string }) {
        const { path: inputPath, collection = 'code_embeddings' } = args;
        const absolutePath = path.isAbsolute(inputPath)
            ? inputPath
            : path.join(this.workspaceDir, inputPath);

        // Create collection if not exists
        try {
            await this.qdrant.createCollection(collection, {
                vectors: { size: 128, distance: 'Cosine' },
            });
        } catch {
            // Collection might already exist
        }

        const stats = await fs.stat(absolutePath);
        const files = stats.isDirectory()
            ? await this.getCodeFiles(absolutePath)
            : [absolutePath];

        let indexed = 0;
        const points: any[] = [];

        for (const file of files) {
            try {
                const content = await fs.readFile(file, 'utf-8');
                const chunks = this.chunkCode(content);

                for (const [lineNum, chunk] of chunks) {
                    points.push({
                        id: crypto.randomUUID(),
                        vector: this.simpleEmbed(chunk),
                        payload: {
                            file: path.relative(this.workspaceDir, file),
                            content: chunk.substring(0, 500),
                            line: lineNum,
                        },
                    });
                    indexed++;
                }
            } catch {
                // Skip unreadable files
            }
        }

        if (points.length > 0) {
            await this.qdrant.upsert(collection, { points });
        }

        return {
            content: [{
                type: 'text',
                text: `Indexed ${indexed} chunks from ${files.length} files into "${collection}"`,
            }],
        };
    }

    private async getCodeFiles(dir: string): Promise<string[]> {
        const extensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs', '.java'];
        const files: string[] = [];

        const walk = async (d: string) => {
            const entries = await fs.readdir(d, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(d, entry.name);
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    await walk(fullPath);
                } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
                    files.push(fullPath);
                }
            }
        };

        await walk(dir);
        return files;
    }

    private chunkCode(content: string, chunkSize = 500): [number, string][] {
        const lines = content.split('\n');
        const chunks: [number, string][] = [];

        for (let i = 0; i < lines.length; i += Math.floor(chunkSize / 50)) {
            const chunk = lines.slice(i, i + 20).join('\n');
            if (chunk.trim()) {
                chunks.push([i + 1, chunk]);
            }
        }

        return chunks;
    }

    private simpleEmbed(text: string): number[] {
        // Simple hash-based embedding (replace with real embeddings in production)
        const vec = new Array(128).fill(0);
        const words = text.toLowerCase().split(/\W+/);

        for (const word of words) {
            for (let i = 0; i < word.length; i++) {
                const idx = (word.charCodeAt(i) * (i + 1)) % 128;
                vec[idx] += 1;
            }
        }

        // Normalize
        const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
        return vec.map(v => v / mag);
    }

    // ============================================================
    // Tool: plan_task (Simple Planning)
    // ============================================================
    private async handlePlanTask(args: { task: string; context?: string }) {
        const { task, context = '' } = args;

        // Get project info
        const projectInfo = await this.getProjectInfo();

        const prompt = `You are a senior developer. Create a plan for this task.

Project: ${projectInfo.name} (${projectInfo.type})
${context ? `Context: ${context}` : ''}

TASK: ${task}

Respond with JSON only:
{"understanding":"brief summary","steps":[{"id":1,"action":"what to do","target":"file.ts"}],"risks":["potential risk"]}`;

        try {
            const response = await this.hfClient.chat.completions.create({
                model: HF_MODELS[0].id,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 500,
                temperature: 0.3,
            });

            const content = response.choices[0]?.message?.content || '{}';

            // Try to parse JSON
            let plan: any;
            try {
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                plan = jsonMatch ? JSON.parse(jsonMatch[0]) : { understanding: content, steps: [], risks: [] };
            } catch {
                plan = { understanding: content, steps: [], risks: [] };
            }

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        task,
                        plan: {
                            understanding: plan.understanding || 'Unable to parse plan',
                            steps: plan.steps || [],
                            risks: plan.risks || [],
                        },
                    }, null, 2),
                }],
            };
        } catch (error: any) {
            return {
                content: [{
                    type: 'text',
                    text: `Planning failed: ${error.message}. Try providing more context.`,
                }],
            };
        }
    }

    private async getProjectInfo(): Promise<{ name: string; type: string }> {
        const name = path.basename(this.workspaceDir);
        let type = 'unknown';

        const indicators = [
            { file: 'package.json', type: 'node' },
            { file: 'pyproject.toml', type: 'python' },
            { file: 'Cargo.toml', type: 'rust' },
            { file: 'go.mod', type: 'go' },
        ];

        for (const { file, type: t } of indicators) {
            if (await fs.pathExists(path.join(this.workspaceDir, file))) {
                type = t;
                break;
            }
        }

        return { name, type };
    }

    // ============================================================
    // Tool: full_pipeline (Plan → Review)
    // ============================================================
    private async handleFullPipeline(args: { task: string; autoApprove?: boolean }) {
        const { task } = args;

        const steps: string[] = [];

        // Step 1: Plan
        steps.push('Planning task...');
        const planResult = await this.handlePlanTask({ task });
        steps.push(`Plan created: ${JSON.parse((planResult.content[0] as any).text).plan.understanding}`);

        // Step 2: Review the plan
        steps.push('Reviewing plan with swarm...');
        const reviewResult = await this.handleReviewCode({
            code: JSON.stringify(planResult),
            task: `Review this execution plan for: ${task}`,
            focus: 'quality',
        });

        const reviewData = JSON.parse((reviewResult.content[0] as any).text);
        steps.push(`Review complete: ${reviewData.verdict} (${reviewData.score})`);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    task,
                    pipeline: steps,
                    plan: JSON.parse((planResult.content[0] as any).text),
                    review: reviewData,
                }, null, 2),
            }],
        };
    }

    // ============================================================
    // Start Server
    // ============================================================
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('🔭 DeepTelescope MCP Server running on stdio');
        console.error(`Workspace: ${this.workspaceDir}`);
        console.error(`Swarm: ${this.swarmConfig.swarmSize} agents | Providers: 🏠 Local ☁️ HuggingFace ⚡ Groq`);
    }
}

// Start server
const server = new AICollabServer();
server.run().catch(console.error);
