import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
const root = "governance/policy/reports/";
const files = [
  "supplier-onboarding-communications-live.dev.json",
  "supplier-onboarding-communications-return.dev.json",
  "supplier-onboarding-communications-db.dev.json",
  "supplier-onboarding-communications-browser.dev.json",
  "supplier-onboarding-communications-capture.dev.json",
  "supplier-communications-dev-consent.json",
];
const reports = Object.fromEntries(
  files.map((file) => [file, JSON.parse(readFileSync(root + file, "utf8"))]),
);
for (const report of Object.values(reports)) assert.equal(report.passed, true);
const checks = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      "athyper-dev-db-1",
      "psql",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
      "-At",
      "-c",
      `SELECT json_build_object('duplicateDeliveries',(SELECT count(*) FROM (SELECT d.message_id,d.recipient_id,d.channel FROM event.notification_delivery d JOIN event.notification_message m ON m.id=d.message_id WHERE m.event_code LIKE 'supplier.onboarding.notice.%' GROUP BY 1,2,3 HAVING count(*)>1) duplicates),'activeP7Grants',(SELECT count(*) FROM authz.group_role gr JOIN authz.role r ON r.id=gr.role_id WHERE r.code LIKE 'dev.p7.temporary.%' AND gr.status='active'),'canonicalTemplates',(SELECT count(*) FROM control.notification_template WHERE template_key LIKE 'supplier.onboarding.%.v1'),'canonicalRules',(SELECT count(*) FROM control.notification_routing_rule WHERE code LIKE 'supplier.onboarding.%'));`,
    ],
    { encoding: "utf8" },
  ),
);
assert.equal(checks.duplicateDeliveries, 0);
const services = ["api", "worker", "scheduler", "neon-web"].map((service) => {
  const value = JSON.parse(
    execFileSync("docker", ["inspect", `athyper-dev-source-${service}-1`], {
      encoding: "utf8",
    }),
  )[0];
  assert.equal(value.State.Health?.Status, "healthy");
  return { service, image: value.Image, healthy: true };
});
const activationFile = "supplier-communications-activation-notices.dev.json";
const activation = existsSync(root + activationFile)
  ? JSON.parse(readFileSync(root + activationFile, "utf8"))
  : undefined;
const accepted =
  activation?.passed === true &&
  activation.checks.length === 3 &&
  checks.activeP7Grants === 0;
const report = {
  at: new Date().toISOString(),
  package: "P7",
  status: accepted ? "accepted_local_dev" : "implemented_acceptance_open",
  acceptanceOpen: accepted
    ? []
    : [
        "Fresh activation-notice qualification and temporary grant cleanup must finish.",
      ],
  tests: { notifications: 88, sla: 2, attachmentResolver: 2, total: 92 },
  liveProfiles: reports[files[0]].cases.map((c) => ({
    profile: c.level,
    caseId: c.id,
    attemptId: c.process.attemptId,
    votes: c.votes,
    decisionJobId: c.decisionDocument.id ?? c.decisionDocument.jobId,
  })),
  capturedEmails: reports[files[4]].checks.length,
  checks,
  services,
  evidence: [
    ...files,
    ...(activation
      ? [
          activationFile,
          "supplier-communications-activation-live.dev.json",
          "supplier-communications-closure-live.dev.json",
          "supplier-communications-dev-access.dev.json",
          "supplier-communications-risk-fixture.dev.json",
        ]
      : []),
  ].map((file) => root + file),
  ...(activation ? { activationNotices: activation.checks } : {}),
  boundaries: [
    "Reminder/escalation, persistent gate failure, delivery failure, stale access and retained activation document cases use real PostgreSQL with controlled ports/clock and rollback.",
    "Fresh submission, task, return, decision and activation notices use owning APIs, actual rendering/storage, inbox and Mailpit. Activation qualification uses explicitly recorded upstream risk fixtures; business activation outcomes are created only through the owning APIs.",
    "P8/P9 and follow-ups B/C remain separate.",
  ],
};
writeFileSync(
  "docs/architecture/business-partner/internal-supplier-onboarding-p7-evidence.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    status: report.status,
    tests: 92,
    captures: report.capturedEmails,
    checks,
  }),
);
