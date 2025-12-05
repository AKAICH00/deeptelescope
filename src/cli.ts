#!/usr/bin/env node
// ============================================================
// AI Collaboration CLI - Interactive Terminal Interface
// Modeled after Claude Code / Antigravity
// ============================================================

import * as readline from 'readline';
import { CLIManager } from './cli-manager';
import { SharedContext, PlanStep, PlanResponse } from './types';
import { REGISTRY } from './registry';
import { OpusPlannerAgent } from './agents/opus-planner';
import { GeminiAgent } from './agents/gemini-context';
import { ReviewerAgent } from './agents/reviewer-swarm';
import { FileExecutor } from './file-executor';

// ============================================================
// ANSI Colors & Formatting
// ============================================================
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    italic: '\x1b[3m',
    underline: '\x1b[4m',

    // Colors
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',

    // Backgrounds
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m',
};

// ============================================================
// Symbols
// ============================================================
const sym = {
    bullet: '●',
    circle: '○',
    halfCircle: '◐',
    check: '✓',
    cross: '✗',
    arrow: '→',
    arrowRight: '❯',
    warning: '⚠',
    info: 'ℹ',
    star: '★',
    spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
};

// ============================================================
// CLI Class
// ============================================================
class CollaborationCLI {
    private rl: readline.Interface;
    private cliManager: CLIManager;
    private context: SharedContext;
    private workspaceDir: string;
    private spinnerInterval: NodeJS.Timeout | null = null;
    private spinnerFrame = 0;
    private autoConfirm: boolean = false;
    private fileExecutor: FileExecutor;

    constructor() {
        this.workspaceDir = process.cwd();
        // Check for --auto-confirm flag
        this.autoConfirm = process.argv.includes('--auto-confirm') || process.argv.includes('-y');
        this.cliManager = new CLIManager(this.workspaceDir);
        this.fileExecutor = new FileExecutor(this.workspaceDir);
        this.context = {
            userRequest: '',
            plan: [],
            currentStepId: 0,
            workspaceFiles: new Map(),
            executionLog: []
        };

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
    }

    // --------------------------------------------------------
    // Output Helpers
    // --------------------------------------------------------
    private print(msg: string) {
        process.stdout.write(msg);
    }

    private println(msg: string = '') {
        console.log(msg);
    }

    private clearLine() {
        process.stdout.write('\r\x1b[K');
    }

    private header() {
        this.println();
        this.println(`${c.cyan}${c.bold}  ╭─────────────────────────────────────────╮${c.reset}`);
        this.println(`${c.cyan}${c.bold}  │${c.reset}  ${c.bold}AI Collaboration Plugin${c.reset}  ${c.dim}v0.1.0${c.reset}      ${c.cyan}${c.bold}│${c.reset}`);
        this.println(`${c.cyan}${c.bold}  │${c.reset}  ${c.dim}Opus Planner + Codex Coder${c.reset}            ${c.cyan}${c.bold}│${c.reset}`);
        this.println(`${c.cyan}${c.bold}  ╰─────────────────────────────────────────╯${c.reset}`);
        this.println();
        this.println(`${c.dim}  Workspace: ${this.workspaceDir}${c.reset}`);
        this.println(`${c.dim}  Type your request or 'exit' to quit${c.reset}`);
        this.println();
    }

    private divider() {
        this.println(`${c.dim}  ${'─'.repeat(45)}${c.reset}`);
    }

    // --------------------------------------------------------
    // Spinner
    // --------------------------------------------------------
    private startSpinner(message: string) {
        this.spinnerFrame = 0;
        this.spinnerInterval = setInterval(() => {
            const frame = sym.spinner[this.spinnerFrame % sym.spinner.length];
            this.clearLine();
            this.print(`  ${c.cyan}${frame}${c.reset} ${message}`);
            this.spinnerFrame++;
        }, 80);
    }

    private stopSpinner(finalMessage?: string) {
        if (this.spinnerInterval) {
            clearInterval(this.spinnerInterval);
            this.spinnerInterval = null;
        }
        this.clearLine();
        if (finalMessage) {
            this.println(finalMessage);
        }
    }

    // --------------------------------------------------------
    // Confidence Display
    // --------------------------------------------------------
    private getConfidenceColor(value: number): string {
        if (value >= 0.7) return c.green;
        if (value >= 0.5) return c.yellow;
        return c.red;
    }

    private renderConfidenceBar(value: number, width: number = 20): string {
        const filled = Math.round(value * width);
        const empty = width - filled;
        const color = this.getConfidenceColor(value);
        return `${color}${'█'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset}`;
    }

    private displayPlanSummary(planResponse: PlanResponse) {
        const conf = planResponse.confidence;
        const confColor = this.getConfidenceColor(conf.overall);

        this.println();
        this.println(`  ${c.bold}Plan Summary${c.reset}`);
        this.divider();

        // Confidence gauge
        const pct = Math.round(conf.overall * 100);
        this.println(`  ${c.dim}Confidence:${c.reset}  ${this.renderConfidenceBar(conf.overall)} ${confColor}${pct}%${c.reset}`);

        // Breakdown
        this.println(`  ${c.dim}├─ Task Clarity:${c.reset}      ${Math.round(conf.taskClarity * 100)}%`);
        this.println(`  ${c.dim}├─ Context:${c.reset}           ${Math.round(conf.contextSufficiency * 100)}%`);
        this.println(`  ${c.dim}├─ Approach:${c.reset}          ${Math.round(conf.approachConfidence * 100)}%`);
        this.println(`  ${c.dim}└─ Feasibility:${c.reset}       ${Math.round(conf.executionFeasibility * 100)}%`);

        this.println();

        // Steps
        this.println(`  ${c.bold}Steps (${planResponse.steps.length})${c.reset}`);
        this.divider();

        for (const step of planResponse.steps) {
            const agentColor = step.assignedAgent === 'codex' ? c.blue :
                step.assignedAgent === 'opus' ? c.magenta :
                    step.assignedAgent === 'gemini' ? c.yellow : c.white;
            this.println(`  ${c.dim}${step.id}.${c.reset} ${agentColor}[${step.assignedAgent}]${c.reset} ${step.description}`);
            if (step.target && step.target !== step.description) {
                this.println(`     ${c.dim}${sym.arrow} ${step.target}${c.reset}`);
            }
        }

        // Risks
        if (planResponse.risks.length > 0) {
            this.println();
            this.println(`  ${c.bold}Risks (${planResponse.risks.length})${c.reset}`);
            this.divider();

            for (const risk of planResponse.risks) {
                const sevColor = risk.severity === 'critical' ? c.red :
                    risk.severity === 'high' ? c.red :
                        risk.severity === 'medium' ? c.yellow : c.dim;
                this.println(`  ${sevColor}${sym.warning} [${risk.severity.toUpperCase()}]${c.reset} ${risk.description}`);
                this.println(`    ${c.dim}Mitigation: ${risk.mitigation}${c.reset}`);
            }
        }

        // Understanding
        this.println();
        this.println(`  ${c.bold}Understanding${c.reset}`);
        this.divider();
        this.println(`  ${c.dim}${planResponse.analysis.understanding}${c.reset}`);

        this.println();
    }

    // --------------------------------------------------------
    // Step Execution Display
    // --------------------------------------------------------
    private displayStepProgress(step: PlanStep, status: 'running' | 'done' | 'failed' | 'skipped') {
        const icon = status === 'running' ? `${c.cyan}${sym.halfCircle}${c.reset}` :
            status === 'done' ? `${c.green}${sym.check}${c.reset}` :
                status === 'failed' ? `${c.red}${sym.cross}${c.reset}` :
                    `${c.dim}${sym.circle}${c.reset}`;

        const agentColor = step.assignedAgent === 'codex' ? c.blue :
            step.assignedAgent === 'opus' ? c.magenta :
                step.assignedAgent === 'gemini' ? c.yellow : c.white;

        this.clearLine();
        this.println(`  ${icon} ${c.dim}Step ${step.id}:${c.reset} ${agentColor}[${step.assignedAgent}]${c.reset} ${step.description}`);
    }

    // --------------------------------------------------------
    // Prompt Helpers
    // --------------------------------------------------------
    private async prompt(question: string): Promise<string> {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                resolve(answer.trim());
            });
        });
    }

    private async confirm(question: string): Promise<boolean> {
        if (this.autoConfirm) {
            this.println(`  ${question} ${c.dim}(y/n)${c.reset} ${c.green}y (auto)${c.reset}`);
            return true;
        }
        const answer = await this.prompt(`  ${question} ${c.dim}(y/n)${c.reset} `);
        return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
    }

    // --------------------------------------------------------
    // Main Flow
    // --------------------------------------------------------
    async run() {
        this.header();

        while (true) {
            const input = await this.prompt(`  ${c.cyan}${sym.arrowRight}${c.reset} `);

            if (!input) continue;
            if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
                this.println(`\n  ${c.dim}Goodbye!${c.reset}\n`);
                break;
            }

            if (input.toLowerCase().includes('identify') && input.toLowerCase().includes('models')) {
                this.listModels();
                continue;
            }

            await this.handleRequest(input);
            this.println();
        }

        this.rl.close();
    }

    private listModels() {
        this.println();
        this.println(`  ${c.bold}Available Models (Registry)${c.reset}`);
        this.divider();

        for (const [key, config] of Object.entries(REGISTRY)) {
            this.println(`  ${c.cyan}${c.bold}${key}${c.reset}`);
            this.println(`    ${c.dim}Command:${c.reset} ${config.command} ${config.args.join(' ')}`);
            this.println(`    ${c.dim}Mode:${c.reset}    ${config.interactionMode}`);
            this.println();
        }
    }

    private async handleRequest(request: string) {
        this.context.userRequest = request;
        this.context.executionLog = [];
        this.context.plan = [];

        // Phase 1: Planning
        this.println();
        this.startSpinner('Planning with Opus...');

        let planResponse: PlanResponse;
        try {
            // Ensure Opus is running
            await this.cliManager.startAgent(REGISTRY['opus']);

            const planner = new OpusPlannerAgent(
                this.cliManager,
                REGISTRY['opus'],
                this.workspaceDir
            );

            planResponse = await planner.generatePlan(this.context);
            this.context.planResponse = planResponse;
            this.context.plan = planResponse.steps;

            this.stopSpinner(`  ${c.green}${sym.check}${c.reset} Plan generated`);
        } catch (error) {
            this.stopSpinner(`  ${c.red}${sym.cross}${c.reset} Planning failed: ${error}`);
            return;
        }

        // Display plan
        this.displayPlanSummary(planResponse);

        // Phase 2: Approval (if needed)
        if (planResponse.requiresApproval || planResponse.confidence.overall < 0.7) {
            this.println(`  ${c.yellow}${sym.warning}${c.reset} ${c.bold}Low confidence - approval required${c.reset}`);
            this.println();

            const approved = await this.confirm('Execute this plan?');
            if (!approved) {
                this.println(`  ${c.dim}Plan cancelled.${c.reset}`);
                return;
            }
        } else {
            const proceed = await this.confirm('Execute?');
            if (!proceed) {
                this.println(`  ${c.dim}Plan cancelled.${c.reset}`);
                return;
            }
        }

        // Phase 3: Execution
        this.println();
        this.println(`  ${c.bold}Executing...${c.reset}`);
        this.divider();

        for (const step of this.context.plan) {
            this.displayStepProgress(step, 'running');

            try {
                const output = await this.executeStep(step);
                step.status = 'completed';
                step.output = output;
                this.displayStepProgress(step, 'done');

                // Show output (truncated if too long)
                if (output && output.trim()) {
                    const lines = output.split('\n').slice(0, 10);
                    for (const line of lines) {
                        this.println(`    ${c.dim}${line.slice(0, 100)}${c.reset}`);
                    }
                    if (output.split('\n').length > 10) {
                        this.println(`    ${c.dim}... (${output.split('\n').length - 10} more lines)${c.reset}`);
                    }
                }
            } catch (error) {
                step.status = 'failed';
                step.error = String(error);
                this.displayStepProgress(step, 'failed');
                this.println(`    ${c.red}Error: ${error}${c.reset}`);
            }
        }

        // Summary
        this.println();
        const completed = this.context.plan.filter(s => s.status === 'completed').length;
        const failed = this.context.plan.filter(s => s.status === 'failed').length;

        if (failed === 0) {
            this.println(`  ${c.green}${sym.check} All ${completed} steps completed successfully${c.reset}`);
        } else {
            this.println(`  ${c.yellow}${sym.warning} ${completed} completed, ${failed} failed${c.reset}`);
        }
    }

    private async executeStep(step: PlanStep): Promise<string> {
        // REAL EXECUTION - NO SIMULATION - ALL AGENTS CALL REAL CLI
        const agentName = step.assignedAgent;
        const config = REGISTRY[agentName];

        if (!config) {
            throw new Error(`No config found for agent: ${agentName}`);
        }

        // Enhanced prompt that instructs agent to actually write files
        const prompt = `You are an autonomous coding agent with FULL FILE SYSTEM ACCESS.

TASK: ${step.description}
TARGET FILE: ${step.target}
WORKSPACE: ${this.workspaceDir}

INSTRUCTIONS:
1. You MUST actually create/modify the file using your Write or Edit tools
2. Do NOT just describe what to do - ACTUALLY DO IT
3. After writing the file, confirm what you did

If creating a new file, write it with proper exports and TypeScript types.
If modifying, make minimal targeted changes.

Execute now.`;

        console.log(`[executeStep] Calling REAL agent: ${agentName} via ${config.command} ${config.args.join(' ')}`);
        const response = await this.cliManager.sendPrompt(agentName, prompt, config);

        if (!response || !response.trim()) {
            return `(Agent ${agentName} returned empty response)`;
        }

        // Verify file was created/modified - if not, use FileExecutor as fallback
        const targetExists = await this.fileExecutor.verifyFile(step.target);

        if (!targetExists && step.target && step.target !== 'task') {
            console.log(`[executeStep] File not found after agent execution, using FileExecutor fallback...`);
            const execResult = await this.fileExecutor.executeFromResponse(response, step.target);

            if (execResult.filesModified.length > 0) {
                return `${response}\n\n[FileExecutor] Created: ${execResult.filesModified.join(', ')}`;
            } else if (execResult.errors.length > 0) {
                console.warn(`[FileExecutor] Errors: ${execResult.errors.join(', ')}`);
            }
        }

        return response;
    }
}

// ============================================================
// Entry Point
// ============================================================
async function main() {
    const cli = new CollaborationCLI();
    await cli.run();
}

main().catch(console.error);
