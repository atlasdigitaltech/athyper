import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  applyOwnership,
  buildCoverageArtifact,
  parseCreateTableDeclarations,
  validateCoverageArtifact,
  renderArtifact,
} from "./generate-ddl-service-coverage.mjs";
import { verifyCoverage } from "./verify-ddl-service-coverage.mjs";

const fixtureRoot = resolve(import.meta.dirname, "fixtures/ddl-service-coverage");

test("discovers quoted, unquoted, conditional, and unlogged table declarations", () => {
  const sql = `
    -- CREATE TABLE ignored.comment (id uuid);
    CREATE TABLE public.first_table (id uuid);
    CREATE TABLE IF NOT EXISTS "governance"."Cycle_Run" (id uuid);
    CREATE UNLOGGED TABLE event.delivery_buffer (id uuid);
    /* CREATE TABLE ignored.block_comment (id uuid); */
  `;
  assert.deepEqual(parseCreateTableDeclarations(sql), [
    "public.first_table",
    "governance.cycle_run",
    "event.delivery_buffer",
  ]);
});

test("fixture masks comments, literals, and dollar bodies around multiline conditional DDL", async () => {
  const sql = await readFile(resolve(fixtureRoot, "server/db/ddl/common/core/03_tables.sql"), "utf8");
  assert.deepEqual(parseCreateTableDeclarations(sql), ["shared.quoted_table"]);
});

test("applies ordered ownership rules and the most specific override", () => {
  const ownership = {
    defaults: { classification: "runtime_mutable", serviceOwner: "none", repository: [] },
    rules: [
      { match: { schema: "ledger" }, set: { serviceOwner: "@athyper/server-service-finance" } },
      { match: { tablePattern: "_balance$" }, set: { classification: "projection" } },
    ],
    overrides: { "neon:ledger.gl_balance": { repository: ["specific.ts"] } },
  };
  assert.deepEqual(applyOwnership(ownership, {
    sourceKey: "neon:ledger.gl_balance:server/db/ddl/planes/neon/ledger/03_tables.sql",
    tableKey: "ledger.gl_balance",
    ddlPath: "server/db/ddl/planes/neon/ledger/03_tables.sql",
    scope: "neon",
    installedPlanes: ["neon"],
    physicalAuthority: "neon",
  }), {
    classification: "projection",
    serviceOwner: "@athyper/server-service-finance",
    repository: ["specific.ts"],
  });
});

test("builds a schema-valid inventory from the current plane manifests", async () => {
  const artifact = await buildCoverageArtifact();
  assert.ok(artifact.rows.length > 600);
  assert.equal(new Set(artifact.rows.map((row) => row.sourceKey)).size, artifact.rows.length);
  assert.equal(artifact.summary.tableDeclarations, artifact.rows.length);
  assert.equal(artifact.summary.classifiedAndOwned + artifact.summary.reviewRequired, artifact.rows.length);
  assert.equal(artifact.summary.coveragePercent, 100);
  assert.equal(artifact.summary.reviewRequired, 0);
  assert.equal(validateCoverageArtifact(artifact), artifact);
  assert.ok(artifact.rows.some((row) => row.physicalAuthority === "common_plane_local" && row.installedPlanes.length === 3));
  assert.ok(artifact.rows.some((row) => row.tableKey === "ledger.gl_balance" && row.installedPlanes.join() === "neon"));
});

test("fixture expands common DDL to independent plane rows sorted by plane, schema, and table", async () => {
  const artifact = await buildFixture();
  assert.deepEqual(artifact.rows.map((row) => `${row.plane}:${row.tableKey}`), [
    "studio:shared.quoted_table", "studio:studio.owned_table",
    "neon:neon.local_table", "neon:shared.quoted_table",
    "mesh:mesh.local_table", "mesh:shared.quoted_table",
  ]);
  assert.deepEqual(artifact.summary.byPlane, { mesh: 2, neon: 2, studio: 2 });
  assert.deepEqual(artifact.summary.byOwner, { none: 6 });
  assert.equal(artifact.summary.coveragePercent, 100);
  assert.ok(artifact.rows.filter((row) => row.tableKey === "shared.quoted_table").every((row) => row.physicalAuthority === "common_plane_local"));
});

test("fixture rejects duplicate physical definitions", async () => {
  const root = await copyFixture();
  await writeFile(resolve(root, "server/db/ddl/planes/neon/core/03_tables.sql"), "CREATE TABLE shared.quoted_table (id uuid);\n", "utf8");
  await assert.rejects(() => buildFixture(root), /Duplicate physical definition neon:shared\.quoted_table/);
});

test("fixture rejects duplicate and stale ownership entries after a table is deleted", async () => {
  const ownership = fixtureOwnership();
  ownership.rules.push(structuredClone(ownership.rules[0]));
  ownership.overrides["studio:deleted.table"] = { classification: "read_only" };
  await assert.rejects(() => buildFixture(fixtureRoot, ownership), (error) =>
    error.message.includes("duplicate ownership rules") && error.message.includes("stale ownership entry studio:deleted.table"));
});

test("fixture rejects an unclassified ownership baseline", async () => {
  const ownership = fixtureOwnership();
  delete ownership.defaults.classification;
  await assert.rejects(() => buildFixture(fixtureRoot, ownership), /classification must be one of/);
});

test("verification rejects stale generated output", async () => {
  const expected = await buildFixture();
  const root = await mkdtemp(resolve(tmpdir(), "athyper-ddl-stale-"));
  const outputPath = resolve(root, "ddl-service-coverage.json");
  const stale = structuredClone(expected);
  stale.rows[0].decisionNote = "intentionally stale";
  await writeFile(outputPath, renderArtifact(stale), "utf8");
  await assert.rejects(
    () => verifyCoverage({ expected, outputPath, root: fixtureRoot }),
    /Generated inventory is stale/,
  );
});

async function buildFixture(root = fixtureRoot, ownership = fixtureOwnership()) {
  return buildCoverageArtifact({ root, ownership });
}

async function copyFixture() {
  const root = await mkdtemp(resolve(tmpdir(), "athyper-ddl-coverage-"));
  await cp(fixtureRoot, root, { recursive: true });
  return root;
}

function fixtureOwnership() {
  return {
    schemaVersion: "1.0.0",
    defaults: {
      classification: "runtime_mutable", serviceOwner: "none",
      commands: { decision: "not_exposed", codes: [], reason: "fixture" },
      repository: [], entryPoints: [], auditEvent: [], outboxEvent: [], replayEvidence: [],
      immutabilityEvidence: [], reversalEvidence: [], concurrencyEvidence: [], rebuildEvidence: [],
      reconciliationEvidence: [], mutationComposition: "not_applicable", unitTests: [], postgresTests: [],
      featureGate: null, rolloutStatus: "code_complete", reviewStatus: "reviewed",
    },
    rules: [{ match: { schema: "shared" }, set: { classification: "catalog_seed_managed" } }],
    overrides: {},
  };
}
