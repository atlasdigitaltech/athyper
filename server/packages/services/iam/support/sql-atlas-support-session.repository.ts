import { sql, type Kysely } from "kysely";
import type {
  AtlasSupportAuditEntry,
  AtlasSupportSessionRecord,
  AtlasSupportSessionRepository,
  AtlasSupportShadowPrincipal,
} from "./atlas-support-session.types.js";

type AnyDb = Record<string, unknown>;

export class SqlAtlasSupportSessionRepository implements AtlasSupportSessionRepository {
  constructor(private readonly db: Kysely<AnyDb>) {}

  async resolveShadowPrincipal(input: {
    originTenantId: string; originPrincipalId: string; targetTenantId: string;
  }): Promise<AtlasSupportShadowPrincipal | null> {
    const result = await sql<{
      membership_id: string; shadow_principal_id: string; shadow_auth_epoch: number;
    }>`
      SELECT membership.id AS membership_id,
             p.id AS shadow_principal_id,
             p.auth_epoch AS shadow_auth_epoch
      FROM authz.plane_membership AS membership
      JOIN master.principal p
        ON p.tenant_id = membership.tenant_id
       AND p.id = membership.principal_id
      WHERE membership.tenant_id = ${input.targetTenantId}::uuid
        AND membership.membership_kind = 'support'
        AND membership.source_ref = ${`atlas:${input.originTenantId}:${input.originPrincipalId}`}
        AND membership.status = 'active'
        AND membership.effective_from <= statement_timestamp()
        AND (membership.effective_until IS NULL OR membership.effective_until > statement_timestamp())
        AND p.principal_type = 'support'
        AND p.status = 'active'
      ORDER BY membership.effective_from DESC, membership.id
      LIMIT 1
    `.execute(this.db);
    const row = result.rows[0];
    return row ? Object.freeze({
      targetTenantId: input.targetTenantId,
      shadowPrincipalId: row.shadow_principal_id,
      shadowAuthEpoch: Number(row.shadow_auth_epoch),
      membershipId: row.membership_id,
    }) : null;
  }

  async create(r: AtlasSupportSessionRecord): Promise<void> {
    await sql`INSERT INTO ai.atlas_support_session (
      id, token_hash, origin_tenant_id, origin_principal_id, origin_subject,
      origin_auth_epoch, target_tenant_id, shadow_principal_id, shadow_auth_epoch,
      shadow_membership_id, plane, allowed_scopes, ticket_id, reason, thread_id,
      session_binding_hash, issued_at, expires_at, ended_at, status
    ) VALUES (
      ${r.sessionId}::uuid, ${r.tokenHash}, ${r.originTenantId}::uuid,
      ${r.originPrincipalId}::uuid, ${r.originSubject}, ${r.originAuthEpoch},
      ${r.targetTenantId}::uuid, ${r.shadowPrincipalId}::uuid, ${r.shadowAuthEpoch},
      ${r.shadowMembershipId}::uuid, ${r.plane}, ARRAY[${sql.join(r.allowedScopes)}]::text[],
      ${r.ticketId}, ${r.reason}, ${r.threadId}::uuid, ${r.sessionBindingHash},
      ${r.issuedAt}, ${r.expiresAt}, ${r.endedAt}, ${r.status}
    )`.execute(this.db);
  }

  async find(sessionId: string): Promise<AtlasSupportSessionRecord | null> {
    const result = await sql<Record<string, unknown>>`
      SELECT * FROM ai.atlas_support_session WHERE id = ${sessionId}::uuid
    `.execute(this.db);
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async end(input: { sessionId: string; endedAt: Date; status: "revoked" | "expired" | "ended" }): Promise<boolean> {
    const result = await sql`
      UPDATE ai.atlas_support_session SET status=${input.status}, ended_at=${input.endedAt}
      WHERE id=${input.sessionId}::uuid AND status='active' AND ended_at IS NULL
    `.execute(this.db);
    return Number(result.numAffectedRows ?? 0) === 1;
  }

  async appendAudit(a: AtlasSupportAuditEntry): Promise<void> {
    const eventCode = `ai.support.${a.event}`;
    const operation = a.event === "exported"
      ? "export"
      : a.event === "access_denied"
        ? "reject"
        : "execute";
    const context = JSON.stringify({
      shadow_principal_id: a.shadowPrincipalId,
      scope: a.scope ?? null,
      resource_hash: a.resourceHash ?? null,
      safe_reason_code: a.safeReasonCode ?? null,
    });
    await sql`INSERT INTO audit.audit_log (
      tenant_id,event_code,operation,entity_type,entity_id,
      scope_type,scope_id,actor_principal_id,actor_type,
      context,occurred_at
    ) VALUES (
      ${a.targetTenantId}::uuid,${eventCode},${operation}::audit.operation_d,
      'ai.support_session',${a.sessionId}::uuid,
      'tenant',${a.targetTenantId}::uuid,${a.originPrincipalId}::uuid,'support',
      ${context}::jsonb,${a.occurredAt}
    )`.execute(this.db);
  }
}

function mapSession(row: Record<string, unknown>): AtlasSupportSessionRecord {
  return {
    sessionId: String(row.id), tokenHash: String(row.token_hash),
    originTenantId: String(row.origin_tenant_id), originPrincipalId: String(row.origin_principal_id),
    originSubject: String(row.origin_subject), originAuthEpoch: Number(row.origin_auth_epoch),
    targetTenantId: String(row.target_tenant_id), shadowPrincipalId: String(row.shadow_principal_id),
    shadowAuthEpoch: Number(row.shadow_auth_epoch), shadowMembershipId: String(row.shadow_membership_id),
    plane: "admin", allowedScopes: row.allowed_scopes as AtlasSupportSessionRecord["allowedScopes"],
    ticketId: String(row.ticket_id), reason: String(row.reason), threadId: String(row.thread_id),
    sessionBindingHash: String(row.session_binding_hash), issuedAt: new Date(String(row.issued_at)),
    expiresAt: new Date(String(row.expires_at)), endedAt: row.ended_at ? new Date(String(row.ended_at)) : null,
    status: row.status as AtlasSupportSessionRecord["status"],
  };
}
