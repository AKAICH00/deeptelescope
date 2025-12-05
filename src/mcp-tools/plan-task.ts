/**
 * Plan Task Tool - MCP wrapper for Opus planner
 */

import { CLIManager } from '../cli-manager.js';
import { OpusPlannerAgent } from '../agents/opus-planner.js';
import { REGISTRY } from '../registry.js';
import { SharedContext } from '../types.js';

export class PlanTaskTool {
    private cliManager: CLIManager;
    private planner: OpusPlannerAgent;

    constructor() {
        this.cliManager = new CLIManager(process.cwd());
        this.planner = new OpusPlannerAgent(
            this.cliManager,
            REGISTRY['opus'],
            process.cwd()
        );
    }

    async execute(args: any) {
        const { task, context = [] } = args;

        if (!task) {
            throw new Error('Missing required argument: task');
        }

        // Create shared context
        const sharedContext: SharedContext = {
            userRequest: task,
            plan: [],
            currentStepId: 0,
            workspaceFiles: new Map(),
            executionLog: [],
        };

        // Add context files if provided
        for (const ctx of context) {
            sharedContext.workspaceFiles.set(ctx, ctx);
        }

        console.error(`[PlanTaskTool] Planning task: ${task}`);

        try {
            // Start Opus agent
            await this.cliManager.startAgent(REGISTRY['opus']);

            // Generate plan
            const planResponse = await this.planner.generatePlan(sharedContext);

            const result = {
                plan_id: planResponse.planId,
                steps: planResponse.steps.length,
                confidence: {
                    overall: Math.round(planResponse.confidence.overall * 100) + '%',
                    task_clarity: Math.round(planResponse.confidence.taskClarity * 100) + '%',
                    context: Math.round(planResponse.confidence.contextSufficiency * 100) + '%',
                    approach: Math.round(planResponse.confidence.approachConfidence * 100) + '%',
                    feasibility: Math.round(planResponse.confidence.executionFeasibility * 100) + '%',
                },
                requires_approval: planResponse.requiresApproval,
                risks: planResponse.risks,
                plan_steps: planResponse.steps.map((s) => ({
                    id: s.id,
                    action: s.action,
                    description: s.description,
                    agent: s.assignedAgent,
                    target: s.target,
                })),
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        } catch (error) {
            console.error('[PlanTaskTool] Error:', error);
            throw error;
        }
    }
}
