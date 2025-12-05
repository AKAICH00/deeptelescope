import * as vscode from 'vscode';
import { CLIManager } from './cli-manager';
import { OpusPlannerAgent } from './agents/opus-planner';
import { ReviewerAgent } from './agents/reviewer-swarm';
import { REGISTRY } from './registry';
import { PlanResponse, PlanStep, SharedContext } from './types';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Output channel for logging
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;

// ============================================================
// Extension Activation
// ============================================================
export function activate(context: vscode.ExtensionContext) {
    // Load .env from workspace if available
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        const envPath = path.join(workspaceFolder.uri.fsPath, '.env');
        if (fs.existsSync(envPath)) {
            dotenv.config({ path: envPath });
        }
    }

    // Also try extension directory .env
    const extensionEnv = path.join(context.extensionPath, '.env');
    if (fs.existsSync(extensionEnv)) {
        dotenv.config({ path: extensionEnv });
    }

    // Create output channel
    outputChannel = vscode.window.createOutputChannel('AI Collaboration');

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(hubot) AI Collab';
    statusBarItem.tooltip = 'AI Collaboration Plugin';
    statusBarItem.command = 'aiCollab.executeTask';
    statusBarItem.show();

    context.subscriptions.push(outputChannel);
    context.subscriptions.push(statusBarItem);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCollab.planTask', planTaskCommand),
        vscode.commands.registerCommand('aiCollab.executeTask', executeTaskCommand),
        vscode.commands.registerCommand('aiCollab.reviewCode', reviewCodeCommand),
        vscode.commands.registerCommand('aiCollab.configure', configureCommand)
    );

    log('AI Collaboration extension activated!');
    log('Commands: Plan Task, Execute Full Pipeline, Review Code with Swarm');
}

export function deactivate() {
    log('AI Collaboration extension deactivated');
}

// ============================================================
// Logging Helper
// ============================================================
function log(message: string, show: boolean = false) {
    const timestamp = new Date().toLocaleTimeString();
    outputChannel.appendLine(`[${timestamp}] ${message}`);
    if (show) {
        outputChannel.show();
    }
}

// ============================================================
// Get Configuration
// ============================================================
function getConfig() {
    const config = vscode.workspace.getConfiguration('aiCollab');
    return {
        anthropicApiKey: config.get<string>('anthropicApiKey') || process.env.ANTHROPIC_API_KEY || '',
        hfToken: config.get<string>('hfToken') || process.env.HF_TOKEN || '',
        swarmSize: config.get<number>('swarmSize') || 4,
        consensusThreshold: config.get<number>('consensusThreshold') || 0.6,
        autoConfirm: config.get<boolean>('autoConfirm') || false,
    };
}

// ============================================================
// Plan Task Command
// ============================================================
async function planTaskCommand() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    // Get user input
    const taskDescription = await vscode.window.showInputBox({
        prompt: 'What would you like to build?',
        placeHolder: 'e.g., Create a rate limiter with token bucket algorithm',
        ignoreFocusOut: true
    });

    if (!taskDescription) {
        return;
    }

    outputChannel.show();
    log(`Planning task: ${taskDescription}`, true);
    updateStatusBar('$(sync~spin) Planning...');

    try {
        const cliManager = new CLIManager(workspaceFolder.uri.fsPath);
        const planner = new OpusPlannerAgent(cliManager, REGISTRY['opus']);

        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'AI Collab: Planning with Opus',
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Sending request to Claude Opus...' });

            const context: SharedContext = {
                userRequest: taskDescription,
                plan: [],
                currentStepId: 0,
                workspaceFiles: new Map(),
                executionLog: []
            };
            const plan = await planner.generatePlan(context);

            if (plan) {
                log(`Plan created with ${plan.steps.length} steps (${(plan.confidence.overall * 100).toFixed(0)}% confidence)`);

                // Show plan summary
                await showPlanSummary(plan, taskDescription);
            } else {
                vscode.window.showErrorMessage('Failed to create plan');
            }
        });
    } catch (error: any) {
        log(`Error: ${error.message}`, true);
        vscode.window.showErrorMessage(`Planning failed: ${error.message}`);
    } finally {
        updateStatusBar('$(hubot) AI Collab');
    }
}

// ============================================================
// Execute Full Pipeline Command
// ============================================================
async function executeTaskCommand() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    // Get user input
    const taskDescription = await vscode.window.showInputBox({
        prompt: 'Describe the task to execute',
        placeHolder: 'e.g., Create a calculator module with add, subtract, multiply, divide',
        ignoreFocusOut: true
    });

    if (!taskDescription) {
        return;
    }

    outputChannel.show();
    log(`Starting full pipeline: ${taskDescription}`, true);

    const config = getConfig();
    const cliManager = new CLIManager(workspaceFolder.uri.fsPath);

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'AI Collab: Full Pipeline',
            cancellable: true
        }, async (progress, token) => {
            // Phase 1: Planning
            progress.report({ message: 'Phase 1: Planning with Opus...', increment: 0 });
            updateStatusBar('$(sync~spin) Planning...');

            const planner = new OpusPlannerAgent(cliManager, REGISTRY['opus']);
            const planContext: SharedContext = {
                userRequest: taskDescription,
                plan: [],
                currentStepId: 0,
                workspaceFiles: new Map(),
                executionLog: []
            };
            const plan = await planner.generatePlan(planContext);

            if (!plan) {
                throw new Error('Failed to create plan');
            }

            log(`Plan created: ${plan.steps.length} steps, ${(plan.confidence.overall * 100).toFixed(0)}% confidence`);
            progress.report({ message: `Plan: ${plan.steps.length} steps`, increment: 20 });

            // Confirm execution unless auto-confirm
            if (!config.autoConfirm) {
                const confirm = await vscode.window.showQuickPick(['Yes, execute plan', 'No, cancel'], {
                    placeHolder: `Execute ${plan.steps.length} steps? (${(plan.confidence * 100).toFixed(0)}% confidence)`,
                    ignoreFocusOut: true
                });

                if (confirm !== 'Yes, execute plan') {
                    log('Execution cancelled by user');
                    return;
                }
            }

            // Phase 2: Execution
            const stepIncrement = 60 / plan.steps.length;
            for (let i = 0; i < plan.steps.length; i++) {
                if (token.isCancellationRequested) {
                    log('Execution cancelled');
                    return;
                }

                const step = plan.steps[i];
                progress.report({
                    message: `Step ${i + 1}/${plan.steps.length}: ${step.description.substring(0, 50)}...`,
                    increment: stepIncrement
                });
                updateStatusBar(`$(sync~spin) Step ${i + 1}/${plan.steps.length}`);

                log(`Executing step ${i + 1}: ${step.description}`);

                // Execute the step using claude code CLI
                const result = await executeStep(cliManager, step, workspaceFolder.uri.fsPath);
                log(`Step ${i + 1} result: ${result.substring(0, 200)}...`);
            }

            // Phase 3: Review (if swarm is configured)
            if (config.hfToken) {
                progress.report({ message: 'Phase 3: Swarm Review...', increment: 10 });
                updateStatusBar('$(sync~spin) Reviewing...');

                const reviewer = new ReviewerAgent(cliManager, REGISTRY['reviewer'], {
                    swarmSize: config.swarmSize,
                    consensusThreshold: config.consensusThreshold
                });

                // Review the last created file
                const lastStep = plan.steps[plan.steps.length - 1];
                if (lastStep.target) {
                    const targetPath = path.join(workspaceFolder.uri.fsPath, lastStep.target);
                    if (await fs.pathExists(targetPath)) {
                        const content = await fs.readFile(targetPath, 'utf-8');
                        const approved = await reviewer.reviewStep(lastStep, content);
                        log(`Swarm review: ${approved ? 'APPROVED' : 'NEEDS IMPROVEMENT'}`);
                    }
                }
            }

            progress.report({ message: 'Complete!', increment: 10 });
            vscode.window.showInformationMessage(`AI Collab: Completed ${plan.steps.length} steps successfully!`);
        });
    } catch (error: any) {
        log(`Error: ${error.message}`, true);
        vscode.window.showErrorMessage(`Execution failed: ${error.message}`);
    } finally {
        updateStatusBar('$(hubot) AI Collab');
    }
}

// ============================================================
// Review Code Command
// ============================================================
async function reviewCodeCommand() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    const config = getConfig();
    if (!config.hfToken) {
        const setToken = await vscode.window.showWarningMessage(
            'HuggingFace token not configured. Swarm review requires HF_TOKEN.',
            'Configure Now'
        );
        if (setToken === 'Configure Now') {
            await configureCommand();
        }
        return;
    }

    // Get selected text or entire file
    const selection = editor.selection;
    const code = selection.isEmpty
        ? editor.document.getText()
        : editor.document.getText(selection);

    outputChannel.show();
    log(`Reviewing code: ${editor.document.fileName}`, true);
    updateStatusBar('$(sync~spin) Reviewing...');

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'AI Collab: Swarm Review',
            cancellable: false
        }, async (progress) => {
            progress.report({ message: `Deploying ${config.swarmSize} agents...` });

            const cliManager = new CLIManager(workspaceFolder.uri.fsPath);
            const reviewer = new ReviewerAgent(cliManager, REGISTRY['reviewer'], {
                swarmSize: config.swarmSize,
                generateTemp: 0.8,
                correctTemp: 0.1,
                consensusThreshold: config.consensusThreshold
            });

            const step: PlanStep = {
                id: 1,
                action: 'execute',
                target: path.relative(workspaceFolder.uri.fsPath, editor.document.fileName),
                description: `Review code in ${path.basename(editor.document.fileName)}`,
                assignedAgent: 'codex', // Using codex as placeholder for review
                status: 'pending',
                inputs: [],
                outputs: []
            };

            const approved = await reviewer.reviewStep(step, code);

            if (approved) {
                vscode.window.showInformationMessage('Swarm Review: CODE APPROVED');
                log('Swarm verdict: APPROVED');
            } else {
                vscode.window.showWarningMessage('Swarm Review: NEEDS IMPROVEMENT - Check output for details');
                log('Swarm verdict: NEEDS IMPROVEMENT');
            }
        });
    } catch (error: any) {
        log(`Error: ${error.message}`, true);
        vscode.window.showErrorMessage(`Review failed: ${error.message}`);
    } finally {
        updateStatusBar('$(hubot) AI Collab');
    }
}

// ============================================================
// Configure Command
// ============================================================
async function configureCommand() {
    const options = [
        'Set Anthropic API Key',
        'Set HuggingFace Token',
        'Configure Swarm Size',
        'Configure Consensus Threshold',
        'Toggle Auto-Confirm'
    ];

    const selected = await vscode.window.showQuickPick(options, {
        placeHolder: 'Select setting to configure'
    });

    if (!selected) return;

    const config = vscode.workspace.getConfiguration('aiCollab');

    switch (selected) {
        case 'Set Anthropic API Key':
            const apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your Anthropic API Key',
                password: true,
                ignoreFocusOut: true
            });
            if (apiKey) {
                await config.update('anthropicApiKey', apiKey, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage('Anthropic API Key saved');
            }
            break;

        case 'Set HuggingFace Token':
            const hfToken = await vscode.window.showInputBox({
                prompt: 'Enter your HuggingFace Token',
                password: true,
                ignoreFocusOut: true
            });
            if (hfToken) {
                await config.update('hfToken', hfToken, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage('HuggingFace Token saved');
            }
            break;

        case 'Configure Swarm Size':
            const size = await vscode.window.showQuickPick(['2', '4', '6', '8'], {
                placeHolder: 'Select number of agents in swarm'
            });
            if (size) {
                await config.update('swarmSize', parseInt(size), vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Swarm size set to ${size}`);
            }
            break;

        case 'Configure Consensus Threshold':
            const threshold = await vscode.window.showQuickPick(['0.5 (50%)', '0.6 (60%)', '0.7 (70%)', '0.8 (80%)'], {
                placeHolder: 'Select approval threshold'
            });
            if (threshold) {
                const value = parseFloat(threshold.split(' ')[0]);
                await config.update('consensusThreshold', value, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Consensus threshold set to ${value * 100}%`);
            }
            break;

        case 'Toggle Auto-Confirm':
            const current = config.get<boolean>('autoConfirm') || false;
            await config.update('autoConfirm', !current, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Auto-confirm ${!current ? 'enabled' : 'disabled'}`);
            break;
    }
}

// ============================================================
// Helper: Execute a plan step
// ============================================================
async function executeStep(_cliManager: CLIManager, step: PlanStep, workspacePath: string): Promise<string> {
    const execaModule = await import('execa');
    const execa = execaModule.default;

    const prompt = `Execute this task in the codebase at ${workspacePath}:
${step.description}
Target file: ${step.target}

Complete the task and report what you did.`;

    try {
        const result = await execa('claude', [
            '--dangerously-skip-permissions',
            '-p', prompt
        ], {
            cwd: workspacePath,
            timeout: 120000
        });

        return result.stdout;
    } catch (error: any) {
        log(`Step execution error: ${error.message}`);
        throw error;
    }
}

// ============================================================
// Helper: Show plan summary
// ============================================================
async function showPlanSummary(plan: PlanResponse, taskDescription: string) {
    const items = plan.steps.map((step: PlanStep, i: number) => ({
        label: `${i + 1}. [${step.assignedAgent}] ${step.description.substring(0, 60)}...`,
        description: step.target || '',
        detail: step.description
    }));

    items.unshift({
        label: `Confidence: ${(plan.confidence.overall * 100).toFixed(0)}%`,
        description: `${plan.steps.length} steps`,
        detail: plan.analysis?.summary || taskDescription
    });

    if (plan.risks && plan.risks.length > 0) {
        items.push({
            label: '--- Risks ---',
            description: '',
            detail: ''
        });
        plan.risks.forEach((risk: { severity: string; description: string; mitigation?: string }) => {
            items.push({
                label: `[${risk.severity.toUpperCase()}] ${risk.description}`,
                description: risk.mitigation || '',
                detail: ''
            });
        });
    }

    await vscode.window.showQuickPick(items, {
        placeHolder: 'Plan Summary (press Escape to close)',
        canPickMany: false,
        ignoreFocusOut: true
    });
}

// ============================================================
// Helper: Update status bar
// ============================================================
function updateStatusBar(text: string) {
    statusBarItem.text = text;
}
