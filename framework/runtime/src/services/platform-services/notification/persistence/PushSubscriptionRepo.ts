/**
 * PushSubscriptionRepo — stores Web Push subscriptions per user.
 *
 * Uses notify.push_subscription table.
 */

import { sql } from "kysely";

import type { IPushSubscriptionRepo, PushSubscription } from "../adapters/push/WebPushAdapter.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

export class PushSubscriptionRepo implements IPushSubscriptionRepo {
    constructor(private readonly db: Kysely<DB>) {}

    async getSubscription(tenantId: string, recipientId: string): Promise<PushSubscription | undefined> {
        const result = await sql<any>`
            SELECT endpoint, p256dh, auth
            FROM notify.push_subscription
            WHERE tenant_id = ${tenantId}::uuid
              AND principal_id = ${recipientId}
              AND is_active = true
            ORDER BY created_at DESC
            LIMIT 1
        `.execute(this.db);

        const row = result.rows?.[0];
        if (!row) return undefined;

        return {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
        };
    }

    async getSubscriptions(tenantId: string, recipientId: string): Promise<PushSubscription[]> {
        const result = await sql<any>`
            SELECT endpoint, p256dh, auth
            FROM notify.push_subscription
            WHERE tenant_id = ${tenantId}::uuid
              AND principal_id = ${recipientId}
              AND is_active = true
            ORDER BY created_at DESC
        `.execute(this.db);

        return (result.rows ?? []).map((r: any) => ({
            endpoint: r.endpoint,
            keys: { p256dh: r.p256dh, auth: r.auth },
        }));
    }

    async createSubscription(
        tenantId: string,
        principalId: string,
        subscription: PushSubscription,
    ): Promise<void> {
        await sql`
            INSERT INTO notify.push_subscription (tenant_id, principal_id, endpoint, p256dh, auth)
            VALUES (${tenantId}::uuid, ${principalId}, ${subscription.endpoint},
                    ${subscription.keys.p256dh}, ${subscription.keys.auth})
            ON CONFLICT (tenant_id, endpoint) DO UPDATE SET
                p256dh = EXCLUDED.p256dh,
                auth = EXCLUDED.auth,
                is_active = true,
                updated_at = NOW()
        `.execute(this.db);
    }

    async revokeSubscription(tenantId: string, principalId: string, endpoint: string): Promise<void> {
        await sql`
            UPDATE notify.push_subscription
            SET is_active = false, updated_at = NOW()
            WHERE tenant_id = ${tenantId}::uuid
              AND principal_id = ${principalId}
              AND endpoint = ${endpoint}
        `.execute(this.db);
    }

    async revokeAllSubscriptions(tenantId: string, principalId: string): Promise<void> {
        await sql`
            UPDATE notify.push_subscription
            SET is_active = false, updated_at = NOW()
            WHERE tenant_id = ${tenantId}::uuid
              AND principal_id = ${principalId}
        `.execute(this.db);
    }
}
