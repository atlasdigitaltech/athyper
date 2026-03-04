/**
 * Persistence — append + query for wf.webhook_event.
 */

import { sql } from "kysely";

import type { WebhookEvent } from "../domain/models/WebhookSubscription.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "wf.webhook_event" as keyof DB & string;

export class WebhookEventRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async create(
    tenantId: string,
    input: {
      subscriptionId: string;
      eventType: string;
      payload: Record<string, unknown>;
    },
  ): Promise<WebhookEvent> {
    const row = await (this.db as any)
      .insertInto(TABLE)
      .values({
        tenant_id: tenantId,
        subscription_id: input.subscriptionId,
        event_type: input.eventType,
        payload: JSON.stringify(input.payload),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(row);
  }

  async list(
    tenantId: string,
    opts?: {
      subscriptionId?: string;
      status?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<WebhookEvent[]> {
    let q = (this.db as any)
      .selectFrom(TABLE)
      .selectAll()
      .where("tenant_id", "=", tenantId);

    if (opts?.subscriptionId)
      q = q.where("subscription_id", "=", opts.subscriptionId);
    if (opts?.status) q = q.where("status", "=", opts.status);
    q = q.orderBy("created_at", "desc");
    if (opts?.limit) q = q.limit(opts.limit);
    if (opts?.offset) q = q.offset(opts.offset);

    const rows = await q.execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: string,
    error?: string,
  ): Promise<void> {
    const values: Record<string, unknown> = {
      status,
      attempts: sql`attempts + 1`,
    };
    if (error) values.last_error = error;
    if (status === "delivered") values.processed_at = new Date();

    await (this.db as any)
      .updateTable(TABLE)
      .set(values)
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();
  }

  async markProcessed(tenantId: string, id: string): Promise<void> {
    await (this.db as any)
      .updateTable(TABLE)
      .set({ status: "delivered", processed_at: new Date() })
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();
  }

  async claimPending(limit: number, lockedBy: string): Promise<WebhookEvent[]> {
    // Use raw SQL for SELECT FOR UPDATE SKIP LOCKED
    const result = await sql`
            UPDATE ${sql.table(TABLE)}
            SET status = 'processing', attempts = attempts + 1
            WHERE id IN (
                SELECT id FROM ${sql.table(TABLE)}
                WHERE status IN ('pending', 'failed')
                  AND attempts < 5
                ORDER BY created_at ASC
                LIMIT ${limit}
                FOR UPDATE SKIP LOCKED
            )
            RETURNING *
        `.execute(this.db);

    return (result.rows as any[]).map((r: any) => this.mapRow(r));
  }

  private mapRow(row: any): WebhookEvent {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      subscriptionId: row.subscription_id,
      eventType: row.event_type,
      payload: this.parseJson(row.payload) ?? {},
      status: row.status,
      attempts: row.attempts,
      lastError: row.last_error ?? null,
      processedAt: row.processed_at ? new Date(row.processed_at) : null,
      createdAt: new Date(row.created_at),
    };
  }

  private parseJson(value: unknown): Record<string, unknown> | null {
    if (value == null) return null;
    if (typeof value === "object") return value as Record<string, unknown>;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return null;
  }
}
