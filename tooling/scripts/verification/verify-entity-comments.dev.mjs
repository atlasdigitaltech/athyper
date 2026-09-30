/** Authenticated DEV comment probes. Writes require --edit-fixture and clean up only their own fixture. */
import { request } from "@playwright/test";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const { values } = parseArgs({
  options: {
    plane: { type: "string", default: "neon" },
    entity: { type: "string", default: "country" },
    record: { type: "string" },
    state: { type: "string" },
    comment: { type: "string", multiple: true, default: [] },
    "edit-fixture": { type: "boolean", default: false },
    output: {
      type: "string",
      default: "/tmp/athyper-comment-performance.dev.json",
    },
  },
});
assert.ok(["neon", "mesh", "studio"].includes(values.plane));
assert.match(values.entity, /^[a-z][a-z0-9_]*$/);
assert.match(values.record ?? "", /^[a-zA-Z0-9_-]{1,128}$/);
for (const id of values.comment) assert.match(id, /^[0-9a-f-]{36}$/i);
const origin = `https://${values.plane}.dev.athyper.test`;
const client = await request.newContext({
  ignoreHTTPSErrors: true,
  storageState:
    values.state ?? `tests/e2e/.auth/dev/${values.plane}/catl.admin.json`,
});
const report = {
  capturedAt: new Date().toISOString(),
  plane: values.plane,
  entity: values.entity,
  samples: [],
  passed: false,
};
let fixture, csrf;
async function probe(name, path, method = "GET", body, expected = 200) {
  const start = performance.now();
  const response = await client.fetch(origin + "/api/relay" + path, {
    method,
    headers: {
      origin,
      ...(csrf ? { "x-csrf-token": csrf } : {}),
      ...(body?.idempotencyKey
        ? { "idempotency-key": body.idempotencyKey }
        : {}),
    },
    ...(body ? { data: body } : {}),
    maxRedirects: 0,
  });
  let value;
  try {
    value = await response.json();
  } catch {
    value = {};
  }
  const sample = {
    name,
    status: response.status(),
    durationMs: Math.round(performance.now() - start),
    serverTiming: response.headers()["server-timing"] ?? null,
    requestId: response.headers()["x-request-id"] ?? null,
  };
  report.samples.push(sample);
  console.log(JSON.stringify(sample));
  assert.equal(response.status(), expected, name);
  return value;
}
try {
  const session = await (await client.get(origin + "/api/auth/session")).json();
  assert.equal(session.state, "authenticated", "Refresh the saved DEV session");
  const cookie = (await client.storageState()).cookies.find(
    (c) =>
      c.domain === new URL(origin).hostname &&
      /^(?:__Host-)?athyper-csrf$/.test(c.name),
  );
  csrf = cookie ? decodeURIComponent(cookie.value) : undefined;
  for (const [index, id] of values.comment.entries())
    await probe(
      `history-existing-${index + 1}`,
      `/collab/comments/${id}/history`,
    );
  if (values["edit-fixture"]) {
    const created = await probe(
      "fixture-create",
      "/collab/comments",
      "POST",
      {
        entityType: values.entity,
        entityId: values.record,
        text: "Temporary Entity Framework performance verification",
        visibility: "private",
        format: "plain",
        idempotencyKey: randomUUID(),
      },
      201,
    );
    fixture = created.id;
    assert.match(fixture, /^[0-9a-f-]{36}$/i);
    let revision = created.revision;
    for (let i = 1; i <= 3; i++) {
      const edited = await probe(
        `edit-${i}`,
        `/collab/comments/${fixture}`,
        "PATCH",
        {
          text: `Temporary Entity Framework performance verification ${i}`,
          format: "plain",
          expectedRevision: revision,
        },
      );
      assert.equal(edited.revision, revision + 1);
      revision = edited.revision;
    }
    await probe(
      "stale-edit-denied",
      `/collab/comments/${fixture}`,
      "PATCH",
      { text: "Stale write must fail", expectedRevision: 1 },
      409,
    );
    const history = await probe(
      "fixture-history",
      `/collab/comments/${fixture}/history`,
    );
    assert.ok(history.items.length >= 3, "History retains edit revisions");
  }
  report.passed = true;
} catch (error) {
  report.failure = error.message.split("\n")[0];
  process.exitCode = 1;
} finally {
  if (fixture)
    try {
      await probe(
        "fixture-delete",
        `/collab/comments/${fixture}`,
        "DELETE",
        undefined,
        204,
      );
      report.fixtureCleaned = true;
    } catch {
      report.passed = false;
      report.fixtureCleaned = false;
      report.fixtureId = fixture;
      process.exitCode = 1;
    }
  await client.dispose();
  writeFileSync(values.output, JSON.stringify(report, null, 2) + "\n", {
    mode: 0o600,
  });
  console.log(`Report: ${values.output}`);
}
