/**
 * Automation Orchestration Types
 *
 * Saga-like orchestration: define plan (steps[]) → execute
 * sequentially/parallel → compensate on failure.
 */

// ============================================================================
// Step Types
// ============================================================================

export type StepType =
    | "action"        // Execute a single action (job, API call, etc.)
    | "condition"     // Evaluate condition, branch
    | "parallel"      // Fan-out: execute multiple steps in parallel
    | "delay"         // Wait for a duration
    | "approval"      // Wait for human approval

export type StepStatus =
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "skipped"
    | "compensated"

// ============================================================================
// Orchestration Step
// ============================================================================

export interface OrchestrationStep {
    /** Unique step ID within the plan */
    id: string;
    /** Human-readable name */
    name: string;
    /** Step type */
    type: StepType;
    /** Action config (for type=action) */
    action?: {
        /** Job type to enqueue or handler to call */
        jobType: string;
        /** Input payload template (supports {{variable}} interpolation) */
        payload: Record<string, unknown>;
        /** Timeout in ms */
        timeoutMs?: number;
    };
    /** Condition config (for type=condition) */
    condition?: {
        /** Expression to evaluate (simplified: field.path == value) */
        expression: string;
        /** Steps to execute if condition is true */
        thenSteps: string[];
        /** Steps to execute if condition is false */
        elseSteps?: string[];
    };
    /** Parallel config (for type=parallel) */
    parallel?: {
        /** Step IDs to execute concurrently */
        stepIds: string[];
        /** Fail strategy: "fail_fast" aborts on first error, "wait_all" waits for all */
        failStrategy: "fail_fast" | "wait_all";
    };
    /** Delay config (for type=delay) */
    delay?: {
        /** Duration in ms */
        durationMs: number;
    };
    /** Compensation action (rollback on failure) */
    compensation?: {
        jobType: string;
        payload: Record<string, unknown>;
    };
    /** Dependencies: step IDs that must complete before this step */
    dependsOn?: string[];
    /** Whether this step is required (failure stops the plan) */
    required: boolean;
}

// ============================================================================
// Orchestration Plan
// ============================================================================

export interface OrchestrationPlan {
    /** Plan ID */
    id: string;
    /** Plan name */
    name: string;
    /** Steps in execution order */
    steps: OrchestrationStep[];
    /** Input schema description */
    inputSchema?: Record<string, string>;
    /** Maximum total execution time (ms) */
    maxExecutionMs?: number;
    /** Tenant ID */
    tenantId: string;
}

// ============================================================================
// Step Result
// ============================================================================

export interface StepResult {
    stepId: string;
    stepName: string;
    status: StepStatus;
    startedAt: Date;
    completedAt?: Date;
    durationMs: number;
    output?: unknown;
    error?: string;
    compensated?: boolean;
}

// ============================================================================
// Execution Result
// ============================================================================

export interface OrchestrationResult {
    planId: string;
    planName: string;
    success: boolean;
    status: "completed" | "failed" | "partially_completed";
    stepResults: StepResult[];
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;
    startedAt: Date;
    completedAt: Date;
    totalDurationMs: number;
    compensationApplied: boolean;
}

// ============================================================================
// Compensation Action
// ============================================================================

export interface CompensationAction {
    stepId: string;
    jobType: string;
    payload: Record<string, unknown>;
    executedAt?: Date;
    success?: boolean;
    error?: string;
}
