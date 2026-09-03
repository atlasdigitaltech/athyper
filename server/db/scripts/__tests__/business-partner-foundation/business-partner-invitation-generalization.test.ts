import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("P5 generalizes invitation authority without supplier-only leakage", async () => {
  const [
    tables,
    constraints,
    indexes,
    functions,
    triggers,
    views,
    rls,
    grants,
    migration,
    manifest,
    ddlManifest,
    contract,
    repository,
    service,
    routes,
    composition,
  ] = await Promise.all([
    read("ddl/planes/neon/document/03_tables.sql"),
    read("ddl/planes/neon/document/05_constraints.sql"),
    read("ddl/planes/neon/document/06_indexes.sql"),
    read("ddl/planes/neon/document/07_functions.sql"),
    read("ddl/planes/neon/document/08_triggers.sql"),
    read("ddl/planes/neon/document/09_views.sql"),
    read("ddl/planes/neon/document/10_rls.sql"),
    read("ddl/planes/neon/document/11_grants.sql"),
    read(
      "migrations/20260829_neon_business_partner_invitation_generalization.sql",
    ),
    read("migrations/manifests/neon.txt"),
    read("ddl/planes/neon/_manifest.txt"),
    read(
      "../packages/contracts/master-data/src/business-partner-invitations.ts",
    ),
    read(
      "../packages/services/master-data/src/kysely-business-partner-invitation-repository.ts",
    ),
    read(
      "../packages/services/master-data/src/business-partner-invitation-service.ts",
    ),
    read(
      "../packages/services/master-data/src/business-partner-invitation-routes.ts",
    ),
    read("../apps/platform-host/src/composition/register-services.ts"),
  ]);
  for (const source of [tables, migration])
    for (const token of [
      "business_partner_invitation",
      "journey_kind",
      "registration_mode",
      "requested_role",
      "scope_kind",
      "invitee_email_hash",
      "token_hash",
      "applicant_principal_id",
      "business_partner_request_id",
      "row_version",
      "idempotency_key",
    ])
      assert.match(source, new RegExp(token));
  for (const journey of ["supplier", "customer", "candidate"])
    assert.match(contract, new RegExp(`"${journey}"`));
  assert.match(
    views,
    /CREATE VIEW document\.supplier_registration_invitation WITH \(security_invoker=true,security_barrier=true\)/,
  );
  assert.match(views, /WHERE journey_kind='supplier'/);
  assert.match(
    grants,
    /GRANT SELECT ON document\.supplier_registration_invitation/,
  );
  assert.match(
    migration,
    /ALTER TABLE document\.supplier_registration_invitation RENAME TO supplier_registration_invitation_legacy/,
  );
  assert.match(
    migration,
    /Controlled writes go through the business-partner invitation service/,
  );
  assert.match(repository, /FOR UPDATE/);
  assert.match(repository, /status='pending' AND row_version=/);
  assert.match(
    repository,
    /ON CONFLICT\(tenant_id,idempotency_key\) DO NOTHING/,
  );
  assert.doesNotMatch(
    repository,
    /business_partner_invitation_applicant_policy|approved_fields|approved_actions/,
  );
  assert.match(repository, /applicant_access_revoked_at IS NULL/);
  assert.match(repository, /requests\.findByIdempotencyKey/);
  assert.match(repository, /requests\.create/);
  assert.match(service, /randomBytes\(32\)/);
  assert.match(service, /token: rawToken/);
  assert.match(service, /assertApprovedFields/);
  assert.match(service, /restrictedSessionRequired: true/);
  assert.match(routes, /business-partner-invitations\/:invitationId\/resend/);
  assert.match(routes, /path: "candidate"/);
  assert.match(routes, /\$\{config\.path\}-registrations\/accept/);
  assert.match(routes, /path: "supplier"/);
  assert.match(routes, /path: "customer"/);
  assert.match(triggers, /trg_business_partner_invitation_10_guard/);
  assert.match(functions, /Resend must atomically rotate the token hash/);
  for (const table of [
    "business_partner_invitation",
    "business_partner_invitation_recovery",
  ])
    assert.match(rls, new RegExp(`${table} FORCE ROW LEVEL SECURITY`));
  assert.match(
    migration,
    /current_setting\('app\.database_plane',\s*true\)\s*(?:<>|IS DISTINCT FROM)\s*'neon'/,
  );
  assert.doesNotMatch(
    `${migration}\n${rls}`,
    /shared\.(?:raise_wrong_database|current_principal_id)/,
  );
  assert.match(`${migration}\n${rls}`, /master\.current_principal_id_soft\(\)/);
  assert.match(composition, /KyselyBusinessPartnerInvitationRepository/);
  assert.doesNotMatch(
    composition,
    /new KyselySupplierRegistrationInvitationRepository/,
  );
  assert.match(
    manifest,
    /^20260829_neon_business_partner_invitation_generalization\.sql$/m,
  );
  assert.match(
    ddlManifest,
    /14_permission_reference_seed\.sql/,
  );
  assert.doesNotMatch(`${tables}\n${migration}`, /\b(?:raw_)?token\b\s+text/i);
  assert.doesNotMatch(`${tables}\n${migration}`, /invitee_email\s+text/i);
  assert.match(
    constraints,
    /business_partner_request_invitation_fk[\s\S]*REFERENCES document\.business_partner_invitation/,
  );
  assert.match(indexes, /business_partner_invitation_request_uq/);
});

test("Business Partner persistence removes legacy authorities and hardens retained evidence", async () => {
  const [
    tables,
    constraints,
    functions,
    triggers,
    rls,
    grants,
    migration,
    manifest,
    repository,
    composition,
  ] = await Promise.all([
    read("ddl/planes/neon/document/03_tables.sql"),
    read("ddl/planes/neon/document/05_constraints.sql"),
    read("ddl/planes/neon/document/07_functions.sql"),
    read("ddl/planes/neon/document/08_triggers.sql"),
    read("ddl/planes/neon/document/10_rls.sql"),
    read("ddl/planes/neon/document/11_grants.sql"),
    read("migrations/20260830_neon_business_partner_table_streamlining.sql"),
    read("migrations/manifests/neon.txt"),
    read(
      "../packages/services/master-data/src/kysely-business-partner-invitation-repository.ts",
    ),
    read("../apps/platform-host/src/composition/register-services.ts"),
  ]);
  for (const legacy of [
    "supplier_registration_invitation_legacy",
    "supplier_registration_recovery",
    "business_partner_invitation_applicant_policy",
  ]) {
    assert.doesNotMatch(
      tables,
      new RegExp(`CREATE TABLE document\\.${legacy}`),
    );
    assert.doesNotMatch(
      `${constraints}\n${triggers}\n${rls}\n${grants}`,
      new RegExp(`document\\.${legacy}`),
    );
    assert.match(migration, new RegExp(`DROP TABLE document\\.${legacy}`));
  }
  assert.match(tables, /applicant_access_revoked_at/);
  assert.match(repository, /applicant_access_revoked_at IS NULL/);
  assert.doesNotMatch(
    repository,
    /approved_fields|approved_actions|business_partner_invitation_applicant_policy/,
  );
  assert.match(functions, /trg_guard_business_partner_request_evidence/);
  assert.match(triggers, /trg_business_partner_request_evidence_guard/);
  assert.match(
    functions,
    /fn_resolve_business_partner_duplicate[\s\S]*SECURITY DEFINER/,
  );
  assert.doesNotMatch(
    grants,
    /GRANT SELECT,INSERT ON document\.business_partner_duplicate_resolution TO athyperapp/,
  );
  assert.doesNotMatch(
    composition,
    /supplier_registration_recovery|business_partner_invitation_applicant_policy/,
  );
  assert.match(
    manifest,
    /^20260830_neon_business_partner_table_streamlining\.sql$/m,
  );
});
