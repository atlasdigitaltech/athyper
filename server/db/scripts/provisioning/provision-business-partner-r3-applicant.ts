#!/usr/bin/env tsx
import { Client } from "pg";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

/** Local acceptance admission only. IAM must already contain this dedicated subject. */
export async function provisionR3Applicant(input: {
  databaseUrl: string;
  subjectId: string;
  confirmation: string;
}) {
  const url = new URL(input.databaseUrl);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/athyper_neon" ||
    input.confirmation !== "LOCAL-NEON-BP-R3-APPLICANT"
  )
    throw new Error(
      "R3 applicant provisioning requires the explicit local NEON boundary",
    );
  if (!/^[0-9a-f-]{36}$/i.test(input.subjectId))
    throw new Error("An existing IAM subject UUID is required");
  const client = new Client({ connectionString: input.databaseUrl });
  const tenant = "11111111-1111-4111-8111-111111111111",
    actor = "d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c",
    code = "acceptance.bp.r3.applicant";
  const principal = id("principal"),
    group = id("group"),
    role = id("role");
  const metadata = JSON.stringify({
    _seed: { pack: "acceptance.business-partner-r3.v1" },
    environment: "local_acceptance",
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,0)),set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',$2,true),set_config('app.current_principal_id',$3,true)",
      [code, tenant, actor],
    );
    await client.query(
      `INSERT INTO master.principal(id,tenant_id,code,name,principal_type,metadata,created_by)
      VALUES($1,$2,$3,'R3 restricted supplier applicant','user',$4::jsonb,$5) ON CONFLICT(tenant_id,id) DO NOTHING`,
      [principal, tenant, code, metadata, actor],
    );
    await client.query(
      `INSERT INTO master.principal_identity_binding(tenant_id,principal_id,provider_code,realm_key,subject_id,username,is_primary,status,synced_at,sync_status,metadata,created_by)
      VALUES($1,$2,'keycloak','athyper',$3,$4,true,'active',now(),'synced',$5::jsonb,$6) ON CONFLICT DO NOTHING`,
      [tenant, principal, input.subjectId, code, metadata, actor],
    );
    await client.query(
      `INSERT INTO authz.plane_membership(id,tenant_id,principal_id,source_type,source_ref,metadata,status,created_by)
      VALUES($1,$2,$3,'seed',$4,$5::jsonb,'active',$6) ON CONFLICT(id) DO NOTHING`,
      [id("admission"), tenant, principal, code, metadata, actor],
    );
    await client.query(
      `INSERT INTO authz.principal_group(id,tenant_id,code,name,group_kind,source_type,source_ref,metadata,created_by)
      VALUES($1,$2,$3,'R3 restricted applicant','system','seed',$3,$4::jsonb,$5) ON CONFLICT(id) DO NOTHING`,
      [group, tenant, code, metadata, actor],
    );
    await client.query(
      `INSERT INTO authz.group_member(id,tenant_id,group_id,principal_id,source_type,source_ref,metadata,created_by)
      VALUES($1,$2,$3,$4,'seed',$5,$6::jsonb,$7) ON CONFLICT(id) DO NOTHING`,
      [id("member"), tenant, group, principal, code, metadata, actor],
    );
    await client.query(
      `INSERT INTO authz.role(id,tenant_id,code,name,role_kind,source_type,source_ref,metadata,status,created_by)
      VALUES($1,$2,$3,'R3 supplier application response only','system','seed',$3,$4::jsonb,'draft',$5) ON CONFLICT(id) DO NOTHING`,
      [role, tenant, code, metadata, actor],
    );
    await client.query(
      `INSERT INTO authz.role_permission(id,tenant_id,role_id,permission_id,created_by)
      SELECT $1,$2,$3,id,$4 FROM authz.permission WHERE canonical_code='neon.supplier_registration.external.respond' AND status='published' AND NOT EXISTS(SELECT 1 FROM authz.role_permission WHERE tenant_id=$2 AND role_id=$3)
      ON CONFLICT(tenant_id,role_id,permission_id) DO NOTHING`,
      [id("permission"), tenant, role, actor],
    );
    await client.query(
      "UPDATE authz.role SET status='active',updated_by=$3 WHERE tenant_id=$1 AND id=$2 AND status='draft'",
      [tenant, role, actor],
    );
    await client.query(
      `INSERT INTO authz.group_role(id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,metadata,created_by)
      SELECT $1,$2,$3,$4,id,'exact','seed',$5,$6::jsonb,$7 FROM authz.scope_target WHERE tenant_id=$2 AND scope_kind='tenant' AND target_id=$2 AND status='active'
      ON CONFLICT(id) DO NOTHING`,
      [id("grant"), tenant, group, role, code, metadata, actor],
    );
    const permissions = await client.query<{ code: string }>(
      `SELECT DISTINCT p.canonical_code code FROM authz.group_member gm JOIN authz.group_role gr ON gr.tenant_id=gm.tenant_id AND gr.group_id=gm.group_id
      JOIN authz.role_permission rp ON rp.tenant_id=gr.tenant_id AND rp.role_id=gr.role_id JOIN authz.permission p ON p.id=rp.permission_id
      WHERE gm.tenant_id=$1 AND gm.principal_id=$2 AND gm.status='active' AND gr.status='active'`,
      [tenant, principal],
    );
    if (
      permissions.rows.length !== 1 ||
      permissions.rows[0]?.code !==
        "neon.supplier_registration.external.respond"
    )
      throw new Error(
        "Applicant authority drift: expected only supplier application response",
      );
    const binding = await client.query(
      `SELECT 1 FROM master.principal_identity_binding WHERE tenant_id=$1 AND principal_id=$2 AND subject_id=$3 AND status='active'`,
      [tenant, principal, input.subjectId],
    );
    if (binding.rowCount !== 1)
      throw new Error("Applicant subject binding mismatch");
    await client.query("COMMIT");
    return {
      principalId: principal,
      username: code,
      permissions: permissions.rows.map((r) => r.code),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
function id(key: string) {
  const b = createHash("sha256")
    .update(`acceptance.business-partner-r3.v1:${key}`)
    .digest()
    .subarray(0, 16);
  b[6] = (b[6]! & 15) | 80;
  b[8] = (b[8]! & 63) | 128;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  console.log(
    JSON.stringify(
      await provisionR3Applicant({
        databaseUrl: process.env.ATHYPER_NEON_DATABASE_ADMIN_URL ?? "",
        subjectId: process.env.BP_R3_APPLICANT_SUBJECT_ID ?? "",
        confirmation: process.argv[2] ?? "",
      }),
    ),
  );
