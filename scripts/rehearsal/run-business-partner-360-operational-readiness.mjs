#!/usr/bin/env node

import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const CONFIRMATION = "RUN-BP360-OPERATIONAL-READINESS";
const APPROVAL_GATES = ["functional", "data", "security_privacy", "contract", "performance", "resilience", "ux", "operations"];
const root = resolve(import.meta.dirname, "../..");

export async function runBusinessPartner360OperationalReadiness(options) {
  if (options.confirmation !== CONFIRMATION) throw new Error(`execution requires --confirm=${CONFIRMATION}`);
  if (!options.neonDatabaseUrl) throw new Error("--neon-database-url is required for failed-materialization rehearsal");
  assertLocalNeon(options.neonDatabaseUrl);
  const scenarios = [];
  scenarios.push(run("studio-mesh-cursor-reveal", "pnpm", ["--filter", "@athyper/server-service-master-data", "exec", "vitest", "run", "src/__tests__/business-partner-360-production-integrations.test.ts", "src/__tests__/business-partner-360-mesh-network-adapter.test.ts", "src/__tests__/business-partner-360-service.test.ts", "src/__tests__/business-partner-360-commercial-controls.test.ts"]));
  scenarios.push(run("permission-epoch-client-invalidation", "pnpm", ["--filter", "@athyper/product-neon-business-partner", "exec", "vitest", "run", "src/360/business-partner-360-client.test.ts", "src/360/business-partner-360-section-client.test.ts", "src/360/business-partner-360-role-client.test.ts", "src/360/business-partner-360-network-client.test.ts", "src/360/business-partner-360-workforce-client.test.ts"]));
  const materialization = run("failed-materialization-rollback", "pnpm", ["--filter", "@athyper/server-db", "exec", "tsx", "scripts/run-business-partner-360-security-evidence.ts", `--neon-database-url=${options.neonDatabaseUrl}`, "--confirm=RUN-BS360-SECURITY-EVIDENCE"]);
  scenarios.push(materialization);
  const materializationDocument = lastJson(materialization.stdout);
  assert(Array.isArray(materializationDocument.faultInjection) && materializationDocument.faultInjection.length === 6 && materializationDocument.faultInjection.every((item) => item.rolledBack), "six-stage materialization rollback evidence is incomplete");

  const telemetry = await validateTelemetry();
  const approvals = await validateApprovalLedger(options.approvalLedger);
  const runbook = await validateRunbook();
  const result = {
    schemaVersion: 1,
    kind: "athyper.business-partner-360.operational-readiness-evidence",
    capturedAt: new Date().toISOString(),
    safeSyntheticOnly: true,
    scenarios: scenarios.map(({ code, passed, durationMs }) => ({ code, passed, durationMs })),
    materialization: { stages: materializationDocument.faultInjection.map((item) => item.stage), allRolledBack: true },
    telemetry,
    runbook,
    approvals,
    technicalPassed: scenarios.every((scenario) => scenario.passed) && telemetry.passed && runbook.passed,
    releaseReady: scenarios.every((scenario) => scenario.passed) && telemetry.passed && runbook.passed && approvals.complete,
  };
  if (options.output) {
    const destination = resolve(root, options.output);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, `${JSON.stringify(result, null, 2)}\n`);
  }
  return result;
}

async function validateTelemetry() {
  const rulesDirectory = resolve(root, "stack/config/telemetry/metrics");
  const checks = [
    run("prometheus-rules", "docker", ["run", "--rm", "--entrypoint", "/bin/promtool", "-v", `${rulesDirectory}:/work:ro`, "-w", "/work", "prom/prometheus:v3.11.2", "check", "rules", "business-partner-alerts.yml"]),
    run("instance-prometheus-rules", "docker", ["run", "--rm", "--entrypoint", "/bin/promtool", "-v", `${resolve(root,"deploy/compose/instance/config/prometheus")}:/work:ro`, "-w", "/work", "prom/prometheus:v3.11.2", "check", "rules", "business-partner-rules.yaml"]),
    run("operations-prometheus-rules", "docker", ["run", "--rm", "--entrypoint", "/bin/promtool", "-v", `${resolve(root,"deploy/compose/operations/config")}:/work:ro`, "-w", "/work", "prom/prometheus:v3.11.2", "check", "rules", "business-partner-rules.yaml"]),
    run("prometheus-safe-synthetic-events", "docker", ["run", "--rm", "--entrypoint", "/bin/promtool", "-v", `${rulesDirectory}:/work:ro`, "-w", "/work", "prom/prometheus:v3.11.2", "test", "rules", "business-partner-360-alert-tests.yml"]),
  ];
  const temporary = await mkdtemp(resolve(tmpdir(), "bp360-alertmanager-"));
  try {
    const template = await readFile(resolve(root, "stack/config/telemetry/alertmanager/config.yml.tpl"), "utf8");
    const rendered = template
      .replaceAll("__ALERTMANAGER_SMTP_SMARTHOST__", "smtp.invalid:587")
      .replaceAll("__ALERTMANAGER_SMTP_FROM__", "alerts@example.invalid")
      .replaceAll("__ALERTMANAGER_SMTP_REQUIRE_TLS__", "true")
      .replaceAll("__ALERTMANAGER_SMTP_AUTH_USERNAME__", "synthetic-user")
      .replaceAll("__ALERTMANAGER_SMTP_AUTH_PASSWORD__", "synthetic-password")
      .replaceAll(/__ALERTMANAGER_[A-Z]+_EMAIL__/g, "sink@example.invalid");
    await chmod(temporary, 0o755);
    await writeFile(resolve(temporary, "alertmanager.yml"), rendered, { mode: 0o644 });
    checks.push(run("alertmanager-config", "docker", ["run", "--rm", "--entrypoint", "/bin/amtool", "-v", `${temporary}:/work:ro`, "prom/alertmanager:v0.32.0", "check-config", "/work/alertmanager.yml"]));
    const platform = run("platform-alert-route", "docker", ["run", "--rm", "--entrypoint", "/bin/amtool", "-v", `${temporary}:/work:ro`, "prom/alertmanager:v0.32.0", "config", "routes", "test", "--config.file=/work/alertmanager.yml", "service=business-partner-360", "severity=warning", "team=platform"]);
    const reveal = run("reveal-alert-route", "docker", ["run", "--rm", "--entrypoint", "/bin/amtool", "-v", `${temporary}:/work:ro`, "prom/alertmanager:v0.32.0", "config", "routes", "test", "--config.file=/work/alertmanager.yml", "service=business-partner-360", "severity=critical", "team=security"]);
    assert(platform.stdout.includes("platform-email"), "platform synthetic alert did not resolve to platform-email");
    assert(reveal.stdout.includes("critical-email") && reveal.stdout.includes("security-email"), "reveal synthetic alert did not resolve to critical and security receivers");
    checks.push(platform, reveal);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  const requiredPanels = ["Summary and section p95", "Errors by safe reason", "Payload p95", "Completeness status", "MESH fallback", "Redaction and reveal", "Materialization failures", "Legacy aggregate calls"], dashboardPaths = ["stack/config/telemetry/provisioning/dashboards/json/business-partner-360.json", "deploy/compose/instance/config/grafana/provisioning/dashboards/json/business-partner-360.json", "deploy/compose/operations/config/grafana/dashboards/json/business-partner-360.json"];
  for (const path of dashboardPaths) { const dashboardText = JSON.stringify(JSON.parse(await readFile(resolve(root, path), "utf8"))); for (const panel of requiredPanels) assert(dashboardText.includes(panel), `dashboard panel is missing from ${path}: ${panel}`); assert(!/(businessPartnerId|principalId|accountNumber|nationalId|dateOfBirth|compensation|payload_json|evidence_content)/i.test(dashboardText), `dashboard contains a prohibited subject or restricted dimension: ${path}`); }
  return { passed: checks.every((check) => check.passed), checks: checks.map(({ code, passed }) => ({ code, passed })), dashboardPanels: requiredPanels.length, dashboardCopies: dashboardPaths.length, routes: { platform: ["platform-email"], reveal: ["critical-email", "security-email"] } };
}

async function validateApprovalLedger(path) {
  const document = JSON.parse(await readFile(resolve(root, path ?? "docs/architecture/evidence/business-partner-360-release-approvals.json"), "utf8"));
  assert(document.schemaVersion === 1 && Array.isArray(document.approvals), "approval ledger schema is invalid");
  const byGate = new Map(document.approvals.map((approval) => [approval.gate, approval]));
  const pending = [], invalid = [];
  for (const gate of APPROVAL_GATES) {
    const approval = byGate.get(gate);
    if (!approval || approval.status !== "approved") { pending.push(gate); continue; }
    if (!/^[A-Za-z0-9][A-Za-z0-9._@-]{2,127}$/.test(approval.approverId ?? "") || !Number.isFinite(Date.parse(approval.approvedAt ?? "")) || !/^[A-Za-z0-9][A-Za-z0-9._:/#-]{5,255}$/.test(approval.evidenceRef ?? "")) invalid.push(gate);
  }
  return { required: APPROVAL_GATES, pending, invalid, complete: pending.length === 0 && invalid.length === 0 };
}

async function validateRunbook() {
  const text = await readFile(resolve(root, "docs/runbooks/business-partner-360-operations.md"), "utf8");
  const scenarios = ["Definition fallback", "MESH outage or incompatible response", "Stale cursor", "Permission change or purpose expiry", "Failed materialization", "Reveal incident", "Support triage", "Rollback"];
  for (const scenario of scenarios) assert(text.includes(`## ${scenario}`), `runbook scenario is missing: ${scenario}`);
  for (const phrase of ["Never copy response bodies", "feature rollout to 0%", "Page Security", "correlation ID"]) assert(text.includes(phrase), `runbook safety instruction is missing: ${phrase}`);
  return { passed: true, scenarios };
}

function run(code, command, args) {
  const started = Date.now(), result = spawnSync(command, args, { cwd: root, encoding: "utf8", env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" }, maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${code} failed\n${result.stdout}\n${result.stderr}`);
  return { code, passed: true, durationMs: Date.now() - started, stdout: result.stdout, stderr: result.stderr };
}
function lastJson(value) { const start = value.indexOf("{"); if (start < 0) throw new Error("subprocess did not return JSON evidence"); return JSON.parse(value.slice(start)); }
function assertLocalNeon(value) { const url = new URL(value); if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) || url.pathname !== "/athyper_neon") throw new Error("operational rehearsal requires local disposable athyper_neon"); }
function assert(value, message) { if (!value) throw new Error(message); }
function option(args, name) { return args.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1); }

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2), result = await runBusinessPartner360OperationalReadiness({ confirmation: option(args, "--confirm"), neonDatabaseUrl: option(args, "--neon-database-url") ?? process.env.ATHYPER_NEON_DATABASE_ADMIN_URL, approvalLedger: option(args, "--approval-ledger"), output: option(args, "--output") });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
