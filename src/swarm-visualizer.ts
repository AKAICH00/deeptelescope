/**
 * Swarm Visualizer - CRT-style terminal animation
 * Shows agents thinking, voting, and reaching consensus in real-time
 */

// ANSI escape codes for CRT effects
const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const BLINK = `${ESC}[5m`;
const REVERSE = `${ESC}[7m`;

// Colors
const CYAN = `${ESC}[36m`;
const GREEN = `${ESC}[32m`;
const YELLOW = `${ESC}[33m`;
const RED = `${ESC}[31m`;
const MAGENTA = `${ESC}[35m`;
const WHITE = `${ESC}[37m`;
const GRAY = `${ESC}[90m`;

// Bright colors (for CRT glow effect)
const BRIGHT_CYAN = `${ESC}[96m`;
const BRIGHT_GREEN = `${ESC}[92m`;
const BRIGHT_YELLOW = `${ESC}[93m`;
const BRIGHT_WHITE = `${ESC}[97m`;

// Cursor control
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const CLEAR_LINE = `${ESC}[2K`;
const MOVE_UP = (n: number) => `${ESC}[${n}A`;
const MOVE_TO_COL = (n: number) => `${ESC}[${n}G`;

// Unicode characters
const BLOCK_FULL = '█';
const BLOCK_LIGHT = '░';
const BLOCK_MED = '▒';
const BLOCK_DARK = '▓';
const DOT = '•';
const BULLET = '◦';
const ARROW_RIGHT = '▶';
const CHECK = '✓';
const CROSS = '✗';
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// Agent personas
const AGENT_NAMES = ['QWEN-32B', 'LLAMA-8B', 'QWEN-32B', 'LLAMA-8B'];
const AGENT_COLORS = [BRIGHT_CYAN, BRIGHT_GREEN, BRIGHT_YELLOW, MAGENTA];

interface AgentState {
    id: number;
    name: string;
    color: string;
    phase: 'idle' | 'thinking' | 'correcting' | 'voting' | 'done';
    thought: string;
    vote?: 'APPROVE' | 'REJECT';
    confidence?: number;
}

export class SwarmVisualizer {
    private agents: AgentState[] = [];
    private frameCount = 0;
    private startTime = Date.now();

    constructor(private agentCount = 4) {
        this.agents = Array.from({ length: agentCount }, (_, i) => ({
            id: i,
            name: AGENT_NAMES[i % AGENT_NAMES.length],
            color: AGENT_COLORS[i % AGENT_COLORS.length],
            phase: 'idle',
            thought: '',
        }));
    }

    // ============================================================
    // CRT Header with scanline effect
    // ============================================================
    private renderHeader(): string {
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
        const scanline = this.frameCount % 2 === 0 ? DIM : '';

        return `
${scanline}${BRIGHT_CYAN}╔═══════════════════════════════════════════════════════════════╗${RESET}
${scanline}${BRIGHT_CYAN}║${RESET}  ${BRIGHT_WHITE}${BOLD}🐝 SWARM REVIEW${RESET}  ${GRAY}│${RESET}  ${this.agentCount} agents  ${GRAY}│${RESET}  ${elapsed}s  ${BRIGHT_CYAN}║${RESET}
${scanline}${BRIGHT_CYAN}╠═══════════════════════════════════════════════════════════════╣${RESET}`;
    }

    // ============================================================
    // Render single agent with animated state
    // ============================================================
    private renderAgent(agent: AgentState): string {
        const spinner = SPINNER[this.frameCount % SPINNER.length];
        const scanline = (agent.id + this.frameCount) % 3 === 0 ? DIM : '';

        let statusIcon = '';
        let statusText = '';
        let thoughtText = '';

        switch (agent.phase) {
            case 'idle':
                statusIcon = `${GRAY}○${RESET}`;
                statusText = `${GRAY}waiting...${RESET}`;
                break;

            case 'thinking':
                statusIcon = `${agent.color}${spinner}${RESET}`;
                statusText = `${agent.color}GENERATE${RESET} ${GRAY}T=0.8${RESET}`;
                thoughtText = this.typewriterEffect(agent.thought, 40);
                break;

            case 'correcting':
                statusIcon = `${YELLOW}${spinner}${RESET}`;
                statusText = `${YELLOW}CORRECT${RESET} ${GRAY}T=0.1${RESET}`;
                thoughtText = this.typewriterEffect(agent.thought, 40);
                break;

            case 'voting':
                statusIcon = `${BRIGHT_WHITE}${BLINK}▶${RESET}`;
                statusText = `${BRIGHT_WHITE}VOTING...${RESET}`;
                break;

            case 'done':
                if (agent.vote === 'APPROVE') {
                    statusIcon = `${BRIGHT_GREEN}${CHECK}${RESET}`;
                    statusText = `${BRIGHT_GREEN}APPROVE${RESET} ${GRAY}${agent.confidence}%${RESET}`;
                } else {
                    statusIcon = `${RED}${CROSS}${RESET}`;
                    statusText = `${RED}REJECT${RESET} ${GRAY}${agent.confidence}%${RESET}`;
                }
                break;
        }

        const agentHeader = `${scanline}${BRIGHT_CYAN}║${RESET} ${statusIcon} ${agent.color}Agent #${agent.id}${RESET} ${GRAY}[${agent.name}]${RESET}`;
        const padding = 63 - this.stripAnsi(agentHeader).length;

        return `${agentHeader}${' '.repeat(Math.max(0, padding))}${BRIGHT_CYAN}║${RESET}
${scanline}${BRIGHT_CYAN}║${RESET}   ${statusText}${' '.repeat(Math.max(0, 55 - this.stripAnsi(statusText).length))}${BRIGHT_CYAN}║${RESET}
${scanline}${BRIGHT_CYAN}║${RESET}   ${GRAY}${thoughtText}${RESET}${' '.repeat(Math.max(0, 55 - thoughtText.length))}${BRIGHT_CYAN}║${RESET}`;
    }

    // ============================================================
    // Typewriter effect for thoughts
    // ============================================================
    private typewriterEffect(text: string, maxLen: number): string {
        const visibleLen = Math.min(
            text.length,
            Math.floor((this.frameCount * 2) % (text.length + 20))
        );
        const visible = text.substring(0, visibleLen);
        const cursor = this.frameCount % 2 === 0 ? '▌' : ' ';

        if (visible.length >= text.length) {
            return text.substring(0, maxLen);
        }

        return (visible + cursor).substring(0, maxLen);
    }

    // ============================================================
    // Consensus bar visualization
    // ============================================================
    private renderConsensusBar(): string {
        const doneAgents = this.agents.filter(a => a.phase === 'done');
        const approvals = doneAgents.filter(a => a.vote === 'APPROVE').length;
        const total = doneAgents.length;

        if (total === 0) {
            return `${BRIGHT_CYAN}║${RESET}  ${GRAY}Awaiting votes...${RESET}${' '.repeat(42)}${BRIGHT_CYAN}║${RESET}`;
        }

        const percent = Math.round((approvals / this.agentCount) * 100);
        const barWidth = 30;
        const filledWidth = Math.round((approvals / this.agentCount) * barWidth);

        let bar = '';
        for (let i = 0; i < barWidth; i++) {
            if (i < filledWidth) {
                bar += `${BRIGHT_GREEN}${BLOCK_FULL}${RESET}`;
            } else if (i < Math.round((total / this.agentCount) * barWidth)) {
                bar += `${RED}${BLOCK_FULL}${RESET}`;
            } else {
                bar += `${GRAY}${BLOCK_LIGHT}${RESET}`;
            }
        }

        const percentColor = percent >= 60 ? BRIGHT_GREEN : percent >= 40 ? YELLOW : RED;

        return `${BRIGHT_CYAN}║${RESET}  ${GRAY}Consensus:${RESET} ${bar} ${percentColor}${percent}%${RESET}${' '.repeat(10)}${BRIGHT_CYAN}║${RESET}`;
    }

    // ============================================================
    // Footer with CRT effect
    // ============================================================
    private renderFooter(): string {
        const scanline = this.frameCount % 2 === 0 ? DIM : '';
        return `${scanline}${BRIGHT_CYAN}╚═══════════════════════════════════════════════════════════════╝${RESET}`;
    }

    // ============================================================
    // Strip ANSI codes for length calculation
    // ============================================================
    private stripAnsi(str: string): string {
        return str.replace(/\x1b\[[0-9;]*m/g, '');
    }

    // ============================================================
    // Full render
    // ============================================================
    render(): string {
        this.frameCount++;

        const lines = [
            this.renderHeader(),
            `${BRIGHT_CYAN}║${RESET}${' '.repeat(63)}${BRIGHT_CYAN}║${RESET}`,
        ];

        for (const agent of this.agents) {
            lines.push(this.renderAgent(agent));
            lines.push(`${BRIGHT_CYAN}║${RESET}${' '.repeat(63)}${BRIGHT_CYAN}║${RESET}`);
        }

        lines.push(`${BRIGHT_CYAN}╠═══════════════════════════════════════════════════════════════╣${RESET}`);
        lines.push(this.renderConsensusBar());
        lines.push(this.renderFooter());

        return lines.join('\n');
    }

    // ============================================================
    // Update agent state
    // ============================================================
    setAgentPhase(id: number, phase: AgentState['phase'], thought = '') {
        if (this.agents[id]) {
            this.agents[id].phase = phase;
            this.agents[id].thought = thought;
        }
    }

    setAgentVote(id: number, vote: 'APPROVE' | 'REJECT', confidence: number) {
        if (this.agents[id]) {
            this.agents[id].phase = 'done';
            this.agents[id].vote = vote;
            this.agents[id].confidence = confidence;
        }
    }

    // ============================================================
    // Animation loop for demo
    // ============================================================
    async runDemo() {
        process.stdout.write(HIDE_CURSOR);

        const thoughts = [
            'Checking error handling...',
            'Analyzing type safety...',
            'Looking for edge cases...',
            'Validating logic flow...',
        ];

        try {
            // Initial render
            console.log(this.render());

            // Simulate swarm phases
            for (let phase = 0; phase < 4; phase++) {
                // Thinking phase
                for (let i = 0; i < this.agentCount; i++) {
                    this.setAgentPhase(i, 'thinking', thoughts[i]);
                }

                for (let frame = 0; frame < 20; frame++) {
                    process.stdout.write(MOVE_UP(this.agentCount * 4 + 7));
                    console.log(this.render());
                    await this.sleep(100);
                }

                // Correcting phase
                for (let i = 0; i < this.agentCount; i++) {
                    this.setAgentPhase(i, 'correcting', 'Self-correcting assessment...');
                }

                for (let frame = 0; frame < 15; frame++) {
                    process.stdout.write(MOVE_UP(this.agentCount * 4 + 7));
                    console.log(this.render());
                    await this.sleep(100);
                }

                // Voting phase
                for (let i = 0; i < this.agentCount; i++) {
                    this.setAgentPhase(i, 'voting');
                }

                for (let frame = 0; frame < 10; frame++) {
                    process.stdout.write(MOVE_UP(this.agentCount * 4 + 7));
                    console.log(this.render());
                    await this.sleep(100);
                }

                // Results
                const votes: Array<'APPROVE' | 'REJECT'> = ['APPROVE', 'APPROVE', 'APPROVE', 'REJECT'];
                const confidences = [85, 72, 90, 45];

                for (let i = 0; i < this.agentCount; i++) {
                    this.setAgentVote(i, votes[i], confidences[i]);
                    process.stdout.write(MOVE_UP(this.agentCount * 4 + 7));
                    console.log(this.render());
                    await this.sleep(300);
                }

                await this.sleep(2000);
                break;
            }
        } finally {
            process.stdout.write(SHOW_CURSOR);
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run demo if called directly
if (require.main === module) {
    const viz = new SwarmVisualizer(4);
    viz.runDemo().catch(console.error);
}
