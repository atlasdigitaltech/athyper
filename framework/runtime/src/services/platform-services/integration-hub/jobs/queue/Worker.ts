/**
 * Integration Hub — worker registration helper.
 * Called during contribute() to register all job processors.
 */

import { createDeliverOutboxHandler } from "../workers/deliverOutboxItem.job.js";
import { createProcessWebhookHandler } from "../workers/processWebhookInbox.job.js";

import { INT_JOB_TYPES } from "./Queue.js";

import type { Logger } from "../../../../../kernel/logger.js";
import type { DeliveryScheduler } from "../../domain/services/DeliveryScheduler.js";
import type { EventGateway } from "../../domain/services/EventGateway.js";
import type { WebhookEventRepo } from "../../persistence/WebhookEventRepo.js";
import type { JobQueue } from "@athyper/core";

export interface WorkerConfig {
    outboxConcurrency?: number;
    webhookConcurrency?: number;
}

export async function registerIntegrationWorkers(
    jobQueue: JobQueue,
    scheduler: DeliveryScheduler,
    webhookEventRepo: WebhookEventRepo,
    eventGateway: EventGateway,
    logger: Logger,
    config?: WorkerConfig,
): Promise<void> {
    await jobQueue.process(
        INT_JOB_TYPES.DELIVER_OUTBOX,
        config?.outboxConcurrency ?? 3,
        createDeliverOutboxHandler(scheduler, logger),
    );

    await jobQueue.process(
        INT_JOB_TYPES.PROCESS_WEBHOOK,
        config?.webhookConcurrency ?? 2,
        createProcessWebhookHandler(webhookEventRepo, eventGateway, logger),
    );

    logger.info("[int:workers] Integration workers registered");
}
