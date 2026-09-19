import assert from "node:assert/strict";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const root = "governance/policy/reports";
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const hash = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const latest = (stage) => {
  const directory = readdirSync(`${root}/p9`)
    .filter((name) => name.endsWith(`-${stage}`))
    .sort()
    .at(-1);
  assert.ok(directory, `Missing ${stage} stage`);
  const path = join(root, "p9", directory, "report.json"),
    report = read(path);
  assert.equal(report.passed, true, `Latest ${stage} stage failed: ${path}`);
  assert.ok(report.steps.length && report.steps.every((step) => step.passed));
  return { path, sha256: hash(path), ...report };
};
const stages = Object.fromEntries(
  ["build", "tests", "clean", "database", "browser", "communications"].map(
    (stage) => [stage, latest(stage)],
  ),
);
function artifact(stage, source) {
  const match = stages[stage].steps
    .flatMap((step) => step.evidence)
    .find((e) => e.source.endsWith(source));
  assert.ok(match, `Missing fresh ${source}`);
  const path = join(stages[stage].path, "..", match.artifact);
  assert.equal(hash(path), match.sha256);
  return read(path);
}
const clean = artifact("clean", "supplier-onboarding-p9-clean.dev.json");
assert.equal(clean.passed, true);
assert.equal(clean.removed, true);
assert.equal(clean.nativeForm.passed, true);
assert.equal(clean.inventory.reviewerAssignments, 1);
assert.equal(clean.catalog.result, "published");
assert.equal(clean.catalogReplay.result, "replayed");
assert.equal(
  clean.runtime.appliedReleaseId,
  clean.runtimeReplay.appliedReleaseId,
);
const minimum = artifact("database", "supplier-onboarding-p9-minimum.dev.json");
assert.equal(minimum.passed, true);
assert.equal(minimum.checks.length, 2);
const browser = artifact("browser", "supplier-onboarding-p9-browser.dev.json");
assert.equal(browser.passed, true);
assert.equal(browser.checks.length, 6);
const notices = artifact(
  "communications",
  "supplier-communications-activation-notices.dev.json",
);
assert.equal(notices.passed, true);
assert.equal(notices.checks.length, 3);
const fixtures = read(`${root}/supplier-onboarding-p9-fixtures.dev.json`);
assert.equal(fixtures.passed, true);
assert.equal(fixtures.cases.length, 3);
assert.ok(
  fixtures.checks.some(
    (c) => c.invalidRequirementRejected && c.trustedProfileInjectionRejected,
  ),
);
const caseIds = [
  ...new Set(
    [
      ...fixtures.cases.map((c) => c.id),
      fixtures.incomplete,
      ...fixtures.checks.flatMap((c) => [
        c.id,
        c.incompleteDraft,
        c.draftChange,
        c.intercompany,
      ]),
    ].filter(Boolean),
  ),
];
for (const id of caseIds) assert.match(id, /^[0-9a-f-]{36}$/);
const query = (sql) =>
  JSON.parse(
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
        "-Atc",
        sql,
      ],
      { encoding: "utf8" },
    ),
  );
const drafts = query(
  `SELECT json_build_object('cases',(SELECT count(*) FROM document.entity_case WHERE id=ANY(ARRAY[${caseIds.map((id) => `'${id}'::uuid`).join(",")}])), 'attempts',(SELECT count(*) FROM governance.process_attempt WHERE case_id=ANY(ARRAY[${caseIds.map((id) => `'${id}'::uuid`).join(",")}])), 'documentJobs',(SELECT count(*) FROM governance.process_document_job WHERE case_id=ANY(ARRAY[${caseIds.map((id) => `'${id}'::uuid`).join(",")}])) )`,
);
assert.equal(drafts.cases, caseIds.length);
assert.equal(drafts.attempts, 0);
assert.equal(drafts.documentJobs, 0);
const closedIds = [
  "a87e6353-40bf-4184-9768-bbd4a0e9a166",
  "4d575964-d3ae-4b03-8014-59e3923c667c",
  "cb43c12e-d6a7-4cdb-8c12-5c5f541109e8",
];
const committed = query(
  `SELECT json_agg(x) FROM (SELECT c.id,c.status case_status,r.status run_status,s.status supplier_status,(SELECT count(*) FROM governance.process_document_job j WHERE j.tenant_id=c.tenant_id AND j.case_id=c.id AND j.status='ready') ready_documents FROM document.entity_case c JOIN governance.process_attempt a ON a.tenant_id=c.tenant_id AND a.case_id=c.id JOIN governance.cycle_run r ON r.tenant_id=a.tenant_id AND r.id=a.cycle_run_id JOIN master.supplier s ON s.tenant_id=c.tenant_id AND s.business_partner_id=c.target_entity_id WHERE c.id IN (${closedIds.map((id) => `'${id}'`).join(",")})) x`,
);
assert.equal(committed.length, 3);
assert.ok(
  committed.every(
    (c) =>
      c.case_status === "materialized" &&
      c.run_status === "completed" &&
      c.supplier_status === "active" &&
      c.ready_documents === 3,
  ),
);
const temporaryGrants = query(
  "SELECT count(*) FROM authz.group_role gr JOIN authz.role r ON r.id=gr.role_id WHERE r.code LIKE 'dev.p%.temporary.%' AND gr.status='active'",
);
assert.equal(temporaryGrants, 0);
const containers = JSON.parse(
  execFileSync(
    "docker",
    [
      "inspect",
      "athyper-dev-source-api-1",
      "athyper-dev-source-neon-web-1",
      "athyper-dev-source-worker-1",
      "athyper-dev-source-scheduler-1",
    ],
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
assert.equal(
  execFileSync(
    "docker",
    ["ps", "-aq", "--filter", "name=athyper-bs360-supplier-p9-"],
    { encoding: "utf8" },
  ).trim(),
  "",
);
const entryReceipt = stages.browser.steps
  .flatMap((step) => step.evidence)
  .find((e) => e.source.endsWith("business-partner-360-restoration.dev.json"));
const recordEntryPath = entryReceipt
  ? join(stages.browser.path, "..", entryReceipt.artifact)
  : `${root}/business-partner-360-restoration.dev.json`;
const recordEntry = read(recordEntryPath);
assert.equal(
  recordEntry.passed,
  true,
  "The real partner record must open the 360 screen",
);
assert.ok(
  recordEntry.text.includes("360 View") &&
    recordEntry.text.includes("Roles & scope"),
);
const sourceFiles = [
  "server/db/ddl/planes/neon/_manifest.txt",
  "server/db/ddl/planes/neon/control/12_reference_seed.sql",
  "server/db/ddl/planes/neon/control/16_supplier_communications_reference_seed.sql",
  "server/db/scripts/provisioning/provision-development-business-partner-runtime.ts",
  "server/db/scripts/provisioning/business-partner-compliance-requirement.ts",
  "server/apps/platform-host/src/provisioning/supplier-process-catalog.ts",
  "server/packages/services/publication/src/business-partner-foundation-definition.ts",
  "packages/planes/neon/business-partner/src/request-form-descriptor.ts",
  "packages/planes/neon/business-partner/src/index.tsx",
  ...readdirSync("tooling/scripts/verification")
    .filter(
      (name) => name.includes("onboarding-p9") && /\.(mts|mjs)$/.test(name),
    )
    .map((name) => `tooling/scripts/verification/${name}`),
];
const inherited = ["p1", "p1a", "p5", "p6", "p7", "p8"].map(
  (p) =>
    `docs/architecture/business-partner/internal-supplier-onboarding-${p}-evidence.json`,
);
const testCounts = stages.tests.steps.reduce(
  (total, step) => {
    const log = readFileSync(join(stages.tests.path, "..", step.log), "utf8");
    const passed =
      log.match(/Tests\s+(\d+) passed/) ?? log.match(/ℹ pass (\d+)/);
    assert.ok(passed, `Missing test count for ${step.log}`);
    const skipped =
      log.match(/Tests[^\n]*?(\d+) skipped/) ?? log.match(/ℹ skipped (\d+)/);
    return {
      passed: total.passed + Number(passed[1]),
      skipped: total.skipped + Number(skipped?.[1] ?? 0),
    };
  },
  { passed: 0, skipped: 0 },
);
const evidence = {
  package: "P9",
  status: "accepted_local_dev",
  recordedAt: new Date().toISOString(),
  acceptanceOpen: [],
  boundaries: [
    "Local Increment A purchasing pilot; follow-ups B and C excluded.",
    "Clean Studio/NEON PostgreSQL foundations, canonical tenant authorization, saved/validated/compiled native forms, runtime publication/replay and profile/policy/document catalogs are reproduced in an isolated socket-only container. No second application deployment or Keycloak realm is created.",
    "Fresh DEV drafts and real browser/owning API checks are combined with retained P7 approved/materialized/activated/completed cases; no fresh privileged activation or new live grants are claimed.",
    "Task and minimum-control fault/correction fixtures use controlled authorization/document-ready ports with real PostgreSQL owners and rollback. Final browser evidence uses real rendered/scanned/stored PDFs for all three purposes.",
    "Payment/bank readiness retains P6's governed, rolled-back fixture boundary; external Mesh bank intake and external email-provider delivery are not claimed.",
    "Mailpit and owning inbox rechecks inspect existing committed activation notices without sweeping or sending new notices.",
  ],
  validation: {
    testsPassed: testCounts.passed,
    testsSkipped: testCounts.skipped,
    databaseSuites: stages.database.steps.length,
    browserJourneys: browser.checks.length,
    pdfDownloads: browser.checks.reduce((n, c) => n + c.downloads.length, 0),
    activationNoticeChecks: notices.checks.length,
  },
  stages,
  fixtures: {
    report: `${root}/supplier-onboarding-p9-fixtures.dev.json`,
    sha256: hash(`${root}/supplier-onboarding-p9-fixtures.dev.json`),
    cases: fixtures.cases.map(({ id, level, validatedVersion }) => ({
      id,
      level,
      validatedVersion,
    })),
    checks: fixtures.checks,
    database: drafts,
  },
  recordEntry360: {
    path: recordEntryPath,
    sha256: hash(recordEntryPath),
    ...recordEntry,
  },
  committed,
  access: { newLiveGrants: 0, temporaryGrants },
  containers,
  sourceHashes: sourceFiles.map((path) => ({ path, sha256: hash(path) })),
  inheritedEvidence: inherited.map((path) => ({ path, sha256: hash(path) })),
};
writeFileSync(
  "docs/architecture/business-partner/internal-supplier-onboarding-p9-evidence.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    status: evidence.status,
    ...evidence.validation,
    temporaryGrants,
  }),
);
