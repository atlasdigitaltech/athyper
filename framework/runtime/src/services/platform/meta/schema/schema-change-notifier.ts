/**
 * Schema Change Notifier
 *
 * Redis pub/sub wrapper for notifying runtime consumers
 * when entity schemas are published or DDL changes are applied.
 *
 * Channel: schema:changed
 * Payload: { entityName, version, tenantId, timestamp }
 */

import type { Redis } from "ioredis";

const CHANNEL = "schema:changed";

export type SchemaChangeEvent = {
  entityName: string;
  version: string;
  tenantId: string;
  ddlApplied: boolean;
  timestamp: string;
};

export type SchemaChangeHandler = (event: SchemaChangeEvent) => void;

export class SchemaChangeNotifier {
  constructor(private readonly redis: Redis) {}

  /**
   * Publish a schema change event.
   * Called after a successful entity publish + optional DDL apply.
   */
  async notify(
    entityName: string,
    version: string,
    tenantId: string,
    ddlApplied: boolean,
  ): Promise<void> {
    const event: SchemaChangeEvent = {
      entityName,
      version,
      tenantId,
      ddlApplied,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.redis.publish(CHANNEL, JSON.stringify(event));
      console.log(
        JSON.stringify({
          msg: "schema_change_notified",
          channel: CHANNEL,
          entityName,
          version,
          tenantId,
        }),
      );
    } catch (error) {
      // Best-effort — don't fail the publish pipeline for a notification error
      console.error(
        JSON.stringify({
          msg: "schema_change_notify_error",
          channel: CHANNEL,
          entityName,
          error: String(error),
        }),
      );
    }
  }

  /**
   * Subscribe to schema change events.
   * Returns an unsubscribe function.
   *
   * IMPORTANT: The caller must provide a *dedicated* Redis connection
   * for subscriptions (ioredis enters subscriber mode on the connection).
   */
  async subscribe(
    subscriberRedis: Redis,
    handler: SchemaChangeHandler,
  ): Promise<() => Promise<void>> {
    await subscriberRedis.subscribe(CHANNEL);

    const listener = (_channel: string, message: string) => {
      try {
        const event = JSON.parse(message) as SchemaChangeEvent;
        handler(event);
      } catch {
        console.error(
          JSON.stringify({
            msg: "schema_change_parse_error",
            raw: message,
          }),
        );
      }
    };

    subscriberRedis.on("message", listener);

    return async () => {
      subscriberRedis.off("message", listener);
      await subscriberRedis.unsubscribe(CHANNEL);
    };
  }
}
