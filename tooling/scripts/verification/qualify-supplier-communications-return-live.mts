import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { request, chromium } from "@playwright/test";
const origin = "https://neon.dev.athyper.test",
  endpoint = "/api/relay/neon/business-partner-cases";
const client = await request.newContext({
  baseURL: origin,
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  ignoreHTTPSErrors: true,
});
const reviewer = await request.newContext({
  baseURL: origin,
  storageState: "tests/e2e/.auth/dev/neon/catl.owner.json",
  ignoreHTTPSErrors: true,
});
const report: any = { at: new Date().toISOString(), checks: [] };
async function call(
  actor: any,
  path: string,
  data?: any,
  method = "POST",
  expected = 200,
) {
  const csrf = (await actor.storageState()).cookies.find((c: any) =>
    /^(__Host-)?athyper-csrf$/.test(c.name),
  );
  assert.ok(csrf);
  const r = await actor.fetch(path, {
    method,
    headers: {
      origin,
      "x-csrf-token": decodeURIComponent(csrf.value),
      ...(method !== "GET"
        ? { "Idempotency-Key": data?.idempotencyKey ?? randomUUID() }
        : {}),
    },
    ...(data ? { data } : {}),
  });
  const body = await r.json();
  assert.ok(
    r.status() === expected ||
      (expected === 201 &&
        path.endsWith("/submit") &&
        r.status() === 200 &&
        body.replayed === true),
    JSON.stringify({ path, status: r.status(), expected, body }),
  );
  return body;
}
const post = (path: string, data: any) =>
  call(
    client,
    path,
    data,
    "POST",
    path === endpoint ||
      path.endsWith("/submit") ||
      path.endsWith("/materialize")
      ? 201
      : 200,
  );
const get = (id: string) => call(client, `${endpoint}/${id}`, undefined, "GET");
const view = (id: string) =>
  call(
    reviewer,
    `/api/relay/governance/process-tasks/cases/${id}/view`,
    undefined,
    "GET",
  );
async function vote(id: string, action?: string) {
  const v = await view(id),
    i = v.executions.find(
      (e: any) =>
        e.stage_status === "active" &&
        ["open", "claimed"].includes(e.work_item_status),
    );
  assert.ok(i, JSON.stringify(v));
  const command = {
    attemptId: v.coordinate.attemptId,
    cycleTaskId: i.cycle_task_id,
    workflowRequestId: i.workflow_request_id,
    workflowStageId: i.workflow_stage_id,
    workItemId: i.work_item_id,
    expectedWorkItemVersion: Number(i.work_item_version),
    idempotencyKey: randomUUID(),
    action: action ?? i.action,
    reason: "P7 qualification decision",
  };
  const receipt = await call(
    reviewer,
    `/api/relay/governance/process-tasks/cases/${id}/decide`,
    command,
  );
  return { command, receipt };
}
async function notice(id: string, milestone: string, workItemId?: string) {
  for (let count = 0; count < 45; count++) {
    if (count % 10 === 0)
      execFileSync(
        "node",
        ["tooling/scripts/verification/sweep-supplier-communications-dev.mjs"],
        { stdio: "pipe" },
      );
    const query = `SELECT count(*) FROM event.notification_delivery d JOIN event.notification_message m ON m.tenant_id=d.tenant_id AND m.id=d.message_id WHERE m.entity_id='${id}'::uuid AND m.event_code='supplier.onboarding.notice.${milestone}' AND d.channel IN ('in_app','email') AND d.status='delivered' ${workItemId ? `AND m.payload->'communication'->>'workItemId'='${workItemId}'` : ""}`;
    const found = Number(
      execFileSync(
        "docker",
        [
          "exec",
          "athyper-dev-db-1",
          "psql",
          "-U",
          "postgres",
          "-d",
          "athyper_neon",
          "-At",
          "-c",
          query,
        ],
        { encoding: "utf8" },
      ).trim(),
    );
    if (found >= 2) {
      report.checks.push({
        id,
        milestone,
        deliveredAcrossChannels: found,
        workItemId,
      });
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw Error(`P7 ${milestone} notice not delivered for ${id}`);
}
try {
  const id = "55d5082e-0165-4ea9-8eaf-74e019aae585";
  const current = await get(id);
  if (current.request.caseStatus !== "draft")
    report.returned = await vote(id, "return");
  await notice(id, "returned");
  report.passed = true;
} finally {
  await client.dispose();
  await reviewer.dispose();
  writeFileSync(
    "governance/policy/reports/supplier-onboarding-communications-return.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify({ passed: report.passed ?? false }));
}
