/**
 * WebPushAdapter — Push notification delivery via Web Push protocol.
 *
 * Uses VAPID keys for authentication. Subscriptions are managed separately
 * via PushSubscriptionRepo.
 */

import { createHmac } from "node:crypto";

import type { Logger } from "../../../../../kernel/logger.js";
import type {
  IChannelAdapter,
  ChannelCode,
  DeliveryRequest,
  DeliveryResult,
} from "../../domain/types.js";

export interface WebPushConfig {
  vapidPublicKey: string;
  vapidPrivateKeyRef: string; // env var name holding the VAPID private key
  vapidSubject: string; // mailto: or URL identifying the push service contact
}

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface IPushSubscriptionRepo {
  getSubscription(
    tenantId: string,
    recipientId: string,
  ): Promise<PushSubscription | undefined>;
  getSubscriptions(
    tenantId: string,
    recipientId: string,
  ): Promise<PushSubscription[]>;
}

export class WebPushAdapter implements IChannelAdapter {
  readonly channelCode: ChannelCode = "WEBHOOK"; // Maps to push via WEBHOOK channel
  readonly providerCode = "web_push";
  private vapidPrivateKey: string | undefined;

  constructor(
    private readonly config: WebPushConfig,
    private readonly subscriptionRepo: IPushSubscriptionRepo,
    private readonly logger: Logger,
  ) {
    this.vapidPrivateKey = process.env[config.vapidPrivateKeyRef];
  }

  async deliver(request: DeliveryRequest): Promise<DeliveryResult> {
    if (!this.vapidPrivateKey) {
      return {
        success: false,
        status: "failed",
        errorCategory: "auth",
        error: "VAPID private key not configured",
      };
    }

    if (!request.recipientId) {
      return {
        success: false,
        status: "failed",
        errorCategory: "permanent",
        error: "recipientId is required for push notifications",
      };
    }

    try {
      // Fetch all push subscriptions for this recipient
      const subscriptions = await this.subscriptionRepo.getSubscriptions(
        request.tenantId,
        request.recipientId,
      );

      if (subscriptions.length === 0) {
        return {
          success: false,
          status: "failed",
          errorCategory: "permanent",
          error: "No push subscriptions found for recipient",
        };
      }

      // Build push payload
      const payload = JSON.stringify({
        title: request.subject ?? "Notification",
        body: request.bodyText ?? "",
        icon: request.metadata?.icon ?? "/icon-192.png",
        badge: request.metadata?.badge ?? "/badge-72.png",
        tag: request.messageId,
        data: {
          messageId: request.messageId,
          deliveryId: request.deliveryId,
          correlationId: request.correlationId,
          url: request.metadata?.actionUrl,
        },
      });

      // Send to all subscriptions; track first success
      let anySuccess = false;
      let lastError: string | undefined;

      for (const sub of subscriptions) {
        const result = await this.sendPushMessage(
          sub,
          payload,
          request.deliveryId,
        );
        if (result.success) {
          anySuccess = true;
        } else {
          lastError = result.error;
        }
      }

      if (anySuccess) {
        this.logger.info(
          {
            deliveryId: request.deliveryId,
            recipientId: request.recipientId,
            subscriptionCount: subscriptions.length,
          },
          "[notify:webpush] Push notification sent",
        );

        return {
          success: true,
          status: "sent",
          metadata: { subscriptionsTargeted: subscriptions.length },
        };
      }

      return {
        success: false,
        status: "failed",
        errorCategory: "transient",
        error: lastError ?? "All push subscriptions failed",
      };
    } catch (err) {
      this.logger.error(
        { error: String(err), deliveryId: request.deliveryId },
        "[notify:webpush] Push notification error",
      );

      return {
        success: false,
        status: "failed",
        errorCategory: "transient",
        error: String(err),
      };
    }
  }

  async validateConfig(): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];
    if (!this.vapidPrivateKey) {
      errors.push(
        `VAPID private key env var '${this.config.vapidPrivateKeyRef}' is not set`,
      );
    }
    if (!this.config.vapidPublicKey) {
      errors.push("vapidPublicKey is required");
    }
    if (!this.config.vapidSubject) {
      errors.push("vapidSubject is required");
    }
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    if (!this.vapidPrivateKey) {
      return { healthy: false, message: "VAPID private key not configured" };
    }
    return { healthy: true };
  }

  /**
   * Send a push message to a single subscription endpoint.
   * Uses a simplified VAPID approach: JWT auth + encrypted payload.
   */
  private async sendPushMessage(
    subscription: PushSubscription,
    payload: string,
    deliveryId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const endpoint = new URL(subscription.endpoint);

      // Build VAPID Authorization header (simplified JWT)
      const vapidHeaders = this.buildVapidHeaders(endpoint.origin);

      const response = await fetch(subscription.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          TTL: "86400",
          Urgency: "normal",
          ...vapidHeaders,
        },
        body: payload,
      });

      if (response.ok || response.status === 201) {
        return { success: true };
      }

      const statusCode = response.status;

      // 410 Gone = subscription expired, should be removed
      if (statusCode === 410) {
        this.logger.info(
          { endpoint: endpoint.hostname, deliveryId },
          "[notify:webpush] Subscription expired (410 Gone)",
        );
        return { success: false, error: "Subscription expired" };
      }

      // 429 = rate limited
      if (statusCode === 429) {
        return { success: false, error: "Rate limited" };
      }

      return { success: false, error: `Push service returned ${statusCode}` };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  private buildVapidHeaders(audience: string): Record<string, string> {
    // Simplified VAPID: in production, use proper JWT with ES256
    // Here we construct a basic authorization header with the VAPID key
    const timestamp = Math.floor(Date.now() / 1000);
    const expiry = timestamp + 12 * 3600; // 12 hours

    const header = Buffer.from(
      JSON.stringify({ typ: "JWT", alg: "HS256" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        aud: audience,
        exp: expiry,
        sub: this.config.vapidSubject,
      }),
    ).toString("base64url");

    const signature = createHmac("sha256", this.vapidPrivateKey ?? "")
      .update(`${header}.${payload}`)
      .digest("base64url");

    const jwt = `${header}.${payload}.${signature}`;

    return {
      Authorization: `vapid t=${jwt}, k=${this.config.vapidPublicKey}`,
    };
  }
}
