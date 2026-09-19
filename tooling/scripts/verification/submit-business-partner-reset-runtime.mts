import fs from "node:fs";
import { request } from "@playwright/test";
import { baselineJsonHash } from "../../../server/packages/planes/studio/meta-entity-authoring/src/baseline-publication.ts";
const read = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const p = read(
    "governance/policy/reviews/business-partner-reset-runtime.proposal.dev.json",
  ),
  graph = read(
    "governance/policy/reviews/business-partner-reset-runtime.graph.dev.json",
  );
const { proposalRevision, ...body } = p;
if (
  baselineJsonHash(body) !== proposalRevision ||
  baselineJsonHash(graph) !== p.graphHash
)
  throw Error("Review payload changed");
const prior = read(
  "governance/policy/reports/business-partner-reset-native-draft.dev.json",
);
const path =
  "governance/policy/reports/business-partner-reset-runtime-submission.dev.json";
if (fs.existsSync(path)) throw Error("Inspect prior attempt; do not replay");
const deployment = read(
  "governance/policy/reports/business-partner-reset-runtime-deployment.dev.json",
);
if (!deployment.deployed || !deployment.healthy)
  throw Error("Runtime restoration deployment required");
const origin = "https://studio.dev.athyper.test",
  auth = "tests/e2e/.auth/catl.admin-bp-combined-publisher.json";
const c = await request.newContext({
  baseURL: origin,
  ignoreHTTPSErrors: true,
  storageState: auth,
});
const report: any = {
  schemaVersion: 1,
  proposalRevision,
  graphHash: p.graphHash,
  changeSetId: prior.changeSetId,
  revision: prior.revision,
  image: deployment.image,
  steps: [],
  submitted: false,
  approved: false,
  published: false,
  grantsChanged: false,
  activationChanged: false,
};
const save = () =>
  fs.writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
try {
  const s = await (await c.get("/api/auth/session")).json();
  if (
    s.state !== "authenticated" ||
    s.assurance !== "elevated" ||
    s.principalId !== "81cd1978-2df5-5c9a-938a-2f8c291aea13" ||
    s.tenantId !== "44444444-4444-4444-8444-444444444444"
  )
    throw Error("Elevated Studio author required");
  const csrf = (await c.storageState()).cookies.find(
    (x) => x.name === "__Host-athyper-csrf",
  );
  if (!csrf) throw Error("CSRF required");
  const headers = { origin, "x-csrf-token": decodeURIComponent(csrf.value) },
    base = "/api/relay/meta-entity-authoring/change-sets/" + prior.changeSetId;
  const perform = async (
    step: string,
    suffix: string,
    data: unknown,
    revision?: number,
  ) => {
    const args = {
      headers: {
        ...headers,
        ...(revision === undefined ? {} : { "if-match": String(revision) }),
      },
      data,
    };
    const r =
      step === "stage"
        ? await c.put(base + suffix, args)
        : await c.post(base + suffix, args);
    const b = await r.json();
    report.steps.push({ step, status: r.status(), body: b });
    save();
    if (!r.ok()) throw Error(step + " failed: " + r.status());
    return b;
  };
  const staged = await perform("stage", "/graph", graph, report.revision);
  report.revision = Number(staged.revision);
  save();
  const validation = await perform("validate", "/validate", {});
  if (validation.issues?.length) throw Error("Native validation failed");
  const tests = await perform("test", "/test", {});
  if (!tests.passed) throw Error("Native tests failed");
  const submitted = await perform(
    "submit",
    "/submit",
    { expectedRevision: report.revision },
    report.revision,
  );
  report.revision = Number(submitted.revision);
  report.submitted = submitted.status === "in_review";
  if (!report.submitted) throw Error("Submission not confirmed");
} catch (e) {
  report.failure = e instanceof Error ? e.message : "Submission failed";
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  save();
  await c.storageState({ path: auth });
  fs.chmodSync(auth, 0o600);
  await c.dispose();
}
console.log({
  changeSetId: report.changeSetId,
  revision: report.revision,
  submitted: report.submitted,
  failure: report.failure,
});
