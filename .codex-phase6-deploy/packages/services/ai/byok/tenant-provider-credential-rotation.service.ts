import { sql, type Kysely } from "kysely";
import type { CredentialEncryptionService, TenantKeyProvider } from "@athyper/server-foundation/crypto/credential-encryption.service";

type AnyDb = Record<string, unknown>;

export interface AtlasByokRevocationPublisher {
  publish(input: { tenantId: string; providerId: string; rotationEpoch: number }): Promise<void>;
}

export class TenantProviderCredentialRotationService {
  constructor(
    private readonly db: Kysely<AnyDb>,
    private readonly encryption: CredentialEncryptionService,
    private readonly keys: TenantKeyProvider,
    private readonly revocations: AtlasByokRevocationPublisher,
  ) {}

  async rotate(input: {
    tenantId: string; providerId: string; newSecret: string; actorPrincipalId: string;
  }): Promise<number> {
    if (!input.newSecret.trim()) throw new Error("A replacement credential is required.");
    const encrypted = await this.encryption.encrypt(input.tenantId, input.newSecret);
    let epoch = 0;
    await this.db.transaction().execute(async (tx) => {
      const current = await sql<{ rotation_epoch: number }>`
        INSERT INTO control.atlas_tenant_provider_credential_epoch
          (tenant_id,provider_id,rotation_epoch,revoked)
        VALUES (${input.tenantId}::uuid,${input.providerId},1,false)
        ON CONFLICT (tenant_id,provider_id) DO UPDATE
          SET rotation_epoch=control.atlas_tenant_provider_credential_epoch.rotation_epoch+1,
              revoked=false,updated_at=now()
        RETURNING rotation_epoch
      `.execute(tx);
      epoch = Number(current.rows[0]?.rotation_epoch ?? 1);
      await sql`UPDATE control.atlas_tenant_provider_credential
        SET status='superseded',updated_at=now(),updated_by=${input.actorPrincipalId}::uuid
        WHERE tenant_id=${input.tenantId}::uuid AND provider_id=${input.providerId} AND status='active'`
        .execute(tx);
      await sql`INSERT INTO control.atlas_tenant_provider_credential
        (tenant_id,provider_id,encrypted_secret,key_version,rotation_epoch,status,created_by)
        VALUES (${input.tenantId}::uuid,${input.providerId},${JSON.stringify(encrypted)},
          ${encrypted.v},${epoch},'active',${input.actorPrincipalId}::uuid)`.execute(tx);
      await sql`INSERT INTO log.atlas_byok_audit
        (tenant_id,provider_id,event,rotation_epoch,actor_principal_id)
        VALUES (${input.tenantId}::uuid,${input.providerId},'rotated',${epoch},${input.actorPrincipalId}::uuid)`
        .execute(tx);
    });
    await this.revocations.publish({ tenantId: input.tenantId, providerId: input.providerId, rotationEpoch: epoch });
    return epoch;
  }

  async revoke(input: {
    tenantId: string; providerId: string; actorPrincipalId: string;
  }): Promise<number> {
    let epoch = 0;
    await this.db.transaction().execute(async (tx) => {
      const current = await sql<{ rotation_epoch: number }>`
        UPDATE control.atlas_tenant_provider_credential_epoch
        SET rotation_epoch=rotation_epoch+1,revoked=true,updated_at=now()
        WHERE tenant_id=${input.tenantId}::uuid AND provider_id=${input.providerId}
        RETURNING rotation_epoch
      `.execute(tx);
      if (!current.rows[0]) return;
      epoch = Number(current.rows[0].rotation_epoch);
      await sql`UPDATE control.atlas_tenant_provider_credential
        SET status='revoked',revoked_at=now(),updated_at=now(),updated_by=${input.actorPrincipalId}::uuid,
            rotation_epoch=${epoch}
        WHERE tenant_id=${input.tenantId}::uuid AND provider_id=${input.providerId} AND status='active'`
        .execute(tx);
      await sql`INSERT INTO log.atlas_byok_audit
        (tenant_id,provider_id,event,rotation_epoch,actor_principal_id)
        VALUES (${input.tenantId}::uuid,${input.providerId},'revoked',${epoch},${input.actorPrincipalId}::uuid)`
        .execute(tx);
    });
    if (epoch > 0) {
      await this.revocations.publish({ tenantId: input.tenantId, providerId: input.providerId, rotationEpoch: epoch });
    }
    return epoch;
  }

  async reEncryptTenant(tenantId: string): Promise<number> {
    await this.keys.rotateKek(tenantId);
    const rows = await sql<{ id: string; encrypted_secret: string }>`
      SELECT id,encrypted_secret FROM control.atlas_tenant_provider_credential
      WHERE tenant_id=${tenantId}::uuid AND status IN ('active','superseded')
    `.execute(this.db);
    let count = 0;
    for (const row of rows.rows) {
      const encrypted = await this.encryption.reEncrypt(tenantId, row.encrypted_secret);
      if (!encrypted) continue;
      const parsed = JSON.parse(encrypted) as { v: number };
      await sql`UPDATE control.atlas_tenant_provider_credential
        SET encrypted_secret=${encrypted},key_version=${parsed.v},updated_at=now()
        WHERE tenant_id=${tenantId}::uuid AND id=${row.id}::uuid`.execute(this.db);
      count += 1;
    }
    return count;
  }
}
