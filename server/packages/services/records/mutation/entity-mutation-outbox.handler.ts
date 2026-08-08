import type { OutboxTopicHandler } from "@athyper/svc-jobs";

export interface EntityMutationOutboxHandlerDeps {
  redis: {
    incr(key: string): Promise<number>;
    publish(channel: string, payload: string): Promise<unknown>;
    /** Returns true when the stable event key was already completed. */
    isProcessed?(key: string): Promise<boolean>;
    /** Records a completed stable event key after fan-out succeeds. */
    markProcessed?(key: string, ttlSeconds: number): Promise<void>;
  };
  search?: OutboxTopicHandler;
}

/**
 * Idempotent fan-out for the mutation kernel's single durable envelope.
 * BullMQ is at-least-once. The durable event key is therefore used as the
 * consumer idempotency key; a retry after successful fan-out is a no-op.
 */
export function createEntityMutationOutboxHandler(
  deps: EntityMutationOutboxHandlerDeps,
): OutboxTopicHandler {
  return {
    async handle(event) {
      if (!event.entity_type || !event.entity_id) return;
      const processedKey = event.event_key
        ? `outbox:processed:v1:${event.topic}:${event.event_key}`
        : undefined;
      if (processedKey && deps.redis.isProcessed) {
        // Claim only after fan-out below succeeds. A failed attempt must stay
        // retryable rather than leaving a permanent dedupe marker behind.
        const alreadyProcessed = await deps.redis.isProcessed(processedKey);
        if (alreadyProcessed) return;
      }
      await deps.redis.incr(`listver:${event.tenant_id}:${event.entity_type}`);
      await deps.redis.publish(`record:${event.tenant_id}:${event.entity_type}:${event.entity_id}`, JSON.stringify({
        eventType: event.event_type?.endsWith(".deleted") ? "record.deleted" : "record.updated",
        createdAt: event.created_at.toISOString(),
        data: { id: event.entity_id, actorId: event.actor_id, outboxEventKey: event.event_key },
      }));
      if (deps.search) await deps.search.handle({ ...event, topic: "search" });
      if (processedKey && deps.redis.markProcessed) {
        await deps.redis.markProcessed(processedKey, 7 * 24 * 60 * 60);
      }
    },
  };
}
