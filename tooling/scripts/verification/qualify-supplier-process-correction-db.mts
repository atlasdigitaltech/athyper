/** Fault injection uses existing real artifact evidence; all writes roll back. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const require = createRequire(
    new URL("../../../server/db/package.json", import.meta.url),
  ),
  { Client } = require("pg");
const client = new Client({
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
});
await client.connect();
const report: any = { at: new Date().toISOString(), checks: [], cases: [] };
const tenant = "44444444-4444-4444-8444-444444444444",
  actor = "cca94907-7519-5871-8e3c-6b11aa545c93";
const live = JSON.parse(
  readFileSync(
    "governance/policy/reports/supplier-process-correction-live.dev.json",
    "utf8",
  ),
);
const fixtures = live.cases;
try {
  for (const f of fixtures) {
    const attempts = (
      await client.query(
        "SELECT a.*,e.evidence FROM governance.process_attempt a JOIN governance.process_selection_evidence e ON e.tenant_id=a.tenant_id AND e.id=a.selection_id WHERE a.tenant_id=$1 AND a.case_id=$2 ORDER BY a.attempt_number",
        [tenant, f.id],
      )
    ).rows;
    const cases = (
      await client.query(
        "SELECT c.status,r.status run_status,c.row_version FROM document.entity_case c JOIN governance.cycle_run r ON r.tenant_id=c.tenant_id AND r.id=$3 WHERE c.tenant_id=$1 AND c.id=$2",
        [tenant, f.id, f.first.cycleRunId],
      )
    ).rows[0];
    const open = (
      await client.query(
        "SELECT count(*)::int n FROM document.work_item WHERE tenant_id=$1 AND source_entity_id=$2 AND status IN('open','claimed')",
        [tenant, f.id],
      )
    ).rows[0].n;
    assert.equal(open, 0);
    const jobs = (
      await client.query(
        "SELECT id,attempt_id,purpose,status,intent,result FROM governance.process_document_job WHERE tenant_id=$1 AND case_id=$2 ORDER BY created_at",
        [tenant, f.id],
      )
    ).rows;
    if (f.second) {
      assert.equal(
        jobs.find((j: any) => j.id === f.first.reviewPackJobId).result.sha256,
        f.historicalPackSha256,
      );
      assert.equal(attempts.length, 2);
      assert.equal(cases.status, "approved");
      assert.equal(cases.run_status, "running");
      assert.deepEqual(
        attempts[0].evidence.policy,
        attempts[1].evidence.policy,
      );
      assert.deepEqual(
        attempts[0].evidence.executionManifest,
        attempts[1].evidence.executionManifest,
      );
      assert.notEqual(
        attempts[0].submission_snapshot_id,
        attempts[1].submission_snapshot_id,
      );
      for (const a of attempts) {
        const tasks = (
          await client.query(
            "SELECT id,status FROM governance.cycle_task WHERE tenant_id=$1 AND process_attempt_id=$2",
            [tenant, a.id],
          )
        ).rows;
        assert.equal(tasks.length, a.evidence.executionManifest.tasks.length);
        assert.ok(
          jobs.some(
            (j: any) =>
              j.attempt_id === a.id &&
              j.purpose === "submitted_review_pack" &&
              j.status === "ready",
          ),
        );
      }
    }
    if (f.profileChange) {
      assert.equal(attempts.length, 1);
      assert.equal(cases.status, "cancelled");
      assert.equal(cases.run_status, "cancelled");
      assert.equal(jobs.length, 1);
      const evidence = (
        await client.query(
          "SELECT command_code,result_code FROM document.entity_case_command_evidence WHERE tenant_id=$1 AND entity_case_id=$2 AND result_code IN('ENTITY_CASE_REJECTED','ENTITY_CASE_CANCELLED')",
          [tenant, f.id],
        )
      ).rows;
      assert.deepEqual(evidence, [
        {
          command_code: "entity.case.cancel",
          result_code: "ENTITY_CASE_CANCELLED",
        },
      ]);
    }
    if (f.terminalRejection) {
      assert.equal(cases.status, "rejected");
      assert.equal(cases.run_status, "cancelled");
      assert.ok(
        jobs.some(
          (j: any) => j.purpose === "decision_document" && j.status === "ready",
        ),
      );
    }
    report.cases.push({
      id: f.id,
      attempts: attempts.length,
      ...cases,
      activeWorkItems: open,
      jobs: jobs.map((j: any) => ({
        id: j.id,
        purpose: j.purpose,
        attemptId: j.attempt_id,
        status: j.status,
      })),
    });
  }
  await client.query("BEGIN");
  await client.query(
    "SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true),set_config('app.database_plane','neon',true)",
    [tenant, actor],
  );
  await client.query("SET LOCAL ROLE athyperapp");
  async function denied(
    label: string,
    statement: string,
    params: any[],
    pattern: RegExp,
  ) {
    await client.query("SAVEPOINT fault");
    let failure: any;
    try {
      await client.query(statement, params);
    } catch (e) {
      failure = e;
    }
    await client.query("ROLLBACK TO fault");
    assert.ok(failure, label);
    assert.match(failure.message, pattern, label);
    report.checks.push({ label, passed: true, code: failure.code });
  }
  const f = fixtures.find((f: any) => f.level === "standard" && f.second);
  await denied(
    "cancelled task cannot reopen",
    "UPDATE governance.cycle_task SET status='in_progress' WHERE tenant_id=$1 AND process_attempt_id=$2 AND status='cancelled'",
    [tenant, f.first.attemptId],
    /PROCESS_TASK_HISTORY_IMMUTABLE/,
  );
  await denied(
    "completed task evidence cannot change",
    "UPDATE governance.cycle_task SET completion_evidence='{}'::jsonb WHERE tenant_id=$1 AND process_attempt_id=$2 AND status='completed'",
    [tenant, f.first.attemptId],
    /PROCESS_TASK_HISTORY_IMMUTABLE/,
  );
  await denied(
    "cancelled workflow cannot reopen",
    "UPDATE document.workflow_request SET status='pending',decision=NULL,decided_by=NULL,decided_at=NULL WHERE tenant_id=$1 AND metadata->'process'->>'attemptId'=$2 AND status='cancelled'",
    [tenant, f.first.attemptId],
    /PROCESS_WORKFLOW_HISTORY_IMMUTABLE/,
  );
  await denied(
    "completed decision cannot be rewritten",
    "UPDATE document.work_item SET outcome='{}'::jsonb WHERE tenant_id=$1 AND payload->>'attemptId'=$2 AND status='completed'",
    [tenant, f.first.attemptId],
    /PROCESS_WORK_ITEM_HISTORY_IMMUTABLE/,
  );
  await denied(
    "old attempt cannot claim document job",
    "SELECT document.command_process_document_job($1,$2,'claim',$3,'{}'::jsonb,$4)",
    [tenant, f.first.reviewPackJobId, randomUUID(), actor],
    /PROCESS_DOCUMENT_ATTEMPT_STALE/,
  );
  await denied(
    "old callback cannot satisfy new gate",
    "SELECT document.command_process_document_job($1,$2,'gate_succeeded',NULL,'{}'::jsonb,$3)",
    [tenant, f.first.reviewPackJobId, actor],
    /PROCESS_DOCUMENT_ATTEMPT_STALE/,
  );
  await denied(
    "Historical attempt cannot create a new workflow",
    "INSERT INTO document.workflow_request SELECT (jsonb_populate_record(NULL::document.workflow_request,to_jsonb(w)||jsonb_build_object('id',$3::text,'status','pending','decision',NULL,'decided_by',NULL,'decided_at',NULL))).* FROM document.workflow_request w WHERE w.tenant_id=$1 AND w.metadata->'process'->>'attemptId'=$2 LIMIT 1",
    [tenant, f.first.attemptId, randomUUID()],
    /PROCESS_TASK_PREREQUISITE_NOT_READY/,
  );
  await denied(
    "Historical attempt cannot create a new work item",
    "INSERT INTO document.work_item SELECT (jsonb_populate_record(NULL::document.work_item,to_jsonb(i)||jsonb_build_object('id',$3::text,'status','open','outcome',NULL,'completed_at',NULL))).* FROM document.work_item i WHERE i.tenant_id=$1 AND i.payload->>'attemptId'=$2 LIMIT 1",
    [tenant, f.first.attemptId, randomUUID()],
    /PROCESS_WORK_ITEM_ATTEMPT_STALE/,
  );
  await denied(
    "attempt evidence is immutable",
    "UPDATE governance.process_attempt SET attempt_number=99 WHERE tenant_id=$1 AND id=$2",
    [tenant, f.first.attemptId],
    /PROCESS_SELECTION_EVIDENCE_IMMUTABLE|permission denied for table process_attempt/,
  );
  const materialized = (
    await client.query(
      "SELECT c.id,c.row_version,a.cycle_run_id FROM document.entity_case c JOIN governance.process_attempt a ON a.tenant_id=c.tenant_id AND a.case_id=c.id WHERE c.tenant_id=$1 AND c.status='materialized' LIMIT 1",
      [tenant],
    )
  ).rows[0];
  assert.ok(materialized);
  await denied(
    "materialized supplier proposal cannot close",
    "SELECT document.command_entity_case_lifecycle($1,$2,'cancel',$3,$4,NULL,'P5 negative test',$5,$6,NULL)",
    [
      tenant,
      materialized.id,
      Number(materialized.row_version),
      materialized.cycle_run_id,
      randomUUID(),
      actor,
    ],
    /PROCESS_CANCEL_FORBIDDEN/,
  );
  await client.query("SAVEPOINT close_approved");
  const approved = (
    await client.query(
      "SELECT row_version FROM document.entity_case WHERE tenant_id=$1 AND id=$2",
      [tenant, f.id],
    )
  ).rows[0];
  const closure = (
    await client.query(
      "SELECT * FROM document.command_entity_case_lifecycle($1,$2,'cancel',$3,$4,NULL,'P5 unmaterialized approval can close',$5,$6,NULL)",
      [
        tenant,
        f.id,
        Number(approved.row_version),
        f.second.cycleRunId,
        randomUUID(),
        actor,
      ],
    )
  ).rows[0];
  assert.equal(closure.status, "cancelled");
  assert.equal(
    (
      await client.query(
        "SELECT status FROM governance.cycle_run WHERE tenant_id=$1 AND id=$2",
        [tenant, f.second.cycleRunId],
      )
    ).rows[0].status,
    "cancelled",
  );
  await client.query("ROLLBACK TO close_approved");
  report.checks.push({
    label:
      "Authorized cancellation of an approved unmaterialized proposal remains distinct from completion",
    passed: true,
  });
  await client.query("SAVEPOINT in_flight");
  await client.query("RESET ROLE");
  const pending = (
    await client.query(
      "SELECT c.id,c.row_version,a.id attempt_id,a.cycle_run_id,a.review_pack_job_id FROM document.entity_case c JOIN governance.process_attempt a ON a.tenant_id=c.tenant_id AND a.case_id=c.id JOIN snapshot.entity_snapshot s ON s.tenant_id=c.tenant_id AND s.snapshot_id=c.current_snapshot_id WHERE c.tenant_id=$1 AND c.created_by=$2 AND c.status='submitted' AND s.payload_json->>'name' LIKE 'DEV P5 %' AND c.id=$3",
      [tenant, actor, live.faultFixture.id],
    )
  ).rows[0];
  assert.ok(
    pending,
    "A submitted DEV P5 fixture is required for rollback-only in-flight cancellation",
  );
  const token = randomUUID();
  await client.query(
    "UPDATE governance.process_document_job SET status='processing',result=NULL,claim_token=$2,lease_expires_at=now()+interval '10 minutes' WHERE id=$1",
    [pending.review_pack_job_id, token],
  );
  await client.query("SET LOCAL ROLE athyperapp");
  await client.query(
    "SELECT document.command_entity_case_lifecycle($1,$2,'cancel',$3,$4,NULL,'P5 in-flight cancellation fixture',$5,$6,NULL)",
    [
      tenant,
      pending.id,
      Number(pending.row_version),
      pending.cycle_run_id,
      randomUUID(),
      actor,
    ],
  );
  const cancelled = (
    await client.query(
      "SELECT status,claim_token,lease_expires_at FROM governance.process_document_job WHERE tenant_id=$1 AND id=$2",
      [tenant, pending.review_pack_job_id],
    )
  ).rows[0];
  assert.deepEqual(cancelled, {
    status: "cancelled",
    claim_token: null,
    lease_expires_at: null,
  });
  await denied(
    "Cancelled render lease cannot commit a late ready callback",
    "SELECT document.command_process_document_job($1,$2,'ready',$3,'{}'::jsonb,$4)",
    [tenant, pending.review_pack_job_id, token, actor],
    /PROCESS_DOCUMENT_ATTEMPT_STALE/,
  );
  assert.equal(
    (
      await client.query(
        "SELECT count(*)::int n FROM document.process_document_candidates() WHERE case_id=$1",
        [pending.id],
      )
    ).rows[0].n,
    0,
  );
  await client.query("ROLLBACK TO in_flight");
  report.checks.push({
    label:
      "Cancellation revokes in-flight render lease and suppresses worker discovery",
    passed: true,
  });
  await client.query("ROLLBACK");
  report.passed = true;
} finally {
  await client.query("ROLLBACK");
  await client.end();
  writeFileSync(
    "governance/policy/reports/supplier-process-correction-db.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify({
    passed: report.passed,
    cases: report.cases.length,
    negativeChecks: report.checks.length,
  }),
);
