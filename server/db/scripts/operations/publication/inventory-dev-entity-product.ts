#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { loadReferenceProduct } from "../../provisioning/prepare-reference-runtime.js";
import { KyselyMetaEntityAuthoringRepository } from "../../../../packages/planes/studio/meta-entity-authoring/src/kysely-authoring-repository.js";
import {
  compileGraph,
  sha256,
  validateGraph,
  runContractTests,
} from "../../../../packages/planes/studio/meta-entity-authoring/src/deterministic.js";

// Inventory only. Every database transaction is read-only; no importer is run.
async function main() {
  const argument = process.argv.slice(2);
  if (argument.length !== 1 || !argument[0]?.startsWith("--product="))
    throw Error("Specify --product=<metadata directory>");
  const product = loadReferenceProduct(resolve(argument[0].slice(10))),
    entityCode = product.definition.entityCode;
  const inspect = (name: string) =>
    JSON.parse(
      execFileSync("docker", ["inspect", name], { encoding: "utf8" }),
    )[0];
  const container = inspect("athyper-dev-db-1");
  if (
    container.Config.Labels["com.docker.compose.project"] !== "athyper-dev" ||
    !container.State.Running
  )
    throw Error("Running DEV database required");
  const environment = Object.fromEntries(
    container.Config.Env.map((v: string) => {
      const i = v.indexOf("=");
      return [v.slice(0, i), v.slice(i + 1)];
    }),
  );
  const secret = container.Mounts.find(
    (m: any) => m.Destination === environment.POSTGRES_PASSWORD_FILE,
  )?.Source;
  if (!secret?.includes("/.athyper/instances/dev/secrets/"))
    throw Error("DEV secret mount required");
  const host = (Object.values(container.NetworkSettings.Networks)[0] as any)
    .IPAddress;
  const report: any = {
    schema: "athyper.dev-entity-publication-inventory/1",
    capturedAt: new Date().toISOString(),
    entityCode,
    productHash: sha256(product),
    readOnly: true,
    planes: {},
    workloads: [],
  };
  const withoutRuntimeBindings = structuredClone(product);
  delete (withoutRuntimeBindings.definition as any).runtimeBindings;
  report.productHashWithoutRuntimeBindings = sha256(withoutRuntimeBindings);
  for (const plane of ["studio", "neon", "mesh"]) {
    const db = new Kysely<Record<string, never>>({
      dialect: new PostgresDialect({
        pool: new Pool({
          host,
          database: `athyper_${plane}`,
          user: environment.POSTGRES_USER,
          password: readFileSync(secret, "utf8").trim(),
          max: 1,
        }),
      }),
    });
    try {
      await db
        .transaction()
        .setIsolationLevel("repeatable read")
        .execute(async (tx) => {
          await sql`SET TRANSACTION READ ONLY`.execute(tx);
          const key = `metadata.reference.${entityCode}`;
          report.planes[plane] = {
            rows: (
              await sql`SELECT count(*)::int AS count FROM ${sql.table(`shared.${product.definition.storageObject}`)}`.execute(
                tx,
              )
            ).rows[0],
            heads: (
              await sql`SELECT to_jsonb(h) AS head FROM runtime_meta.release_activation_head h WHERE publication_key=${key}`.execute(
                tx,
              )
            ).rows,
            applied: (
              await sql`SELECT to_jsonb(a) AS applied FROM runtime_meta.applied_release a WHERE publication_key=${key}`.execute(
                tx,
              )
            ).rows,
          };
          if (plane !== "studio") return;
          report.entities = (
            await sql`SELECT e.* FROM metadata.entity e WHERE entity_code=${entityCode}`.execute(
              tx,
            )
          ).rows;
          report.drafts = [];
          const repository = new KyselyMetaEntityAuthoringRepository(tx);
          const drafts = (
            await sql<{
              id: string;
            }>`SELECT c.* FROM metadata.entity_change_set c JOIN metadata.entity e ON e.id=c.entity_id WHERE e.entity_code=${entityCode} ORDER BY c.created_at,c.id`.execute(
              tx,
            )
          ).rows;
          const graphs: any[] = [];
          for (const draft of drafts) {
            const graph = await repository.loadGraph(draft.id as string);
            const compiled = compileGraph(graph);
            const original = await repository.readDraftSave(
              draft.id as string,
              1,
            );
            const marker =
              graph.surfaces?.flatMap((s) =>
                s.layoutConfig?.systemReferenceProduct
                  ? [s.layoutConfig.systemReferenceProduct]
                  : [],
              ) ?? [];
            const validation = validateGraph(graph),
              tests = runContractTests(graph);
            graphs.push(graph);
            report.drafts.push({
              row: draft,
              marker,
              contractHash: compiled.contractHash,
              descriptorHash: compiled.descriptorHash,
              originalSaveUnchanged:
                !!original && sha256(original) === sha256(graph),
              validationIssues: validation.issues,
              testsPassed: tests.passed,
              testCount: tests.results.length,
              sectionCounts: Object.fromEntries(
                Object.entries(graph)
                  .filter(([, v]) => Array.isArray(v))
                  .map(([k, v]) => [k, (v as any[]).length]),
              ),
              runtimeProfiles: graph.runtimeProfiles,
              operations: graph.operations,
            });
          }
          // Diagnostic-only normalization: UUID differences are separately preserved
          // in the raw source hashes. This does not establish semantic equivalence.
          const normalize = (v: any): any =>
            typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v)
              ? "<uuid>"
              : Array.isArray(v)
                ? v.map(normalize)
                : v && typeof v === "object"
                  ? Object.fromEntries(
                      Object.entries(v)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([k, x]) => [k, normalize(x)]),
                    )
                  : v;
          const section = (v: any) =>
            Array.isArray(v)
              ? v
                  .map(normalize)
                  .sort((a, b) =>
                    JSON.stringify(a).localeCompare(JSON.stringify(b)),
                  )
              : normalize(v);
          const differences = (a: any, b: any, path: string): any[] =>
            JSON.stringify(a) === JSON.stringify(b)
              ? []
              : a && b && typeof a === "object" && typeof b === "object"
                ? Array.from(
                    new Set([...Object.keys(a), ...Object.keys(b)]),
                  ).flatMap((k) => differences(a[k], b[k], `${path}.${k}`))
                : [{ path, before: a ?? null, after: b ?? null }];
          report.draftDifferences = [];
          if (graphs.length === 2) {
            for (const key of new Set([
              ...Object.keys(graphs[0]),
              ...Object.keys(graphs[1]),
            ]))
              report.draftDifferences.push(
                ...differences(
                  section(graphs[0][key]),
                  section(graphs[1][key]),
                  key,
                ),
              );
          }
          report.authoringReleases = (
            await sql`SELECT r.* FROM metadata.entity_release r JOIN metadata.entity e ON e.id=r.entity_id WHERE e.entity_code=${entityCode}`.execute(
              tx,
            )
          ).rows;
          report.publicationReleases = (
            await sql`SELECT r.* FROM publication.release r WHERE release_key=${key}`.execute(
              tx,
            )
          ).rows;
          report.deployments = (
            await sql`SELECT d.* FROM publication.deployment d JOIN publication.artifact a ON a.id=d.artifact_id JOIN publication.release r ON r.id=a.publication_release_id WHERE r.release_key=${key}`.execute(
              tx,
            )
          ).rows;
          report.policyCount = (
            await sql`SELECT count(*)::int AS count FROM control.policy_definition WHERE entity_type='metadata.publication'`.execute(
              tx,
            )
          ).rows[0];
          report.workloadPrincipals = (
            await sql`SELECT p.id,p.code,p.auth_epoch,p.principal_type,p.status,t.code tenant_code,p.tenant_id FROM master.principal p JOIN master.tenant t ON t.id=p.tenant_id WHERE p.code IN ('dev.metadata.author','dev.metadata.publisher') ORDER BY t.code,p.code`.execute(
              tx,
            )
          ).rows;
        });
    } finally {
      await db.destroy();
    }
  }
  for (const name of [
    "athyper-dev-source-api-1",
    "athyper-dev-source-worker-1",
  ]) {
    const c = inspect(name),
      env = Object.fromEntries(
        c.Config.Env.map((v: string) => {
          let i = v.indexOf("=");
          return [v.slice(0, i), v.slice(i + 1)];
        }),
      );
    const path = env.ATHYPER_DEV_PUBLICATION_CONFIG,
      mount = c.Mounts.find((m: any) => m.Destination === path),
      config = mount
        ? JSON.parse(readFileSync(mount.Source, "utf8"))
        : undefined;
    const workloadPath = env.PUBLICATION_WORKLOAD_CONFIG,
      workloadMount = c.Mounts.find((m: any) => m.Destination === workloadPath),
      workload = workloadMount
        ? JSON.parse(readFileSync(workloadMount.Source, "utf8"))
        : undefined;
    report.workloads.push({
      container: name,
      image: c.Image,
      startedAt: c.State.StartedAt,
      status: c.State.Status,
      health: c.State.Health?.Status,
      configPath: path,
      configSource: mount?.Source,
      configModifiedAt: mount
        ? statSync(mount.Source).mtime.toISOString()
        : null,
      scopedPublication: workload
        ? {
            configPath: workloadPath,
            configSource: workloadMount.Source,
            readOnly: !workloadMount.RW,
            authorityTenantId: env.PLATFORM_AUTHORITY_TENANT_ID,
            tenantId: workload.tenantId,
            realmKey: workload.realmKey,
            authorPrincipalId: workload.author?.principalId,
            publisherPrincipalId: workload.publisher?.principalId,
          }
        : null,
      config: config
        ? {
            tenantId: config.tenantId,
            tenantCode: config.tenantCode,
            entityCode: config.entityCode,
            targets: config.targets,
            authorPrincipalId: config.author?.principalId,
            publisherPrincipalId: config.publisher?.principalId,
          }
        : null,
    });
  }
  console.log(JSON.stringify(report, null, 2));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Inventory failed");
  process.exitCode = 1;
});
