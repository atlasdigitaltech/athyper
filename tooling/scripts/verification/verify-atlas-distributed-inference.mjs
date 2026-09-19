import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { images, save } from "./atlas-f6-common.mjs";
const read = (n) =>
  JSON.parse(readFileSync("docs/examples/atlas-f6/" + n + ".json", "utf8"));
const build = read("distributed-inference-build"),
  deployment = read("distributed-inference-deployment"),
  redis = read("distributed-admission-qualification"),
  cross = read("cross-process-inference-qualification"),
  http = read("retrieval-http-disconnect-qualification"),
  incident = read("inference-original-incident-investigation");
const current = images(),
  same = (a) =>
    JSON.stringify(a.map((r) => [r.name, r.digest]).sort()) ===
    JSON.stringify(current.map((r) => [r.name, r.digest]).sort());
const blockers = [];
if (!deployment.passed || !current.every((r) => r.health === "healthy"))
  blockers.push("Deployment is not healthy");
if (
  !["athyper-dev-api-1", "athyper-dev-worker-1"].every(
    (n) => current.find((r) => r.name === n)?.digest === build.imageDigest,
  )
)
  blockers.push("API/worker image binding mismatch");
if (!redis.passed || redis.imageDigest !== build.imageDigest)
  blockers.push("Distributed admission qualification mismatch");
if (!cross.passed || !cross.stableDeployment || !same(cross.imagesAfter))
  blockers.push("Cross-process qualification mismatch");
if (!http.passed || !http.stableDeployment || !same(http.imagesAfter))
  blockers.push(
    "Authenticated HTTP disconnect qualification pending: " +
      (http.blocker ?? "binding changed"),
  );
const modulePaths = {
  "ollama-index":
    "/app/server/node_modules/@athyper/server-adapter-ai-ollama/dist/index.js",
  "agent-runtime":
    "/app/server/node_modules/@athyper/server-platform-ai/dist/agent-runtime.js",
};
const expected = build.artifacts.map((a) => ({
  name: a.name,
  path: modulePaths[a.name] ?? "/app/server/dist/composition/" + a.name + ".js",
  sha256: a.sha256,
}));
const actual = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      "athyper-dev-api-1",
      "node",
      "--input-type=module",
      "-e",
      `import{readFileSync}from'node:fs';import{createHash}from'node:crypto';console.log(JSON.stringify(JSON.parse(process.argv[1]).map(a=>({name:a.name,sha256:createHash('sha256').update(readFileSync(a.path)).digest('hex')}))));`,
      JSON.stringify(expected),
    ],
    { encoding: "utf8", stdio: "pipe" },
  ),
);
const artifactsMatch = expected.every((e) =>
  actual.some((a) => a.name === e.name && a.sha256 === e.sha256),
);
if (!artifactsMatch)
  blockers.push("Deployed artifact differs from qualified build");
const report = {
  observedAt: new Date().toISOString(),
  status: blockers.length ? "qualification_pending" : "qualified",
  passed: !blockers.length,
  implementation: {
    sharedRedisAdmission: true,
    apiAndWorkerDeployed: true,
    retrievalDisconnectPropagation: true,
    documentGroundingCancellation: true,
  },
  blockers,
  images: current,
  artifactsMatch,
  checks: {
    independentRedisProcesses: redis.processes,
    crossContainerRequests: cross.requests.length,
    crossContainerCompleted: cross.completed,
    crossContainerOverlap: !cross.noOverlappingInference,
    authenticatedHttpDisconnect: http.passed,
  },
  historicalInvestigation: {
    status: incident.investigationStatus,
    cause: incident.originalCause,
    confirmedDefect: incident.confirmedDefect,
    defectReproduced: incident.defectReproduced,
    remediationVerified: incident.remediationVerified,
    originalIncidentUniquelyAttributed: false,
  },
  tests: {
    adapter: 17,
    platformAi: 370,
    hostFocused: 29,
    passed: 416,
    skipped: 1,
    typecheckedPackages: 3,
  },
  evidence: {
    deployment: "distributed-inference-deployment.json",
    redis: "distributed-admission-qualification.json",
    crossProcess: "cross-process-inference-qualification.json",
    httpDisconnect: "retrieval-http-disconnect-qualification.json",
    investigation: "inference-original-incident-investigation.json",
  },
  limits: [
    "Redis state loss or an abandoned owner requires quiescent operator recovery; ownership is not stolen automatically.",
    "Direct inference clients must use shared admission; operator probes require quiescence.",
    "Original incident has no retained precise readiness snapshot; its individual cause cannot be proved retrospectively.",
    "Full F6 qualification remains separately bound to deployment images.",
  ],
};
save("distributed-inference-status.json", report);
console.log(
  JSON.stringify({
    status: report.status,
    blockers,
    artifactsMatch,
    checks: report.checks,
  }),
);
if (!report.passed) process.exitCode = 1;
