/** Local DEV only: seed one draft fixture, then activate it exclusively through the governed case APIs. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { actor } from "./partner-classification-session.mjs";
if (!process.argv.includes("--run"))
  throw Error("Use --run for CATL DEV case acceptance");
const bp = "b4137225-4534-5469-8138-09d15a970271";
const fact = "bf8aeb62-97e1-4cd2-b4e9-fc34aee11c68";
const db = (query) =>
  execFileSync(
    "docker",
    [
      "exec",
      "athyper-dev-db-1",
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
      "-Atc",
      query,
    ],
    { encoding: "utf8" },
  ).trim();
assert.equal(
  execFileSync(
    "docker",
    [
      "inspect",
      "athyper-dev-db-1",
      "--format",
      '{{ index .Config.Labels "com.docker.compose.project" }}',
    ],
    { encoding: "utf8" },
  ).trim(),
  "athyper-dev",
);
const maker = await actor("catl.admin");
const checker = await actor("catl.owner");
const call = async (client, path, body) => {
  const result = await client.call(path, body);
  assert.ok(
    [200, 201].includes(result.status),
    JSON.stringify({ path, ...result }),
  );
  return result.body;
};
try {
  // Test setup, not evidence of governed capture. Never rewrite an existing fixture.
  db(`BEGIN;
    SET LOCAL app.current_tenant_id='44444444-4444-4444-8444-444444444444';
    SET LOCAL app.current_principal_id='cca94907-7519-5871-8e3c-6b11aa545c93';
    SET LOCAL app.current_actor_type='user';
    INSERT INTO master.business_partner_commodity_classification
      (id,tenant_id,business_partner_id,commodity_category_id,source_system,source_reference,notes,status,created_by)
    VALUES ('${fact}','44444444-4444-4444-8444-444444444444','${bp}',
      '6e57ce17-3ee5-5d74-875a-ee153ffb5717','dev_acceptance','classification-case-r21',
      'Synthetic draft fixture for governed child activation; no commercial decision.','draft','cca94907-7519-5871-8e3c-6b11aa545c93')
    ON CONFLICT (id) DO NOTHING;
    COMMIT;`);
  const created = await call(maker, "neon/business-partner-cases", {
    kind: "amend_partner",
    source: { kind: "manual" },
    registrationMode: "direct",
    targetBusinessPartnerId: bp,
    idempotencyKey: "classification-case-r21-20260923",
    proposedPayload: {
      reasonCode: "PROFILE_ACCEPTED",
      childActivation: {
        schema: "athyper.bp-child-activation/1",
        items: [{ kind: "commodity_classification", id: fact }],
      },
    },
  });
  const caseId = created.request.id;
  console.log(
    JSON.stringify({ step: "create", caseId, classificationId: fact }),
  );
  const path = `neon/business-partner-cases/${caseId}`;
  let current = (await call(maker, path)).request;
  if (["draft", "validation_failed"].includes(current.status)) {
    current = (
      await call(maker, path + "/validate", {
        expectedVersion: current.rowVersion,
        idempotencyKey: `classification-case-validate-${caseId}-${current.rowVersion}`,
      })
    ).request;
    assert.notEqual(
      current.status,
      "validation_failed",
      JSON.stringify(current),
    );
  }
  if (current.status === "validated")
    current = (
      await call(maker, path + "/submit", {
        expectedVersion: current.rowVersion,
        idempotencyKey: `classification-case-submit-${caseId}`,
      })
    ).request;
  console.log(JSON.stringify({ step: "submit", status: current.status }));
  for (
    let n = 0;
    n < 8 && !["approved", "applied", "materialized"].includes(current.status);
    n++
  ) {
    const view = await call(
      checker,
      `governance/process-tasks/cases/${caseId}/view`,
    );
    const tasks = view.executions.filter(
      (t) =>
        t.assignee_principal_id === "645b6a55-3355-526a-9643-3900425bde47" &&
        t.work_item_status === "open",
    );
    assert.equal(tasks.length, 1, "Expected one open CATL owner approval");
    const t = tasks[0];
    await call(checker, `governance/process-tasks/cases/${caseId}/decide`, {
      attemptId: view.coordinate.attemptId,
      cycleTaskId: t.cycle_task_id,
      workflowRequestId: t.workflow_request_id,
      workflowStageId: t.workflow_stage_id,
      workItemId: t.work_item_id,
      expectedWorkItemVersion: Number(t.work_item_version),
      action: "approve",
      reason:
        "Accept synthetic role-independent classification activation, not supplier qualification.",
      idempotencyKey: `classification-case-approve-${t.work_item_id}`,
    });
    current = (await call(maker, path)).request;
    console.log(JSON.stringify({ step: "approve", status: current.status }));
  }
  if (current.status === "approved") {
    const command = {
      expectedVersion: current.rowVersion,
      idempotencyKey: `classification-case-materialize-${caseId}`,
    };
    current = (await call(maker, path + "/materialize", command)).request;
    await call(maker, path + "/materialize", command);
  }
  assert.ok(["applied", "materialized"].includes(current.status));
  assert.equal(
    db(
      `SELECT status FROM master.business_partner_commodity_classification WHERE id='${fact}'`,
    ),
    "active",
  );
  assert.equal(
    db(
      `SELECT status FROM master.business_partner_commodity_classification WHERE id='62d82fd7-18ef-534f-8924-33a40a8837f3'`,
    ),
    "active",
  );
  console.log(
    JSON.stringify({
      step: "materialize",
      caseId,
      classificationId: fact,
      status: current.status,
      safeReplay: true,
    }),
  );
} finally {
  await maker.dispose();
  await checker.dispose();
}
