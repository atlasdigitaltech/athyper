/** Read-only assessment of actual DEV processes. No activation or grant writer. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { assessExactReleaseExecution } from "./entity-authorization/exact-release-execution-gate.mjs";
import { assessSuccessorDifferenceReview } from "./entity-authorization/successor-difference-review.mjs";
if (process.argv.length !== 2)
  throw Error("Read-only capture: no arguments supported");
const base = "governance/policy/",
  read = (p) => JSON.parse(readFileSync(p)),
  hash = (x) => createHash("sha256").update(x).digest("hex");
const run = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 4000000,
    stdio: ["pipe", "pipe", "pipe"],
  });
const proposal = read(
  base + "reviews/business-partner-target-read-grants.proposal.dev.json",
);
const runtimes = {};
for (const mode of ["api", "worker"]) {
  const container = `athyper-dev-${mode}-1`,
    inspection = JSON.parse(run(["inspect", container]))[0];
  const source = run([
    "exec",
    container,
    "cat",
    `/app/server/dist/processes/${mode}/index.js`,
  ]);
  const invocation = source
    .split("\n")
    .find((l) => l.includes("registerServices(container,"))
    ?.trim();
  const withoutTarget =
    invocation === "registerServices(container, {}, config);" ||
    invocation ===
      "registerServices(container, releaseReview ? { entityAuthorizationReleaseReview: releaseReview } : {}, config);";
  const output = execFileSync(
    "docker",
    ["exec", "-i", container, "node", "--input-type=module"],
    {
      input: readFileSync(
        "tooling/scripts/verification/verify-business-partner-release-19-current-runtime.mjs",
      ),
      encoding: "utf8",
      maxBuffer: 4000000,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const verification = output
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    })
    .find((x) => x.kind === "bp_release_19_signed_artifact_verification");
  if (!verification) throw Error("Native verifier did not produce a result");
  const startup = run([
    "logs",
    "--since",
    inspection.State.StartedAt,
    container,
  ])
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    })
    .find(
      (e) =>
        e.event === "bp_authorization_deployment_verified" &&
        e.runtimeImage === inspection.Image &&
        e.artifactHash === proposal.artifactHash &&
        e.releaseId === proposal.releaseId,
    );
  runtimes[mode] = {
    image: inspection.Image,
    containerId: inspection.Id,
    health: inspection.State.Health?.Status,
    verification,
    startupSourceSha256: hash(source),
    serviceRegistration: invocation,
    targetAdapterWired: withoutTarget ? false : startup ? true : null,
    adapterStartup: startup ?? null,
  };
}
const differences = assessSuccessorDifferenceReview({
  proposal: read(
    base +
      "reviews/business-partner-release-19-differences.successor-20260911.proposal.dev.json",
  ),
  acceptance: read(
    base +
      "reviews/business-partner-release-19-differences.successor-20260911.acceptance.dev.json",
  ),
  readEvidence: (path) => readFileSync(path),
});
const current = read(
  base +
    "reports/business-partner-target-read-grants.post-application.dev.json",
);
const historicalPaths = [
  "business-partner-release-19-isolated-commands-import-gate.dev.json",
  "business-partner-release-19-export-ai-revocation-gate.dev.json",
];
const historical = historicalPaths.map((name) => {
  const bytes = readFileSync(base + "reports/" + name),
    e = JSON.parse(bytes);
  return {
    path: base + "reports/" + name,
    sha256: hash(bytes),
    qualifiedForRecordedScope: e.qualified,
    releaseId: e.releaseId,
    artifactHash: e.artifactHash,
    executionImages: e.execution.map((x) => x.image),
    matchesCurrentImages: Object.values(runtimes).every((r) =>
      e.execution.some((x) => x.image === r.image),
    ),
  };
});
const reads = read(
  base + "reports/business-partner-target-read-grants.authenticated.dev.json",
);
const input = {
  releaseId: proposal.releaseId,
  artifactHash: proposal.artifactHash,
  runtimes,
  authorityFingerprint: hash(
    JSON.stringify(
      current.changes.map((x) => ({ table: x.table, after: x.after })),
    ),
  ),
  journeys: {
    reads: {
      qualified: reads.allNamedReadersQualified,
      authenticated: reads.actors.every((a) => a.authenticated),
      targetExecution: reads.targetReleaseExecutionQualified,
      releaseId: proposal.releaseId,
      artifactHash: proposal.artifactHash,
    },
  },
  differences,
  rollbackQualified: false,
};
const gate = assessExactReleaseExecution(input);
const report = {
  ...gate,
  kind: "bp_current_release_execution_gate",
  capturedAt: new Date().toISOString(),
  runtimes,
  differences,
  historicalEvidence: historical,
  sharedDevReadsQualified: reads.allNamedReadersQualified,
  qualificationGrantProposalRevision: proposal.proposalRevision,
  limits: [
    "No positive wiring conclusion is inferred from arbitrary startup source. A changed implementation requires runtime attestation.",
    "Historical isolated passes are retained for their exact images and authority, never promoted to current deployment qualification.",
    "The grant snapshot fingerprint identifies prior post-application evidence; this checker does not claim fresh scoped IAM execution.",
  ],
  grantsChanged: false,
  activationChanged: false,
};
writeFileSync(
  base + "reports/business-partner-current-execution-gate.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    executionQualified: gate.executionQualified,
    blockers: gate.blockers,
    sharedDevReadsQualified: report.sharedDevReadsQualified,
    policyDispositionsAccepted: differences.reviewedDispositionGateSatisfied,
  }),
);
if (!gate.executionQualified) process.exitCode = 2;
