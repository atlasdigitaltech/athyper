import { KyselyCycleExecutionRepository } from "../../../server/packages/platform/governance/src/cycles/kysely-cycle-execution-repository.js";
import { createCycleRunService } from "../../../server/packages/platform/governance/src/cycles/cycle-execution-services.js";
import { createExactPlaneRepositoryProvider } from "../../../server/packages/foundation/src/transaction/index.js";
/** P6 completion checks against real DEV snapshots, task attempts and document evidence. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { evaluateSupplierOnboardingCompletion } from "../../../server/packages/services/master-data/src/supplier-onboarding-completion.js";
const require = createRequire(
  new URL("../../../server/db/package.json", import.meta.url),
);
const { Pool } = require("pg"),
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
const report: any = { at: new Date().toISOString(), checks: [], cases: [] };
try {
  const fixtures = JSON.parse(
    readFileSync(
      "governance/policy/reports/supplier-process-correction-live.dev.json",
      "utf8",
    ),
  ).cases.filter((c: any) => c.second);
  for (const fixture of fixtures) {
    await db.transaction().execute(async (tx: any) => {
      await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${actor},true),set_config('app.database_plane','neon',true)`.execute(
        tx,
      );
      await sql`SET LOCAL ROLE athyperapp`.execute(tx);
      const result = await evaluateSupplierOnboardingCompletion(
        tenant,
        fixture.first.cycleRunId,
        tx,
      );
      assert.equal(result.ready, false);
      const gates = (result.evidence as any).gates;
      assert.equal(
        gates.find((g: any) => g.code === "approval").status,
        "satisfied",
      );
      assert.equal(
        gates.find((g: any) => g.code === "materialization").status,
        "pending",
      );
      assert.equal(
        gates.find((g: any) => g.code === "activation").status,
        "pending",
      );
      assert.equal(
        gates.find((g: any) => g.code === "activation_confirmation").status,
        "pending",
      );
      assert.equal(
        gates.find((g: any) => g.code === "process_work").status,
        "satisfied",
      );
      assert.equal(
        gates.find((g: any) => g.code === "bank_verification").status,
        "not_applicable",
      );
      report.cases.push({
        id: fixture.id,
        runId: fixture.first.cycleRunId,
        gates,
      });
      report.checks.push(
        `${fixture.level ?? fixture.id}: approval, materialization, activation and closure remain separate; old attempt work does not block current completed reviews`,
      );
    });
  }
  assert.equal(fixtures.length, 3);
  await db
    .transaction()
    .execute(async (tx: any) => {
      await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${actor},true),set_config('app.database_plane','neon',true)`.execute(
        tx,
      );
      const attempts = [
        [
          "raw closure cannot bypass case/document/completion evidence",
          sql`UPDATE governance.cycle_run SET status='completed' WHERE tenant_id=${tenant}::uuid AND id=${fixtures[0].first.cycleRunId}::uuid`,
        ],
        [
          "selected process pin is immutable",
          sql`UPDATE governance.cycle_run SET data=jsonb_set(data,'{profile}','{}'::jsonb) WHERE tenant_id=${tenant}::uuid AND id=${fixtures[0].first.cycleRunId}::uuid`,
        ],
        [
          "activation policy publications are immutable",
          sql`UPDATE control.supplier_activation_policy SET operation_code='payment' WHERE tenant_id=${tenant}::uuid`,
        ],
      ];
      for (const [name, query] of attempts) {
        await sql`SAVEPOINT negative_check`.execute(tx);
        let rejected = false;
        try {
          await query.execute(tx);
        } catch (error: any) {
          assert.ok(
            ["23514", "42501"].includes(error.code) ||
              (error.code === "55000" &&
                error.message === "PROCESS_SELECTION_PUBLICATION_IMMUTABLE"),
            error.message,
          );
          rejected = true;
        }
        await sql`ROLLBACK TO SAVEPOINT negative_check`.execute(tx);
        assert.equal(rejected, true, name);
        report.checks.push(name);
      }
      await sql`INSERT INTO control.supplier_activation_policy(tenant_id,operating_organization_id,company_code_id,version,operation_code,rationale,effective_from,published_by) VALUES(${tenant}::uuid,'a478f9c0-8226-5d22-9599-b8fb27a45180','793b6cb3-3c61-57c0-9562-2cbc288bd4cf',2,'payment','P6 rollback-only overlapping policy fault',now(),${actor}::uuid)`.execute(
        tx,
      );
      await sql`SET LOCAL ROLE athyperapp`.execute(tx);
      const conflict = await evaluateSupplierOnboardingCompletion(
        tenant,
        fixtures[0].first.cycleRunId,
        tx,
      );
      assert.equal(conflict.ready, false);
      assert.ok(conflict.reasons.includes("activation_policy"));
      report.checks.push(
        "ambiguous current activation policy blocks completion",
      );
      throw new Error("P6_ROLLBACK_FIXTURE");
    })
    .catch((error: any) => {
      if (error.message !== "P6_ROLLBACK_FIXTURE") throw error;
    });
  for (const runId of [
    "576a0e3b-b9e4-4d56-a13b-f0c7e09e5b06",
    "77677bf0-17df-460f-b463-e899d71246d5",
    "6e63aa27-3354-4411-9331-e1ebc0ef0684",
  ]) {
    await db.transaction().execute(async (tx: any) => {
      await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${actor},true),set_config('app.database_plane','neon',true)`.execute(
        tx,
      );
      await sql`SET LOCAL ROLE athyperapp`.execute(tx);
      const result = await evaluateSupplierOnboardingCompletion(
        tenant,
        runId,
        tx,
      );
      assert.equal(result.ready, true, JSON.stringify(result.reasons));
      assert.ok(
        (result.evidence as any).readiness.operationalEvidence.partner.role_id,
      );
      report.checks.push(
        `current completion evaluation passes real P4 document/activation fixture ${runId}; controlled upstream fixture boundary retained`,
      );
      const repository = new KyselyCycleExecutionRepository(
        "neon",
        {
          run: async (_plane: any, _actor: any, work: any) => work(tx),
        } as never,
        evaluateSupplierOnboardingCompletion,
      );
      const service = createCycleRunService({
        authorizer: { authorize: async () => ({ allowed: true }) },
        repositories: createExactPlaneRepositoryProvider({ neon: repository }),
      });
      const context = {
        tenantId: tenant,
        principalId: actor,
        planeKey: "neon",
      } as any;
      const readiness = await service.readiness(context, runId);
      const command = {
        expectedVersion: Number(readiness.evidence.runVersion),
        idempotencyKey: `p6-rollback-complete:${runId}`,
      };
      await sql`SAVEPOINT positive_closure`.execute(tx);
      const completed = await service.transition(
        context,
        runId,
        "completed",
        command,
      );
      assert.equal(completed.status, "completed");
      assert.deepEqual(
        await service.transition(context, runId, "completed", command),
        completed,
      );
      const events = (
        await sql`SELECT id FROM event.outbox WHERE tenant_id=${tenant}::uuid AND event_key=${`supplier-onboarding:${runId}:completed`}`.execute(
          tx,
        )
      ).rows;
      assert.equal(events.length, 1);
      await sql`ROLLBACK TO SAVEPOINT positive_closure`.execute(tx);
      report.checks.push(
        `real app-role closure, exact replay and one outbox event rolled back for ${runId}; authorization double is limited to this database fixture`,
      );
    });
  }
  report.passed = true;
  writeFileSync(
    "governance/policy/reports/supplier-onboarding-completion-db.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `P6 ${report.checks.length} database checks passed across ${fixtures.length} profiles.`,
  );
} finally {
  await db.destroy();
}
