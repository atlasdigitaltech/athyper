/** Stage and submit only. No approval, publishing, grants or activation. */
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { request } from "@playwright/test";
// @ts-expect-error Tested review hash/merge utility.
import { combinedHash } from "./entity-authorization/combined-successor.mjs";
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const report = read(
  "governance/policy/reviews/business-partner-canonical-v2-native.proposal.dev.json",
);
const graph = read(
  "governance/policy/reviews/business-partner-canonical-v2-native-graph.dev.json",
);
const { proposalRevision: reviewRevision, ...reviewed } = report;
if (
  combinedHash(reviewed) !== reviewRevision ||
  combinedHash(graph) !== report.nativeGraphHash ||
  report.publicationEligible !== false
)
  throw Error("COMBINED_REVIEW_CHANGED");
execFileSync(
  "pnpm",
  [
    "exec",
    "tsx",
    "tooling/scripts/verification/capture-business-partner-combined-source.mts",
  ],
  { stdio: "inherit" },
);
const source = read(
  "governance/policy/reports/business-partner-combined-source.dev.json",
).source;
if (
  combinedHash(source.descriptor) !== report.predecessor.descriptorHash ||
  combinedHash(source.authored_contract) !==
    report.predecessor.authoredContractHash
)
  throw Error("COMBINED_PREDECESSOR_CHANGED");
const receiptPath =
  "governance/policy/reports/business-partner-canonical-v2-authoring.dev.json";
const receipt: any = existsSync(receiptPath)
  ? read(receiptPath)
  : {
      schemaVersion: 1,
      kind: "bp_canonical_v2_authoring",
      reviewRevision,
      graphHash: report.nativeGraphHash,
      steps: [],
      grantsChanged: false,
      activationAuthorized: false,
      approvalRecorded: false,
      published: false,
    };
if (receipt.reviewRevision !== reviewRevision)
  throw Error("PRESERVE_EXISTING_COMBINED_REVISION");
if (receipt.submitted) {
  console.log({
    changeSetId: receipt.changeSetId,
    state: "in_review",
    alreadySubmitted: true,
  });
  process.exit(0);
}
const baseURL = "https://studio.dev.athyper.test",
  account = "catl.admin",
  principal = "81cd1978-2df5-5c9a-938a-2f8c291aea13",
  tenant = "44444444-4444-4444-8444-444444444444";
const authPath = `tests/e2e/.auth/${account}-bp-combined-publisher.json`;
const c = await request.newContext({
  baseURL,
  ignoreHTTPSErrors: true,
  storageState: authPath,
});
const save = () =>
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
try {
  const initial = await c.storageState(),
    csrf = initial.cookies.find((x) => x.name === "__Host-athyper-csrf");
  if (!csrf) throw Error("STUDIO_CSRF_REQUIRED");
  const refreshed = await c.post("/api/auth/refresh", {
    headers: {
      origin: baseURL,
      "x-csrf-token": decodeURIComponent(csrf.value),
    },
  });
  if (!refreshed.ok()) throw Error("STUDIO_SESSION_REFRESH_REQUIRED");
  const session = await (await c.get("/api/auth/session")).json();
  if (
    session.state !== "authenticated" ||
    session.principalId !== principal ||
    session.tenantId !== tenant
  )
    throw Error("STUDIO_AUTHOR_IDENTITY_REQUIRED");
  const cookie = (await c.storageState()).cookies.find(
    (x) => x.name === "__Host-athyper-csrf",
  )!;
  const headers = {
    origin: baseURL,
    "x-csrf-token": decodeURIComponent(cookie.value),
  };
  const perform = async (
    step: string,
    path: string,
    data: unknown,
    revision?: number,
  ) => {
    const args = {
      headers: {
        ...headers,
        ...(revision !== undefined ? { "if-match": String(revision) } : {}),
      },
      data,
    };
    const response =
      step === "stage" ? await c.put(path, args) : await c.post(path, args);
    const text = await response.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      body = { nonJson: true };
    }
    receipt.steps.push({
      step,
      account,
      principalId: principal,
      at: new Date().toISOString(),
      status: response.status(),
      body,
    });
    save();
    if (!response.ok())
      throw Error(`COMBINED_${step.toUpperCase()}_FAILED:${response.status()}`);
    return body;
  };
  if (!receipt.changeSetId) {
    const created = await perform(
      "create",
      "/api/relay/meta-entity-authoring/change-sets",
      {
        entityId: source.entity_id,
        entityCode: "business_partner",
        branchCode: "bp-canonical-read-v2",
        title:
          "BP canonical read v2: explicit target grants and preserved constraints",
      },
    );
    receipt.changeSetId = created.id;
    receipt.revision = Number(created.revision);
    save();
  }
  const path = `/api/relay/meta-entity-authoring/change-sets/${receipt.changeSetId}`;
  if (!receipt.staged) {
    const staged = await perform(
      "stage",
      path + "/graph",
      graph,
      receipt.revision,
    );
    receipt.revision = Number(staged.revision);
    receipt.staged = true;
    save();
  }
  if (!receipt.validated) {
    const validation = await perform("validate", path + "/validate", {});
    if (validation.issues?.length)
      throw Error("COMBINED_NATIVE_VALIDATION_FAILED");
    receipt.validated = true;
    save();
  }
  if (!receipt.tested) {
    const tests = await perform("test", path + "/test", {});
    if (!tests.passed) throw Error("COMBINED_NATIVE_TESTS_FAILED");
    receipt.tested = true;
    save();
  }
  const submitted = await perform(
    "submit",
    path + "/submit",
    { expectedRevision: receipt.revision },
    receipt.revision,
  );
  receipt.revision = Number(submitted.revision);
  receipt.submitted = submitted.status === "in_review";
  save();
  if (!receipt.submitted) throw Error("COMBINED_SUBMISSION_NOT_CONFIRMED");
  console.log({
    changeSetId: receipt.changeSetId,
    revision: receipt.revision,
    state: "in_review",
    reviewRevision,
    approvalRecorded: false,
    published: false,
    grantsChanged: false,
  });
} finally {
  await c.storageState({ path: authPath });
  chmodSync(authPath, 0o600);
  await c.dispose();
}
