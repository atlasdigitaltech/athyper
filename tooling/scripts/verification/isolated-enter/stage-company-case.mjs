import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
const origin = "https://studio.dev.athyper.test",
  root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
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
  const p = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/bp-consolidated-20260912/company-case.proposal.json",
      "utf8",
    ),
  );
  const result = await page.evaluate(
    async ({ bundle }) => {
      const cookie = document.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("__Host-athyper-csrf="));
      if (!cookie) throw Error("CSRF_REQUIRED");
      const r = await fetch(
        "/api/relay/studio/business-partner-company-case-contracts",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": decodeURIComponent(
              cookie.slice(cookie.indexOf("=") + 1),
            ),
            "idempotency-key": "bp-company-initial-20260912-consolidated",
          },
          body: JSON.stringify({ bundle, targetPlanes: ["neon"] }),
        },
      );
      return { status: r.status, body: await r.json() };
    },
    { bundle: p.packet },
  );
  const report = {
    capturedAt: new Date().toISOString(),
    actor: "catl.admin",
    principalId: session.principalId,
    assurance: session.assurance,
    proposalRevision: p.packetHash,
    result,
    approved: false,
    published: false,
  };
  const out =
    "governance/policy/reports/business-partner-company-case-stage-20260912." +
    Date.now() +
    ".dev.json";
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log({
    status: result.status,
    revisionId: result.body.id,
    error: result.body.error,
    code: result.body.code,
    report: out,
  });
} catch (e) {
  console.log({ error: e.message.split("\n")[0] });
  process.exitCode = 1;
} finally {
  await browser.close();
}
