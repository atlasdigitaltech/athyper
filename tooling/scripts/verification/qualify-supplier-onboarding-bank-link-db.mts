/** Governed draft/link/reject commands on transaction-local bank-case fixtures, without fabricating Mesh source evidence. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { evaluateSupplierOnboardingCompletion } from "../../../server/packages/services/master-data/src/supplier-onboarding-completion.js";
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
  actor = "cca94907-7519-5871-8e3c-6b11aa545c93";
const report: any = {
  at: new Date().toISOString(),
  boundary:
    "Database command qualification of P6 linkage and completion only. Bank draft inputs reuse P4 scoped case fixtures; all drafts, links, rejection and outbox writes roll back. No Mesh disclosure intake or bank verification API claim.",
  cases: [],
};
const fixtures = JSON.parse(
  readFileSync(
    "governance/policy/reports/supplier-process-submission-live.dev.json",
    "utf8",
  ),
).cases.filter((c: any) => c.process);
const rollback = new Error("P6 bank link rollback");
try {
  for (const c of fixtures) {
    await db
      .transaction()
      .execute(async (tx: any) => {
        await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${actor},true),set_config('app.database_plane','neon',true)`.execute(
          tx,
        );
        const parent = (
          await sql`SELECT c.*,s.payload_json FROM document.entity_case c JOIN snapshot.entity_snapshot s ON s.tenant_id=c.tenant_id AND s.snapshot_id=c.current_snapshot_id WHERE c.tenant_id=${tenant}::uuid AND c.id=${c.id}::uuid`.execute(
            tx,
          )
        ).rows[0];
        assert.equal(parent.status, "materialized");
        const before = await evaluateSupplierOnboardingCompletion(
          tenant,
          c.process.cycleRunId,
          tx,
        );
        assert.equal(before.ready, true);
        await sql`SET LOCAL ROLE athyperapp`.execute(tx);
        const id = randomUUID();
        const payload = {
          ...parent.payload_json,
          requestedComplianceLevel: undefined,
          complianceRequirementReason: undefined,
        };
        await sql`SELECT * FROM document.command_entity_case_draft(${tenant}::uuid,${id}::uuid,0::bigint,NULL::uuid,${`P6-${id.slice(0, 8).toUpperCase()}`},${parent.entity_code},'change_bank',${parent.target_entity_id}::uuid,${`p6-bank:${id}`},${parent.entity_contract_id}::uuid,${parent.entity_contract_hash},${parent.form_template_release_id}::uuid,${parent.form_template_release_no}::bigint,${parent.form_template_hash},${JSON.stringify(payload)}::jsonb,${`p6-bank-draft:${id}`},${actor}::uuid,NULL::uuid)`.execute(
          tx,
        );
        const command = () =>
          sql`SELECT governance.command_link_supplier_onboarding_work(${tenant}::uuid,${c.process.cycleRunId}::uuid,${id}::uuid,${actor}::uuid) AS id`.execute(
            tx,
          );
        const first = await command(),
          replay = await command();
        assert.deepEqual(replay.rows, first.rows);
        const blocked = await evaluateSupplierOnboardingCompletion(
          tenant,
          c.process.cycleRunId,
          tx,
        );
        assert.ok(blocked.reasons?.includes("linked_work"));
        await sql`SELECT * FROM document.command_entity_case_validation(${tenant}::uuid,${id}::uuid,1::bigint,${randomUUID()}::uuid,'p6.bank_link.fixture','1',${"a".repeat(64)},'[{"messageCode":"P6_BANK_LINK_FIXTURE","severity":"info","ruleCode":"P6_BANK_LINK_FIXTURE","outcome":"passed"}]'::jsonb,'{"outcome":"passed"}'::jsonb,'{}'::jsonb,'{}'::jsonb,${`p6-bank-validate:${id}`},${actor}::uuid,NULL::uuid)`.execute(
          tx,
        );
        await sql`SELECT * FROM document.command_entity_case_lifecycle(${tenant}::uuid,${id}::uuid,'submit',2::bigint,NULL::uuid,NULL::uuid,'P6 bank-link fixture',${`p6-bank-submit:${id}`},${actor}::uuid,NULL::uuid)`.execute(
          tx,
        );
        const reviewer = "645b6a55-3355-526a-9643-3900425bde47";
        await sql`SELECT set_config('app.current_principal_id',${reviewer},true)`.execute(
          tx,
        );
        await sql`SELECT * FROM document.command_entity_case_lifecycle(${tenant}::uuid,${id}::uuid,'reject',3::bigint,NULL::uuid,NULL::uuid,'P6 independent bank-work rejection',${`p6-bank-reject:${id}`},${reviewer}::uuid,NULL::uuid)`.execute(
          tx,
        );
        const after = await evaluateSupplierOnboardingCompletion(
          tenant,
          c.process.cycleRunId,
          tx,
        );
        assert.equal(after.ready, true, JSON.stringify(after.reasons));
        report.cases.push({
          level: c.level,
          appRole: true,
          draftCreated: true,
          linkReplayVerified: true,
          openBankWorkBlocksClosure: true,
          independentlyRejectedBankWorkReleasesGate: true,
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
    "governance/policy/reports/supplier-onboarding-bank-link-db.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: report.passed ?? false,
      cases: report.cases.length,
    }),
  );
}
