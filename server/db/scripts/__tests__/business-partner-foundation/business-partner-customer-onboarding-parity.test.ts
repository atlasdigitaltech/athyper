import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (file: string) => readFile(path.join(root, file), "utf8");

test("P3 customer onboarding has independent credit, lifecycle, person, invitation, MESH and permission controls", async () => {
  const [
    migration,
    tables,
    requestRepository,
    eligibility,
    match,
    routes,
    permissions,
    manifest,
    ddlManifest,
  ] = await Promise.all([
    read("migrations/20260829_neon_customer_onboarding_parity.sql"),
    read("ddl/planes/neon/control/03_tables.sql"),
    read(
      "../packages/services/master-data/src/kysely-business-partner-request-repository.ts",
    ),
    read(
      "../packages/services/master-data/src/kysely-business-partner-eligibility-repository.ts",
    ),
    read("../packages/planes/neon/src/business-partner-profile-match.ts"),
    read(
      "../packages/services/master-data/src/business-partner-invitation-routes.ts",
    ),
    read(
      "ddl/planes/neon/authz/20_customer_onboarding_permission_reference_seed.sql",
    ),
    read("migrations/manifests/neon.txt"),
    read("ddl/planes/neon/_manifest.txt"),
  ]);
  assert.match(migration, /CREATE TABLE control\.customer_credit_review/);
  assert.match(migration, /CREATE TABLE control\.customer_lifecycle_event/);
  assert.match(migration, /trg_customer_lifecycle_event_immutable/);
  assert.doesNotMatch(
    migration,
    /GRANT SELECT,INSERT,UPDATE ON control\.customer_credit_review,control\.customer_lifecycle_event/,
  );
  assert.match(tables, /registration approval cannot decide it/i);
  assert.match(requestRepository, /CUSTOMER_PERSON_POLICY_DENIED/);
  assert.match(requestRepository, /materializationPolicy:"customer_person_v1"/);
  assert.match(requestRepository, /materialized_person_id=\$\{person/);
  assert.match(
    migration,
    /COALESCE\(proposed_payload->>'partnerCategory',proposed_payload->>'partner_category'\) IN\('person','individual'\)/,
  );
  assert.match(
    migration,
    /materialized_employee_id,materialized_employment_id,materialized_work_assignment_id\)=0/,
  );
  for (const code of [
    "CREDIT_REVIEW_MISSING",
    "CREDIT_REVIEW_PENDING",
    "CREDIT_REVIEW_REJECTED",
    "CREDIT_REVIEW_SUSPENDED",
    "CREDIT_REVIEW_EXPIRED",
  ])
    assert.match(eligibility, new RegExp(code));
  assert.match(match, /meshProposedRole/);
  assert.match(match, /proposedRole==="customer"\?"add_customer"/);
  assert.match(routes, /path: "customer"/);
  assert.match(routes, /\$\{config\.path\}-registrations\/accept/);
  for (const code of [
    "neon.customer.credit.decide",
    "neon.customer.lifecycle.activate",
    "neon.customer_registration.external.respond",
  ])
    assert.match(permissions, new RegExp(code.replaceAll(".", "\\.")));
  assert.match(manifest, /^20260829_neon_customer_onboarding_parity\.sql$/m);
  assert.match(
    ddlManifest,
    /^planes\/neon\/authz\/20_customer_onboarding_permission_reference_seed\.sql$/m,
  );
});
