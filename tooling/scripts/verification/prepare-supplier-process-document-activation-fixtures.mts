/** P4 boundary fixture: controlled upstream risk/company setup, real qualification/lifecycle repositories and readiness evaluation. No IAM grants or fabricated document results. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { KyselyBusinessPartnerEligibilityRepository } from "../../../server/packages/services/master-data/src/kysely-business-partner-eligibility-repository.js";
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
  maker = "cca94907-7519-5871-8e3c-6b11aa545c93",
  checker = "645b6a55-3355-526a-9643-3900425bde47",
  date = new Date().toISOString().slice(0, 10),
  repository = new KyselyBusinessPartnerEligibilityRepository();
const cases = JSON.parse(
    readFileSync(
      "governance/policy/reports/supplier-process-submission-live.dev.json",
      "utf8",
    ),
  ).cases.filter((c: any) => c.process),
  report: any = {
    at: new Date().toISOString(),
    mode: "Controlled upstream risk/company/qualification fixture for synthetic DEV P2 suppliers; real readiness resolver and existing supplier activation repository. No claim of authenticated P6 risk/company approval.",
    fixtures: [],
  };
async function actor(tx: any, id: string) {
  await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${id},true),set_config('app.database_plane','neon',true),set_config('app.current_actor_type','user',true)`.execute(
    tx,
  );
}
try {
  for (const fixture of cases) {
    await db.transaction().execute(async (tx: any) => {
      await actor(tx, maker);
      const c = (
        await sql`SELECT c.id,c.status,c.target_entity_id,c.result_snapshot_id,b.name,b.status partner_status,b.record_version,s.id supplier_id,s.status supplier_status,e.evidence->'coordinate'->'scope' scope FROM document.entity_case c JOIN master.business_partner b ON b.tenant_id=c.tenant_id AND b.id=c.target_entity_id JOIN master.supplier s ON s.tenant_id=b.tenant_id AND s.business_partner_id=b.id JOIN governance.process_attempt a ON a.tenant_id=c.tenant_id AND a.case_id=c.id JOIN governance.process_selection_evidence e ON e.tenant_id=a.tenant_id AND e.id=a.selection_id WHERE c.tenant_id=${tenant}::uuid AND c.id=${fixture.id}::uuid`.execute(
          tx,
        )
      ).rows[0];
      assert.ok(
        c,
        "Materialize the accepted synthetic case through the owning API first",
      );
      assert.equal(c.status, "materialized");
      assert.ok(c.result_snapshot_id);
      assert.match(c.name, /^DEV P2 (basic|standard|enhanced) /);
      const key = `p4-activation-fixture:${c.id}`,
        prior = await repository.findSupplierActivationByIdempotencyKey(
          tenant,
          key,
          tx,
        );
      if (prior) {
        report.fixtures.push({
          caseId: c.id,
          activation: prior,
          replayed: true,
        });
        return;
      }
      const riskId = randomUUID();
      await sql`INSERT INTO master.party_risk_assessment(id,tenant_id,subject_type,subject_id,business_partner_id,assessment_context,model_code,model_version,risk_band,status,assessed_at,assessed_by,approved_at,approved_by,next_review_at,notes,created_by) VALUES(${riskId}::uuid,${tenant}::uuid,'supplier',${c.supplier_id}::uuid,${c.target_entity_id}::uuid,'supplier_role','standard_supplier','1.0','low','approved',now(),${maker}::uuid,now(),${checker}::uuid,${date}::date+30,'P4 controlled upstream readiness fixture; not a live risk assessment',${maker}::uuid)`.execute(
        tx,
      );
      await sql`INSERT INTO master.company_code_supplier_profile(tenant_id,supplier_id,company_code_id,currency_code,status,metadata,created_by) VALUES(${tenant}::uuid,${c.supplier_id}::uuid,${c.scope.companyCodeId}::uuid,'MYR','active','{"qualificationFixture":"P4 purchasing activation; payment readiness is not claimed"}'::jsonb,${maker}::uuid) ON CONFLICT(tenant_id,supplier_id,company_code_id) DO NOTHING`.execute(
        tx,
      );
      if (c.partner_status !== "active")
        await sql`SELECT * FROM control.command_business_partner_lifecycle(${tenant}::uuid,'business_partner',${c.target_entity_id}::uuid,'active',${Number(c.record_version)}::bigint,'P4_SYNTHETIC_ACTIVATION_FIXTURE',${`p4-partner-active:${c.id}`},${maker}::uuid)`.execute(
          tx,
        );
      const qualification = await repository.createQualification(
        {
          tenantId: tenant,
          businessPartnerId: c.target_entity_id,
          partnerRole: "supplier",
          operatingOrganizationId: c.scope.operatingOrganizationId,
          companyCodeId: c.scope.companyCodeId,
          qualificationTypeCode: "compliance",
          riskAssessmentId: riskId,
          effectiveFrom: date,
          idempotencyKey: `p4-qualification:${c.id}`,
          createdBy: maker,
        },
        tx,
      );
      await actor(tx, checker);
      await repository.decideQualification(
        {
          tenantId: tenant,
          qualificationId: qualification.id,
          expectedVersion: qualification.rowVersion,
          decision: "approved",
          reason: "P4 controlled upstream qualification fixture",
          idempotencyKey: `p4-qualification-decision:${c.id}`,
          decisionFingerprint: createHash("sha256")
            .update(`p4:${qualification.id}`)
            .digest("hex"),
          decidedBy: checker,
        },
        tx,
      );
      const raw = await repository.resolve(
        {
          tenantId: tenant,
          businessPartnerId: c.target_entity_id,
          role: "supplier",
          operatingOrganizationId: c.scope.operatingOrganizationId,
          companyCodeId: c.scope.companyCodeId,
          operationCode: "purchasing",
          businessDate: date,
        },
        tx,
      );
      assert.ok(raw);
      const reasons = raw.reasons.filter(
        (r: any) => r.code !== "ROLE_INACTIVE",
      );
      assert.deepEqual(
        reasons.filter((r: any) => r.severity === "blocking"),
        [],
        "Readiness must actually pass",
      );
      const decision = { ...raw, eligible: true, reasons },
        readiness = {
          ...decision,
          decisionFingerprint: createHash("sha256")
            .update(JSON.stringify({ tenantId: tenant, ...decision }))
            .digest("hex"),
        };
      const activation = await repository.activateSupplier(
        {
          tenantId: tenant,
          businessPartnerId: c.target_entity_id,
          operatingOrganizationId: c.scope.operatingOrganizationId,
          companyCodeId: c.scope.companyCodeId,
          businessDate: date,
          idempotencyKey: key,
          activatedBy: checker,
          readiness,
          commandFingerprint: createHash("sha256")
            .update(
              JSON.stringify({ key, readiness: readiness.decisionFingerprint }),
            )
            .digest("hex"),
        },
        tx,
      );
      assert.ok(activation);
      assert.equal(activation.resultingStatus, "active");
      report.fixtures.push({ caseId: c.id, activation, replayed: false });
    });
  }
  report.passed = true;
} finally {
  await db.destroy();
  writeFileSync(
    "governance/policy/reports/supplier-process-document-activation-fixtures.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: report.passed ?? false,
      fixtures: report.fixtures.length,
    }),
  );
}
