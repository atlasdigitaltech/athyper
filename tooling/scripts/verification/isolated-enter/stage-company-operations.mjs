import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const origin = "https://studio.dev.athyper.test",
  root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
const statePath =
  "governance/policy/reports/business-partner-company-operations-stage-20260912.dev.json";
const state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, "utf8"))
  : {
      schemaVersion: 1,
      entityId: "9f3cab64-0c24-4635-960a-6488f91016e9",
      events: [],
      approved: false,
      published: false,
    };
const save = () =>
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
const browser = await chromium.launch(),
  context = await browser.newContext({
    ignoreHTTPSErrors: true,
    proxy: { server: "http://127.0.0.1:13330" },
    storageState: root + "/ui-auth/dev/studio/catl.admin.json",
  });
try {
  const page = await context.newPage();
  await page.goto(origin + "/home");
  const session = await page.evaluate(
    async () => await (await fetch("/api/auth/session")).json(),
  );
  assert.equal(session.state, "authenticated");
  assert.equal(session.principalId, "81cd1978-2df5-5c9a-938a-2f8c291aea13");
  assert.equal(session.assurance, "elevated");
  const call = async (path, method, body, revision) => {
    const result = await page.evaluate(
      async ({ path, method, body, revision }) => {
        const cookie = document.cookie
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("__Host-athyper-csrf="));
        if (!cookie) throw Error("CSRF_REQUIRED");
        const r = await fetch("/api/relay/meta-entity-authoring/" + path, {
          method,
          headers: {
            "content-type": "application/json",
            "x-csrf-token": decodeURIComponent(
              cookie.slice(cookie.indexOf("=") + 1),
            ),
            ...(revision === undefined ? {} : { "if-match": String(revision) }),
          },
          body: JSON.stringify(body),
        });
        const text = await r.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = { error: "NON_JSON_RESPONSE" };
        }
        return { status: r.status, body: parsed };
      },
      { path, method, body, revision },
    );
    state.events.push({
      capturedAt: new Date().toISOString(),
      path,
      method,
      result,
    });
    save();
    console.log({ path, status: result.status, error: result.body.error });
    assert.ok(
      result.status >= 200 && result.status < 300,
      JSON.stringify(result.body),
    );
    return result.body;
  };
  if (!state.changeSet) {
    state.changeSet = await call("change-sets", "POST", {
      entityId: state.entityId,
      entityCode: "business_partner_company_setup_request",
      branchCode: "bp-company-operations-20260912",
      title:
        "BP company case reviewed operation bindings and source provenance",
    });
    save();
  }
  if (!state.graphStored) {
    const graph = JSON.parse(
      fs.readFileSync(
        "governance/policy/reviews/bp-consolidated-20260912/company-operations-handlers.candidate.json",
        "utf8",
      ),
    );
    state.changeSet = await call(
      "change-sets/" + state.changeSet.id + "/graph",
      "PUT",
      graph,
      state.changeSet.revision,
    );
    state.graphStored = true;
    save();
  }
  if (!state.validation) {
    state.validation = await call(
      "change-sets/" + state.changeSet.id + "/validate",
      "POST",
      {},
    );
    save();
  }
  assert.equal(state.validation.issues.length, 0);
  if (!state.tests) {
    state.tests = await call(
      "change-sets/" + state.changeSet.id + "/test",
      "POST",
      {},
    );
    save();
  }
  assert.equal(state.tests.passed, true);
  if (!state.submitted) {
    state.changeSet = await call(
      "change-sets/" + state.changeSet.id + "/submit",
      "POST",
      {},
      state.changeSet.revision,
    );
    state.submitted = true;
    save();
  }
  console.log({
    submitted: true,
    changeSetId: state.changeSet.id,
    revision: state.changeSet.revision,
    contractHash: state.validation.contractHash,
    approved: false,
  });
} catch (e) {
  console.log({ error: e.message.split("\n")[0] });
  process.exitCode = 1;
} finally {
  await browser.close();
}
