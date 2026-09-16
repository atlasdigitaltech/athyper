/** Real PostgreSQL fault injection and gate checks; every mutation is rolled back. */
import { createSupplierProcessTasks } from "../../../server/apps/platform-host/src/composition/supplier-process-tasks.js";
import { createSupplierProcessSubmission } from "../../../server/apps/platform-host/src/composition/supplier-process-submission.js";
import { createSupplierProcessSelectionService } from "../../../server/apps/platform-host/src/composition/supplier-process-selection.js";
import { createKyselyProcessDocumentIntentPort } from "../../../server/packages/platform/governance/src/index.js";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { KyselyBusinessPartnerCaseRepository } from "../../../server/packages/services/master-data/src/kysely-business-partner-case-repository.js";
const require = createRequire(
  new URL("../../../server/db/package.json", import.meta.url),
);
const { Pool } = require("pg"),
  { Kysely, PostgresDialect, sql } = require("kysely");
const host = execFileSync(
  "docker",
  [
    "inspect",
    "--format",
    "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
    "athyper-dev-db-1",
  ],
  { encoding: "utf8" },
).trim();
const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      host,
      user: "postgres",
      database: "athyper_neon",
      password: readFileSync(
        `${process.env.HOME}/.athyper/instances/dev/secrets/postgres-password`,
        "utf8",
      ).trim(),
    }),
  }),
});
const freshFixtures = process.argv.includes("--p9-fixtures");
const live = JSON.parse(
  readFileSync(
    freshFixtures ? "governance/policy/reports/supplier-onboarding-p9-fixtures.dev.json" : "governance/policy/reports/supplier-process-submission-live.dev.json",
    "utf8",
  ),
);
if (freshFixtures) assert.deepEqual(live.cases.map((c:any)=>c.level), ["basic","standard","enhanced"]);
else assert.equal(live.passed, true, "Qualify owning APIs first");
const tenant = "44444444-4444-4444-8444-444444444444",
  actor = "cca94907-7519-5871-8e3c-6b11aa545c93";
const context: any = {
  tenantId: tenant,
  principalId: actor,
  planeKey: "neon",
  requestId: randomUUID(),
  profileHash: "qualification",
};
const service = createSupplierProcessTasks({
  authorizer: { authorize: async () => ({ allowed: true }) },
});
const report: any = {
  at: new Date().toISOString(),
  mode: "Real pinned catalogs, scoped directory, workflow runner, work items and lifecycle commands on PostgreSQL. Controlled document-ready result and authorization; all writes rolled back.",
  checks: [],
};
const rollback = Error("ROLLBACK_P3");
async function setActor(tx: any, id: string) {
  await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${id},true),set_config('app.database_plane','neon',true),set_config('app.current_actor_type','user',true)`.execute(
    tx,
  );
}
async function rejected(
  tx: any,
  work: () => Promise<unknown>,
  pattern: RegExp,
) {
  await sql`SAVEPOINT probe`.execute(tx);
  try {
    await work();
    assert.fail("Expected rejection");
  } catch (error) {
    assert.match(String(error), pattern);
  } finally {
    await sql`ROLLBACK TO SAVEPOINT probe`.execute(tx);
  }
}
try {
  for (const fixture of live.cases.filter((c: any) => freshFixtures || c.process)) {
    try {
      await db.transaction().execute(async (tx: any) => {
        await setActor(tx, actor);
        if (freshFixtures) {
          const repository = new KyselyBusinessPartnerCaseRepository();
          const selection = createSupplierProcessSelectionService({repository,authorizer:{authorize:async()=>({allowed:true})},audit:{} as never,transactions:{} as never,authenticate:(()=>{}) as never,readContext:()=>context});
          const owner=createSupplierProcessSubmission({selection,documents:createKyselyProcessDocumentIntentPort(),submitCase:(command,transaction)=>repository.submitForProcess({tenantId:tenant,requestId:command.requestId,expectedVersion:command.expectedVersion,submittedBy:actor,idempotencyKey:command.idempotencyKey},transaction)});
          const command={context,requestId:fixture.id,expectedVersion:fixture.validatedVersion,idempotencyKey:randomUUID()};
          await owner.lock(command,tx);
          const current=await repository.get(tenant,fixture.id,tx);assert.ok(current);
          const accepted=await owner.submit(command,current,tx);
          fixture.process=accepted.process;
        }
        await rejected(
          tx,
          () => service.start(context, fixture.id, tx),
          /PROCESS_REVIEW_DOCUMENT_NOT_READY/,
        );
        // Document-port double explicitly permitted for P3; no ready result or synthetic attachment survives this transaction.
        await sql`UPDATE governance.process_document_job SET status='ready',result=jsonb_build_object('status','ready','scanStatus','clean','sha256',repeat('a',64),'attachmentId',${randomUUID()}::text,'attachmentVersionId',${randomUUID()}::text,'coordinate',intent->'coordinate','template',intent->'binding'->'template','sourceSnapshot',intent->'sourceSnapshot','jobId',id::text) WHERE tenant_id=${tenant}::uuid AND id=${fixture.process.reviewPackJobId}::uuid`.execute(
          tx,
        );
        // Two existing synthetic principals exercise real all-assigned quorum. Membership is scoped and rolled back.
        if (fixture.level === "enhanced")
          await sql`INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,effective_from,created_by) VALUES(${tenant}::uuid,'7ea56029-e501-5596-bc2b-9354721adc07'::uuid,'d04198ac-53cf-5e94-969f-b6f75f176fa2'::uuid,'manual','p3-qualification','active',now(),${actor}::uuid) ON CONFLICT DO NOTHING`.execute(
            tx,
          );
        await rejected(
          tx,
          async () => {
            await sql`UPDATE authz.group_role SET status='revoked' WHERE tenant_id=${tenant}::uuid AND group_id='7ea56029-e501-5596-bc2b-9354721adc07'::uuid`.execute(
              tx,
            );
            await service.start(context, fixture.id, tx);
          },
          /No eligible approver/,
        );
        const started = await service.start(context, fixture.id, tx);
        assert.ok("workflowRequestId" in started);
        const replay = await service.start(context, fixture.id, tx);
        assert.equal(replay.workflowRequestId, started.workflowRequestId);
        assert.equal(replay.replayed, true);
        const projected =
          await new KyselyBusinessPartnerCaseRepository().getView(
            tenant,
            fixture.id,
            tx,
          );
        assert.equal(projected?.taskExecutions?.length, 1);
        assert.equal(
          projected?.taskExecutions?.[0]?.attemptId,
          fixture.process.attemptId,
        );
        assert.equal(
          projected?.taskExecutions?.[0]?.stages[0]?.quorum.required,
          fixture.level === "enhanced" ? 2 : 1,
        );
        assert.ok(projected?.taskExecutions?.[0]?.stages[0]?.dueAt);

        let votes = 0,
          tasks = 0,
          levels = new Set<string>();
        for (let limit = 0; limit < 40; limit++) {
          const current = (
            await sql`SELECT status FROM document.entity_case WHERE tenant_id=${tenant}::uuid AND id=${fixture.id}::uuid`.execute(
              tx,
            )
          ).rows[0];
          if (current.status === "approved") break;
          const item = (
            await sql`SELECT i.* FROM document.work_item i JOIN document.workflow_stage s ON s.tenant_id=i.tenant_id AND s.id=(i.payload->>'workflowStageId')::uuid WHERE i.tenant_id=${tenant}::uuid AND i.source_entity_id=${fixture.id}::uuid AND i.payload->>'attemptId'=${fixture.process.attemptId} AND i.status='open' AND s.status='active' ORDER BY i.created_at,i.id LIMIT 1`.execute(
              tx,
            )
          ).rows[0];
          assert.ok(item, "Actionable task work required");
          assert.deepEqual(item.payload.eligibility_evidence.candidates.map((c:any)=>c.principalId),[item.assignee_principal_id]);
          const command = {
            attemptId: fixture.process.attemptId,
            cycleTaskId: item.cycle_task_id,
            workflowRequestId: item.payload.workflowRequestId,
            workflowStageId: item.payload.workflowStageId,
            workItemId: item.id,
            expectedWorkItemVersion: Number(item.row_version),
            idempotencyKey: randomUUID(),
            action: item.payload.action,
          };
          await setActor(tx, item.assignee_principal_id);
          const reviewer = {
            ...context,
            principalId: item.assignee_principal_id,
          };
          if (votes === 0) {
            await rejected(tx,()=>sql`UPDATE governance.cycle_task SET status='completed',completed_at=now() WHERE id=${item.cycle_task_id}::uuid`.execute(tx),/PROCESS_TASK_QUORUM_REQUIRED/);

            await rejected(
              tx,
              async () => {
                await sql`UPDATE authz.group_member SET status='revoked' WHERE tenant_id=${tenant}::uuid AND group_id='7ea56029-e501-5596-bc2b-9354721adc07'::uuid AND principal_id=${item.assignee_principal_id}::uuid`.execute(
                  tx,
                );
                await service.decide(reviewer, fixture.id, command, tx);
              },
              /PROCESS_REVIEWER_NO_LONGER_ELIGIBLE|No eligible approver/,
            );
            await rejected(
              tx,
              () =>
                sql`UPDATE document.work_item SET payload=jsonb_set(payload,'{attemptId}',to_jsonb(${randomUUID()}::text)) WHERE id=${item.id}::uuid`.execute(
                  tx,
                ),
              /PROCESS_WORK_ITEM_BINDING_INVALID|PROCESS_WORK_ITEM_BINDING_IMMUTABLE/,
            );

            await rejected(
              tx,
              () =>
                service.decide(
                  { ...context, principalId: actor },
                  fixture.id,
                  command,
                  tx,
                ),
              /PROCESS_WORK_ITEM_FORBIDDEN/,
            );
            await rejected(
              tx,
              () =>
                service.decide(
                  reviewer,
                  fixture.id,
                  { ...command, attemptId: randomUUID() },
                  tx,
                ),
              /PROCESS_ATTEMPT_STALE/,
            );
            await rejected(
              tx,
              () =>
                service.decide(
                  reviewer,
                  fixture.id,
                  { ...command, workflowStageId: randomUUID() },
                  tx,
                ),
              /PROCESS_TASK_BINDING_INVALID/,
            );
            await rejected(
              tx,
              () =>
                sql`SELECT document.command_entity_case_lifecycle(${tenant}::uuid,${fixture.id}::uuid,'approve',3,${fixture.process.cycleRunId}::uuid,${item.cycle_task_id}::uuid,NULL::text,${randomUUID()},${item.assignee_principal_id}::uuid,NULL::uuid)`.execute(
                  tx,
                ),
              /PROCESS_FINAL_TASK_QUORUM_REQUIRED|PROCESS_DECISION_DOCUMENT_GATE_REQUIRED/,
            );
          }
          const result: any = await service.decide(
            reviewer,
            fixture.id,
            command,
            tx,
          );
          votes++;
          levels.add(command.workflowStageId);
          assert.equal(
            (await service.decide(reviewer, fixture.id, command, tx)).replayed,
            true,
          );
          if (result.receipt.outcome === "task_accepted") {
            tasks++;
            if (result.receipt.outcomeScope === "task") {
              const c = (
                await sql`SELECT status FROM document.entity_case WHERE id=${fixture.id}::uuid`.execute(
                  tx,
                )
              ).rows[0];
              assert.equal(c.status, "submitted");
            }
          }
        }
        const final = (
          await sql`SELECT c.status case_status,r.status run_status,c.decision_snapshot_id FROM document.entity_case c JOIN governance.cycle_run r ON r.tenant_id=c.tenant_id AND r.id=${fixture.process.cycleRunId}::uuid WHERE c.id=${fixture.id}::uuid`.execute(
            tx,
          )
        ).rows[0];
        assert.equal(final.case_status, "approved");
        assert.equal(final.run_status, "running");
        assert.ok(final.decision_snapshot_id);
        assert.equal(
          tasks,
          fixture.level === "basic" ? 1 : fixture.level === "standard" ? 2 : 5,
        );
        assert.equal(
          votes,
          fixture.level === "basic" ? 1 : fixture.level === "standard" ? 2 : 15,
        );
        report.checks.push({
          profile: fixture.level,
          tasks,
          levels: levels.size,
          votes,
          intermediateDoesNotApprove: true,
          finalCommandApproved: true,
          runAwaitsReadiness: true,
          makerAndStaleBindingsRejected: true,
          documentGate: true,
          emptyRoleAndRevokedMembershipRejected: true,
          databaseBindingGuard: true,
          replay: true,
        });
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  }
  report.passed = true;
} finally {
  await db.destroy();
  writeFileSync(
    "governance/policy/reports/supplier-process-tasks-db.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}
