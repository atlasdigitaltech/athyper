/**
 * Worker — delivers outbox items via DeliveryScheduler.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { DeliveryScheduler } from "../../domain/services/DeliveryScheduler.js";
import type { Job } from "@athyper/core";

export interface DeliverOutboxPayload {
  batchSize?: number;
}

export function createDeliverOutboxHandler(
  scheduler: DeliveryScheduler,
  logger: Logger,
) {
  return async (job: Job<DeliverOutboxPayload>): Promise<void> => {
    logger.debug("[int:worker:outbox] Processing outbox batch");
    const count = await scheduler.pollAndDeliver();
    if (count > 0) {
      logger.info({ processed: count }, "[int:worker:outbox] Batch complete");
    }
  };
}
