/** Activate the reviewed country-history metadata through authenticated DEV Studio. */
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { request } from "@playwright/test";
import { sha256 } from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js";
const receiptPath =
  "governance/policy/reports/reference-choice-history-activation.dev.json";
const receipt = JSON.parse(readFileSync(receiptPath, "utf8")),
  meta = receipt.metadata;
const graph = JSON.parse(readFileSync(meta.preparedGraph, "utf8"));
if (sha256(graph) !== meta.contractHash)
  throw Error("Prepared metadata changed");
const origin = "https://studio.dev.athyper.test",
  authPath = "tests/e2e/.auth/dev/studio/catl.admin.json";
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
  const path = `/api/relay/meta-entity-authoring/change-sets/${meta.changeSetId}/graph`;
  const read = await c.get(path);
  if (!read.ok())
    throw Error(`Authoring read ${read.status()}: ${await read.text()}`);
  const current = await read.json();
  let result = current;
  if (sha256(current.graph) !== meta.contractHash) {
    if (
      current.changeSet.revision !== meta.expectedRevision ||
      sha256(current.graph) !== meta.beforeHash
    )
      throw Error("Current graph changed; re-review required");
    const csrf = (await c.storageState()).cookies.find((x) =>
      /^(__Host-)?athyper-csrf$/.test(x.name),
    );
    if (!csrf) throw Error("CSRF required");
    const response = await c.put(path, {
      headers: {
        origin,
        "x-csrf-token": decodeURIComponent(csrf.value),
        "if-match": String(meta.expectedRevision),
      },
      data: graph,
    });
    result = await response.json();
    receipt.metadata.save = { status: response.status(), result };
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
    if (!response.ok()) throw Error(`Save failed ${response.status()}`);
  }
  const verified = await (await c.get(path)).json();
  if (sha256(verified.graph) !== meta.contractHash)
    throw Error("Saved graph differs");
  receipt.metadata.preview = verified.preview ?? result.preview;
  receipt.metadata.savedRevision = verified.changeSet.revision;
  receipt.metadata.status = "saved";
  delete receipt.metadata.blocker;
  receipt.updatedAt = new Date().toISOString();
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        revision: verified.changeSet.revision,
        preview: receipt.metadata.preview,
      },
      null,
      2,
    ),
  );
} finally {
  await c.storageState({ path: authPath });
  chmodSync(authPath, 0o600);
  await c.dispose();
}
