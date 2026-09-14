// Local development only: additive capability provisioning; no new users, memberships, or role assignments.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const root = new URL("../../../", import.meta.url).pathname.replace(/\/$/, "");
const { Client } = createRequire(root + "/server/db/package.json")("pg");
const host = execFileSync(
  "docker",
  [
    "inspect",
    "athyper-dev-db-1",
    "--format",
    "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
  ],
  { encoding: "utf8" },
).trim();
const password = execFileSync(
  "docker",
  ["exec", "athyper-dev-db-1", "sh", "-c", 'cat "$POSTGRES_PASSWORD_FILE"'],
  { encoding: "utf8" },
).trim();
if (!process.argv.includes("--apply"))
  throw Error(
    "Use --apply to add Atlas permissions to existing local tenant administrator roles.",
  );
for (const plane of ["neon", "mesh", "studio"]) {
  const db = new Client({
    host,
    user: "postgres",
    password,
    database: "athyper_" + plane,
  });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query(
      readFileSync(
        root +
          "/server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260907_atlas_conversation_runtime_access.sql",
        "utf8",
      ),
    );
    const pack = JSON.parse(
      readFileSync(
        root +
          "/server/db/seed/packs/authorization-v2/" +
          plane +
          "/seed-pack.v1.json",
        "utf8",
      ),
    );
    const p = pack.permissionCatalog.operations.find(
      (p) => p.canonicalPermissionCode === plane + ".ai.agent.use",
    );
    if (!p) throw Error("permission absent");
    const actor = (
      await db.query(
        "SELECT id FROM master.principal WHERE code='seed.three-plane-provisioner' AND status='active' LIMIT 1",
      )
    ).rows[0].id;
    const module = (
      await db.query(
        "SELECT id FROM master.module WHERE code=$1 AND status='active'",
        [p.moduleCode],
      )
    ).rows[0].id;
    await db.query(
      `INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,metadata,status,created_by)
VALUES($1,$2,'capability',$3,$4,$5,false,false,false,$6::jsonb,'published',$7) ON CONFLICT(canonical_code) DO NOTHING`,
      [
        p.permissionId,
        p.canonicalPermissionCode,
        module,
        p.riskTier,
        p.requiresMfa,
        JSON.stringify({
          _seed: {
            source: "atlas-conversation-enablement:v1",
            plane,
            definitionSha256: p.definitionSha256,
          },
        }),
        actor,
      ],
    );
    const actual = (
      await db.query(
        "SELECT id FROM authz.permission WHERE canonical_code=$1 AND status='published'",
        [p.canonicalPermissionCode],
      )
    ).rows[0];
    if (actual?.id !== p.permissionId) throw Error("permission conflict");
    await db.query(
      "INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by) VALUES($1,'tenant','exact','active',$2) ON CONFLICT DO NOTHING",
      [p.permissionId, actor],
    );
    const roles = (
      await db.query(
        "SELECT id,tenant_id,created_by FROM authz.role WHERE code=$1 AND source_ref='local-demo:three-tenant-authorization:v1' AND status='active'",
        ["demo." + plane + ".testing-admin-tenant-exact"],
      )
    ).rows;
    for (const role of roles) {
      await db.query(
        "SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",
        [role.tenant_id, role.created_by],
      );
      await db.query(
        "UPDATE authz.role SET status='suspended',updated_by=$2 WHERE id=$1",
        [role.id, role.created_by],
      );
      await db.query(
        "INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,role_id,permission_id) DO NOTHING",
        [role.tenant_id, role.id, p.permissionId, role.created_by],
      );
      await db.query(
        "UPDATE authz.role SET status='active',updated_by=$2 WHERE id=$1",
        [role.id, role.created_by],
      );
    }
    await db.query("COMMIT");
    console.log(
      plane +
        ": Atlas capability ready; existing tenant admin roles=" +
        roles.length,
    );
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    await db.end();
  }
}
