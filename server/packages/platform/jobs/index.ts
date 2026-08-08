/**
 * @athyper/svc-jobs — Automation & Jobs service
 *
 * BullMQ-powered background job processing for the Athyper platform.
 *
 * Queues:
 *   jobs:lifecycle-timers  — fire auto-close / auto-cancel / reminder timers
 *   jobs:notifications     — dispatch notification messages per channel
 *   jobs:domain-outbox     — drain event.outbox for fin / wf / audit topics
 *   jobs:sla-check         — escalate breached cycle tasks + work items
 *
 * Usage:
 *   const jobs = createJobsService({ db, connection, logger });
 *   await jobs.start();
 *   lifecycle.onShutdown(() => jobs.stop());
 *
 * Admin API (mount on apiRouter):
 *   registerJobsRoutes(apiRouter, { queues: jobs.queues, auth, logger });
 */

export { createJobsService } from "./jobs.service.js";
export type {
  JobsService,
  JobsServiceDeps,
  JobsServiceOptions,
  JobsQueues,
} from "./jobs.service.js";

export {
  registerJobsRoutes,
  registerJobsAdminRoutes,
  registerJobsBoardRoutes,
} from "./routes/index.js";
export type { JobsAdminRouteDeps } from "./routes/index.js";

export type { NotificationChannelHandler } from "@athyper/platform-notifications";
export type { OutboxTopicHandler, OutboxEvent } from "./workers/domain-outbox.worker.js";

export { createWfOutboxHandler } from "./handlers/wf-outbox.handler.js";
export { createP2pNotificationOutboxHandler } from "./handlers/p2p-notification-outbox.handler.js";
export {
  createWebhookDeliveryWorker,
  type WebhookDeliveryWorkerResult,
} from "./workers/webhook-delivery.worker.js";

export {
  QUEUE_NAME,
  JOB_NAME,
  SCHEDULER_ID,
  DEFAULT_INTERVALS,
  DRAIN_TOPICS,
  SYSTEM_ACTOR_ID,
  drainJobName,
} from "./jobs.types.js";
export type {
  QueueName,
  DrainTopic,
  FireTimerJobData,
  SendNotificationJobData,
  DrainOutboxJobData,
  SlaCheckJobData,
  SweepJobData,
  ImportChunkJobData,
  ExtractTextJobData,
  AtlasConversationPurgeJobData,
  AtlasToolInvocationRecoveryJobData,
  JobLogger,
  JobHeartbeatHooks,
} from "./jobs.types.js";

export type { TikaObjectStorage } from "./workers/tika-extract.worker.js";
export type { BackupObjectStorage } from "./workers/backup.worker.js";
export type {
  AtlasConversationPurgeResult,
  AtlasConversationPurgeService,
} from "./workers/atlas-conversation-purge.worker.js";
export type {
  AtlasToolInvocationRecoveryMetrics,
  AtlasToolInvocationRecoveryObservation,
  AtlasToolInvocationRecoveryOptions,
  AtlasToolInvocationRecoveryResult,
  AtlasToolInvocationRecoveryService,
} from "./workers/atlas-tool-invocation-recovery.worker.js";
