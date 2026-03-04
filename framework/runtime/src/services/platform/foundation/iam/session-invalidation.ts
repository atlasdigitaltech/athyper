// framework/runtime/src/services/platform/foundation/iam/session-invalidation.ts
//
// Invalidates all user sessions when IAM changes occur (role binding, group sync, OU assignment).
// Ensures stale entitlements don't persist in Redis sessions.

import { AuthAuditEvent, emitAuthAudit } from "../security/auth-audit.js";

import type { AuditWriter } from "../../../../kernel/audit.js";
import type { RedisSessionStore } from "../security/session-store.js";

export class SessionInvalidationService {
    constructor(
        private readonly sessionStore: RedisSessionStore,
        private readonly auditWriter: AuditWriter,
    ) {}

    /**
     * Called when an IAM change occurs (role binding, group membership, OU assignment).
     * Destroys all sessions for the affected user to force re-auth with new entitlements.
     *
     * @returns Number of sessions destroyed
     */
    async onIAMChange(tenantId: string, userId: string, reason: string): Promise<number> {
        const count = await this.sessionStore.destroyAllForUser(tenantId, userId);

        if (count > 0) {
            await emitAuthAudit(this.auditWriter, {
                event: AuthAuditEvent.SESSION_KILLED,
                tenantId,
                userId,
                reason: `iam_change: ${reason}`,
                meta: { sessionsDestroyed: count },
            });
        }

        return count;
    }

    /**
     * Bump authzVersion for a principal's entitlement snapshot.
     * Sessions with older authzVersion will be forced to re-verify.
     */
    async bumpAuthzVersion(
        db: { query(sql: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[] }> },
        tenantId: string,
        principalId: string,
    ): Promise<void> {
        await db.query(
            `UPDATE core.entitlement_snapshot
             SET snapshot = jsonb_set(
                 snapshot,
                 '{authzVersion}',
                 to_jsonb(COALESCE((snapshot->>'authzVersion')::int, 0) + 1)
             ),
             updated_at = NOW()
             WHERE principal_id = $1 AND tenant_id = $2`,
            [principalId, tenantId],
        );
    }
}
