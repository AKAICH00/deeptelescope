# Agent Orchestration Analysis: Bottlenecks & Scaling Constraints

**Analysis Date**: 2025-12-05
**Workspace**: ai-collab-plugin
**Scope**: extension.ts, cli-manager.ts, orchestrator.ts, agent implementations

---

## Executive Summary

Current architecture: **Sequential execution with manual agent coordination**
Primary bottleneck: **Synchronous step execution without parallelization**
Scaling limit: **~10 steps before WebSocket timeout (5min approval window)**

### Critical Findings

1. **Sequential Execution Lock** (orchestrator.ts:301-391)
2. **No Parallel Step Execution** - Dependencies checked but not leveraged
3. **Single-threaded CLI Manager** - One process per agent, blocking I/O
4. **Fixed 5-minute Approval Timeout** - Hard limit on complex plans
5. **No Task Queue or Retry Logic** - Failures cascade immediately
6. **Memory Leaks in Long-Running Processes** - No process pooling

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     extension.ts                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ planTask()   │  │ executeTask()│  │ reviewCode() │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                  │          │
│         └─────────────────┼──────────────────┘          │
│                           ▼                             │
│                  ┌────────────────┐                     │
│                  │ CLIManager     │                     │
│                  │ (cli-manager)  │                     │
│                  └────────┬───────┘                     │
└───────────────────────────┼─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   orchestrator.ts                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │ executePlan() - SEQUENTIAL LOOP (line 294-395)    │ │
│  │   for (const step of plan) {                       │ │
│  │     await executeStep(step)  ← BLOCKING            │ │
│  │     await reviewStep(step)   ← BLOCKING            │ │
│  │   }                                                 │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Agent Execution Methods (400-435):                     │
│  ├─ executeCodexStep()                                  │
│  ├─ executeOpusStep()                                   │
│  ├─ executeGeminiStep()                                 │
│  └─ executeAntigravityStep()                            │
│     ▼                                                    │
│  cliManager.sendPrompt() ← ONE AT A TIME               │
└──────────────────────────────────────────────────────────┘
```

---

## Bottleneck Analysis

### 1. Sequential Step Execution (CRITICAL)

**Location**: `orchestrator.ts:301-391`

```typescript
for (const step of this.context.plan) {
    // ❌ Blocks on each step - no parallelization
    await executeStep(step);
    await reviewStep(step);
}
```

**Impact**:
- 10-step plan = 10 × (execution + review) time
- No parallelization despite dependency information available
- Example: 5 independent file writes execute serially (30s each = 150s total vs 30s parallel)

**Scaling Constraint**: O(n) time complexity where n = steps

**Evidence**:
- `step.inputs: number[]` - Dependencies tracked but unused for parallel execution
- No task queue or work scheduler
- Each step waits for previous regardless of independence

---

### 2. CLI Manager Blocking I/O (HIGH)

**Location**: `cli-manager.ts:75-144` (stdin mode), `cli-manager.ts:151-215` (oneshot)

```typescript
// Oneshot mode spawns NEW process per request
private sendOneshotPrompt(prompt: string, config: ModelConfig): Promise<string> {
    const child = spawn(config.command, config.args, { ... });
    // ❌ Waits for process to complete
    return new Promise((resolve, reject) => {
        child.on('close', (code) => resolve(stdout.trim()));
    });
}
```

**Impact**:
- Each agent call spawns/uses process → waits → repeats
- No process pooling or reuse
- `claude` CLI spawns can take 2-5s each for initialization
- Network calls to Anthropic/HuggingFace block execution thread

**Scaling Constraint**: Processes = concurrent_agents (max ~5-10 before system resource exhaustion)

**Evidence**:
- `processes: Map<string, ChildProcess>` - Single process per agent name
- No connection pooling for API clients
- Timeout defaults: 120s (2min) per request - cascades to plan timeout

---

### 3. Fixed Approval Timeout (HIGH)

**Location**: `orchestrator.ts:185-193`

```typescript
setTimeout(() => {
    if (this.approvalResolver) {
        console.log("[Orchestrator] Approval timeout - auto-rejecting");
        this.approvalResolver(false);
        this.pendingApproval = false;
    }
}, 5 * 60 * 1000); // ❌ Hard-coded 5 minutes
```

**Impact**:
- Large plans (>15 steps) likely timeout during execution
- No pause/resume capability
- User must approve within 5min or plan auto-rejects

**Scaling Constraint**: Max plan size ≈ (5min × 60s) / avg_step_time

---

### 4. No Task Queue or Retry Logic (MEDIUM)

**Location**: `orchestrator.ts:310-328` (dependency check), `orchestrator.ts:378-388` (error handling)

```typescript
try {
    const unmetDeps = step.inputs.filter(depId => {
        const depStep = this.context.plan.find(s => s.id === depId);
        return depStep && depStep.status !== 'completed';
    });

    if (unmetDeps.length > 0) {
        step.status = 'skipped'; // ❌ No retry, no queue
        continue;
    }

    // Execute
} catch (error) {
    step.status = 'failed'; // ❌ No retry logic
    // Continue to next step anyway
}
```

**Impact**:
- Transient failures (network timeouts) cause permanent step failures
- No exponential backoff or retry attempts
- Dependent steps skipped if dependencies fail - no recovery path

**Evidence**:
- Zero retry logic in codebase
- No task queue structure - direct for-loop execution
- Error handling continues to next step without attempting recovery

---

### 5. WebSocket State Synchronization Overhead (MEDIUM)

**Location**: `orchestrator.ts:151-162` (broadcastState called after every state change)

```typescript
private broadcastState() {
    this.broadcast({
        type: 'STATE_UPDATE',
        payload: {
            plan: this.context.plan,          // ❌ Entire plan
            planResponse: this.context.planResponse, // ❌ Full response
            logs: this.context.executionLog,  // ❌ All logs
            currentStep: this.context.currentStepId,
            pendingApproval: this.pendingApproval
        }
    });
}

// Called after EVERY step status change (line 308, 320, 370, 390, 394)
this.broadcastState();
```

**Impact**:
- Large plans generate massive WebSocket payloads (entire plan + logs + response)
- Frontend re-renders on every broadcast
- Network congestion with large plan objects (100+ KB per broadcast)

**Scaling Constraint**: O(n²) data transfer where n = steps completed

---

### 6. Reviewer Swarm API Rate Limits (HIGH)

**Location**: `reviewer-swarm.ts:60-80`

```typescript
public async reviewStep(step: PlanStep, output: string): Promise<boolean> {
    // Deploys 6 parallel agents per review
    const agentPromises: Promise<AgentResult>[] = [];
    for (let i = 0; i < this.config.swarmSize; i++) {
        agentPromises.push(this.runAgentWorkflow(i, model, step, tinyContext));
    }
    const results = await Promise.all(agentPromises); // ❌ 6 concurrent API calls
}

// Each agent makes 3 API calls (generate, correct, vote)
// Total: 6 agents × 3 calls = 18 API requests per step review
```

**Impact**:
- HuggingFace rate limits: ~10-20 req/min on free tier
- Single step review = 18 API calls ≈ 54-108s at rate limit
- 10-step plan = 180 API calls ≈ 9-18 minutes minimum

**Scaling Constraint**: Review time = (steps × swarmSize × 3) / rate_limit

**Evidence**:
- `swarmSize: 6` (line 24)
- `Promise.all(agentPromises)` - No request throttling
- No caching of review results

---

### 7. Memory Leaks in Long-Running MCP Server (LOW)

**Location**: `extension.ts:78-137` (MCP server lifecycle)

```typescript
async function startMCPServer(extensionPath: string): Promise<void> {
    mcpServerProcess = spawn('node', [serverScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        // ❌ No memory limits, no restart mechanism
    });

    // Process never restarts on memory pressure
}
```

**Impact**:
- Long-running Node.js process accumulates memory over time
- No health checks or automatic restarts
- Extension reload required to clear memory

---

## Scaling Constraints Summary

| Component | Current Limit | Bottleneck Type | Severity |
|-----------|--------------|-----------------|----------|
| **Step Execution** | O(n) sequential | Algorithm | CRITICAL |
| **CLI Process Spawning** | ~5-10 concurrent | System Resources | HIGH |
| **Approval Timeout** | 5 minutes hard limit | Configuration | HIGH |
| **Swarm Review** | 10-20 steps/hour | API Rate Limits | HIGH |
| **Task Queue** | None (direct loop) | Architecture | MEDIUM |
| **WebSocket Broadcast** | O(n²) data transfer | Network | MEDIUM |
| **Process Memory** | No upper bound | System Resources | LOW |

---

## Recommended Solutions (Priority Order)

### 1. **Implement Parallel Step Execution** (CRITICAL)

**Target**: orchestrator.ts executePlan()

```typescript
// Current (sequential):
for (const step of plan) { await execute(step); }

// Proposed (parallel with dependency resolution):
const executor = new DependencyAwareExecutor(plan);
await executor.executeWithConcurrency({ maxConcurrent: 5 });

// Groups steps by dependency level:
// Level 0: [step1, step2, step3] → execute in parallel
// Level 1: [step4, step5] → wait for Level 0, then parallel
// Level 2: [step6] → wait for Level 1
```

**Expected Improvement**: 60-80% reduction in execution time for typical plans

---

### 2. **Add Process Pooling to CLI Manager** (HIGH)

**Target**: cli-manager.ts

```typescript
class ProcessPool {
    private pool: Map<string, ChildProcess[]>;
    private maxPoolSize = 5;

    async acquire(agentName: string): Promise<ChildProcess> {
        // Reuse existing idle process or spawn new (up to maxPoolSize)
    }

    release(agentName: string, process: ChildProcess): void {
        // Return process to pool for reuse
    }
}
```

**Expected Improvement**: 40-60% reduction in step execution time (eliminate process spawn overhead)

---

### 3. **Implement Task Queue with Retry Logic** (HIGH)

**Target**: New file `task-queue.ts`

```typescript
interface QueuedTask {
    step: PlanStep;
    retryCount: number;
    maxRetries: 3;
}

class TaskQueue {
    async enqueue(step: PlanStep): Promise<void>;
    async dequeue(): Promise<PlanStep | null>;
    async retry(step: PlanStep): Promise<void>; // Exponential backoff
}
```

**Expected Improvement**: 90% reduction in transient failure impact

---

### 4. **Add Request Throttling to Swarm Review** (HIGH)

**Target**: reviewer-swarm.ts

```typescript
import pThrottle from 'p-throttle';

const throttle = pThrottle({ limit: 10, interval: 60000 }); // 10 req/min
const throttledRequest = throttle(async (model, prompt) => {
    return await this.client.chat.completions.create({ ... });
});
```

**Expected Improvement**: Eliminate rate limit errors, predictable review timing

---

### 5. **Incremental WebSocket State Updates** (MEDIUM)

**Target**: orchestrator.ts

```typescript
// Current: Send entire plan on every update
this.broadcast({ payload: { plan: this.context.plan, ... } });

// Proposed: Send only deltas
this.broadcast({
    type: 'STEP_UPDATE',
    payload: { stepId: step.id, status: step.status, output: step.output }
});
```

**Expected Improvement**: 80-90% reduction in WebSocket payload size

---

### 6. **Dynamic Approval Timeout** (MEDIUM)

**Target**: orchestrator.ts requestApproval()

```typescript
const timeout = Math.max(
    5 * 60 * 1000,  // Minimum 5 minutes
    planResponse.steps.length * 30 * 1000  // +30s per step
);
```

**Expected Improvement**: Support plans up to 50+ steps

---

## Performance Projections

### Current Performance
- **10-step plan**: ~15-20 minutes (sequential + swarm review)
- **Concurrent capacity**: 1 plan at a time
- **Max plan size**: ~10 steps (before timeout)

### With Proposed Improvements
- **10-step plan**: ~3-5 minutes (parallel + throttled review)
- **Concurrent capacity**: 3-5 plans simultaneously
- **Max plan size**: 50+ steps (dynamic timeout + parallel execution)

---

## Migration Strategy

1. **Phase 1** (Week 1): Add task queue + parallel execution framework
2. **Phase 2** (Week 2): Implement process pooling in CLI manager
3. **Phase 3** (Week 3): Add request throttling + incremental WebSocket updates
4. **Phase 4** (Week 4): Dynamic timeouts + retry logic + monitoring

---

## Monitoring Metrics

### Key Performance Indicators
1. **Average step execution time** (target: <30s)
2. **Plan completion rate** (target: >90%)
3. **API rate limit errors** (target: 0)
4. **Parallel execution efficiency** (target: >70% CPU utilization)
5. **WebSocket payload size** (target: <50KB per broadcast)

### Alerting Thresholds
- Step execution time >60s
- Plan timeout rate >10%
- Process pool exhaustion events
- Memory usage >500MB (MCP server)

---

## Conclusion

Primary constraint: **Sequential execution architecture prevents scaling beyond 10-15 steps**

Recommended immediate action:
1. Implement parallel step execution (60-80% improvement)
2. Add process pooling (40-60% improvement)
3. Throttle swarm API requests (eliminate rate limit failures)

**Projected ROI**: 5-10x improvement in plan execution speed and capacity
