/** Real local DB/service journey. This is not an authenticated browser qualification. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import pg from "../../../server/packages/services/publication/node_modules/pg/lib/index.js";
import {
  Kysely,
  PostgresDialect,
  sql,
} from "../../../server/packages/services/publication/node_modules/kysely/dist/esm/index.js";
import { LocalBusinessPartnerDefinitionConsumer } from "../../../server/packages/services/publication/src/business-partner-definition-consumer.js";
import { BusinessPartnerDefinitionService } from "../../../server/packages/services/publication/src/business-partner-definition-service.js";
import { KyselyPublicationAuthorityRepository } from "../../../server/packages/services/publication/src/kysely-authority-repository.js";
import { KyselyLocalProjectionRepository } from "../../../server/packages/services/publication/src/kysely-local-projection-repository.js";
import {
  canonicalBytes,
  sha256,
} from "../../../server/packages/adapters/publication-signing/src/canonical-json.js";
if (
  process.env.ATHYPER_DOMAIN_SUFFIX !== "dev.athyper.test" ||
  process.env.ATHYPER_LOCAL_WORKSPACE !== "1"
)
  throw new Error("Local workspace required");
// Reuse the running API's ordinary runtime connection configuration, never postgres.
for (const pid of readdirSync("/proc").filter((name) => /^\d+$/.test(name))) {
  try {
    const values = Object.fromEntries(
      readFileSync(`/proc/${pid}/environ`, "utf8")
        .split("\0")
        .filter(Boolean)
        .map((value) => {
          const i = value.indexOf("=");
          return [value.slice(0, i), value.slice(i + 1)];
        }),
    );
    if (values.MODE === "api" && values.STUDIO_DATABASE_URL) {
      Object.assign(process.env, values);
      break;
    }
  } catch {}
}
const root = process.env.ATHYPER_LOCAL_PREVIEW_ROOT!;
const source = JSON.parse(
  readFileSync(join(root, "source-baseline.json"), "utf8"),
);
const actorId = "cca94907-7519-5871-8e3c-6b11aa545c93";
const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new pg.Pool({
      connectionString: process.env.STUDIO_DATABASE_URL,
      max: 2,
    }),
  }),
});
const neon = new Kysely({
  dialect: new PostgresDialect({
    pool: new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 }),
  }),
});
const baseline = async () =>
  neon.transaction().execute(async (transaction) => {
    await sql`SELECT set_config('app.current_tenant_id',${source.tenantId},true),set_config('app.current_principal_id',${actorId},true)`.execute(
      transaction,
    );
    return new KyselyLocalProjectionRepository(
      transaction as never,
      false,
    ).findActiveBusinessPartnerDefinition(
      "studio.business_partner.definition.business_partner.onboarding",
    );
  });
const service = new BusinessPartnerDefinitionService({
  database: db as never,
  authority: new KyselyPublicationAuthorityRepository(db as never),
  canonicalizer: { canonicalBytes, sha256 },
  previewBaseline: baseline,
});
const consumer = new LocalBusinessPartnerDefinitionConsumer({
  local: new KyselyLocalProjectionRepository(neon as never),
  canonicalizer: { canonicalBytes, sha256 },
});
const read = async () => {
  const projection = await new KyselyLocalProjectionRepository(
    neon as never,
    true,
  ).findActiveBusinessPartnerDefinition(
    "studio.business_partner.definition.business_partner.onboarding",
  );
  const presentation = await consumer.descriptors();
  assert.equal(presentation.revisionId, projection?.revisionId);
  return projection;
};
const author = async (bundle: unknown) =>
  service.author({
    tenantId: source.tenantId,
    actorId,
    idempotencyKey: randomUUID(),
    bundle,
    targetPlanes: ["neon"],
  });
try {
  const before = (await read())!;
  assert.ok(before);
  const edited = structuredClone(before.bundle) as any;
  const old = edited.formDescriptors.supplierRequest.sections[0].title;
  const label = `${old} — local preview verification`;
  edited.formDescriptors.supplierRequest.sections[0].title = label;
  const saved = await author(edited);
  assert.equal((saved as any).preview.state, "active");
  const active = (await read())!;
  assert.equal(
    (active.bundle.formDescriptors.supplierRequest as any).sections[0].title,
    label,
  );
  assert.equal(active.revisionId, saved.id);
  const layout = structuredClone(edited);
  layout.formDescriptors.supplierRequest.sections.reverse();
  layout.workflowDefinitions.supplier.stages[0].slaMinutes = 75;
  const structured = await author(layout);
  assert.equal(
    (structured as any).preview.state,
    "active",
    JSON.stringify((structured as any).preview),
  );
  assert.deepEqual(
    (await consumer.descriptors()).forms,
    layout.formDescriptors,
  );
  assert.equal(
    (await consumer.workflow({ kind: "add_supplier" })).stages[0]?.slaMinutes,
    75,
  );
  assert.equal(
    await service.get("11111111-1111-4111-8111-111111111111", saved.id),
    null,
  );
  const invalid = structuredClone(edited);
  invalid.fieldPolicies = {};
  const rejected = await author(invalid);
  assert.equal((rejected as any).preview.state, "failed");
  assert.equal((await read())!.revisionId, structured.id);
  const restored = await author(before.bundle);
  assert.equal((restored as any).preview.state, "active");
  assert.deepEqual(
    (await read())!.bundle.formDescriptors,
    before.bundle.formDescriptors,
  );
  const evidence = {
    schema: "athyper.local-preview-service-test/1",
    developmentEvidence: true,
    authenticatedBrowserJourney: false,
    saveCompileActivateRead: true,
    layoutAndWorkflowConsumerVerified: true,
    crossTenantReadDenied: true,
    policyChangeRejected: true,
    lastWorkingRevisionPreserved: true,
    originalLabelsRestored: true,
    savedRevision: saved.id,
    restoredRevision: restored.id,
    humanApprovalPerformed: false,
  };
  writeFileSync(
    join(root, `service-evidence-${Date.now()}.json`),
    JSON.stringify(evidence, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(evidence));
} finally {
  await db.destroy();
  await neon.destroy();
}
