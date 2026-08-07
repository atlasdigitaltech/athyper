/**
 * Atlas conversation retention worker.
 *
 * This worker accepts an empty payload only. Selection of eligible rows,
 * tenant traversal, legal-hold enforcement, and batching all remain inside
 * the separately-authorized Atlas maintenance service.
 */

import { Worker, type ConnectionOptions, type Job } from "bullmq";
import {
  JOB_NAME,
  QUEUE_NAME,
  type AtlasConversationPurgeJobData,
  type JobLogger,
} from "../jobs.types.js";

export interface AtlasConversationPurgeResult {
  readonly expiredCount: number;
  readonly purgedCount: number;
}

/**
 * Narrow structural boundary implemented by AtlasThreadService. Keeping the
 * jobs package independent from svc-ai avoids coupling the scheduler to AI
 * provider/runtime code.
 */
export interface AtlasConversationPurgeService {
  purgeEligible(input: {
    readonly batchSize: number;
  }): Promise<AtlasConversationPurgeResult>;
}

export interface AtlasConversationPurgeMetrics {
  observe(input: {
    readonly outcome: "completed" | "failed";
    readonly expiredCount: number;
    readonly purgedCount: number;
    readonly durationMs: number;
  }): void;
}

export interface AtlasConversationPurgeWorkerDeps {
  connection: ConnectionOptions;
  service: AtlasConversationPurgeService;
  batchSize: number;
  logger?: JobLogger;
  metrics?: AtlasConversationPurgeMetrics;
}

export async function processAtlasConversationPurge(
  job: Pick<Job<AtlasConversationPurgeJobData>, "id" | "name" | "data">,
  service: AtlasConversationPurgeService,
  batchSize: number,
  logger?: JobLogger,
  metrics?: AtlasConversationPurgeMetrics,
): Promise<AtlasConversationPurgeResult> {
  if (job.name !== JOB_NAME.ATLAS_CONVERSATION_PURGE) {
    throw new Error(`Unsupported Atlas conversation maintenance job: ${job.name}`);
  }
  if (
    !job.data
    || typeof job.data !== "object"
    || Array.isArray(job.data)
    || Object.keys(job.data).length !== 0
  ) {
    throw new Error("Atlas conversation purge job payload must be empty.");
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new Error("Atlas conversation purge batch size must be a positive integer.");
  }

  const startedAt = Date.now();
  logger?.info("atlas_conversation_purge_started", {
    jobId: job.id,
    batchSize,
  });

  try {
    const result = await service.purgeEligible({ batchSize });
    const durationMs = Date.now() - startedAt;
    logger?.info("atlas_conversation_purge_completed", {
      jobId: job.id,
      batchSize,
      expiredCount: result.expiredCount,
      purgedCount: result.purgedCount,
      durationMs,
    });
    metrics?.observe({
      outcome: "completed",
      expiredCount: result.expiredCount,
      purgedCount: result.purgedCount,
      durationMs,
    });
    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logger?.error("atlas_conversation_purge_failed", {
      jobId: job.id,
      batchSize,
      durationMs,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    metrics?.observe({
      outcome: "failed",
      expiredCount: 0,
      purgedCount: 0,
      durationMs,
    });
    throw error;
  }
}

export function createAtlasConversationPurgeWorker(
  deps: AtlasConversationPurgeWorkerDeps,
): Worker<AtlasConversationPurgeJobData> {
  return new Worker<AtlasConversationPurgeJobData>(
    QUEUE_NAME.ATLAS_CONVERSATION_PURGE,
    (job) => processAtlasConversationPurge(
      job,
      deps.service,
      deps.batchSize,
      deps.logger,
      deps.metrics,
    ),
    {
      connection: deps.connection,
      concurrency: 1,
    },
  );
}
