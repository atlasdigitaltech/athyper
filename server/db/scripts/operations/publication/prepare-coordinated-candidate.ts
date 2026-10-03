#!/usr/bin/env tsx
/** Read-only DEV reconciliation. Uses the shared authoring repository/compiler;
 * produces unsigned review artifacts, never approvals or publication writes. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import {
  KyselyMetaEntityAuthoringRepository,
  compileGraph,
  compileSystemEntityTarget,
  validateGraph,
  runContractTests,
  sha256,
  parseTableEntityProduct,
  compileTableEntityProduct,
  compileSharedReferenceProduct,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { loadReferenceProduct } from "../../provisioning/prepare-reference-runtime.js";

const args = process.argv.slice(2);
if (args.length !== 1 || !args[0]?.startsWith("--output="))
  throw Error("Use --output=<new review directory>");
const output = resolve(args[0].slice(9));
if (existsSync(output)) throw Error("OUTPUT_ALREADY_EXISTS");
const c = JSON.parse(
  execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }),
)[0];
if (
  !c.State.Running ||
  c.Config.Labels["com.docker.compose.project"] !== "athyper-dev"
)
  throw Error("RUNNING_DEV_DATABASE_REQUIRED");
const env = Object.fromEntries(
  c.Config.Env.map((v: string) => [
    v.slice(0, v.indexOf("=")),
    v.slice(v.indexOf("=") + 1),
  ]),
);
const secret = c.Mounts.find(
  (m: any) => m.Destination === env.POSTGRES_PASSWORD_FILE,
)?.Source;
if (!secret?.includes("/.athyper/instances/dev/secrets/"))
  throw Error("DEV_SECRET_REQUIRED");
const host = (Object.values(c.NetworkSettings.Networks)[0] as any).IPAddress;
const password = readFileSync(secret, "utf8").trim();
const connect = (plane: string) =>
  new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: new Pool({
        host,
        database: `athyper_${plane}`,
        user: env.POSTGRES_USER,
        password,
        max: 1,
      }),
    }),
  });
const report: any = {
  schema: "athyper.coordinated-entity-review-candidate/1",
  capturedAt: new Date().toISOString(),
  environment: "dev",
  databaseReadOnly: true,
  status: "unsigned_review_candidate",
  gitHead: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  approvalCreated: false,
  releaseCreated: false,
  activationPerformed: false,
  qualification: {
    humanAuthorship: false,
    independentApproval: false,
    liveUserFlows: false,
  },
  entities: [],
  planes: {},
};
const artifacts: Record<string, any> = {};
const metadataRoot = resolve("metadata");
const manifest = JSON.parse(readFileSync(join(metadataRoot, "manifest.json"), "utf8"));
if (manifest.schema !== "athyper.metadata-workspace/1" || manifest.entitiesRoot !== "entities")
  throw Error("UNSUPPORTED_FLAT_METADATA_WORKSPACE");
const entitiesRoot = join(metadataRoot, manifest.entitiesRoot);
const sourceFiles = readdirSync(entitiesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(entitiesRoot, entry.name, "definition.json"))
  .filter((file) => existsSync(file));
const db = connect("studio");
try {
  await db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (tx) => {
      await sql`SET TRANSACTION READ ONLY`.execute(tx);
      const repository = new KyselyMetaEntityAuthoringRepository(tx);
      const drafts = (
        await sql<any>`SELECT c.id,c.entity_id,c.tenant_id,c.branch_code,c.base_release_id,c.lock_version,
      c.created_at,c.updated_at,c.created_by,p.code AS created_by_code,p.principal_type,
      e.entity_code,e.ownership_model FROM metadata.entity_change_set c JOIN metadata.entity e ON e.id=c.entity_id
      LEFT JOIN master.principal p ON p.id=c.created_by WHERE c.status='draft' ORDER BY e.entity_code,c.created_at,c.id`.execute(
          tx,
        )
      ).rows;
      report.deliverySummary = (
        await sql`SELECT target_plane,status,count(*)::int AS count FROM publication.deployment GROUP BY 1,2 ORDER BY 1,2`.execute(
          tx,
        )
      ).rows;
      for (const entityId of [...new Set(drafts.map((d) => d.entity_id))]) {
        const rows = drafts.filter((d) => d.entity_id === entityId),
          first = rows[0];
        const entry: any = {
          entityCode: first.entity_code,
          entityId,
          sourceTenantId: first.tenant_id,
          ownershipModel: first.ownership_model,
          approvalRoute:
            first.tenant_id === null
              ? {
                  author: "Platform Admin",
                  reviewer: "Platform Owner",
                  independent: true,
                }
              : {
                  author: "Tenant Admin",
                  reviewer: "Tenant Owner",
                  independent: true,
                  tenantId: first.tenant_id,
                },
          drafts: [],
        };
        const baselines = (
          await sql<any>`SELECT r.id,r.release_no,r.release_hash,r.contract_hash,r.revision_id,r.change_set_id,
        r.target_planes,r.published_at,r.published_by,p.code AS published_by_code,
        v.contract_json,v.contract_hash AS snapshot_contract_hash,
        v.contract_hash=snapshot.fn_compute_entity_contract_hash(v.contract_json) AS snapshot_integrity_verified,
        pr.id AS publication_release_id,pr.release_key
        FROM metadata.entity_release r JOIN snapshot.entity_contract_revision v ON v.id=r.revision_id
        LEFT JOIN publication.entity_release_link l ON l.entity_release_id=r.id
        LEFT JOIN publication.release pr ON pr.id=l.publication_release_id
        LEFT JOIN master.principal p ON p.id=r.published_by
        WHERE r.entity_id=${entityId}::uuid ORDER BY r.release_no DESC LIMIT 1`.execute(
            tx,
          )
        ).rows;
        const baseline = baselines[0];
        if (baseline) {
          const { contract_json, ...pins } = baseline;
          entry.baseline = pins;
          // PostgreSQL snapshot JSON hashing and native compiler hashing are distinct pins.
          entry.baseline.nativeContractHash =
            compileGraph(contract_json).contractHash;
          entry.baseline.contractIntegrityVerified =
            baseline.snapshot_integrity_verified &&
            baseline.snapshot_contract_hash === baseline.contract_hash;
          artifacts[`${first.entity_code}/baseline.json`] = contract_json;
        } else entry.baseline = null;
        const files = sourceFiles.filter((p) =>
          p.endsWith(`/entities/${first.entity_code}/definition.json`),
        );
        let product: any;
        if (files.length === 1) {
          const file = files[0]!,
            directory = file.slice(0, -"/definition.json".length);
          try {
            const raw = JSON.parse(readFileSync(file, "utf8"));
            const labels = join(directory, "localization.json");
            product =
              raw.schema === "athyper.table-entity-product/1"
                ? parseTableEntityProduct(
                    raw,
                    existsSync(labels)
                      ? JSON.parse(readFileSync(labels, "utf8"))
                      : undefined,
                  )
                : loadReferenceProduct(directory);
            entry.repositoryProduct = {
              path: directory,
              productHash: sha256(product),
              targetPlanes: product.planes,
            };
            artifacts[`${first.entity_code}/repository-product.json`] = product;
            entry.repositoryProduct.targets = product.planes.map(
              (plane: any) => {
                const compiled =
                  product.schema === "athyper.table-entity-product/1"
                    ? compileTableEntityProduct(product, plane)
                    : compileSharedReferenceProduct(product, plane);
                const validation = validateGraph(compiled.graph),
                  tests = runContractTests(compiled.graph);
                artifacts[`${first.entity_code}/repository-${plane}.json`] =
                  compiled.artifact;
                return {
                  plane,
                  contractHash: compiled.artifact.contractHash,
                  descriptorHash: compiled.artifact.descriptorHash,
                  validationIssues: validation.issues,
                  contractTestsPassed: tests.passed,
                  contractTests: tests.results.length,
                };
              },
            );
          } catch (error) {
            entry.repositoryProductError =
              error instanceof Error ? error.message : String(error);
          }
        } else
          entry.repositoryProductError =
            "REPOSITORY_PRODUCT_NOT_UNIQUE_OR_MISSING";
        for (const row of rows) {
          const item: any = { ...row, targets: [] };
          try {
            const graph = await repository.loadGraph(row.id),
              artifact = compileGraph(graph);
            const tests = runContractTests(graph),
              validation = validateGraph(graph);
            const original = await repository.readDraftSave(row.id, 1);
            const latest = await repository.readDraftSave(
              row.id,
              Number(row.lock_version),
            );
            const markers: any[] = (graph.surfaces ?? []).flatMap((s: any) =>
              s.layoutConfig?.systemReferenceProduct
                ? [s.layoutConfig.systemReferenceProduct]
                : s.layoutConfig?.tableEntityProduct
                  ? [s.layoutConfig.tableEntityProduct]
                  : [],
            );
            item.graphHash = sha256(graph);
            item.contractHash = artifact.contractHash;
            item.descriptorHash = artifact.descriptorHash;
            item.validationIssues = validation.issues;
            item.contractTestsPassed = tests.passed;
            item.contractTestCount = tests.results.length;
            item.originalSaveUnchanged =
              !!original && sha256(original) === sha256(graph);
            item.latestSaveMatches =
              !!latest && sha256(latest) === sha256(graph);
            item.markers = markers;
            item.repositoryProductHashMatches =
              !!product &&
              markers.length === 1 &&
              markers[0].productHash === sha256(product);
            item.baseReleaseCurrent =
              !!baseline && row.base_release_id === baseline.id;
            item.predatesCurrentRelease =
              !!baseline &&
              new Date(row.updated_at) < new Date(baseline.published_at);
            item.changedContractSections = baseline
              ? [
                  ...new Set([
                    ...Object.keys(graph),
                    ...Object.keys(baseline.contract_json),
                  ]),
                ].filter(
                  (k) =>
                    sha256((graph as any)[k] ?? null) !==
                    sha256(baseline.contract_json[k] ?? null),
                )
              : null;
            artifacts[`${first.entity_code}/draft-${row.id}.json`] = {
              graph,
              artifact,
            };
            if (markers.length !== 1) throw Error("SOURCE_MARKER_NOT_UNIQUE");
            for (const plane of markers[0].targetPlanes) {
              try {
                const target = compileSystemEntityTarget(graph, plane);
                artifacts[
                  `${first.entity_code}/draft-${row.id}-${plane}.json`
                ] = target.artifact;
                item.targets.push({
                  plane,
                  contractHash: target.artifact.contractHash,
                  descriptorHash: target.artifact.descriptorHash,
                  compiled: true,
                });
              } catch (error) {
                item.targets.push({
                  plane,
                  compiled: false,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }
          } catch (error) {
            item.error = error instanceof Error ? error.message : String(error);
          }
          entry.drafts.push(item);
        }
        report.entities.push(entry);
      }
    });
} finally {
  await db.destroy();
}
// Select exact current first-publication imports or explicitly pinned successors.
// Other drafts remain intact and excluded; never infer an approval from selection.
for (const entry of report.entities) {
  for (const draft of entry.drafts) {
    const valid =
      !draft.error &&
      draft.validationIssues.length === 0 &&
      draft.contractTestsPassed &&
      draft.targets.length > 0 &&
      draft.targets.every((t: any) => t.compiled);
    if (
      !entry.baseline &&
      draft.repositoryProductHashMatches &&
      draft.originalSaveUnchanged &&
      draft.latestSaveMatches &&
      valid
    ) {
      draft.disposition = "include_first_publication";
    } else if (
      entry.baseline?.contractIntegrityVerified &&
      draft.baseReleaseCurrent &&
      draft.latestSaveMatches &&
      draft.branch_code.startsWith("publication.successor.") &&
      valid
    ) {
      draft.disposition = "include_pinned_successor";
    } else {
      draft.disposition = "exclude_preserve_draft";
      draft.reason = draft.predatesCurrentRelease
        ? "Predates current published release; do not republish an older baseline."
        : !draft.repositoryProductHashMatches
          ? "Does not match current repository product and is not a qualified pinned successor."
          : "Graph validation, immutable save or target compilation requires reconciliation.";
    }
  }
  const selected = entry.drafts.filter((d: any) =>
    d.disposition.startsWith("include_"),
  );
  if (selected.length > 1)
    throw Error(`AMBIGUOUS_CANDIDATE:${entry.entityCode}`);
  entry.selectedChangeSetId = selected[0]?.id ?? null;
  if (selected[0]) {
    const graph =
      artifacts[`${entry.entityCode}/draft-${selected[0].id}.json`].graph;
    entry.dependencies = [
      ...new Set(
        [
          ...(graph.fieldReferenceBindings ?? [])
            .filter((b: any) => b.status !== "deprecated")
            .map((b: any) => b.targetEntityCode),
          ...(graph.surfaces ?? []).flatMap((s: any) =>
            (s.layoutConfig?.recordPresentation?.entityRelationships ?? []).map(
              (r: any) => r.targetEntity,
            ),
          ),
        ].filter(Boolean),
      ),
    ].sort();
  }
}
for (const plane of ["studio", "neon", "mesh"]) {
  const target = connect(plane);
  try {
    await target
      .transaction()
      .setIsolationLevel("repeatable read")
      .execute(async (tx) => {
        await sql`SET TRANSACTION READ ONLY`.execute(tx);
        report.planes[plane] = {
          observedAt: new Date().toISOString(),
          heads: (
            await sql`SELECT * FROM runtime_meta.release_activation_head ORDER BY publication_key`.execute(
              tx,
            )
          ).rows,
          migrations: (
            await sql`SELECT migration_name,sha256,status FROM public.athyper_schema_migration_v1 WHERE migration_name LIKE '20261002%' ORDER BY migration_name`.execute(
              tx,
            )
          ).rows,
          candidateStorage: [],
        };
        for (const entry of report.entities.filter(
          (e: any) => e.selectedChangeSetId,
        )) {
          const draft = entry.drafts.find(
            (d: any) => d.id === entry.selectedChangeSetId,
          );
          if (!draft.targets.some((t: any) => t.plane === plane)) continue;
          const graph =
            artifacts[`${entry.entityCode}/draft-${draft.id}.json`].graph;
          const profile = graph.runtimeProfiles[0];
          const columns = (
            await sql<{
              column_name: string;
            }>`SELECT column_name FROM information_schema.columns
          WHERE table_schema=${profile.storageSchema} AND table_name=${profile.storageObject}`.execute(
              tx,
            )
          ).rows.map((r) => r.column_name);
          const stored = graph.fields
            .filter(
              (f: any) =>
                f.valueOrigin === "stored" && f.status !== "deprecated",
            )
            .map((f: any) => f.storagePath);
          const rls = (
            await sql`SELECT c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=${profile.storageSchema} AND c.relname=${profile.storageObject}`.execute(
              tx,
            )
          ).rows;
          const dependencies = entry.dependencies.map((entity: string) => ({
            entity,
            coordinatedCandidate: report.entities.some(
              (e: any) =>
                e.entityCode === entity &&
                e.selectedChangeSetId &&
                e.drafts
                  .find((d: any) => d.id === e.selectedChangeSetId)
                  .targets.some((t: any) => t.plane === plane),
            ),
            activeHead:
              report.planes[plane].heads.find((h: any) =>
                ["metadata.entity.", "metadata.reference."].some(
                  (prefix) => h.publication_key === prefix + entity,
                ),
              ) ?? null,
          }));
          report.planes[plane].candidateStorage.push({
            entityCode: entry.entityCode,
            schema: profile.storageSchema,
            object: profile.storageObject,
            missingColumns: stored.filter(
              (name: string) => !columns.includes(name),
            ),
            rls,
            dependencies,
            qualifiedRuntime: false,
          });
        }
      });
  } finally {
    await target.destroy();
  }
}
for (const [name, value] of Object.entries(artifacts)) {
  const path = join(output, name);
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}
report.artifactHashes = Object.fromEntries(
  Object.entries(artifacts).map(([name, value]) => [
    name,
    sha256(JSON.parse(JSON.stringify(value))),
  ]),
);
report.summary = {
  draftCount: report.entities.reduce(
    (n: number, e: any) => n + e.drafts.length,
    0,
  ),
  selectedEntities: report.entities
    .filter((e: any) => e.selectedChangeSetId)
    .map((e: any) => e.entityCode),
  excludedDraftCount: report.entities
    .flatMap((e: any) => e.drafts)
    .filter((d: any) => d.disposition === "exclude_preserve_draft").length,
  targetCounts: Object.fromEntries(
    ["neon", "mesh", "studio"].map((plane) => [
      plane,
      report.planes[plane].candidateStorage.length,
    ]),
  ),
  tenantCandidates: report.entities.filter(
    (e: any) => e.selectedChangeSetId && e.sourceTenantId !== null,
  ).length,
};
report.requiredGates = [
  "Platform Admin must author/adopt and propose each exact candidate; seed authorship is not human authorship.",
  "Independent Platform Owner review/approval must bind the final change-set revision and hashes.",
  "Tenant-owned extensions require separate Tenant Admin/Tenant Owner evidence; none are combined with product baselines.",
  "Recheck draft revisions, repository product hashes, source releases and per-plane activation heads before any write.",
  "Qualify storage, IAM permission coverage, source-authority resolvers and runtime providers through normal publication controls.",
  "Validate real authorized/unauthorized and cross-tenant list/detail/embedded flows after deployment.",
  "No automatic approval or publication through legacy development service-account workflows.",
];
report.excludedWork = [
  "Tenant learning inbox/delivery/ancestry implementation and migration",
  "Security-definer drift reconciliation and operational ownership upgrade",
  "Ingress/enforcement qualification",
  "Replacement successors for stale drafts require separate baseline-preserving preparation; repository products are comparison artifacts only.",
];
// pg timestamps are Date objects in memory. Hash the serialized evidence, not
// the pre-serialization objects, so retained files can independently verify it.
report.manifestHash = sha256(JSON.parse(JSON.stringify(report)));
mkdirSync(output, { recursive: true });
writeFileSync(
  join(output, "inventory.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      output,
      entities: report.entities.length,
      drafts: report.entities.reduce(
        (n: number, e: any) => n + e.drafts.length,
        0,
      ),
      errors: report.entities.flatMap((e: any) =>
        e.drafts
          .filter((d: any) => d.error)
          .map((d: any) => ({ entity: e.entityCode, error: d.error })),
      ),
    },
    null,
    2,
  ),
);
