#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

import { compileEntityPlaneArtifact } from "@athyper/svc-meta-entity-authoring";

function argument(name: string) {
  return process.argv.find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

const adminUrl = argument("--admin-url");
const adminDatabase = argument("--admin-database");
const meshUrl = argument("--mesh-url");
const meshDatabase = argument("--mesh-database");
if (!adminUrl || !adminDatabase || !meshUrl || !meshDatabase) {
  throw new Error("Explicit Admin/Mesh URLs and database guards required");
}

const config = JSON.parse(await readFile(resolve(
  import.meta.dirname,
  "../../../db/scripts/verify/config/p5-h-mesh-consumer-certification.v1.json",
), "utf8")) as {
  contractVersion: string;
  entityCode: string;
  expectedOperations: string[];
  currentReleaseHash: string;
  currentArtifactHash: string;
  requiredRolloutMode: string;
};
const [runtimeSource, meshConsumerSource, auditSinkSource] = await Promise.all([
  readFile(resolve(import.meta.dirname, "../../../src/runtimes/api.ts"), "utf8"),
  readFile(resolve(import.meta.dirname, "../../../../apps/mesh/lib/server/mesh-runtime.ts"), "utf8"),
  readFile(resolve(import.meta.dirname, "../../../packages/services/iam/authorization-runtime/sql-audit-sink.ts"), "utf8"),
]);

const admin = new pg.Client({ connectionString: adminUrl });
const mesh = new pg.Client({ connectionString: meshUrl });
await Promise.all([admin.connect(), mesh.connect()]);
try {
  const [adminIdentity, meshIdentity] = await Promise.all([
    admin.query<{ database_name: string }>("select current_database() database_name"),
    mesh.query<{ database_name: string }>("select current_database() database_name"),
  ]);
  if (adminIdentity.rows[0]?.database_name !== adminDatabase
    || meshIdentity.rows[0]?.database_name !== meshDatabase) {
    throw new Error("P5-H database guard rejected target");
  }

  const source = (await admin.query<{
    entity_id: string; release_id: string; release_hash: string;
    revision_id: string; revision_hash: string; contract_hash: string;
    contract_json: Record<string, unknown>;
  }>(`select e.id::text entity_id,r.id::text release_id,r.release_hash,
      r.revision_id::text,s.revision_hash,r.contract_hash,s.contract_json
    from metadata.entity e
    join metadata.entity_release r on r.entity_id=e.id
    join snapshot.entity_contract_revision s on s.id=r.revision_id
    where e.tenant_id is null and e.entity_code=$1
    order by r.release_no desc limit 1`, [config.entityCode])).rows[0];
  if (!source) throw new Error("P5-H source release missing");

  const candidate = compileEntityPlaneArtifact({
    plane: "mesh", entityId: source.entity_id, entityCode: config.entityCode,
    releaseId: source.release_id, releaseHash: source.release_hash,
    revisionId: source.revision_id, revisionHash: source.revision_hash,
    contractHash: source.contract_hash, contract: source.contract_json,
  });
  const candidateHash = (await admin.query<{ hash: string }>(
    "select snapshot.fn_compute_entity_release_artifact_hash($1::uuid,$2::uuid,$3::uuid,'mesh',$4,$5,$6::jsonb) hash",
    [source.release_id, source.revision_id, source.entity_id, source.release_hash,
      source.contract_hash, JSON.stringify(candidate)],
  )).rows[0]!.hash;

  const bindings = await mesh.query<{
    operation_key: string; source_release_hash: string;
    source_compiled_hash: string; permission_status: string;
  }>(`select b.operation_key,b.source_release_hash,b.source_compiled_hash,
      p.status::text permission_status
    from authz.entity_operation_binding b
    join authz.permission p on p.id=b.permission_id
    where b.plane_code='mesh' and b.entity_code=$1 and b.tenant_id is null
      and b.status='published' order by b.operation_key`, [config.entityCode]);
  const rollout = await mesh.query<{ operation_key: string; mode: string }>(
    `select b.operation_key,r.mode
     from authz.entity_operation_binding b
     left join ops.authorization_operation_rollout r
       on r.plane_code=b.plane_code
      and r.source_entity_operation_id=b.source_entity_operation_id
     where b.plane_code='mesh' and b.entity_code=$1 and b.tenant_id is null
       and b.status='published' order by b.operation_key`, [config.entityCode],
  );
  const qualification = await mesh.query<{
    operation_key: string; sample_count: string; mismatch_count: string;
    candidate_error_count: string; required_cohort_count: number;
    covered_cohort_count: number; qualifies_default: boolean;
  }>(`select b.operation_key,q.sample_count::text,q.mismatch_count::text,
      q.candidate_error_count::text,q.required_cohort_count,
      q.covered_cohort_count,q.qualifies_default
    from authz.entity_operation_binding b
    join ops.authorization_shadow_qualification_v q
      on q.plane_code=b.plane_code and q.entity_code=b.entity_code
     and q.source_entity_operation_id=b.source_entity_operation_id
     and q.source_release_hash=b.source_release_hash
     and q.source_artifact_hash=b.source_compiled_hash
    where b.plane_code='mesh' and b.entity_code=$1 and b.tenant_id is null
      and b.status='published' order by b.operation_key`, [config.entityCode]);
  const protections = await mesh.query<{
    schemaname: string; tablename: string; rowsecurity: boolean;
    forcerowsecurity: boolean;
  }>(`select n.nspname schemaname,c.relname tablename,
      c.relrowsecurity rowsecurity,c.relforcerowsecurity forcerowsecurity
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where (n.nspname,c.relname) in (
      ('authz','entity_operation_binding'),
      ('authz','entity_operation_scope_binding'),
      ('ops','authorization_operation_rollout'),
      ('ops','authorization_shadow_comparison'),
      ('audit','authorization_decision_evidence')) order by 1,2`);

  const operations = bindings.rows.map((row) => row.operation_key);
  const bindingCoverage = config.expectedOperations.every((key) => operations.includes(key))
    && operations.length === config.expectedOperations.length;
  const permissionReady = bindings.rows.every((row) => row.permission_status === "published");
  const rolloutShadow = rollout.rows.length === config.expectedOperations.length
    && rollout.rows.every((row) => row.mode === config.requiredRolloutMode);
  const rlsReady = protections.rows.length === 5
    && protections.rows.every((row) => row.rowsecurity && row.forcerowsecurity);
  const parityClean = qualification.rows.length === config.expectedOperations.length
    && qualification.rows.every((row) => Number(row.mismatch_count) === 0
      && Number(row.candidate_error_count) === 0
      && row.covered_cohort_count === row.required_cohort_count);
  const activationQualified = qualification.rows.length === config.expectedOperations.length
    && qualification.rows.every((row) => row.qualifies_default);
  const currentCoordinate = bindings.rows.every((row) =>
    row.source_release_hash === config.currentReleaseHash
      && row.source_compiled_hash === config.currentArtifactHash);
  const runtimeWiring = runtimeSource.includes("withNormalizedOperationScopeRollout(meshLegacyAuthorization")
    && runtimeSource.includes('new SqlNormalizedEntitlementResolver(meshDb.kysely as unknown as never, "mesh")')
    && runtimeSource.includes('new SqlOperationScopeRolloutResolver(meshDb.kysely as unknown as never, "mesh")')
    && meshConsumerSource.includes("/api/mesh/runtime/entities/");
  const accountAuditWiring = auditSinkSource.includes("INSERT INTO audit.authorization_decision_evidence")
    && auditSinkSource.includes("FROM mesh.network_account")
    && auditSinkSource.includes("networkAccountId");
  const successorImportPending = candidateHash !== config.currentArtifactHash;
  const integrationPassed = bindingCoverage && permissionReady && rolloutShadow
    && rlsReady && parityClean && currentCoordinate && runtimeWiring && accountAuditWiring;

  process.stdout.write(JSON.stringify({
    contractVersion: config.contractVersion,
    status: integrationPassed
      ? activationQualified ? "certified" : "integration_certified_activation_pending"
      : "failed",
    integrationPassed, activationQualified, successorImportPending,
    current: { releaseHash: config.currentReleaseHash, artifactHash: config.currentArtifactHash },
    approvedCandidate: {
      schema: `${candidate.artifact_schema_code}@${candidate.artifact_schema_version}`,
      compiledHash: candidateHash,
    },
    checks: { bindingCoverage, permissionReady, rolloutShadow, rlsReady,
      parityClean, currentCoordinate, runtimeWiring, accountAuditWiring },
    protections: protections.rows,
    qualification: qualification.rows,
  }, null, 2) + "\n");
  if (!integrationPassed) process.exitCode = 2;
} finally {
  await Promise.all([admin.end(), mesh.end()]);
}
