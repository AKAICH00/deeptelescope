// ============================================================
// Orchestrator - Multi-Agent Coordination with Confidence Routing
// ============================================================

import { CLIManager } from './cli-manager';
import { SharedContext, PlanStep, PlanResponse, ExecutionResult } from './types';
import { REGISTRY } from './registry';
import { OpusPlannerAgent } from './agents/opus-planner';
import { GeminiAgent } from './agents/gemini-context';
import { ReviewerAgent } from './agents/reviewer-swarm';

import { WebSocketServer, WebSocket } from 'ws';

// ============================================================
// Types for WebSocket Messages
// ============================================================
interface WSMessage {
    type: 'REQUEST' | 'APPROVE_PLAN' | 'REJECT_PLAN' | 'CANCEL';
    payload?: any;
}

interface WSStateUpdate {
    type: 'STATE_UPDATE' | 'PLAN_APPROVAL_REQUIRED' | 'EXECUTION_COMPLETE' | 'ERROR';
    payload: any;
}

// ============================================================
// Orchestrator Class
// ============================================================
export class Orchestrator {
    private cliManager: CLIManager;
    private context: SharedContext;
    private wss: WebSocketServer;
    private workspaceDir: string;
    private pendingApproval: boolean = false;
    private approvalResolver: ((approved: boolean) => void) | null = null;

    constructor(workspaceDir: string) {
        this.workspaceDir = workspaceDir;
        this.cliManager = new CLIManager(workspaceDir);
        this.context = {
            userRequest: "",
            plan: [],
            currentStepId: 0,
            workspaceFiles: new Map(),
            executionLog: []
        };

        // Start WebSocket Server
        this.wss = new WebSocketServer({ port: 8080 });
        console.log("[Orchestrator] WebSocket Server started on port 8080");

        this.wss.on('connection', (ws) => {
            console.log("[Orchestrator] Frontend connected");
            this.broadcastState();

            ws.on('message', async (message) => {
                try {
                    const data: WSMessage = JSON.parse(message.toString());
                    await this.handleMessage(data);
                } catch (e) {
                    console.error("[Orchestrator] Failed to parse message:", e);
                }
            });
        });
    }

    // --------------------------------------------------------
    // Message Handler
    // --------------------------------------------------------
    private async handleMessage(data: WSMessage) {
        switch (data.type) {
            case 'REQUEST':
                await this.handleRequest(data.payload);
                break;

            case 'APPROVE_PLAN':
                if (this.approvalResolver) {
                    console.log("[Orchestrator] Plan approved by user");
                    this.approvalResolver(true);
                    this.approvalResolver = null;
                    this.pendingApproval = false;
                }
                break;

            case 'REJECT_PLAN':
                if (this.approvalResolver) {
                    console.log("[Orchestrator] Plan rejected by user");
                    this.approvalResolver(false);
                    this.approvalResolver = null;
                    this.pendingApproval = false;
                }
                break;

            case 'CANCEL':
                console.log("[Orchestrator] Operation cancelled by user");
                this.pendingApproval = false;
                this.approvalResolver = null;
                break;
        }
    }

    // --------------------------------------------------------
    // Main Request Handler
    // --------------------------------------------------------
    private async handleRequest(userRequest: string) {
        try {
            await this.initialize(userRequest);
            const planResponse = await this.generatePlan();

            if (planResponse.requiresApproval) {
                // Low confidence - ask for approval
                const approved = await this.requestApproval(planResponse);
                if (!approved) {
                    this.context.executionLog.push("Plan rejected by user");
                    this.broadcastState();
                    return;
                }
            }

            await this.executePlan();

            this.broadcast({
                type: 'EXECUTION_COMPLETE',
                payload: {
                    success: true,
                    summary: this.generateSummary()
                }
            });
        } catch (error) {
            console.error("[Orchestrator] Error:", error);
            this.broadcast({
                type: 'ERROR',
                payload: { message: String(error) }
            });
        }
    }

    // --------------------------------------------------------
    // Broadcast Helpers
    // --------------------------------------------------------
    private broadcast(message: WSStateUpdate) {
        const data = JSON.stringify(message);
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    }

    private broadcastState() {
        this.broadcast({
            type: 'STATE_UPDATE',
            payload: {
                plan: this.context.plan,
                planResponse: this.context.planResponse,
                logs: this.context.executionLog,
                currentStep: this.context.currentStepId,
                pendingApproval: this.pendingApproval
            }
        });
    }

    // --------------------------------------------------------
    // Request Approval from User
    // --------------------------------------------------------
    private async requestApproval(planResponse: PlanResponse): Promise<boolean> {
        this.pendingApproval = true;

        this.broadcast({
            type: 'PLAN_APPROVAL_REQUIRED',
            payload: {
                planResponse,
                reason: this.getApprovalReason(planResponse),
                confidenceBreakdown: planResponse.confidence,
                risks: planResponse.risks
            }
        });

        // Wait for user response
        return new Promise((resolve) => {
            this.approvalResolver = resolve;

            // Timeout after 5 minutes
            setTimeout(() => {
                if (this.approvalResolver) {
                    console.log("[Orchestrator] Approval timeout - auto-rejecting");
                    this.approvalResolver(false);
                    this.approvalResolver = null;
                    this.pendingApproval = false;
                }
            }, 5 * 60 * 1000);
        });
    }

    private getApprovalReason(planResponse: PlanResponse): string {
        const conf = planResponse.confidence;
        const reasons: string[] = [];

        if (conf.taskClarity < 0.7) {
            reasons.push("Task requirements are unclear");
        }
        if (conf.contextSufficiency < 0.7) {
            reasons.push("Missing context or file information");
        }
        if (conf.approachConfidence < 0.7) {
            reasons.push("Uncertain about the best approach");
        }
        if (conf.executionFeasibility < 0.7) {
            reasons.push("Execution may encounter issues");
        }

        const highRisks = planResponse.risks.filter(r => r.severity === 'high' || r.severity === 'critical');
        if (highRisks.length > 0) {
            reasons.push(`${highRisks.length} high/critical risk(s) identified`);
        }

        return reasons.length > 0
            ? reasons.join("; ")
            : "Overall confidence below threshold";
    }

    // --------------------------------------------------------
    // Initialize Context
    // --------------------------------------------------------
    public async initialize(userRequest: string) {
        this.context.userRequest = userRequest;
        this.context.executionLog = [];
        this.context.plan = [];
        this.context.planResponse = undefined;
        this.context.currentStepId = 0;

        console.log(`[Orchestrator] Initialized with request: "${userRequest}"`);
        this.context.executionLog.push(`Request received: "${userRequest}"`);

        // Start agents
        await this.cliManager.startAgent(REGISTRY['codex']);

        // Enrich context with Gemini
        const gemini = new GeminiAgent(this.cliManager, REGISTRY['gemini']);
        await gemini.enrichContext(this.context);

        this.context.executionLog.push("Context enriched by Gemini");
        this.broadcastState();
    }

    // --------------------------------------------------------
    // Generate Plan (Enhanced)
    // --------------------------------------------------------
    public async generatePlan(): Promise<PlanResponse> {
        console.log("[Orchestrator] Asking Planner (Claude Opus) to generate a plan...");
        this.context.executionLog.push("Requesting plan from Opus...");
        this.broadcastState();

        const planner = new OpusPlannerAgent(
            this.cliManager,
            REGISTRY['opus'],
            this.workspaceDir
        );
        await this.cliManager.startAgent(REGISTRY['opus']);

        const planResponse = await planner.generatePlan(this.context);

        // Store full response
        this.context.planResponse = planResponse;
        this.context.plan = planResponse.steps;

        // Log the result
        const confStr = `${(planResponse.confidence.overall * 100).toFixed(0)}%`;
        this.context.executionLog.push(
            `Plan generated: ${planResponse.steps.length} steps, ${confStr} confidence`
        );

        if (planResponse.risks.length > 0) {
            const riskSummary = planResponse.risks
                .map(r => `${r.severity}: ${r.description}`)
                .join("; ");
            this.context.executionLog.push(`Risks identified: ${riskSummary}`);
        }

        console.log("[Orchestrator] Plan generated:", {
            steps: planResponse.steps.length,
            confidence: planResponse.confidence.overall,
            requiresApproval: planResponse.requiresApproval
        });

        this.broadcastState();
        return planResponse;
    }

    // --------------------------------------------------------
    // Execute Plan
    // --------------------------------------------------------
    public async executePlan() {
        const reviewer = new ReviewerAgent(this.cliManager, REGISTRY['reviewer']);
        const results: ExecutionResult[] = [];

        this.context.executionLog.push("Starting plan execution...");
        this.broadcastState();

        for (const step of this.context.plan) {
            const startTime = Date.now();
            console.log(`[Orchestrator] Executing Step ${step.id}: ${step.description}`);

            this.context.currentStepId = step.id;
            step.status = 'in-progress';
            this.context.executionLog.push(`Step ${step.id}: ${step.description} [started]`);
            this.broadcastState();

            try {
                // Check dependencies
                const unmetDeps = step.inputs.filter(depId => {
                    const depStep = this.context.plan.find(s => s.id === depId);
                    return depStep && depStep.status !== 'completed';
                });

                if (unmetDeps.length > 0) {
                    step.status = 'skipped';
                    step.error = `Unmet dependencies: ${unmetDeps.join(', ')}`;
                    this.context.executionLog.push(`Step ${step.id}: Skipped (unmet deps)`);
                    results.push({
                        success: false,
                        stepId: step.id,
                        error: step.error,
                        duration: Date.now() - startTime
                    });
                    continue;
                }

                // Execute based on agent
                let output: string;

                switch (step.assignedAgent) {
                    case 'codex':
                        output = await this.executeCodexStep(step);
                        break;
                    case 'opus':
                        output = await this.executeOpusStep(step);
                        break;
                    case 'gemini':
                        output = await this.executeGeminiStep(step);
                        break;
                    case 'antigravity':
                        output = await this.executeAntigravityStep(step);
                        break;
                    default:
                        output = "Unknown agent";
                }

                step.output = output;

                // Review step (for code changes)
                if (['write', 'edit', 'execute'].includes(step.action)) {
                    const passed = await reviewer.reviewStep(step, output);
                    if (!passed) {
                        step.status = 'failed';
                        step.error = 'Failed review';
                        this.context.executionLog.push(`Step ${step.id}: Failed review`);
                        results.push({
                            success: false,
                            stepId: step.id,
                            error: 'Failed review',
                            duration: Date.now() - startTime
                        });
                        continue;
                    }
                }

                step.status = 'completed';
                this.context.executionLog.push(`Step ${step.id}: Completed`);
                results.push({
                    success: true,
                    stepId: step.id,
                    output,
                    duration: Date.now() - startTime
                });

            } catch (error) {
                step.status = 'failed';
                step.error = String(error);
                this.context.executionLog.push(`Step ${step.id}: Failed - ${error}`);
                results.push({
                    success: false,
                    stepId: step.id,
                    error: String(error),
                    duration: Date.now() - startTime
                });
            }

            this.broadcastState();
        }

        this.context.executionLog.push("Plan execution complete");
        this.broadcastState();
    }

    // --------------------------------------------------------
    // Agent-Specific Execution
    // --------------------------------------------------------
    // --------------------------------------------------------
    // Agent-Specific Execution
    // --------------------------------------------------------
    private async executeCodexStep(step: PlanStep): Promise<string> {
        const prompt = this.formatContextForAgent(step);
        // REAL EXECUTION: Send prompt to Codex agent
        const response = await this.cliManager.sendPrompt('codex', prompt, REGISTRY['codex']);
        return response || `[Codex] No output received for step ${step.id}`;
    }

    private async executeOpusStep(step: PlanStep): Promise<string> {
        const prompt = `Analyze and provide guidance for: ${step.description}`;
        // REAL EXECUTION: Send prompt to Opus agent
        const response = await this.cliManager.sendPrompt('opus', prompt, REGISTRY['opus']);
        return response || `[Opus] No output received for step ${step.id}`;
    }

    private async executeGeminiStep(step: PlanStep): Promise<string> {
        const prompt = this.formatContextForAgent(step);
        const response = await this.cliManager.sendPrompt(
            'gemini',
            prompt,
            REGISTRY['gemini']
        );
        return response || `[Gemini] No output received for step ${step.id}`;
    }

    private async executeAntigravityStep(step: PlanStep): Promise<string> {
        const prompt = this.formatContextForAgent(step);
        const response = await this.cliManager.sendPrompt(
            'antigravity',
            prompt,
            REGISTRY['antigravity']
        );
        return response || `[Antigravity] No output received for step ${step.id}`;
    }

    // --------------------------------------------------------
    // Format Context for Agent
    // --------------------------------------------------------
    private formatContextForAgent(step: PlanStep): string {
        const contextObj = {
            sessionId: this.context.planResponse?.planId || "session-unknown",
            currentStep: step,
            allSteps: this.context.plan,
            history: this.context.executionLog.slice(-10),
            files: Object.fromEntries(this.context.workspaceFiles)
        };

    return `
# Shared Context
\`\`\`AI-JSON
${JSON.stringify(contextObj, null, 2)}
\`\`\`

## TASK
You are the ${step.assignedAgent} agent.
Execute Step ${step.id}: ${step.description}
Target: ${step.target}
Action: ${step.action}

Previous steps have produced:
${step.inputs.map(id => {
  const s = this.context.plan.find(x => x.id === id);
  return s ? `Step ${id}: ${s.output || 'no output'}` : '';
}).filter(Boolean).join('\n')}
`;
    }

    // --------------------------------------------------------
    // Generate Execution Summary
    // --------------------------------------------------------
    private generateSummary() {
        const completed = this.context.plan.filter(s => s.status === 'completed').length;
        const failed = this.context.plan.filter(s => s.status === 'failed').length;
        const skipped = this.context.plan.filter(s => s.status === 'skipped').length;

        return {
            planId: this.context.planResponse?.planId,
            totalSteps: this.context.plan.length,
            completed,
            failed,
            skipped,
            success: failed === 0,
            logs: this.context.executionLog
        };
    }
}
