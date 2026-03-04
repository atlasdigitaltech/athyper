/**
 * WhatsAppConsentRepo — Kysely repo for notify.whatsapp_consent
 */

import type {
    WhatsAppConsent,
    UpsertConsentInput,
} from "../domain/models/WhatsAppConsent.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "notify.whatsapp_consent" as keyof DB & string;

export class WhatsAppConsentRepo {
    constructor(private readonly db: Kysely<DB>) {}

    async getByPhone(tenantId: string, phoneNumber: string): Promise<WhatsAppConsent | undefined> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("phone_number", "=", phoneNumber)
            .executeTakeFirst();

        return row ? this.mapRow(row) : undefined;
    }

    async isOptedIn(tenantId: string, phoneNumber: string): Promise<boolean> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .select(["opted_in"])
            .where("tenant_id", "=", tenantId)
            .where("phone_number", "=", phoneNumber)
            .executeTakeFirst();

        return (row as any)?.opted_in ?? false;
    }

    async isInConversationWindow(tenantId: string, phoneNumber: string): Promise<boolean> {
        const now = new Date();
        const row = await this.db
            .selectFrom(TABLE as any)
            .select(["conversation_window_end"])
            .where("tenant_id", "=", tenantId)
            .where("phone_number", "=", phoneNumber)
            .where("conversation_window_end", ">", now)
            .executeTakeFirst();

        return !!row;
    }

    async upsertConsent(input: UpsertConsentInput): Promise<WhatsAppConsent> {
        const id = crypto.randomUUID();
        const now = new Date();

        await this.db
            .insertInto(TABLE as any)
            .values({
                id,
                tenant_id: input.tenantId,
                phone_number: input.phoneNumber,
                principal_id: input.principalId ?? null,
                opted_in: input.optedIn,
                opted_in_at: input.optedIn ? now : null,
                opted_out_at: input.optedIn ? null : now,
                opt_in_method: input.optInMethod ?? null,
                metadata: input.metadata ? JSON.stringify(input.metadata) : null,
                created_at: now,
                updated_at: now,
            })
            .onConflict((oc: any) =>
                oc.columns(["tenant_id", "phone_number"]).doUpdateSet({
                    opted_in: input.optedIn,
                    opted_in_at: input.optedIn ? now : undefined,
                    opted_out_at: input.optedIn ? undefined : now,
                    opt_in_method: input.optInMethod ?? null,
                    principal_id: input.principalId ?? null,
                    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
                    updated_at: now,
                }),
            )
            .execute();

        // Return fetched record for accuracy after upsert
        const record = await this.getByPhone(input.tenantId, input.phoneNumber);
        return record!;
    }

    async updateConversationWindow(
        tenantId: string,
        phoneNumber: string,
        windowStart: Date,
        windowEnd: Date,
    ): Promise<void> {
        const now = new Date();

        // Upsert — create record if it doesn't exist
        await this.db
            .insertInto(TABLE as any)
            .values({
                id: crypto.randomUUID(),
                tenant_id: tenantId,
                phone_number: phoneNumber,
                opted_in: false,
                conversation_window_start: windowStart,
                conversation_window_end: windowEnd,
                created_at: now,
                updated_at: now,
            })
            .onConflict((oc: any) =>
                oc.columns(["tenant_id", "phone_number"]).doUpdateSet({
                    conversation_window_start: windowStart,
                    conversation_window_end: windowEnd,
                    updated_at: now,
                }),
            )
            .execute();
    }

    async list(
        tenantId: string,
        options?: { limit?: number; offset?: number; optedInOnly?: boolean },
    ): Promise<WhatsAppConsent[]> {
        let query = this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId);

        if (options?.optedInOnly) {
            query = query.where("opted_in", "=", true);
        }

        query = query
            .orderBy("created_at", "desc")
            .limit(options?.limit ?? 50)
            .offset(options?.offset ?? 0);

        const rows = await query.execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    private mapRow(row: any): WhatsAppConsent {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            phoneNumber: row.phone_number,
            principalId: row.principal_id,
            optedIn: row.opted_in,
            optedInAt: row.opted_in_at ? new Date(row.opted_in_at) : null,
            optedOutAt: row.opted_out_at ? new Date(row.opted_out_at) : null,
            optInMethod: row.opt_in_method,
            conversationWindowStart: row.conversation_window_start ? new Date(row.conversation_window_start) : null,
            conversationWindowEnd: row.conversation_window_end ? new Date(row.conversation_window_end) : null,
            metadata: this.parseJson(row.metadata),
            createdAt: new Date(row.created_at),
            updatedAt: row.updated_at ? new Date(row.updated_at) : null,
        };
    }

    private parseJson(value: unknown): Record<string, unknown> | null {
        if (!value) return null;
        if (typeof value === "string") {
            try { return JSON.parse(value); } catch { return null; }
        }
        return value as Record<string, unknown>;
    }
}
