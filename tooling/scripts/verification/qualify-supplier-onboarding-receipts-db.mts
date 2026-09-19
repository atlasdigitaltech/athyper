import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
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

const tenant = "44444444-4444-4444-8444-444444444444";
const report: any = { at: new Date().toISOString(), cases: [] };
try {
  for (const c of JSON.parse(
    readFileSync(
      "governance/policy/reports/supplier-onboarding-activation-live.dev.json",
      "utf8",
    ),
  ).cases) {
    const result = (
      await sql`SELECT r.status,(SELECT count(*)::int FROM event.outbox o WHERE o.tenant_id=r.tenant_id AND o.event_type='business_partner.supplier.onboarding.completed' AND o.entity_id=r.id) completion_events,(SELECT count(*)::int FROM document.supplier_activation_evidence a WHERE a.tenant_id=r.tenant_id AND a.idempotency_key=${`activation-case:${c.activation.id}`}) activation_receipts,(SELECT count(*)::int FROM governance.cycle_subject s WHERE s.tenant_id=r.tenant_id AND s.cycle_run_id=r.id AND s.subject_role='company_setup' AND s.entity_case_id=${c.company.id}::uuid) company_links,(SELECT count(*)::int FROM governance.cycle_subject s WHERE s.tenant_id=r.tenant_id AND s.cycle_run_id=r.id AND s.subject_role='supplier_activation' AND s.entity_case_id=${c.activation.id}::uuid) activation_links FROM governance.cycle_run r WHERE r.tenant_id=${tenant}::uuid AND r.id=${c.runId}::uuid`.execute(
        db,
      )
    ).rows[0];
    assert.deepEqual(result, {
      status: "completed",
      completion_events: 1,
      activation_receipts: 1,
      company_links: 1,
      activation_links: 1,
    });
    report.cases.push({ level: c.level, runId: c.runId, ...result });
  }
  const sourceFailures = (
    await sql`SELECT count(*)::int count FROM document.entity_case WHERE tenant_id=${tenant}::uuid AND idempotency_key LIKE 'p6-missing-bank-source:%'`.execute(
      db,
    )
  ).rows[0];
  assert.equal(sourceFailures.count, 0);
  report.missingBankSourceCreatedNoCases = true;
  const bank = (
    await sql`SELECT count(*)::int count FROM master.bank_account WHERE tenant_id=${tenant}::uuid`.execute(
      db,
    )
  ).rows[0];
  assert.equal(bank.count, 0);
  report.bankFixturesRolledBack = true;
  report.passed = true;
} finally {
  await db.destroy();
  writeFileSync(
    "governance/policy/reports/supplier-onboarding-receipts-db.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: report.passed ?? false,
      cases: report.cases.length,
    }),
  );
}
