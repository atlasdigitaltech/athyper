/** Local capture-only walkthrough. Creates one marked comment through normal APIs. */
import { request } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const env = JSON.parse(
  execFileSync(
    "docker",
    [
      "inspect",
      "athyper-dev-source-worker-1",
      "--format",
      "{{json .Config.Env}}",
    ],
    { encoding: "utf8" },
  ),
);
for (const setting of [
  "NOTIFICATION_CAPTURE=true",
  "EMAIL_PROVIDER=smtp",
  "SMTP_HOST=mailtrap",
])
  assert.ok(env.includes(setting), "Local Mailpit capture required");
const origin = "https://neon.dev.athyper.test";
const c = await request.newContext({
  ignoreHTTPSErrors: true,
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
});
const report = {
  startedAt: new Date().toISOString(),
  captureOnly: true,
  checks: {},
};
async function call(path, method = "GET", body, headers = {}) {
  const cookie = (await c.storageState()).cookies.find(
    (c) =>
      c.domain === new URL(origin).hostname &&
      /^(?:__Host-)?athyper-csrf$/.test(c.name),
  );
  const r = await c.fetch(origin + "/api/relay" + path, {
    method,
    headers: {
      origin,
      ...(cookie ? { "x-csrf-token": decodeURIComponent(cookie.value) } : {}),
      ...headers,
    },
    ...(body ? { data: body } : {}),
  });
  const responseText = await r.text();
  const value = responseText ? JSON.parse(responseText) : {};
  assert.ok(r.ok(), `${path}: ${r.status()} ${value.code ?? ""}`);
  return value;
}
try {
  const coordinate = {
    entityType: "business_partner",
    entityId: "01a0a02d-a3ae-74c3-8a17-85662cf1eb21",
  };
  const participants = await call(
    "/collab/participants?" +
      new URLSearchParams({ ...coordinate, visibility: "public" }),
  );
  const owner = participants.items.find((p) => p.displayName === "Catl Owner");
  assert.ok(owner, "Admitted owner recipient required");
  const key = randomUUID(),
    text = `Local notification verification ${key}`;
  const created = await call(
    "/collab/comments",
    "POST",
    {
      ...coordinate,
      text,
      visibility: "public",
      mentionedPrincipalIds: [owner.id],
      idempotencyKey: key,
    },
    { "Idempotency-Key": key },
  );
  const comment = created.comment ?? created;
  assert.ok(comment.id);
  report.commentId = comment.id;
  report.recipientId = owner.id;
  report.checks.createdViaApi = true;
  const edited = await call("/collab/comments/" + comment.id, "PATCH", {
    text: text + " — retained mention edit",
    expectedRevision: comment.revision,
    mentionedPrincipalIds: [owner.id],
  });
  report.checks.retainedMentionEditAccepted = Boolean(
    edited.id ?? edited.comment?.id,
  );
  assert.match(comment.id, /^[0-9a-f-]{36}$/i);
  execFileSync(
    process.execPath,
    ["tooling/scripts/verification/sweep-entity-notifications.dev.mjs"],
    { stdio: "pipe" },
  );
  const readDeliveries = () =>
    JSON.parse(
      execFileSync(
        "docker",
        [
          "exec",
          "athyper-dev-db-1",
          "psql",
          "-X",
          "-U",
          "postgres",
          "-d",
          "athyper_neon",
          "-At",
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          `SELECT coalesce(json_agg(x),'[]'::json) FROM (SELECT d.id,d.channel,d.status,d.channel_detail->>'templateKey' template_key,d.external_id FROM event.notification_message m JOIN event.notification_delivery d ON d.message_id=m.id WHERE m.payload->>'comment_id'='${comment.id}') x`,
        ],
        { encoding: "utf8" },
      ),
    );
  let deliveries = [];
  for (let attempt = 0; attempt < 18; attempt++) {
    deliveries = readDeliveries();
    if (
      deliveries.length === 2 &&
      deliveries.every((d) => d.status === "delivered")
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
    if (attempt === 1)
      execFileSync(
        process.execPath,
        ["tooling/scripts/verification/sweep-entity-notifications.dev.mjs"],
        { stdio: "pipe" },
      );
  }
  assert.equal(
    deliveries.length,
    2,
    "Expected exactly one in-app and email delivery; check recipient consent/preferences and outbox errors",
  );
  assert.ok(
    deliveries.every((d) => d.status === "delivered"),
    "Delivery worker did not finish",
  );
  assert.equal(
    deliveries.find((d) => d.channel === "email")?.template_key,
    "bp_mention",
  );
  assert.equal(
    deliveries.find((d) => d.channel === "in_app")?.template_key,
    "comment_mention",
  );
  const count = execFileSync(
    "docker",
    [
      "exec",
      "athyper-dev-db-1",
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
      "-At",
      "-c",
      `SELECT count(*) FROM event.outbox WHERE entity_id='${comment.id}' AND event_type='collaboration.comment.mentioned'`,
    ],
    { encoding: "utf8" },
  ).trim();
  assert.equal(count, "1");
  report.deliveries = deliveries;
  report.checks.exactlyOneMentionEvent = true;
  report.checks.inAppAndEmailDelivered = true;
  report.checks.publishedOverrideAndSharedTemplate = true;
  const captureProgram = `const response=await fetch('http://mailtrap:8025/api/v1/search?query='+encodeURIComponent(${JSON.stringify(key)}));if(!response.ok)throw Error('Mailpit unavailable');const result=await response.json();const ids=[];for(const message of result.messages){const detail=await(await fetch('http://mailtrap:8025/api/v1/message/'+message.ID)).json();let value;try{value=JSON.parse(detail.Text);}catch{continue;}if(value.deliveryId===${JSON.stringify(deliveries.find((d) => d.channel === "email").id)})ids.push(message.ID);}if(ids.length!==1)throw Error('Expected exactly one capture');console.log(JSON.stringify(ids));`;
  report.mailpitIds = JSON.parse(
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "athyper-dev-source-worker-1",
        "node",
        "--input-type=module",
      ],
      { input: captureProgram, encoding: "utf8" },
    ),
  );
  report.checks.oneEmailCapture = true;
  report.completedAt = new Date().toISOString();
  writeFileSync(
    "/tmp/entity-notifications-phase2-live.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(report);
} finally {
  await c.dispose();
}
