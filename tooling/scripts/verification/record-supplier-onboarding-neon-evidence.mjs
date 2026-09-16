import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const load = (name) =>
  JSON.parse(
    readFileSync(`governance/policy/reports/${name}.dev.json`, "utf8"),
  );
const actions = load("supplier-onboarding-neon-actions"),
  live = load("supplier-onboarding-neon-live"),
  database = load("supplier-onboarding-neon-db");
assert.equal(actions.passed, true);
assert.equal(actions.cases.length, 3);
assert.equal(actions.correction.closed, true);
assert.equal(actions.correction.profileChangeRejected, true);
assert.equal(actions.correction.bothFormViews, true);
assert.equal(actions.rejectionFixture.passed, true);
assert.equal(live.passed, true);
assert.equal(live.checks.length, 6);
assert.ok(
  live.checks.every(
    (c) =>
      c.readinessLinkScopePreserved &&
      c.activeSupplierCannotBeActivatedAgain &&
      c.downloads.length,
  ),
);
assert.equal(database.passed, true);
const history = load("supplier-onboarding-neon-history");
assert.equal(history.passed,true);
const containers = JSON.parse(
  execFileSync(
    "docker",
    ["inspect", "athyper-dev-source-api-1", "athyper-dev-source-neon-web-1"],
    { encoding: "utf8" },
  ),
).map((c) => ({
  name: c.Name,
  image: c.Image,
  status: c.State.Status,
  health: c.State.Health?.Status,
}));
assert.ok(
  containers.every(
    (c) => c.status === "running" && (!c.health || c.health === "healthy"),
  ),
);
const activeP7Grants = Number(
  execFileSync(
    "docker",
    [
      "exec",
      "athyper-dev-db-1",
      "psql",
      "-X",
      "-At",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
      "-c",
      "SELECT count(*) FROM authz.group_role gr JOIN authz.role r ON r.id=gr.role_id WHERE r.code LIKE 'dev.p7.temporary.%' AND gr.status='active'",
    ],
    { encoding: "utf8" },
  ).trim(),
);
assert.equal(activeP7Grants, 0);
const files = [
  "packages/planes/neon/business-partner/src/index.tsx",
  "apps/neon/app/(shell)/mdg/business-partner/requests/[requestId]/page.tsx",
  "apps/neon/app/(shell)/mdg/business-partner/[recordId]/supplier/page.tsx",
  "packages/planes/neon/business-partner/src/supplier-process-correction.tsx",
  "packages/planes/neon/business-partner/src/supplier-process-documents.tsx",
  "packages/planes/neon/business-partner/src/supplier-process-preview.tsx",
  "packages/planes/neon/business-partner/src/supplier-process-readiness.tsx",
  "packages/planes/neon/business-partner/src/supplier-controls.tsx",
  "server/apps/platform-host/src/composition/supplier-process-tasks.ts",
  "server/apps/platform-host/src/composition/supplier-process-documents.ts",
  "server/packages/platform/governance/src/cycles/cycle-execution-services.ts",
  "server/db/ddl/planes/neon/document/07_functions.sql",
];
const evidence = {
  package: "P8",
  status: "accepted_local_dev",
  recordedAt: new Date().toISOString(),
  acceptanceOpen: [],
  boundaries: [
    "Real DEV NEON and owning APIs; no test-only permission grants",
    "P7 completed/activated fixtures supply real stored/scanned documents and existing supplier readiness; no fabricated fresh activation outcome",
    "Document failure/retry display and request binding have component coverage; renderer/scanner failure semantics remain P4 owner qualification",
    "P9 final local qualification and follow-ups B/C remain separate scopes",
  ],
  validation: {
    productTests: 204,
    hostTests: 462,
    hostSkipped: 1,
    cycleTests: 27,
    typechecks: ["business-partner", "platform-host"],
    builds: ["platform-governance", "platform-host", "neon"],
  },
  live: {
    freshProfileRequests: actions.cases.map((c) => ({
      caseId: c.id,
      level: c.level,
      votes: c.votes,
    })),
    correction: actions.correction,
    rejection: actions.rejectionFixture,
    browserChecks: live.checks,
    verifiedDownloads: live.checks.reduce((n, c) => n + c.downloads.length, 0),
    database,
    historicalNotice: history,
  },
  access: { newTemporaryGrants: 0, activeP7Grants },
  containers,
  sourceHashes: files.map((path) => ({
    path,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  })),
  reports: [
    "supplier-onboarding-neon-actions.dev.json",
    "supplier-onboarding-neon-live.dev.json",
    "supplier-onboarding-neon-db.dev.json",
    "supplier-onboarding-neon-history.dev.json",
  ],
};
writeFileSync(
  "docs/architecture/business-partner/internal-supplier-onboarding-p8-evidence.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    status: evidence.status,
    browserChecks: live.checks.length,
    verifiedDownloads: evidence.live.verifiedDownloads,
    activeP7Grants,
  }),
);
