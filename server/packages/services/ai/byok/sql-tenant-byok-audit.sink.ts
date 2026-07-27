import { sql, type Kysely } from "kysely";
import type { TenantByokAuditSink } from "./tenant-provider-credential-resolver.js";

type AnyDb = Record<string, unknown>;

/** Metadata-only sink; its type deliberately has no secret field. */
export class SqlTenantByokAuditSink implements TenantByokAuditSink {
  constructor(private readonly db: Kysely<AnyDb>) {}

  async record(input: Parameters<TenantByokAuditSink["record"]>[0]): Promise<void> {
    await sql`INSERT INTO log.atlas_byok_audit
      (tenant_id,provider_id,event,rotation_epoch,reference_fingerprint)
      VALUES (${input.tenantId}::uuid,${input.providerId},${input.event},
        ${input.epoch},${input.credentialFingerprint})`.execute(this.db);
  }
}
