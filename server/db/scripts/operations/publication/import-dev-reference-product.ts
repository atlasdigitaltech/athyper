#!/usr/bin/env tsx
import { discoverWorkspace, resolveSourcePath } from "../../../../../tooling/scripts/metadata/source-workspace.mjs";
import { parseTableEntityProduct } from "@athyper/server-plane-studio-meta-entity-authoring";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { loadReferenceProduct } from "../../provisioning/prepare-reference-runtime.js";
import { importEntityProduct } from "@athyper/server-plane-studio-meta-entity-authoring";
import { KyselyMetaEntityAuthoringRepository } from "@athyper/server-plane-studio-meta-entity-authoring";
import {
  compileGraph,
  validateGraph,
  runContractTests,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { compileSystemEntityTarget } from "@athyper/server-plane-studio-meta-entity-authoring";

/** Authenticated local maintenance operation; creates drafts, never approvals. */
async function main() {
  const args = process.argv.slice(2);
  const directory = args.find((a) => a.startsWith("--product="))?.slice(10);
  if (
    !directory ||
    args.some(
      (a) =>
        !a.startsWith("--product=") &&
        a !== "--check" &&
        a !== "--confirm=DEV-IMPORT-REFERENCE-DRAFT" &&
        a !== "--confirm=DEV-IMPORT-ENTITY-DRAFT",
    )
  )
    throw Error(
      "Use --product=<metadata product> [--check|--confirm=DEV-IMPORT-REFERENCE-DRAFT]",
    );
  const workspace = discoverWorkspace(resolve("metadata"));
  const path = resolveSourcePath(resolve(directory));
  if (![...workspace.entities.values()].some((source) => source.directory === path && source.descriptor.definition))
    throw Error("Expected a declared entity source directory with a definition");
  const definition = JSON.parse(
    readFileSync(resolveSourcePath(resolve(path, "definition.json")), "utf8"),
  );
  const product =
    definition.schema === "athyper.table-entity-product/1"
      ? parseTableEntityProduct(
          definition,
          existsSync(resolve(path, "localization.json"))
            ? JSON.parse(
                readFileSync(resolveSourcePath(resolve(path, "localization.json")), "utf8"),
              )
            : undefined,
        )
      : loadReferenceProduct(resolveSourcePath(path));
  const inspected = JSON.parse(
    execFileSync("docker", ["inspect", "athyper-dev-db-1"], {
      encoding: "utf8",
    }),
  )[0];
  if (
    inspected.Config.Labels["com.docker.compose.project"] !== "athyper-dev" ||
    !inspected.State.Running
  )
    throw Error("Running DEV database required");
  const env = Object.fromEntries(
    inspected.Config.Env.map((entry: string) => {
      const i = entry.indexOf("=");
      return [entry.slice(0, i), entry.slice(i + 1)];
    }),
  );
  const secret = inspected.Mounts.find(
    (m: { Destination: string }) =>
      m.Destination === env.POSTGRES_PASSWORD_FILE,
  )?.Source;
  if (
    typeof secret !== "string" ||
    !secret.includes("/.athyper/instances/dev/secrets/")
  )
    throw Error("DEV credential mount required");
  const network = Object.values(inspected.NetworkSettings.Networks)[0] as {
    IPAddress: string;
  };
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: new Pool({
        host: network.IPAddress,
        database: "athyper_studio",
        user: env.POSTGRES_USER,
        password: readFileSync(resolveSourcePath(secret), "utf8").trim(),
        max: 1,
      }),
    }),
  });
  const dryRun =
    !args.includes("--confirm=DEV-IMPORT-REFERENCE-DRAFT") &&
    !args.includes("--confirm=DEV-IMPORT-ENTITY-DRAFT");
  const rollback = new Error("ROLLBACK_CHECK");
  let receipt: unknown;
  try {
    await db
      .transaction()
      .execute(async (tx) => {
        const actor = (
          await sql<{
            id: string;
            tenant_id: string;
          }>`SELECT p.id,p.tenant_id FROM master.principal p JOIN master.tenant t ON t.id=p.tenant_id
        WHERE t.code='athyper' AND p.code='seed.three-plane-provisioner' AND p.status='active'`.execute(
            tx,
          )
        ).rows;
        if (actor.length !== 1)
          throw Error("Unique DEV maintenance principal required");
        await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_plane_key','studio',true),
        set_config('app.current_principal_id',${actor[0]!.id},true)`.execute(
          tx,
        );
        const missing = (
          await sql<{
            missing: boolean;
          }>`SELECT to_regclass('metadata.entity_change_case_binding') IS NULL AS missing`.execute(
            tx,
          )
        ).rows[0]!.missing;
        if (missing)
          await sql
            .raw(
              readFileSync(
                resolveSourcePath("server/db/migrations/20260926_entity_execution_binding_storage.sql"),
                "utf8",
              ),
            )
            .execute(tx);
        const studioBinding = (
          await sql<{
            supported: boolean;
          }>`SELECT position('studio' in pg_get_constraintdef(oid))>0 AS supported
        FROM pg_constraint WHERE conrelid='metadata.entity_operation_permission'::regclass
          AND conname='entity_operation_permission_plane_chk'`.execute(tx)
        ).rows[0]?.supported;
        if (!studioBinding)
          await sql
            .raw(
              readFileSync(
                resolveSourcePath("server/db/migrations/20260926_studio_entity_operation_bindings.sql"),
                "utf8",
              ),
            )
            .execute(tx);
        const imported = await importEntityProduct(
          tx,
          {
            async assertAuthorized(request) {
              // The connection is authenticated to the guarded DEV administrator
              // endpoint. Do not pretend to be one of the human test-admin users.
              const privileged = (
                await sql<{
                  allowed: boolean;
                }>`SELECT rolsuper OR pg_has_role(current_user,'athyperadmin','MEMBER') AS allowed
            FROM pg_roles WHERE rolname=current_user`.execute(tx)
              ).rows[0]?.allowed;
              if (
                !privileged ||
                request.actorId !== actor[0]!.id ||
                request.action !==
                  (product.schema === "athyper.table-entity-product/1"
                    ? "system_entity.import"
                    : "system_reference.import")
              )
                throw Error("DEV_SYSTEM_REFERENCE_IMPORT_DENIED");
            },
          },
          { product, actorId: actor[0]!.id },
        );
        if (!imported.changeSet) throw Error("Saved change set unavailable");
        const repository = new KyselyMetaEntityAuthoringRepository(tx);
        const stored = await repository.loadGraph(imported.changeSet.id);
        const compiled = compileGraph(stored);
        const validation = validateGraph(stored);
        const tests = runContractTests(stored);
        if (validation.issues.length || !tests.passed)
          throw Error("Persisted graph validation failed");
        if (!imported.reused && imported.changeSet.tenantId !== null) {
          await repository.recordValidation(
            imported.changeSet.id,
            imported.changeSet.revision,
            validation,
            actor[0]!.id,
          );
          await repository.recordTestRun(
            imported.changeSet.id,
            imported.changeSet.revision,
            tests,
            actor[0]!.id,
          );
        }
        const workloads = (
          await sql<{
            id: string;
            code: string;
          }>`SELECT id,code FROM master.principal WHERE tenant_id=${actor[0]!.tenant_id}::uuid
        AND code IN ('dev.metadata.author','dev.metadata.publisher') AND status='active' AND principal_type='service_account'`.execute(
            tx,
          )
        ).rows;
        const author = workloads.find(
            (row) => row.code === "dev.metadata.author",
          ),
          publisher = workloads.find(
            (row) => row.code === "dev.metadata.publisher",
          );
        const policy =
          author && publisher
            ? {
                schema:
                  product.schema === "athyper.table-entity-product/1"
                    ? "athyper.dev-entity-onboarding/1"
                    : "athyper.dev-reference-onboarding/1",
                policyId: `dev.entity.${stored.entity.entityCode}.${imported.productHash.slice(0, 12)}`,
                revision: 1,
                environment: "local",
                instance: "dev",
                preset: "devfull",
                changeSetId: imported.changeSet.id,
                entityId: imported.entityId,
                productHash: imported.productHash,
                contractHash: compiled.contractHash,
                descriptorHash: compiled.descriptorHash,
                targetPlanes: product.planes,
                authorPrincipalId: author.id,
                publisherPrincipalId: publisher.id,
              }
            : undefined;
        receipt = {
          ...(policy ? { publicationPolicyCandidate: policy } : {}),
          mode: dryRun ? "rolled_back" : "draft_persisted",
          ...imported,
          contractHash: compiled.contractHash,
          descriptorHash: compiled.descriptorHash,
          unsignedTargets: product.planes.map((plane) => {
            const target = compileSystemEntityTarget(stored, plane);
            return {
              plane,
              sourceContractHash: target.sourceContractHash,
              descriptorHash: target.artifact.descriptorHash,
            };
          }),
          validationIssues: validation.issues.length,
          contractTestsPassed: tests.passed,
          contractTestCount: tests.results.length,
          contractTestRunPersisted:
            imported.changeSet.tenantId !== null && !imported.reused,
          publication: "not_requested",
          approvalsCreated: 0,
          runtimeActivations: 0,
        };
        if (dryRun) throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
    console.log(JSON.stringify(receipt, null, 2));
  } finally {
    await db.destroy();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Reference import failed",
    );
    process.exitCode = 1;
  });
}
