// ============================================================
// Opus Planner Agent - Simplified for Reliable Parsing
// ============================================================

import { CLIManager, ModelConfig } from '../cli-manager';
import {
    SharedContext,
    PlanStep,
    PlanResponse,
    Risk
} from '../types';
import * as fs from 'fs-extra';
import * as path from 'path';

const CONFIDENCE_THRESHOLD = 0.7;

interface SimplifiedPlanResponse {
    understanding: string;
    approach: string;
    steps: { id: number; agent: string; action: string; target: string }[];
    confidence: number;
    risks: string[];
}

export class OpusPlannerAgent {
    private workspaceDir: string;

    constructor(
        private cliManager: CLIManager,
        private config: ModelConfig,
        workspaceDir?: string
    ) {
        this.workspaceDir = workspaceDir || process.cwd();
    }

    // --------------------------------------------------------
    // Main Entry Point
    // --------------------------------------------------------
    public async generatePlan(context: SharedContext): Promise<PlanResponse> {
        // Build minimal context
        const projectInfo = await this.getProjectInfo();
        const keyModules = await this.identifyKeyModules();

        // Construct compact prompt
        const prompt = this.constructPrompt(context.userRequest, projectInfo, keyModules);

        // Send to Claude
        console.log('[OpusPlanner] Sending request to Claude Opus...');
        const response = await this.cliManager.sendPrompt(this.config.name, prompt, this.config);

        // Parse the simplified response
        const simplified = this.parseSimplifiedResponse(response);

        // Convert to full PlanResponse
        const planResponse = this.convertToFullResponse(simplified);

        // Determine if approval is needed
        planResponse.requiresApproval = planResponse.confidence.overall < CONFIDENCE_THRESHOLD;

        console.log(`[OpusPlanner] Plan generated with ${planResponse.confidence.overall.toFixed(2)} confidence`);
        if (planResponse.requiresApproval) {
            console.log('[OpusPlanner] Low confidence - plan requires user approval');
        }

        return planResponse;
    }

    // --------------------------------------------------------
    // Get Project Info
    // --------------------------------------------------------
    private async getProjectInfo(): Promise<{ name: string; type: string }> {
        const name = path.basename(this.workspaceDir);
        let type = 'unknown';

        const indicators = [
            { file: 'package.json', type: 'node' },
            { file: 'pyproject.toml', type: 'python' },
            { file: 'Cargo.toml', type: 'rust' },
            { file: 'go.mod', type: 'go' }
        ];

        for (const { file, type: t } of indicators) {
            if (await fs.pathExists(path.join(this.workspaceDir, file))) {
                type = t;
                break;
            }
        }

        return { name, type };
    }

    // --------------------------------------------------------
    // Identify Key Modules (simplified)
    // --------------------------------------------------------
    private async identifyKeyModules(): Promise<{ path: string; purpose: string }[]> {
        const modules: { path: string; purpose: string }[] = [];
        const srcDir = path.join(this.workspaceDir, 'src');

        if (await fs.pathExists(srcDir)) {
            try {
                const files = await fs.readdir(srcDir);
                for (const file of files.filter(f => f.endsWith('.ts') || f.endsWith('.js')).slice(0, 5)) {
                    modules.push({
                        path: `src/${file}`,
                        purpose: this.guessPurpose(file)
                    });
                }
            } catch { }
        }

        return modules;
    }

    private guessPurpose(filename: string): string {
        if (filename.includes('orchestrat')) return 'Agent orchestration';
        if (filename.includes('cli')) return 'CLI management';
        if (filename.includes('type')) return 'Type definitions';
        if (filename.includes('registry')) return 'Agent registry';
        if (filename.includes('index')) return 'Entry point';
        return 'Module';
    }

    // --------------------------------------------------------
    // Prompt Construction (Compact)
    // --------------------------------------------------------
    private constructPrompt(
        userRequest: string,
        projectInfo: { name: string; type: string },
        keyModules: { path: string; purpose: string }[]
    ): string {
        const keyFiles = keyModules.map(m => `- ${m.path}: ${m.purpose}`).join('\n');

        return `You are Opus, a planning agent. Create a plan for the following task.

Project: ${projectInfo.name} (${projectInfo.type})
Key files:
${keyFiles || '- Standard project structure'}

TASK: ${userRequest}

Respond with ONLY a JSON object (no markdown, no extra text):
{"understanding":"brief task summary","approach":"your approach","steps":[{"id":1,"agent":"codex","action":"what to do","target":"file.ts"}],"confidence":0.8,"risks":["potential risk"]}

Keep it concise. Max 3-5 steps.`;
    }

    // --------------------------------------------------------
    // Response Parsing (Simplified format)
    // --------------------------------------------------------
    private parseSimplifiedResponse(response: string): SimplifiedPlanResponse {
        const cleaned = response.trim();

        // Try multiple extraction strategies
        const strategies = [
            () => this.extractPureJson(cleaned),
            () => this.extractFromFence(cleaned),
            () => this.extractFromBraces(cleaned),
            () => this.repairAndParse(cleaned)
        ];

        for (const strategy of strategies) {
            try {
                const result = strategy();
                if (result && result.steps) {
                    return result;
                }
            } catch (e) {
                // Try next strategy
            }
        }

        // All strategies failed - return fallback
        console.error('[OpusPlanner] All parsing strategies failed.');
        console.error('[OpusPlanner] Raw response (first 300 chars):', cleaned.slice(0, 300));
        return this.createFallbackSimplified();
    }

    private extractPureJson(text: string): SimplifiedPlanResponse {
        // Try to parse as pure JSON
        if (text.startsWith('{')) {
            return JSON.parse(text);
        }
        throw new Error('Not pure JSON');
    }

    private extractFromFence(text: string): SimplifiedPlanResponse {
        const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) {
            return JSON.parse(match[1]);
        }
        throw new Error('No fence found');
    }

    private extractFromBraces(text: string): SimplifiedPlanResponse {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end > start) {
            return JSON.parse(text.slice(start, end + 1));
        }
        throw new Error('No braces found');
    }

    private repairAndParse(text: string): SimplifiedPlanResponse {
        // Try to repair truncated JSON
        let json = text;

        // Find JSON start
        const start = json.indexOf('{');
        if (start !== -1) {
            json = json.slice(start);
        }

        // Check if truncated (no closing brace or missing parts)
        if (!json.includes('}')) {
            // Add missing closing braces/brackets
            const openBraces = (json.match(/{/g) || []).length;
            const closeBraces = (json.match(/}/g) || []).length;
            const openBrackets = (json.match(/\[/g) || []).length;
            const closeBrackets = (json.match(/]/g) || []).length;

            json += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
            json += '}'.repeat(Math.max(0, openBraces - closeBraces));
        }

        return JSON.parse(json);
    }

    private createFallbackSimplified(): SimplifiedPlanResponse {
        return {
            understanding: 'Unable to parse plan response',
            approach: 'Manual review required',
            steps: [
                { id: 1, agent: 'opus', action: 'Review request and create plan manually', target: 'task' }
            ],
            confidence: 0.3,
            risks: ['Response parsing failed']
        };
    }

    // --------------------------------------------------------
    // Convert Simplified to Full Response
    // --------------------------------------------------------
    private convertToFullResponse(simplified: SimplifiedPlanResponse): PlanResponse {
        const steps: PlanStep[] = (simplified.steps || []).map((step, idx) => ({
            id: step.id ?? idx + 1,
            action: 'execute' as const,
            target: step.target || 'unknown',
            description: step.action || 'No description',
            assignedAgent: this.normalizeAgent(step.agent),
            status: 'pending' as const,
            inputs: [],
            outputs: []
        }));

        const risks: Risk[] = (simplified.risks || []).map((risk) => ({
            severity: 'medium' as const,
            category: 'other' as const,
            description: typeof risk === 'string' ? risk : 'Unknown risk',
            mitigation: 'Review before execution',
            affectedSteps: steps.map(s => s.id)
        }));

        const confidence = typeof simplified.confidence === 'number'
            ? simplified.confidence
            : 0.5;

        return {
            planId: `plan-${Date.now()}`,
            analysis: {
                understanding: simplified.understanding || 'Unknown',
                constraints: [],
                approaches: [{
                    approach: simplified.approach || 'Default approach',
                    pros: [],
                    cons: []
                }],
                chosenApproach: simplified.approach || 'Default',
                rationale: 'Based on task analysis'
            },
            steps,
            dependencies: [],
            risks,
            confidence: {
                taskClarity: confidence,
                contextSufficiency: confidence,
                approachConfidence: confidence,
                executionFeasibility: confidence,
                overall: confidence
            },
            estimatedTokens: 500,
            requiresApproval: false
        };
    }

    private normalizeAgent(agent: string): 'codex' | 'opus' | 'gemini' | 'antigravity' {
        const normalized = (agent || 'codex').toLowerCase();
        if (['codex', 'opus', 'gemini', 'antigravity'].includes(normalized)) {
            return normalized as 'codex' | 'opus' | 'gemini' | 'antigravity';
        }
        return 'codex';
    }
}
