import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("P2 rollout controller is named, staged, measured, reversible, and deletion-free", async () => {
  const [controller, observer, evaluator] = await Promise.all([
    read("db/scripts/business-partner-360/manage-business-partner-360-rollout.ts"),
    read("db/scripts/business-partner-360/record-business-partner-360-rollout-observation.ts"),
    read(
      "packages/services/master-data/src/business-partner-360-release-gates.ts",
    ),
  ]);
  for (const action of [
    "enable-internal",
    "promote-canary",
    "promote-broad",
    "rollback",
    "retirement-check",
  ])
    assert.match(controller, new RegExp(`"${action}"`));
  assert.doesNotMatch(controller, /action[^\n]*(?:delete|remove|retire)["']/i);
  const thresholdSource = `${controller}${observer}${evaluator}`.replaceAll(
    "_",
    "",
  );
  for (const threshold of ["60", "1440", "10080", "100", "1000", "10000"])
    assert.ok(thresholdSource.includes(threshold));
  for (const gate of ["P0_NOT_CLOSED", "P1_NOT_RELEASE_READY"])
    assert.match(controller, new RegExp(gate));
  assert.match(observer, /P0 is not closed/);
  assert.match(observer, /P1 is not release ready/);
  assert.match(controller, /pg_advisory_xact_lock/);
  assert.match(observer, /Prometheus returned no finite sample/);
  assert.match(controller, /deletionAvailable:false/);
});

test("P2 keeps retirement fail-closed while the legacy aggregate boundary exists", async () => {
  const [dashboard, legacyRoute, evaluator] = await Promise.all([
    read(
      "../stack/config/telemetry/provisioning/dashboards/json/business-partner-360.json",
    ),
    read(
      "packages/services/master-data/src/business-partner-request-routes.ts",
    ),
    read(
      "packages/services/master-data/src/business-partner-360-release-gates.ts",
    ),
  ]);
  assert.match(dashboard, /get-aggregate/);
  assert.match(legacyRoute, /aggregate360\?\.legacyAggregate/);

  for (const reason of [
    "LEGACY_TRAFFIC_PRESENT",
    "KNOWN_CONSUMERS_REMAIN",
    "OBSERVATION_WINDOW_INCOMPLETE",
    "TELEMETRY_RETENTION_INSUFFICIENT",
    "TRAFFIC_EVIDENCE_MISSING",
    "ZERO_CALL_WINDOW_INVALID",
    "ROLLBACK_NOT_APPROVED",
    "OWNER_APPROVALS_INCOMPLETE",
  ])
    assert.match(evaluator, new RegExp(`reasons\\.push\\("${reason}"\\)`));
  assert.match(evaluator, /approved:\s*reasons\.length === 0/);
});

test("P2 operational controller remains aligned with the canonical release evaluator", async () => {
  const [controller, observer, evaluator] = await Promise.all([
    read("db/scripts/business-partner-360/manage-business-partner-360-rollout.ts"),
    read("db/scripts/business-partner-360/record-business-partner-360-rollout-observation.ts"),
    read(
      "packages/services/master-data/src/business-partner-360-release-gates.ts",
    ),
  ]);
  for (const imported of [
    "evaluateBusinessPartner360Approvals",
    "evaluateBusinessPartner360Release",
    "evaluateBusinessPartner360Retirement",
  ])
    assert.match(controller, new RegExp(imported));
  for (const token of [
    "500",
    "750",
    "75*1024",
    "100*1024",
    "0.01",
    "0.05",
    "60",
    "1_000",
    "10_000",
    "30",
    "OWNER_APPROVALS_INCOMPLETE",
  ])
    assert.ok(
      `${observer}${evaluator}`
        .replaceAll(" ", "")
        .replaceAll("_", "")
        .includes(token.replaceAll("_", "")),
      `rollout threshold drifted: ${token}`,
    );
});

test("BS360-10 instruments bounded operations without subject dimensions", async () => {
  const [routes, host, alerts, dashboard] = await Promise.all([
    read("packages/services/master-data/src/business-partner-360-routes.ts"),
    read("apps/platform-host/src/composition/register-services.ts"),
    read("../stack/config/telemetry/metrics/business-partner-alerts.yml"),
    read(
      "../stack/config/telemetry/provisioning/dashboards/json/business-partner-360.json",
    ),
  ]);
  for (const metric of [
    "request_total",
    "duration_ms",
    "payload_bytes",
    "completeness_total",
    "redaction_total",
    "reveal_total",
    "mesh_fallback_total",
  ])
    assert.match(host, new RegExp(`athyper_bp360_${metric}`));
  assert.match(routes, /safeTelemetryFacts/);
  assert.doesNotMatch(
    host,
    /attributes\.(?:businessPartnerId|principalId|cursor|purpose)/,
  );
  assert.match(alerts, /BusinessPartner360SummaryLatencyHigh/);
  assert.match(alerts, /> 500/);
  assert.match(alerts, /BusinessPartner360MeshFallbackHigh/);
  assert.match(dashboard, /Legacy aggregate calls/);
  JSON.parse(dashboard);
});

test("BS360-10 keeps rollout dark and retirement separately gated", async () => {
  const [seed, gates, legacy] = await Promise.all([
    read("db/ddl/planes/neon/control/12_business_partner_360_feature_seed.sql"),
    read(
      "packages/services/master-data/src/business-partner-360-release-gates.ts",
    ),
    read(
      "packages/services/master-data/src/business-partner-request-routes.ts",
    ),
  ]);
  assert.match(seed, /neon\.business_partner\.view_360/);
  assert.match(seed, /rollout_pct[^;]*0/s);
  assert.match(seed, /DO UPDATE SET[\s\S]*metadata =/);
  assert.doesNotMatch(seed, /DO UPDATE SET[\s\S]*rollout_pct\s*=/);
  for (const threshold of [
    "summaryP95Ms>500",
    "sectionP95Ms>750",
    "observationDays<30",
    "legacyCalls!==0",
  ])
    assert.ok(gates.replaceAll(" ", "").includes(threshold));
  assert.match(legacy, /aggregate360\?\.legacyAggregate/);
  assert.match(gates, /ZERO_CALL_WINDOW_INVALID/);
  assert.match(gates, /TELEMETRY_RETENTION_INSUFFICIENT/);
});

test("BS360-10 adds exact caller keys, responsive accessibility, and justified indexes", async () => {
  const [
    summaryClient,
    sectionClient,
    shell,
    navigation,
    styles,
    migration,
    manifest,
  ] = await Promise.all([
    read(
      "../packages/planes/neon/business-partner/src/360/business-partner-360-client.ts",
    ),
    read(
      "../packages/planes/neon/business-partner/src/360/business-partner-360-section-client.ts",
    ),
    read(
      "../packages/planes/neon/business-partner/src/360/business-partner-360.tsx",
    ),
    read(
      "../packages/planes/neon/business-partner/src/360/components/section-navigation.tsx",
    ),
    read("../packages/planes/neon/business-partner/src/styles.css"),
    read(
      "db/migrations/20260830_neon_business_partner_360_release_indexes.sql",
    ),
    read("db/migrations/manifests/neon.txt"),
  ]);
  for (const coordinate of [
    "tenantId",
    "principalId",
    "businessPartnerId",
    "roleLens",
    "operatingOrganizationId",
    "companyCodeId",
    "legalEntityId",
    "asOf",
    "authEpoch",
  ])
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
  assert.match(
    manifest,
    /20260830_neon_business_partner_360_release_indexes\.sql/,
  );
});

test("BS360-10 keeps production enablement and deletion fail-closed in executable controls", async () => {
  const [seed, controller, gates] = await Promise.all([
    read("db/ddl/planes/neon/control/12_business_partner_360_feature_seed.sql"),
    read("db/scripts/business-partner-360/manage-business-partner-360-rollout.ts"),
    read(
      "packages/services/master-data/src/business-partner-360-release-gates.ts",
    ),
  ]);
  assert.match(seed, /rollout_pct[^;]*0/s);
  for (const gate of [
    "functional",
    "data",
    "security_privacy",
    "contract",
    "performance",
    "resilience",
    "ux",
    "operations",
  ])
    assert.match(gates, new RegExp(`"${gate}"`));
  assert.match(controller, /P0_NOT_CLOSED/);
  assert.match(controller, /P1_NOT_RELEASE_READY/);
  assert.match(controller, /deletionAvailable:false/);
  assert.doesNotMatch(controller, /DELETE\s+FROM/i);
});

test("P1 retains reproducible BP360 browser and high-cardinality qualification", async () => {
  const [browser, reader, runner, migration, manifest, evidence] =
    await Promise.all([
      read(
        "../tests/e2e/production/business-partner-360-qualification.spec.ts",
      ),
      read(
        "packages/services/master-data/src/kysely-business-partner-360-sections.ts",
      ),
      read("db/scripts/business-partner-360/run-business-partner-360-performance-evidence.ts"),
      read(
        "db/migrations/20260830_neon_business_partner_360_performance_indexes.sql",
      ),
      read("db/migrations/manifests/neon.txt"),
      read(
        "../perf/qualification/evidence/business-partner-360-high-cardinality.json",
      ),
    ]);
  for (const journey of [
    "history",
    "aborted",
    "historical",
    "permission loss",
    "expiry",
    "caches",
    "wcag22aa",
    "first useful identity p75",
    "summary p95",
    "section p95",
  ])
    assert.match(browser.toLowerCase(), new RegExp(journey));
  assert.match(reader, /contact_person_id=ANY/);
  assert.match(reader, /subject_address_id=ANY/);
  assert.doesNotMatch(reader, /people\.map\(async/);
  assert.match(runner, /EXPLAIN\(ANALYZE,BUFFERS,FORMAT JSON\)/);
  assert.match(runner, /ROLLBACK/);
  assert.match(migration, /business_partner_identifier_current_cursor_idx/);
  assert.match(
    manifest,
    /20260830_neon_business_partner_360_performance_indexes\.sql/,
  );
  const result = JSON.parse(evidence) as {
    passed: boolean;
    rolledBack: boolean;
    fixtureRows: { identifiers: number; requests: number };
    noNPlusOne: Record<string, boolean>;
  };
  assert.equal(result.passed, true);
  assert.equal(result.rolledBack, true);
  assert.equal(result.fixtureRows.identifiers, 25_000);
  assert.equal(result.fixtureRows.requests, 25_000);
  assert.ok(Object.values(result.noNPlusOne).every(Boolean));
});

test("P1 rehearses BP360 resilience, synthetic alert routing, and accountable approvals", async () => {
  const [runner, alerts, alertTests, routing, dashboard, releaseGates] =
    await Promise.all([
      read(
        "../scripts/rehearsal/run-business-partner-360-operational-readiness.mjs",
      ),
      read("../stack/config/telemetry/metrics/business-partner-alerts.yml"),
      read(
        "../stack/config/telemetry/metrics/business-partner-360-alert-tests.yml",
      ),
      read("../stack/config/telemetry/alertmanager/config.yml.tpl"),
      read(
        "../stack/config/telemetry/provisioning/dashboards/json/business-partner-360.json",
      ),
      read(
        "packages/services/master-data/src/business-partner-360-release-gates.ts",
      ),
    ]);
  for (const scenario of [
    "studio-mesh-cursor-reveal",
    "permission-epoch-client-invalidation",
    "failed-materialization-rollback",
    "prometheus-safe-synthetic-events",
    "reveal-alert-route",
  ])
    assert.match(runner, new RegExp(scenario));
  assert.match(
    alerts,
    /AthyperBusinessPartner360RevealFailureSpike[\s\S]*team: security/,
  );
  assert.match(alertTests, /MESH_TIMEOUT/);
  assert.match(routing, /receiver: security-email/);
  assert.doesNotMatch(
    dashboard,
    /businessPartnerId|principalId|accountNumber|nationalId|dateOfBirth|compensation/i,
  );
  for (const gate of [
    "functional",
    "data",
    "security_privacy",
    "contract",
    "performance",
    "resilience",
    "ux",
    "operations",
  ])
    assert.match(releaseGates, new RegExp(`"${gate}"`));
  assert.match(runner, /releaseReady:[\s\S]*approvals\.complete/);
  assert.match(runner, /pending\.length === 0 && invalid\.length === 0/);
});
