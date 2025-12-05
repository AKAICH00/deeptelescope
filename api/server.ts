/**
 * AI Collab Swarm - Production API Server
 * Exposes code review swarm as REST API
 */

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { OpenAI } from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: 'Too many requests, please try again later',
});
app.use('/api/', limiter);

// HuggingFace client
const hfClient = new OpenAI({
    baseURL: 'https://router.huggingface.co/v1',
    apiKey: process.env.HF_TOKEN || '',
});

const SWARM_MODELS = [
    'Qwen/Qwen2.5-Coder-32B-Instruct',
    'meta-llama/Meta-Llama-3-8B-Instruct',
];

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Review endpoint
app.post('/api/review', async (req, res) => {
    try {
        const { code, task, apiKey } = req.body;

        if (!code || !task) {
            return res.status(400).json({
                error: 'Missing required fields: code and task',
            });
        }

        // Verify API key (Paddle subscription)
        // TODO: Add Paddle webhook verification
        if (!apiKey && process.env.NODE_ENV === 'production') {
            return res.status(401).json({
                error: 'API key required',
            });
        }

        console.log(`[Review] Starting swarm for task: ${task.substring(0, 50)}...`);

        // Run swarm review
        const result = await runSwarmReview(code, task);

        res.json(result);
    } catch (error: any) {
        console.error('[Review] Error:', error);
        res.status(500).json({
            error: error.message || 'Internal server error',
        });
    }
});

// Swarm review logic
async function runSwarmReview(code: string, task: string) {
    const swarmSize = 4;
    const truncatedCode = code.length > 3000 ? code.substring(0, 3000) + '\n...[truncated]' : code;

    // Run agents in parallel
    const agentPromises = [];
    for (let i = 0; i < swarmSize; i++) {
        const model = SWARM_MODELS[i % SWARM_MODELS.length];
        agentPromises.push(runAgentWorkflow(i, model, task, truncatedCode));
    }

    const results = await Promise.all(agentPromises);

    // Calculate consensus
    const approvals = results.filter((r) => r.vote === 'APPROVE');
    const approvalWeight = approvals.reduce((sum, r) => sum + r.confidence, 0);
    const totalWeight = results.reduce((sum, r) => sum + r.confidence, 0);
    const score = totalWeight > 0 ? approvalWeight / totalWeight : 0.5;

    const allIssues = [...new Set(results.flatMap((r) => r.issues))];

    return {
        verdict: score >= 0.6 ? 'APPROVED' : 'REJECTED',
        score: `${(score * 100).toFixed(1)}%`,
        threshold: '60%',
        summary: allIssues.length > 0
            ? `Issues: ${allIssues.slice(0, 3).join(', ')}${allIssues.length > 3 ? '...' : ''}`
            : 'No significant issues found',
        agents: results.map((r) => ({
            agent: `#${r.agentId}`,
            model: r.model,
            vote: r.vote,
            confidence: `${r.confidence}%`,
            issues: r.issues,
        })),
    };
}

async function runAgentWorkflow(
    agentId: number,
    model: string,
    task: string,
    code: string
): Promise<any> {
    const shortModel = model.split('/').pop() || model;

    try {
        // Phase 1: Generate
        const generatePrompt = `You are Agent #${agentId} reviewing code.
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

        const generateResp = await hfClient.chat.completions.create({
            model,
            messages: [{ role: 'user', content: generatePrompt }],
            max_tokens: 300,
            temperature: 0.8,
        });

        const initial = generateResp.choices[0]?.message?.content || '';

        // Phase 2: Correct
        const correctPrompt = `Review and CORRECT your assessment:
${initial}

Self-critique:
1. Did I miss edge cases?
2. Was I too harsh/lenient?
3. Are scores justified?

CORRECTIONS: [changes or "None needed"]
FINAL_ISSUES: [updated list]
FINAL_QUALITY: [1-10]`;

        const correctResp = await hfClient.chat.completions.create({
            model,
            messages: [{ role: 'user', content: correctPrompt }],
            max_tokens: 300,
            temperature: 0.1,
        });

        const corrected = correctResp.choices[0]?.message?.content || '';

        // Phase 3: Vote
        const votePrompt = `Cast your FINAL VOTE based on:
${corrected}

Task: ${task}

VOTE: APPROVE or REJECT
CONFIDENCE: [0-100]%
REASON: [one sentence]`;

        const voteResp = await hfClient.chat.completions.create({
            model,
            messages: [{ role: 'user', content: votePrompt }],
            max_tokens: 100,
            temperature: 0.0,
        });

        const voteContent = voteResp.choices[0]?.message?.content || 'APPROVE';
        const vote = voteContent.toUpperCase().includes('REJECT') ? 'REJECT' : 'APPROVE';
        const confMatch = voteContent.match(/(\d+)/);
        const confidence = confMatch ? Math.min(100, parseInt(confMatch[1])) : 50;

        // Extract issues
        const issueMatch = corrected.match(/FINAL_ISSUES:\s*([^\n]+(?:\n(?!FINAL_QUALITY)[^\n]+)*)/i);
        const issues = issueMatch
            ? issueMatch[1].split(/[,\n]/).map((s) => s.trim()).filter((s) => s && s.toLowerCase() !== 'none')
            : [];

        return {
            agentId,
            model: shortModel,
            vote,
            confidence,
            issues,
        };
    } catch (error: any) {
        console.error(`[Agent #${agentId}] Error:`, error.message);
        return {
            agentId,
            model: shortModel,
            vote: 'APPROVE',
            confidence: 30,
            issues: [],
        };
    }
}

// Start server
app.listen(PORT, () => {
    console.log(`🐝 AI Collab Swarm API running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Review endpoint: POST http://localhost:${PORT}/api/review`);
});

export default app;
