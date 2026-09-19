/** Real readiness owner with transaction-local bank/commercial inputs; all fixture writes roll back. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { KyselyBusinessPartnerEligibilityRepository } from "../../../server/packages/services/master-data/src/kysely-business-partner-eligibility-repository.js";
import { prepareSupplierActivation } from "../../../server/packages/services/master-data/src/supplier-activation-readiness.js";
const require = createRequire(
    new URL("../../../server/db/package.json", import.meta.url),
  ),
  { Pool } = require("pg"),
  { Kysely, PostgresDialect, sql } = require("kysely");
const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      host: execFileSync(
        "docker",
        [
          "inspect",
          "--format",
          "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
          "athyper-dev-db-1",
        ],
        { encoding: "utf8" },
      ).trim(),
      user: "postgres",
      database: "athyper_neon",
      password: readFileSync(
        `${process.env.HOME}/.athyper/instances/dev/secrets/postgres-password`,
        "utf8",
      ).trim(),
    }),
  }),
});

const tenant = "44444444-4444-4444-8444-444444444444",
  actor = "cca94907-7519-5871-8e3c-6b11aa545c93",
  org = "a478f9c0-8226-5d22-9599-b8fb27a45180",
  company = "793b6cb3-3c61-57c0-9562-2cbc288bd4cf";
const report: any = {
  at: new Date().toISOString(),
  boundary:
    "Existing eligibility/readiness owners against real PostgreSQL. Synthetic commercial/bank inputs and lifecycle changes are transaction-local and rolled back; no claim of an external bank verification journey.",
  cases: [],
};
const fixtures = JSON.parse(
  readFileSync(
    "governance/policy/reports/supplier-onboarding-activation-live.dev.json",
    "utf8",
  ),
).cases;
const rollback = new Error("P6 fixture rollback");
try {
  for (const c of fixtures) {
    await db
      .transaction()
      .execute(async (tx: any) => {
        await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${actor},true),set_config('app.database_plane','neon',true)`.execute(
          tx,
        );
        const repo = new KyselyBusinessPartnerEligibilityRepository();
        const query = {
          tenantId: tenant,
          businessPartnerId: c.businessPartnerId,
          role: "supplier" as const,
          operatingOrganizationId: org,
          companyCodeId: company,
          operationCode: "payment",
          businessDate: new Date().toISOString().slice(0, 10),
        };
        const read = () => repo.resolve(query, tx);
        const before = await read();
        assert.ok(before);
        assert.ok(before.reasons.some((r) => r.code === "BANK_NOT_READY"));
        assert.ok(
          before.reasons.some((r) => r.code === "PAYMENT_TERM_INVALID"),
        );
        const term = (
          await sql`INSERT INTO master.payment_term(tenant_id,code,name,due_days,status,created_by) VALUES(${tenant}::uuid,${`p6-${randomUUID()}`},'P6 rollback net terms',30,'draft',${actor}::uuid) RETURNING id`.execute(
            tx,
          )
        ).rows[0];
        await sql`UPDATE master.payment_term SET status='active',updated_by=${actor}::uuid,updated_at=now() WHERE id=${term.id}::uuid`.execute(
          tx,
        );
        const account = (
          await sql`INSERT INTO master.bank_account(tenant_id,account_holder_name,account_id_type,account_id_value,account_last4,currency_code,bank_name_override,bank_country_override,created_by) VALUES(${tenant}::uuid,'P6 synthetic rollback supplier','local','P6TEST0001','0001','MYR','P6 Synthetic Bank','MY',${actor}::uuid) RETURNING id`.execute(
            tx,
          )
        ).rows[0];
        // Existing bank verification guard owns actor/time evidence on update.
        await sql`UPDATE master.bank_account SET is_verified=true,verification_method='manual',verified_by=${actor}::uuid,status='active',updated_by=${actor}::uuid,updated_at=now() WHERE id=${account.id}::uuid`.execute(
          tx,
        );
        const link = (
          await sql`INSERT INTO master.bank_account_link(tenant_id,owner_type_id,owner_type,owner_id,relationship_role,bank_account_id,company_code_id,created_by) SELECT ${tenant}::uuid,id,'business_partner',${c.businessPartnerId}::uuid,'beneficiary',${account.id}::uuid,${company}::uuid,${actor}::uuid FROM control.owner_type WHERE code='business_partner' RETURNING id`.execute(
            tx,
          )
        ).rows[0];
        assert.ok(link);
        await sql`UPDATE master.bank_account_company_usage SET accepted_at=now(),accepted_by=${actor}::uuid WHERE tenant_id=${tenant}::uuid AND bank_account_link_id=${link.id}::uuid AND company_code_id=${company}::uuid`.execute(
          tx,
        );
        await sql`UPDATE master.company_code_supplier_profile SET payment_term_id=${term.id}::uuid,preferred_remittance_bank_link_id=${link.id}::uuid,updated_at=now(),updated_by=${actor}::uuid WHERE tenant_id=${tenant}::uuid AND supplier_id=(SELECT id FROM master.supplier WHERE tenant_id=${tenant}::uuid AND business_partner_id=${c.businessPartnerId}::uuid) AND company_code_id=${company}::uuid`.execute(
          tx,
        );
        const positive = await read();
        assert.equal(
          positive?.eligible,
          true,
          JSON.stringify(positive?.reasons),
        );
        const evidence = JSON.stringify(positive?.operationalEvidence);
        assert.ok(!evidence.includes("P6TEST0001"));
        assert.ok(!evidence.includes("account_id_value"));
        await sql`UPDATE master.bank_account_company_usage SET accepted_at=NULL,accepted_by=NULL WHERE tenant_id=${tenant}::uuid AND bank_account_link_id=${link.id}::uuid`.execute(
          tx,
        );
        const unaccepted = await read();
        assert.ok(
          unaccepted?.reasons.some((r) => r.code === "BANK_NOT_READY"),
          "Revoked company acceptance must block payment",
        );
        await sql`UPDATE master.bank_account_company_usage SET accepted_at=now(),accepted_by=${actor}::uuid WHERE tenant_id=${tenant}::uuid AND bank_account_link_id=${link.id}::uuid`.execute(
          tx,
        );
        await sql`UPDATE master.bank_account SET metadata=jsonb_build_object('verificationExpiresAt',(current_date-1)::text),updated_by=${actor}::uuid,updated_at=clock_timestamp() WHERE id=${account.id}::uuid`.execute(
          tx,
        );
        const expired = await read();
        assert.ok(expired?.reasons.some((r) => r.code === "BANK_NOT_READY"));
        assert.notDeepEqual(
          expired?.operationalEvidence,
          positive?.operationalEvidence,
        );
        await sql`UPDATE master.bank_account SET metadata='{}',is_verified=false,updated_by=${actor}::uuid,updated_at=clock_timestamp() WHERE id=${account.id}::uuid`.execute(
          tx,
        );
        const unverified = await read();
        assert.ok(unverified?.reasons.some((r) => r.code === "BANK_NOT_READY"));
        const s = (
          await sql`SELECT id,record_version FROM master.supplier WHERE tenant_id=${tenant}::uuid AND business_partner_id=${c.businessPartnerId}::uuid`.execute(
            tx,
          )
        ).rows[0];
        const request: any = {
          tenantId: tenant,
          targetBusinessPartnerId: c.businessPartnerId,
          operatingOrganizationId: org,
          companyCodeId: company,
          proposedPayload: {
            activation: {
              businessDate: query.businessDate,
              expectedSupplierVersion: Number(s.record_version) - 1,
            },
          },
        };
        await assert.rejects(
          () => prepareSupplierActivation(request, tx),
          (e: any) => e.code === "SUPPLIER_ACTIVATION_VERSION_CHANGED",
        );
        // Exercise stale pin against the real owner on a reversible suspended supplier.
        await sql`SELECT * FROM control.command_business_partner_lifecycle(${tenant}::uuid,'supplier',${s.id}::uuid,'suspended',${Number(s.record_version)}::bigint,'P6_ROLLBACK_QUALIFICATION',${randomUUID()},${actor}::uuid)`.execute(
          tx,
        );
        const updated = (
          await sql`SELECT record_version FROM master.supplier WHERE id=${s.id}::uuid`.execute(
            tx,
          )
        ).rows[0];
        request.proposedPayload.activation = {
          businessDate: query.businessDate,
          expectedSupplierVersion: Number(updated.record_version),
          policyId: "e008eb56-7d4a-47f6-a122-b66149330d71",
          policyVersion: 1,
          readinessFingerprint: "0".repeat(64),
        };
        await assert.rejects(
          () => prepareSupplierActivation(request, tx),
          (e: any) => e.code === "SUPPLIER_ACTIVATION_READINESS_CHANGED",
        );
        report.cases.push({
          level: c.level,
          missingBankBlocked: true,
          missingTermsBlocked: true,
          verifiedPaymentReady: true,
          revokedCompanyAcceptanceBlocked: true,
          expiredBankBlocked: true,
          unverifiedBankBlocked: true,
          safeOperationalEvidence: true,
          staleVersionRejected: true,
          staleReadinessRejected: true,
        });
        throw rollback;
      })
      .catch((e: any) => {
        if (e !== rollback) throw e;
      });
  }
  report.passed = true;
} finally {
  await db.destroy();
  writeFileSync(
    "governance/policy/reports/supplier-onboarding-payment-db.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: report.passed ?? false,
      cases: report.cases.length,
    }),
  );
}
