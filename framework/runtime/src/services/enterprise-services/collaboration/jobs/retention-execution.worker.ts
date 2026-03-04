/**
 * Retention Execution Worker
 *
 * Scheduled job that executes retention policies:
 * - Archive comments older than retention period
 * - Hard delete archived comments past grace period
 * - Enforce retention rules per entity type
 * - Emit audit events for retention actions
 *
 * Schedule: Runs daily at 3:00 AM UTC (cron: "0 3 * * *")
 */

import { TOKENS } from "../../../../kernel/tokens.js";

import type { AuditWriter } from "../../../../kernel/audit.js";
import type { Container } from "../../../../kernel/container.js";
import type { Logger } from "../../../../kernel/logger.js";
import type { CommentRetentionService } from "../domain/comment-retention.service.js";


/**
 * Retention execution job payload
 */
export interface RetentionExecutionJob {
  tenantId: string;
  policyId?: string; // Optional: run specific policy, or all policies if not provided
  dryRun?: boolean; // If true, only report what would be affected without actually executing
}

/**
 * Retention execution result
 */
export interface RetentionExecutionResult {
  policiesExecuted: number;
  commentsArchived: number;
  commentsDeleted: number;
  errors: number;
  dryRun: boolean;
}

/**
 * Register retention execution worker
 *
 * This should be called during module contribution phase to register
 * the worker and schedule periodic retention policy execution.
 */
export async function registerRetentionExecutionWorker(container: Container) {
  const logger = await container.resolve<Logger>(TOKENS.logger);

  try {
    // Check if job queue is available
    const jobQueue = await container.resolve(TOKENS.jobQueue) as any;
    if (!jobQueue) {
      logger.warn("[collab] Job queue not available, retention policies will not be executed automatically");
      return;
    }

    // Register worker to process retention-execution jobs
    await jobQueue.process("retention-execution", 1, async (job: any) => {
      const payload = job.data as RetentionExecutionJob;
      const { tenantId, policyId, dryRun = false } = payload;
      const startTime = Date.now();

      logger.info(
        {
          tenantId,
          policyId: policyId || "all",
          dryRun,
        },
        "[collab] Starting retention execution"
      );

      const result: RetentionExecutionResult = {
        policiesExecuted: 0,
        commentsArchived: 0,
        commentsDeleted: 0,
        errors: 0,
        dryRun,
      };

      try {
        const retentionService = await container.resolve<CommentRetentionService>(
          TOKENS.collabRetentionService
        );
        const auditWriter = await container.resolve<AuditWriter>(TOKENS.auditWriter);

        // Get enabled retention policies
        const allPolicies = await retentionService.listPolicies(tenantId);
        let policies = allPolicies.filter((p) => p.enabled);

        // If specific policyId provided, filter to that policy only
        if (policyId) {
          policies = policies.filter((p) => p.id === policyId);
        }

        if (policies.length === 0) {
          logger.info(
            { tenantId, policyId },
            "[collab] No enabled policies found"
          );
          return result;
        }

        logger.info(
          { tenantId, policyCount: policies.length },
          `[collab] Found ${policies.length} policies to execute`
        );

        // Execute each policy
        for (const policy of policies) {
          try {
            await job.updateProgress(
              Math.round(((result.policiesExecuted + 1) / policies.length) * 100)
            );

            const policyResult = await executePolicy(
              retentionService,
              logger,
              tenantId,
              policy,
              dryRun
            );

            result.policiesExecuted++;
            result.commentsArchived += policyResult.commentsArchived;
            result.commentsDeleted += policyResult.commentsDeleted;

            logger.info(
              {
                tenantId,
                policyId: policy.id,
                policyName: policy.policyName,
                archived: policyResult.commentsArchived,
                deleted: policyResult.commentsDeleted,
                dryRun,
              },
              "[collab] Policy executed"
            );
          } catch (err) {
            result.errors++;
            logger.error(
              {
                tenantId,
                policyId: policy.id,
                policyName: policy.policyName,
                error: err instanceof Error ? err.message : String(err),
              },
              "[collab] Policy execution failed"
            );
          }
        }

        const duration = Date.now() - startTime;

        logger.info(
          {
            tenantId,
            durationMs: duration,
            ...result,
          },
          "[collab] Retention execution completed"
        );

        // Emit audit event for retention execution
        await auditWriter.write({
          ts: new Date().toISOString(),
          type: "retention_execution",
          level: "info",
          actor: { kind: "system", id: "retention-scheduler" },
          meta: {
            tenantId,
            source: "collab",
            summary: `Retention execution completed: ${result.commentsArchived} archived, ${result.commentsDeleted} deleted`,
            details: result,
          },
        });

        await job.updateProgress(100);
        return result;
      } catch (err) {
        logger.error(
          {
            error: err instanceof Error ? err.message : String(err),
            tenantId,
          },
          "[collab] Fatal error during retention execution"
        );
        throw err; // Rethrow to trigger job retry
      }
    });

    // Schedule daily retention execution job (runs at 3:00 AM UTC every day)
    await jobQueue.addRepeatable(
      "retention-execution",
      {},
      {
        cron: "0 3 * * *", // Daily at 3:00 AM UTC
        jobId: "retention-daily-execution",
      }
    );

    logger.info("[collab] Retention execution worker registered with daily schedule");
  } catch (err) {
    logger.warn(
      {
        error: err instanceof Error ? err.message : String(err),
      },
      "[collab] Retention execution worker registration failed (non-fatal)"
    );
  }
}

/**
 * Execute a single retention policy
 */
async function executePolicy(
  retentionService: CommentRetentionService,
  logger: Logger,
  tenantId: string,
  policy: {
    id: string;
    policyName: string;
    entityType?: string;
    retentionDays: number;
    action: string;
  },
  dryRun: boolean
): Promise<{ commentsArchived: number; commentsDeleted: number }> {
  const result = { commentsArchived: 0, commentsDeleted: 0 };

  // Skip "keep" / "keep_forever" policies
  if (policy.action === "keep_forever" || policy.action === "keep") {
    return result;
  }

  // Calculate cutoff date based on retention days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

  logger.debug(
    {
      tenantId,
      policyId: policy.id,
      policyName: policy.policyName,
      entityType: policy.entityType,
      cutoffDate: cutoffDate.toISOString(),
      action: policy.action,
      dryRun,
    },
    "[collab] Executing policy"
  );

  // Find comments matching retention criteria
  const affectedComments = await retentionService.findCommentsForRetention(
    tenantId,
    policy.entityType || "*",
    cutoffDate
  );

  if (affectedComments.length === 0) {
    logger.debug(
      { tenantId, policyId: policy.id },
      "[collab] No comments to process"
    );
    return result;
  }

  logger.info(
    {
      tenantId,
      policyId: policy.id,
      action: policy.action,
      commentCount: affectedComments.length,
    },
    `[collab] Found ${affectedComments.length} comments to process`
  );

  if (dryRun) {
    // Dry run: just count what would be affected
    if (policy.action === "archive") {
      result.commentsArchived = affectedComments.length;
    } else if (policy.action === "delete" || policy.action === "hard_delete") {
      result.commentsDeleted = affectedComments.length;
    }
    return result;
  }

  // Execute the retention action
  if (policy.action === "archive") {
    // Archive (soft delete) comments
    for (const comment of affectedComments) {
      try {
        await retentionService.archiveComment(tenantId, comment.id, "retention_policy");
        result.commentsArchived++;
      } catch (err) {
        logger.error(
          {
            tenantId,
            commentId: comment.id,
            policyId: policy.id,
            error: err instanceof Error ? err.message : String(err),
          },
          "[collab] Failed to archive comment"
        );
      }
    }
  } else if (policy.action === "delete" || policy.action === "hard_delete") {
    // Hard delete comments (already archived + grace period passed)
    for (const comment of affectedComments) {
      try {
        await retentionService.hardDeleteComment(tenantId, comment.id);
        result.commentsDeleted++;
      } catch (err) {
        logger.error(
          {
            tenantId,
            commentId: comment.id,
            policyId: policy.id,
            error: err instanceof Error ? err.message : String(err),
          },
          "[collab] Failed to delete comment"
        );
      }
    }
  }

  return result;
}
