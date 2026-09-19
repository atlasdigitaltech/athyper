// Read-only native signature/registration verification. Run inside the selected DEV API or worker container.
// Inherits that running process configuration without logging credentials; never publishes or activates.
import {
  createBusinessPartnerCaseRuntimeRegistrations,
  assertBusinessPartnerCaseRuntimeSemantics,
} from "/app/server/dist/composition/business-partner-case-runtime.js";
import { createBusinessPartnerReadRuntimeRegistrations } from "/app/server/dist/composition/business-partner-read-runtime.js";
import { createBusinessPartnerRevealRuntimeRegistrations } from "/app/server/dist/composition/business-partner-reveal-runtime.js";
import { createBusinessPartnerQualificationRuntimeRegistrations } from "/app/server/dist/composition/business-partner-qualification-runtime.js";
import { createBusinessPartnerActionRuntimeRegistrations } from "/app/server/dist/composition/business-partner-action-runtime.js";
import { createBusinessPartnerImportRegistration } from "/app/server/dist/composition/business-partner-bound-import.js";
import { createBusinessPartnerExportRegistration } from "/app/server/dist/composition/business-partner-export-runtime.js";
import { createBusinessPartnerStoredScopes } from "/app/server/dist/composition/business-partner-stored-scopes.js";
import { createEntityCasePreflight } from "/app/server/dist/composition/entity-case-preflight.js";
import { createEntityAuthorizationRuntimeRegistry } from "@athyper/server-contract-metadata";
import { readFileSync } from "node:fs";
import { loadConfig } from "/app/server/dist/config/index.js";
import { createContainer } from "/app/server/dist/composition/create-container.js";
import { registerAdapters } from "/app/server/dist/composition/register-adapters.js";
import { registerPlatform } from "/app/server/dist/composition/register-platform.js";
import { registerRuntimes } from "/app/server/dist/composition/register-runtimes.js";
import { registerServices } from "/app/server/dist/composition/register-services.js";
import { createLifecycle } from "@athyper/server-foundation/lifecycle";
for (const entry of readFileSync(
  "/proc/" +
    readFileSync("/proc/1/task/1/children", "utf8").trim().split(/\s+/)[0] +
    "/environ",
  "utf8",
).split("\0")) {
  const at = entry.indexOf("=");
  if (at > 0) process.env[entry.slice(0, at)] = entry.slice(at + 1);
}
const config = loadConfig(),
  lifecycle = createLifecycle(),
  container = createContainer();
registerAdapters(container, config, lifecycle);
registerRuntimes(container, config, lifecycle);
registerPlatform(container, config);
registerServices(container, {}, config);

import { sql } from "kysely";
import { VerifiedPublicationArtifactLoader } from "@athyper/server-service-publication";
import {
  canonicalBytes,
  sha256,
} from "@athyper/server-adapter-publication-signing";
const rows = await container.adapters.athyperDatabase.database
  .transaction()
  .execute(async (tx) => {
    await sql`SET TRANSACTION READ ONLY`.execute(tx);
    await sql`SELECT set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true)`.execute(
      tx,
    );
    return (
      await sql`SELECT a.*,r.release_key,r.release_no FROM publication.artifact a JOIN publication.release r ON r.id=a.publication_release_id WHERE r.id='ba383d04-9a18-4e59-ab4e-3d9726e934c6' AND a.status='signed'`.execute(
        tx,
      )
    ).rows;
  });
if (rows.length !== 1) throw Error("Exactly one signed artifact required");

const database = container.adapters.neonDatabase.database;
const scopes = () =>
  createBusinessPartnerStoredScopes(
    database,
    createEntityCasePreflight(database),
  );
const cases = container.services.businessPartnerRequests,
  records = container.services.records,
  providers = container.services.businessPartner360,
  eligibility = container.services.businessPartnerEligibility,
  imports = container.services.businessPartnerGovernedImport;
const registry = createEntityAuthorizationRuntimeRegistry([
  ...createBusinessPartnerCaseRuntimeRegistrations(cases, scopes()),
  ...createBusinessPartnerReadRuntimeRegistrations(
    records.surfaces,
    providers,
    scopes(),
  ),
  ...createBusinessPartnerRevealRuntimeRegistrations(providers, scopes()),
  ...createBusinessPartnerQualificationRuntimeRegistrations(
    eligibility,
    scopes(),
  ),
  ...createBusinessPartnerActionRuntimeRegistrations(
    cases,
    records.queries,
    scopes(),
  ),
  createBusinessPartnerImportRegistration(imports, scopes()),
  createBusinessPartnerExportRegistration(records.transfers, scopes()),
]);
const runtime = {
  qualify(profile, bindings) {
    assertBusinessPartnerCaseRuntimeSemantics(profile);
    registry.qualify(profile, bindings);
  },
};

const a = rows[0],
  loader = new VerifiedPublicationArtifactLoader({
    store: container.adapters.publicationArtifactStore,
    verifier: container.adapters.publicationVerifier,
    canonicalizer: { canonicalBytes, sha256 },
    runtimeVersion: config.publication.runtimeVersion,
    authorizationRuntime: runtime,
  });

const loaded = await loader.load({
  artifactUri: a.artifact_uri,
  artifactHash: a.content_hash,
  targetPlane: a.plane_code,
  publicationKey: a.release_key,
  sourceReleaseId: a.publication_release_id,
  sourceReleaseNo: Number(a.release_no),
  signatureAlgorithm: a.signature_algorithm,
  signingKeyId: a.signing_key_id,
  signature: a.signature,
});
const d = loaded.document.envelope.payload.entityDescriptor.descriptor;
const head = await container.adapters.neonDatabase.database
  .transaction()
  .execute(async (tx) => {
    await sql`SET TRANSACTION READ ONLY`.execute(tx);
    await sql`SELECT set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true)`.execute(
      tx,
    );
    return (
      await sql`SELECT h.* FROM runtime_meta.release_activation_head h WHERE h.publication_key=${a.release_key}`.execute(
        tx,
      )
    ).rows;
  });
console.log(
  JSON.stringify({
    schemaVersion: 1,
    kind: "bp_release_19_signed_artifact_verification",
    capturedAt: new Date().toISOString(),
    releaseId: a.publication_release_id,
    artifactId: a.id,
    artifactHash: a.content_hash,
    signedAt: a.signed_at,
    verification: loaded.verification,
    operationCount: d.authorization.operations.length,
    scopeBindingCount: d.operation_scope_bindings.length,
    qualificationScopes: d.operation_scope_bindings
      .filter((b) => b.operationKey === "qualification")
      .map((b) => b.scopeKind),
    head,
    reviewReceipt:
      loaded.document.manifest.evidence.authorizationReviewReceiptSha256,
    grantsChanged: false,
    activationAuthorized: false,
    authenticatedBusinessJourneysQualified: false,
    policyDifferencesAccepted: false,
  }),
);
process.exit(0);
