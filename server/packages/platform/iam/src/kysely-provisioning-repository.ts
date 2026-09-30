import { sql, type Transaction } from "kysely";
import type { ProvisioningRequest } from "./provisioning.js";
import type { ProvisioningCreateRepository } from "./provisioning-vertical.js";

type Database = Record<string, never>;
export type ProvisioningTransaction = Transaction<Database>;

type Row = {
  id: string; idempotency_key: string; request_fingerprint: string; authority_tenant_id: string;
  realm_key: string; normalized_identifier: string; display_identifier: string; target_planes: string[];
  status: ProvisioningRequest["state"]; provider_subject: string | null; failure_reason: string | null; row_version: number;
};

export function createKyselyProvisioningRepository(): ProvisioningCreateRepository<ProvisioningTransaction> {
  return {
    async createOrReplay(input, transaction) {
      const inserted = await sql<Row>`
        INSERT INTO trustiam.identity_provisioning_request
          (id, authority_tenant_id, subject_key, idempotency_key, request_fingerprint,
           realm_key, normalized_identifier, display_identifier, target_planes, status,
           row_version, created_by)
        VALUES
          (${input.id}::uuid, ${input.tenantId}::uuid, ${input.subjectKey}, ${input.idempotencyKey},
           ${input.requestFingerprint}, ${input.realmKey}, ${input.normalizedIdentifier},
           ${input.displayIdentifier}, ${input.planes}::text[], ${input.state}, ${input.version},
           current_setting('app.current_principal_id')::uuid)
        ON CONFLICT DO NOTHING
        RETURNING id, idempotency_key, request_fingerprint, authority_tenant_id, realm_key,
                  normalized_identifier, display_identifier, target_planes, status,
                  provider_subject, failure_reason, row_version
      `.execute(transaction);
      const created = inserted.rows[0];
      if (created) return { kind: "created", request: fromRow(created) };

      const existing = await sql<Row>`
        SELECT id, idempotency_key, request_fingerprint, authority_tenant_id, realm_key,
               normalized_identifier, display_identifier, target_planes, status,
               provider_subject, failure_reason, row_version
          FROM trustiam.identity_provisioning_request
         WHERE authority_tenant_id = ${input.tenantId}::uuid
           AND (idempotency_key = ${input.idempotencyKey} OR subject_key = ${input.subjectKey})
         ORDER BY CASE WHEN idempotency_key = ${input.idempotencyKey} THEN 0 ELSE 1 END
         LIMIT 1 FOR UPDATE
      `.execute(transaction);
      const row = existing.rows[0];
      if (!row) throw new Error("Provisioning request disappeared after uniqueness conflict");
      // A subject collision must not acknowledge an idempotency key we never stored.
      // Otherwise that key could later create a different request after a successful replay.
      if (row.idempotency_key !== input.idempotencyKey || row.request_fingerprint !== input.requestFingerprint) return { kind: "conflict" };
      return { kind: "replay", request: fromRow(row) };
    },
  };
}

function fromRow(row: Row): ProvisioningRequest {
  return Object.freeze({
    id: row.id, idempotencyKey: row.idempotency_key, requestFingerprint: row.request_fingerprint,
    tenantId: row.authority_tenant_id, realmKey: row.realm_key,
    normalizedIdentifier: row.normalized_identifier, displayIdentifier: row.display_identifier,
    planes: Object.freeze([...row.target_planes]) as unknown as ProvisioningRequest["planes"], state: row.status,
    ...(row.provider_subject ? { providerSubject: row.provider_subject } : {}),
    ...(row.failure_reason ? { failureReason: row.failure_reason } : {}), version: row.row_version,
  });
}
