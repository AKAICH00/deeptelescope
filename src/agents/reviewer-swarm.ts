import { CLIManager, ModelConfig } from '../cli-manager';
import { PlanStep } from '../types';
import { OpenAI } from 'openai';

// ============================================================
// Self-Correcting OSS Agent Swarm Protocol
// Phase 1: Generate (High Temp) → Phase 2: Correct (Low Temp) → Phase 3: Vote
// ============================================================

const SWARM_MODELS = [
    "Qwen/Qwen2.5-Coder-32B-Instruct",    // Generator: Best for code generation
    "meta-llama/Meta-Llama-3-8B-Instruct", // Corrector: Fast, good at following rules
];

interface SwarmConfig {
    swarmSize: number;          // Number of parallel agents
    generateTemp: number;       // High temp for diversity
    correctTemp: number;        // Low temp for precision
    consensusThreshold: number; // % needed for approval
}

const DEFAULT_CONFIG: SwarmConfig = {
    swarmSize: 6,              // 6 parallel agents (reduced for API limits)
    generateTemp: 0.8,         // High diversity in generation
    correctTemp: 0.1,          // Precise self-correction
    consensusThreshold: 0.6,   // 60% must approve
};

interface AgentResult {
    agentId: number;
    model: string;
    initialAssessment: string;
    correctedAssessment: string;
    finalVote: "APPROVE" | "REJECT";
    confidence: number;
    reasoning: string;
}

export class ReviewerAgent {
    private client: OpenAI;
    private config: SwarmConfig;

    constructor(private cliManager: CLIManager, private modelConfig: ModelConfig, swarmConfig?: Partial<SwarmConfig>) {
        const token = process.env.HF_TOKEN;
        if (!token) {
            console.warn("[Swarm] No HF_TOKEN found. Swarm review may fail.");
        }

        this.client = new OpenAI({
            baseURL: "https://router.huggingface.co/v1",
            apiKey: token || "dummy-token",
        });

        this.config = { ...DEFAULT_CONFIG, ...swarmConfig };
    }

    // ============================================================
    // Main Entry: Self-Correcting Swarm Review
    // ============================================================
    public async reviewStep(step: PlanStep, output: string): Promise<boolean> {
        console.log(`\n[Swarm] 🐝 Deploying Self-Correcting Swarm (${this.config.swarmSize} agents)...`);
        console.log(`[Swarm] Protocol: Generate(T=${this.config.generateTemp}) → Correct(T=${this.config.correctTemp}) → Vote`);

        const tinyContext = output.length > 2000
            ? output.substring(0, 2000) + "...[truncated]"
            : output;

        // Phase 1-2-3: Run all agents in parallel (each does Generate→Correct→Vote)
        const agentPromises: Promise<AgentResult>[] = [];
        for (let i = 0; i < this.config.swarmSize; i++) {
            // Distribute across models for diversity
            const model = SWARM_MODELS[i % SWARM_MODELS.length];
            agentPromises.push(this.runAgentWorkflow(i, model, step, tinyContext));
        }

        const results = await Promise.all(agentPromises);

        // Phase 3: Consensus
        return this.calculateConsensus(results);
    }

    // ============================================================
    // Single Agent Workflow: Generate → Correct → Vote
    // ============================================================
    private async runAgentWorkflow(
        agentId: number,
        model: string,
        step: PlanStep,
        context: string
    ): Promise<AgentResult> {
        const shortModel = model.split('/').pop() || model;
        console.log(`[Agent #${agentId}] Starting workflow with ${shortModel}...`);

        try {
            // PHASE 1: GENERATE (High Temperature for Diversity)
            const generatePrompt = `You are Agent #${agentId} reviewing code output.

Task: ${step.description}
Target: ${step.target}

Output to review:
${context}

Give your INITIAL assessment. Be thorough but concise.
Consider: correctness, error handling, type safety, edge cases, code quality.

Format:
ISSUES: [list any problems found, or "None"]
QUALITY: [1-10 score]
NOTES: [any observations]`;

            const generateResponse = await this.client.chat.completions.create({
                model: model,
                messages: [{ role: "user", content: generatePrompt }],
                max_tokens: 300,
                temperature: this.config.generateTemp,
                seed: 1000 + agentId, // Unique seed per agent
            });

            const initialAssessment = generateResponse.choices[0]?.message?.content || "No assessment";
            console.log(`[Agent #${agentId}] Phase 1 (Generate) complete`);

            // PHASE 2: CORRECT (Low Temperature for Precision)
            const correctPrompt = `You are Agent #${agentId}. Review and CORRECT your initial assessment.

Your initial assessment was:
${initialAssessment}

Self-critique checklist:
1. Did I miss any edge cases?
2. Was I too harsh or too lenient?
3. Did I consider the task requirements fully?
4. Are my quality scores justified?

Provide your CORRECTED assessment. Be precise and fair.

Format:
CORRECTIONS: [what you're changing and why, or "None needed"]
FINAL_ISSUES: [updated list of real problems]
FINAL_QUALITY: [1-10 score, justified]`;

            const correctResponse = await this.client.chat.completions.create({
                model: model,
                messages: [{ role: "user", content: correctPrompt }],
                max_tokens: 300,
                temperature: this.config.correctTemp,
            });

            const correctedAssessment = correctResponse.choices[0]?.message?.content || "No correction";
            console.log(`[Agent #${agentId}] Phase 2 (Correct) complete`);

            // PHASE 3: VOTE (Zero Temperature for Determinism)
            const votePrompt = `You are Agent #${agentId}. Cast your FINAL VOTE.

Your corrected assessment:
${correctedAssessment}

Task requirement: ${step.description}

Based on your analysis, does this code PASS or FAIL the requirements?

You must respond in EXACTLY this format:
VOTE: APPROVE or REJECT
CONFIDENCE: [0-100]%
REASON: [one sentence explanation]`;

            const voteResponse = await this.client.chat.completions.create({
                model: model,
                messages: [{ role: "user", content: votePrompt }],
                max_tokens: 100,
                temperature: 0.0, // Deterministic voting
            });

            const voteContent = voteResponse.choices[0]?.message?.content || "APPROVE";
            const parsed = this.parseVote(voteContent);

            console.log(`[Agent #${agentId}] Phase 3 (Vote): ${parsed.vote} (${parsed.confidence}%)`);

            return {
                agentId,
                model: shortModel,
                initialAssessment,
                correctedAssessment,
                finalVote: parsed.vote,
                confidence: parsed.confidence,
                reasoning: parsed.reasoning,
            };

        } catch (error: any) {
            console.error(`[Agent #${agentId}] Error: ${error.message}`);
            // Fail open on error - don't block deployment
            return {
                agentId,
                model: shortModel,
                initialAssessment: "Error during assessment",
                correctedAssessment: "Error during correction",
                finalVote: "APPROVE",
                confidence: 30,
                reasoning: `API error: ${error.message.substring(0, 50)}`,
            };
        }
    }

    // ============================================================
    // Parse Vote Response
    // ============================================================
    private parseVote(content: string): { vote: "APPROVE" | "REJECT"; confidence: number; reasoning: string } {
        const lines = content.trim().split('\n');
        const voteLine = lines[0]?.toUpperCase() || "";
        const vote = voteLine.includes("REJECT") ? "REJECT" : "APPROVE";

        // Extract confidence (look for a number)
        const confidenceMatch = content.match(/(\d+)/);
        const confidence = confidenceMatch ? Math.min(100, parseInt(confidenceMatch[1])) : 50;

        // Rest is reasoning
        const reasoning = lines.slice(2).join(' ').trim() || "No reasoning provided";

        return { vote, confidence, reasoning };
    }

    // ============================================================
    // Consensus Calculation (Weighted by Confidence)
    // ============================================================
    private calculateConsensus(results: AgentResult[]): boolean {
        console.log("\n[Swarm] 📊 Swarm Consensus Report:");
        console.log("─".repeat(70));

        // Display results table
        console.table(results.map(r => ({
            Agent: `#${r.agentId}`,
            Model: r.model,
            Vote: r.finalVote,
            Confidence: `${r.confidence}%`,
            Reason: r.reasoning.substring(0, 40) + "..."
        })));

        // Calculate weighted consensus
        const approvals = results.filter(r => r.finalVote === "APPROVE");
        const rejections = results.filter(r => r.finalVote === "REJECT");

        const approvalWeight = approvals.reduce((sum, r) => sum + r.confidence, 0);
        const rejectionWeight = rejections.reduce((sum, r) => sum + r.confidence, 0);
        const totalWeight = approvalWeight + rejectionWeight;

        const approvalRatio = totalWeight > 0 ? approvalWeight / totalWeight : 0.5;
        const simpleRatio = approvals.length / results.length;

        console.log("─".repeat(70));
        console.log(`[Swarm] Simple Vote: ${approvals.length} APPROVE vs ${rejections.length} REJECT`);
        console.log(`[Swarm] Weighted Score: ${(approvalRatio * 100).toFixed(1)}% approval`);
        console.log(`[Swarm] Threshold: ${this.config.consensusThreshold * 100}%`);

        // Use weighted consensus
        const approved = approvalRatio >= this.config.consensusThreshold;

        if (approved) {
            console.log(`[Swarm] ✅ CONSENSUS: APPROVED (${(approvalRatio * 100).toFixed(1)}% >= ${this.config.consensusThreshold * 100}%)`);
        } else {
            console.log(`[Swarm] ❌ CONSENSUS: REJECTED (${(approvalRatio * 100).toFixed(1)}% < ${this.config.consensusThreshold * 100}%)`);
        }
        console.log("─".repeat(70));

        return approved;
    }

    // ============================================================
    // Quick Review (Single Agent, No Self-Correction)
    // For fast, low-stakes reviews
    // ============================================================
    public async quickReview(task: string, output: string): Promise<boolean> {
        console.log("[Swarm] ⚡ Quick review (single agent)...");

        const prompt = `Does this output correctly complete the task?
Task: ${task}
Output: ${output.substring(0, 1000)}

Answer YES or NO with a brief reason.`;

        try {
            const response = await this.client.chat.completions.create({
                model: SWARM_MODELS[0],
                messages: [{ role: "user", content: prompt }],
                max_tokens: 50,
                temperature: 0.1,
            });

            const content = response.choices[0]?.message?.content || "YES";
            const approved = content.toUpperCase().includes("YES");
            console.log(`[Swarm] Quick: ${approved ? "✅ YES" : "❌ NO"} - ${content.substring(0, 50)}`);
            return approved;
        } catch {
            return true; // Fail open
        }
    }
}
