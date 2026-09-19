/** Real PostgreSQL fault injection and gate checks; every mutation is rolled back. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createSupplierProcessSubmission } from "../../../server/apps/platform-host/src/composition/supplier-process-submission.js";
import { createSupplierProcessSelectionService } from "../../../server/apps/platform-host/src/composition/supplier-process-selection.js";
import { KyselyBusinessPartnerCaseRepository } from "../../../server/packages/services/master-data/src/kysely-business-partner-case-repository.js";
import { createKyselyProcessDocumentIntentPort } from "../../../server/packages/platform/governance/src/index.js";
import { supplierRequirementPolicy } from "../../../server/packages/platform/control-admin/src/index.js";
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
const live = JSON.parse(
  readFileSync(
    "governance/policy/reports/supplier-process-submission-live.dev.json",
    "utf8",
  ),
);
assert.equal(live.passed, true, "Qualify owning APIs first");
const tenant = "44444444-4444-4444-8444-444444444444",
  actor = "cca94907-7519-5871-8e3c-6b11aa545c93";
const context: any = {
  tenantId: tenant,
  principalId: actor,
  planeKey: "neon",
  requestId: randomUUID(),
  profileHash: "qualification",
};
const repository = new KyselyBusinessPartnerCaseRepository();
const selection = createSupplierProcessSelectionService({
  repository,
  authorizer: { authorize: async () => ({ allowed: true }) },
  audit: {} as never,
  transactions: {} as never,
  authenticate: (() => {}) as never,
  readContext: () => context,
});
const documents = createKyselyProcessDocumentIntentPort();
const submitCase = (command: any, tx: any) =>
  repository.submitForProcess(
    {
      tenantId: tenant,
      requestId: command.requestId,
      expectedVersion: command.expectedVersion,
      submittedBy: actor,
      idempotencyKey: command.idempotencyKey,
    },
    tx,
  );
const report: any = {
  at: new Date().toISOString(),
  mode: "real PostgreSQL and owner services; controlled authorization and failure ports; writes rolled back",
  checks: [],
};
const rollback = Error("QUALIFICATION_ROLLBACK");
async function isolated(work: (tx: any) => Promise<void>) {
  try {
    await db.transaction().execute(async (tx: any) => {
      await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${actor},true),set_config('app.database_plane','neon',true),set_config('app.current_actor_type','user',true)`.execute(
        tx,
      );
      await work(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
try {
  for (const c of live.cases.filter((c: any) => c.process))
    await isolated(async (tx) => {
      const a = (
        await sql`SELECT * FROM governance.process_attempt WHERE tenant_id=${tenant}::uuid AND case_id=${c.id}::uuid`.execute(
          tx,
        )
      ).rows;
      assert.equal(a.length, 1);
      assert.equal(a[0].id, c.process.attemptId);
      const e = (
        await sql`SELECT evidence FROM governance.process_selection_evidence WHERE tenant_id=${tenant}::uuid AND case_id=${c.id}::uuid`.execute(
          tx,
        )
      ).rows;
      assert.equal(e.length, 1);
      const evidence = e[0].evidence;
      assert.equal(
        evidence.coordinate.submissionSnapshot.id,
        a[0].submission_snapshot_id,
      );
      const tasks = (
        await sql`SELECT * FROM governance.cycle_task WHERE tenant_id=${tenant}::uuid AND cycle_run_id=${c.process.cycleRunId}::uuid`.execute(
          tx,
        )
      ).rows;
      assert.equal(
        tasks.length,
        { basic: 2, standard: 3, enhanced: 10 }[c.level as "basic"],
      );
      for (const binding of evidence.executionManifest.tasks) {
        const task = tasks.find(
          (t: any) => t.task_template_id === binding.taskTemplateId,
        );
        assert.ok(task);
        assert.equal(
          task.status,
          binding.executionKind === "preparation"
            ? "completed"
            : binding.executionKind === "document"
              ? "in_progress"
              : "blocked",
        );
        assert.deepEqual(
          task.completion_evidence.coordinate,
          evidence.coordinate,
        );
      }
      const job = (
        await sql`SELECT * FROM governance.process_document_job WHERE tenant_id=${tenant}::uuid AND attempt_id=${c.process.attemptId}::uuid`.execute(
          tx,
        )
      ).rows;
      assert.equal(job.length, 1);
      assert.equal(job[0].status, "pending");
      assert.deepEqual(job[0].intent.coordinate, evidence.coordinate);
      assert.equal(
        (
          await sql`SELECT id FROM event.outbox WHERE tenant_id=${tenant}::uuid AND event_key=${`process-document:${job[0].id}`}`.execute(
            tx,
          )
        ).rows.length,
        1,
      );
      assert.equal(
        (
          await sql`SELECT id FROM document.workflow_request WHERE tenant_id=${tenant}::uuid AND entity_id=${c.id}`.execute(
            tx,
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await sql`SELECT id FROM document.work_item WHERE tenant_id=${tenant}::uuid AND source_entity_id=${c.id}::uuid`.execute(
            tx,
          )
        ).rows.length,
        0,
      );
      const human = tasks.find((t: any) => t.status === "blocked");
      await sql.raw("SAVEPOINT gate").execute(tx);
      await assert.rejects(
        sql`UPDATE governance.cycle_task SET status='ready' WHERE tenant_id=${tenant}::uuid AND id=${human.id}::uuid`.execute(
          tx,
        ),
        (e: any) => e.message.includes("PROCESS_REVIEW_DOCUMENT_NOT_READY"),
      );
      await sql.raw("ROLLBACK TO SAVEPOINT gate").execute(tx);
      const checker = (
        await sql`SELECT id FROM master.principal WHERE tenant_id=${tenant}::uuid AND id<>${actor}::uuid LIMIT 1`.execute(
          tx,
        )
      ).rows[0].id;
      await sql`SELECT set_config('app.current_principal_id',${checker},true)`.execute(
        tx,
      );
      await sql.raw("SAVEPOINT decision").execute(tx);
      await assert.rejects(
        sql`SELECT * FROM document.command_entity_case_lifecycle(${tenant}::uuid,${c.id}::uuid,'approve',${c.submittedVersion},NULL::uuid,NULL::uuid,NULL,${randomUUID()},${checker}::uuid,NULL::uuid)`.execute(
          tx,
        ),
        (e: any) =>
          e.message.includes("PROCESS_DECISION_DOCUMENT_GATE_REQUIRED"),
      );
      await sql.raw("ROLLBACK TO SAVEPOINT decision").execute(tx);
      await sql`SELECT set_config('app.current_principal_id',${actor},true)`.execute(
        tx,
      );
      // A newer active revision exists, while the acceptance remains pinned to its original policy.
      const successor = supplierRequirementPolicy({
        id: randomUUID(),
        tenantId: tenant,
        version: 2,
        effectiveFrom: "2026-09-14",
        ruleIds: {
          basic: randomUUID(),
          standard: randomUUID(),
          enhanced: randomUUID(),
        },
        profiles: Object.fromEntries(
          JSON.parse(
            readFileSync(
              "governance/policy/reports/supplier-process-catalog-publication.dev.json",
              "utf8",
            ),
          ).publication.manifests.map((m: any) => [m.profile.code, m.profile]),
        ) as any,
      });
      await sql`INSERT INTO control.policy_definition(id,tenant_id,entity_type,name,priority,evaluation_mode,effective_from,version_no,definition_hash,status,created_by)
      VALUES(${successor.id}::uuid,${tenant}::uuid,${successor.entityType},${successor.name},10,'first_match','2026-09-14',2,${successor.definitionHash},'active',${actor}::uuid)`.execute(
        tx,
      );
      for (const rule of successor.rules)
        await sql`INSERT INTO control.policy_rule(id,policy_definition_id,priority,condition_expr,action_code,action_config,metadata,created_by)
      VALUES(${rule.id}::uuid,${successor.id}::uuid,${rule.priority},${JSON.stringify(rule.condition)}::jsonb,${rule.action},${JSON.stringify(rule.actionConfig)}::jsonb,'{}'::jsonb,${actor}::uuid)`.execute(
          tx,
        );
      let dependencyCalls = 0;
      const unreachable = async () => {
        dependencyCalls++;
        throw Error("No current policy/document service available");
      };
      const replayOwner = createSupplierProcessSubmission({
        selection: { preview: unreachable, select: unreachable },
        documents: { enqueue: unreachable },
        submitCase: unreachable,
      });
      const command = { ...c.command, context, requestId: c.id };
      await replayOwner.lock(command, tx);
      const current = await repository.get(tenant, c.id, tx);
      assert.ok(current);
      const replay = await replayOwner.replay(command, current, tx);
      assert.deepEqual(replay?.process, c.process);
      assert.equal(dependencyCalls, 0);
      await assert.rejects(
        replayOwner.replay(
          { ...command, expectedVersion: command.expectedVersion + 1 },
          current,
          tx,
        ),
        /PROCESS_SUBMISSION_IDEMPOTENCY_CONFLICT/,
      );
      report.checks.push({
        level: c.level,
        acceptedAttemptCount: 1,
        taskCount: tasks.length,
        documentIntentCount: 1,
        dispatchCount: 1,
        noWorkItems: true,
        databaseGatesReject: true,
        replayWithoutRetargeting: true,
      });
    });
  const draft = live.cases.find((c: any) => c.level === "rollback");
  assert.ok(draft);
  const before = await db
    .transaction()
    .execute(
      async (tx: any) =>
        (
          await sql`SELECT row_version,status,current_snapshot_id FROM document.entity_case WHERE tenant_id=${tenant}::uuid AND id=${draft.id}::uuid`.execute(
            tx,
          )
        ).rows[0],
    );
  for (const fault of [
    "selection_unavailable",
    "document_dispatch_failed",
    "after_acceptance_before_commit",
    "missing_document_job",
  ] as const) {
    const failure = Error(fault);
    try {
      await isolated(async (tx) => {
        const command = {
          context,
          requestId: draft.id,
          expectedVersion: draft.validatedVersion,
          idempotencyKey: randomUUID(),
        };
        const owner = createSupplierProcessSubmission({
          selection:
            fault === "selection_unavailable"
              ? {
                  ...selection,
                  preview: async () => ({
                    status: "unavailable",
                    code: "PROCESS_SELECTION_BINDING_UNAVAILABLE",
                  }),
                }
              : selection,
          documents: {
            enqueue: async (context, intent, tx) => {
              if (fault === "missing_document_job")
                return { jobId: randomUUID(), replayed: false };
              const result = await documents.enqueue(context, intent, tx);
              if (fault === "document_dispatch_failed") throw failure;
              return result;
            },
          },
          submitCase,
        });
        await owner.lock(command, tx);
        const current = await repository.get(tenant, draft.id, tx);
        assert.ok(current);
        await owner.submit(command, current, tx);
        if (fault === "missing_document_job")
          await sql.raw("SET CONSTRAINTS ALL IMMEDIATE").execute(tx);
        if (fault === "after_acceptance_before_commit") throw failure;
      });
      assert.fail("Submission unexpectedly succeeded");
    } catch (error) {
      if (fault === "selection_unavailable")
        assert.equal(
          (error as any).code,
          "PROCESS_SELECTION_BINDING_UNAVAILABLE",
        );
      else if (fault === "missing_document_job")
        assert.equal(
          (error as any).constraint,
          "process_attempt_review_pack_fk",
        );
      else assert.equal(error, failure);
    }
    const after = (
      await sql`SELECT row_version,status,current_snapshot_id FROM document.entity_case WHERE tenant_id=${tenant}::uuid AND id=${draft.id}::uuid`.execute(
        db,
      )
    ).rows[0];
    assert.deepEqual(after, before);
    for (const table of [
      "process_attempt",
      "process_selection_evidence",
      "process_document_job",
    ])
      assert.equal(
        (
          await sql
            .raw(
              `SELECT count(*)::int n FROM governance.${table} WHERE case_id='${draft.id}'::uuid`,
            )
            .execute(db)
        ).rows[0].n,
        0,
      );
    assert.equal(
      (
        await sql`SELECT id FROM governance.cycle_run WHERE tenant_id=${tenant}::uuid AND idempotency_key=${`supplier-process:${draft.id}`}`.execute(
          db,
        )
      ).rows.length,
      0,
    );
    report.checks.push({
      fault,
      caseSnapshotUnchanged: true,
      noAttemptEvidenceRunOrJob: true,
    });
  }
  report.passed = true;
  console.log(JSON.stringify(report));
} finally {
  await db.destroy();
  writeFileSync(
    "governance/policy/reports/supplier-process-submission-db.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
