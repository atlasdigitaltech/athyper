/** Read-only DEV preflight of exact human-approved sources. Does not grant
 * authority, sign artifacts, enqueue deliveries or change activation heads. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { KyselyMetaEntityAuthoringRepository, compileGraph, compileSystemEntityTarget } from "@athyper/server-plane-studio-meta-entity-authoring";
import type { AuthoringPlane, MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { qualifyPublishedRelationships, qualifyCoordinatedProductRelationships } from "../../src/composition/shared/publication/relationship-qualification.js";

const [input, output] = process.argv.slice(2);
if (!input || !output || process.argv.length !== 4) throw Error("Use <approval-report.json> <new-output.json>");
const candidate = JSON.parse(readFileSync(resolve(input), "utf8"));
if (candidate.schema !== "athyper.coordinated-human-approval/1" || !Array.isArray(candidate.entries) || !candidate.entries.length)
  throw Error("HUMAN_APPROVAL_REPORT_REQUIRED");
const container = JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }))[0];
if (!container.State.Running || container.Config.Labels["com.docker.compose.project"] !== "athyper-dev")
  throw Error("RUNNING_DEV_DATABASE_REQUIRED");
const env = Object.fromEntries(container.Config.Env.map((v: string) => [v.slice(0, v.indexOf("=")), v.slice(v.indexOf("=") + 1)]));
const secret = container.Mounts.find((m: { Destination: string }) => m.Destination === env.POSTGRES_PASSWORD_FILE)?.Source;
if (!secret?.includes("/.athyper/instances/dev/secrets/")) throw Error("DEV_SECRET_REQUIRED");
const password = readFileSync(secret, "utf8").trim();
const host = (Object.values(container.NetworkSettings.Networks)[0] as { IPAddress: string }).IPAddress;
const databases = new Map<string, Kysely<Record<string, never>>>();
function database(plane: AuthoringPlane) {
  if (!["studio", "neon", "mesh"].includes(plane)) throw Error("TARGET_PLANE_INVALID");
  if (!databases.has(plane)) databases.set(plane, new Kysely({ dialect: new PostgresDialect({
    pool: new Pool({ host, database: `athyper_${plane}`, user: env.POSTGRES_USER, password, max: 1 }),
  }) }));
  return databases.get(plane)!;
}
const report = {
  schema: "athyper.approved-publication-preflight/1", observedAt: new Date().toISOString(), candidateId: candidate.candidateId,
  databaseReadOnly: true, publicationPerformed: false, deploymentPerformed: false,
  scope: "Exact persisted source/target hashes, human receipts, enrollment inventory, declared AI/collaboration requirements and relationship gates; not full runtime qualification.",
  installedAuthority: {} as Record<string, unknown>,
  entries: [] as Record<string, unknown>[],
  coordinatedRelationshipGates: [] as { plane: AuthoringPlane; entities: string[]; result: string }[],
};
const groups = new Map<AuthoringPlane, MetaEntityGraph[]>();
try {
  report.installedAuthority = await database("studio").transaction().execute(async tx => {
    await sql`SET TRANSACTION READ ONLY`.execute(tx);
    return (await sql<Record<string, unknown>>`SELECT
      position('principal_type=''service_account''' in pg_get_functiondef('publication.fn_system_entity_authority(uuid,text)'::regprocedure))>0 AS requires_service_accounts,
      position('cs.submitted_by<>author' in pg_get_functiondef('publication.fn_system_entity_authority(uuid,text)'::regprocedure))>0 AS pins_service_author,
      position('cs.approved_by<>publisher' in pg_get_functiondef('publication.fn_system_entity_authority(uuid,text)'::regprocedure))>0 AS pins_service_reviewer`.execute(tx)).rows[0]!;
  });
  for (const entry of candidate.entries) {
    const source = await database("studio").transaction().setIsolationLevel("repeatable read").execute(async tx => {
      await sql`SET TRANSACTION READ ONLY`.execute(tx);
      const graph = await new KyselyMetaEntityAuthoringRepository(tx).loadGraph(entry.changeSetId);
      const state = (await sql<{ status: string; revision: number; submitted_by: string; approved_by: string; created_by: string; release_count: number }>`
        SELECT c.status::text,c.lock_version::int revision,c.submitted_by,c.approved_by,c.created_by,
          (SELECT count(*)::int FROM metadata.entity_release r WHERE r.change_set_id=c.id) release_count
        FROM metadata.entity_change_set c JOIN metadata.entity e ON e.id=c.entity_id
        WHERE c.id=${entry.changeSetId}::uuid AND c.tenant_id IS NULL AND e.ownership_model='system'`.execute(tx)).rows[0];
      const artifact = compileGraph(graph);
      if (!state || state.status !== "approved" || state.revision !== entry.revision
        || state.submitted_by !== entry.submittedBy || state.approved_by !== entry.approvedBy
        || state.created_by !== entry.createdBy || state.submitted_by === state.approved_by
        || artifact.contractHash !== entry.contractHash || artifact.descriptorHash !== entry.descriptorHash)
        throw Error("APPROVED_SOURCE_PIN_CHANGED");
      const receipts = (await sql<{ action: string; actor_id: string; expected_revision: number }>`
        SELECT action,actor_id,expected_revision::int FROM metadata.entity_product_review_receipt
        WHERE change_set_id=${entry.changeSetId}::uuid AND contract_hash=${artifact.contractHash}
        ORDER BY expected_revision,action`.execute(tx)).rows;
      if (!receipts.some(r => r.action === "approve" && r.actor_id === state.approved_by && r.expected_revision === state.revision - 1)
        || !receipts.some(r => r.action === "submit" && r.actor_id === state.submitted_by && r.expected_revision === state.revision - 2)
        || !receipts.some(r => r.action === "adopt" && r.actor_id === state.submitted_by && r.expected_revision === state.revision - 2))
        throw Error("PERSISTED_HUMAN_RECEIPTS_REQUIRED");
      const enrollments = (await sql`SELECT d.id,d.status,d.version_no FROM control.policy_definition d
        JOIN control.policy_rule r ON r.policy_definition_id=d.id WHERE d.entity_type='metadata.publication'
        AND (r.action_config#>>'{policy,changeSetId}'=${entry.changeSetId}
          OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(r.action_config#>'{policy,plan,members}','[]'::jsonb)) member
            WHERE member->>'changeSetId'=${entry.changeSetId}))`.execute(tx)).rows;
      return { graph, state, receipts, enrollments };
    });
    const targets = [];
    for (const pin of entry.targets) {
      const target = compileSystemEntityTarget(source.graph, pin.plane);
      if (target.artifact.contractHash !== pin.contractHash || target.artifact.descriptorHash !== pin.descriptorHash)
        throw Error("APPROVED_TARGET_PIN_CHANGED");
      groups.set(pin.plane, [...(groups.get(pin.plane) ?? []), target.graph]);
      let relationshipGate = "passed";
      try {
        await database(pin.plane).transaction().setIsolationLevel("repeatable read").execute(async tx => {
          await sql`SET TRANSACTION READ ONLY`.execute(tx);
          await sql`SET LOCAL statement_timeout='10000ms'`.execute(tx);
          await sql`SET LOCAL ROLE athyper_runtime`.execute(tx);
          await qualifyPublishedRelationships(target.graph, tx);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!/^PUBLICATION_[A-Z0-9_]+$/.test(message)) throw error;
        relationshipGate = message;
      }
      const presentation = target.graph.surfaces?.find(s => s.layoutConfig?.recordPresentation)?.layoutConfig?.recordPresentation as
        { entityRelationships?: { targetEntity: string }[] } | undefined;
      const dependencies = [...new Set([
        ...target.graph.fields.flatMap(f => {
          const reference = f.typeConfig?.keyReference as { targetEntity?: string } | undefined;
          return reference?.targetEntity ? [reference.targetEntity] : [];
        }),
        ...(presentation?.entityRelationships ?? []).map(r => r.targetEntity),
      ])].sort();
      const permissionQualification = await database(pin.plane).transaction().execute(async tx => {
        await sql`SET TRANSACTION READ ONLY`.execute(tx);
        await sql`SET LOCAL ROLE athyper_runtime`.execute(tx);
        const checks = [];
        for (const permission of (target.graph.operationPermissions ?? []).filter(p => p.status !== "deprecated")) {
          const requiredScopes = [...new Set((target.graph.operationScopeBindings ?? []).filter(s =>
            s.status !== "deprecated" && s.entityOperationId === permission.entityOperationId && s.targetPlane === pin.plane,
          ).map(s => s.scopeKind))];
          const installed = (await sql<{ scope_kind: string }>`SELECT s.scope_kind::text scope_kind
            FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id
            WHERE p.canonical_code=${permission.permissionCode} AND p.permission_kind=${permission.permissionKind}
              AND p.status='published' AND s.status='active'`.execute(tx)).rows.map(row => row.scope_kind);
          checks.push({ permissionCode: permission.permissionCode, permissionKind: permission.permissionKind,
            requiredScopes, installedScopes: installed,
            passed: requiredScopes.length > 0 && requiredScopes.every(scope => installed.includes(scope)),
          });
        }
        return checks;
      });
      targets.push({ ...pin, dependencies, relationshipGate,
        permissionQualification,
        aiManifestBindings: target.artifact.descriptor.aiManifestBindings ?? null,
        declaredCapabilities: (target.graph.capabilities ?? []).map(member => ({
          capabilityKey: member.capabilityKey, enabled: member.declaration.enabled,
        })),
      });
    }
    report.entries.push({ entityCode: entry.entityCode, changeSetId: entry.changeSetId,
      contractHash: entry.contractHash, descriptorHash: entry.descriptorHash,
      state: source.state, persistedHumanReceipts: source.receipts, enrollments: source.enrollments, targets });
  }
  for (const [plane, graphs] of groups) {
    let result = "passed";
    try {
      await database(plane).transaction().setIsolationLevel("repeatable read").execute(async tx => {
        await sql`SET TRANSACTION READ ONLY`.execute(tx);
        await sql`SET LOCAL statement_timeout='10000ms'`.execute(tx);
        await sql`SET LOCAL ROLE athyper_runtime`.execute(tx);
        await qualifyCoordinatedProductRelationships(graphs, tx);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/^PUBLICATION_[A-Z0-9_]+$/.test(message)) throw error;
      result = message;
    }
    report.coordinatedRelationshipGates.push({ plane, entities: graphs.map(g => g.entity.entityCode), result });
  }
  writeFileSync(resolve(output), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output: resolve(output), sources: report.entries.length, publicationPerformed: false }));
} finally {
  await Promise.all([...databases.values()].map(db => db.destroy()));
}
