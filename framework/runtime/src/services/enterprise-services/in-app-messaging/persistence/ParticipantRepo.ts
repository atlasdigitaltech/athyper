/**
 * ParticipantRepo — Kysely repository for core.conversation_participant table
 *
 * Handles participant management with read tracking and soft deletes.
 */

import type {
    ConversationParticipant,
    ParticipantId,
    ConversationId,
    MessageId,
    ParticipantRole,
} from "../domain/types";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

export interface AddParticipantInput {
    conversationId: ConversationId;
    tenantId: string;
    userId: string;
    role?: ParticipantRole;
}

const TABLE = "core.conversation_participant" as keyof DB & string;

export class ParticipantRepo {
    constructor(private readonly db: Kysely<DB>) {}

    /**
     * Get participant by ID
     * Enforces tenant isolation
     */
    async getById(
        tenantId: string,
        id: ParticipantId
    ): Promise<ConversationParticipant | undefined> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .executeTakeFirst();

        return row ? this.mapRow(row) : undefined;
    }

    /**
     * List all participants for a conversation
     * Includes both active and inactive (left) participants
     */
    async listForConversation(
        tenantId: string,
        conversationId: ConversationId
    ): Promise<ConversationParticipant[]> {
        const rows = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("conversation_id", "=", conversationId)
            .orderBy("joined_at", "asc")
            .execute();

        return rows.map((r: any) => this.mapRow(r));
    }

    /**
     * List active participants for a conversation
     * Excludes participants who have left
     */
    async listActiveForConversation(
        tenantId: string,
        conversationId: ConversationId
    ): Promise<ConversationParticipant[]> {
        const rows = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("conversation_id", "=", conversationId)
            .where("left_at", "is", null)
            .orderBy("joined_at", "asc")
            .execute();

        return rows.map((r: any) => this.mapRow(r));
    }

    /**
     * Get participant record for a specific user in a conversation
     */
    async findByUserAndConversation(
        tenantId: string,
        userId: string,
        conversationId: ConversationId
    ): Promise<ConversationParticipant | undefined> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("user_id", "=", userId)
            .where("conversation_id", "=", conversationId)
            .executeTakeFirst();

        return row ? this.mapRow(row) : undefined;
    }

    /**
     * Add a participant to a conversation
     */
    async add(input: AddParticipantInput): Promise<ConversationParticipant> {
        const id = crypto.randomUUID() as ParticipantId;
        const now = new Date();

        await this.db
            .insertInto(TABLE as any)
            .values({
                id,
                conversation_id: input.conversationId,
                tenant_id: input.tenantId,
                user_id: input.userId,
                role: input.role ?? "member",
                joined_at: now,
                left_at: null,
                last_read_message_id: null,
                last_read_at: null,
            })
            .execute();

        return {
            id,
            conversationId: input.conversationId,
            tenantId: input.tenantId,
            userId: input.userId,
            role: input.role ?? "member",
            joinedAt: now,
            leftAt: null,
            lastReadMessageId: null,
            lastReadAt: null,
        };
    }

    /**
     * Add multiple participants in a batch
     */
    async addBatch(inputs: AddParticipantInput[]): Promise<ConversationParticipant[]> {
        if (inputs.length === 0) return [];

        const now = new Date();
        const participants: ConversationParticipant[] = [];

        const values = inputs.map(input => {
            const id = crypto.randomUUID() as ParticipantId;
            participants.push({
                id,
                conversationId: input.conversationId,
                tenantId: input.tenantId,
                userId: input.userId,
                role: input.role ?? "member",
                joinedAt: now,
                leftAt: null,
                lastReadMessageId: null,
                lastReadAt: null,
            });

            return {
                id,
                conversation_id: input.conversationId,
                tenant_id: input.tenantId,
                user_id: input.userId,
                role: input.role ?? "member",
                joined_at: now,
                left_at: null,
                last_read_message_id: null,
                last_read_at: null,
            };
        });

        await this.db
            .insertInto(TABLE as any)
            .values(values)
            .execute();

        return participants;
    }

    /**
     * Remove a participant (soft delete by setting left_at)
     */
    async remove(
        tenantId: string,
        conversationId: ConversationId,
        userId: string
    ): Promise<void> {
        await this.db
            .updateTable(TABLE as any)
            .set({ left_at: new Date() })
            .where("tenant_id", "=", tenantId)
            .where("conversation_id", "=", conversationId)
            .where("user_id", "=", userId)
            .where("left_at", "is", null)
            .execute();
    }

    /**
     * Update participant's last read message
     */
    async updateLastRead(
        tenantId: string,
        conversationId: ConversationId,
        userId: string,
        messageId: MessageId
    ): Promise<void> {
        await this.db
            .updateTable(TABLE as any)
            .set({
                last_read_message_id: messageId,
                last_read_at: new Date(),
            })
            .where("tenant_id", "=", tenantId)
            .where("conversation_id", "=", conversationId)
            .where("user_id", "=", userId)
            .execute();
    }

    /**
     * Promote a participant to admin
     */
    async promoteToAdmin(
        tenantId: string,
        conversationId: ConversationId,
        userId: string
    ): Promise<void> {
        await this.db
            .updateTable(TABLE as any)
            .set({ role: "admin" })
            .where("tenant_id", "=", tenantId)
            .where("conversation_id", "=", conversationId)
            .where("user_id", "=", userId)
            .execute();
    }

    /**
     * Demote a participant from admin to member
     */
    async demoteToMember(
        tenantId: string,
        conversationId: ConversationId,
        userId: string
    ): Promise<void> {
        await this.db
            .updateTable(TABLE as any)
            .set({ role: "member" })
            .where("tenant_id", "=", tenantId)
            .where("conversation_id", "=", conversationId)
            .where("user_id", "=", userId)
            .execute();
    }

    /**
     * Count active participants in a conversation
     */
    async countActive(
        tenantId: string,
        conversationId: ConversationId
    ): Promise<number> {
        const result = await this.db
            .selectFrom(TABLE as any)
            .select((eb: any) => eb.fn.count("id").as("count"))
            .where("tenant_id", "=", tenantId)
            .where("conversation_id", "=", conversationId)
            .where("left_at", "is", null)
            .executeTakeFirst();

        return Number((result as any)?.count ?? 0);
    }

    /**
     * List all participations for a user across conversations
     */
    async listForUser(
        tenantId: string,
        userId: string
    ): Promise<ConversationParticipant[]> {
        const rows = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("user_id", "=", userId)
            .where("left_at", "is", null)
            .orderBy("joined_at", "desc")
            .execute();

        return rows.map((r: any) => this.mapRow(r));
    }

    /**
     * Count conversations with unread messages for a user
     */
    async countUnreadConversations(
        tenantId: string,
        userId: string
    ): Promise<number> {
        // This is a complex query that requires checking:
        // 1. Latest message in each conversation
        // 2. Compare with participant's last_read_message_id
        // For now, return 0 (will be implemented with proper query later)
        // TODO: Implement proper unread conversation count
        return 0;
    }

    /**
     * Map database row to domain object
     */
    private mapRow(row: any): ConversationParticipant {
        return {
            id: row.id as ParticipantId,
            conversationId: row.conversation_id as ConversationId,
            tenantId: row.tenant_id,
            userId: row.user_id,
            role: row.role as ParticipantRole,
            joinedAt: new Date(row.joined_at),
            leftAt: row.left_at ? new Date(row.left_at) : null,
            lastReadMessageId: row.last_read_message_id as MessageId | null,
            lastReadAt: row.last_read_at ? new Date(row.last_read_at) : null,
        };
    }
}
