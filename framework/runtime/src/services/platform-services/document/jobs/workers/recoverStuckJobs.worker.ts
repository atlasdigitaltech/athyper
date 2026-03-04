/**
 * Recover Stuck Jobs Worker — Finds and fails stuck renders.
 *
 * Job type: "recover-stuck-doc-renders"
 * Runs periodically (e.g., every 5 minutes).
 * Finds outputs stuck in RENDERING state beyond 2× timeout threshold.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { DocMetrics } from "../../observability/metrics.js";
import type { DocOutputRepo } from "../../persistence/DocOutputRepo.js";
import type { DocRenderJobRepo } from "../../persistence/DocRenderJobRepo.js";

export interface RecoverStuckJobsConfig {
    /** Maximum render time in ms. Outputs stuck longer than 2× this are recovered. */
    renderTimeoutMs: number;
}

export function createRecoverStuckJobsHandler(
    outputRepo: DocOutputRepo,
    renderJobRepo: DocRenderJobRepo,
    config: RecoverStuckJobsConfig,
    logger: Logger,
    metrics?: DocMetrics,
) {
    return async (): Promise<void> => {
        const stuckThresholdMs = config.renderTimeoutMs * 2;

        logger.debug(
            { stuckThresholdMs },
            "[doc:worker:recover] Scanning for stuck renders",
        );

        try {
            const stuckOutputs = await outputRepo.findStuckRendering(stuckThresholdMs);

            if (stuckOutputs.length === 0) {
                return;
            }

            logger.info(
                { count: stuckOutputs.length },
                "[doc:worker:recover] Found stuck renders",
            );

            let recovered = 0;

            for (const output of stuckOutputs) {
                try {
                    await outputRepo.updateStatus(output.id, "FAILED", {
                        error_message: `Render stuck — exceeded ${stuckThresholdMs}ms threshold`,
                        error_code: "RENDER_TIMEOUT",
                    });

                    // Also fail the corresponding render job
                    const renderJob = await renderJobRepo.getByOutputId(output.id);
                    if (renderJob) {
                        await renderJobRepo.updateStatus(renderJob.id, "FAILED", {
                            error_code: "RENDER_TIMEOUT",
                            error_detail: `Recovered by stuck job worker — output exceeded ${stuckThresholdMs}ms`,
                        });
                    }

                    recovered++;
                    metrics?.incrementFailuresByCode("RENDER_TIMEOUT");

                    logger.info(
                        { outputId: output.id, tenantId: output.tenantId },
                        "[doc:worker:recover] Recovered stuck render",
                    );
                } catch (err) {
                    logger.warn(
                        { outputId: output.id, error: String(err) },
                        "[doc:worker:recover] Failed to recover stuck render",
                    );
                }
            }

            logger.info(
                { total: stuckOutputs.length, recovered },
                "[doc:worker:recover] Stuck render recovery complete",
            );
        } catch (error) {
            logger.error(
                { error: String(error) },
                "[doc:worker:recover] Stuck render recovery scan failed",
            );
        }
    };
}
