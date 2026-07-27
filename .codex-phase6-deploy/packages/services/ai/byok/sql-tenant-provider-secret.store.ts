import { sql, type Kysely } from "kysely";
import type { CredentialEncryptionService } from "@athyper/server-foundation/crypto/credential-encryption.service";
import type { TenantProviderSecretStore } from "./tenant-provider-credential-resolver.js";

type AnyDb = Record<string, unknown>;
type Row = {
  id: string; tenant_id: string; provider_id: string; encrypted_secret: string;
  key_version: number; rotation_epoch: number;
};

export class SqlTenantProviderSecretStore implements TenantProviderSecretStore {
  constructor(
    private readonly db: Kysely<AnyDb>,
    private readonly encryption: CredentialEncryptionService,
  ) {}

  async readActive(input: { tenantId: string; providerId: string }) {
    const result = await sql<Row>`
      SELECT id,tenant_id,provider_id,encrypted_secret,key_version,rotation_epoch
      FROM control.atlas_tenant_provider_credential
      WHERE tenant_id=${input.tenantId}::uuid AND provider_id=${input.providerId}
        AND status='active' LIMIT 1
    `.execute(this.db);
    const row = result.rows[0];
    if (!row) return null;
    const secret = await this.encryption.decrypt(input.tenantId, row.encrypted_secret);
    if (!secret) return null;
    return {
      tenantId: row.tenant_id, providerId: row.provider_id,
      credentialId: row.id, rotationEpoch: Number(row.rotation_epoch), secret,
    };
  }

  async currentEpoch(input: { tenantId: string; providerId: string }): Promise<number> {
    const result = await sql<{ rotation_epoch: number; revoked: boolean }>`
      SELECT rotation_epoch,revoked FROM control.atlas_tenant_provider_credential_epoch
      WHERE tenant_id=${input.tenantId}::uuid AND provider_id=${input.providerId}
    `.execute(this.db);
    return result.rows[0]?.revoked ? Number(result.rows[0].rotation_epoch) : Number(result.rows[0]?.rotation_epoch ?? 0);
  }
}
