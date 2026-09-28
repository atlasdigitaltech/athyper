#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { loadReferenceProduct } from "../../provisioning/prepare-reference-runtime.js";
import { importSystemReferenceProduct } from "../../../../packages/planes/studio/meta-entity-authoring/src/system-reference-authoring.js";
import { KyselyMetaEntityAuthoringRepository } from "../../../../packages/planes/studio/meta-entity-authoring/src/kysely-authoring-repository.js";
import { compileGraph, validateGraph, runContractTests } from "../../../../packages/planes/studio/meta-entity-authoring/src/deterministic.js";
import { compileSystemReferenceTarget } from "../../../../packages/planes/studio/meta-entity-authoring/src/compilation/target-compiler.js";

/** Authenticated local maintenance operation; creates drafts, never approvals. */
async function main() {
  const args = process.argv.slice(2);
  const directory = args.find(a => a.startsWith("--product="))?.slice(10);
  if (!directory || args.some(a => !a.startsWith("--product=") && a !== "--check" && a !== "--confirm=DEV-IMPORT-REFERENCE-DRAFT"))
    throw Error("Use --product=<metadata product> [--check|--confirm=DEV-IMPORT-REFERENCE-DRAFT]");
  const root = resolve("metadata/products/shared/entities");
  const path = resolve(directory);
  const child = relative(root, path);
  if (!child || child.startsWith("..") || child.includes("/")) throw Error("Expected a direct shared metadata product directory");
  const product = loadReferenceProduct(path);
  const inspected = JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }))[0];
  if (inspected.Config.Labels["com.docker.compose.project"] !== "athyper-dev" || !inspected.State.Running)
    throw Error("Running DEV database required");
  const env = Object.fromEntries(inspected.Config.Env.map((entry: string) => { const i = entry.indexOf("="); return [entry.slice(0, i), entry.slice(i + 1)]; }));
  const secret = inspected.Mounts.find((m: { Destination: string }) => m.Destination === env.POSTGRES_PASSWORD_FILE)?.Source;
  if (typeof secret !== "string" || !secret.includes("/.athyper/instances/dev/secrets/")) throw Error("DEV credential mount required");
  const network = Object.values(inspected.NetworkSettings.Networks)[0] as { IPAddress: string };
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: new Pool({
    host: network.IPAddress, database: "athyper_studio", user: env.POSTGRES_USER,
    password: readFileSync(secret, "utf8").trim(), max: 1,
  }) }) });
  const dryRun = !args.includes("--confirm=DEV-IMPORT-REFERENCE-DRAFT");
  const rollback = new Error("ROLLBACK_CHECK");
  let receipt: unknown;
  try {
    await db.transaction().execute(async tx => {
      const actor = (await sql<{ id: string }>`SELECT p.id FROM master.principal p JOIN master.tenant t ON t.id=p.tenant_id
        WHERE t.code='athyper' AND p.code='seed.three-plane-provisioner' AND p.status='active'`.execute(tx)).rows;
      if (actor.length !== 1) throw Error("Unique DEV maintenance principal required");
      await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_plane_key','studio',true),
        set_config('app.current_principal_id',${actor[0]!.id},true)`.execute(tx);
      const missing = (await sql<{ missing: boolean }>`SELECT to_regclass('metadata.entity_change_case_binding') IS NULL AS missing`.execute(tx)).rows[0]!.missing;
      if (missing) await sql.raw(readFileSync("server/db/migrations/20260926_entity_execution_binding_storage.sql", "utf8")).execute(tx);
      const studioBinding = (await sql<{ supported: boolean }>`SELECT position('studio' in pg_get_constraintdef(oid))>0 AS supported
        FROM pg_constraint WHERE conrelid='metadata.entity_operation_permission'::regclass
          AND conname='entity_operation_permission_plane_chk'`.execute(tx)).rows[0]?.supported;
      if (!studioBinding) await sql.raw(readFileSync("server/db/migrations/20260926_studio_entity_operation_bindings.sql", "utf8")).execute(tx);
      const imported = await importSystemReferenceProduct(tx, {
        async assertAuthorized(request) {
          // The connection is authenticated to the guarded DEV administrator
          // endpoint. Do not pretend to be one of the human test-admin users.
          const privileged = (await sql<{ allowed: boolean }>`SELECT rolsuper OR pg_has_role(current_user,'athyperadmin','MEMBER') AS allowed
            FROM pg_roles WHERE rolname=current_user`.execute(tx)).rows[0]?.allowed;
          if (!privileged || request.actorId !== actor[0]!.id || request.action !== "system_reference.import")
            throw Error("DEV_SYSTEM_REFERENCE_IMPORT_DENIED");
        },
      }, { product, actorId: actor[0]!.id });
      if (!imported.changeSet) throw Error("Saved change set unavailable");
      const repository = new KyselyMetaEntityAuthoringRepository(tx);
      const stored = await repository.loadGraph(imported.changeSet.id);
      const compiled = compileGraph(stored);
      const validation = validateGraph(stored);
      const tests = runContractTests(stored);
      if (validation.issues.length || !tests.passed) throw Error("Persisted graph validation failed");
      if (!imported.reused) {
        await repository.recordValidation(imported.changeSet.id, imported.changeSet.revision, validation, actor[0]!.id);
        await repository.recordTestRun(imported.changeSet.id, imported.changeSet.revision, tests, actor[0]!.id);
      }
      receipt = { mode: dryRun ? "rolled_back" : "draft_persisted", ...imported,
        contractHash: compiled.contractHash, descriptorHash: compiled.descriptorHash,
        unsignedTargets: product.planes.map(plane => {
          const target = compileSystemReferenceTarget(stored, plane);
          return { plane, sourceContractHash: target.sourceContractHash, descriptorHash: target.artifact.descriptorHash };
        }),
        validationIssues: validation.issues.length, contractTestsPassed: tests.passed,
        contractTestCount: tests.results.length,
        contractTestRunPersisted: imported.changeSet.tenantId !== null && !imported.reused,
        publication: "not_requested", approvalsCreated: 0, runtimeActivations: 0 };
      if (dryRun) throw rollback;
    }).catch(error => { if (error !== rollback) throw error; });
    console.log(JSON.stringify(receipt, null, 2));
  } finally { await db.destroy(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : "Reference import failed"); process.exitCode = 1; });
}
