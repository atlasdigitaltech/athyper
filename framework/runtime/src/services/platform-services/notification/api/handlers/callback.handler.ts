/**
 * Callback handler — Webhook endpoints for provider status callbacks.
 *
 * Currently supports SendGrid event webhooks.
 * Each provider webhook has its own route for independent auth/parsing.
 */

import { TOKENS } from "../../../../../kernel/tokens.js";

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../../../platform/foundation/http/types.js";
import type { ProcessCallbackPayload } from "../../domain/services/NotificationOrchestrator.js";
import type { JobQueue, JobData } from "@athyper/core";
import type { Request, Response } from "express";

export class SendGridCallbackHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const jobQueue = await ctx.container.resolve<JobQueue>(TOKENS.jobQueue);

    // SendGrid sends an array of events
    const events = Array.isArray(req.body) ? req.body : [req.body];

    for (const event of events) {
      const sgEvent = event as {
        sg_message_id?: string;
        event?: string;
        timestamp?: number;
        reason?: string;
        type?: string;
      };

      if (!sgEvent.sg_message_id || !sgEvent.event) continue;

      // Strip the filter ID suffix from sg_message_id (e.g., "abc123.filter0001")
      const externalId = sgEvent.sg_message_id.split(".")[0];

      const jobData: JobData<ProcessCallbackPayload> = {
        type: "process-callback",
        payload: {
          provider: "sendgrid",
          externalId,
          eventType: this.mapSendGridEvent(sgEvent.event),
          timestamp: sgEvent.timestamp
            ? new Date(sgEvent.timestamp * 1000).toISOString()
            : new Date().toISOString(),
          rawPayload: event as Record<string, unknown>,
        },
      };

      await jobQueue.add(jobData, {
        priority: "normal",
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
      });
    }

    // Always return 200 to SendGrid to acknowledge receipt
    res.status(200).json({ received: true });
  }

  private mapSendGridEvent(sgEvent: string): string {
    switch (sgEvent) {
      case "delivered":
        return "delivered";
      case "open":
        return "opened";
      case "click":
        return "clicked";
      case "bounce":
        return "bounced";
      case "dropped":
        return "dropped";
      case "deferred":
        return "deferred";
      case "spamreport":
        return "complaint";
      default:
        return sgEvent;
    }
  }
}
