import { sql, type Transaction } from "kysely";

/** Resolve only a recipient-local, active publication matching every link coordinate. */
export async function resolveMeshExternalReferenceCode(
  link: Readonly<Record<string, unknown>>,
  tx: Transaction<Record<string, never>>,
): Promise<string | undefined> {
  const result = await sql<{ code: unknown }>`
    SELECT s.payload_json #>> '{partner,accountCode}' AS code
    FROM control.mesh_business_partner_profile_projection p
    JOIN snapshot.mesh_business_partner_profile_received s
      ON s.tenant_id=p.tenant_id AND s.id=p.current_snapshot_id
      AND s.source_tenant_id=p.source_tenant_id
      AND s.source_network_account_id=p.source_network_account_id
      AND s.recipient_network_account_id=p.recipient_network_account_id
      AND s.network_relationship_id=p.network_relationship_id
    WHERE p.tenant_id=${link["tenant_id"]}::uuid
      AND p.id=${link["profile_projection_id"]}::uuid
      AND p.source_tenant_id=${link["source_tenant_id"]}::uuid
      AND p.source_network_account_id=${link["source_network_account_id"]}::uuid
      AND p.recipient_network_account_id=${link["recipient_network_account_id"]}::uuid
      AND p.network_relationship_id=${link["network_relationship_id"]}::uuid
      AND p.projection_status='active'
      AND s.schema_code='mesh.business_partner_profile'
      AND s.schema_version IN (1,2)
      AND s.field_set_code='recipient_safe_v' || s.schema_version::text
      AND jsonb_typeof(s.payload_json #> '{partner,accountCode}')='string'
  `.execute(tx);
  const code = result.rows[0]?.code;
  return typeof code === "string" &&
    code.trim() &&
    code.length <= 200 &&
    !/[\x00-\x1f\x7f]/.test(code)
    ? code.trim()
    : undefined;
}
