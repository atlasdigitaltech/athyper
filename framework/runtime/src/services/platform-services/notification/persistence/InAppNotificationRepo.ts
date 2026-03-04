/**
 * InAppNotificationRepo — Kysely repo for the notify.notification table.
 *
 * This repo is used by the InAppAdapter to write in-app notifications
 * and by the inbox controller for user-facing queries.
 */

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

export interface InAppNotification {
  id: string;
  tenantId: string;
  recipientId: string;
  senderId: string | null;
  channel: string;
  category: string | null;
  priority: string;
  title: string;
  body: string | null;
  icon: string | null;
  actionUrl: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  readAt: Date | null;
  isDismissed: boolean;
  dismissedAt: Date | null;
  expiresAt: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  createdByPrincipalId: string | null;
  createdByService: string | null;
}

export interface CreateInAppInput {
  tenantId: string;
  recipientId: string;
  senderId?: string;
  channel?: string;
  category?: string;
  priority?: string;
  title: string;
  body?: string;
  icon?: string;
  actionUrl?: string;
  entityType?: string;
  entityId?: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
  createdByPrincipalId?: string;
  createdByService?: string;
}

const TABLE = "notify.notification" as keyof DB & string;

export class InAppNotificationRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(
    tenantId: string,
    id: string,
  ): Promise<InAppNotification | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? this.mapRow(row) : undefined;
  }

  async listForRecipient(
    tenantId: string,
    recipientId: string,
    options?: {
      unreadOnly?: boolean;
      category?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<InAppNotification[]> {
    let query = this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("recipient_id", "=", recipientId)
      .where("is_dismissed", "=", false);

    if (options?.unreadOnly) {
      query = query.where("is_read", "=", false);
    }
    if (options?.category) {
      query = query.where("category", "=", options.category);
    }

    query = query.orderBy("created_at", "desc");
    query = query.limit(options?.limit ?? 50).offset(options?.offset ?? 0);

    const rows = await query.execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  async unreadCount(tenantId: string, recipientId: string): Promise<number> {
    const result = await this.db
      .selectFrom(TABLE as any)
      .select((eb: any) => eb.fn.count("id").as("count"))
      .where("tenant_id", "=", tenantId)
      .where("recipient_id", "=", recipientId)
      .where("is_read", "=", false)
      .where("is_dismissed", "=", false)
      .executeTakeFirst();

    return Number((result as any)?.count ?? 0);
  }

  async create(input: CreateInAppInput): Promise<InAppNotification> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto(TABLE as any)
      .values({
        id,
        tenant_id: input.tenantId,
        recipient_id: input.recipientId,
        sender_id: input.senderId ?? null,
        channel: input.channel ?? "in_app",
        category: input.category ?? null,
        priority: input.priority ?? "normal",
        title: input.title,
        body: input.body ?? null,
        icon: input.icon ?? null,
        action_url: input.actionUrl ?? null,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        is_read: false,
        is_dismissed: false,
        expires_at: input.expiresAt ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        created_at: now,
        created_by_principal_id: input.createdByPrincipalId ?? null,
        created_by_service: input.createdByService ?? null,
      })
      .execute();

    return {
      id,
      tenantId: input.tenantId,
      recipientId: input.recipientId,
      senderId: input.senderId ?? null,
      channel: input.channel ?? "in_app",
      category: input.category ?? null,
      priority: input.priority ?? "normal",
      title: input.title,
      body: input.body ?? null,
      icon: input.icon ?? null,
      actionUrl: input.actionUrl ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      isRead: false,
      readAt: null,
      isDismissed: false,
      dismissedAt: null,
      expiresAt: input.expiresAt ?? null,
      metadata: input.metadata ?? null,
      createdAt: now,
      createdByPrincipalId: input.createdByPrincipalId ?? null,
      createdByService: input.createdByService ?? null,
    };
  }

  async markAsRead(tenantId: string, id: string): Promise<void> {
    await this.db
      .updateTable(TABLE as any)
      .set({ is_read: true, read_at: new Date() })
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();
  }

  async markAllAsRead(tenantId: string, recipientId: string): Promise<void> {
    await this.db
      .updateTable(TABLE as any)
      .set({ is_read: true, read_at: new Date() })
      .where("tenant_id", "=", tenantId)
      .where("recipient_id", "=", recipientId)
      .where("is_read", "=", false)
      .execute();
  }

  async dismiss(tenantId: string, id: string): Promise<void> {
    await this.db
      .updateTable(TABLE as any)
      .set({ is_dismissed: true, dismissed_at: new Date() })
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();
  }

  private mapRow(row: any): InAppNotification {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      recipientId: row.recipient_id,
      senderId: row.sender_id,
      channel: row.channel,
      category: row.category,
      priority: row.priority,
      title: row.title,
      body: row.body,
      icon: row.icon,
      actionUrl: row.action_url,
      entityType: row.entity_type,
      entityId: row.entity_id,
      isRead: row.is_read,
      readAt: row.read_at ? new Date(row.read_at) : null,
      isDismissed: row.is_dismissed,
      dismissedAt: row.dismissed_at ? new Date(row.dismissed_at) : null,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      metadata: this.parseJson(row.metadata),
      createdAt: new Date(row.created_at),
      createdByPrincipalId: row.created_by_principal_id ?? null,
      createdByService: row.created_by_service ?? null,
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
