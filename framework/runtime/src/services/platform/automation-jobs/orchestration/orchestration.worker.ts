/**
 * Orchestration Worker
 *
 * BullMQ worker that processes orchestration plan execution jobs.
 */

import type { OrchestrationEngine } from "./orchestration-engine.service.js";
import type { OrchestrationPlan, OrchestrationResult } from "./types.js";
import type { Logger } from "../../../../kernel/logger.js";
import type { Job, JobHandler } from "@athyper/core";

// ============================================================================
// Types
// ============================================================================

export interface OrchestrationJobPayload {
  plan: OrchestrationPlan;
  input?: Record<string, unknown>;
}

// ============================================================================
// Worker Factory
// ============================================================================

export function createOrchestrationHandler(
  engine: OrchestrationEngine,
  logger: Logger,
): JobHandler<OrchestrationJobPayload, OrchestrationResult> {
  return async (
    job: Job<OrchestrationJobPayload>,
  ): Promise<OrchestrationResult> => {
    const { plan, input } = job.data.payload;

    logger.info({
      msg: "orchestration_job_started",
      jobId: job.id,
      planId: plan.id,
      planName: plan.name,
      stepCount: plan.steps.length,
    });

    const result = await engine.executePlan(plan, input ?? {});

    logger.info({
      msg: "orchestration_job_completed",
      jobId: job.id,
      planId: plan.id,
      success: result.success,
      status: result.status,
      totalDurationMs: result.totalDurationMs,
    });

    if (!result.success) {
      throw new Error(
        `Orchestration plan '${plan.name}' failed: ${result.status}`,
      );
    }

    return result;
  };
}
