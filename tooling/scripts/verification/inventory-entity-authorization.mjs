// Read-only metadata/grant inventory. Never reads business payloads or credentials.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [environment, output] = process.argv.slice(2);
if (!["dev", "qa", "stg"].includes(environment) || !output)
  throw new Error(
    "Usage: node inventory-entity-authorization.mjs <dev|qa|stg> <output.json>",
  );
const query = (database, sql) => {
  const lines = execFileSync(
    "docker",
    [
      "exec",
      `athyper-${environment}-db-1`,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      database,
      "-Atc",
      `BEGIN READ ONLY; SET LOCAL statement_timeout='15s'; ${sql}; COMMIT;`,
    ],
    { encoding: "utf8", timeout: 20000, maxBuffer: 16000000 },
  )
    .split("\n")
    .filter((line) => line.startsWith("["));
  if (lines.length !== 1)
    throw new Error("Inventory aggregate result missing or ambiguous");
  return JSON.parse(lines[0]);
};
const report = {
  schemaVersion: 1,
  environment,
  capturedAt: new Date().toISOString(),
  scope:
    "Active descriptor rows, not a claim that every row is the effective activation head. Grants are role/scope aggregates, not effective principal decisions.",
  planes: [],
  failures: [],
};
for (const plane of ["studio", "neon", "mesh"]) {
  try {
    const entities = query(
      `athyper_${plane}`,
      `SELECT coalesce(jsonb_agg(jsonb_build_object(
      'entityCode',compiled_json->>'entityCode','descriptorHash',compiled_hash,
      'contractHash',source_contract_hash,'releaseId',release_id,'tenantId',tenant_id,
      'storage',compiled_json->'storage','directoryScope',compiled_json->'directoryScope',
      'authorization',compiled_json->'authorization','operations',compiled_json->'operations',
      'fields',(SELECT coalesce(jsonb_agg(jsonb_build_object('key',f->>'key','type',f->>'type',
        'readPermissionCode',f->>'readPermissionCode','writePermissionCode',f->>'writePermissionCode',
        'writableOn',f->'writableOn')),'[]'::jsonb) FROM jsonb_array_elements(coalesce(compiled_json->'fields','[]'::jsonb)) f),
      'related',compiled_json->'recordPresentation'->'related'
    ) ORDER BY compiled_json->>'entityCode',compiled_hash),'[]'::jsonb)
    FROM runtime_meta.entity_descriptor WHERE status='active'`,
    );
    const grants = query(
      `athyper_${plane}`,
      `SELECT coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) FROM (
      SELECT r.code role_code,p.canonical_code permission_code,s.scope_kind,count(*) assignment_count
      FROM authz.role_permission rp JOIN authz.permission p ON p.id=rp.permission_id
      JOIN authz.role r ON r.id=rp.role_id AND r.tenant_id=rp.tenant_id
      JOIN authz.group_role gr ON gr.role_id=r.id AND gr.tenant_id=r.tenant_id
      JOIN authz.scope_target s ON s.id=gr.scope_target_id AND s.tenant_id=gr.tenant_id
      WHERE gr.status='active' GROUP BY r.code,p.canonical_code,s.scope_kind
      ORDER BY r.code,p.canonical_code,s.scope_kind) g`,
    );
    report.planes.push({ plane, entities, grants });
  } catch {
    report.failures.push({
      plane,
      reason:
        "Inventory query failed; inspect local database availability/schema. No raw tool errors retained.",
    });
  }
}
mkdirSync(dirname(resolve(output)), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    output,
    planes: report.planes.map((p) => ({
      plane: p.plane,
      descriptors: p.entities.length,
      grantGroups: p.grants.length,
    })),
    failures: report.failures,
  }),
);
if (report.failures.length) process.exitCode = 1;
