/**
 * MessageDeliveryRepo — Kysely repository for core.message_delivery table
 *
 * Handles per-recipient delivery and read tracking.
 */

import type { MessageDelivery, DeliveryId, MessageId } from "../domain/types";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

export interface CreateDeliveryInput {
  messageId: MessageId;
  tenantId: string;
  recipientId: string;
}

const TABLE = "core.message_delivery" as keyof DB & string;

export class MessageDeliveryRepo {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Get delivery by ID
   * Enforces tenant isolation
   */
  async getById(
    tenantId: string,
    id: DeliveryId,
  ): Promise<MessageDelivery | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? this.mapRow(row) : undefined;
  }

  /**
   * Get delivery for a specific message and recipient
   */
  async findByMessageAndRecipient(
    tenantId: string,
    messageId: MessageId,
    recipientId: string,
  ): Promise<MessageDelivery | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("message_id", "=", messageId)
      .where("recipient_id", "=", recipientId)
      .executeTakeFirst();

    return row ? this.mapRow(row) : undefined;
  }

  /**
   * List all deliveries for a message
   */
  async listForMessage(
    tenantId: string,
    messageId: MessageId,
  ): Promise<MessageDelivery[]> {
    const rows = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("message_id", "=", messageId)
      .orderBy("delivered_at", "asc")
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  /**
   * List unread deliveries for a recipient
   */
  async listUnreadForRecipient(
    tenantId: string,
    recipientId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<MessageDelivery[]> {
    const rows = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("recipient_id", "=", recipientId)
      .where("read_at", "is", null)
      .orderBy("delivered_at", "desc")
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0)
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  /**
   * Create a delivery record
   * Idempotent: If delivery already exists, returns existing record
   */
  async create(input: CreateDeliveryInput): Promise<MessageDelivery> {
    // Check for existing delivery (idempotency)
    const existing = await this.findByMessageAndRecipient(
      input.tenantId,
      input.messageId,
      input.recipientId,
    );
    if (existing) {
      return existing;
    }

    const id = crypto.randomUUID() as DeliveryId;
    const now = new Date();

    await this.db
      .insertInto(TABLE as any)
      .values({
        id,
        message_id: input.messageId,
        tenant_id: input.tenantId,
        recipient_id: input.recipientId,
        delivered_at: now,
        read_at: null,
      })
      .execute();

    return {
      id,
      messageId: input.messageId,
      tenantId: input.tenantId,
      recipientId: input.recipientId,
      deliveredAt: now,
      readAt: null,
    };
  }

  /**
   * Create multiple delivery records in batch
   */
  async createBatch(inputs: CreateDeliveryInput[]): Promise<MessageDelivery[]> {
    if (inputs.length === 0) return [];

    const now = new Date();
    const deliveries: MessageDelivery[] = [];

    const values = inputs.map((input) => {
      const id = crypto.randomUUID() as DeliveryId;
      deliveries.push({
        id,
        messageId: input.messageId,
        tenantId: input.tenantId,
        recipientId: input.recipientId,
        deliveredAt: now,
        readAt: null,
      });

      return {
        id,
        message_id: input.messageId,
        tenant_id: input.tenantId,
        recipient_id: input.recipientId,
        delivered_at: now,
        read_at: null,
      };
    });

    // Use onConflict to handle idempotency at database level
    await this.db
      .insertInto(TABLE as any)
      .values(values)
      .onConflict((oc: any) =>
        oc.columns(["message_id", "recipient_id"]).doNothing(),
      )
      .execute();

    return deliveries;
  }

  /**
   * Mark a delivery as read
   */
  async markAsRead(
    tenantId: string,
    messageId: MessageId,
    recipientId: string,
  ): Promise<void> {
    await this.db
      .updateTable(TABLE as any)
      .set({ read_at: new Date() })
      .where("tenant_id", "=", tenantId)
      .where("message_id", "=", messageId)
      .where("recipient_id", "=", recipientId)
      .where("read_at", "is", null)
      .execute();
  }

  /**
   * Mark multiple deliveries as read in batch
   */
  async markBatchAsRead(
    tenantId: string,
    messageIds: MessageId[],
    recipientId: string,
  ): Promise<void> {
    if (messageIds.length === 0) return;

    await this.db
      .updateTable(TABLE as any)
      .set({ read_at: new Date() })
      .where("tenant_id", "=", tenantId)
      .where("message_id", "in", messageIds)
      .where("recipient_id", "=", recipientId)
      .where("read_at", "is", null)
      .execute();
  }

  /**
   * Count unread deliveries for a recipient
   */
  async countUnread(tenantId: string, recipientId: string): Promise<number> {
    const result = await this.db
      .selectFrom(TABLE as any)
      .select((eb: any) => eb.fn.count("id").as("count"))
      .where("tenant_id", "=", tenantId)
      .where("recipient_id", "=", recipientId)
      .where("read_at", "is", null)
      .executeTakeFirst();

    return Number((result as any)?.count ?? 0);
  }

  /**
   * Count read deliveries for a message (read receipts)
   */
  async countReadForMessage(
    tenantId: string,
    messageId: MessageId,
  ): Promise<number> {
    const result = await this.db
      .selectFrom(TABLE as any)
      .select((eb: any) => eb.fn.count("id").as("count"))
      .where("tenant_id", "=", tenantId)
      .where("message_id", "=", messageId)
      .where("read_at", "is not", null)
      .executeTakeFirst();

    return Number((result as any)?.count ?? 0);
  }

  /**
   * Get read receipts for a message (who read it and when)
   */
  async getReadReceipts(
    tenantId: string,
    messageId: MessageId,
  ): Promise<Array<{ recipientId: string; readAt: Date }>> {
    const rows = await this.db
      .selectFrom(TABLE as any)
      .select(["recipient_id", "read_at"])
      .where("tenant_id", "=", tenantId)
      .where("message_id", "=", messageId)
      .where("read_at", "is not", null)
      .orderBy("read_at", "asc")
      .execute();

    return rows.map((r: any) => ({
      recipientId: r.recipient_id,
      readAt: new Date(r.read_at),
    }));
  }

  /**
   * Check if a specific recipient has read a message
   */
  async hasRead(
    tenantId: string,
    messageId: MessageId,
    recipientId: string,
  ): Promise<boolean> {
    const delivery = await this.findByMessageAndRecipient(
      tenantId,
      messageId,
      recipientId,
    );
    return delivery?.readAt !== null && delivery?.readAt !== undefined;
  }

  /**
   * Map database row to domain object
   */
  private mapRow(row: any): MessageDelivery {
    return {
      id: row.id as DeliveryId,
      messageId: row.message_id as MessageId,
      tenantId: row.tenant_id,
      recipientId: row.recipient_id,
      deliveredAt: new Date(row.delivered_at),
      readAt: row.read_at ? new Date(row.read_at) : null,
    };
  }
}
