import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const manifestPath = resolve(
  root,
  "governance/config/governance/business-partner-v1-qualification.v1.json",
);

export function verifyBusinessPartnerV1Qualification() {
  const failures = [];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.$schema !== "athyper.business-partner-v1-qualification/1")
    failures.push("qualification schema is invalid");
  if (
    manifest.productionQualified !== false ||
    manifest.productionQualification !== "blocked"
  )
    failures.push("local evidence must not claim production qualification");
  for (const [name, value] of Object.entries(manifest.thresholds ?? {}))
    if (
      name !== "wcagStandard" &&
      name !== "phoneViewport" &&
      name !== "desktopViewport" &&
      (!(typeof value === "number") || value <= 0)
    )
      failures.push(`threshold ${name} must be positive`);
  if (
    manifest.thresholds?.wcagStandard !== "WCAG 2.2 AA" ||
    manifest.thresholds?.zoomPercent !== 200
  )
    failures.push("accessibility threshold is incomplete");
  for (const path of [
    manifest.retention?.manualAccessibilityDraft,
    manifest.retention?.manualAccessibilityInstructions,
  ])
    if (typeof path !== "string" || !existsSync(resolve(root, path)))
      failures.push("manual accessibility review packet is incomplete");
  const requiredScenarios = [
    "BP-SUP-001",
    "BP-X-001",
    "BP-X-002",
    "BP-X-003",
    "BP-X-005",
    "BP-X-006",
    "BP-X-009",
    "BP-X-010",
    "BP-X-012",
  ];
  const scenarios = new Map(
    (manifest.scenarioEvidence ?? []).map((item) => [item.id, item]),
  );
  for (const id of requiredScenarios) {
    const item = scenarios.get(id);
    if (!item) {
      failures.push(`missing scenario evidence ${id}`);
      continue;
    }
    for (const path of item.evidence ?? [])
      if (!existsSync(resolve(root, path)))
        failures.push(`${id} evidence does not exist: ${path}`);
  }
  const browserCommand = (manifest.commands ?? []).find(
    (item) => item.command === "pnpm test:e2e:bp-v1-009",
  );
  if (
    !browserCommand ||
    browserCommand.optionalSkip !== false ||
    browserCommand.result !== "passed" ||
    !browserCommand.evidence ||
    !existsSync(resolve(root, browserCommand.evidence))
  )
    failures.push(
      "browser evidence must remain mandatory, passing, and retained",
    );
  const spec = read("tests/e2e/business-partner/bp-v1-009.spec.ts"),
    fixture = read("tests/e2e/business-partner/bp-v1-009.fixture.ts"),
    config = read("tooling/config/playwright.config.ts");
  if (/test\.skip|\.skip\(/.test(spec)) failures.push("BP-V1-009 may not skip");
  for (const token of [
    "wcag22aa",
    "assertReflow",
    "setViewportSize",
    "business-partner-v1-qualification-evidence.json",
  ])
    if (!spec.includes(token)) failures.push(`BP-V1-009 is missing ${token}`);
  for (const token of [
    "PLAYWRIGHT_BP_V1_REQUESTER_USER",
    "PLAYWRIGHT_BP_V1_APPROVER_USER",
    "PLAYWRIGHT_BP_V1_MATERIALIZER_USER",
  ])
    if (!fixture.includes(token)) failures.push(`fixture is missing ${token}`);
  if (!config.includes('name: "bp-v1-009"'))
    failures.push("qualified Playwright project is missing");
  const composition = read(
      "server/apps/platform-host/src/composition/register-services.ts",
    ),
    alerts = read(
      "deploy/config/telemetry/metrics/business-partner-alerts.yml",
    ),
    dashboard = read(
      "deploy/config/telemetry/provisioning/dashboards/json/business-partner-v1.json",
    );
  for (const metric of [
    "athyper_business_partner_case_http_duration_ms",
    "athyper_business_partner_case_oldest_open_seconds",
    "athyper_business_partner_notification_planning_total",
    "athyper_business_partner_notification_oldest_pending_seconds",
    "athyper_business_partner_notification_dead_letters",
  ])
    if (
      !composition.includes(metric) ||
      !alerts.includes(metric) ||
      !dashboard.includes(metric)
    )
      failures.push(`telemetry coverage is incomplete for ${metric}`);
  for (const threshold of ["> 800", "> 86400", "> 300"])
    if (!alerts.includes(threshold))
      failures.push(`alert threshold is missing: ${threshold}`);
  const runbook = read("docs/runbooks/business-partner-v1-operations.md");
  if (
    !runbook
      .toLowerCase()
      .includes("production qualification remains blocked") ||
    !runbook.includes("does not authorize direct")
  )
    failures.push(
      "runbook must preserve the blocked qualification state and safe recovery boundary",
    );
  if (failures.length)
    throw new Error(
      `Business Partner V1 qualification verification failed:\n- ${failures.join("\n- ")}`,
    );
  return {
    scenarios: requiredScenarios.length,
    commands: manifest.commands.length,
    productionQualified: false,
  };
}

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = verifyBusinessPartnerV1Qualification();
  process.stdout.write(
    `Business Partner V1 local qualification verified: ${result.scenarios} scenarios, ${result.commands} retained commands; production qualification blocked.\n`,
  );
}
