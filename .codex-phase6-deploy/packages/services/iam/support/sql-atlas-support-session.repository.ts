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
      relationship_id: string; shadow_principal_id: string; shadow_auth_epoch: number;
    }>`
      SELECT r.id AS relationship_id, p.id AS shadow_principal_id, p.auth_epoch AS shadow_auth_epoch
      FROM master.principal_relationship r
      JOIN master.principal p
        ON p.tenant_id = r.to_tenant_id AND p.id = r.to_principal_id
      WHERE r.from_tenant_id = ${input.originTenantId}::uuid
        AND r.from_principal_id = ${input.originPrincipalId}::uuid
        AND r.to_tenant_id = ${input.targetTenantId}::uuid
        AND r.relationship_type = 'support_shadow_for'
        AND r.verification_status = 'verified'
        AND r.status = 'active'
        AND r.effective_from <= now()
        AND (r.effective_until IS NULL OR r.effective_until > now())
        AND p.status = 'active' AND p.is_locked = false
      ORDER BY r.verified_at DESC NULLS LAST
      LIMIT 1
    `.execute(this.db);
    const row = result.rows[0];
    return row ? Object.freeze({
      targetTenantId: input.targetTenantId,
      shadowPrincipalId: row.shadow_principal_id,
      shadowAuthEpoch: Number(row.shadow_auth_epoch),
      relationshipId: row.relationship_id,
    }) : null;
  }

  async create(r: AtlasSupportSessionRecord): Promise<void> {
    await sql`INSERT INTO master.atlas_support_session (
      id, token_hash, origin_tenant_id, origin_principal_id, origin_subject,
      origin_auth_epoch, target_tenant_id, shadow_principal_id, shadow_auth_epoch,
      shadow_relationship_id, plane, allowed_scopes, ticket_id, reason, thread_id,
      session_binding_hash, issued_at, expires_at, ended_at, status
    ) VALUES (
      ${r.sessionId}::uuid, ${r.tokenHash}, ${r.originTenantId}::uuid,
      ${r.originPrincipalId}::uuid, ${r.originSubject}, ${r.originAuthEpoch},
      ${r.targetTenantId}::uuid, ${r.shadowPrincipalId}::uuid, ${r.shadowAuthEpoch},
      ${r.shadowRelationshipId}::uuid, ${r.plane}, ARRAY[${sql.join(r.allowedScopes)}]::text[],
      ${r.ticketId}, ${r.reason}, ${r.threadId}::uuid, ${r.sessionBindingHash},
      ${r.issuedAt}, ${r.expiresAt}, ${r.endedAt}, ${r.status}
    )`.execute(this.db);
  }

  async find(sessionId: string): Promise<AtlasSupportSessionRecord | null> {
    const result = await sql<Record<string, unknown>>`
      SELECT * FROM master.atlas_support_session WHERE id = ${sessionId}::uuid
    `.execute(this.db);
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async end(input: { sessionId: string; endedAt: Date; status: "revoked" | "expired" | "ended" }): Promise<boolean> {
    const result = await sql`
      UPDATE master.atlas_support_session SET status=${input.status}, ended_at=${input.endedAt}
      WHERE id=${input.sessionId}::uuid AND status='active' AND ended_at IS NULL
    `.execute(this.db);
    return Number(result.numAffectedRows ?? 0) === 1;
  }

  async appendAudit(a: AtlasSupportAuditEntry): Promise<void> {
    await sql`INSERT INTO master.atlas_support_session_audit (
      session_id,event,occurred_at,origin_principal_id,target_tenant_id,
      shadow_principal_id,scope,resource_hash,safe_reason_code
    ) VALUES (${a.sessionId}::uuid,${a.event},${a.occurredAt},${a.originPrincipalId}::uuid,
      ${a.targetTenantId}::uuid,${a.shadowPrincipalId}::uuid,${a.scope ?? null},
      ${a.resourceHash ?? null},${a.safeReasonCode ?? null})`.execute(this.db);
  }
}

function mapSession(row: Record<string, unknown>): AtlasSupportSessionRecord {
  return {
    sessionId: String(row.id), tokenHash: String(row.token_hash),
    originTenantId: String(row.origin_tenant_id), originPrincipalId: String(row.origin_principal_id),
    originSubject: String(row.origin_subject), originAuthEpoch: Number(row.origin_auth_epoch),
    targetTenantId: String(row.target_tenant_id), shadowPrincipalId: String(row.shadow_principal_id),
    shadowAuthEpoch: Number(row.shadow_auth_epoch), shadowRelationshipId: String(row.shadow_relationship_id),
    plane: "admin", allowedScopes: row.allowed_scopes as AtlasSupportSessionRecord["allowedScopes"],
    ticketId: String(row.ticket_id), reason: String(row.reason), threadId: String(row.thread_id),
    sessionBindingHash: String(row.session_binding_hash), issuedAt: new Date(String(row.issued_at)),
    expiresAt: new Date(String(row.expires_at)), endedAt: row.ended_at ? new Date(String(row.ended_at)) : null,
    status: row.status as AtlasSupportSessionRecord["status"],
  };
}
