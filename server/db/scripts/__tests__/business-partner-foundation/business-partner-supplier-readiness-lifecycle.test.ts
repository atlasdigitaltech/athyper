import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("supplier activation is a distinct immutable readiness-evidence authority", async () => {
  const [
    tables,
    functions,
    triggers,
    rls,
    grants,
    migration,
    manifest,
    repository,
  ] = await Promise.all([
    read("ddl/planes/neon/document/03_tables.sql"),
    read("ddl/planes/neon/document/07_functions.sql"),
    read("ddl/planes/neon/document/08_triggers.sql"),
    read("ddl/planes/neon/document/10_rls.sql"),
    read("ddl/planes/neon/document/11_grants.sql"),
    read("migrations/20260829_neon_supplier_readiness_lifecycle.sql"),
    read("migrations/manifests/neon.txt"),
    read(
      "../packages/services/master-data/src/kysely-business-partner-eligibility-repository.ts",
    ),
  ]);
  assert.match(tables, /CREATE TABLE document\.supplier_activation_evidence/);
  assert.match(tables, /readiness_evidence->>'eligible'\)::boolean=true/);
  assert.match(
    functions,
    /Supplier activation readiness evidence is immutable/,
  );
  assert.match(triggers, /trg_supplier_activation_evidence_immutable/);
  assert.match(
    rls,
    /FORCE ROW LEVEL SECURITY;[\s\S]*supplier_activation_evidence/,
  );
  assert.match(
    grants,
    /GRANT SELECT,INSERT ON document\.supplier_activation_evidence/,
  );
  assert.match(migration, /current_database\(\)<>'athyper_neon'/);
  assert.match(manifest, /^20260829_neon_supplier_readiness_lifecycle\.sql$/m);
  assert.match(
    repository,
    /INSERT INTO document\.supplier_activation_evidence/,
  );
});

test("qualification decisions cannot activate roles and expiry is capability-local", async () => {
  const repository = await read(
      "../packages/services/master-data/src/kysely-business-partner-eligibility-repository.ts",
    ),
    service = await read(
      "../packages/services/master-data/src/business-partner-eligibility-service.ts",
    );
  const decisionBody = repository.slice(
    repository.indexOf("async decideQualification"),
    repository.indexOf("async resolve"),
  );
  assert.doesNotMatch(decisionBody, /UPDATE master\.(supplier|customer)/);
  assert.match(repository, /nextReviewAt\s*>=\s*input\.businessDate/);
  assert.match(repository, /command_business_partner_decision/);
  assert.match(repository, /'qualification'.*'expired'/);
  assert.match(service, /SUPPLIER_ACTIVATION_READINESS_FAILED/);
  assert.match(service, /readinessEvidencePinned:true/);
  assert.match(
    service,
    /business_partner\.supplier\.activation_reevaluation_failed/,
  );
});

test("bank readiness requires current verified evidence and preference stays non-authoritative", async () => {
  const repository = await read(
      "../packages/services/master-data/src/kysely-business-partner-eligibility-repository.ts",
    ),
    service = await read(
      "../packages/services/master-data/src/business-partner-eligibility-service.ts",
    );
  assert.match(repository, /account\.is_verified=true/);
  assert.match(repository, /verificationExpiresAt/);
  assert.match(repository, /!bankReady\s*\)\s*block\("BANK_NOT_READY"/);
  assert.match(service, /SUPPLIER_PREFERENCE_READINESS_FAILED/);
  assert.doesNotMatch(service, /preferredSupplier[\s\S]{0,120}eligible:true/);
});

test("external facade is applicant-owned, bounded, and has no decision or activation route", async () => {
  const [routes, repository, tables] = await Promise.all([
    read(
      "../packages/services/master-data/src/business-partner-invitation-routes.ts",
    ),
    read(
      "../packages/services/master-data/src/kysely-business-partner-invitation-repository.ts",
    ),
    read("ddl/planes/neon/document/03_tables.sql"),
  ]);
  assert.match(routes, /path: "supplier"/);
  assert.match(routes, /registrations\/\:requestId\/status/);
  assert.match(routes, /registrations\/\:requestId\/correction/);
  assert.match(routes, /registrations\/\:requestId\/evidence/);
  assert.match(routes, /BUSINESS_PARTNER_INVITATION_RATE_LIMITED/);
  assert.match(routes, /maxBodyBytes/);
  const externalFacade = routes.slice(
    routes.indexOf('app.post("/api/neon/external/business-partner-invitations'),
    routes.indexOf(
      "export function createBusinessPartnerInvitationExternalGuard",
    ),
  );
  assert.doesNotMatch(externalFacade, /decision|activation|finance/);
  assert.match(
    repository,
    /applicant_principal_id=\$\{input\.applicantPrincipalId\}::uuid/,
  );
  assert.match(repository, /applicant_access_revoked_at IS NULL/);
  assert.match(
    tables,
    /CREATE TABLE document\.business_partner_invitation_recovery/,
  );
  assert.doesNotMatch(
    tables,
    /CREATE TABLE document\.supplier_registration_recovery/,
  );
});

test("qualification persistence has optimistic concurrency and idempotent decision evidence", async () => {
  const [tables, indexes, functions, migration, manifest] = await Promise.all([
    read("ddl/planes/neon/control/03_tables.sql"),
    read("ddl/planes/neon/control/06_indexes.sql"),
    read("ddl/planes/neon/control/07_functions.sql"),
    read(
      "migrations/20260828_neon_business_partner_qualification_readiness.sql",
    ),
    read("migrations/manifests/neon.txt"),
  ]);

  for (const column of [
    "idempotency_key",
    "decision_idempotency_key",
    "decision_fingerprint",
    "row_version",
  ]) {
    assert.match(tables, new RegExp(column));
  }
  assert.match(indexes, /business_partner_qualification_readiness_idx/);
  assert.match(functions, /Qualification decision evidence is immutable/);
  assert.match(migration, /current_database\(\) <> 'athyper_neon'/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION control\.trg_guard_business_partner_qualification/,
  );
  assert.match(
    manifest,
    /^20260828_neon_business_partner_qualification_readiness\.sql$/m,
  );
});

test("qualification, preference, profile-publication and bank-disclosure audit contract is installed identically in every plane", async () => {
  const seed = await read("ddl/common/audit/12_reference_seed.sql");

  assert.match(seed, /qualification/);
  assert.match(seed, /preference/);
  assert.match(seed, /profile_publication/);
  assert.match(seed, /bank_disclosure/);
  assert.match(
    seed,
    /business_partner_onboarding_qualification_profile_and_bank_disclosure_evidence/,
  );
  for (const plane of ["studio", "neon", "mesh"]) {
    assert.match(
      await read(`ddl/planes/${plane}/_manifest.txt`),
      /^common\/audit\/12_reference_seed\.sql$/m,
    );
  }
});
