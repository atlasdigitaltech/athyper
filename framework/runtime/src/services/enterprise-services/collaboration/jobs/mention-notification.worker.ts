/**
 * Mention Notification Worker
 *
 * Processes mention notification jobs asynchronously.
 * Sends notifications when users are mentioned in comments.
 */

import { TOKENS } from "../../../../kernel/tokens.js";

import type { Container } from "../../../../kernel/container.js";
import type { Logger } from "../../../../kernel/logger.js";

/**
 * Mention notification job payload
 */
export interface MentionNotificationJob {
  tenantId: string;
  mentionedUserId: string;
  commentType: "entity_comment" | "approval_comment";
  commentId: string;
  commenterId: string;
  entityType?: string;
  entityId?: string;
  approvalInstanceId?: string;
}

/**
 * Register mention notification worker
 *
 * This should be called during module contribution phase to register
 * the worker with the job queue system.
 */
export async function registerMentionNotificationWorker(container: Container) {
  const logger = await container.resolve<Logger>(TOKENS.logger);

  try {
    // Check if job queue is available
    const jobQueue = (await container.resolve(TOKENS.jobQueue)) as any;
    if (!jobQueue) {
      logger.warn(
        "[collab] Job queue not available, mention notifications will not be sent",
      );
      return;
    }

    // Register worker to process mention-notification jobs
    await jobQueue.process("mention-notification", 5, async (job: any) => {
      const payload = job.data as MentionNotificationJob;

      logger.info(
        {
          mentionedUserId: payload.mentionedUserId,
          commentId: payload.commentId,
        },
        "[collab] Processing mention notification",
      );

      try {
        // Get notification orchestrator
        const notificationOrchestrator = (await container.resolve(
          TOKENS.notificationOrchestrator,
        )) as any;

        // Prepare notification payload
        const notificationPayload: any = {
          commentId: payload.commentId,
          commentType: payload.commentType,
          commenterId: payload.commenterId,
        };

        if (payload.entityType && payload.entityId) {
          notificationPayload.entityType = payload.entityType;
          notificationPayload.entityId = payload.entityId;
        }

        if (payload.approvalInstanceId) {
          notificationPayload.approvalInstanceId = payload.approvalInstanceId;
        }

        // Send notification
        await notificationOrchestrator.send({
          tenantId: payload.tenantId,
          recipientId: payload.mentionedUserId,
          type: "comment_mention",
          title: "You were mentioned in a comment",
          body: "Someone mentioned you in a comment",
          payload: notificationPayload,
          priority: "normal",
          channels: ["in_app", "email"], // Customize channels as needed
        });

        logger.info(
          {
            mentionedUserId: payload.mentionedUserId,
            commentId: payload.commentId,
          },
          "[collab] Mention notification sent successfully",
        );
      } catch (err) {
        logger.error(
          {
            error: err instanceof Error ? err.message : String(err),
            mentionedUserId: payload.mentionedUserId,
            commentId: payload.commentId,
          },
          "[collab] Failed to send mention notification",
        );
        throw err; // Rethrow to trigger job retry
      }
    });

    logger.info("[collab] Mention notification worker registered");
  } catch (err) {
    // Job queue not available or worker registration failed
    logger.warn(
      {
        error: err instanceof Error ? err.message : String(err),
      },
      "[collab] Mention notification worker registration failed (non-fatal)",
    );
  }
}
