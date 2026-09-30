// Real authenticated Neon read through the browser relay. Requires explicit authorized record and organization IDs.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const { chromium } = createRequire(process.cwd() + "/package.json")(
    "@playwright/test",
  ),
  browser = await chromium.launch();
try {
  for (const plane of ["neon"]) {
    const c = await browser.newContext({
        ignoreHTTPSErrors: true,
        storageState: `tests/e2e/.auth/${plane}.json`,
      }),
      page = await c.newPage();
    await page.goto(`https://${plane}.dev.athyper.test/atlas`);
    const api = (path, body) =>
      page.evaluate(
        async ({ path, body }) => {
          const csrf = document.cookie
            .split(";")
            .map((s) => s.trim())
            .find((s) => /^(?:__Host-)?athyper-csrf=/.test(s))
            ?.split("=")
            .slice(1)
            .join("=");
          const r = await fetch("/api/relay/atlas" + path, {
            method: body ? "POST" : "GET",
            ...(body
              ? {
                  headers: {
                    "content-type": "application/json",
                    "x-csrf-token": csrf,
                    "idempotency-key": crypto.randomUUID(),
                  },
                  body: JSON.stringify(body),
                }
              : {}),
          });
          const text = await r.text();
          let json;
          try {
            json = JSON.parse(text);
          } catch {}
          return { status: r.status, json, text };
        },
        { path, body },
      );
    const admission = await api("/admission");
    console.log(plane, "ADMISSION", JSON.stringify(admission));
    assert.equal(admission.status, 200);
    assert.equal(admission.json.readToolsAllowed, plane === "neon");
    if (plane === "neon") {
      const created = await api("/threads", {
        title: "Atlas staged read qualification",
      });
      assert.equal(created.status, 201, created.text);
      const threadId = created.json.threadId;
      const recordId = process.env.ATLAS_TEST_RECORD_ID,
        organizationId = process.env.ATLAS_TEST_ORGANIZATION_ID;
      assert.match(recordId ?? "", /^[0-9a-f-]{36}$/i);
      assert.match(organizationId ?? "", /^[0-9a-f-]{36}$/i);
      const out = process.env.ATLAS_TOOL_RECEIPT_DIR;
      assert.ok(out, "Set a private receipt directory outside Git");
      const run = await api(`/threads/${threadId}/runs`, {
        clientRequestId: crypto.randomUUID(),
        publicModelId: "atlas-re-1.0-local",
        dataClass: "internal",
        userText: `Use bp_read_summary to read Business Partner ${recordId} in operating organization ${organizationId} and summarize the returned record.`,
        catalogPolicyRevision: admission.json.policyRevision,
      });
      console.log("READ_STREAM", run.status);
      writeFileSync(
        out + "/read-receipt.json",
        JSON.stringify({ threadId, recordId, run }, null, 2),
        { mode: 0o600 },
      );
      assert.ok(run.text.includes("tool.completed"), run.text);
      assert.ok(run.text.includes("source.cited"), run.text);
      assert.ok(run.text.includes("run.completed"), run.text);
    }
    await c.close();
  }
} finally {
  await browser.close();
}
