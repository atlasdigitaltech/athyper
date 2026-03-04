/**
 * NotificationPreferenceRepo — Wraps existing ui.notification_preference table.
 *
 * MVP uses the existing table. Phase 2 migrates to core.notification_preference
 * with scope hierarchy (user > org > tenant).
 */

import type {
  NotificationPreference,
  UpsertPreferenceInput,
} from "../domain/models/NotificationPreference.js";
import type { ChannelCode } from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "ui.notification_preference" as keyof DB & string;

export class NotificationPreferenceRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async getForUser(
    tenantId: string,
    principalId: string,
  ): Promise<NotificationPreference[]> {
    const rows = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("principal_id", "=", principalId)
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  async getForUserByEvent(
    tenantId: string,
    principalId: string,
    eventCode: string,
  ): Promise<NotificationPreference[]> {
    const rows = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("principal_id", "=", principalId)
      .where("event_code", "=", eventCode)
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  /**
   * Check if a user has a specific channel enabled for an event.
   * Returns true if no preference exists (default = enabled).
   */
  async isEnabled(
    tenantId: string,
    principalId: string,
    eventCode: string,
    channel: ChannelCode,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .select(["is_enabled"])
      .where("tenant_id", "=", tenantId)
      .where("principal_id", "=", principalId)
      .where("event_code", "=", eventCode)
      .where("channel", "=", channel)
      .executeTakeFirst();

    // No preference record means enabled by default
    if (!row) return true;
    return (row as any).is_enabled;
  }

  async upsert(input: UpsertPreferenceInput): Promise<void> {
    const now = new Date();

    await this.db
      .insertInto(TABLE as any)
      .values({
        id: crypto.randomUUID(),
        tenant_id: input.tenantId,
        principal_id: input.principalId,
        event_code: input.eventCode,
        channel: input.channel,
        is_enabled: input.isEnabled,
        frequency: input.frequency ?? "immediate",
        quiet_hours: input.quietHours ? JSON.stringify(input.quietHours) : null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        created_at: now,
        created_by: input.createdBy,
      })
      .onConflict((oc: any) =>
        oc.columns(["principal_id", "event_code", "channel"]).doUpdateSet({
          is_enabled: input.isEnabled,
          frequency: input.frequency ?? "immediate",
          quiet_hours: input.quietHours
            ? JSON.stringify(input.quietHours)
            : null,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
          updated_at: now,
          updated_by: input.createdBy,
        }),
      )
      .execute();
  }

  async bulkUpsert(inputs: UpsertPreferenceInput[]): Promise<void> {
    if (inputs.length === 0) return;

    // Process one at a time to use onConflict
    for (const input of inputs) {
      await this.upsert(input);
    }
  }

  async deleteForUser(tenantId: string, principalId: string): Promise<void> {
    await this.db
      .deleteFrom(TABLE as any)
      .where("tenant_id", "=", tenantId)
      .where("principal_id", "=", principalId)
      .execute();
  }

  private mapRow(row: any): NotificationPreference {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      principalId: row.principal_id,
      eventCode: row.event_code,
      channel: row.channel,
      isEnabled: row.is_enabled,
      frequency: row.frequency,
      quietHours: this.parseJson(row.quiet_hours),
      metadata: this.parseJson(row.metadata),
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
      updatedBy: row.updated_by,
    };
  }

  private parseJson(value: unknown): any {
    if (!value) return null;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  }
}
