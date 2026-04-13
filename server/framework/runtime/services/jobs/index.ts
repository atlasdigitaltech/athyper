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
 *   const jobs = createJobsService({ db, redisUrl, logger });
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

export { registerJobsRoutes } from "./routes/index.js";

export type { NotificationChannelHandler } from "./workers/notification.worker.js";
export type { OutboxTopicHandler, OutboxEvent } from "./workers/domain-outbox.worker.js";

export { createWfOutboxHandler } from "./handlers/wf-outbox.handler.js";

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
  JobLogger,
} from "./jobs.types.js";
