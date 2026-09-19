#!/usr/bin/env tsx
// Read-only repeatable snapshot plus offline review compiler. Deliberately no apply option.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  compilePublicationPlan,
  headPin,
  digest,
  type PublicationSnapshot,
} from "./entity-authorization/publication-plan.mjs";

const [environment, tenantId, profilePath, manifestPath, output, ...extra] =
  process.argv.slice(2);
if (
  !["dev", "qa", "stg"].includes(environment ?? "") ||
  !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
    tenantId ?? "",
  ) ||
  !profilePath ||
  !manifestPath ||
  !output ||
  extra.length
)
  throw new Error(
    "Usage: tsx prepare-entity-authorization-publication.mts <dev|qa|stg> <tenant UUID> <profile.json> <bindings.json> <output.json>",
  );
const profile = JSON.parse(readFileSync(profilePath, "utf8"));
if (
  !["neon", "mesh", "studio"].includes(profile.planeKey) ||
  !/^[a-z][a-z0-9_]{1,126}$/.test(profile.entityCode)
)
  throw new Error("Invalid entity/plane coordinate");
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const query = `
SELECT jsonb_build_object(
 'schemaVersion',1,'environment','${environment}','capturedAt',transaction_timestamp(),'tenantId','${tenantId}',
 'planeKey','${profile.planeKey}','entityCode','${profile.entityCode}',
 'candidates',coalesce((SELECT jsonb_agg(jsonb_build_object(
 'publicationKey',h.publication_key,'appliedReleaseId',a.id,'headVersion',h.row_version,
 'headReleaseNo',h.source_release_no,'headArtifactHash',h.artifact_hash,'appliedStatus',a.status,
 'appliedPublicationKey',a.publication_key,'appliedReleaseNo',a.source_release_no,'appliedArtifactHash',a.artifact_hash,
 'appliedSourceReleaseId',a.source_release_id,'descriptorId',d.id,'descriptorStatus',d.status,'descriptorKind',d.descriptor_kind,
 'descriptorTenantId',d.tenant_id,'descriptorReleaseId',d.release_id,'descriptorContractHash',d.source_contract_hash,
 'contractStatus',c.status,'contractTenantId',c.tenant_id,'entityCode',c.entity_code,'planeKey',d.plane_code,
 'releaseId',c.release_id,'releaseNo',c.release_no,'contractHash',c.entity_contract_hash,'compiledHash',d.compiled_hash,'descriptor',d.compiled_json
 ) ORDER BY h.publication_key,d.id)
 FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id
 JOIN runtime_meta.entity_descriptor d ON d.applied_release_id=a.id JOIN runtime_meta.entity_contract c ON c.id=d.entity_contract_id
 WHERE c.entity_code='${profile.entityCode}' AND d.plane_code='${profile.planeKey}' AND (c.tenant_id IS NULL OR c.tenant_id='${tenantId}'::uuid)), '[]'::jsonb),
 'permissions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'code',p.canonical_code,'status',p.status,'kind',p.permission_kind,
 'scopes',coalesce((SELECT jsonb_agg(DISTINCT s.scope_kind ORDER BY s.scope_kind) FROM authz.permission_scope_kind s WHERE s.permission_id=p.id AND s.status='active'),'[]'::jsonb)) ORDER BY p.canonical_code) FROM authz.permission p),'[]'::jsonb),
 'bindings',coalesce((SELECT jsonb_agg(jsonb_build_object('operationKey',b.operation_key,'permissionCode',p.canonical_code,
 'appliedReleaseId',b.applied_release_id,'tenantId',b.tenant_id,'releaseId',b.source_release_id,'compiledHash',b.source_compiled_hash,
 'status',b.status,'effective',(b.status='published' AND b.effective_from<=transaction_timestamp() AND (b.effective_until IS NULL OR b.effective_until>transaction_timestamp())),'decisionMode',b.decision_mode,
 'scopes',coalesce((SELECT jsonb_agg(jsonb_build_object('scopeKind',s.scope_kind,'coordinateSource',s.coordinate_source,'coordinateKey',s.coordinate_key,'resolverKey',s.resolver_key) ORDER BY s.scope_kind) FROM authz.entity_operation_scope_binding s WHERE s.entity_operation_binding_id=b.id),'[]'::jsonb)) ORDER BY b.id)
 FROM authz.entity_operation_binding b JOIN authz.permission p ON p.id=b.permission_id WHERE b.entity_code='${profile.entityCode}' AND b.plane_code='${profile.planeKey}' AND (b.tenant_id IS NULL OR b.tenant_id='${tenantId}'::uuid)), '[]'::jsonb));`;
function capture(): PublicationSnapshot {
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
      `athyper_${profile.planeKey}`,
      "-Atc",
      `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='15s'; ${query} COMMIT;`,
    ],
    { encoding: "utf8", timeout: 20000, maxBuffer: 16000000 },
  )
    .split("\n")
    .filter((l) => l.startsWith("{"));
  if (lines.length !== 1)
    throw new Error("Missing or ambiguous publication snapshot");
  return JSON.parse(lines[0]);
}
const snapshot = capture();
const packet = compilePublicationPlan({
  snapshot,
  profile,
  manifest: JSON.parse(readFileSync(manifestPath, "utf8")),
  readSource: (path) => readFileSync(resolve(root, path), "utf8"),
});
const after = capture();
if (
  digest(headPin(snapshot)) !== digest(headPin(after)) ||
  digest(snapshot.permissions) !== digest(after.permissions) ||
  digest(snapshot.bindings) !== digest(after.bindings)
)
  throw new Error(
    "Activation heads or authorization catalog/bindings changed during preparation; retry from a fresh snapshot",
  );
const snapshotPath = output.replace(/\.json$/, "") + ".snapshot.json";
mkdirSync(dirname(resolve(output)), { recursive: true });
writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n");
writeFileSync(
  output,
  JSON.stringify(
    {
      ...packet,
      generatedAt: new Date().toISOString(),
      snapshotPath,
      snapshotHash: digest(snapshot),
      headRechecked: true,
      sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    output,
    selectedRelease: packet.base.releaseNo,
    publicationKey: packet.base.publicationKey,
    ...packet.coverage,
    publicationEligible: false,
    grantsChanged: false,
  }),
);
