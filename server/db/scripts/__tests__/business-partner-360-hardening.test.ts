import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("BS360-10 instruments bounded operations without subject dimensions", async () => {
  const [routes, host, alerts, dashboard] = await Promise.all([
    read("packages/services/master-data/src/business-partner-360-routes.ts"),
    read("apps/platform-host/src/composition/register-services.ts"),
    read("../stack/config/telemetry/metrics/business-partner-alerts.yml"),
    read("../stack/config/telemetry/provisioning/dashboards/json/business-partner-360.json"),
  ]);
  for (const metric of ["request_total", "duration_ms", "payload_bytes", "completeness_total", "redaction_total", "reveal_total", "mesh_fallback_total"])
    assert.match(host, new RegExp(`athyper_bp360_${metric}`));
  assert.match(routes, /safeTelemetryFacts/);
  assert.doesNotMatch(host, /attributes\.(?:businessPartnerId|principalId|cursor|purpose)/);
  assert.match(alerts, /BusinessPartner360SummaryLatencyHigh/);
  assert.match(alerts, /> 500/);
  assert.match(alerts, /BusinessPartner360MeshFallbackHigh/);
  assert.match(dashboard, /Legacy aggregate calls/);
  JSON.parse(dashboard);
});

test("BS360-10 keeps rollout dark and retirement separately gated", async () => {
  const [seed, gates, legacy, runbook] = await Promise.all([
    read("db/ddl/planes/neon/control/12_business_partner_360_feature_seed.sql"),
    read("packages/services/master-data/src/business-partner-360-release-gates.ts"),
    read("packages/services/master-data/src/business-partner-request-routes.ts"),
    read("../docs/runbooks/business-partner-360-operations.md"),
  ]);
  assert.match(seed, /neon\.business_partner\.view_360/);
  assert.match(seed, /rollout_pct[^;]*0/s);
  assert.match(seed, /DO UPDATE SET[\s\S]*metadata =/);
  assert.doesNotMatch(seed, /DO UPDATE SET[\s\S]*rollout_pct\s*=/);
  for (const threshold of ["summaryP95Ms>500", "sectionP95Ms>750", "observationDays<30", "legacyCalls!==0"])
    assert.ok(gates.replaceAll(" ", "").includes(threshold));
  assert.match(legacy, /aggregate360\?\.legacyAggregate/);
  assert.match(runbook, /zero legacy calls for 30 consecutive days/i);
});

test("BS360-10 adds exact caller keys, responsive accessibility, and justified indexes", async () => {
  const [summaryClient, sectionClient, shell, navigation, styles, migration, manifest] = await Promise.all([
    read("../packages/planes/neon/business-partner/src/360/business-partner-360-client.ts"),
    read("../packages/planes/neon/business-partner/src/360/business-partner-360-section-client.ts"),
    read("../packages/planes/neon/business-partner/src/360/business-partner-360.tsx"),
    read("../packages/planes/neon/business-partner/src/360/components/section-navigation.tsx"),
    read("../packages/planes/neon/business-partner/src/styles.css"),
    read("db/migrations/20260830_neon_business_partner_360_release_indexes.sql"),
    read("db/migrations/manifests/neon.txt"),
  ]);
  for (const coordinate of ["tenantId", "principalId", "businessPartnerId", "roleLens", "operatingOrganizationId", "companyCodeId", "legalEntityId", "asOf", "authEpoch"])
    assert.match(summaryClient, new RegExp(`query\\.${coordinate}`));
  assert.match(sectionClient, /query\.cursor/);
  assert.match(shell, /requestAnimationFrame/);
  assert.match(shell, /tabIndex=\{-1\}/);
  assert.match(navigation, /bp360-nav-picker/);
  assert.match(styles, /min-height:\s*(?:44px|2\.75rem)/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /max-width:\s*20rem/);
  assert.match(styles, /\[dir="rtl"\]/);
  assert.match(migration, /business_partner_request_materialized_partner_idx/);
  assert.match(migration, /certification_current_owner_idx/);
  assert.match(manifest, /20260830_neon_business_partner_360_release_indexes\.sql/);
});

test("BS360-10 records honest release evidence instead of enabling production", async () => {
  const document = await read("../docs/architecture/athyper-business-partner-360-hardening-cutover.md");
  for (const gate of ["Functional", "Data", "Security/privacy", "Contract", "Performance", "Resilience", "UX", "Operations"])
    assert.match(document, new RegExp(`\\| ${gate} \\|`));
  assert.match(document, /Canary enablement and legacy deletion are intentionally not performed/);
  assert.match(document, /EXPLAIN \(ANALYZE, BUFFERS\)/);
});

test("P1 retains reproducible BP360 browser and high-cardinality qualification", async () => {
  const [browser, reader, runner, migration, manifest, evidence] = await Promise.all([
    read("../tests/e2e/production/business-partner-360-qualification.spec.ts"),
    read("packages/services/master-data/src/kysely-business-partner-360-sections.ts"),
    read("db/scripts/run-business-partner-360-performance-evidence.ts"),
    read("db/migrations/20260830_neon_business_partner_360_performance_indexes.sql"),
    read("db/migrations/manifests/neon.txt"),
    read("../perf/qualification/evidence/business-partner-360-high-cardinality.json"),
  ]);
  for (const journey of ["history", "aborted", "historical", "permission loss", "expiry", "caches", "wcag22aa", "first useful identity p75", "summary p95", "section p95"])
    assert.match(browser.toLowerCase(), new RegExp(journey));
  assert.match(reader, /contact_person_id=ANY/);
  assert.match(reader, /subject_address_id=ANY/);
  assert.doesNotMatch(reader, /people\.map\(async/);
  assert.match(runner, /EXPLAIN\(ANALYZE,BUFFERS,FORMAT JSON\)/);
  assert.match(runner, /ROLLBACK/);
  assert.match(migration, /business_partner_identifier_current_cursor_idx/);
  assert.match(manifest, /20260830_neon_business_partner_360_performance_indexes\.sql/);
  const result = JSON.parse(evidence) as {passed:boolean;rolledBack:boolean;fixtureRows:{identifiers:number;requests:number};noNPlusOne:Record<string,boolean>};
  assert.equal(result.passed, true);
  assert.equal(result.rolledBack, true);
  assert.equal(result.fixtureRows.identifiers, 25_000);
  assert.equal(result.fixtureRows.requests, 25_000);
  assert.ok(Object.values(result.noNPlusOne).every(Boolean));
});

test("P1 rehearses BP360 resilience, synthetic alert routing, and accountable approvals", async () => {
  const [runner, alerts, alertTests, routing, dashboard, runbook, releaseGates, approvals, evidence] = await Promise.all([
    read("../scripts/rehearsal/run-business-partner-360-operational-readiness.mjs"),
    read("../stack/config/telemetry/metrics/business-partner-alerts.yml"),
    read("../stack/config/telemetry/metrics/business-partner-360-alert-tests.yml"),
    read("../stack/config/telemetry/alertmanager/config.yml.tpl"),
    read("../stack/config/telemetry/provisioning/dashboards/json/business-partner-360.json"),
    read("../docs/runbooks/business-partner-360-operations.md"),
    read("packages/services/master-data/src/business-partner-360-release-gates.ts"),
    read("../docs/architecture/evidence/business-partner-360-release-approvals.json"),
    read("../docs/architecture/evidence/business-partner-360-operational-readiness.json"),
  ]);
  for (const scenario of ["studio-mesh-cursor-reveal", "permission-epoch-client-invalidation", "failed-materialization-rollback", "prometheus-safe-synthetic-events", "reveal-alert-route"])
    assert.match(runner, new RegExp(scenario));
  assert.match(alerts, /AthyperBusinessPartner360RevealFailureSpike[\s\S]*team: security/);
  assert.match(alertTests, /MESH_TIMEOUT/);
  assert.match(routing, /receiver: security-email/);
  assert.doesNotMatch(dashboard, /businessPartnerId|principalId|accountNumber|nationalId|dateOfBirth|compensation/i);
  assert.match(runbook, /supervised on-call\/support exercise/);
  for (const gate of ["functional", "data", "security_privacy", "contract", "performance", "resilience", "ux", "operations"])
    assert.match(releaseGates, new RegExp(`"${gate}"`));
  const ledger = JSON.parse(approvals) as {approvals:Array<{status:string}>}, result = JSON.parse(evidence) as {technicalPassed:boolean;releaseReady:boolean;approvals:{pending:string[]}};
  assert.ok(ledger.approvals.every((approval) => approval.status === "pending"));
  assert.equal(result.technicalPassed, true);
  assert.equal(result.releaseReady, false);
  assert.equal(result.approvals.pending.length, 8);
});
