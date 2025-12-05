# AI Collaboration Plugin - Codebase Analysis

**Generated:** 2025-12-05
**Workspace:** `/Users/ogsolas/.gemini/antigravity/playground/deep-telescope/ai-collab-plugin`

## Executive Summary

This is a multi-agent AI collaboration system built for VS Code that orchestrates code reviews, planning, and execution using multiple AI models (Claude Opus, Gemini, HuggingFace models). The system features:

- **HuggingFace API Integration** via OpenAI-compatible router
- **Self-Correcting Swarm Protocol** for code review (6 agents, 3-phase workflow)
- **Concurrent Agent Management** with rate limiting and token bucket algorithm
- **WebSocket-based orchestration** with real-time state updates
- **MCP Server** for tool integration

---

## 1. HuggingFace API Integration

### Location
- **Primary:** `src/agents/reviewer-swarm.ts:39-56`
- **Test:** `src/test-hf-swarm.ts`
- **MCP Tool:** `src/mcp-tools/review-code.ts`

### Implementation Details

#### API Client Setup
```typescript
// src/agents/reviewer-swarm.ts:44-52
const token = process.env.HF_TOKEN;
this.client = new OpenAI({
    baseURL: "https://router.huggingface.co/v1",
    apiKey: token || "dummy-token",
});
```

**Key Points:**
- Uses HuggingFace Router endpoint (OpenAI-compatible)
- Requires `HF_TOKEN` environment variable
- Falls back to "dummy-token" with warning if missing
- Instantiated in `ReviewerAgent` constructor

#### Supported Models
```typescript
// src/agents/reviewer-swarm.ts:10-13
const SWARM_MODELS = [
    "Qwen/Qwen2.5-Coder-32B-Instruct",    // Generator: Best for code generation
    "meta-llama/Meta-Llama-3-8B-Instruct", // Corrector: Fast, good at following rules
];
```

#### API Call Pattern
```typescript
// Example from reviewer-swarm.ts:112-118
const response = await this.client.chat.completions.create({
    model: model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
    temperature: this.config.generateTemp, // 0.8 for generation
    seed: 1000 + agentId, // Unique seed per agent
});
```

**Parameters:**
- `temperature`: Dynamic (0.8 for generation, 0.1 for correction, 0.0 for voting)
- `max_tokens`: 300 for assessment, 100 for voting
- `seed`: Unique per agent (1000 + agentId) for reproducibility

---

## 2. Swarm Configuration

### Configuration Structure
```typescript
// src/agents/reviewer-swarm.ts:15-27
interface SwarmConfig {
    swarmSize: number;          // Number of parallel agents
    generateTemp: number;       // High temp for diversity
    correctTemp: number;        // Low temp for precision
    consensusThreshold: number; // % needed for approval
}

const DEFAULT_CONFIG: SwarmConfig = {
    swarmSize: 6,              // 6 parallel agents (reduced for API limits)
    generateTemp: 0.8,         // High diversity in generation
    correctTemp: 0.1,          // Precise self-correction
    consensusThreshold: 0.6,   // 60% must approve
};
```

### Swarm Protocol: 3-Phase Self-Correction

#### Phase 1: Generate (High Temperature)
- **Temperature:** 0.8 (high diversity)
- **Purpose:** Initial assessment with diverse perspectives
- **Output:** Initial code review with issues, quality score, notes

```typescript
// reviewer-swarm.ts:96-121
const generatePrompt = `You are Agent #${agentId} reviewing code output.
Task: ${step.description}
Target: ${step.target}
Output to review: ${context}

Give your INITIAL assessment. Be thorough but concise.
Consider: correctness, error handling, type safety, edge cases, code quality.

Format:
ISSUES: [list any problems found, or "None"]
QUALITY: [1-10 score]
NOTES: [any observations]`;
```

#### Phase 2: Correct (Low Temperature)
- **Temperature:** 0.1 (precise correction)
- **Purpose:** Self-critique and refinement
- **Output:** Corrected assessment with justifications

```typescript
// reviewer-swarm.ts:124-148
const correctPrompt = `You are Agent #${agentId}. Review and CORRECT your initial assessment.

Your initial assessment was: ${initialAssessment}

Self-critique checklist:
1. Did I miss any edge cases?
2. Was I too harsh or too lenient?
3. Did I consider the task requirements fully?
4. Are my quality scores justified?

Provide your CORRECTED assessment. Be precise and fair.

Format:
CORRECTIONS: [what you're changing and why, or "None needed"]
FINAL_ISSUES: [updated list of real problems]
FINAL_QUALITY: [1-10 score, justified]`;
```

#### Phase 3: Vote (Zero Temperature)
- **Temperature:** 0.0 (deterministic)
- **Purpose:** Final binary decision
- **Output:** APPROVE/REJECT with confidence and reasoning

```typescript
// reviewer-swarm.ts:153-176
const votePrompt = `You are Agent #${agentId}. Cast your FINAL VOTE.

Your corrected assessment: ${correctedAssessment}
Task requirement: ${step.description}

Based on your analysis, does this code PASS or FAIL the requirements?

You must respond in EXACTLY this format:
VOTE: APPROVE or REJECT
CONFIDENCE: [0-100]%
REASON: [one sentence explanation]`;
```

### Consensus Calculation

**Weighted Voting Algorithm:**
```typescript
// reviewer-swarm.ts:225-265
const approvalWeight = approvals.reduce((sum, r) => sum + r.confidence, 0);
const rejectionWeight = rejections.reduce((sum, r) => sum + r.confidence, 0);
const totalWeight = approvalWeight + rejectionWeight;
const approvalRatio = totalWeight > 0 ? approvalWeight / totalWeight : 0.5;

const approved = approvalRatio >= this.config.consensusThreshold;
```

**Key Features:**
- Confidence-weighted voting (higher confidence = more influence)
- Default threshold: 60% weighted approval
- Displays both simple vote count and weighted score
- Table output for debugging

---

## 3. Concurrent Agent Management

### Parallel Execution Pattern
```typescript
// reviewer-swarm.ts:69-76
const agentPromises: Promise<AgentResult>[] = [];
for (let i = 0; i < this.config.swarmSize; i++) {
    const model = SWARM_MODELS[i % SWARM_MODELS.length];
    agentPromises.push(this.runAgentWorkflow(i, model, step, tinyContext));
}

const results = await Promise.all(agentPromises);
```

**Characteristics:**
- All agents run in parallel (not sequential)
- Model distribution: Round-robin across `SWARM_MODELS`
- No explicit rate limiting at swarm level (handled by token bucket)
- Fail-open strategy: Errors default to APPROVE with low confidence

### Rate Limiting System

#### Token Bucket Implementation
**Location:** `src/rate-limiter.ts`

```typescript
export class TokenBucket {
  private tokens: number;
  private lastRefillTime: number;

  constructor(
    public readonly capacity: number,
    public readonly refillRate: number
  ) {
    this.tokens = capacity;
    this.lastRefillTime = Date.now();
  }

  tryConsume(tokens: number = 1): boolean {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillTime) / 1000;
    const tokensToAdd = elapsedSeconds * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefillTime = now;
  }
}
```

**Algorithm:**
- **Capacity:** Maximum tokens available
- **Refill Rate:** Tokens added per second
- **Auto-refill:** Calculates elapsed time and adds tokens before consumption
- **Thread-safe:** Uses timestamps for refill calculation

**Usage Example:**
```typescript
const limiter = new TokenBucket(10, 2); // 10 capacity, 2 tokens/sec

if (limiter.tryConsume(1)) {
    await makeAPICall();
} else {
    await waitForTokens();
}
```

---

## 4. Agent Orchestration

### Orchestrator Architecture
**Location:** `src/orchestrator.ts`

#### Core Components
```typescript
export class Orchestrator {
    private cliManager: CLIManager;          // Manages agent processes
    private context: SharedContext;          // Shared execution state
    private wss: WebSocketServer;            // Real-time frontend updates
    private pendingApproval: boolean;        // Human-in-the-loop flag
    private approvalResolver: Function;      // Promise resolver for approval
}
```

#### Execution Flow
```
1. Initialize (userRequest) → Enrich context (Gemini)
2. Generate Plan (Opus Planner) → Confidence check
3. [Optional] Request Human Approval → Wait for response
4. Execute Plan → Step-by-step with dependencies
5. Review Code (Swarm) → Weighted consensus
6. Broadcast Results → WebSocket state update
```

#### Step Execution with Dependencies
```typescript
// orchestrator.ts:301-367
for (const step of this.context.plan) {
    // Check dependencies
    const unmetDeps = step.inputs.filter(depId => {
        const depStep = this.context.plan.find(s => s.id === depId);
        return depStep && depStep.status !== 'completed';
    });

    if (unmetDeps.length > 0) {
        step.status = 'skipped';
        continue;
    }

    // Execute based on agent
    let output: string;
    switch (step.assignedAgent) {
        case 'codex': output = await this.executeCodexStep(step); break;
        case 'opus': output = await this.executeOpusStep(step); break;
        case 'gemini': output = await this.executeGeminiStep(step); break;
        case 'antigravity': output = await this.executeAntigravityStep(step); break;
    }

    // Review code changes with swarm
    if (['write', 'edit', 'execute'].includes(step.action)) {
        const passed = await reviewer.reviewStep(step, output);
        if (!passed) {
            step.status = 'failed';
            continue;
        }
    }

    step.status = 'completed';
}
```

#### WebSocket State Management
```typescript
// orchestrator.ts:142-162
private broadcast(message: WSStateUpdate) {
    const data = JSON.stringify(message);
    this.wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

private broadcastState() {
    this.broadcast({
        type: 'STATE_UPDATE',
        payload: {
            plan: this.context.plan,
            logs: this.context.executionLog,
            currentStep: this.context.currentStepId,
            pendingApproval: this.pendingApproval
        }
    });
}
```

---

## 5. Key Integration Points

### MCP Server Tools
**Location:** `src/mcp-server.ts`, `src/mcp-tools/review-code.ts`

```typescript
// MCP Tool wrapper for swarm review
export class ReviewCodeTool {
    private reviewer: ReviewerAgent;

    constructor() {
        this.reviewer = new ReviewerAgent(cliManager, config, {
            swarmSize: 4,
            generateTemp: 0.8,
            correctTemp: 0.1,
            consensusThreshold: 0.6,
        });
    }

    async execute(args: { code: string; task: string; language?: string }) {
        const step = this.createMockStep(args);
        const approved = await this.reviewer.reviewStep(step, args.code);

        return {
            approved,
            verdict: approved ? 'APPROVED' : 'REJECTED',
            swarm_size: 4,
            protocol: 'Generate(T=0.8) → Correct(T=0.1) → Vote(T=0.0)',
        };
    }
}
```

### Agent Registry
**Location:** `src/registry.ts`

```typescript
export const REGISTRY = {
    'codex': {
        name: 'Codex',
        model: 'gpt-4',
        capabilities: ['code-generation', 'debugging']
    },
    'opus': {
        name: 'Claude Opus',
        model: 'claude-opus',
        capabilities: ['planning', 'reasoning']
    },
    'gemini': {
        name: 'Gemini',
        model: 'gemini-pro',
        capabilities: ['context-enrichment', 'analysis']
    },
    'reviewer': {
        name: 'HF Swarm Reviewer',
        model: 'huggingface-multi',
        capabilities: ['code-review', 'consensus']
    }
};
```

---

## 6. Configuration & Environment

### Required Environment Variables
```bash
HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxx  # HuggingFace API token
```

### Swarm Configuration Examples

#### Conservative (High Quality, Slow)
```typescript
const config = {
    swarmSize: 10,
    generateTemp: 0.7,
    correctTemp: 0.05,
    consensusThreshold: 0.7
};
```

#### Balanced (Default)
```typescript
const config = {
    swarmSize: 6,
    generateTemp: 0.8,
    correctTemp: 0.1,
    consensusThreshold: 0.6
};
```

#### Fast (Lower Quality, Fast)
```typescript
const config = {
    swarmSize: 3,
    generateTemp: 0.9,
    correctTemp: 0.15,
    consensusThreshold: 0.5
};
```

---

## 7. Performance Characteristics

### API Call Patterns

**Per Swarm Review:**
- **Total API Calls:** `swarmSize × 3` (Generate, Correct, Vote)
- **Default:** 6 agents × 3 phases = **18 API calls**
- **Parallelism:** All agents run concurrently
- **Estimated Time:** 10-30 seconds (network dependent)

**Token Usage (per agent):**
- Phase 1 (Generate): ~300 tokens
- Phase 2 (Correct): ~300 tokens
- Phase 3 (Vote): ~100 tokens
- **Total per agent:** ~700 tokens
- **Total per review:** ~4,200 tokens (6 agents)

### Error Handling Strategy

**Fail-Open Philosophy:**
```typescript
// reviewer-swarm.ts:189-201
catch (error: any) {
    console.error(`[Agent #${agentId}] Error: ${error.message}`);
    return {
        agentId,
        model: shortModel,
        initialAssessment: "Error during assessment",
        correctedAssessment: "Error during correction",
        finalVote: "APPROVE",  // Fail open
        confidence: 30,        // Low confidence
        reasoning: `API error: ${error.message.substring(0, 50)}`,
    };
}
```

**Rationale:**
- API failures shouldn't block deployment
- Low confidence (30%) reduces impact on consensus
- Errors logged for debugging
- System remains operational

---

## 8. Testing & Validation

### Test Files
- `src/test-hf-swarm.ts` - HuggingFace API connectivity test
- `src/test-swarm-review.ts` - Full swarm review integration test
- `src/test-rate-limiter-review.ts` - Rate limiting with swarm
- `src/rate-limiter.test.ts` - Token bucket unit tests

### Example Test
```typescript
// test-hf-swarm.ts
async function testSwarm() {
    const token = process.env.HF_TOKEN;
    const client = new OpenAI({
        baseURL: "https://router.huggingface.co/v1",
        apiKey: token,
    });

    for (const model of SWARM_MODELS) {
        const completion = await client.chat.completions.create({
            model: model,
            messages: [{ role: "user", content: "Say 'Hello from the swarm!'" }],
            max_tokens: 30,
        });
        console.log('Response:', completion.choices[0]?.message?.content);
    }
}
```

---

## 9. Architecture Diagrams

### Swarm Review Flow
```
User Request
    ↓
Orchestrator.initialize()
    ↓
Gemini.enrichContext()
    ↓
OpusPlanner.generatePlan()
    ↓
[Confidence Check] → [Low] → Request Approval → [Rejected] → Exit
    ↓ [High]                                    ↓ [Approved]
Orchestrator.executePlan()                      ↓
    ↓                                           ↓
Execute Step → Check Dependencies → Skip if unmet
    ↓
Execute Agent (Codex/Opus/Gemini)
    ↓
[Code Change?] → [Yes] → ReviewerAgent.reviewStep()
    ↓                         ↓
    |                    Deploy Swarm (6 agents)
    |                         ↓
    |                    ┌────────────────┐
    |                    │ Agent #0-5     │
    |                    │ (Parallel)     │
    |                    └────────────────┘
    |                         ↓
    |                    Phase 1: Generate (T=0.8)
    |                         ↓
    |                    Phase 2: Correct (T=0.1)
    |                         ↓
    |                    Phase 3: Vote (T=0.0)
    |                         ↓
    |                    Calculate Weighted Consensus
    |                         ↓
    |                    [>60%?] → [Yes] → APPROVE
    |                         ↓ [No]
    ↓                         REJECT
[Approved] → step.status = 'completed'
    ↓
Broadcast State Update (WebSocket)
```

### Concurrent Agent Execution
```
ReviewerAgent.reviewStep()
    ↓
Create agent promises
    ↓
┌─────────────────────────────────────────┐
│  Promise.all([                          │
│    agent0.workflow(),                   │
│    agent1.workflow(),                   │
│    agent2.workflow(),                   │
│    agent3.workflow(),                   │
│    agent4.workflow(),                   │
│    agent5.workflow()                    │
│  ])                                     │
└─────────────────────────────────────────┘
    ↓
Wait for all agents
    ↓
Aggregate results
    ↓
Calculate consensus
    ↓
Return boolean (approved/rejected)
```

---

## 10. Recommendations

### Immediate Improvements
1. **Add retry logic** for transient API failures
2. **Implement exponential backoff** for rate limits
3. **Add request queuing** for high concurrency scenarios
4. **Cache model responses** for repeated code blocks
5. **Add timeout handling** per agent (prevent hung requests)

### Rate Limiting Enhancements
```typescript
// Suggested integration
class ReviewerAgent {
    private rateLimiter: TokenBucket;

    constructor() {
        // HuggingFace Router: ~1000 requests/min
        this.rateLimiter = new TokenBucket(1000, 16.67); // 1000/60
    }

    async runAgentWorkflow() {
        if (!this.rateLimiter.tryConsume(3)) { // 3 API calls per agent
            await this.waitForTokens();
        }
        // ... proceed with workflow
    }
}
```

### Monitoring & Observability
```typescript
interface SwarmMetrics {
    totalReviews: number;
    averageConsensusTime: number;
    apiCallsPerReview: number;
    errorRate: number;
    consensusDistribution: Record<number, number>; // 0-100% buckets
}
```

### Cost Optimization
1. **Reduce swarm size** for low-risk changes (3 agents instead of 6)
2. **Skip swarm** for trivial changes (< 10 lines)
3. **Use quick review** for non-critical paths
4. **Implement caching** for identical code blocks
5. **Batch similar reviews** to share context

---

## 11. Conclusion

This codebase implements a sophisticated multi-agent system with:

✅ **Well-structured HuggingFace integration** via OpenAI-compatible router
✅ **Novel self-correcting swarm protocol** with 3-phase refinement
✅ **Robust concurrent execution** using Promise.all
✅ **Token bucket rate limiting** for API call management
✅ **WebSocket orchestration** with real-time state updates
✅ **Fail-open error handling** for resilience
✅ **Weighted consensus voting** for nuanced decisions

**Strengths:**
- Clean separation of concerns (agents, orchestrator, tools)
- Flexible configuration system
- Comprehensive error handling
- Real-time state broadcasting

**Areas for Enhancement:**
- Rate limiting integration with HuggingFace API
- Retry logic and exponential backoff
- Response caching for efficiency
- Monitoring and metrics collection
- Cost optimization strategies

---

**Document Version:** 1.0
**Last Updated:** 2025-12-05
**Maintainer:** AI Collaboration Plugin Team
