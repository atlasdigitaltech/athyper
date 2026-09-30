import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
const p = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/bp-consolidated-20260912/company-case.proposal.json",
  ),
);
const staged = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-company-case-stage-20260912.1789182379243.dev.json",
  ),
).result.body;
assert.equal(staged.id, "2583e809-c034-4e83-afdf-927f6292f26a");
const origin = "https://studio.dev.athyper.test",
  root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
const browser = await chromium.launch(),
  context = await browser.newContext({
    ignoreHTTPSErrors: true,
    proxy: { server: "http://127.0.0.1:13330" },
    storageState: root + "/ui-auth/dev/studio/catl.owner.json",
  });
const events = [];
const out =
  "governance/policy/reports/business-partner-company-case-review-" +
  Date.now() +
  ".dev.json";
try {
  const page = await context.newPage();
  await page.goto(origin + "/home");
  const session = await page.evaluate(
    async () => await (await fetch("/api/auth/session")).json(),
  );
  console.log({ state: session.state, assurance: session.assurance });
  assert.equal(session.principalId, "5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d");
  assert.equal(session.assurance, "elevated");
  const call = async (path, method, body) => {
    const r = await page.evaluate(
      async ({ path, method, body }) => {
        const c = document.cookie
          .split(";")
          .map((x) => x.trim())
          .find((x) => x.startsWith("__Host-athyper-csrf="));
        if (!c) throw Error("CSRF_REQUIRED");
        const r = await fetch("/api/relay/" + path, {
          method,
          headers: {
            "content-type": "application/json",
            "x-csrf-token": decodeURIComponent(c.slice(c.indexOf("=") + 1)),
            ...(method === "POST"
              ? {
                  "idempotency-key":
                    "bp-company-initial-publish-20260912-consolidated",
                }
              : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: r.status, body: await r.json() };
      },
      { path, method, body },
    );
    events.push({ path, method, ...r });
    assert.ok(r.status >= 200 && r.status < 300, JSON.stringify(r));
    return r.body;
  };
  const current = await call(
    "studio/business-partner-company-case-contracts/" + staged.id,
    "GET",
  );
  assert.equal(current.bundleHash, staged.bundleHash);
  assert.equal(current.contractHash, p.contractHash);
  assert.deepEqual(current.contract, p.packet.candidate.contract);
  assert.equal(current.previousContractId, null);
  assert.equal(current.previousContractHash, null);
  assert.equal(current.createdBy, "81cd1978-2df5-5c9a-938a-2f8c291aea13");
  assert.notEqual(current.createdBy, session.principalId);
  const result = await call(
    "studio/business-partner-company-case-contracts/" + staged.id + "/publish",
    "POST",
    { minimumRuntimeVersion: "1.0.0" },
  );
  console.log({ published: true, result });
} catch (e) {
  console.log({ error: e.message.split("\n")[0] });
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        reviewer: "catl.owner",
        packetHash: p.packetHash,
        events,
        enforcementActivation: false,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  await browser.close();
}
