import { sql, type Kysely } from "kysely";
import type { TenantByokAuditSink } from "./tenant-provider-credential-resolver.js";

type AnyDb = Record<string, unknown>;

/** Metadata-only sink; its type deliberately has no secret field. */
export class SqlTenantByokAuditSink implements TenantByokAuditSink {
  constructor(private readonly db: Kysely<AnyDb>) {}

  async record(input: Parameters<TenantByokAuditSink["record"]>[0]): Promise<void> {
    const eventCode = `ai.byok.${input.event}`;
    const context = JSON.stringify({
      provider_id: input.providerId,
      rotation_epoch: input.epoch,
      reference_fingerprint: input.credentialFingerprint,
    });
    await sql`INSERT INTO audit.audit_log (
      tenant_id,event_code,operation,entity_type,entity_id,
      actor_type,context
    ) VALUES (
      ${input.tenantId}::uuid,${eventCode},'execute',
      'ai.byok_provider_binding',${input.tenantId}::uuid,
      'system',${context}::jsonb
    )`.execute(this.db);
  }
}
