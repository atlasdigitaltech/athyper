/**
 * Delivery Scheduler — polls outbox, executes deliveries, respects rate limits.
 */

import {
  computeNextRetryAt,
  DEFAULT_DELIVERY_POLICY,
} from "../models/DeliveryPolicy.js";

import type { IntegrationRateLimiter } from "./RateLimiter.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { HttpConnectorClient } from "../../connectors/http/HttpConnectorClient.js";
import type { IntegrationMetrics } from "../../observability/metrics.js";
import type { EndpointRepo } from "../../persistence/EndpointRepo.js";
import type { OutboxRepo } from "../../persistence/OutboxRepo.js";

export class DeliveryScheduler {
  private batchSize: number;
  private workerId: string;

  constructor(
    private readonly outboxRepo: OutboxRepo,
    private readonly httpClient: HttpConnectorClient,
    private readonly endpointRepo: EndpointRepo,
    private readonly rateLimiter: IntegrationRateLimiter | null,
    private readonly metrics: IntegrationMetrics | null,
    private readonly logger: Logger,
    config?: { batchSize?: number },
  ) {
    this.batchSize = config?.batchSize ?? 10;
    this.workerId = `scheduler-${process.pid}-${Date.now()}`;
  }

  /**
   * Poll outbox and deliver pending items. Returns count processed.
   * Called by the deliverOutboxItem worker on a schedule.
   */
  async pollAndDeliver(): Promise<number> {
    const items = await this.outboxRepo.claimPending(
      this.batchSize,
      this.workerId,
    );

    if (items.length === 0) return 0;

    this.logger.debug(
      { count: items.length },
      "[int:scheduler] Claimed outbox items",
    );

    let processed = 0;
    for (const item of items) {
      try {
        // Resolve endpoint if referenced
        const endpoint = item.endpointId
          ? await this.endpointRepo.getById(item.tenantId, item.endpointId)
          : undefined;

        if (!endpoint) {
          await this.outboxRepo.markDead(
            item.tenantId,
            item.id,
            "No endpoint configured",
          );
          this.metrics?.outboxItemDead({
            tenant: item.tenantId,
            eventType: item.eventType,
          });
          continue;
        }

        // Check rate limit
        if (this.rateLimiter && endpoint.rateLimitConfig) {
          const check = await this.rateLimiter.checkAndConsume(
            item.tenantId,
            endpoint.id,
            endpoint.rateLimitConfig,
          );

          if (!check.allowed) {
            const nextRetry = new Date(
              Date.now() + (check.retryAfterMs ?? 1000),
            );
            await this.outboxRepo.markFailed(
              item.tenantId,
              item.id,
              "Rate limited",
              nextRetry,
            );
            this.metrics?.rateLimitHit({
              tenant: item.tenantId,
              endpoint: endpoint.code,
            });
            continue;
          }
        }

        // Execute delivery
        this.metrics?.deliveryAttempted({
          tenant: item.tenantId,
          endpoint: endpoint.code,
        });
        const response = await this.httpClient.execute(
          endpoint,
          { body: item.payload },
          item.id,
        );

        if (response.status >= 200 && response.status < 300) {
          await this.outboxRepo.markCompleted(item.tenantId, item.id);
          this.metrics?.deliverySucceeded({
            tenant: item.tenantId,
            endpoint: endpoint.code,
            statusCode: String(response.status),
          });
          this.metrics?.outboxItemCompleted({
            tenant: item.tenantId,
            eventType: item.eventType,
          });
        } else {
          const nextRetry = computeNextRetryAt(
            item.retryCount,
            DEFAULT_DELIVERY_POLICY,
          );
          await this.outboxRepo.markFailed(
            item.tenantId,
            item.id,
            `HTTP ${response.status}`,
            nextRetry,
          );
          this.metrics?.deliveryFailed({
            tenant: item.tenantId,
            endpoint: endpoint.code,
            errorCategory: `http_${response.status}`,
          });
        }

        this.metrics?.deliveryDuration(response.durationMs, {
          tenant: item.tenantId,
          endpoint: endpoint.code,
        });
        processed++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          { error: errorMsg, outboxItemId: item.id },
          "[int:scheduler] Delivery error",
        );

        try {
          const nextRetry = computeNextRetryAt(
            item.retryCount,
            DEFAULT_DELIVERY_POLICY,
          );
          await this.outboxRepo.markFailed(
            item.tenantId,
            item.id,
            errorMsg,
            nextRetry,
          );
        } catch (markErr) {
          this.logger.error(
            { error: String(markErr) },
            "[int:scheduler] Failed to mark item as failed",
          );
        }
      }
    }

    return processed;
  }
}
