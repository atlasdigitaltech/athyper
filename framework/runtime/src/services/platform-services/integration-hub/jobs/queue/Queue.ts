/**
 * Integration Hub — job type constants and enqueue helpers.
 */

import type { JobQueue } from "@athyper/core";

export const INT_JOB_TYPES = {
    DELIVER_OUTBOX: "int:deliver-outbox",
    PROCESS_WEBHOOK: "int:process-webhook",
    EXECUTE_FLOW: "int:execute-flow",
} as const;

export async function enqueueOutboxDelivery(
    jobQueue: JobQueue,
    batchSize?: number,
): Promise<void> {
    await jobQueue.add({ type: INT_JOB_TYPES.DELIVER_OUTBOX, payload: { batchSize } });
}

export async function enqueueWebhookProcessing(
    jobQueue: JobQueue,
    batchSize?: number,
): Promise<void> {
    await jobQueue.add({ type: INT_JOB_TYPES.PROCESS_WEBHOOK, payload: { batchSize } });
}

export async function enqueueFlowExecution(
    jobQueue: JobQueue,
    tenantId: string,
    flowId: string,
    input: Record<string, unknown>,
    createdBy: string,
): Promise<void> {
    await jobQueue.add({ type: INT_JOB_TYPES.EXECUTE_FLOW, payload: { tenantId, flowId, input, createdBy } });
}
