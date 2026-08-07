/**
 * Atlas read-only tool invocation crash recovery.
 *
 * Jobs carry no selectors. The separately-authorized admin service owns
 * tenant/plane enumeration and the SQL primitive rechecks every source-state
 * guard while holding row locks.
 */

import { Worker, type ConnectionOptions, type Job } from "bullmq";
import {
  JOB_NAME,
  QUEUE_NAME,
  type AtlasToolInvocationRecoveryJobData,
  type JobLogger,
} from "../jobs.types.js";

const MAX_BATCH_SIZE = 1_000;
const MIN_STALE_TIMEOUT_MS = 60_000;
const MAX_STALE_TIMEOUT_MS = 86_400_000;

export interface AtlasToolInvocationRecoveryResult {
  readonly failedCount: number;
  readonly scopeCount: number;
  readonly skippedScopeCount: number;
}

/**
 * Structural boundary implemented by svc-ai. The jobs package deliberately
 * has no dependency on provider/runtime or Atlas SQL implementation types.
 */
export interface AtlasToolInvocationRecoveryService {
  recoverEligible(input: {
    readonly staleBefore: Date;
    readonly asOf: Date;
    readonly batchSize: number;
  }): Promise<AtlasToolInvocationRecoveryResult>;
}

export interface AtlasToolInvocationRecoveryObservation {
  readonly outcome: "completed" | "failed";
  readonly recoveredCount: number;
  readonly scopeCount: number;
  readonly skippedScopeCount: number;
  readonly durationMs: number;
}

export interface AtlasToolInvocationRecoveryMetrics {
  observe(observation: AtlasToolInvocationRecoveryObservation): void;
}

export interface AtlasToolInvocationRecoveryOptions {
  readonly batchSize: number;
  readonly staleRunTimeoutMs: number;
}

export interface AtlasToolInvocationRecoveryWorkerDeps {
  connection: ConnectionOptions;
  service: AtlasToolInvocationRecoveryService;
  options: AtlasToolInvocationRecoveryOptions;
  logger?: JobLogger;
  metrics?: AtlasToolInvocationRecoveryMetrics;
}

export async function processAtlasToolInvocationRecovery(
  job: Pick<Job<AtlasToolInvocationRecoveryJobData>, "id" | "name" | "data">,
  service: AtlasToolInvocationRecoveryService,
  options: AtlasToolInvocationRecoveryOptions,
  logger?: JobLogger,
  metrics?: AtlasToolInvocationRecoveryMetrics,
  asOf = new Date(),
): Promise<AtlasToolInvocationRecoveryResult> {
  validateJob(job, options, asOf);

  const startedAt = Date.now();
  const staleBefore = new Date(asOf.getTime() - options.staleRunTimeoutMs);
  logger?.info("atlas_tool_invocation_recovery_started", {
    jobId: job.id,
    batchSize: options.batchSize,
    staleRunTimeoutMs: options.staleRunTimeoutMs,
  });

  try {
    const result = await service.recoverEligible({
      staleBefore,
      asOf,
      batchSize: options.batchSize,
    });
    const durationMs = Date.now() - startedAt;

    logger?.info("atlas_tool_invocation_recovery_completed", {
      jobId: job.id,
      batchSize: options.batchSize,
      staleRunTimeoutMs: options.staleRunTimeoutMs,
      failedCount: result.failedCount,
      scopeCount: result.scopeCount,
      skippedScopeCount: result.skippedScopeCount,
      durationMs,
    });
    observeSafely(metrics, {
      outcome: "completed",
      recoveredCount: result.failedCount,
      scopeCount: result.scopeCount,
      skippedScopeCount: result.skippedScopeCount,
      durationMs,
    });
    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logger?.error("atlas_tool_invocation_recovery_failed", {
      jobId: job.id,
      batchSize: options.batchSize,
      staleRunTimeoutMs: options.staleRunTimeoutMs,
      errorType: safeErrorType(error),
      durationMs,
    });
    observeSafely(metrics, {
      outcome: "failed",
      recoveredCount: 0,
      scopeCount: 0,
      skippedScopeCount: 0,
      durationMs,
    });
    throw error;
  }
}

export function createAtlasToolInvocationRecoveryWorker(
  deps: AtlasToolInvocationRecoveryWorkerDeps,
): Worker<AtlasToolInvocationRecoveryJobData> {
  return new Worker<AtlasToolInvocationRecoveryJobData>(
    QUEUE_NAME.ATLAS_TOOL_INVOCATION_RECOVERY,
    (job) => processAtlasToolInvocationRecovery(
      job,
      deps.service,
      deps.options,
      deps.logger,
      deps.metrics,
    ),
    {
      connection: deps.connection,
      concurrency: 1,
    },
  );
}

function validateJob(
  job: Pick<Job<AtlasToolInvocationRecoveryJobData>, "name" | "data">,
  options: AtlasToolInvocationRecoveryOptions,
  asOf: Date,
): void {
  if (job.name !== JOB_NAME.ATLAS_TOOL_INVOCATION_RECOVERY) {
    throw new Error(`Unsupported Atlas tool maintenance job: ${job.name}`);
  }
  if (
    !job.data
    || typeof job.data !== "object"
    || Array.isArray(job.data)
    || Object.keys(job.data).length !== 0
  ) {
    throw new Error("Atlas tool invocation recovery job payload must be empty.");
  }
  if (
    !Number.isSafeInteger(options.batchSize)
    || options.batchSize < 1
    || options.batchSize > MAX_BATCH_SIZE
  ) {
    throw new Error(
      `Atlas tool invocation recovery batch size must be between 1 and ${MAX_BATCH_SIZE}.`,
    );
  }
  if (
    !Number.isSafeInteger(options.staleRunTimeoutMs)
    || options.staleRunTimeoutMs < MIN_STALE_TIMEOUT_MS
    || options.staleRunTimeoutMs > MAX_STALE_TIMEOUT_MS
  ) {
    throw new Error("Invalid Atlas tool invocation recovery stale timeout.");
  }
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) {
    throw new Error("Invalid Atlas tool invocation recovery clock.");
  }
}

function observeSafely(
  metrics: AtlasToolInvocationRecoveryMetrics | undefined,
  observation: AtlasToolInvocationRecoveryObservation,
): void {
  try {
    metrics?.observe(observation);
  } catch {
    // Observability must never alter maintenance state or BullMQ retry policy.
  }
}

function safeErrorType(error: unknown): string {
  return error instanceof Error
    && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(error.name)
    ? error.name
    : "UnknownError";
}
