import {
  canonicalBytes,
  sha256,
} from "../../../../server/packages/adapters/publication-signing/src/canonical-json.ts";
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import cp from "node:child_process";
const staged = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-company-registration-stage-20260912.dev.json",
  ),
);
const statePath =
  "governance/policy/reports/business-partner-company-registration-publication-20260912.dev.json";
const state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath))
  : {
      events: [],
      sourceContractHash: staged.validation.contractHash,
      activated: false,
    };
const save = () =>
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
const browser = await chromium.launch();
async function actor(account, work) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    proxy: { server: "http://127.0.0.1:13330" },
    storageState:
      os.homedir() +
      "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911/ui-auth/dev/studio/" +
      account +
      ".json",
  });
  try {
    const page = await context.newPage();
    await page.goto("https://studio.dev.athyper.test/home");
    const session = await page.evaluate(
      async () => await (await fetch("/api/auth/session")).json(),
    );
    assert.equal(session.state, "authenticated");
    assert.equal(session.assurance, "elevated");
    assert.equal(
      session.principalId,
      account === "catl.admin"
        ? "81cd1978-2df5-5c9a-938a-2f8c291aea13"
        : "5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d",
    );
    const call = async (action, method, body, revision) => {
      const r = await page.evaluate(
        async ({ action, method, body, revision, id }) => {
          const cookie = document.cookie
            .split(";")
            .map((c) => c.trim())
            .find((c) => c.startsWith("__Host-athyper-csrf="));
          if (!cookie) throw Error("CSRF_REQUIRED");
          const response = await fetch(
            "/api/relay/meta-entity-authoring/change-sets/" + id + "/" + action,
            {
              method,
              headers: {
                "content-type": "application/json",
                "x-csrf-token": decodeURIComponent(
                  cookie.slice(cookie.indexOf("=") + 1),
                ),
                ...(revision === undefined
                  ? {}
                  : { "if-match": String(revision) }),
              },
              ...(body ? { body: JSON.stringify(body) } : {}),
            },
          );
          return { status: response.status, body: await response.json() };
        },
        { action, method, body, revision, id: staged.changeSet.id },
      );
      state.events.push({
        at: new Date().toISOString(),
        account,
        action,
        ...r,
      });
      save();
      assert.ok(r.status >= 200 && r.status < 300, JSON.stringify(r));
      return r.body;
    };
    return await work(call);
  } finally {
    await context.close();
  }
}
try {
  if (!state.source) {
    const rows = JSON.parse(
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
          "BEGIN READ ONLY; SELECT jsonb_build_object('changeSet',jsonb_build_object('id',c.id,'revision',c.lock_version,'status',c.status),'graph',r.contract_json,'contractHash',r.contract_hash) FROM metadata.entity_change_set c JOIN LATERAL(SELECT contract_json,contract_hash FROM snapshot.entity_contract_revision WHERE change_set_id=c.id ORDER BY revision_no DESC LIMIT 1)r ON true WHERE c.id='cacfcfb9-c74a-4536-814f-729c53891252'; ROLLBACK;",
        ],
        { encoding: "utf8" },
      ),
    );
    state.source = rows;
    state.reviewSource =
      "read-only Studio ledger; graph GET is not allowlisted in the existing UI image";
    state.source.canonicalContractHash = sha256(
      canonicalBytes(state.source.graph),
    );
    assert.equal(
      state.source.canonicalContractHash,
      staged.validation.contractHash,
    );
    assert.equal(state.source.changeSet.revision, staged.changeSet.revision);
    assert.equal(state.source.changeSet.status, "in_review");
    assert.equal(state.source.changeSet.id, staged.changeSet.id);
    assert.equal(
      state.source.graph.entity.entityCode,
      "business_partner_company_setup_request",
    );
    assert.equal(state.source.graph.runtimeProfiles[0].readMode, "none");
    assert.equal(state.source.graph.runtimeProfiles[0].writeMode, "none");
    assert.equal(state.source.graph.operations.length, 0);
    save();
  }
  if (!state.review) {
    state.review = await actor("catl.owner", (call) =>
      call("approve", "POST", {}, staged.changeSet.revision),
    );
    assert.equal(state.review.status, "approved");
    assert.notEqual(state.review.approvedBy, state.review.createdBy);
    save();
  }
  if (!state.publication) {
    state.publication = await actor("catl.admin", (call) =>
      call(
        "publish",
        "POST",
        { targetPlanes: ["studio"] },
        state.review.revision,
      ),
    );
    save();
  }
  console.log({
    registeredPublication: true,
    releaseId: state.publication.release.id,
    contractHash: state.publication.artifact.contractHash,
    activated: false,
    report: statePath,
  });
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
