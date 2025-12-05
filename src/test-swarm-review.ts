import { CLIManager } from './cli-manager';
import { ReviewerAgent } from './agents/reviewer-swarm';
import { REGISTRY } from './registry';
import * as fs from 'fs-extra';
import * as dotenv from 'dotenv';

dotenv.config();

async function testSwarmReview() {
    console.log('═'.repeat(70));
    console.log('🐝 Self-Correcting OSS Agent Swarm - Code Review Test');
    console.log('═'.repeat(70));

    // Read the calculator code we generated
    const calculatorCode = await fs.readFile('./src/calculator.ts', 'utf-8');

    const cliManager = new CLIManager(process.cwd());

    // Use enhanced swarm with custom config
    const reviewer = new ReviewerAgent(cliManager, REGISTRY['reviewer'], {
        swarmSize: 4,           // 4 agents for faster testing
        generateTemp: 0.8,      // High diversity
        correctTemp: 0.1,       // Precise correction
        consensusThreshold: 0.6 // 60% approval needed
    });

    // Create a mock step
    const step = {
        id: 1,
        action: 'execute' as const,
        target: 'src/calculator.ts',
        description: 'Create calculator module with add, subtract, multiply, divide functions with type safety and error handling for division by zero',
        assignedAgent: 'codex' as const,
        status: 'completed' as const,
        inputs: [],
        outputs: []
    };

    console.log('\n📝 Code being reviewed (first 400 chars):');
    console.log('─'.repeat(70));
    console.log(calculatorCode.slice(0, 400) + '...');
    console.log('─'.repeat(70));

    console.log('\n🚀 Starting Self-Correcting Swarm Protocol...');
    console.log('   Phase 1: Generate (T=0.8) - Diverse initial assessments');
    console.log('   Phase 2: Correct (T=0.1) - Self-critique and fix errors');
    console.log('   Phase 3: Vote (T=0.0) - Deterministic final decision\n');

    const startTime = Date.now();
    const approved = await reviewer.reviewStep(step, calculatorCode);
    const elapsed = Date.now() - startTime;

    console.log('\n' + '═'.repeat(70));
    console.log(`⏱️  Total review time: ${(elapsed / 1000).toFixed(1)}s`);
    console.log(approved
        ? '✅ FINAL VERDICT: CODE APPROVED'
        : '❌ FINAL VERDICT: CODE REJECTED');
    console.log('═'.repeat(70));
}

testSwarmReview().catch(console.error);
