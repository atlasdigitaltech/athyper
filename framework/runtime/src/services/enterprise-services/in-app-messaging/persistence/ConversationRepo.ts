/**
 * ConversationRepo — Kysely repository for core.conversation table
 *
 * Handles CRUD operations for conversations with tenant isolation.
 */

import type {
    Conversation,
    ConversationId,
    ConversationType,
    CreateDirectConversationInput,
    CreateGroupConversationInput,
} from "../domain/types";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

export interface ListConversationsOptions {
    type?: ConversationType;
    limit?: number;
    offset?: number;
}

const TABLE = "core.conversation" as keyof DB & string;

export class ConversationRepo {
    constructor(private readonly db: Kysely<DB>) {}

    /**
     * Get conversation by ID
     * Enforces tenant isolation
     */
    async getById(
        tenantId: string,
        id: ConversationId
    ): Promise<Conversation | undefined> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .executeTakeFirst();

        return row ? this.mapRow(row) : undefined;
    }

    /**
     * List conversations for a user (via participants)
     * Returns conversations where user is an active participant
     */
    async listForUser(
        tenantId: string,
        userId: string,
        options?: ListConversationsOptions
    ): Promise<Conversation[]> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Kysely join typing requires cast
        let query: any = (this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .innerJoin(
                "core.conversation_participant as cp" as any,
                "cp.conversation_id" as any,
                `${TABLE}.id` as any
            ) as any)
            .where(`${TABLE}.tenant_id`, "=", tenantId)
            .where("cp.tenant_id", "=", tenantId)
            .where("cp.user_id", "=", userId)
            .where("cp.left_at", "is", null); // Active participants only

        if (options?.type) {
            query = query.where(`${TABLE}.type` as any, "=", options.type);
        }

        query = query.orderBy(`${TABLE}.created_at` as any, "desc");
        query = query.limit(options?.limit ?? 50).offset(options?.offset ?? 0);

        const rows = await query.execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    /**
     * Find existing direct conversation between two users
     * Returns undefined if no conversation exists
     */
    async findDirectConversation(
        tenantId: string,
        userId1: string,
        userId2: string
    ): Promise<Conversation | undefined> {
        // Find conversations where both users are participants
         
        const row = await (this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .innerJoin(
                "core.conversation_participant as cp1" as any,
                "cp1.conversation_id" as any,
                `${TABLE}.id` as any
            ) as any)
            .innerJoin(
                "core.conversation_participant as cp2",
                "cp2.conversation_id",
                `${TABLE}.id`
            )
            .where(`${TABLE}.tenant_id`, "=", tenantId)
            .where(`${TABLE}.type`, "=", "direct")
            .where("cp1.tenant_id", "=", tenantId)
            .where("cp1.user_id", "=", userId1)
            .where("cp1.left_at", "is", null)
            .where("cp2.tenant_id", "=", tenantId)
            .where("cp2.user_id", "=", userId2)
            .where("cp2.left_at", "is", null)
            .executeTakeFirst();

        return row ? this.mapRow(row) : undefined;
    }

    /**
     * Create a new direct conversation
     */
    async createDirect(
        input: CreateDirectConversationInput
    ): Promise<Conversation> {
        const id = crypto.randomUUID() as ConversationId;
        const now = new Date();

        await this.db
            .insertInto(TABLE as any)
            .values({
                id,
                tenant_id: input.tenantId,
                type: "direct",
                title: null,
                created_at: now,
                created_by: input.createdBy,
                updated_at: null,
                updated_by: null,
            })
            .execute();

        return {
            id,
            tenantId: input.tenantId,
            type: "direct",
            title: null,
            createdAt: now,
            createdBy: input.createdBy,
            updatedAt: null,
            updatedBy: null,
        };
    }

    /**
     * Create a new group conversation
     */
    async createGroup(
        input: CreateGroupConversationInput
    ): Promise<Conversation> {
        const id = crypto.randomUUID() as ConversationId;
        const now = new Date();

        await this.db
            .insertInto(TABLE as any)
            .values({
                id,
                tenant_id: input.tenantId,
                type: "group",
                title: input.title.trim(),
                created_at: now,
                created_by: input.createdBy,
                updated_at: null,
                updated_by: null,
            })
            .execute();

        return {
            id,
            tenantId: input.tenantId,
            type: "group",
            title: input.title.trim(),
            createdAt: now,
            createdBy: input.createdBy,
            updatedAt: null,
            updatedBy: null,
        };
    }

    /**
     * Update conversation title (group only)
     */
    async updateTitle(
        tenantId: string,
        id: ConversationId,
        title: string,
        updatedBy: string
    ): Promise<void> {
        await this.db
            .updateTable(TABLE as any)
            .set({
                title: title.trim(),
                updated_at: new Date(),
                updated_by: updatedBy,
            })
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .execute();
    }

    /**
     * Get conversation count for a user
     */
    async countForUser(
        tenantId: string,
        userId: string,
        type?: ConversationType
    ): Promise<number> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Kysely join typing requires cast
        let query: any = (this.db
            .selectFrom(TABLE as any)
            .select((eb: any) => eb.fn.count("id").as("count"))
            .innerJoin(
                "core.conversation_participant as cp" as any,
                "cp.conversation_id" as any,
                `${TABLE}.id` as any
            ) as any)
            .where(`${TABLE}.tenant_id`, "=", tenantId)
            .where("cp.tenant_id", "=", tenantId)
            .where("cp.user_id", "=", userId)
            .where("cp.left_at", "is", null);

        if (type) {
            query = query.where(`${TABLE}.type`, "=", type);
        }

        const result = await query.executeTakeFirst();
        return Number((result as any)?.count ?? 0);
    }

    /**
     * Map database row to domain object
     */
    private mapRow(row: any): Conversation {
        return {
            id: row.id as ConversationId,
            tenantId: row.tenant_id,
            type: row.type as ConversationType,
            title: row.title,
            createdAt: new Date(row.created_at),
            createdBy: row.created_by,
            updatedAt: row.updated_at ? new Date(row.updated_at) : null,
            updatedBy: row.updated_by,
        };
    }
}
