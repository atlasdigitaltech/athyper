#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

type Plane = "neon" | "mesh";
interface Cohort { code: string; requires: string[] }
interface Campaign { contractVersion: string; cohorts: Cohort[] }
interface BindingRow {
  entity_code: string; operation_key: string; decision_mode: string;
  source_entity_operation_id: string; source_release_hash: string; source_compiled_hash: string;
  requires_mfa: boolean; requires_sod: boolean; is_shareable: boolean;
  is_delegable: boolean; is_overridable: boolean; scopes: string[];
  tenant_specific_binding: boolean; sample_count: string | null; mismatch_count: string | null;
  candidate_error_count: string | null; observed_from: string | null; observed_through: string | null;
  qualifies_default: boolean | null;
}

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}
function satisfies(row: BindingRow, requirement: string): boolean {
  switch (requirement) {
    case "entity_resource_binding": return row.decision_mode === "entity_resource";
    case "assignable_non_resource_scope": return row.scopes.some((scope) => scope !== "resource");
    case "collection_binding": return row.decision_mode === "collection";
    case "is_shareable": return row.is_shareable;
    case "is_delegable": return row.is_delegable;
    case "is_overridable": return row.is_overridable;
    case "requires_mfa": return row.requires_mfa;
    case "requires_sod": return row.requires_sod;
    case "resource_scope": return row.scopes.includes("resource");
    case "non_tenant_scope": return row.scopes.some((scope) => scope !== "tenant");
    case "tenant_specific_binding": return row.tenant_specific_binding;
    default: throw new Error(`Unknown campaign requirement: ${requirement}`);
  }
}

async function inspect(plane: Plane, url: string, expectedDatabase: string, campaign: Campaign) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const identity = await client.query<{ database_name: string }>("SELECT current_database() database_name");
    if (identity.rows[0]?.database_name !== expectedDatabase) throw new Error(`P5-E5 ${plane} database guard rejected the target`);
    const result = await client.query<BindingRow>(`
      SELECT b.entity_code,b.operation_key,b.decision_mode::text,
             b.source_entity_operation_id::text,b.source_release_hash,b.source_compiled_hash,
             p.requires_mfa,p.requires_sod,p.is_shareable,p.is_delegable,p.is_overridable,
             array_agg(DISTINCT scope.scope_kind::text ORDER BY scope.scope_kind::text) scopes,
             bool_or(b.tenant_id IS NOT NULL) tenant_specific_binding,
             q.sample_count::text,q.mismatch_count::text,q.candidate_error_count::text,
             q.observed_from::text,q.observed_through::text,q.qualifies_default
        FROM authz.entity_operation_binding b
        JOIN authz.entity_operation_scope_binding scope ON scope.entity_operation_binding_id=b.id
        JOIN authz.permission p ON p.id=b.permission_id
        LEFT JOIN ops.authorization_shadow_qualification_v q
          ON q.plane_code=b.plane_code AND q.entity_code=b.entity_code
         AND q.source_entity_operation_id=b.source_entity_operation_id
         AND q.source_release_hash=b.source_release_hash AND q.source_artifact_hash=b.source_compiled_hash
       WHERE b.plane_code=$1 AND b.status='published'
       GROUP BY b.entity_code,b.operation_key,b.decision_mode,b.source_entity_operation_id,
                b.source_release_hash,b.source_compiled_hash,p.requires_mfa,p.requires_sod,
                p.is_shareable,p.is_delegable,p.is_overridable,q.sample_count,q.mismatch_count,
                q.candidate_error_count,q.observed_from,q.observed_through,q.qualifies_default
       ORDER BY b.entity_code,b.operation_key,b.decision_mode`, [plane]);
    if (process.argv.includes("--initialize-requirements")) {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.database_plane',$1,true)", [plane]);
      try {
        for (const row of result.rows) await client.query(`DELETE FROM ops.authorization_qualification_cohort_requirement
          WHERE plane_code=$1 AND entity_code=$2 AND source_entity_operation_id=$3::uuid
            AND source_release_hash=$4 AND source_artifact_hash=$5`, [plane,row.entity_code,
          row.source_entity_operation_id,row.source_release_hash,row.source_compiled_hash]);
        for (const row of result.rows) for (const cohort of campaign.cohorts) {
          if (!cohort.requires.every((requirement) => satisfies(row, requirement))) continue;
          await client.query(`INSERT INTO ops.authorization_qualification_cohort_requirement (
            plane_code,entity_code,source_entity_operation_id,source_release_hash,source_artifact_hash,cohort_code,created_by
          ) VALUES ($1,$2,$3::uuid,$4,$5,$6,'00000000-0000-0000-0000-000000000000'::uuid)
          ON CONFLICT DO NOTHING`, [plane,row.entity_code,row.source_entity_operation_id,
            row.source_release_hash,row.source_compiled_hash,cohort.code]);
        }
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    }
    return result.rows.map((row) => ({
      coordinate: `${plane}:${row.entity_code}:${row.operation_key}:${row.source_compiled_hash}`,
      mode: row.decision_mode,
      cohorts: campaign.cohorts.map((cohort) => ({
        code: cohort.code,
        applicable: cohort.requires.every((requirement) => satisfies(row, requirement)),
        missing: cohort.requires.filter((requirement) => !satisfies(row, requirement)),
      })),
      evidence: {
        samples: Number(row.sample_count ?? 0), mismatches: Number(row.mismatch_count ?? 0),
        candidateErrors: Number(row.candidate_error_count ?? 0), observedFrom: row.observed_from,
        observedThrough: row.observed_through, qualified: row.qualifies_default === true,
      },
    }));
  } finally { await client.end(); }
}

const neonUrl = argument("--neon-url") ?? process.env["NEON_DATABASE_URL"];
const meshUrl = argument("--mesh-url") ?? process.env["MESH_DATABASE_URL"];
const neonDatabase = argument("--neon-database");
const meshDatabase = argument("--mesh-database");
if (!neonUrl || !meshUrl || !neonDatabase || !meshDatabase) throw new Error("Explicit plane URLs and database guards are required");
const campaign = JSON.parse(await readFile(resolve(import.meta.dirname,
  "../verify/config/p5-e5-operation-scope-campaign.v1.json"), "utf8")) as Campaign;
const [neon, mesh] = await Promise.all([
  inspect("neon", neonUrl, neonDatabase, campaign), inspect("mesh", meshUrl, meshDatabase, campaign),
]);
const operations = [...neon, ...mesh];
const applicableCohorts = operations.flatMap((operation) => operation.cohorts.filter((cohort) => cohort.applicable)).length;
const blockedCohorts = operations.flatMap((operation) => operation.cohorts.filter((cohort) => !cohort.applicable)).length;
process.stdout.write(JSON.stringify({ campaign: campaign.contractVersion, generatedAt: new Date().toISOString(),
  summary: { operations: operations.length, applicableCohorts, blockedCohorts,
    qualifiedOperations: operations.filter((operation) => operation.evidence.qualified).length }, neon, mesh }, null, 2) + "\n");
