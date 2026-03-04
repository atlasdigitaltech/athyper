/**
 * NotificationChannelRepo — Kysely repo for notify.notification_channel
 */

import type { ChannelDefId, ChannelCode } from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

export interface ChannelDef {
  id: ChannelDefId;
  code: ChannelCode;
  name: string;
  isEnabled: boolean;
  config: Record<string, unknown> | null;
  sortOrder: number;
  createdAt: Date;
  createdBy: string;
}

const TABLE = "notify.notification_channel" as keyof DB & string;

export class NotificationChannelRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async getByCode(code: ChannelCode): Promise<ChannelDef | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("code", "=", code)
      .executeTakeFirst();

    return row ? this.mapRow(row) : undefined;
  }

  async listEnabled(): Promise<ChannelDef[]> {
    const rows = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("is_enabled", "=", true)
      .orderBy("sort_order", "asc")
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  async listAll(): Promise<ChannelDef[]> {
    const rows = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .orderBy("sort_order", "asc")
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  async setEnabled(code: ChannelCode, isEnabled: boolean): Promise<void> {
    await this.db
      .updateTable(TABLE as any)
      .set({ is_enabled: isEnabled })
      .where("code", "=", code)
      .execute();
  }

  private mapRow(row: any): ChannelDef {
    return {
      id: row.id as ChannelDefId,
      code: row.code,
      name: row.name,
      isEnabled: row.is_enabled,
      config: this.parseJson(row.config),
      sortOrder: row.sort_order,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
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
