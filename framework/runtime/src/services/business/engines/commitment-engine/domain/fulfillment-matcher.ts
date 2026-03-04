// framework/runtime/src/services/business/engines/commitment-engine/domain/fulfillment-matcher.ts
// MC-4 compliance: all monetary arithmetic uses Money lib (no parseFloat)

import { sumAmounts } from "../../shared/money.js";

import type { CommitmentSchedule, CommitmentFulfillment } from "./types.js";

/**
 * Match a fulfillment to the best schedule entry.
 * Priority: explicit schedule_id > earliest TRIGGERED > earliest PENDING
 */
export function matchFulfillmentToSchedule(
    schedules: CommitmentSchedule[],
    fulfillment: { scheduleId?: string; amount: string; fulfillmentType: string },
): CommitmentSchedule | null {
    // If explicit schedule_id provided, use it
    if (fulfillment.scheduleId) {
        return schedules.find((s) => s.id === fulfillment.scheduleId) ?? null;
    }

    // First, try to match to a TRIGGERED schedule (already due)
    const triggered = schedules
        .filter((s) => s.status === "TRIGGERED")
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    if (triggered.length > 0) {
        return triggered[0]!;
    }

    // Next, try a PENDING schedule
    const pending = schedules
        .filter((s) => s.status === "PENDING")
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    if (pending.length > 0) {
        return pending[0]!;
    }

    return null;
}

/**
 * Calculate total fulfilled amount from fulfillment records.
 * MC-4: uses sumAmounts instead of parseFloat accumulation.
 */
export function calculateFulfilledAmount(fulfillments: CommitmentFulfillment[]): string {
    return sumAmounts(fulfillments.map((f) => f.amount));
}
