/**
 * Event Gateway — internal pub/sub bridge for domain events -> integration triggers.
 * Routes domain events to outbox items and webhook subscriptions.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { OutboxRepo } from "../../persistence/OutboxRepo.js";
import type { WebhookEventRepo } from "../../persistence/WebhookEventRepo.js";
import type { WebhookSubscriptionRepo } from "../../persistence/WebhookSubscriptionRepo.js";

export interface DomainEvent {
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdBy: string;
}

type EventHandler = (tenantId: string, event: DomainEvent) => Promise<void>;

export class EventGateway {
  private handlers = new Map<string, Set<EventHandler>>();

  constructor(
    private readonly outboxRepo: OutboxRepo,
    private readonly webhookSubRepo: WebhookSubscriptionRepo,
    private readonly webhookEventRepo: WebhookEventRepo,
    private readonly logger: Logger,
  ) {}

  /**
   * Handle an incoming domain event:
   * 1. Enqueue as outbox item for reliable delivery
   * 2. Create webhook events for matching subscriptions
   * 3. Dispatch to in-process handlers
   */
  async handleDomainEvent(tenantId: string, event: DomainEvent): Promise<void> {
    this.logger.debug(
      {
        tenantId,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
      },
      "[int:gateway] Handling domain event",
    );

    // Create outbox item for endpoint-based delivery
    try {
      await this.outboxRepo.create({
        tenantId,
        entityType: event.entityType,
        entityId: event.entityId,
        eventType: event.eventType,
        payload: event.payload,
        createdBy: event.createdBy,
      });
    } catch (err) {
      this.logger.error(
        { error: String(err), eventType: event.eventType },
        "[int:gateway] Failed to create outbox item",
      );
    }

    // Dispatch to matching webhook subscriptions
    try {
      const subs = await this.webhookSubRepo.findByEventType(
        tenantId,
        event.eventType,
      );
      for (const sub of subs) {
        await this.webhookEventRepo.create(tenantId, {
          subscriptionId: sub.id,
          eventType: event.eventType,
          payload: event.payload,
        });
        await this.webhookSubRepo.touchLastTriggered(tenantId, sub.id);
      }
    } catch (err) {
      this.logger.error(
        { error: String(err), eventType: event.eventType },
        "[int:gateway] Failed to dispatch to webhooks",
      );
    }

    // Dispatch to in-process handlers
    const handlers = this.handlers.get(event.eventType);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(tenantId, event);
        } catch (err) {
          this.logger.error(
            { error: String(err), eventType: event.eventType },
            "[int:gateway] Handler failed",
          );
        }
      }
    }

    // Dispatch to wildcard handlers
    const wildcardHandlers = this.handlers.get("*");
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          await handler(tenantId, event);
        } catch (err) {
          this.logger.error(
            { error: String(err), eventType: event.eventType },
            "[int:gateway] Wildcard handler failed",
          );
        }
      }
    }
  }

  /**
   * Subscribe an in-process handler to an event type. Use "*" for all events.
   */
  subscribe(eventType: string, handler: EventHandler): string {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
    return `${eventType}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  }

  unsubscribe(eventType: string, handler: EventHandler): void {
    this.handlers.get(eventType)?.delete(handler);
  }
}
