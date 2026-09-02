import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("P6 completes signed definition bundles and local definition-driven consumers", async () => {
  const [
    foundation,
    compiler,
    loader,
    consumer,
    mesh,
    composition,
    migration,
    functions,
    triggers,
    canary,
    studioManifest,
    neonManifest,
    meshManifest,
  ] = await Promise.all([
    read(
      "../packages/services/publication/src/business-partner-foundation-definition.ts",
    ),
    read(
      "../packages/services/publication/src/business-partner-definition-compiler.ts",
    ),
    read("../packages/services/publication/src/publication-artifact-loader.ts"),
    read(
      "../packages/services/publication/src/business-partner-definition-consumer.ts",
    ),
    read("../packages/planes/mesh/src/business-partner-profile-publication.ts"),
    read("../apps/platform-host/src/composition/register-services.ts"),
    read(
      "migrations/20260829_business_partner_definition_bundle_completion.sql",
    ),
    read("ddl/common/runtime_meta/07_functions.sql"),
    read("ddl/common/runtime_meta/08_triggers.sql"),
    read("scripts/operations/publication/rehearse-publication-canary.ts"),
    read("migrations/manifests/studio.txt"),
    read("migrations/manifests/neon.txt"),
    read("migrations/manifests/mesh.txt"),
  ]);
  for (const journey of [
    "supplier.new",
    "supplier.add",
    "supplier.qualify",
    "supplier.company",
    "supplier.bank",
    "customer.new",
    "customer.add",
    "customer.credit",
    "customer.company",
    "workforce.new",
    "workforce.add",
    "workforce.change",
    "workforce.offboard",
  ])
    for (const source of [foundation, compiler, migration])
      assert.match(source, new RegExp(journey.replace(".", "\\.")));
  for (const sourceKind of ["internal", "portal", "mesh", "import", "api"])
    assert.match(foundation, new RegExp(`"${sourceKind}"`));
  for (const section of [
    "fieldPolicies",
    "duplicateRules",
    "workflowDefinitions",
    "evidencePolicies",
    "readinessGates",
    "reasonCodeCatalog",
    "meshSafeSchemas",
    "formDescriptors",
    "viewDescriptors",
  ])
    assert.match(foundation, new RegExp(section));
  assert.match(compiler, /deterministic:true,compatible:true/);
  assert.match(compiler, /BUSINESS_PARTNER_DEFINITION_DOWNGRADE_FORBIDDEN/);
  assert.match(
    compiler,
    /BUSINESS_PARTNER_DEFINITION_SOURCE_COMPATIBILITY_REJECTED/,
  );
  assert.match(loader, /signatureVerified/);
  assert.match(loader, /PROJECTION_HASH_MISMATCH/);
  assert.match(loader, /PROJECTION_SCHEMA_VERSION_MISMATCH/);
  assert.match(loader, /compileReportHash/);
  assert.match(consumer, /findActiveBusinessPartnerDefinition/);
  assert.doesNotMatch(consumer, /studioDatabase|STUDIO_DATABASE_URL/);
  assert.match(mesh, /options\.definition\.organizationProfileSchema/);
  assert.match(mesh, /projectAllowed/);
  assert.doesNotMatch(mesh, /fieldSetCode:'recipient_safe_v1'/);
  assert.match(composition, /LocalBusinessPartnerDefinitionConsumer/);
  assert.match(composition, /LocalMeshBusinessPartnerDefinitionConsumer/);
  assert.match(composition, /localDefinitions\.requestSchema/);
  assert.match(composition, /localDefinitions\.workflow/);
  for (const source of [migration, functions]) {
    assert.match(source, /BUSINESS_PARTNER_DEFINITION_DOWNGRADE_FORBIDDEN/);
    assert.match(
      source,
      /BUSINESS_PARTNER_DEFINITION_ROLLBACK_NOT_EXACT_PREVIOUS/,
    );
  }
  assert.match(triggers, /runtime_business_partner_definition_head_guard/);
  assert.match(canary, /sameHead\(afterRollback\[plane\],before\[plane\]\)/);
  assert.match(canary, /artifactHash===right\.artifactHash/);
  for (const manifest of [studioManifest, neonManifest, meshManifest])
    assert.match(
      manifest,
      /^20260829_business_partner_definition_bundle_completion\.sql$/m,
    );
});
