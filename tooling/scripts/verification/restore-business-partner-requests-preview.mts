import { artifactDirectory } from "../artifact-paths.mjs";
const output = artifactDirectory("business-partner-requests", "dev");
/** Restore the missing request summary in personal DEV through authenticated graph authoring. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { request } from "@playwright/test";
import {
  validateGraph,
  runContractTests,
  sha256,
} from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js";

const graph = JSON.parse(
  readFileSync(
    "governance/policy/reviews/bp-dependencies-20260912/child-storage.candidate.json",
    "utf8",
  ),
);
assert.equal(graph.entity.entityCode, "business_partner_request");
assert.deepEqual(validateGraph(graph).issues, []);
assert.equal(runContractTests(graph).passed, true);
const origin = "https://studio.dev.athyper.test";
const client = await request.newContext({
  baseURL: origin,
  ignoreHTTPSErrors: true,
  storageState: "tests/e2e/.auth/dev/studio/catl.admin.json",
});
try {
  const session = await (await client.get("/api/auth/session")).json();
  assert.equal(session.state, "authenticated");
  assert.equal(session.tenantId, "44444444-4444-4444-8444-444444444444");
  assert.equal(session.principalId, "81cd1978-2df5-5c9a-938a-2f8c291aea13");
  const response = await client.get(
    "/api/relay/meta-entity-authoring/change-sets",
  );
  assert.equal(response.status(), 200);
  const changes = await response.json();
  assert.ok(Array.isArray(changes));
  let draft = changes.find(
    (c: any) =>
      c.entityCode === graph.entity.entityCode &&
      c.branchCode === "local-preview" &&
      c.status === "draft",
  );
  const report: any = {
    capturedAt: new Date().toISOString(),
    environment: "dev",
    graphHash: sha256(graph),
    grantsChanged: false,
    existingDraft: draft?.id,
  };
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ ...report, dryRun: true }));
  } else {
    const csrf = (await client.storageState()).cookies.find((c) =>
      /^(__Host-)?athyper-csrf$/.test(c.name),
    );
    assert.ok(csrf);
    const headers = { origin, "x-csrf-token": decodeURIComponent(csrf.value) };
    if (!draft) {
      const created = await client.post(
        "/api/relay/meta-entity-authoring/change-sets",
        {
          headers,
          data: {
            entityId: randomUUID(),
            entityCode: graph.entity.entityCode,
            branchCode: "local-preview",
            title: "Business Partner requests collection",
            registration: {
              schemaVersion: 1,
              moduleCode: "rel",
              entityClass: "process",
              ownershipModel: "tenant",
            },
          },
        },
      );
      const body = await created.json();
      assert.equal(created.status(), 201, JSON.stringify(body));
      draft = body;
    }
    const path =
      "/api/relay/meta-entity-authoring/change-sets/" + draft.id + "/graph";
    const current = await (await client.get(path)).json();
    // Never overwrite someone else's edits when re-running this recovery.
    if (current.graph.fields?.length)
      assert.equal(
        sha256(current.graph),
        sha256(graph),
        "Existing request draft differs; inspect before replacing",
      );
    const saved = await client.put(path, {
      headers: { ...headers, "if-match": String(current.changeSet.revision) },
      data: graph,
    });
    const result = await saved.json();
    report.changeSetId = draft.id;
    report.saveStatus = saved.status();
    report.preview = result.preview;
    mkdirSync(output, { recursive: true });
    writeFileSync(
      `${output}/restoration.json`,
      JSON.stringify(report, null, 2) + "\n",
    );
    assert.equal(saved.status(), 200, JSON.stringify(result));
    assert.equal(
      result.preview?.state,
      "active",
      JSON.stringify(result.preview),
    );
    console.log(JSON.stringify(report));
  }
} finally {
  await client.dispose();
}
