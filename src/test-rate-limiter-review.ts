import { CLIManager } from './cli-manager';
import { ReviewerAgent } from './agents/reviewer-swarm';
import { REGISTRY } from './registry';
import * as fs from 'fs-extra';
import * as dotenv from 'dotenv';

dotenv.config();

async function testRateLimiterReview() {
    console.log('═'.repeat(70));
    console.log('🐝 Self-Correcting Swarm - Rate Limiter Review');
    console.log('═'.repeat(70));

    // Read the rate limiter code we just generated
    const rateLimiterCode = await fs.readFile('./src/rate-limiter.ts', 'utf-8');

    const cliManager = new CLIManager(process.cwd());

    // Use swarm with 6 agents for more diverse opinions
    const reviewer = new ReviewerAgent(cliManager, REGISTRY['reviewer'], {
        swarmSize: 6,           // More agents for thorough review
        generateTemp: 0.8,      // High diversity
        correctTemp: 0.1,       // Precise correction
        consensusThreshold: 0.6 // 60% approval needed
    });

    // Create a mock step matching what the CLI generated
    const step = {
        id: 1,
        action: 'execute' as const,
        target: 'src/rate-limiter.ts',
        description: 'Create a rate limiter module with token bucket algorithm. Should have: 1) TokenBucket class with capacity, refillRate, and tokens properties, 2) tryConsume(tokens) method that returns true/false, 3) automatic refill based on elapsed time, 4) proper handling for edge cases like negative tokens or exceeding capacity',
        assignedAgent: 'codex' as const,
        status: 'completed' as const,
        inputs: [],
        outputs: []
    };

    console.log('\n📝 Code being reviewed:');
    console.log('─'.repeat(70));
    console.log(rateLimiterCode);
    console.log('─'.repeat(70));

    console.log('\n🚀 Starting Self-Correcting Swarm Protocol...');
    console.log('   Phase 1: Generate (T=0.8) - Diverse initial assessments');
    console.log('   Phase 2: Correct (T=0.1) - Self-critique and fix errors');
    console.log('   Phase 3: Vote (T=0.0) - Deterministic final decision\n');

    const startTime = Date.now();
    const approved = await reviewer.reviewStep(step, rateLimiterCode);
    const elapsed = Date.now() - startTime;

    console.log('\n' + '═'.repeat(70));
    console.log(`⏱️  Total review time: ${(elapsed / 1000).toFixed(1)}s`);
    console.log(approved
        ? '✅ FINAL VERDICT: CODE APPROVED'
        : '❌ FINAL VERDICT: CODE REJECTED - Needs improvement');
    console.log('═'.repeat(70));
}

testRateLimiterReview().catch(console.error);
