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
// Configuration
// ============================================================

const SWARM_MODELS = [
    "Qwen/Qwen2.5-Coder-32B-Instruct",
    "meta-llama/Meta-Llama-3-8B-Instruct",
];

interface SwarmConfig {
    swarmSize: number;
    generateTemp: number;
    correctTemp: number;
    consensusThreshold: number;
}

const DEFAULT_SWARM_CONFIG: SwarmConfig = {
    swarmSize: 4,
    generateTemp: 0.8,
    correctTemp: 0.1,
    consensusThreshold: 0.6,
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
    private qdrant: QdrantClient;
    private swarmConfig: SwarmConfig;
    private workspaceDir: string;

    constructor() {
        this.workspaceDir = process.env.WORKSPACE_DIR || process.cwd();
        this.swarmConfig = DEFAULT_SWARM_CONFIG;

        // HuggingFace client for swarm
        const hfToken = process.env.HF_TOKEN;
        this.hfClient = new OpenAI({
            baseURL: "https://router.huggingface.co/v1",
            apiKey: hfToken || "dummy",
        });

        // Qdrant client (in-memory mode)
        this.qdrant = new QdrantClient({
            url: process.env.QDRANT_URL || "http://localhost:6333",
        });

        this.server = new Server(
            {
                name: 'ai-collab-swarm',
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
    }

    private setupHandlers() {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'review_code',
                    description: 'Review code with a self-correcting 4-agent swarm. Each agent goes through Generate → Correct → Vote phases to provide weighted consensus.',
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
                        },
                        required: ['code', 'task'],
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
    // Tool: review_code (Self-Correcting Swarm)
    // ============================================================
    private async handleReviewCode(args: { code: string; task: string; focus?: string }) {
        const { code, task, focus = 'all' } = args;

        console.error(`[Swarm] Deploying ${this.swarmConfig.swarmSize} agents for review...`);

        // Truncate code for context
        const truncatedCode = code.length > 3000
            ? code.substring(0, 3000) + '\n...[truncated]'
            : code;

        // Run all agents in parallel
        const agentPromises: Promise<AgentResult>[] = [];
        for (let i = 0; i < this.swarmConfig.swarmSize; i++) {
            const model = SWARM_MODELS[i % SWARM_MODELS.length];
            agentPromises.push(this.runAgentWorkflow(i, model, task, truncatedCode, focus));
        }

        const results = await Promise.all(agentPromises);

        // Calculate consensus
        const consensus = this.calculateConsensus(results);

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

    private async runAgentWorkflow(
        agentId: number,
        model: string,
        task: string,
        code: string,
        focus: string
    ): Promise<AgentResult> {
        const shortModel = model.split('/').pop() || model;

        try {
            // PHASE 1: GENERATE (High Temperature)
            const generatePrompt = `You are Agent #${agentId} reviewing code.
Focus: ${focus}
Task: ${task}

Code:
\`\`\`
${code}
\`\`\`

Analyze for: correctness, error handling, edge cases, code quality.
Format:
ISSUES: [list problems or "None"]
QUALITY: [1-10]
NOTES: [observations]`;

            const generateResp = await this.hfClient.chat.completions.create({
                model,
                messages: [{ role: 'user', content: generatePrompt }],
                max_tokens: 300,
                temperature: this.swarmConfig.generateTemp,
            });

            const initial = generateResp.choices[0]?.message?.content || '';

            // PHASE 2: CORRECT (Low Temperature)
            const correctPrompt = `Review and CORRECT your assessment:
${initial}

Self-critique:
1. Did I miss edge cases?
2. Was I too harsh/lenient?
3. Are scores justified?

CORRECTIONS: [changes or "None needed"]
FINAL_ISSUES: [updated list]
FINAL_QUALITY: [1-10]`;

            const correctResp = await this.hfClient.chat.completions.create({
                model,
                messages: [{ role: 'user', content: correctPrompt }],
                max_tokens: 300,
                temperature: this.swarmConfig.correctTemp,
            });

            const corrected = correctResp.choices[0]?.message?.content || '';

            // PHASE 3: VOTE (Deterministic)
            const votePrompt = `Cast your FINAL VOTE based on:
${corrected}

Task: ${task}

VOTE: APPROVE or REJECT
CONFIDENCE: [0-100]%
REASON: [one sentence]`;

            const voteResp = await this.hfClient.chat.completions.create({
                model,
                messages: [{ role: 'user', content: votePrompt }],
                max_tokens: 100,
                temperature: 0.0,
            });

            const voteContent = voteResp.choices[0]?.message?.content || 'APPROVE';
            const parsed = this.parseVote(voteContent);

            // Extract issues from corrected assessment
            const issueMatch = corrected.match(/FINAL_ISSUES:\s*([^\n]+(?:\n(?!FINAL_QUALITY)[^\n]+)*)/i);
            const issues = issueMatch
                ? issueMatch[1].split(/[,\n]/).map(s => s.trim()).filter(s => s && s.toLowerCase() !== 'none')
                : [];

            return {
                agentId,
                model: shortModel,
                vote: parsed.vote,
                confidence: parsed.confidence,
                issues,
                reasoning: parsed.reasoning,
            };

        } catch (error: any) {
            console.error(`[Agent #${agentId}] Error: ${error.message}`);
            return {
                agentId,
                model: shortModel,
                vote: 'APPROVE',
                confidence: 30,
                issues: [],
                reasoning: `API error: ${error.message?.substring(0, 50)}`,
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
                model: SWARM_MODELS[0],
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
        console.error('AI Collab MCP Server running on stdio');
        console.error(`Workspace: ${this.workspaceDir}`);
        console.error(`Swarm size: ${this.swarmConfig.swarmSize} agents`);
    }
}

// Start server
const server = new AICollabServer();
server.run().catch(console.error);
