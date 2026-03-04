/**
 * digestNotification.worker — BullMQ job handler for digest processing.
 *
 * Triggered by cron (hourly, daily, weekly) to process staged digest entries.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { DigestAggregator } from "../../domain/services/DigestAggregator.js";
import type { PreferenceFrequency } from "../../domain/types.js";
import type { Job, JobHandler } from "@athyper/core";

export interface DigestNotificationPayload {
  frequency: PreferenceFrequency;
}

export function createDigestNotificationHandler(
  digestAggregator: DigestAggregator,
  logger: Logger,
): JobHandler<DigestNotificationPayload, void> {
  return async (job: Job<DigestNotificationPayload>): Promise<void> => {
    const { frequency } = job.data.payload;

    logger.info(
      { jobId: job.id, frequency },
      "[notify:worker:digest] Starting digest processing",
    );

    try {
      const result = await digestAggregator.processDigest(frequency);

      logger.info(
        { jobId: job.id, frequency, sent: result.sent, errors: result.errors },
        "[notify:worker:digest] Digest processing complete",
      );
    } catch (err) {
      logger.error(
        { jobId: job.id, frequency, error: String(err) },
        "[notify:worker:digest] Digest processing failed",
      );
      throw err;
    }
  };
}
