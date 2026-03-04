// framework/runtime/src/services/business/engines/budget-engine/services/fund-lifecycle-service.ts

import { ok, fail } from "../../shared/engine-base.js";
import { addMoney, subtractMoney, money } from "../../shared/money.js";
import { calculateAvailableBalance, wouldBreach } from "../domain/health-calculator.js";
import { canAcceptAction, isParentBlocked } from "../domain/hierarchy-validator.js";

import type { ServiceResult, OperationContext } from "../../shared/engine-base.js";
import type { FundActionInput, FundingProfile, FundingTransaction, FPStateSnapshot, AvailableBalance } from "../domain/types.js";
import type { FundingProfileRepo } from "../persistence/funding-profile-repo.js";
import type { FundingTransactionRepo } from "../persistence/funding-transaction-repo.js";

/**
 * Fund Lifecycle Service — manages reserve/commit/consume/release operations.
 * BOUNDARY RULE: Only this service modifies FP amounts directly.
 */
export interface FundLifecycleService {
    /** Reserve funds for a pending transaction */
    reserve(ctx: OperationContext, input: FundActionInput): Promise<ServiceResult<FundingTransaction>>;
    /** Commit previously reserved funds */
    commit(ctx: OperationContext, input: FundActionInput): Promise<ServiceResult<FundingTransaction>>;
    /** Consume (spend) committed funds */
    consume(ctx: OperationContext, input: FundActionInput): Promise<ServiceResult<FundingTransaction>>;
    /** Release uncommitted/unused funds */
    release(ctx: OperationContext, input: FundActionInput): Promise<ServiceResult<FundingTransaction>>;
    /** Get available balance for a FP */
    getAvailableBalance(tenantId: string, fpId: string): Promise<ServiceResult<AvailableBalance>>;
}

export class DefaultFundLifecycleService implements FundLifecycleService {
    constructor(
        private readonly fpRepo: FundingProfileRepo,
        private readonly txnRepo: FundingTransactionRepo,
    ) {}

    async reserve(ctx: OperationContext, input: FundActionInput): Promise<ServiceResult<FundingTransaction>> {
        return this.executeAction(ctx, { ...input, action: "RESERVE" });
    }

    async commit(ctx: OperationContext, input: FundActionInput): Promise<ServiceResult<FundingTransaction>> {
        return this.executeAction(ctx, { ...input, action: "COMMIT" });
    }

    async consume(ctx: OperationContext, input: FundActionInput): Promise<ServiceResult<FundingTransaction>> {
        return this.executeAction(ctx, { ...input, action: "CONSUME" });
    }

    async release(ctx: OperationContext, input: FundActionInput): Promise<ServiceResult<FundingTransaction>> {
        return this.executeAction(ctx, { ...input, action: "RELEASE" });
    }

    async getAvailableBalance(tenantId: string, fpId: string): Promise<ServiceResult<AvailableBalance>> {
        const fp = await this.fpRepo.getById(tenantId, fpId);
        if (!fp) return fail("FP_NOT_FOUND", `Funding profile ${fpId} not found`);

        const balance = calculateAvailableBalance(
            fp.totalLimit,
            fp.reservedAmount,
            fp.committedAmount,
            fp.consumedAmount,
            fp.releasedAmount,
            fp.currencyCode,
        );
        return ok(balance);
    }

    private async executeAction(ctx: OperationContext, input: FundActionInput): Promise<ServiceResult<FundingTransaction>> {
        // Idempotency check
        if (input.idempotencyKey) {
            const exists = await this.txnRepo.existsByIdempotencyKey(input.idempotencyKey);
            if (exists) {
                return fail("IDEMPOTENT_DUPLICATE", "This action has already been processed");
            }
        }

        // Lock FP for update
        const fp = await this.fpRepo.lockForUpdate(ctx.tenantId, input.fpId);
        if (!fp) return fail("FP_NOT_FOUND", `Funding profile ${input.fpId} not found`);

        // Check FP can accept actions
        const actionCheck = canAcceptAction(fp);
        if (!actionCheck.allowed) {
            return fail("FP_ACTION_BLOCKED", actionCheck.reason!);
        }

        // Check parent isn't BLACK
        if (fp.parentId) {
            const ancestors = await this.fpRepo.getAncestors(ctx.tenantId, fp.id);
            for (const ancestor of ancestors) {
                if (isParentBlocked(ancestor)) {
                    return fail("FP_PARENT_BLOCKED", `Parent FP "${ancestor.code}" health is BLACK`);
                }
            }
        }

        // Capture previous state
        const previousState: FPStateSnapshot = {
            reservedAmount: fp.reservedAmount,
            committedAmount: fp.committedAmount,
            consumedAmount: fp.consumedAmount,
            releasedAmount: fp.releasedAmount,
            healthStatus: fp.healthStatus,
            utilizationPct: fp.utilizationPct,
        };

        // Apply the action
        const newState = this.applyAction(fp, input);
        if (!newState.ok) return newState;

        // Check for breach (except RELEASE)
        if (input.action !== "RELEASE") {
            const newBalance = calculateAvailableBalance(
                fp.totalLimit,
                newState.value.reservedAmount,
                newState.value.committedAmount,
                newState.value.consumedAmount,
                newState.value.releasedAmount,
                fp.currencyCode,
            );

            if (wouldBreach(newBalance.available, "0", fp.currencyCode)) {
                return fail("FP_BREACH", `Action would exceed funding limit for "${fp.code}"`);
            }
        }

        // Persist new state
        await this.fpRepo.updateState(ctx.tenantId, fp.id, newState.value);

        // Record transaction
        const txn = await this.txnRepo.create({
            tenantId: ctx.tenantId,
            fpId: input.fpId,
            txnId: input.txnId,
            action: input.action,
            amount: input.amount,
            currencyCode: input.currencyCode,
            previousState,
            resultingState: newState.value,
            reason: input.reason ?? null,
            performedBy: input.performedBy,
            performedAt: new Date(),
            expiresAt: input.expiresAt ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
        });

        return ok(txn);
    }

    private applyAction(fp: FundingProfile, input: FundActionInput): ServiceResult<FPStateSnapshot> {
        const amt = money(input.amount, input.currencyCode);
        const reserved = money(fp.reservedAmount, fp.currencyCode);
        const committed = money(fp.committedAmount, fp.currencyCode);
        const consumed = money(fp.consumedAmount, fp.currencyCode);
        const released = money(fp.releasedAmount, fp.currencyCode);

        const newState: FPStateSnapshot = {
            reservedAmount: fp.reservedAmount,
            committedAmount: fp.committedAmount,
            consumedAmount: fp.consumedAmount,
            releasedAmount: fp.releasedAmount,
            healthStatus: fp.healthStatus,
            utilizationPct: fp.utilizationPct,
        };

        switch (input.action) {
            case "RESERVE":
                newState.reservedAmount = addMoney(reserved, amt).amount;
                break;
            case "COMMIT":
                newState.reservedAmount = subtractMoney(reserved, amt).amount;
                newState.committedAmount = addMoney(committed, amt).amount;
                break;
            case "CONSUME":
                newState.committedAmount = subtractMoney(committed, amt).amount;
                newState.consumedAmount = addMoney(consumed, amt).amount;
                break;
            case "RELEASE":
                newState.releasedAmount = addMoney(released, amt).amount;
                break;
        }

        // Recalculate health
        const balance = calculateAvailableBalance(
            fp.totalLimit,
            newState.reservedAmount,
            newState.committedAmount,
            newState.consumedAmount,
            newState.releasedAmount,
            fp.currencyCode,
        );
        newState.healthStatus = balance.healthStatus;
        newState.utilizationPct = balance.utilizationPct;

        return ok(newState);
    }
}
