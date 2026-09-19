import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { images, save } from "./atlas-f6-common.mjs";
const read = (name) =>
  JSON.parse(readFileSync("docs/examples/atlas-f6/" + name + ".json", "utf8"));
const deployment = read("inference-reliability-api"),
  assessment = read("inference-reliability-assessment"),
  application = read("inference-reliability-application"),
  grounded = read("inference-reliability-grounded"),
  tests = read("inference-reliability-tests");
const current = images(),
  digestSet = (rows) =>
    JSON.stringify(rows.map((r) => [r.name, r.digest]).sort());
const failures = [];
for (const [name, r] of Object.entries({ assessment, application, grounded })) {
  if (!r.passed || !r.stableDeployment)
    failures.push(name + ": failed or unstable");
  if (digestSet(r.imagesAfter ?? []) !== digestSet(current))
    failures.push(name + ": deployment changed");
  if (
    !Number.isFinite(Date.parse(r.observedAt)) ||
    Date.now() - Date.parse(r.observedAt) > 86400000
  )
    failures.push(name + ": stale evidence");
}
if (!tests.passed) failures.push("unit or type checks failed");
if (!current.every((r) => r.health === "healthy"))
  failures.push("deployment not healthy");
if (
  !deployment.applied ||
  deployment.imageDigest !==
    current.find((r) => r.name === "athyper-dev-api-1")?.digest
)
  failures.push("API deployment mismatch");
for (const source of deployment.sourceFiles ?? []) {
  if (
    createHash("sha256").update(readFileSync(source.path)).digest("hex") !==
    source.sha256
  )
    failures.push("source changed: " + source.path);
}
const local = JSON.parse(
    readFileSync("deploy/config/atlas/local-inference.json", "utf8"),
  ),
  semantic = JSON.parse(
    readFileSync("deploy/config/atlas/semantic-retrieval.json", "utf8"),
  );
if (
  assessment.pins?.generation?.digest !== local.model.digest ||
  assessment.pins?.embedding?.digest !== semantic.digest
)
  failures.push("model pin changed");
const normal = assessment.requests.filter((r) =>
  [
    "cold-start",
    "warm",
    "mixed-2",
    "post-saturation",
    "post-cancellation",
  ].includes(r.scenario),
);
const report = {
  observedAt: new Date().toISOString(),
  scope:
    "DEV CirrusAtlantic Atlas reliability; one API process and two simultaneous pilot callers",
  status: failures.length ? "blocked" : "qualified",
  passed: !failures.length,
  blockers: failures,
  images: current,
  tests: {
    passed: tests.suites.reduce((n, s) => n + s.passed, 0),
    skipped: tests.suites.reduce((n, s) => n + s.skipped, 0),
    typecheckedPackages: tests.typechecks.length,
  },
  results: {
    pilotRequests: normal.length,
    pilotFailures: normal.filter((r) => r.status !== "completed").length,
    mixedTwo: assessment.groups["mixed-2"],
    stressFour: assessment.groups["mixed-4"],
    deviceMemory: assessment.deviceMemory,
    applicationRequests: application.requests.length,
    applicationGenerationRuns: application.requests.filter(
      (r) => r.workload === "generation",
    ).length,
    applicationReplaysWithoutExtraProviderCall: application.requests
      .filter((r) => r.workload === "generation")
      .every((r) => r.replayedSameRun && r.providerEntries.length === 1),
    sharedAdmissionVerified: application.sharedAdmissionVerified,
    groundedBrowserPassed: grounded.passed,
  },
  originalIncident: {
    runId: "56bbdd06-5036-4410-a3c2-789138f55167",
    rootCause:
      "unproven; original diagnostics cannot identify the precise predicate",
    retainedEvidence: "model-neon-first-elevated-attempt.json",
    automaticallyRetried: false,
  },
  limits: [
    "Single API process: no distributed admission or external-client coordination.",
    "Small synthetic load sample, not a production capacity or availability SLO.",
    "Cancellation is tested at adapter admission and generation execution; the existing retrieval HTTP route does not forward disconnects to the optional semantic AbortSignal.",
    "Historical F6 closure remains bound to its original image; full F6 requalification is a separate gate.",
  ],
  evidence: {
    deployment: "inference-reliability-api.json",
    assessment: "inference-reliability-assessment.json",
    application: "inference-reliability-application.json",
    grounded: "inference-reliability-grounded.json",
    tests: "inference-reliability-tests.json",
  },
};
save("inference-reliability-status.json", report);
console.log(JSON.stringify(report));
if (!report.passed) process.exitCode = 1;
