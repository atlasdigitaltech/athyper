/**
 * Render Job — queue tracking that correlates with BullMQ jobs.
 */

import type { RenderJobId, OutputId, RenderJobStatus } from "../types.js";

export interface DocRenderJob {
    id: RenderJobId;
    outputId: OutputId;
    tenantId: string;
    jobQueueId: string | null;
    status: RenderJobStatus;
    attempts: number;
    maxAttempts: number;
    errorCode: string | null;
    errorDetail: string | null;
    traceId: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    durationMs: number | null;
    createdAt: Date;
}
