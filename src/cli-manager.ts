import { spawn, ChildProcess } from 'child_process';
/**
 * Configuration for each AI CLI agent.
 */
export interface ModelConfig {
    name: string;
    command: string;
    args: string[];
    /**
     * Communication mode: direct stdin streaming or one-shot process.
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

export class CLIManager {
    private processes: Map<string, ChildProcess> = new Map();

    constructor(private workspaceDir: string) { }

    /**
     * Spawns a CLI tool in a persistent mode if possible, or prepares it for single-shot execution.
     */
    public async startAgent(config: ModelConfig): Promise<void> {
        // For oneshot mode, we don't need to start anything
        if (config.interactionMode === 'oneshot') {
            console.log(`[CLIManager] Agent ${config.name} configured for oneshot mode.`);
            return;
        }

        console.log(`[CLIManager] Starting agent: ${config.name}`);

        if (config.interactionMode === 'stdin') {
            const child = spawn(config.command, config.args, {
                cwd: this.workspaceDir,
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true
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
     */
    private sendOneshotPrompt(prompt: string, config: ModelConfig): Promise<string> {
        return new Promise((resolve, reject) => {
            const TIMEOUT_MS = config.timeoutMs || 120000; // 2 minute default timeout
            let timeoutHandle: NodeJS.Timeout | null = null;
            let resolved = false;

            const child = spawn(config.command, config.args, {
                cwd: this.workspaceDir,
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true
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
