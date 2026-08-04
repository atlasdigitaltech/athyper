import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { MetaEntityAuthoringService } from "../../../packages/services/meta-entity-authoring/src/meta-entity-authoring.service.js";
import { PostgresMetaEntityAuthoringRepository } from "../../../packages/services/meta-entity-authoring/src/postgres-meta-entity-authoring.repository.js";

const databaseUrl = process.env["META_ENTITY_VERIFY_ADMIN_URL"];
if (!databaseUrl) throw new Error("META_ENTITY_VERIFY_ADMIN_URL is required");

const db = new Kysely<never>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: databaseUrl }) }) });
try {
  const source = await sql<{ change_set_id: string; lock_version: number | string }>`
    SELECT c.id AS change_set_id,c.lock_version
      FROM metadata.entity_change_set c JOIN metadata.entity e ON e.id=c.entity_id
     WHERE e.entity_code='business_partner' AND c.change_set_code='p2_7_studio_draft'
     ORDER BY c.created_at LIMIT 1
  `.execute(db);
  const row = source.rows[0];
  if (!row) throw new Error("The P2.7 Business Partner example is not installed");

  const context = {
    tenantId: "00000000-0000-0000-0000-000000000000",
    principalId: "00000000-0000-0000-0000-000000000000",
    requestId: "meta-contract-test-runner-smoke",
  };
  const service = new MetaEntityAuthoringService(new PostgresMetaEntityAuthoringRepository(db));
  const graph = await service.getGraph(context, row.change_set_id);
  if (graph.lifecycleBindings.length !== 1 || graph.lifecycleOperationBindings.length !== 2
    || graph.lifecycleBindings[0]?.targetPlane !== "neon"
    || graph.lifecycleBindings[0]?.lifecycleCode !== "business_partner.standard") {
    throw new Error(`Unexpected lifecycle graph: ${JSON.stringify({
      bindings: graph.lifecycleBindings,
      operationBindings: graph.lifecycleOperationBindings,
    })}`);
  }
  if (graph.numberingBindings.length !== 1
    || graph.numberingBindings[0]?.targetPlane !== "neon"
    || graph.numberingBindings[0]?.policyCode !== "business_partner.primary_number"
    || graph.numberingBindings[0]?.policyRevision !== 1) {
    throw new Error(`Unexpected numbering graph: ${JSON.stringify(graph.numberingBindings)}`);
  }
  const run = await service.runContractTests(context, {
    changeSetId: row.change_set_id,
    expectedLockVersion: Number(row.lock_version),
  });
  const [runs, results] = await Promise.all([
    service.listContractTestRuns(context, row.change_set_id),
    service.listContractTestResults(context, run.id),
  ]);
  if (run.status !== "passed" || run.totalCount !== 3 || run.passedCount !== 3
    || results.length !== 3 || runs[0]?.id !== run.id || results.some((item) => !item.assertionPassed)) {
    throw new Error(`Unexpected contract-test evidence: ${JSON.stringify({ run, results })}`);
  }
  process.stdout.write(`META_ENTITY_CONTRACT_TEST_RUNNER_SMOKE_OK run=${run.id} status=${run.status} results=${results.length}\n`);
} finally {
  await db.destroy();
}
