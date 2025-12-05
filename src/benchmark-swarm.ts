#!/usr/bin/env ts-node
/**
 * Swarm Scaling Benchmark
 * Tests different configurations to find optimal agent count and model mix
 */

import { OpenAI } from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

// ============================================================
// Configuration
// ============================================================

const HF_MODELS = {
    // Large models (slower, more accurate)
    large: [
        { id: "Qwen/Qwen2.5-Coder-32B-Instruct", name: "QWEN-32B", weight: 1.5 },
        { id: "meta-llama/Meta-Llama-3.1-70B-Instruct", name: "LLAMA-70B", weight: 1.8 },
        { id: "deepseek-ai/deepseek-coder-33b-instruct", name: "DEEPSEEK-33B", weight: 1.4 },
    ],
    // Medium models (balanced)
    medium: [
        { id: "meta-llama/Meta-Llama-3-8B-Instruct", name: "LLAMA-8B", weight: 1.0 },
        { id: "mistralai/Mistral-7B-Instruct-v0.3", name: "MISTRAL-7B", weight: 1.0 },
        { id: "microsoft/Phi-3-medium-4k-instruct", name: "PHI-3-MED", weight: 0.9 },
    ],
    // Small models (fast, less accurate)
    small: [
        { id: "microsoft/Phi-3-mini-4k-instruct", name: "PHI-3-MINI", weight: 0.7 },
        { id: "TinyLlama/TinyLlama-1.1B-Chat-v1.0", name: "TINYLLAMA", weight: 0.5 },
    ],
};

interface BenchmarkConfig {
    name: string;
    agents: number;
    models: Array<{ id: string; name: string; weight: number }>;
    maxTokens: number;
    contextSize: number;
}

interface BenchmarkResult {
    config: string;
    agents: number;
    totalRequests: number;
    avgLatency: number;
    p95Latency: number;
    successRate: number;
    tokensPerSecond: number;
    estimatedCost: number;
    consensusQuality: number;
}

const BENCHMARK_CONFIGS: BenchmarkConfig[] = [
    // Baseline: Current config
    {
        name: "baseline-4-agents",
        agents: 4,
        models: [HF_MODELS.large[0], HF_MODELS.medium[0]],
        maxTokens: 300,
        contextSize: 3000,
    },
    // Scale up agents with same models
    {
        name: "scale-8-agents",
        agents: 8,
        models: [HF_MODELS.large[0], HF_MODELS.medium[0]],
        maxTokens: 300,
        contextSize: 3000,
    },
    // Many small agents (speed focus)
    {
        name: "fast-12-small",
        agents: 12,
        models: [...HF_MODELS.medium, ...HF_MODELS.small],
        maxTokens: 200,
        contextSize: 2000,
    },
    // Diverse model mix
    {
        name: "diverse-8-models",
        agents: 8,
        models: [
            HF_MODELS.large[0],
            HF_MODELS.large[2],
            HF_MODELS.medium[0],
            HF_MODELS.medium[1],
            HF_MODELS.medium[2],
            HF_MODELS.small[0],
        ],
        maxTokens: 250,
        contextSize: 2500,
    },
    // Heavy hitters (accuracy focus)
    {
        name: "heavy-6-large",
        agents: 6,
        models: [...HF_MODELS.large],
        maxTokens: 400,
        contextSize: 4000,
    },
    // Optimal mix (hypothesis)
    {
        name: "optimal-10-mixed",
        agents: 10,
        models: [
            HF_MODELS.large[0],  // 2x QWEN-32B
            HF_MODELS.large[0],
            HF_MODELS.medium[0], // 4x LLAMA-8B
            HF_MODELS.medium[0],
            HF_MODELS.medium[0],
            HF_MODELS.medium[0],
            HF_MODELS.medium[1], // 2x MISTRAL-7B
            HF_MODELS.medium[1],
            HF_MODELS.small[0],  // 2x PHI-3-MINI
            HF_MODELS.small[0],
        ],
        maxTokens: 250,
        contextSize: 2000,
    },
];

// Test code samples of varying complexity
const TEST_SAMPLES = [
    {
        name: "simple-function",
        code: `function add(a, b) { return a + b; }`,
        expectedIssues: 0,
    },
    {
        name: "auth-middleware",
        code: `
async function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
}`,
        expectedIssues: 2, // Missing error logging, no token refresh
    },
    {
        name: "sql-query-builder",
        code: `
function buildQuery(table, filters) {
    let query = 'SELECT * FROM ' + table + ' WHERE 1=1';
    for (const [key, value] of Object.entries(filters)) {
        query += ' AND ' + key + ' = "' + value + '"';
    }
    return query;
}`,
        expectedIssues: 3, // SQL injection, no parameterization, string concat
    },
];

// ============================================================
// Benchmark Runner
// ============================================================

class SwarmBenchmark {
    private client: OpenAI;
    private results: BenchmarkResult[] = [];

    constructor() {
        const token = process.env.HF_TOKEN;
        if (!token) {
            throw new Error('HF_TOKEN required for benchmark');
        }
        this.client = new OpenAI({
            baseURL: "https://router.huggingface.co/v1",
            apiKey: token,
        });
    }

    async runBenchmark(config: BenchmarkConfig, sample: typeof TEST_SAMPLES[0]): Promise<{
        latencies: number[];
        successes: number;
        failures: number;
        votes: Array<{ model: string; vote: string; confidence: number; weight: number }>;
    }> {
        const latencies: number[] = [];
        const votes: Array<{ model: string; vote: string; confidence: number; weight: number }> = [];
        let successes = 0;
        let failures = 0;

        const agentPromises = Array.from({ length: config.agents }, async (_, i) => {
            const model = config.models[i % config.models.length];
            const start = Date.now();

            try {
                // Single simplified call (instead of 3-phase for benchmark speed)
                const response = await this.client.chat.completions.create({
                    model: model.id,
                    messages: [{
                        role: 'user',
                        content: `Review this code briefly. Reply with VOTE: APPROVE or REJECT, CONFIDENCE: 0-100, ISSUES: list or none.

Code:
\`\`\`
${sample.code.substring(0, config.contextSize)}
\`\`\``
                    }],
                    max_tokens: config.maxTokens,
                    temperature: 0.3,
                });

                const content = response.choices[0]?.message?.content || '';
                const latency = Date.now() - start;
                latencies.push(latency);

                // Parse vote
                const vote = content.toUpperCase().includes('REJECT') ? 'REJECT' : 'APPROVE';
                const confMatch = content.match(/(\d+)/);
                const confidence = confMatch ? Math.min(100, parseInt(confMatch[1])) : 50;

                votes.push({ model: model.name, vote, confidence, weight: model.weight });
                successes++;

            } catch (error: any) {
                failures++;
                latencies.push(Date.now() - start);
                votes.push({ model: model.name, vote: 'ERROR', confidence: 0, weight: 0 });
            }
        });

        await Promise.all(agentPromises);

        return { latencies, successes, failures, votes };
    }

    calculateConsensusQuality(
        votes: Array<{ vote: string; confidence: number; weight: number }>,
        expectedIssues: number
    ): number {
        // Higher quality if:
        // - More votes agree
        // - Higher confidence
        // - Weighted towards better models
        // - Matches expected outcome (REJECT if issues > 0)

        const validVotes = votes.filter(v => v.vote !== 'ERROR');
        if (validVotes.length === 0) return 0;

        const expectedVerdict = expectedIssues > 0 ? 'REJECT' : 'APPROVE';
        const weightedApprove = validVotes
            .filter(v => v.vote === 'APPROVE')
            .reduce((sum, v) => sum + v.confidence * v.weight, 0);
        const weightedReject = validVotes
            .filter(v => v.vote === 'REJECT')
            .reduce((sum, v) => sum + v.confidence * v.weight, 0);

        const totalWeight = validVotes.reduce((sum, v) => sum + v.confidence * v.weight, 0);
        const actualVerdict = weightedApprove > weightedReject ? 'APPROVE' : 'REJECT';

        // Score components
        const agreementScore = Math.max(weightedApprove, weightedReject) / totalWeight;
        const accuracyScore = actualVerdict === expectedVerdict ? 1.0 : 0.3;
        const confidenceScore = validVotes.reduce((sum, v) => sum + v.confidence, 0) / (validVotes.length * 100);

        return (agreementScore * 0.3 + accuracyScore * 0.5 + confidenceScore * 0.2) * 100;
    }

    async runAllBenchmarks(): Promise<void> {
        console.log('\n' + '═'.repeat(70));
        console.log('  SWARM SCALING BENCHMARK');
        console.log('═'.repeat(70) + '\n');

        for (const config of BENCHMARK_CONFIGS) {
            console.log(`\n▶ Testing: ${config.name}`);
            console.log(`  Agents: ${config.agents}, Models: ${config.models.length}, Context: ${config.contextSize}`);

            const allLatencies: number[] = [];
            let totalSuccesses = 0;
            let totalFailures = 0;
            let totalQuality = 0;

            for (const sample of TEST_SAMPLES) {
                process.stdout.write(`  → ${sample.name}... `);
                const result = await this.runBenchmark(config, sample);

                allLatencies.push(...result.latencies);
                totalSuccesses += result.successes;
                totalFailures += result.failures;

                const quality = this.calculateConsensusQuality(result.votes, sample.expectedIssues);
                totalQuality += quality;

                console.log(`${result.successes}/${config.agents} ok, ${Math.round(quality)}% quality`);

                // Rate limit protection
                await new Promise(r => setTimeout(r, 1000));
            }

            // Calculate metrics
            const avgLatency = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;
            const sortedLatencies = [...allLatencies].sort((a, b) => a - b);
            const p95Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || avgLatency;
            const successRate = totalSuccesses / (totalSuccesses + totalFailures) * 100;
            const avgQuality = totalQuality / TEST_SAMPLES.length;

            this.results.push({
                config: config.name,
                agents: config.agents,
                totalRequests: config.agents * TEST_SAMPLES.length,
                avgLatency: Math.round(avgLatency),
                p95Latency: Math.round(p95Latency),
                successRate: Math.round(successRate),
                tokensPerSecond: Math.round((config.maxTokens * totalSuccesses) / (avgLatency / 1000)),
                estimatedCost: 0, // HF Pro is flat rate
                consensusQuality: Math.round(avgQuality),
            });

            console.log(`  ✓ Avg: ${Math.round(avgLatency)}ms, P95: ${Math.round(p95Latency)}ms, Quality: ${Math.round(avgQuality)}%`);
        }

        this.printResults();
    }

    printResults(): void {
        console.log('\n' + '═'.repeat(70));
        console.log('  BENCHMARK RESULTS');
        console.log('═'.repeat(70) + '\n');

        // Sort by quality score
        const sorted = [...this.results].sort((a, b) => b.consensusQuality - a.consensusQuality);

        console.log('┌────────────────────────┬────────┬─────────┬─────────┬─────────┬─────────┐');
        console.log('│ Config                 │ Agents │ Avg(ms) │ P95(ms) │ Success │ Quality │');
        console.log('├────────────────────────┼────────┼─────────┼─────────┼─────────┼─────────┤');

        for (const r of sorted) {
            const qualityColor = r.consensusQuality >= 70 ? '\x1b[32m' : r.consensusQuality >= 50 ? '\x1b[33m' : '\x1b[31m';
            console.log(
                `│ ${r.config.padEnd(22)} │ ${String(r.agents).padStart(6)} │ ${String(r.avgLatency).padStart(7)} │ ${String(r.p95Latency).padStart(7)} │ ${String(r.successRate + '%').padStart(7)} │ ${qualityColor}${String(r.consensusQuality + '%').padStart(7)}\x1b[0m │`
            );
        }

        console.log('└────────────────────────┴────────┴─────────┴─────────┴─────────┴─────────┘');

        // Recommendations
        const best = sorted[0];
        const fastest = [...this.results].sort((a, b) => a.avgLatency - b.avgLatency)[0];

        console.log('\n📊 RECOMMENDATIONS:');
        console.log(`   Best Quality: ${best.config} (${best.consensusQuality}% quality, ${best.agents} agents)`);
        console.log(`   Fastest: ${fastest.config} (${fastest.avgLatency}ms avg, ${fastest.agents} agents)`);

        // Optimal config suggestion
        const optimal = sorted.find(r => r.successRate >= 90 && r.avgLatency < 5000) || best;
        console.log(`\n   ⭐ RECOMMENDED: ${optimal.config}`);
        console.log(`      ${optimal.agents} agents, ${optimal.avgLatency}ms latency, ${optimal.consensusQuality}% quality`);
    }
}

// ============================================================
// Main
// ============================================================

async function main() {
    try {
        const benchmark = new SwarmBenchmark();
        await benchmark.runAllBenchmarks();
    } catch (error: any) {
        console.error('Benchmark failed:', error.message);
        process.exit(1);
    }
}

main();
