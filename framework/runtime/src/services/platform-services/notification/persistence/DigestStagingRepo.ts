/**
 * DigestStagingRepo — Kysely repo for notify.digest_staging
 *
 * Stages non-immediate notifications for batch digest delivery.
 */

import type { PreferenceFrequency, ChannelCode } from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "notify.digest_staging" as keyof DB & string;

export interface DigestStagingEntry {
  id: string;
  tenantId: string;
  recipientId: string;
  channel: ChannelCode;
  frequency: PreferenceFrequency;
  messageId: string;
  eventCode: string;
  subject: string | null;
  payload: Record<string, unknown>;
  templateKey: string;
  priority: string;
  metadata: Record<string, unknown> | null;
  stagedAt: Date;
  deliveredAt: Date | null;
}

export interface StagingInput {
  tenantId: string;
  recipientId: string;
  channel: ChannelCode;
  frequency: PreferenceFrequency;
  messageId: string;
  eventCode: string;
  subject?: string;
  payload: Record<string, unknown>;
  templateKey: string;
  priority?: string;
  metadata?: Record<string, unknown>;
}

export class DigestStagingRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async stage(input: StagingInput): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto(TABLE as any)
      .values({
        id,
        tenant_id: input.tenantId,
        recipient_id: input.recipientId,
        channel: input.channel,
        frequency: input.frequency,
        message_id: input.messageId,
        event_code: input.eventCode,
        subject: input.subject ?? null,
        payload: JSON.stringify(input.payload),
        template_key: input.templateKey,
        priority: input.priority ?? "normal",
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        staged_at: now,
      })
      .execute();

    return id;
  }

  async getPending(
    frequency: PreferenceFrequency,
    limit?: number,
  ): Promise<DigestStagingEntry[]> {
    const rows = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("frequency", "=", frequency)
      .where("delivered_at", "is", null)
      .orderBy("staged_at", "asc")
      .limit(limit ?? 1000)
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  async markDelivered(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await this.db
      .updateTable(TABLE as any)
      .set({ delivered_at: new Date() })
      .where("id", "in", ids)
      .execute();
  }

  async cleanupDelivered(olderThanDays: number = 7): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const result = await this.db
      .deleteFrom(TABLE as any)
      .where("delivered_at", "is not", null)
      .where("delivered_at", "<", cutoff)
      .executeTakeFirst();

    return Number((result as any).numDeletedRows ?? 0);
  }

  private mapRow(row: any): DigestStagingEntry {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      recipientId: row.recipient_id,
      channel: row.channel,
      frequency: row.frequency,
      messageId: row.message_id,
      eventCode: row.event_code,
      subject: row.subject,
      payload: this.parseJson(row.payload) ?? {},
      templateKey: row.template_key,
      priority: row.priority,
      metadata: this.parseJson(row.metadata),
      stagedAt: new Date(row.staged_at),
      deliveredAt: row.delivered_at ? new Date(row.delivered_at) : null,
    };
  }

  private parseJson(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value as Record<string, unknown>;
  }
}
