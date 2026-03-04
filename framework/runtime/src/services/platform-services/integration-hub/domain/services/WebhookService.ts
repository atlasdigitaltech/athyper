/**
 * Webhook Service — subscription CRUD, secret rotation, event dispatch, HMAC verification.
 */

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import type { Logger } from "../../../../../kernel/logger.js";
import type { HttpConnectorClient } from "../../connectors/http/HttpConnectorClient.js";
import type { WebhookEventRepo } from "../../persistence/WebhookEventRepo.js";
import type { WebhookSubscriptionRepo } from "../../persistence/WebhookSubscriptionRepo.js";
import type { IntegrationEndpoint } from "../models/IntegrationEndpoint.js";
import type {
  WebhookSubscription,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
} from "../models/WebhookSubscription.js";

export class WebhookService {
  constructor(
    private readonly subscriptionRepo: WebhookSubscriptionRepo,
    private readonly eventRepo: WebhookEventRepo,
    private readonly httpClient: HttpConnectorClient,
    private readonly logger: Logger,
  ) {}

  // ── Subscription CRUD ───────────────────────────────────────────────

  async createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<WebhookSubscription> {
    return this.subscriptionRepo.create(input);
  }

  async updateSubscription(
    tenantId: string,
    id: string,
    input: UpdateSubscriptionInput,
  ): Promise<void> {
    return this.subscriptionRepo.update(tenantId, id, input);
  }

  async deleteSubscription(tenantId: string, id: string): Promise<void> {
    return this.subscriptionRepo.delete(tenantId, id);
  }

  async listSubscriptions(
    tenantId: string,
    opts?: { isActive?: boolean },
  ): Promise<WebhookSubscription[]> {
    return this.subscriptionRepo.list(tenantId, opts);
  }

  async getSubscription(
    tenantId: string,
    id: string,
  ): Promise<WebhookSubscription | undefined> {
    return this.subscriptionRepo.getById(tenantId, id);
  }

  // ── Secret Rotation ─────────────────────────────────────────────────

  async rotateSecret(
    tenantId: string,
    id: string,
  ): Promise<{ newSecret: string }> {
    const newSecret = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(newSecret).digest("hex");
    await this.subscriptionRepo.updateSecretHash(tenantId, id, hash);
    this.logger.info(
      { tenantId, subscriptionId: id },
      "[int:webhook] Secret rotated",
    );
    return { newSecret };
  }

  // ── Event Dispatch ──────────────────────────────────────────────────

  async dispatchEvent(
    tenantId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const subs = await this.subscriptionRepo.findByEventType(
      tenantId,
      eventType,
    );

    this.logger.debug(
      { tenantId, eventType, subscriptionCount: subs.length },
      "[int:webhook] Dispatching event to subscriptions",
    );

    for (const sub of subs) {
      try {
        // Create event record
        const event = await this.eventRepo.create(tenantId, {
          subscriptionId: sub.id,
          eventType,
          payload,
        });

        // Sign payload with subscription secret
        const bodyStr = JSON.stringify(payload);
        const signature = WebhookService.signPayload(bodyStr, sub.secretHash);

        // Build a virtual endpoint for the HTTP client
        const virtualEndpoint: IntegrationEndpoint = {
          id: sub.id,
          tenantId,
          code: `webhook:${sub.code}`,
          name: sub.name,
          description: null,
          url: sub.endpointUrl,
          httpMethod: "POST",
          authType: "NONE",
          authConfig: {},
          defaultHeaders: {
            "X-Webhook-Event": eventType,
            "X-Webhook-Signature-256": `sha256=${signature}`,
            "X-Webhook-Id": event.id,
          },
          timeoutMs: 30_000,
          retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
          rateLimitConfig: null,
          isActive: true,
          createdAt: new Date(),
          createdBy: "system",
          updatedAt: null,
          updatedBy: null,
        };

        const response = await this.httpClient.execute(virtualEndpoint, {
          body: payload,
        });

        if (response.status >= 200 && response.status < 300) {
          await this.eventRepo.markProcessed(tenantId, event.id);
        } else {
          await this.eventRepo.updateStatus(
            tenantId,
            event.id,
            "failed",
            `HTTP ${response.status}`,
          );
        }

        await this.subscriptionRepo.touchLastTriggered(tenantId, sub.id);
      } catch (err) {
        this.logger.error(
          { error: String(err), subscriptionId: sub.id, eventType },
          "[int:webhook] Failed to dispatch to subscription",
        );
      }
    }
  }

  // ── HMAC Verification ───────────────────────────────────────────────

  /**
   * Verify an inbound webhook signature using HMAC-SHA256.
   * Constant-time comparison to prevent timing attacks.
   */
  static verifySignature(
    payload: string,
    signature: string,
    secret: string,
    algorithm = "sha256",
  ): boolean {
    const expected = WebhookService.signPayload(payload, secret, algorithm);
    const sigWithoutPrefix = signature.startsWith(`${algorithm}=`)
      ? signature.slice(algorithm.length + 1)
      : signature;

    try {
      const a = Buffer.from(expected, "hex");
      const b = Buffer.from(sigWithoutPrefix, "hex");
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /**
   * Sign a payload string with HMAC-SHA256.
   */
  static signPayload(
    payload: string,
    secret: string,
    algorithm = "sha256",
  ): string {
    return createHmac(algorithm, secret).update(payload, "utf8").digest("hex");
  }
}
