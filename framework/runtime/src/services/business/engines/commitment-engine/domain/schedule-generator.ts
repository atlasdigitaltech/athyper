// framework/runtime/src/services/business/engines/commitment-engine/domain/schedule-generator.ts
// MC-4 compliance: all monetary arithmetic uses Money lib (no parseFloat)

import {
    compareAmounts,
    subtractAmounts,
    multiplyAmounts,
    toScaledBigInt,
    fromScaledBigInt,
    sumAmounts,
    DEFAULT_PRECISION,
} from "../../shared/money.js";

import type { SchedulePattern, CreateScheduleInput } from "./types.js";

/**
 * Generate schedule entries from a pattern definition.
 */
export function generateScheduleEntries(
    commitmentId: string,
    tenantId: string,
    pattern: SchedulePattern,
    startDate: Date,
    totalAmount: string,
    currencyCode: string,
): CreateScheduleInput[] {
    switch (pattern.type) {
        case "FIXED_RECURRING":
            return generateFixedRecurring(
                commitmentId, tenantId, startDate,
                pattern.intervalMonths ?? 1,
                pattern.installmentAmount ?? totalAmount,
                currencyCode,
                totalAmount,
            );
        case "MILESTONE":
            return generateMilestone(
                commitmentId, tenantId,
                pattern.milestones ?? [],
                currencyCode,
            );
        case "ESCALATING":
            return generateEscalating(
                commitmentId, tenantId, startDate,
                pattern.intervalMonths ?? 12,
                pattern.installmentAmount ?? totalAmount,
                pattern.escalationPct ?? "0",
                currencyCode,
                totalAmount,
            );
        default:
            return [];
    }
}

function generateFixedRecurring(
    commitmentId: string,
    tenantId: string,
    startDate: Date,
    intervalMonths: number,
    installmentAmount: string,
    currencyCode: string,
    totalAmount: string,
): CreateScheduleInput[] {
    const entries: CreateScheduleInput[] = [];

    // MC-4: integer installment count via BigInt ceiling division
    const totalScaled = toScaledBigInt(totalAmount, DEFAULT_PRECISION);
    const installmentScaled = toScaledBigInt(installmentAmount, DEFAULT_PRECISION);
    const count = Number(
        (totalScaled + installmentScaled - 1n) / installmentScaled, // ceiling division
    );

    // MC-4: string-based remaining balance — no parseFloat
    let remaining = totalAmount;
    for (let i = 0; i < count; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + i * intervalMonths);

        // MC-4: min(installment, remaining) via compareAmounts
        const amount =
            compareAmounts(installmentAmount, remaining) <= 0
                ? installmentAmount
                : remaining;
        remaining = subtractAmounts(remaining, amount);

        entries.push({
            tenantId,
            commitmentId,
            scheduleSeq: i + 1,
            dueDate,
            amount,
            currencyCode,
        });
    }

    return entries;
}

function generateMilestone(
    commitmentId: string,
    tenantId: string,
    milestones: Array<{ name: string; amount: string; dueDate: Date }>,
    currencyCode: string,
): CreateScheduleInput[] {
    return milestones.map((m, i) => ({
        tenantId,
        commitmentId,
        scheduleSeq: i + 1,
        dueDate: m.dueDate,
        amount: m.amount,
        currencyCode,
        milestoneName: m.name,
    }));
}

function generateEscalating(
    commitmentId: string,
    tenantId: string,
    startDate: Date,
    intervalMonths: number,
    baseAmount: string,
    escalationPct: string,
    currencyCode: string,
    totalAmount: string,
): CreateScheduleInput[] {
    const entries: CreateScheduleInput[] = [];

    // MC-4: escalation factor as string e.g. "3" => "1.03"
    const escalationFactor = sumAmounts(["1", multiplyAmounts(escalationPct, "0.01")]);

    // MC-4: string-based remaining balance — no parseFloat
    let remaining = totalAmount;
    let currentAmount = baseAmount;
    let seq = 1;

    while (compareAmounts(remaining, "0") > 0) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + (seq - 1) * intervalMonths);

        // MC-4: min(currentAmount, remaining) via compareAmounts
        const amount =
            compareAmounts(currentAmount, remaining) <= 0
                ? currentAmount
                : remaining;
        remaining = subtractAmounts(remaining, amount);

        entries.push({
            tenantId,
            commitmentId,
            scheduleSeq: seq,
            dueDate,
            amount,
            currencyCode,
        });

        // MC-4: escalate via multiplyAmounts (no float multiplication)
        currentAmount = multiplyAmounts(currentAmount, escalationFactor);
        seq++;

        // Safety limit
        if (seq > 120) break;
    }

    return entries;
}
