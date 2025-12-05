import * as dotenv from 'dotenv';
import { CLIManager } from './src/cli-manager';
import { ReviewerAgent } from './src/agents/reviewer-swarm';
import { PlanStep } from './src/types';

dotenv.config();

async function testSwarm() {
    console.log("Testing Reviewer Swarm...");

    // Mock dependencies
    const cliManager = new CLIManager(process.cwd());
    const config = { name: 'reviewer', command: 'echo', args: [], interactionMode: 'oneshot' as const };

    const agent = new ReviewerAgent(cliManager, config);

    const mockStep: PlanStep = {
        id: 1,
        description: "Create a simple Python function to calculate factorial",
        action: "write",
        target: "factorial.py",
        assignedAgent: "codex",
        inputs: [],
        outputs: [],
        status: "completed"
    };

    const mockOutput = `
def factorial(n):
    if n == 0:
        return 1
    else:
        return n * factorial(n-1)
`;

    console.log("Sending request to swarm...");
    const result = await agent.reviewStep(mockStep, mockOutput);
    console.log("Swarm Result:", result ? "PASSED" : "FAILED");
}

testSwarm().catch(console.error);
