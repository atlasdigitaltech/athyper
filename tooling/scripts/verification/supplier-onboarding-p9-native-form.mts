/** Rebuild the native forms from canonical sources on the disposable Studio database. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { supplierRequestForm } from "../../../server/packages/services/publication/src/business-partner-foundation-definition.js";
import { provisionBusinessPartnerIntakeGraph } from "../../../server/db/scripts/provisioning/business-partner-intake-graph.js";
import { KyselyMetaEntityAuthoringRepository } from "../../../server/packages/planes/studio/meta-entity-authoring/src/kysely-authoring-repository.js";
import {
  validateGraph,
  runContractTests,
  compileGraph,
  sha256,
} from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js";
const require = createRequire(
  new URL("../../../server/db/package.json", import.meta.url),
);
const { Pool } = require("pg"),
  { Kysely, PostgresDialect, sql } = require("kysely");
export async function qualifyNativeForm(socket: string) {
  assert.match(socket, /^\/tmp\/athyper-p9-socket-[a-zA-Z0-9]+$/);
  const db = new Kysely({
    dialect: new PostgresDialect({
      pool: new Pool({
        host: socket,
        user: "postgres",
        database: "athyper_studio",
      }),
    }),
  });
  const source =
    "governance/policy/reviews/business-partner-canonical-v2-native-graph.dev.json";
  const graph = provisionBusinessPartnerIntakeGraph(
    JSON.parse(readFileSync(source, "utf8")),
    supplierRequestForm as never,
  );
  try {
    return await db.transaction().execute(async (tx: any) => {
      const tenant = "44444444-4444-4444-8444-444444444444";
      const actor = (
        await sql`SELECT id FROM master.principal WHERE tenant_id=${tenant}::uuid AND code='catl.admin'`.execute(
          tx,
        )
      ).rows[0]?.id;
      assert.ok(actor);
      await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${actor},true)`.execute(
        tx,
      );
      const repository = new KyselyMetaEntityAuthoringRepository(tx);
      const draft = await repository.createDraft({
        tenantId: tenant,
        entityId: randomUUID(),
        entityCode: "business_partner",
        branchCode: "local-preview",
        title: "P9 canonical supplier forms",
        actorId: actor,
        registration: {
          schemaVersion: 1,
          moduleCode: "rel",
          entityClass: "configuration",
          ownershipModel: "overlay",
        },
      });
      const saved = await repository.replaceGraph({
        changeSetId: draft.id,
        expectedRevision: draft.revision,
        graph,
        actorId: actor,
      });
      const stored = await repository.loadGraph(draft.id);
      const validation = validateGraph(stored);
      assert.deepEqual(validation.issues, []);
      const tests = runContractTests(stored);
      assert.equal(tests.passed, true);
      await repository.recordValidation(
        draft.id,
        saved.revision,
        validation,
        actor,
      );
      await repository.recordTestRun(draft.id, saved.revision, tests, actor);
      const artifact = compileGraph(stored);
      const fields = stored.surfaceFieldBindings?.filter((b: any) =>
        ["requestedComplianceLevel", "complianceRequirementReason"].some((f) =>
          JSON.stringify(b).includes(f),
        ),
      );
      assert.ok(fields?.length);
      assert.deepEqual(provisionBusinessPartnerIntakeGraph(graph), graph);
      const output =
        "governance/policy/reports/supplier-onboarding-p9-native-form.dev.json";
      const result = {
        passed: true,
        source,
        sourceHash: sha256(readFileSync(source, "utf8")),
        changeSetId: draft.id,
        revision: saved.revision,
        contractHash: artifact.contractHash,
        descriptorHash: artifact.descriptorHash,
        fields,
        tests,
        mode: "Canonical native graph saved and validated in fresh Studio; compiled intake artifact. Live publication and both form views are qualified against DEV owning APIs separately.",
        artifact,
      };
      writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
      return { ...result, artifact: undefined };
    });
  } finally {
    await db.destroy();
  }
}
