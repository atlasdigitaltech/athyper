/**
 * NotificationDeliveryRepo — Kysely repo for notify.delivery
 */

import type {
  NotificationDelivery,
  CreateDeliveryInput,
  UpdateDeliveryInput,
} from "../domain/models/NotificationDelivery.js";
import type { DeliveryId, MessageId, DeliveryStatus } from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "notify.delivery" as keyof DB & string;

export class NotificationDeliveryRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(
    tenantId: string,
    id: DeliveryId,
  ): Promise<NotificationDelivery | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? this.mapRow(row) : undefined;
  }

  async listByMessageId(
    tenantId: string,
    messageId: MessageId,
  ): Promise<NotificationDelivery[]> {
    const rows = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("message_id", "=", messageId)
      .orderBy("created_at", "asc")
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  async list(
    tenantId: string,
    options?: {
      status?: DeliveryStatus | DeliveryStatus[];
      channel?: string;
      providerCode?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<NotificationDelivery[]> {
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
    if (options?.channel) {
      query = query.where("channel", "=", options.channel);
    }
    if (options?.providerCode) {
      query = query.where("provider_code", "=", options.providerCode);
    }

    query = query.orderBy("created_at", "desc");
    query = query.limit(options?.limit ?? 100).offset(options?.offset ?? 0);

    const rows = await query.execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  async create(input: CreateDeliveryInput): Promise<NotificationDelivery> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto(TABLE as any)
      .values({
        id,
        message_id: input.messageId,
        tenant_id: input.tenantId,
        channel: input.channel,
        provider_code: input.providerCode,
        recipient_id: input.recipientId ?? null,
        recipient_addr: input.recipientAddr,
        status: "pending",
        attempt_count: 0,
        max_attempts: input.maxAttempts ?? 3,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        created_at: now,
      })
      .execute();

    return {
      id: id as DeliveryId,
      messageId: input.messageId,
      tenantId: input.tenantId,
      channel: input.channel,
      providerCode: input.providerCode,
      recipientId: input.recipientId ?? null,
      recipientAddr: input.recipientAddr,
      status: "pending",
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 3,
      lastError: null,
      errorCategory: null,
      externalId: null,
      sentAt: null,
      deliveredAt: null,
      openedAt: null,
      clickedAt: null,
      bouncedAt: null,
      metadata: input.metadata ?? null,
      createdAt: now,
      updatedAt: null,
    };
  }

  async createBatch(inputs: CreateDeliveryInput[]): Promise<DeliveryId[]> {
    if (inputs.length === 0) return [];

    const now = new Date();
    const rows = inputs.map((input) => {
      const id = crypto.randomUUID();
      return {
        id,
        message_id: input.messageId,
        tenant_id: input.tenantId,
        channel: input.channel,
        provider_code: input.providerCode,
        recipient_id: input.recipientId ?? null,
        recipient_addr: input.recipientAddr,
        status: "pending",
        attempt_count: 0,
        max_attempts: input.maxAttempts ?? 3,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        created_at: now,
      };
    });

    await this.db
      .insertInto(TABLE as any)
      .values(rows)
      .execute();

    return rows.map((r) => r.id as DeliveryId);
  }

  async update(
    tenantId: string,
    id: DeliveryId,
    input: UpdateDeliveryInput,
  ): Promise<void> {
    const data: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (input.status !== undefined) data.status = input.status;
    if (input.attemptCount !== undefined)
      data.attempt_count = input.attemptCount;
    if (input.lastError !== undefined) data.last_error = input.lastError;
    if (input.errorCategory !== undefined)
      data.error_category = input.errorCategory;
    if (input.externalId !== undefined) data.external_id = input.externalId;
    if (input.sentAt !== undefined) data.sent_at = input.sentAt;
    if (input.deliveredAt !== undefined) data.delivered_at = input.deliveredAt;
    if (input.openedAt !== undefined) data.opened_at = input.openedAt;
    if (input.clickedAt !== undefined) data.clicked_at = input.clickedAt;
    if (input.bouncedAt !== undefined) data.bounced_at = input.bouncedAt;
    if (input.metadata !== undefined)
      data.metadata = JSON.stringify(input.metadata);

    await this.db
      .updateTable(TABLE as any)
      .set(data)
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();
  }

  async getByExternalId(
    externalId: string,
  ): Promise<NotificationDelivery | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("external_id", "=", externalId)
      .executeTakeFirst();

    return row ? this.mapRow(row) : undefined;
  }

  async countByStatus(
    tenantId: string,
    messageId?: MessageId,
  ): Promise<Record<string, number>> {
    let query = this.db
      .selectFrom(TABLE as any)
      .select(["status"])
      .select((eb: any) => eb.fn.count("id").as("count"))
      .where("tenant_id", "=", tenantId);

    if (messageId) {
      query = query.where("message_id", "=", messageId);
    }

    query = query.groupBy("status");

    const results = await query.execute();
    const counts: Record<string, number> = {};
    for (const row of results as any[]) {
      counts[row.status] = Number(row.count);
    }
    return counts;
  }

  private mapRow(row: any): NotificationDelivery {
    return {
      id: row.id as DeliveryId,
      messageId: row.message_id as MessageId,
      tenantId: row.tenant_id,
      channel: row.channel,
      providerCode: row.provider_code,
      recipientId: row.recipient_id,
      recipientAddr: row.recipient_addr,
      status: row.status,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      lastError: row.last_error,
      errorCategory: row.error_category,
      externalId: row.external_id,
      sentAt: row.sent_at ? new Date(row.sent_at) : null,
      deliveredAt: row.delivered_at ? new Date(row.delivered_at) : null,
      openedAt: row.opened_at ? new Date(row.opened_at) : null,
      clickedAt: row.clicked_at ? new Date(row.clicked_at) : null,
      bouncedAt: row.bounced_at ? new Date(row.bounced_at) : null,
      metadata: this.parseJson(row.metadata),
      createdAt: new Date(row.created_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
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
