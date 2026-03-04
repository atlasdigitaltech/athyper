/**
 * MessageRepo — Kysely repository for core.message table
 *
 * Handles message CRUD with idempotency support and soft deletes.
 */

import { sql, type Kysely } from "kysely";

import type {
    Message,
    MessageId,
    ConversationId,
    MessageFormat,
    CreateMessageInput,
} from "../domain/types";
import type { DB } from "@athyper/adapter-db";

export interface ListMessagesOptions {
    limit?: number;
    beforeMessageId?: MessageId; // For pagination
    includeDeleted?: boolean;
}

export interface SearchMessagesOptions {
    limit?: number;
    offset?: number;
    conversationId?: ConversationId; // Optional: search within specific conversation
    includeDeleted?: boolean;
}

export interface MessageSearchResult {
    message: Message;
    rank: number; // Relevance score
    headline: string; // Highlighted snippet
}

const TABLE = "core.message" as keyof DB & string;

export class MessageRepo {
    constructor(private readonly db: Kysely<DB>) {}

    /**
     * Get message by ID
     * Enforces tenant isolation
     */
    async getById(
        tenantId: string,
        id: MessageId
    ): Promise<Message | undefined> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .executeTakeFirst();

        return row ? this.mapRow(row) : undefined;
    }

    /**
     * Get message by client message ID (idempotency check)
     */
    async getByClientMessageId(
        tenantId: string,
        clientMessageId: string
    ): Promise<Message | undefined> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("client_message_id", "=", clientMessageId)
            .executeTakeFirst();

        return row ? this.mapRow(row) : undefined;
    }

    /**
     * List messages in a conversation
     * Returns messages in reverse chronological order (newest first)
     */
    async listForConversation(
        tenantId: string,
        conversationId: ConversationId,
        options?: ListMessagesOptions
    ): Promise<Message[]> {
        let query = this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("conversation_id", "=", conversationId);

        // Exclude deleted messages unless explicitly requested
        if (!options?.includeDeleted) {
            query = query.where("deleted_at", "is", null);
        }

        // Pagination: get messages before a specific message ID
        if (options?.beforeMessageId) {
            const beforeMsg = await this.getById(tenantId, options.beforeMessageId);
            if (beforeMsg) {
                query = query.where("created_at", "<", beforeMsg.createdAt);
            }
        }

        query = query.orderBy("created_at", "desc");
        query = query.limit(options?.limit ?? 50);

        const rows = await query.execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    /**
     * Get latest message in a conversation
     */
    async getLatest(
        tenantId: string,
        conversationId: ConversationId
    ): Promise<Message | undefined> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("conversation_id", "=", conversationId)
            .where("deleted_at", "is", null)
            .orderBy("created_at", "desc")
            .limit(1)
            .executeTakeFirst();

        return row ? this.mapRow(row) : undefined;
    }

    /**
     * Create a new message
     * Supports idempotency via client_message_id
     */
    async create(input: CreateMessageInput): Promise<Message> {
        // Check for existing message with same client_message_id (idempotency)
        if (input.clientMessageId) {
            const existing = await this.getByClientMessageId(
                input.tenantId,
                input.clientMessageId
            );
            if (existing) {
                return existing;
            }
        }

        const id = crypto.randomUUID() as MessageId;
        const now = new Date();

        await this.db
            .insertInto(TABLE as any)
            .values({
                id,
                tenant_id: input.tenantId,
                conversation_id: input.conversationId,
                sender_id: input.senderId,
                body: input.body,
                body_format: input.bodyFormat ?? "plain",
                client_message_id: input.clientMessageId ?? null,
                parent_message_id: input.parentMessageId ?? null,
                created_at: now,
                edited_at: null,
                deleted_at: null,
            })
            .execute();

        return {
            id,
            tenantId: input.tenantId,
            conversationId: input.conversationId,
            senderId: input.senderId,
            body: input.body,
            bodyFormat: (input.bodyFormat ?? "plain") as MessageFormat,
            clientMessageId: input.clientMessageId ?? null,
            parentMessageId: input.parentMessageId ?? null,
            createdAt: now,
            editedAt: null,
            deletedAt: null,
        };
    }

    /**
     * Update message body (edit)
     */
    async update(
        tenantId: string,
        id: MessageId,
        body: string
    ): Promise<void> {
        await this.db
            .updateTable(TABLE as any)
            .set({
                body,
                edited_at: new Date(),
            })
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .execute();
    }

    /**
     * Soft delete a message
     */
    async softDelete(
        tenantId: string,
        id: MessageId
    ): Promise<void> {
        await this.db
            .updateTable(TABLE as any)
            .set({ deleted_at: new Date() })
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .execute();
    }

    /**
     * Count messages in a conversation
     */
    async countForConversation(
        tenantId: string,
        conversationId: ConversationId,
        includeDeleted?: boolean
    ): Promise<number> {
        let query = this.db
            .selectFrom(TABLE as any)
            .select((eb: any) => eb.fn.count("id").as("count"))
            .where("tenant_id", "=", tenantId)
            .where("conversation_id", "=", conversationId);

        if (!includeDeleted) {
            query = query.where("deleted_at", "is", null);
        }

        const result = await query.executeTakeFirst();
        return Number((result as any)?.count ?? 0);
    }

    /**
     * Count messages sent by a user
     */
    async countBySender(
        tenantId: string,
        senderId: string
    ): Promise<number> {
        const result = await this.db
            .selectFrom(TABLE as any)
            .select((eb: any) => eb.fn.count("id").as("count"))
            .where("tenant_id", "=", tenantId)
            .where("sender_id", "=", senderId)
            .where("deleted_at", "is", null)
            .executeTakeFirst();

        return Number((result as any)?.count ?? 0);
    }

    /**
     * List messages sent by a user across all conversations
     */
    async listBySender(
        tenantId: string,
        senderId: string,
        options?: { limit?: number; offset?: number }
    ): Promise<Message[]> {
        const rows = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("sender_id", "=", senderId)
            .where("deleted_at", "is", null)
            .orderBy("created_at", "desc")
            .limit(options?.limit ?? 50)
            .offset(options?.offset ?? 0)
            .execute();

        return rows.map((r: any) => this.mapRow(r));
    }

    /**
     * Get unread messages for a user in a conversation
     * Returns messages created after the user's last_read_at timestamp
     */
    async getUnreadForUser(
        tenantId: string,
        conversationId: ConversationId,
        userId: string,
        lastReadAt: Date | null
    ): Promise<Message[]> {
        let query = this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("conversation_id", "=", conversationId)
            .where("deleted_at", "is", null)
            .where("sender_id", "!=", userId); // Exclude user's own messages

        if (lastReadAt) {
            query = query.where("created_at", ">", lastReadAt);
        }

        const rows = await query.orderBy("created_at", "asc").execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    /**
     * List thread replies for a parent message
     * Returns replies in chronological order (oldest first for natural reading)
     */
    async listThreadReplies(
        tenantId: string,
        parentMessageId: MessageId,
        options?: { limit?: number; includeDeleted?: boolean }
    ): Promise<Message[]> {
        let query = this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("parent_message_id", "=", parentMessageId);

        if (!options?.includeDeleted) {
            query = query.where("deleted_at", "is", null);
        }

        query = query.orderBy("created_at", "asc");
        query = query.limit(options?.limit ?? 100);

        const rows = await query.execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    /**
     * Count thread replies for a parent message
     */
    async countThreadReplies(
        tenantId: string,
        parentMessageId: MessageId,
        includeDeleted?: boolean
    ): Promise<number> {
        let query = this.db
            .selectFrom(TABLE as any)
            .select((eb: any) => eb.fn.count("id").as("count"))
            .where("tenant_id", "=", tenantId)
            .where("parent_message_id", "=", parentMessageId);

        if (!includeDeleted) {
            query = query.where("deleted_at", "is", null);
        }

        const result = await query.executeTakeFirst();
        return Number((result as any)?.count ?? 0);
    }

    /**
     * List root messages (no parent) in a conversation
     * Returns messages in reverse chronological order (newest first)
     */
    async listRootMessages(
        tenantId: string,
        conversationId: ConversationId,
        options?: ListMessagesOptions
    ): Promise<Message[]> {
        let query = this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("conversation_id", "=", conversationId)
            .where("parent_message_id", "is", null);

        if (!options?.includeDeleted) {
            query = query.where("deleted_at", "is", null);
        }

        if (options?.beforeMessageId) {
            const beforeMsg = await this.getById(tenantId, options.beforeMessageId);
            if (beforeMsg) {
                query = query.where("created_at", "<", beforeMsg.createdAt);
            }
        }

        query = query.orderBy("created_at", "desc");
        query = query.limit(options?.limit ?? 50);

        const rows = await query.execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    /**
     * Full-text search across messages
     * Returns messages ranked by relevance with highlighted snippets
     */
    async searchMessages(
        tenantId: string,
        searchQuery: string,
        options?: SearchMessagesOptions
    ): Promise<MessageSearchResult[]> {
        // Sanitize search query for tsquery (basic sanitization)
        const sanitizedQuery = searchQuery
            .trim()
            .split(/\s+/)
            .filter((word) => word.length > 0)
            .join(" & ");

        if (!sanitizedQuery) {
            return [];
        }

        let query = this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .select(
                sql<number>`ts_rank(body_tsv, to_tsquery('english', ${sanitizedQuery}))`.as(
                    "rank"
                )
            )
            .select(
                sql<string>`ts_headline('english', body, to_tsquery('english', ${sanitizedQuery}), 'MaxWords=30, MinWords=10, ShortWord=3')`.as(
                    "headline"
                )
            )
            .where("tenant_id", "=", tenantId)
            .where(
                sql`body_tsv @@ to_tsquery('english', ${sanitizedQuery})` as any
            );

        // Optional: filter by conversation
        if (options?.conversationId) {
            query = query.where("conversation_id" as any, "=", options.conversationId);
        }

        // Exclude deleted messages unless explicitly requested
        if (!options?.includeDeleted) {
            query = query.where("deleted_at" as any, "is", null);
        }

        // Order by relevance (highest rank first)
        query = query.orderBy("rank" as any, "desc");
        query = query.orderBy("created_at" as any, "desc"); // Secondary sort by recency

        // Pagination
        query = query.limit(options?.limit ?? 50);
        if (options?.offset) {
            query = query.offset(options.offset);
        }

        const rows = await query.execute();

        return rows.map((row: any) => ({
            message: this.mapRow(row),
            rank: Number(row.rank),
            headline: row.headline,
        }));
    }

    /**
     * Count search results
     */
    async countSearchResults(
        tenantId: string,
        searchQuery: string,
        options?: { conversationId?: ConversationId; includeDeleted?: boolean }
    ): Promise<number> {
        const sanitizedQuery = searchQuery
            .trim()
            .split(/\s+/)
            .filter((word) => word.length > 0)
            .join(" & ");

        if (!sanitizedQuery) {
            return 0;
        }

        let query = this.db
            .selectFrom(TABLE as any)
            .select((eb: any) => eb.fn.count("id").as("count"))
            .where("tenant_id", "=", tenantId)
            .where(
                sql`body_tsv @@ to_tsquery('english', ${sanitizedQuery})` as any
            );

        if (options?.conversationId) {
            query = query.where("conversation_id" as any, "=", options.conversationId);
        }

        if (!options?.includeDeleted) {
            query = query.where("deleted_at" as any, "is", null);
        }

        const result = await query.executeTakeFirst();
        return Number((result as any)?.count ?? 0);
    }

    /**
     * Map database row to domain object
     */
    private mapRow(row: any): Message {
        return {
            id: row.id as MessageId,
            tenantId: row.tenant_id,
            conversationId: row.conversation_id as ConversationId,
            senderId: row.sender_id,
            body: row.body,
            bodyFormat: row.body_format as MessageFormat,
            clientMessageId: row.client_message_id,
            parentMessageId: row.parent_message_id as MessageId | null,
            createdAt: new Date(row.created_at),
            editedAt: row.edited_at ? new Date(row.edited_at) : null,
            deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
        };
    }
}
