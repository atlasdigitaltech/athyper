/**
 * Analytics Aggregation Worker
 *
 * Scheduled job that runs daily to aggregate comment analytics:
 * - Daily activity counts (comments, replies, mentions)
 * - User engagement metrics (active users, top contributors)
 * - Thread activity (active threads, response times)
 * - SLA metrics aggregation
 *
 * Schedule: Runs daily at 2:00 AM UTC (cron: "0 2 * * *")
 */

import { TOKENS } from "../../../../kernel/tokens.js";

import type { Container } from "../../../../kernel/container.js";
import type { Logger } from "../../../../kernel/logger.js";
import type { CommentAnalyticsService } from "../domain/comment-analytics.service.js";

/**
 * Analytics aggregation job payload
 */
export interface AnalyticsAggregationJob {
  tenantId: string;
  aggregationType: "daily" | "weekly" | "monthly";
  targetDate: string; // ISO date string (YYYY-MM-DD)
}

/**
 * Register analytics aggregation worker
 *
 * This should be called during module contribution phase to register
 * the worker and schedule periodic aggregation jobs.
 */
export async function registerAnalyticsAggregationWorker(container: Container) {
  const logger = await container.resolve<Logger>(TOKENS.logger);

  try {
    // Check if job queue is available
    const jobQueue = (await container.resolve(TOKENS.jobQueue)) as any;
    if (!jobQueue) {
      logger.warn(
        "[collab] Job queue not available, analytics aggregation will not run",
      );
      return;
    }

    // Register worker to process analytics-aggregation jobs
    await jobQueue.process("analytics-aggregation", 1, async (job: any) => {
      const payload = job.data as AnalyticsAggregationJob;
      const startTime = Date.now();

      logger.info(
        {
          tenantId: payload.tenantId,
          aggregationType: payload.aggregationType,
          targetDate: payload.targetDate,
        },
        "[collab] Starting analytics aggregation",
      );

      try {
        const analyticsService =
          await container.resolve<CommentAnalyticsService>(
            TOKENS.collabAnalyticsService,
          );

        // Calculate date range based on aggregation type
        const { startDate, endDate } = getDateRange(
          payload.targetDate,
          payload.aggregationType,
        );

        // Aggregate daily activity metrics
        const dailyMetrics = await analyticsService.getDailyAnalytics(
          payload.tenantId,
          new Date(startDate),
          new Date(endDate),
        );

        logger.debug(
          {
            tenantId: payload.tenantId,
            startDate,
            endDate,
            totalDays: dailyMetrics.length,
          },
          "[collab] Daily activity aggregated",
        );

        // Aggregate user engagement metrics
        const leaderboard = await analyticsService.getUserEngagementLeaderboard(
          payload.tenantId,
          new Date(startDate),
          new Date(endDate),
          100,
        );

        logger.debug(
          {
            tenantId: payload.tenantId,
            activeUsers: leaderboard.length,
          },
          "[collab] User engagement aggregated",
        );

        // Aggregate thread activity metrics
        const activeThreads = await analyticsService.getMostActiveThreads(
          payload.tenantId,
          undefined,
          1000,
          true,
        );

        logger.debug(
          {
            tenantId: payload.tenantId,
            activeThreads: activeThreads.length,
          },
          "[collab] Thread activity aggregated",
        );

        const duration = Date.now() - startTime;

        logger.info(
          {
            tenantId: payload.tenantId,
            aggregationType: payload.aggregationType,
            targetDate: payload.targetDate,
            durationMs: duration,
          },
          "[collab] Analytics aggregation completed successfully",
        );

        await job.updateProgress(100);
      } catch (err) {
        logger.error(
          {
            error: err instanceof Error ? err.message : String(err),
            tenantId: payload.tenantId,
            aggregationType: payload.aggregationType,
          },
          "[collab] Analytics aggregation failed",
        );
        throw err; // Rethrow to trigger job retry
      }
    });

    // Schedule daily aggregation job (runs at 2:00 AM UTC every day)
    await jobQueue.addRepeatable(
      "analytics-aggregation",
      {},
      {
        cron: "0 2 * * *", // Daily at 2:00 AM UTC
        jobId: "analytics-daily-aggregation",
      },
    );

    logger.info(
      "[collab] Analytics aggregation worker registered with daily schedule",
    );
  } catch (err) {
    logger.warn(
      {
        error: err instanceof Error ? err.message : String(err),
      },
      "[collab] Analytics aggregation worker registration failed (non-fatal)",
    );
  }
}

/**
 * Helper to calculate date range based on aggregation type
 */
function getDateRange(
  targetDate: string,
  type: "daily" | "weekly" | "monthly",
): { startDate: string; endDate: string } {
  const date = new Date(targetDate);

  switch (type) {
    case "daily":
      return {
        startDate: targetDate,
        endDate: targetDate,
      };

    case "weekly": {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6); // End of week (Saturday)

      return {
        startDate: weekStart.toISOString().split("T")[0],
        endDate: weekEnd.toISOString().split("T")[0],
      };
    }

    case "monthly": {
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      return {
        startDate: monthStart.toISOString().split("T")[0],
        endDate: monthEnd.toISOString().split("T")[0],
      };
    }
  }
}
