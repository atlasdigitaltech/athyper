#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";

// Explicit, release-pinned local correction manifest; never infer permissions
// from Entity names or restore broad historical admin grants.
const manifestPath = process.argv
  .find((arg) => arg.startsWith("--manifest="))
  ?.slice(11);
if (!manifestPath || !process.env.DATABASE_ADMIN_URL)
  throw Error("--manifest and DATABASE_ADMIN_URL required");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
  plane: string;
  database: string;
  bindingIds: string[];
  tenantIds: string[];
};
if (
  !["studio", "neon", "mesh"].includes(manifest.plane) ||
  manifest.database !== `athyper_${manifest.plane}` ||
  !manifest.bindingIds?.length ||
  !manifest.tenantIds?.length
)
  throw Error("Invalid correction scope");
const localDatabase = JSON.parse(
  execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }),
)[0];
const connection = new URL(process.env.DATABASE_ADMIN_URL);
const localAddresses = Object.values(
  localDatabase.NetworkSettings.Networks,
).map((network: any) => network.IPAddress);
if (
  localDatabase.Config.Labels["com.docker.compose.project"] !== "athyper-dev" ||
  !localAddresses.includes(connection.hostname) ||
  (connection.port && connection.port !== "5432")
)
  throw Error("Exact local DEV database required");
const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
const source = "local-dev:published-reference-readers:20261010";
const code = "shared.reference.reader";
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    source,
  ]);
  const db = (await client.query("SELECT current_database() AS name")).rows[0]
    .name;
  if (db !== manifest.database) throw Error("Wrong correction database");
  await client.query("SELECT set_config('app.database_plane',$1,true)", [
    manifest.plane,
  ]);
  const protectedSnapshot = async () =>
    JSON.stringify(
      (
        await client.query(`
    SELECT * FROM (SELECT 'permission' AS kind,to_jsonb(p) AS row FROM authz.permission p
    UNION ALL SELECT 'deny',to_jsonb(d) FROM authz.deny_rule d
    UNION ALL SELECT 'membership',to_jsonb(m) FROM authz.plane_membership m
    ) snapshots ORDER BY kind,row::text
  `)
      ).rows,
    );
  const before = await protectedSnapshot();
  const bindings = (
    await client.query(
      `
    SELECT b.id,b.permission_id,b.entity_code,b.operation_key,b.source_release_id
    FROM authz.entity_operation_binding b
    JOIN authz.permission p ON p.id=b.permission_id AND p.status='published'
    JOIN authz.permission_scope_kind s ON s.permission_id=p.id AND s.scope_kind='tenant'
      AND s.propagation_mode='exact' AND s.status='active'
    WHERE b.id=ANY($1::uuid[]) AND b.status='published' AND b.tenant_id IS NULL
      AND b.plane_code=$2 AND b.operation_key IN ('list','read')
      AND b.effective_from<=statement_timestamp()
      AND (b.effective_until IS NULL OR b.effective_until>statement_timestamp())
  `,
      [manifest.bindingIds, manifest.plane],
    )
  ).rows;
  if (bindings.length !== new Set(manifest.bindingIds).size)
    throw Error("Missing or ineligible published read binding");
  const permissions = [...new Set(bindings.map((b) => b.permission_id))].sort();
  const result = [];
  for (const tenantId of manifest.tenantIds) {
    const scope = (
      await client.query(
        `SELECT s.id FROM authz.scope_target s JOIN master.tenant t ON t.id=s.tenant_id
      WHERE t.id=$1 AND t.status='active' AND s.scope_kind='tenant' AND s.target_id=t.id AND s.status='active'`,
        [tenantId],
      )
    ).rows;
    const actor = (
      await client.query(
        "SELECT id FROM master.principal WHERE tenant_id=$1 AND code=$2 AND status='active'",
        [tenantId, "seed.three-plane-provisioner"],
      )
    ).rows[0]?.id;
    if (scope.length !== 1 || !actor)
      throw Error("Missing active tenant scope/provisioning actor");
    await client.query(
      "SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",
      [tenantId, actor],
    );
    let role = (
      await client.query(
        "SELECT id,status,source_ref FROM authz.role WHERE tenant_id=$1 AND code=$2",
        [tenantId, code],
      )
    ).rows[0];
    if (!role) {
      role = { id: randomUUID(), status: "draft", source_ref: source };
      await client.query(
        `INSERT INTO authz.role(id,tenant_id,code,name,role_kind,source_type,source_ref,status,created_by)
        VALUES($1,$2,$3,'Shared reference reader','custom','manual',$4,'draft',$5)`,
        [role.id, tenantId, code, source, actor],
      );
      for (const permission of permissions)
        await client.query(
          `INSERT INTO authz.role_permission(id,tenant_id,role_id,permission_id,created_by) VALUES($1,$2,$3,$4,$5)`,
          [randomUUID(), tenantId, role.id, permission, actor],
        );
      await client.query(
        "UPDATE authz.role SET status='active',updated_by=$2 WHERE id=$1",
        [role.id, actor],
      );
      role.status = "active";
    }
    if (role.source_ref !== source)
      throw Error("Existing role belongs to another provisioning source");
    const actual = (
      await client.query(
        "SELECT permission_id FROM authz.role_permission WHERE tenant_id=$1 AND role_id=$2 ORDER BY permission_id",
        [tenantId, role.id],
      )
    ).rows.map((r) => r.permission_id);
    if (JSON.stringify(actual) !== JSON.stringify(permissions))
      throw Error("Existing role permission drift; no implicit expansion");
    if (role.status !== "active") {
      result.push({ tenantId, skipped: "role inactive" });
      continue;
    }
    let group = (
      await client.query(
        "SELECT id,status,source_ref FROM authz.principal_group WHERE tenant_id=$1 AND code=$2",
        [tenantId, code],
      )
    ).rows[0];
    if (!group) {
      group = { id: randomUUID(), status: "active", source_ref: source };
      await client.query(
        `INSERT INTO authz.principal_group(id,tenant_id,code,name,group_kind,source_type,source_ref,status,created_by) VALUES($1,$2,$3,'Shared reference readers','custom','manual',$4,'active',$5)`,
        [group.id, tenantId, code, source, actor],
      );
    }
    if (group.source_ref !== source)
      throw Error("Existing group belongs to another source");
    if (group.status !== "active") {
      result.push({ tenantId, skipped: "group inactive" });
      continue;
    }
    await client.query(
      `INSERT INTO authz.group_role(id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by)
      SELECT $1,$2,$3,$4,$5,'exact','manual',$6,'active',$7
      WHERE NOT EXISTS(SELECT 1 FROM authz.group_role WHERE tenant_id=$2 AND group_id=$3 AND role_id=$4 AND scope_target_id=$5)`,
      [randomUUID(), tenantId, group.id, role.id, scope[0].id, source, actor],
    );
    const inserted = await client.query(
      `INSERT INTO authz.group_member(id,tenant_id,group_id,principal_id,source_type,source_ref,status,created_by)
      SELECT gen_random_uuid(),p.tenant_id,$2,p.id,'manual',$3,'active',$4 FROM master.principal p
      WHERE p.tenant_id=$1 AND p.status='active' AND p.principal_type='user'
      AND EXISTS(SELECT 1 FROM authz.plane_membership m WHERE m.tenant_id=p.tenant_id AND m.principal_id=p.id
        AND m.status='active' AND m.effective_from<=statement_timestamp() AND (m.effective_until IS NULL OR m.effective_until>statement_timestamp()))
      AND NOT EXISTS(SELECT 1 FROM authz.group_member g WHERE g.tenant_id=p.tenant_id AND g.principal_id=p.id AND g.group_id=$2)`,
      [tenantId, group.id, source, actor],
    );
    result.push({ tenantId, newMembers: inserted.rowCount });
  }
  if ((await protectedSnapshot()) !== before)
    throw Error("Protected authorization state changed");
  await client.query(process.argv.includes("--apply") ? "COMMIT" : "ROLLBACK");
  console.log(
    JSON.stringify({
      plane: manifest.plane,
      mode: process.argv.includes("--apply") ? "applied" : "rehearsed",
      permissions,
      bindings,
      result,
    }),
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
