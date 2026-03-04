// framework/runtime/src/services/business/engines/atlas-ai/services/action-service.ts

import { ok, fail } from "../../shared/engine-base.js";
import { AUTONOMOUS_CONFIDENCE_THRESHOLD, DEFAULT_REVERSAL_WINDOW_MINUTES } from "../domain/types.js";

import type { ServiceResult, OperationContext } from "../../shared/engine-base.js";
import type { AIAction, CreateActionInput } from "../domain/types.js";


/**
 * Action Execution Repository (interface).
 */
export interface AIActionRepo {
    create(input: Omit<AIAction, "id" | "createdAt">): Promise<AIAction>;
    getById(tenantId: string, id: string): Promise<AIAction | null>;
    updateStatus(tenantId: string, id: string, status: AIAction["status"], updates?: Partial<AIAction>): Promise<AIAction>;
    getReversibleActions(tenantId: string, beforeDate: Date): Promise<AIAction[]>;
}

/**
 * AI Action Service — manages autonomous action execution with governance.
 *
 * GOVERNANCE ENFORCEMENT (Section 17.2):
 * - EXPLAINABLE: reasoning_chain mandatory
 * - REVERSIBLE: reversal window configurable
 * - CONFIDENCE >= 0.95: Hard gate for autonomous execution
 * - CONFLICTING SIGNALS: Always escalate to human
 */
export interface ActionService {
    /** Propose an action (does not execute) */
    propose(ctx: OperationContext, input: CreateActionInput): Promise<ServiceResult<AIAction>>;
    /** Execute a proposed action (only if confidence >= 0.95) */
    execute(ctx: OperationContext, actionId: string): Promise<ServiceResult<AIAction>>;
    /** Reverse an executed action within the reversal window */
    reverse(ctx: OperationContext, actionId: string): Promise<ServiceResult<AIAction>>;
    /** Reject a proposed action */
    reject(ctx: OperationContext, actionId: string): Promise<ServiceResult<AIAction>>;
}

export class DefaultActionService implements ActionService {
    constructor(private readonly repo: AIActionRepo) {}

    async propose(ctx: OperationContext, input: CreateActionInput): Promise<ServiceResult<AIAction>> {
        if (!input.reasoningChain || input.reasoningChain.trim().length === 0) {
            return fail("MISSING_REASONING", "Governance: reasoning_chain is mandatory for all AI actions");
        }

        const reversalMinutes = input.reversalWindowMinutes ?? DEFAULT_REVERSAL_WINDOW_MINUTES;
        const reversalWindowExpiresAt = new Date(Date.now() + reversalMinutes * 60 * 1000);

        const action = await this.repo.create({
            tenantId: ctx.tenantId,
            modelId: input.modelId,
            txnId: input.txnId ?? null,
            targetEngine: input.targetEngine,
            actionType: input.actionType,
            actionPayload: input.actionPayload,
            confidence: input.confidence,
            reasoningChain: input.reasoningChain,
            status: "PROPOSED",
            executedAt: null,
            reversalWindowExpiresAt,
            reversedAt: null,
            reversedBy: null,
        });

        return ok(action);
    }

    async execute(ctx: OperationContext, actionId: string): Promise<ServiceResult<AIAction>> {
        const action = await this.repo.getById(ctx.tenantId, actionId);
        if (!action) return fail("ACTION_NOT_FOUND", `Action ${actionId} not found`);

        if (action.status !== "PROPOSED") {
            return fail("INVALID_STATUS", `Action is ${action.status}, must be PROPOSED`);
        }

        // GOVERNANCE GATE: Confidence must be >= 0.95 for autonomous execution
        if (action.confidence < AUTONOMOUS_CONFIDENCE_THRESHOLD) {
            return fail(
                "CONFIDENCE_TOO_LOW",
                `Confidence ${action.confidence} is below autonomous threshold ${AUTONOMOUS_CONFIDENCE_THRESHOLD}. ` +
                `Action must remain as recommendation only.`
            );
        }

        const updated = await this.repo.updateStatus(ctx.tenantId, actionId, "EXECUTED", {
            executedAt: new Date(),
        });

        return ok(updated);
    }

    async reverse(ctx: OperationContext, actionId: string): Promise<ServiceResult<AIAction>> {
        const action = await this.repo.getById(ctx.tenantId, actionId);
        if (!action) return fail("ACTION_NOT_FOUND", `Action ${actionId} not found`);

        if (action.status !== "EXECUTED") {
            return fail("INVALID_STATUS", `Action is ${action.status}, must be EXECUTED to reverse`);
        }

        // Check reversal window
        if (action.reversalWindowExpiresAt && new Date() > action.reversalWindowExpiresAt) {
            return fail("REVERSAL_WINDOW_EXPIRED", "Reversal window has expired for this action");
        }

        const updated = await this.repo.updateStatus(ctx.tenantId, actionId, "REVERSED", {
            reversedAt: new Date(),
            reversedBy: ctx.actorId,
        });

        return ok(updated);
    }

    async reject(ctx: OperationContext, actionId: string): Promise<ServiceResult<AIAction>> {
        const action = await this.repo.getById(ctx.tenantId, actionId);
        if (!action) return fail("ACTION_NOT_FOUND", `Action ${actionId} not found`);

        if (action.status !== "PROPOSED") {
            return fail("INVALID_STATUS", `Action is ${action.status}, must be PROPOSED to reject`);
        }

        const updated = await this.repo.updateStatus(ctx.tenantId, actionId, "REJECTED");
        return ok(updated);
    }
}
