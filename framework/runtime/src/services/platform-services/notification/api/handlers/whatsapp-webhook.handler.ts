/**
 * WhatsApp Webhook Handler — Receives Meta webhook verification and status updates.
 *
 * Handles:
 * - GET: Meta webhook verification challenge
 * - POST: Status updates (sent, delivered, read, failed) and incoming messages
 */

import type { ProcessCallbackPayload } from "../../domain/services/NotificationOrchestrator.js";
import type { WhatsAppConsentRepo } from "../../persistence/WhatsAppConsentRepo.js";
import type { JobQueue, JobData, JobOptions } from "@athyper/core";

interface HandlerContext {
  container: { resolve<T>(token: string): Promise<T> };
  tenant: { tenantId: string };
  auth: { userId?: string };
}

interface Request {
  method: string;
  query: Record<string, string | undefined>;
  body: unknown;
}

interface Response {
  status(code: number): Response;
  json(data: unknown): void;
  send(data: string): void;
}

const CONSENT_REPO_TOKEN = "notify.repo.whatsappConsent";
const JOB_QUEUE_TOKEN = "runtime.jobQueue";

interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
          errors?: Array<{ code: number; title: string }>;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
        }>;
      };
    }>;
  }>;
}

export class WhatsAppWebhookHandler {
  private verifyToken: string;

  constructor(verifyToken?: string) {
    this.verifyToken =
      verifyToken ?? process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "";
  }

  async handle(
    req: Request,
    res: Response,
    ctx: HandlerContext,
  ): Promise<void> {
    // Meta webhook verification (GET)
    if (req.method === "GET") {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      if (mode === "subscribe" && token === this.verifyToken) {
        res.status(200).send(challenge ?? "");
      } else {
        res.status(403).json({ error: "Verification failed" });
      }
      return;
    }

    // Status updates (POST)
    const body = req.body as WhatsAppWebhookPayload;
    if (body.object !== "whatsapp_business_account") {
      res.status(200).json({ received: true });
      return;
    }

    const consentRepo =
      await ctx.container.resolve<WhatsAppConsentRepo>(CONSENT_REPO_TOKEN);
    const jobQueue = await ctx.container.resolve<JobQueue>(JOB_QUEUE_TOKEN);
    const tenantId = ctx.tenant.tenantId;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        // Process status updates
        if (value.statuses) {
          for (const status of value.statuses) {
            // Enqueue callback processing
            const callbackPayload: ProcessCallbackPayload = {
              provider: "meta_cloud_api",
              externalId: status.id,
              eventType: status.status,
              timestamp: new Date(
                parseInt(status.timestamp, 10) * 1000,
              ).toISOString(),
              rawPayload: {
                recipientId: status.recipient_id,
                errors: status.errors,
              },
            };

            const jobData: JobData<ProcessCallbackPayload> = {
              type: "process-callback",
              payload: callbackPayload,
            };

            await jobQueue.add(jobData, {
              priority: "normal",
              attempts: 3,
              backoff: { type: "exponential", delay: 1000 },
              removeOnComplete: true,
            } as JobOptions);
          }
        }

        // Process incoming messages — update conversation window
        if (value.messages) {
          for (const msg of value.messages) {
            const windowStart = new Date();
            const windowEnd = new Date(
              windowStart.getTime() + 24 * 60 * 60 * 1000,
            );

            await consentRepo.updateConversationWindow(
              tenantId,
              msg.from,
              windowStart,
              windowEnd,
            );
          }
        }
      }
    }

    res.status(200).json({ received: true });
  }
}
