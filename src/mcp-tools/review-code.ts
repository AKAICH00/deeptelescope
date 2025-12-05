/**
 * Review Code Tool - MCP wrapper for HuggingFace swarm reviewer
 */

import { CLIManager } from '../cli-manager.js';
import { ReviewerAgent } from '../agents/reviewer-swarm.js';
import { REGISTRY } from '../registry.js';
import { PlanStep } from '../types.js';

export class ReviewCodeTool {
    private cliManager: CLIManager;
    private reviewer: ReviewerAgent;

    constructor() {
        this.cliManager = new CLIManager(process.cwd());
        this.reviewer = new ReviewerAgent(this.cliManager, REGISTRY['reviewer'], {
            swarmSize: 4,
            generateTemp: 0.8,
            correctTemp: 0.1,
            consensusThreshold: 0.6,
        });
    }

    async execute(args: any) {
        const { code, task, language } = args;

        if (!code || !task) {
            throw new Error('Missing required arguments: code and task');
        }

        // Create a mock step for the reviewer
        const step: PlanStep = {
            id: 1,
            action: 'execute',
            target: language ? `code.${language}` : 'code',
            description: task,
            assignedAgent: 'codex',
            status: 'completed',
            inputs: [],
            outputs: [],
        };

        console.error(`[ReviewCodeTool] Starting swarm review for: ${task}`);
        const startTime = Date.now();

        try {
            const approved = await this.reviewer.reviewStep(step, code);
            const elapsed = Date.now() - startTime;

            const result = {
                approved,
                elapsed_ms: elapsed,
                verdict: approved ? 'APPROVED' : 'REJECTED',
                swarm_size: 4,
                protocol: 'Generate(T=0.8) → Correct(T=0.1) → Vote(T=0.0)',
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
            console.error('[ReviewCodeTool] Error:', error);
            throw error;
        }
    }
}
