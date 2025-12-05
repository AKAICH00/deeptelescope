// ============================================================
// AI Collaboration Plugin - Type Definitions
// ============================================================

// ------------------------------------------------------------
// Plan Step (Enhanced)
// ------------------------------------------------------------
export interface PlanStep {
    id: number;
    action: 'read' | 'write' | 'edit' | 'analyze' | 'delegate' | 'validate' | 'execute';
    target: string;                    // File path or description
    description: string;
    assignedAgent: 'codex' | 'opus' | 'gemini' | 'antigravity';
    status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
    inputs: number[];                  // Step IDs this depends on
    outputs: string[];                 // What this step produces
    output?: string;                   // Actual output after execution
    error?: string;                    // Error message if failed
}

// ------------------------------------------------------------
// Risk Assessment
// ------------------------------------------------------------
export interface Risk {
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: 'breaking-change' | 'security' | 'performance' | 'compatibility' | 'data-loss' | 'other';
    description: string;
    mitigation: string;
    affectedSteps: number[];           // Which steps are affected
}

// ------------------------------------------------------------
// Plan Analysis (Chain of Thought)
// ------------------------------------------------------------
export interface PlanAnalysis {
    understanding: string;             // Restated task in own words
    constraints: string[];             // Identified limitations
    approaches: {
        approach: string;
        pros: string[];
        cons: string[];
        rejected?: boolean;
        rejectionReason?: string;
    }[];
    chosenApproach: string;
    rationale: string;
}

// ------------------------------------------------------------
// Confidence Breakdown
// ------------------------------------------------------------
export interface ConfidenceBreakdown {
    taskClarity: number;               // 0-1: How clear is the request?
    contextSufficiency: number;        // 0-1: Do we have enough info?
    approachConfidence: number;        // 0-1: How sure are we about the approach?
    executionFeasibility: number;      // 0-1: Can agents actually do this?
    overall: number;                   // 0-1: Weighted average
}

// ------------------------------------------------------------
// Full Plan Response from Opus
// ------------------------------------------------------------
export interface PlanResponse {
    planId: string;                    // UUID for tracking
    analysis: PlanAnalysis;            // Chain of thought
    steps: PlanStep[];                 // The actual plan
    dependencies: string[];            // Files/modules this plan touches
    risks: Risk[];                     // Identified risks
    confidence: ConfidenceBreakdown;   // Confidence scores
    estimatedTokens: number;           // Rough estimate for execution
    requiresApproval: boolean;         // Should we ask user before executing?
}

// ------------------------------------------------------------
// File Tree Node (for context)
// ------------------------------------------------------------
export interface FileTreeNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;                     // File size in bytes
    annotation?: string;               // AI-generated description
    children?: FileTreeNode[];
}

// ------------------------------------------------------------
// Tiered Context System
// ------------------------------------------------------------

// ------------------------------------------------------------
// Shared Context (Enhanced)
// ------------------------------------------------------------
export interface SharedContext {
    userRequest: string;
    plan: PlanStep[];
    planResponse?: PlanResponse;       // Full response from Opus
    currentStepId: number;
    workspaceFiles: Map<string, string>;
    executionLog: string[];
}

// ------------------------------------------------------------
// Agent Adapter Interface
// ------------------------------------------------------------
export interface AgentAdapter {
    name: string;
    role: 'planner' | 'coder' | 'reviewer' | 'context-enricher';
    execute(context: SharedContext): Promise<string>;
}

// ------------------------------------------------------------
// Execution Result
// ------------------------------------------------------------
export interface ExecutionResult {
    success: boolean;
    stepId: number;
    output?: string;
    error?: string;
    duration: number;                  // ms
    tokensUsed?: number;
}

// ------------------------------------------------------------
// Plan Execution Summary
// ------------------------------------------------------------
export interface ExecutionSummary {
    planId: string;
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;
    totalDuration: number;
    results: ExecutionResult[];
}
