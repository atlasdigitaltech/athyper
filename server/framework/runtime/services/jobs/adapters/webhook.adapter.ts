/**
 * Webhook Channel Adapter
 *
 * Delivers notification events via HTTP POST to a tenant-registered webhook
 * endpoint. Payload is signed with HMAC-SHA256 using the subscription's
 * signing_secret (stored in event.webhook_subscription).
 *
 * The recipient_addr for webhook deliveries is the target URL.
 * The signing_secret must be embedded in the payload by the wf-outbox
 * handler before creating the notification_message row, or resolved here
 * from the payload.webhook_signing_secret field.
 *
 * Response tracking:
 *   - externalId is set to the response status code as a string
 *   - Non-2xx responses throw so the worker marks the delivery failed
 */

import crypto from "crypto";
import type { NotificationChannelHandler } from "../workers/notification.worker.js";

export function createWebhookAdapter(): NotificationChannelHandler {
  return {
    async send(opts) {
      const { recipientAddr, templateKey, subject, payload } = opts;

      const signingSecret =
        typeof payload["webhook_signing_secret"] === "string"
          ? payload["webhook_signing_secret"]
          : null;

      const body = JSON.stringify({
        template_key: templateKey,
        subject:      subject,
        payload:      payload,
        timestamp:    Date.now(),
      });

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent":   "Athyper-Webhook/1.0",
      };

      if (signingSecret) {
        const sig = crypto
          .createHmac("sha256", signingSecret)
          .update(body)
          .digest("hex");
        headers["X-Athyper-Signature"] = `sha256=${sig}`;
      }

      const response = await fetch(recipientAddr, {
        method:  "POST",
        headers,
        body,
        signal:  AbortSignal.timeout(10_000), // 10 s timeout
      });

      if (!response.ok) {
        throw new Error(`Webhook delivery failed: HTTP ${response.status} from ${recipientAddr}`);
      }

      return { externalId: String(response.status) };
    },

    async healthCheck() {
      // Webhook adapters are stateless — no persistent connection to verify.
      return "healthy";
    },
  };
}
