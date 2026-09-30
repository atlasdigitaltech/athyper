import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import YAML from "yaml";
import { defaultRepoRoot } from "../src/io.mjs";

const requiredAlerts = [
  "BusinessPartnerRequestTooOld",
  "BusinessPartnerRequestFailureRate",
  "BusinessPartnerMaterializationFailure",
  "BusinessPartnerInvitationAbuse",
  "BusinessPartnerOutboxLag",
  "BusinessPartnerDeliveryDeadLetter",
  "BusinessPartnerWorkflowSlaWorkerFailure",
  "BusinessPartnerIamDrift",
  "BusinessPartnerReconciliationDrift",
  "BusinessPartnerReadinessFailure",
];

const requiredPanels = [
  "Oldest open request (seconds)",
  "Request failure rate",
  "Workflow SLA schedule and DLQ",
  "Materialization failures",
  "Invitation abuse rejections",
  "Outbox lag (seconds)",
  "Quarantine and poison messages",
  "IAM drift and fencing",
  "MESH reconciliation drift",
  "Runtime readiness failures",
];

test("instance and operations alert catalogs retain every P9 signal", () => {
  for (const relative of [
    "deploy/compose/instance/config/prometheus/business-partner-rules.yaml",
    "deploy/compose/operations/config/business-partner-rules.yaml",
  ]) {
    const document = YAML.parse(
      readFileSync(join(defaultRepoRoot, relative), "utf8"),
    );
    const alerts = document.groups.flatMap((group) =>
      group.rules.map((rule) => rule.alert),
    );
    for (const alert of requiredAlerts)
      assert.ok(alerts.includes(alert), `${relative} is missing ${alert}`);
  }
});

test("provisioned P9 dashboards retain every required operational panel", () => {
  for (const relative of [
    "deploy/compose/instance/config/grafana/provisioning/dashboards/json/business-partner-p9.json",
    "deploy/compose/operations/config/grafana/dashboards/json/business-partner-p9.json",
  ]) {
    const dashboard = JSON.parse(
      readFileSync(join(defaultRepoRoot, relative), "utf8"),
    );
    const titles = dashboard.panels.map((panel) => panel.title);
    assert.deepEqual(titles, requiredPanels);
  }
});

// The bespoke invitation route and metrics source were removed in 870f08f52.
// Retained dashboard/alert artifacts are tested above; no live BP metric claim.
