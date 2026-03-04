/**
 * DeduplicationService — Prevent duplicate notifications within a time window.
 *
 * Uses Redis SET with TTL to track recently sent notification keys.
 * Key format: "notify:dedup:{tenantId}:{eventType}:{recipientId}:{channel}"
 *
 * If a key already exists in Redis, the notification is a duplicate and should be skipped.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type Redis from "ioredis";

const KEY_PREFIX = "notify:dedup:";

export class DeduplicationService {
  constructor(
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Check if a notification is a duplicate.
   * If not, mark it as sent (set the dedup key with TTL).
   *
   * @returns true if this is a duplicate (skip delivery), false if it's new (proceed)
   */
  async isDuplicate(
    tenantId: string,
    eventType: string,
    recipientId: string,
    channel: string,
    dedupWindowMs: number,
  ): Promise<boolean> {
    if (dedupWindowMs <= 0) return false;

    const key = this.buildKey(tenantId, eventType, recipientId, channel);
    const ttlSeconds = Math.ceil(dedupWindowMs / 1000);

    try {
      // SET key value NX EX ttl — only sets if key doesn't exist
      const result = await this.redis.set(key, "1", "EX", ttlSeconds, "NX");

      if (result === null) {
        // Key already existed — this is a duplicate
        this.logger.debug(
          { tenantId, eventType, recipientId, channel },
          "[notify:dedup] Duplicate notification suppressed",
        );
        return true;
      }

      // Key was set — this is new
      return false;
    } catch (err) {
      // Redis failure should not block notifications — log and allow through
      this.logger.warn(
        { error: String(err) },
        "[notify:dedup] Redis error during dedup check — allowing through",
      );
      return false;
    }
  }

  /**
   * Check if a notification would be a duplicate (read-only, no side effects).
   */
  async wouldBeDuplicate(
    tenantId: string,
    eventType: string,
    recipientId: string,
    channel: string,
  ): Promise<boolean> {
    const key = this.buildKey(tenantId, eventType, recipientId, channel);

    try {
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch {
      return false;
    }
  }

  /**
   * Clear a dedup key (e.g., for manual replay).
   */
  async clear(
    tenantId: string,
    eventType: string,
    recipientId: string,
    channel: string,
  ): Promise<void> {
    const key = this.buildKey(tenantId, eventType, recipientId, channel);
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn(
        { error: String(err) },
        "[notify:dedup] Redis error during dedup clear",
      );
    }
  }

  private buildKey(
    tenantId: string,
    eventType: string,
    recipientId: string,
    channel: string,
  ): string {
    return `${KEY_PREFIX}${tenantId}:${eventType}:${recipientId}:${channel}`;
  }
}
