import { spawn, ChildProcess } from 'child_process';
import {
    validateCommand,
    sanitizeArgs,
    validateWorkspace,
    getSafeEnvironment
} from './security-utils';

/**
 * Configuration for each AI CLI agent.
 */
export interface ModelConfig {
    name: string;
    command: string;
    args: string[];
    /**
     * Communication mode: direct stdin streaming or one-shot process.
     * NOTE: 'stdin' mode is deprecated for security reasons.
     */
    interactionMode: 'stdin' | 'oneshot' | 'file-watch';
    /**
     * Sentinel token that the agent must emit to signal end-of-response.
     * Only required for stdin mode.
     */
    sentinel?: string;
    /**
     * Timeout in milliseconds for waiting on the sentinel.
     */
    timeoutMs?: number;
    watchPath?: string;
}

/**
 * SECURE CLI Manager with input validation and injection prevention
 *
 * Security improvements:
 * - Disabled shell execution (prevents CWE-78 command injection)
 * - Argument sanitization (prevents CWE-88 argument injection)
 * - Command validation (prevents arbitrary command execution)
 * - Workspace validation (prevents path traversal)
 * - Safe environment (removes dangerous env vars)
 */
export class CLIManager {
    private processes: Map<string, ChildProcess> = new Map();
    private workspaceDir: string;

    constructor(workspaceDir: string) {
        // ✅ SECURITY: Validate workspace directory
        this.workspaceDir = validateWorkspace(workspaceDir);
        console.log(`[CLIManager] Validated workspace: ${this.workspaceDir}`);
    }

    /**
     * Spawns a CLI tool in a persistent mode if possible, or prepares it for single-shot execution.
     *
     * SECURITY IMPROVEMENTS:
     * - Validates command name
     * - Sanitizes all arguments
     * - Disables shell execution (shell: false)
     * - Uses safe environment
     */
    public async startAgent(config: ModelConfig): Promise<void> {
        // For oneshot mode, we don't need to start anything
        if (config.interactionMode === 'oneshot') {
            console.log(`[CLIManager] Agent ${config.name} configured for oneshot mode.`);
            return;
        }

        console.log(`[CLIManager] Starting agent: ${config.name}`);

        if (config.interactionMode === 'stdin') {
            // ✅ SECURITY: Validate command and sanitize arguments
            const safeCommand = validateCommand(config.command);
            const safeArgs = sanitizeArgs(config.args);
            const safeEnv = getSafeEnvironment();

            console.log(`[CLIManager] Validated command: ${safeCommand}`);
            console.log(`[CLIManager] Sanitized args: ${safeArgs.join(' ')}`);

            // ✅ SECURITY FIX: shell: false prevents command injection (CWE-78)
            const child = spawn(safeCommand, safeArgs, {
                cwd: this.workspaceDir,
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: false,  // ✅ CRITICAL: Prevents shell interpretation
                env: safeEnv
            });

            child.on('error', (err) => {
                console.error(`[CLIManager] Failed to start agent ${config.name}:`, err);
            });

            child.on('exit', (code, signal) => {
                console.log(`[CLIManager] Agent ${config.name} exited with code ${code} and signal ${signal}`);
                this.processes.delete(config.name);
            });

            child.stdout?.on('data', (data) => {
                console.log(`[${config.name} STDOUT]: ${data.toString()}`);
            });

            child.stderr?.on('data', (data) => {
                console.error(`[${config.name} STDERR]: ${data.toString()}`);
            });

            this.processes.set(config.name, child);
            console.log(`[CLIManager] Agent ${config.name} started successfully (PID: ${child.pid}).`);
        }
    }

    /**
     * Sends a prompt to the agent.
     * For oneshot mode, spawns a new process for each request.
     */
    public async sendPrompt(agentName: string, prompt: string, config: ModelConfig): Promise<string> {
        if (config.interactionMode === 'oneshot') {
            return this.sendOneshotPrompt(prompt, config);
        }

        // Stream mode: send via stdin and await sentinel
        const child = this.processes.get(agentName);
        if (!child || !child.stdin || !child.stdout) {
            throw new Error(`Agent ${agentName} is not running or has no stdin/stdout.`);
        }
        const stdin = child.stdin;
        const stdout = child.stdout;

        return new Promise((resolve, reject) => {
            const sentinel = config.sentinel || "--END-OF-RESPONSE--";
            const timeoutMs = config.timeoutMs;
            const fullPrompt = `${prompt}\n\nIMPORTANT: When you have finished your response, you MUST print the following line exactly:\n${sentinel}\n`;

            let buffer = "";
            let resolved = false;

            const onError = (err: Error) => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    reject(err);
                }
            };

            const cleanup = () => {
                if (timer) clearTimeout(timer);
                stdout.off('data', onData);
                child.off('exit', onExit);
                child.off('error', onError);
            };

            const timer = timeoutMs ? setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    reject(new Error(`Timeout waiting for sentinel from ${agentName}`));
                }
            }, timeoutMs) : null;

            const onExit = (code: number, signal: NodeJS.Signals) => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    reject(new Error(`Agent ${agentName} exited before sentinel (code=${code}, signal=${signal})`));
                }
            };

            const onData = (data: Buffer) => {
                buffer += data.toString();
                if (buffer.includes(sentinel)) {
                    if (!resolved) { // Ensure we only resolve once
                        resolved = true;
                        cleanup();
                        const response = buffer.split(sentinel)[0].trim();
                        resolve(response);
                    }
                }
            };

            stdout.on('data', onData);
            child.on('exit', onExit);
            child.on('error', onError);

            stdin.write(fullPrompt);
        });
    }

    /**
     * One-shot execution: spawn process, pipe prompt, collect response.
     * Includes timeout handling for long-running commands.
     *
     * SECURITY IMPROVEMENTS:
     * - Validates command
     * - Sanitizes arguments
     * - Disables shell (shell: false)
     * - Uses safe environment
     */
    private sendOneshotPrompt(prompt: string, config: ModelConfig): Promise<string> {
        return new Promise((resolve, reject) => {
            const TIMEOUT_MS = config.timeoutMs || 120000; // 2 minute default timeout
            let timeoutHandle: NodeJS.Timeout | null = null;
            let resolved = false;

            // ✅ SECURITY: Validate command and sanitize arguments
            let safeCommand: string;
            let safeArgs: string[];
            let safeEnv: NodeJS.ProcessEnv;

            try {
                safeCommand = validateCommand(config.command);
                safeArgs = sanitizeArgs(config.args);
                safeEnv = getSafeEnvironment();
            } catch (err) {
                reject(new Error(`Security validation failed: ${err}`));
                return;
            }

            console.log(`[CLIManager] Oneshot: ${safeCommand} ${safeArgs.join(' ')}`);

            // ✅ SECURITY FIX: shell: false prevents command injection (CWE-78)
            const child = spawn(safeCommand, safeArgs, {
                cwd: this.workspaceDir,
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: false,  // ✅ CRITICAL: Prevents shell interpretation
                env: safeEnv
            });

            let stdout = '';
            let stderr = '';

            // Set timeout
            timeoutHandle = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    console.warn(`[CLIManager] ${config.name} timed out after ${TIMEOUT_MS / 1000}s`);
                    child.kill('SIGTERM');
                    // Return whatever we collected so far
                    if (stdout.trim()) {
                        console.log(`[CLIManager] Returning partial response (${stdout.length} chars)`);
                        resolve(stdout.trim());
                    } else {
                        reject(new Error(`Command timed out after ${TIMEOUT_MS / 1000}s with no output`));
                    }
                }
            }, TIMEOUT_MS);

            child.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('error', (err) => {
                if (!resolved) {
                    resolved = true;
                    if (timeoutHandle) clearTimeout(timeoutHandle);
                    reject(new Error(`Failed to spawn ${config.command}: ${err.message}`));
                }
            });

            child.on('close', (code) => {
                if (!resolved) {
                    resolved = true;
                    if (timeoutHandle) clearTimeout(timeoutHandle);
                    if (code !== 0 && stderr) {
                        console.error(`[CLIManager] ${config.name} stderr:`, stderr);
                    }
                    resolve(stdout.trim());
                }
            });

            // Send prompt to stdin and close it
            if (child.stdin) {
                child.stdin.write(prompt);
                child.stdin.end();
            }
        });
    }

    public stopAll() {
        this.processes.forEach(p => p.kill());
    }
}
