/**
 * Orchestration Engine Service
 *
 * Step-based orchestration with parallel/sequential execution and
 * compensation on failure (saga pattern).
 */

import type {
    CompensationAction,
    OrchestrationPlan,
    OrchestrationResult,
    OrchestrationStep,
    StepResult,
    StepStatus,
} from "./types.js";
import type { Logger } from "../../../../kernel/logger.js";
import type { JobQueue } from "@athyper/core";

// ============================================================================
// Service
// ============================================================================

export class OrchestrationEngine {
    constructor(
        private readonly jobQueue: JobQueue,
        private readonly logger: Logger,
    ) {}

    /**
     * Execute a full orchestration plan.
     */
    async executePlan(
        plan: OrchestrationPlan,
        input: Record<string, unknown> = {},
    ): Promise<OrchestrationResult> {
        const startedAt = new Date();
        const stepResults: StepResult[] = [];
        const context: ExecutionContext = {
            input,
            stepOutputs: new Map(),
            aborted: false,
        };

        this.logger.info({
            msg: "orchestration_started",
            planId: plan.id,
            planName: plan.name,
            stepCount: plan.steps.length,
            tenantId: plan.tenantId,
        });

        // Build dependency graph
        const stepMap = new Map(plan.steps.map((s) => [s.id, s]));
        const completedSteps = new Set<string>();

        // Execute steps respecting dependencies
        const pendingSteps = [...plan.steps];
        let progress = true;

        while (pendingSteps.length > 0 && progress && !context.aborted) {
            progress = false;

            // Find steps whose dependencies are satisfied
            const readySteps = pendingSteps.filter((step) =>
                (step.dependsOn ?? []).every((dep) => completedSteps.has(dep)),
            );

            if (readySteps.length === 0 && pendingSteps.length > 0) {
                // Deadlock: remaining steps have unsatisfied dependencies
                this.logger.error({
                    msg: "orchestration_deadlock",
                    planId: plan.id,
                    remainingSteps: pendingSteps.map((s) => s.id),
                });
                break;
            }

            for (const step of readySteps) {
                if (context.aborted) break;

                const result = await this.executeStep(step, context, plan.tenantId);
                stepResults.push(result);

                // Remove from pending
                const idx = pendingSteps.indexOf(step);
                if (idx >= 0) pendingSteps.splice(idx, 1);
                progress = true;

                if (result.status === "completed" || result.status === "skipped") {
                    completedSteps.add(step.id);
                    if (result.output !== undefined) {
                        context.stepOutputs.set(step.id, result.output);
                    }
                } else if (result.status === "failed" && step.required) {
                    context.aborted = true;
                    this.logger.warn({
                        msg: "orchestration_step_failed_aborting",
                        planId: plan.id,
                        stepId: step.id,
                        error: result.error,
                    });
                }
            }
        }

        // Mark remaining steps as skipped
        for (const step of pendingSteps) {
            stepResults.push({
                stepId: step.id,
                stepName: step.name,
                status: "skipped",
                startedAt: new Date(),
                durationMs: 0,
            });
        }

        // Compensate on failure
        let compensationApplied = false;
        if (context.aborted) {
            compensationApplied = await this.compensate(plan, stepResults, context);
        }

        const completedAt = new Date();
        const failedCount = stepResults.filter((r) => r.status === "failed").length;
        const completedCount = stepResults.filter((r) => r.status === "completed").length;
        const skippedCount = stepResults.filter((r) => r.status === "skipped").length;

        const result: OrchestrationResult = {
            planId: plan.id,
            planName: plan.name,
            success: failedCount === 0,
            status: failedCount === 0
                ? "completed"
                : completedCount > 0
                    ? "partially_completed"
                    : "failed",
            stepResults,
            totalSteps: plan.steps.length,
            completedSteps: completedCount,
            failedSteps: failedCount,
            skippedSteps: skippedCount,
            startedAt,
            completedAt,
            totalDurationMs: completedAt.getTime() - startedAt.getTime(),
            compensationApplied,
        };

        this.logger.info({
            msg: "orchestration_completed",
            planId: plan.id,
            success: result.success,
            status: result.status,
            totalDurationMs: result.totalDurationMs,
            completedSteps: completedCount,
            failedSteps: failedCount,
        });

        return result;
    }

    // --------------------------------------------------------------------------
    // Step execution
    // --------------------------------------------------------------------------

    private async executeStep(
        step: OrchestrationStep,
        context: ExecutionContext,
        tenantId: string,
    ): Promise<StepResult> {
        const startedAt = new Date();

        this.logger.debug({
            msg: "step_executing",
            stepId: step.id,
            stepType: step.type,
        });

        try {
            let output: unknown;
            let status: StepStatus = "completed";

            switch (step.type) {
                case "action":
                    output = await this.executeAction(step, context, tenantId);
                    break;

                case "condition":
                    output = this.evaluateCondition(step, context);
                    break;

                case "parallel":
                    output = await this.executeParallel(step, context, tenantId);
                    break;

                case "delay":
                    await this.executeDelay(step);
                    break;

                case "approval":
                    // Approval steps enqueue a job and return pending
                    output = await this.enqueueApproval(step, context, tenantId);
                    break;

                default:
                    status = "skipped";
            }

            const completedAt = new Date();

            return {
                stepId: step.id,
                stepName: step.name,
                status,
                startedAt,
                completedAt,
                durationMs: completedAt.getTime() - startedAt.getTime(),
                output,
            };
        } catch (err) {
            const completedAt = new Date();
            return {
                stepId: step.id,
                stepName: step.name,
                status: "failed",
                startedAt,
                completedAt,
                durationMs: completedAt.getTime() - startedAt.getTime(),
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    private async executeAction(
        step: OrchestrationStep,
        context: ExecutionContext,
        tenantId: string,
    ): Promise<unknown> {
        if (!step.action) throw new Error(`Step ${step.id}: action config missing`);

        const payload = this.interpolatePayload(step.action.payload, context);

        // Enqueue as a job
        const job = await this.jobQueue.add(
            {
                type: step.action.jobType,
                payload,
                metadata: {
                    orchestrationStepId: step.id,
                    tenantId,
                },
            },
            {
                timeout: step.action.timeoutMs,
                attempts: 1, // Orchestration handles retries at step level
            },
        );

        return { jobId: job.id, enqueued: true };
    }

    private evaluateCondition(
        step: OrchestrationStep,
        context: ExecutionContext,
    ): { result: boolean; branch: "then" | "else" } {
        if (!step.condition) throw new Error(`Step ${step.id}: condition config missing`);

        const result = this.evaluateExpression(step.condition.expression, context);

        return {
            result,
            branch: result ? "then" : "else",
        };
    }

    private async executeParallel(
        step: OrchestrationStep,
        context: ExecutionContext,
        tenantId: string,
    ): Promise<StepResult[]> {
        if (!step.parallel) throw new Error(`Step ${step.id}: parallel config missing`);

        const results: StepResult[] = [];

        // Execute all steps in parallel
        const promises = step.parallel.stepIds.map(async (stepId) => {
            // For parallel, we create synthetic sub-steps from the payload
            const subStep: OrchestrationStep = {
                id: `${step.id}__parallel__${stepId}`,
                name: `${step.name} (parallel: ${stepId})`,
                type: "action",
                action: {
                    jobType: stepId,
                    payload: {},
                },
                required: step.parallel?.failStrategy === "fail_fast",
            };

            return this.executeStep(subStep, context, tenantId);
        });

        if (step.parallel.failStrategy === "fail_fast") {
            // Race: abort on first failure
            const settled = await Promise.allSettled(promises);
            for (const s of settled) {
                if (s.status === "fulfilled") {
                    results.push(s.value);
                }
            }
        } else {
            // Wait for all
            const settled = await Promise.allSettled(promises);
            for (const s of settled) {
                if (s.status === "fulfilled") {
                    results.push(s.value);
                }
            }
        }

        return results;
    }

    private async executeDelay(step: OrchestrationStep): Promise<void> {
        if (!step.delay) throw new Error(`Step ${step.id}: delay config missing`);
        await new Promise<void>((resolve) => setTimeout(resolve, step.delay!.durationMs));
    }

    private async enqueueApproval(
        step: OrchestrationStep,
        context: ExecutionContext,
        tenantId: string,
    ): Promise<unknown> {
        const payload = step.action
            ? this.interpolatePayload(step.action.payload, context)
            : {};

        const job = await this.jobQueue.add(
            {
                type: "orchestration-approval",
                payload: {
                    ...payload,
                    stepId: step.id,
                    stepName: step.name,
                    tenantId,
                },
            },
            { priority: "high" },
        );

        return { jobId: job.id, awaitingApproval: true };
    }

    // --------------------------------------------------------------------------
    // Compensation (saga rollback)
    // --------------------------------------------------------------------------

    private async compensate(
        plan: OrchestrationPlan,
        stepResults: StepResult[],
        _context: ExecutionContext,
    ): Promise<boolean> {
        const completedStepIds = new Set(
            stepResults.filter((r) => r.status === "completed").map((r) => r.stepId),
        );

        const compensations: CompensationAction[] = [];

        // Compensate in reverse order
        for (const step of [...plan.steps].reverse()) {
            if (!completedStepIds.has(step.id) || !step.compensation) continue;

            const action: CompensationAction = {
                stepId: step.id,
                jobType: step.compensation.jobType,
                payload: step.compensation.payload,
            };

            try {
                await this.jobQueue.add(
                    {
                        type: step.compensation.jobType,
                        payload: step.compensation.payload,
                        metadata: {
                            compensationFor: step.id,
                            planId: plan.id,
                        },
                    },
                    { priority: "high" },
                );

                action.executedAt = new Date();
                action.success = true;

                this.logger.info({
                    msg: "compensation_enqueued",
                    planId: plan.id,
                    stepId: step.id,
                    jobType: step.compensation.jobType,
                });
            } catch (err) {
                action.executedAt = new Date();
                action.success = false;
                action.error = err instanceof Error ? err.message : String(err);

                this.logger.error({
                    msg: "compensation_failed",
                    planId: plan.id,
                    stepId: step.id,
                    error: action.error,
                });
            }

            compensations.push(action);

            // Update step result to show compensation
            const stepResult = stepResults.find((r) => r.stepId === step.id);
            if (stepResult) {
                stepResult.compensated = true;
            }
        }

        return compensations.length > 0;
    }

    // --------------------------------------------------------------------------
    // Expression evaluation & interpolation
    // --------------------------------------------------------------------------

    private evaluateExpression(expression: string, context: ExecutionContext): boolean {
        // Simple expression evaluation: "field.path == value"
        const match = expression.match(/^(.+?)\s*(==|!=|>|<|>=|<=)\s*(.+)$/);
        if (!match) return false;

        const [, fieldPath, operator, rawValue] = match;
        const actualValue = this.resolveContextValue(fieldPath.trim(), context);
        const expectedValue = this.parseValue(rawValue.trim());

        switch (operator) {
            case "==": return actualValue === expectedValue;
            case "!=": return actualValue !== expectedValue;
            case ">": return Number(actualValue) > Number(expectedValue);
            case "<": return Number(actualValue) < Number(expectedValue);
            case ">=": return Number(actualValue) >= Number(expectedValue);
            case "<=": return Number(actualValue) <= Number(expectedValue);
            default: return false;
        }
    }

    private interpolatePayload(
        template: Record<string, unknown>,
        context: ExecutionContext,
    ): Record<string, unknown> {
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(template)) {
            if (typeof value === "string" && value.startsWith("{{") && value.endsWith("}}")) {
                const path = value.slice(2, -2).trim();
                result[key] = this.resolveContextValue(path, context);
            } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                result[key] = this.interpolatePayload(value as Record<string, unknown>, context);
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    private resolveContextValue(path: string, context: ExecutionContext): unknown {
        // Support: input.field, steps.stepId.field
        const parts = path.split(".");

        if (parts[0] === "input") {
            return getNestedValue(context.input, parts.slice(1).join("."));
        }

        if (parts[0] === "steps" && parts.length >= 2) {
            const stepOutput = context.stepOutputs.get(parts[1]);
            if (stepOutput === undefined) return undefined;
            if (parts.length === 2) return stepOutput;
            return getNestedValue(stepOutput as Record<string, unknown>, parts.slice(2).join("."));
        }

        return getNestedValue(context.input, path);
    }

    private parseValue(raw: string): unknown {
        if (raw === "true") return true;
        if (raw === "false") return false;
        if (raw === "null") return null;
        if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
        // Remove surrounding quotes
        if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
            return raw.slice(1, -1);
        }
        return raw;
    }
}

// ============================================================================
// Internal types
// ============================================================================

interface ExecutionContext {
    input: Record<string, unknown>;
    stepOutputs: Map<string, unknown>;
    aborted: boolean;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;
    for (const part of parts) {
        if (current == null || typeof current !== "object") return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}
