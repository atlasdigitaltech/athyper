import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { request } from "@playwright/test";
import { withBusinessPartnerValidationMessages } from "../../../server/db/scripts/provisioning/business-partner-data-surfaces.js";
import {
  sha256,
  validateGraph,
  runContractTests,
} from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js";
const origin = "https://studio.dev.athyper.test",
  authPath = "tests/e2e/.auth/dev/studio/catl.admin.json",
  id = "be767e01-f36d-434f-91f3-67bff689a367";
const c = await request.newContext({
  baseURL: origin,
  ignoreHTTPSErrors: true,
  storageState: authPath,
});
try {
  const session = await (await c.get("/api/auth/session")).json();
  if (
    session.state !== "authenticated" ||
    session.principalId !== "81cd1978-2df5-5c9a-938a-2f8c291aea13" ||
    session.tenantId !== "44444444-4444-4444-8444-444444444444"
  )
    throw Error("Studio author session required");
  const path = `/api/relay/meta-entity-authoring/change-sets/${id}/graph`,
    r = await c.get(path);
  if (!r.ok()) throw Error(`Studio read ${r.status()}: ${await r.text()}`);
  const current = await r.json(),
    graph = withBusinessPartnerValidationMessages(current.graph);
  const issues = validateGraph(graph).issues;
  if (issues.length || !runContractTests(graph).passed)
    throw Error(JSON.stringify(issues));
  const receipt: any = {
    environment: "dev",
    changeSetId: id,
    beforeRevision: current.changeSet.revision,
    beforeHash: sha256(current.graph),
    contractHash: sha256(graph),
    recordedAt: new Date().toISOString(),
  };
  if (receipt.beforeHash !== receipt.contractHash) {
    const csrf = (await c.storageState()).cookies.find((x) =>
      /^(__Host-)?athyper-csrf$/.test(x.name),
    );
    if (!csrf) throw Error("CSRF required");
    const result = await c.put(path, {
      headers: {
        origin,
        "x-csrf-token": decodeURIComponent(csrf.value),
        "if-match": String(current.changeSet.revision),
      },
      data: graph,
    });
    receipt.saveStatus = result.status();
    receipt.result = await result.json();
    writeFileSync(
      "governance/policy/reports/intake-validation-activation.dev.json",
      JSON.stringify(receipt, null, 2) + "\n",
    );
    if (!result.ok()) throw Error("Save failed");
  }
  const verified = await (await c.get(path)).json();
  if (sha256(verified.graph) !== receipt.contractHash)
    throw Error("Saved graph mismatch");
  receipt.preview = verified.preview;
  receipt.active =
    verified.preview?.state === "active" &&
    verified.preview.contractHash === receipt.contractHash;
  writeFileSync(
    "governance/policy/reports/intake-validation-activation.dev.json",
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(receipt.preview);
  if (!receipt.active) throw Error("Preview not active");
} finally {
  await c.storageState({ path: authPath });
  chmodSync(authPath, 0o600);
  await c.dispose();
}
