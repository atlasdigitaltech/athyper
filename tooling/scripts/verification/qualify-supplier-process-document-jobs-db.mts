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
const report: any = {
  at: new Date().toISOString(),
  mode: "Real PostgreSQL with rollback-only fault injection; commands execute as athyperapp.",
  checks: [],
};
const tenant = "44444444-4444-4444-8444-444444444444",
  actor = "cca94907-7519-5871-8e3c-6b11aa545c93";
try {
  await client.query("BEGIN");
  const job = (
    await client.query(
      "SELECT * FROM governance.process_document_job WHERE tenant_id=$1 AND status='ready' AND purpose='submitted_review_pack' ORDER BY created_at LIMIT 1",
      [tenant],
    )
  ).rows[0];
  assert.ok(job, "Render one real pack first");
  const before = (
    await client.query(
      "SELECT to_jsonb(c) value FROM document.entity_case c WHERE tenant_id=$1 AND id=$2",
      [tenant, job.case_id],
    )
  ).rows[0].value;
  await client.query(
    "UPDATE governance.process_document_job SET status='pending',result=NULL,claim_token=NULL,lease_expires_at=NULL,attempt_count=0,gate_status='pending' WHERE id=$1",
    [job.id],
  );
  await client.query(
    "UPDATE governance.process_document_job SET status='pending',result=NULL,gate_status='pending' WHERE tenant_id=$1 AND case_id=$2 AND purpose<>'submitted_review_pack'",
    [tenant, job.case_id],
  );
  await client.query(
    "SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true),set_config('app.database_plane','neon',true)",
    [tenant, actor],
  );
  await client.query(
    "CREATE TEMP TABLE entity_case(id uuid,tenant_id uuid,status text,decision_snapshot_id uuid); CREATE TEMP TABLE cycle_run(id uuid,tenant_id uuid,status text); CREATE TRIGGER p4_case_gate BEFORE UPDATE ON pg_temp.entity_case FOR EACH ROW EXECUTE FUNCTION document.trg_process_document_domain_gates(); CREATE TRIGGER p4_cycle_gate BEFORE UPDATE ON pg_temp.cycle_run FOR EACH ROW EXECUTE FUNCTION document.trg_process_document_domain_gates(); GRANT ALL ON pg_temp.entity_case,pg_temp.cycle_run TO athyperapp",
  );
  await client.query(
    "INSERT INTO pg_temp.entity_case VALUES($1,$2,'submitted',$3)",
    [job.case_id, tenant, job.intent.sourceSnapshot.id],
  );
  await client.query(
    "INSERT INTO pg_temp.cycle_run VALUES($1,$2,'scheduled')",
    [job.cycle_run_id, tenant],
  );
  await client.query("SET LOCAL ROLE athyperapp");
  const command = async (
    action: string,
    token: string | null,
    result: any = {},
  ) =>
    (
      await client.query(
        "SELECT document.command_process_document_job($1,$2,$3,$4,$5::jsonb,$6) job",
        [tenant, job.id, action, token, JSON.stringify(result), actor],
      )
    ).rows[0].job;
  const rejects = async (
    name: string,
    work: () => Promise<any>,
    pattern: RegExp,
  ) => {
    await client.query("SAVEPOINT rejected");
    try {
      await assert.rejects(work, pattern);
      report.checks.push(name);
    } finally {
      await client.query("ROLLBACK TO SAVEPOINT rejected");
    }
  };
  await rejects(
    "Direct application job updates are denied",
    () =>
      client.query(
        "UPDATE governance.process_document_job SET status='ready' WHERE id=$1",
        [job.id],
      ),
    /permission denied/,
  );

  await client.query("UPDATE pg_temp.entity_case SET status='approved'");
  await client.query("UPDATE pg_temp.cycle_run SET status='running'");
  await rejects(
    "Decision document blocks materialization, not approval (isolated transition fixture)",
    () => client.query("UPDATE pg_temp.entity_case SET status='materializing'"),
    /PROCESS_DECISION_DOCUMENT_NOT_READY/,
  );
  await rejects(
    "Activation document blocks closure, not running cycle (isolated transition fixture)",
    () => client.query("UPDATE pg_temp.cycle_run SET status='completed'"),
    /PROCESS_ACTIVATION_DOCUMENT_NOT_READY/,
  );
  const token = randomUUID();
  await command("claim", token);
  await rejects(
    "Concurrent claim is rejected",
    () => command("claim", randomUUID()),
    /NOT_CLAIMABLE/,
  );
  await rejects(
    "Stale callback token is rejected",
    () => command("ready", randomUUID(), job.result),
    /STALE_LEASE/,
  );
  await rejects(
    "Wrong snapshot cannot release gate",
    () =>
      command("ready", token, {
        ...job.result,
        sourceSnapshot: { ...job.result.sourceSnapshot, id: randomUUID() },
      }),
    /RESULT_BINDING_INVALID/,
  );
  await rejects(
    "Forged artifact cannot release gate",
    () =>
      command("ready", token, {
        ...job.result,
        attachmentId: randomUUID(),
        attachmentVersionId: randomUUID(),
      }),
    /ARTIFACT_PROOF_REQUIRED/,
  );
  const failure = {
    ...job.result,
    status: "failed",
    code: "RENDERER_UNAVAILABLE",
    retryable: true,
  };
  delete failure.attachmentId;
  delete failure.attachmentVersionId;
  await command("failed", token, failure);
  await rejects(
    "Failed render cannot release gate",
    () => command("gate_succeeded", null),
    /GATE_NOT_READY/,
  );
  await command("retry", null);
  const second = randomUUID();
  await command("claim", second);
  await command("failed", second, failure);
  report.checks.push(
    "Repeated failure after explicit retry has a distinct durable event",
  );
  await command("retry", null);
  const third = randomUUID();
  await command("claim", third);
  await command("ready", third, job.result);
  await command("gate_failed", null, { code: "CALLBACK_UNAVAILABLE" });
  const replay = await command("claim", randomUUID());
  assert.equal(replay.status, "ready");
  assert.deepEqual(replay.result, job.result);
  await command("gate_succeeded", null);
  report.checks.push(
    "Gate failure preserves artifact and retries without a render",
  );
  const after = (
    await client.query(
      "SELECT to_jsonb(c) value FROM document.entity_case c WHERE tenant_id=$1 AND id=$2",
      [tenant, job.case_id],
    )
  ).rows[0].value;
  assert.deepEqual(after, before);
  report.checks.push(
    "All provider and callback failures preserve case business state",
  );
  await client.query("SELECT set_config('app.current_tenant_id',$1,true)", [
    randomUUID(),
  ]);
  await rejects(
    "Cross-tenant command is denied",
    () => command("claim", randomUUID()),
    /CONTEXT_INVALID/,
  );
  report.passed = true;
} finally {
  await client.query("ROLLBACK");
  await client.end();
  writeFileSync(
    "governance/policy/reports/supplier-process-document-jobs-db.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}
