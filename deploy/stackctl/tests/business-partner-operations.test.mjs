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
  "Oldest open request (seconds)", "Request failure rate", "Workflow SLA schedule and DLQ",
  "Materialization failures", "Invitation abuse rejections", "Outbox lag (seconds)",
  "Quarantine and poison messages", "IAM drift and fencing", "MESH reconciliation drift",
  "Runtime readiness failures",
];

test("instance and operations alert catalogs retain every P9 signal", () => {
  for (const relative of [
    "deploy/compose/instance/config/prometheus/business-partner-rules.yaml",
    "deploy/compose/operations/config/business-partner-rules.yaml",
  ]) {
    const document = YAML.parse(readFileSync(join(defaultRepoRoot, relative), "utf8"));
    const alerts = document.groups.flatMap((group) => group.rules.map((rule) => rule.alert));
    for (const alert of requiredAlerts) assert.ok(alerts.includes(alert), `${relative} is missing ${alert}`);
  }
});

test("provisioned P9 dashboards retain every required operational panel", () => {
  for (const relative of [
    "deploy/compose/instance/config/grafana/provisioning/dashboards/json/business-partner-p9.json",
    "deploy/compose/operations/config/grafana/dashboards/json/business-partner-p9.json",
  ]) {
    const dashboard = JSON.parse(readFileSync(join(defaultRepoRoot, relative), "utf8"));
    const titles = dashboard.panels.map((panel) => panel.title);
    assert.deepEqual(titles, requiredPanels);
  }
});

test("invitation guard and request-age source metrics are registered", () => {
  const host = readFileSync(join(defaultRepoRoot, "server/apps/platform-host/src/composition/register-services.ts"), "utf8");
  const routes = readFileSync(join(defaultRepoRoot, "server/packages/services/master-data/src/business-partner-invitation-routes.ts"), "utf8");
  const collector = readFileSync(join(defaultRepoRoot, "server/apps/platform-host/src/monitoring/business-partner-metrics.ts"), "utf8");
  assert.match(host, /athyper_business_partner_invitation_http_total/u);
  assert.match(collector, /athyper_business_partner_request_oldest_open_seconds/u);
  assert.match(routes, /onRejected\?: \(reason:"payload_too_large"\|"rate_limited"\)/u);
});
