/**
 * DocRenderDlqManager — Dead-letter queue management for document renders.
 *
 * Moves permanently failed renders to the DLQ, supports inspection,
 * single retry, and bulk replay. Follows notification DlqManager pattern.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { DocRenderDlqRepo } from "../../persistence/DocRenderDlqRepo.js";
import type { DocRenderDlqEntry, CreateDlqEntryInput } from "../models/DocRenderDlqEntry.js";
import type { OutputId, RenderJobId, DocErrorCode, DocErrorCategory } from "../types.js";
import type { JobQueue, JobData, JobOptions } from "@athyper/core";

export interface MoveToDlqInput {
    tenantId: string;
    outputId: OutputId;
    renderJobId?: RenderJobId;
    errorCode: DocErrorCode;
    errorDetail?: string;
    errorCategory: DocErrorCategory;
    attemptCount: number;
    payload: Record<string, unknown>;
}

export class DocRenderDlqManager {
    constructor(
        private readonly dlqRepo: DocRenderDlqRepo,
        private readonly jobQueue: JobQueue,
        private readonly logger: Logger,
    ) {}

    /**
     * Move a failed render to the dead-letter queue.
     * Stores the full render payload for later replay.
     */
    async moveToDlq(input: MoveToDlqInput): Promise<DocRenderDlqEntry> {
        const dlqInput: CreateDlqEntryInput = {
            tenantId: input.tenantId,
            outputId: input.outputId,
            renderJobId: input.renderJobId,
            errorCode: input.errorCode,
            errorDetail: input.errorDetail,
            errorCategory: input.errorCategory,
            attemptCount: input.attemptCount,
            payload: input.payload,
        };

        const entry = await this.dlqRepo.create(dlqInput);

        this.logger.info(
            {
                dlqId: entry.id,
                outputId: input.outputId,
                errorCode: input.errorCode,
                errorCategory: input.errorCategory,
            },
            "[doc:dlq] Render moved to DLQ",
        );

        return entry;
    }

    /**
     * List DLQ entries for a tenant.
     */
    async list(
        tenantId: string,
        options?: { unreplayedOnly?: boolean; limit?: number; offset?: number },
    ): Promise<DocRenderDlqEntry[]> {
        return this.dlqRepo.list(tenantId, options);
    }

    /**
     * Inspect a single DLQ entry.
     */
    async inspect(tenantId: string, id: string): Promise<DocRenderDlqEntry | undefined> {
        return this.dlqRepo.getById(tenantId, id);
    }

    /**
     * Retry a single DLQ entry — re-enqueues the render job.
     * Does NOT delete the DLQ entry (audit trail).
     */
    async retry(tenantId: string, id: string, replayedBy: string): Promise<boolean> {
        const entry = await this.dlqRepo.getById(tenantId, id);
        if (!entry) return false;

        // Re-enqueue the render job
        const jobData: JobData<Record<string, unknown>> = {
            type: "render-document",
            payload: entry.payload,
        };

        const jobOptions: JobOptions = {
            priority: "normal",
            attempts: 3,
            backoff: { type: "exponential", delay: 2000 },
            removeOnComplete: true,
        };

        await this.jobQueue.add(jobData, jobOptions);

        // Mark as replayed
        await this.dlqRepo.markReplayed(tenantId, id, replayedBy);

        this.logger.info(
            { dlqId: id, outputId: entry.outputId },
            "[doc:dlq] DLQ entry replayed",
        );

        return true;
    }

    /**
     * Bulk replay — replays all unreplayed entries for a tenant (up to limit).
     */
    async bulkReplay(
        tenantId: string,
        replayedBy: string,
        limit: number = 100,
    ): Promise<{ replayed: number; errors: number }> {
        const entries = await this.dlqRepo.list(tenantId, {
            unreplayedOnly: true,
            limit,
        });

        let replayed = 0;
        let errors = 0;

        for (const entry of entries) {
            try {
                const ok = await this.retry(tenantId, entry.id, replayedBy);
                if (ok) replayed++;
                else errors++;
            } catch (err) {
                errors++;
                this.logger.warn(
                    { dlqId: entry.id, error: String(err) },
                    "[doc:dlq] Bulk replay failed for entry",
                );
            }
        }

        this.logger.info(
            { tenantId, replayed, errors },
            "[doc:dlq] Bulk replay complete",
        );

        return { replayed, errors };
    }
}
