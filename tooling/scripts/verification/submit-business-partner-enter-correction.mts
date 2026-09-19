/** Authenticated draft registration/staging only. No submit, review or publish. */
import fs from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { request } from "@playwright/test";
const reportPath =
  "governance/policy/reports/business-partner-enter-correction-submission.dev.json";
if (fs.existsSync(reportPath))
  throw Error(
    "Inspect existing attempt instead of replaying native draft creation",
  );
const origin = "https://studio.dev.athyper.test",
  auth = "tests/e2e/.auth/catl.admin-bp-combined-publisher.json";
const graphPath =
    "governance/policy/reviews/business-partner-enter-correction.graph.dev.json",
  bytes = fs.readFileSync(graphPath),
  graph = JSON.parse(bytes.toString());
const deployment = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-reset-runtime-deployment.dev.json",
    "utf8",
  ),
);
if (!deployment.deployed || !deployment.healthy)
  throw Error("Registration deployment required");
const c = await request.newContext({
  baseURL: origin,
  ignoreHTTPSErrors: true,
  storageState: auth,
});
const report: any = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  entityId: "289732bb-45c2-49e6-abb3-70ff4b85336b",
  entityCode: "business_partner",
  graphPath,
  graphSha256: createHash("sha256").update(bytes).digest("hex"),
  image: deployment.image,
  steps: [],
  submitted: false,
  published: false,
  grantsChanged: false,
  activationChanged: false,
  restorationMaterializerRequired: true,
};
const save = () =>
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
try {
  const session = await (await c.get("/api/auth/session")).json();
  const identity = await (await c.get("/api/relay/iam/me")).json();
  if (
    session.state !== "authenticated" ||
    session.assurance !== "elevated" ||
    session.principalId !== "81cd1978-2df5-5c9a-938a-2f8c291aea13" ||
    session.tenantId !== "44444444-4444-4444-8444-444444444444" ||
    identity.principalId !== session.principalId ||
    !identity.permissions?.includes("metadata.entity.author")
  )
    throw Error("Current elevated Studio author required");
  report.principalId = session.principalId;
  report.tenantId = session.tenantId;
  const csrf = (await c.storageState()).cookies.find(
    (x) => x.name === "__Host-athyper-csrf",
  );
  if (!csrf) throw Error("CSRF required");
  const headers = { origin, "x-csrf-token": decodeURIComponent(csrf.value) };
  const perform = async (
    step: string,
    path: string,
    data: unknown,
    revision?: number,
  ) => {
    const options = {
      headers: {
        ...headers,
        ...(revision === undefined ? {} : { "if-match": String(revision) }),
      },
      data,
    };
    const response =
      step === "stage"
        ? await c.put(path, options)
        : await c.post(path, options);
    const body = await response.json();
    report.steps.push({ step, status: response.status(), body });
    save();
    if (!response.ok())
      throw Error(`Native ${step} failed: ${response.status()}`);
    return body;
  };
  save();
  const created = await perform(
    "create",
    "/api/relay/meta-entity-authoring/change-sets",
    {
      entityId: report.entityId,
      entityCode: "business_partner",
      branchCode: "bp-enter-source-correction",
      title:
        "BP: correct nonexistent enter source; preserve target authorization",
    },
  );
  report.changeSetId = created.id;
  report.revision = Number(created.revision);
  save();
  const base = "/api/relay/meta-entity-authoring/change-sets/" + created.id;
  const staged = await perform(
    "stage",
    base + "/graph",
    graph,
    report.revision,
  );
  report.revision = Number(staged.revision);
  report.staged = true;
  save();
  const validation = await perform("validate", base + "/validate", {});
  if (validation.issues?.length) throw Error("Native graph validation failed");
  report.validated = true;
  save();
  const tests = await perform("test", base + "/test", {});
  if (!tests.passed) throw Error("Native contract tests failed");
  report.tested = true;
  save();
  const submitted = await perform(
    "submit",
    base + "/submit",
    { expectedRevision: report.revision },
    report.revision,
  );
  report.revision = Number(submitted.revision);
  report.submitted = submitted.status === "in_review";
  save();
  if (!report.submitted) throw Error("Submission not confirmed");
} catch (e) {
  report.failure = e instanceof Error ? e.message : "Native staging failed";
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  save();
  await c.storageState({ path: auth });
  fs.chmodSync(auth, 0o600);
  await c.dispose();
}
console.log(
  JSON.stringify({
    entityId: report.entityId,
    changeSetId: report.changeSetId,
    staged: report.staged,
    validated: report.validated,
    tested: report.tested,
    failure: report.failure,
    submitted: report.submitted,
    published: false,
  }),
);
