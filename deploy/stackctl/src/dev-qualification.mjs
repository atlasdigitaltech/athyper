import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadModel } from "./model.mjs";
import { runReadOnly, runtimeRoot } from "./io.mjs";
import { createValidator } from "./schema.mjs";

const manualAcceptance = Object.freeze([
  ["auth-session-planes", "Login, logout, and session propagation across Neon, Mesh, and Studio need an authenticated browser fixture."],
  ["api-authenticated-request", "The authenticated API request needs a non-production qualification principal."],
  ["worker-exactly-once", "Worker exactly-once processing needs an isolated qualification job fixture."],
  ["scheduler-no-duplication", "Scheduler repeatability needs an isolated schedule fixture and duplicate assertion."],
  ["document-pipeline", "Upload, scan, store, download, render, parse, index, and search need an isolated document fixture."],
  ["mail-webhook", "Mail delivery and webhook handling need an isolated message fixture."],
  ["telemetry-dimensions", "The dev-full preset does not select the observability services needed to prove telemetry dimensions."],
]);

const automatedVerificationChecks = Object.freeze({
  "api-authenticated-request": ["identity.session", "identity.iam"],
  "worker-exactly-once": ["runtime.worker"],
  "scheduler-no-duplication": ["runtime.scheduler"],
  "document-pipeline": ["document.storage-round-trip", "document.clean-scan", "document.extract", "document.render", "search.round-trip"],
  "mail-webhook": ["mail.delivery"],
});

const check = (ok, id, category, success, failure, evidence) => ({
  id, category, status: ok ? "pass" : "blocked", message: ok ? success : failure,
  ...(evidence === undefined ? {} : { evidence }),
});

function inspectContainers(run, project) {
  const listResult = run("docker", ["ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.ID}}"]);
  if (!listResult.ok) throw new Error(`Docker inventory failed: ${listResult.stderr || listResult.error}`);
  const listed = listResult.stdout;
  const ids = listed.split(/\s+/u).filter(Boolean);
  if (!ids.length) return [];
  const inspected = run("docker", ["inspect", ...ids]);
  if (!inspected.ok) throw new Error(`Docker inspect failed: ${inspected.stderr || inspected.error}`);
  const statsResult = run("docker", ["stats", "--no-stream", "--format", "{{json .}}", ...ids], { timeout: 20_000 });
  const stats = new Map((statsResult.ok ? statsResult.stdout.split("\n") : []).filter(Boolean).map((line) => {
    const item = JSON.parse(line); return [item.Name, item];
  }));
  return JSON.parse(inspected.stdout).map((item) => {
    const name = item.Name.replace(/^\//u, "");
    const sample = stats.get(name) ?? {};
    const cpu = Number.parseFloat(String(sample.CPUPerc ?? "0").replace("%", ""));
    return {
      service: item.Config.Labels?.["com.docker.compose.service"] ?? "", name, image: item.Config.Image,
      state: item.State.Status, health: item.State.Health?.Status ?? "none", restartCount: item.RestartCount,
      cpuPercent: Number.isFinite(cpu) ? cpu : 0, memoryUsage: sample.MemUsage ?? "unavailable",
    };
  }).sort((left, right) => left.service.localeCompare(right.service));
}

function curlProbe(run, host, path = "/", captureReadiness = false) {
  const outputArgs = captureReadiness ? ["--write-out", "\n%{http_code}"] : ["--output", "/dev/null", "--write-out", "%{http_code}"];
  const result = run("curl", ["--silent", "--show-error", "--insecure", "--max-time", "10", "--resolve", `${host}:443:127.0.0.1`, ...outputArgs, `https://${host}${path}`], { timeout: 15_000 });
  const lines = result.stdout.split("\n");
  const status = captureReadiness ? lines.pop() : result.stdout;
  let details;
  if (captureReadiness && lines.length) {
    try {
      const body = JSON.parse(lines.join("\n"));
      details = Object.entries(body.checks ?? {}).filter(([, value]) => value.status !== "healthy")
        .map(([id, value]) => ({ id, status: value.status, message: value.message }));
    } catch { details = [{ id: "response", status: "invalid", message: "Readiness response was not valid JSON." }]; }
  }
  return { ok: result.ok && status === "200", status: status || "unavailable", ...(details?.length ? { details } : {}), ...(!result.ok ? { error: result.stderr || result.error || "curl failed" } : {}) };
}

function writeEvidence(repoRoot, document, now) {
  createValidator(repoRoot)(document, "DEV qualification evidence");
  const directory = join(runtimeRoot(), "qualification", "dev", now.replaceAll(":", "-"));
  mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(directory, 0o700);
  const path = join(directory, "dev-qualification.json");
  const body = `${JSON.stringify(document, null, 2)}\n`;
  writeFileSync(`${path}.tmp`, body, { mode: 0o600 }); renameSync(`${path}.tmp`, path); chmodSync(path, 0o600);
  const digest = createHash("sha256").update(body).digest("hex");
  writeFileSync(join(directory, "SHA256SUMS"), `${digest}  dev-qualification.json\n`, { mode: 0o600 });
  return path;
}

export function evaluateDevQualification({ model, receipt, revision, containers, endpoints, qualifiedAt, verification }) {
  const checks = [];
  const expected = model.selected.filter((service) => ["long-running", "stateful"].includes(service.lifecycle));
  const expectedIds = expected.map((service) => service.id);
  const expectedContainers = containers.filter((container) => expectedIds.includes(container.service));
  const actualIds = expectedContainers.map((container) => container.service);
  const missing = expectedIds.filter((id) => !actualIds.includes(id));
  const extra = containers.filter((container) => container.state === "running" && !expectedIds.includes(container.service)).map((container) => container.service);
  const owned = receipt?.spec?.state === "running" && receipt.spec.project === model.instance.spec.composeProject;
  checks.push(check(owned, "controller-ownership", "ownership", "Active controller receipt owns the running DEV project.", "A running active controller receipt was not found.", receipt?.spec?.updatedAt));
  const current = receipt?.spec?.sourceRevision === revision;
  checks.push(check(current, "deployment-source-current", "ownership", "The active deployment matches the checked-out source revision.", "The active deployment source revision differs from the checked-out revision.", { active: receipt?.spec?.sourceRevision ?? "absent", checkout: revision }));
  checks.push(check(!missing.length && !extra.length, "service-topology", "topology", "All selected long-running and stateful DEV services are present.", "The live Compose service set differs from the catalog selection.", { missing, extra }));
  const unhealthy = expectedContainers.filter((item) => item.state !== "running" || !["healthy", "none"].includes(item.health));
  checks.push(check(!unhealthy.length, "container-health", "topology", "All DEV containers are running and healthy.", "One or more DEV containers are not healthy.", unhealthy.map(({ service, state, health }) => ({ service, state, health }))));
  const restarted = expectedContainers.filter((item) => item.restartCount > 0);
  checks.push(check(!restarted.length, "container-restarts", "topology", "No DEV container has restarted since deployment.", "Container restarts prevent clean-run qualification.", restarted.map(({ service, restartCount }) => ({ service, restartCount }))));
  for (const endpoint of endpoints) checks.push(check(endpoint.ok, endpoint.id, "functional", `${endpoint.label} returned HTTP 200.`, `${endpoint.label} did not return HTTP 200.`, { status: endpoint.status, ...(endpoint.details ? { details: endpoint.details } : {}), ...(endpoint.error ? { error: endpoint.error } : {}) }));
  for (const [id, message] of manualAcceptance) {
    const required = automatedVerificationChecks[id];
    if (!required || !verification?.document) {
      checks.push(check(false, id, "functional", "", verification?.error && required ? `Automated platform verification failed: ${verification.error}` : message));
      continue;
    }
    const results = new Map(verification.document.checks.map((item) => [item.id, item]));
    const missing = required.filter((checkId) => results.get(checkId)?.status !== "passed");
    checks.push(check(!missing.length, id, "functional", "Authenticated platform verification supplied isolated fixture evidence.", "Authenticated platform verification did not pass every required fixture.", { runId: verification.document.runId, required, missing }));
  }
  const declaredMemoryMiB = expected.reduce((sum, item) => sum + item.resources.memoryMiB, 0);
  const declaredCpu = expected.reduce((sum, item) => sum + item.resources.cpu, 0);
  const limits = model.resources.spec;
  checks.push(check(declaredMemoryMiB <= limits.maxContainerMemoryMiB && declaredCpu <= limits.maxContainerCpu, "resource-envelope", "resource", "Declared DEV resources fit the laptop-32 container envelope.", "Declared DEV resources exceed the laptop-32 container envelope.", { declaredMemoryMiB, declaredCpu }));
  const blockers = checks.filter((item) => item.status === "blocked").map((item) => item.id);
  return {
    apiVersion: "athyper.io/v1alpha1", kind: "DevQualification",
    metadata: { instance: "dev", qualifiedAt, sourceRevision: revision },
    spec: {
      project: model.instance.spec.composeProject, status: blockers.length ? "blocked" : "passed",
      summary: { passed: checks.length - blockers.length, blocked: blockers.length, total: checks.length }, checks,
      resources: { profile: model.resources.metadata.id, declaredMemoryMiB, declaredCpu, memoryLimitMiB: limits.maxContainerMemoryMiB, cpuLimit: limits.maxContainerCpu, containers },
      blockers,
    },
  };
}

export function qualifyDev(repoRoot, dependencies = {}) {
  const run = dependencies.run ?? runReadOnly;
  const qualifiedAt = (dependencies.now ?? (() => new Date().toISOString()))();
  const model = loadModel(repoRoot, "dev");
  const receiptPath = join(runtimeRoot(), "instances", "dev", "receipts", "active.json");
  const receipt = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, "utf8")) : null;
  const revisionResult = run("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
  if (!revisionResult.ok) throw new Error(`Cannot determine source revision: ${revisionResult.stderr || revisionResult.error}`);
  const containers = inspectContainers(run, model.instance.spec.composeProject);
  const endpointSpecs = [
    ["neon-web", "Neon web", "neon.dev.athyper.test", "/"], ["mesh-web", "Mesh web", "mesh.dev.athyper.test", "/"],
    ["studio-web", "Studio web", "studio.dev.athyper.test", "/"], ["api-liveness", "API liveness", "api.dev.athyper.test", "/livez"],
    ["api-readiness", "API readiness", "api.dev.athyper.test", "/readyz", true],
    ["iam-discovery", "IAM OIDC discovery", "iam.dev.athyper.test", "/realms/athyper/.well-known/openid-configuration"],
    ["mail-sandbox", "Mail sandbox", "mail.dev.athyper.test", "/livez"],
  ];
  const endpoints = endpointSpecs.map(([id, label, host, path, capture]) => ({ id, label, ...curlProbe(run, host, path, capture) }));
  const verification = (dependencies.runVerification ?? runVerification)(run, repoRoot);
  const document = evaluateDevQualification({ model, receipt, revision: revisionResult.stdout, containers, endpoints, qualifiedAt, verification });
  const path = (dependencies.writeEvidence ?? writeEvidence)(repoRoot, document, qualifiedAt);
  return { document, path };
}

function runVerification(run, repoRoot) {
  if (!process.env.VERIFICATION_ACCESS_TOKEN) return undefined;
  const result = run(process.execPath, [join(repoRoot, "scripts", "verification", "run-platform-verification.mjs"), "--api-url", process.env.VERIFICATION_API_URL ?? "https://api.dev.athyper.test", "--plane", process.env.VERIFICATION_PLANE ?? "studio", "--mode", "functional"], { cwd: repoRoot, timeout: 130_000 });
  if (!result.ok) return { error: result.stderr || result.error || `runner exited ${result.status}` };
  try { return { document: JSON.parse(result.stdout) }; }
  catch { return { error: "runner returned invalid JSON" }; }
}
