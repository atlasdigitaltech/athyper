import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import cp from "node:child_process";
const origin = "https://studio.dev.athyper.test",
  root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
const output =
  "governance/policy/reports/business-partner-dependency-independent-review-20260912.dev.json";
assert.ok(
  !fs.existsSync(output),
  "Receipt already exists; inspect before retry",
);
const review = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/bp-dependencies-20260912/child-stored-review.json",
    "utf8",
  ),
);
assert.equal(
  review.nativeContractHash,
  "e6cfa1a5eda2b7667c19d35d5bd43dd433725829f3ed7c661d7785640de6dcda",
);
const preflight = JSON.parse(
  cp.execFileSync(
    "docker",
    [
      "exec",
      "athyper-bp-enter-db",
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "athyper_studio",
      "-c",
      "SELECT jsonb_build_object('status',c.status,'revision',c.lock_version,'ledgerHash',r.contract_hash,'graph',r.contract_json,'author',c.created_by,'submitter',c.submitted_by) FROM metadata.entity_change_set c JOIN LATERAL(SELECT contract_hash,contract_json FROM snapshot.entity_contract_revision WHERE change_set_id=c.id ORDER BY revision_no DESC LIMIT 1)r ON true WHERE c.id='9f56f0c1-3a18-4505-bba2-76f50c745132';",
    ],
    { encoding: "utf8" },
  ),
);
assert.deepEqual(preflight.graph, review.graph);
assert.equal(preflight.status, "in_review");
assert.equal(preflight.revision, 2);
const browser = await chromium.launch(),
  context = await browser.newContext({
    ignoreHTTPSErrors: true,
    proxy: { server: "http://127.0.0.1:13330" },
    storageState: root + "/ui-auth/dev/studio/catl.owner.json",
  });
const events = [];
const save = () =>
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        reviewer: "catl.owner",
        principalId: "5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d",
        preflight,
        nativeContractHash: review.nativeContractHash,
        events,
        enforcementActivation: false,
      },
      null,
      2,
    ) + "\n",
  );
try {
  const page = await context.newPage();
  await page.goto(origin + "/home");
  const session = await page.evaluate(
    async () => await (await fetch("/api/auth/session")).json(),
  );
  assert.equal(session.state, "authenticated");
  assert.equal(session.principalId, "5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d");
  assert.equal(session.assurance, "elevated");
  assert.notEqual(preflight.author, session.principalId);
  assert.notEqual(preflight.submitter, session.principalId);
  const call = async (path, method, body, headers = {}) => {
    const result = await page.evaluate(
      async ({ path, method, body, headers }) => {
        const cookie = document.cookie
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("__Host-athyper-csrf="));
        if (!cookie) throw Error("CSRF_REQUIRED");
        const r = await fetch("/api/relay/" + path, {
          method,
          headers: {
            "content-type": "application/json",
            "x-csrf-token": decodeURIComponent(
              cookie.slice(cookie.indexOf("=") + 1),
            ),
            ...headers,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: r.status, body: await r.json() };
      },
      { path, method, body, headers },
    );
    events.push({ at: new Date().toISOString(), path, method, result });
    save();
    console.log({ path, status: result.status, error: result.body.error });
    assert.ok(result.status >= 200 && result.status < 300, "Review API failed");
    return result.body;
  };
  const definition = await call(
    "studio/business-partner-definitions/5d905e82-e97e-40d2-93d0-388c7de1672b",
    "GET",
  );
  assert.equal(
    definition.bundleHash,
    "64642c9cf3b051fdf2804872e9bc8c49ffc686b44ecc23975f07b5b71e390351",
  );
  assert.notEqual(definition.createdBy, session.principalId);
  const child = await call(
    "meta-entity-authoring/change-sets/" + review.changeSetId + "/approve",
    "POST",
    {},
    { "if-match": "2" },
  );
  assert.equal(child.status, "approved");
  await call(
    "studio/business-partner-definitions/5d905e82-e97e-40d2-93d0-388c7de1672b/publish",
    "POST",
    { minimumRuntimeVersion: "1.0.0" },
    {
      "idempotency-key": "bp-onboarding-independent-publish-20260912-64642c9c",
    },
  );
  console.log({
    childApproved: true,
    childRevision: child.revision,
    onboardingPublicationRequested: true,
    enforcementActivated: false,
  });
} catch (e) {
  console.log({ error: e.message.split("\n")[0] });
  process.exitCode = 1;
} finally {
  await browser.close();
}
