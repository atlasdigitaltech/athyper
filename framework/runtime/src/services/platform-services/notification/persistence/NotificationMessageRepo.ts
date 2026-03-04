/**
 * NotificationMessageRepo — Kysely repo for notify.message
 */

import type {
  NotificationMessage,
  CreateMessageInput,
  UpdateMessageInput,
} from "../domain/models/NotificationMessage.js";
import type { MessageId, MessageStatus } from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "notify.message" as keyof DB & string;

export class NotificationMessageRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(
    tenantId: string,
    id: MessageId,
  ): Promise<NotificationMessage | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? this.mapRow(row) : undefined;
  }

  async list(
    tenantId: string,
    options?: {
      status?: MessageStatus | MessageStatus[];
      eventCode?: string;
      entityType?: string;
      entityId?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<NotificationMessage[]> {
    let query = this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId);

    if (options?.status) {
      const statuses = Array.isArray(options.status)
        ? options.status
        : [options.status];
      query = query.where("status", "in", statuses);
    }
    if (options?.eventCode) {
      query = query.where("event_code", "=", options.eventCode);
    }
    if (options?.entityType) {
      query = query.where("entity_type", "=", options.entityType);
    }
    if (options?.entityId) {
      query = query.where("entity_id", "=", options.entityId);
    }

    query = query.orderBy("created_at", "desc");

    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    query = query.limit(limit).offset(offset);

    const rows = await query.execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  async create(input: CreateMessageInput): Promise<NotificationMessage> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto(TABLE as any)
      .values({
        id,
        tenant_id: input.tenantId,
        event_id: input.eventId,
        event_code: input.eventCode,
        rule_id: input.ruleId,
        template_key: input.templateKey,
        template_version: input.templateVersion,
        subject: input.subject,
        payload: JSON.stringify(input.payload),
        priority: input.priority,
        status: "pending",
        recipient_count: input.recipientCount,
        delivered_count: 0,
        failed_count: 0,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        correlation_id: input.correlationId ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        created_at: now,
        expires_at: input.expiresAt ?? null,
      })
      .execute();

    return {
      id: id as MessageId,
      tenantId: input.tenantId,
      eventId: input.eventId,
      eventCode: input.eventCode,
      ruleId: input.ruleId,
      templateKey: input.templateKey,
      templateVersion: input.templateVersion,
      subject: input.subject,
      payload: input.payload,
      priority: input.priority,
      status: "pending",
      recipientCount: input.recipientCount,
      deliveredCount: 0,
      failedCount: 0,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      correlationId: input.correlationId ?? null,
      metadata: input.metadata ?? null,
      createdAt: now,
      completedAt: null,
      expiresAt: input.expiresAt ?? null,
    };
  }

  async update(
    tenantId: string,
    id: MessageId,
    input: UpdateMessageInput,
  ): Promise<void> {
    const data: Record<string, unknown> = {};

    if (input.status !== undefined) data.status = input.status;
    if (input.deliveredCount !== undefined)
      data.delivered_count = input.deliveredCount;
    if (input.failedCount !== undefined) data.failed_count = input.failedCount;
    if (input.completedAt !== undefined) data.completed_at = input.completedAt;
    if (input.metadata !== undefined)
      data.metadata = JSON.stringify(input.metadata);

    if (Object.keys(data).length === 0) return;

    await this.db
      .updateTable(TABLE as any)
      .set(data)
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();
  }

  async incrementDeliveredCount(
    tenantId: string,
    id: MessageId,
  ): Promise<void> {
    await this.db
      .updateTable(TABLE as any)
      .set((eb: any) => ({
        delivered_count: eb("delivered_count", "+", 1),
      }))
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();
  }

  async incrementFailedCount(tenantId: string, id: MessageId): Promise<void> {
    await this.db
      .updateTable(TABLE as any)
      .set((eb: any) => ({
        failed_count: eb("failed_count", "+", 1),
      }))
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();
  }

  async countByStatus(tenantId: string): Promise<Record<string, number>> {
    const results = await this.db
      .selectFrom(TABLE as any)
      .select(["status"])
      .select((eb: any) => eb.fn.count("id").as("count"))
      .where("tenant_id", "=", tenantId)
      .groupBy("status")
      .execute();

    const counts: Record<string, number> = {};
    for (const row of results as any[]) {
      counts[row.status] = Number(row.count);
    }
    return counts;
  }

  async getByEventId(
    tenantId: string,
    eventId: string,
  ): Promise<NotificationMessage | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("event_id", "=", eventId)
      .executeTakeFirst();

    return row ? this.mapRow(row) : undefined;
  }

  private mapRow(row: any): NotificationMessage {
    return {
      id: row.id as MessageId,
      tenantId: row.tenant_id,
      eventId: row.event_id,
      eventCode: row.event_code,
      ruleId: row.rule_id,
      templateKey: row.template_key,
      templateVersion: row.template_version,
      subject: row.subject,
      payload: this.parseJson(row.payload) ?? {},
      priority: row.priority,
      status: row.status,
      recipientCount: row.recipient_count,
      deliveredCount: row.delivered_count,
      failedCount: row.failed_count,
      entityType: row.entity_type,
      entityId: row.entity_id,
      correlationId: row.correlation_id,
      metadata: this.parseJson(row.metadata),
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
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
