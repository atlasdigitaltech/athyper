import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertAuthorityUnchanged } from "./dependency-authority-check.mjs";
const base = "governance/policy/reports/";
const names = [
  "business-partner-dependency-final-commands-20260912.dev.json",
  "business-partner-dependency-reads-20260912.dev.json",
  "business-partner-dependency-final-export-ai-20260912.dev.json",
  "business-partner-child-context-browser-20260912.dev.json",
  "business-partner-record-browser-20260912.dev.json",
  "business-partner-dependency-artifact-verification-1789168786752.dev.json",
  "business-partner-dependency-projection-1789168885691.dev.json",
  "business-partner-dependency-execution-deployment-20260912.dev.json",
  "business-partner-isolated-360-feature-20260912.dev.json",
];
const reports = names.map((name) => ({
  name,
  data: JSON.parse(fs.readFileSync(base + name)),
  sha256: createHash("sha256")
    .update(fs.readFileSync(base + name))
    .digest("hex"),
}));
const [commands, reads, transfers, child, record] = reports.map((r) => r.data);
assert.ok(
  commands.commandJourneyCompleted &&
    commands.importQualified &&
    commands.deferredDirectWritesRejected,
);
assert.ok(commands.checks.every((c) => c.passed));
assert.ok(reads.checks.every((c) => c.passed) && !reads.failure);
assert.ok(transfers.exportQualified && transfers.aiRetrievalQualified);
assert.equal(transfers.workerReceipt.releaseSet, commands.releaseSet);
assert.ok(child.selectionLoadedExpectedCase && child.requiredStateRendered);
assert.ok(record.checks.includes("section_fields_rendered"));
for (const r of [reads, transfers, record])
  assert.equal(r.releaseSet, commands.releaseSet);
const images = JSON.parse(
  cp.execFileSync(
    "docker",
    [
      "inspect",
      "athyper-bp-enter-api",
      "athyper-bp-enter-worker",
      "athyper-bp-enter-neon-ui",
    ],
    { encoding: "utf8" },
  ),
).map((c) => ({ name: c.Name, image: c.Image, running: c.State.Running }));
assert.ok(images.every((c) => c.running));
assert.ok(images.slice(0, 2).every((c) => c.image === commands.image));
const db = JSON.parse(
  cp.execFileSync(
    "docker",
    [
      "exec",
      "athyper-bp-enter-db",
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
      "-c",
      "SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'function',p.proname,'definitionHash',md5(pg_get_functiondef(p.oid))) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='document' AND p.prokind='f' AND (p.proname LIKE '%guard%' OR p.proname LIKE '%lifecycle%')",
    ],
    { encoding: "utf8" },
  ),
);
const sourceFiles = [
  "server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260912_runtime_contract_code_identity.sql",
  "server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260912_case_validation_guard.sql",
  "server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260912_neon_case_lifecycle_restore.sql",
  "server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260912_invalidation_scope_regex.sql",
  "server/db/ddl/planes/neon/_manifest.txt",
];
const sourceHashes = sourceFiles.map((path) => ({
  path,
  sha256: createHash("sha256").update(fs.readFileSync(path)).digest("hex"),
}));
const out = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  status: "dependency-and-bounded-business-journey-milestone-passed",
  fullMigrationClosed: false,
  releaseSet: commands.releaseSet,
  artifactHash: commands.artifactHash,
  recordId: commands.appliedCase.targetBusinessPartnerId,
  images,
  authority: assertAuthorityUnchanged(),
  databaseFunctions: db,
  sourceHashes,
  evidence: reports.map(({ name, sha256 }) => ({ path: base + name, sha256 })),
  passed: {
    commands: commands.checks.length,
    apiReads: reads.checks.length,
    exportAndAi: transfers.checks.length,
    childRequiredCoordinateSelector: true,
    recordContactsAddresses: true,
  },
  remaining: [
    "Nonempty sensitive-field masking and separately authorized reveal journeys",
    "Company-owned setup-request pilot and broader ownership journeys",
    "Compatible artifact/image/binding recovery and fresh live-revocation qualification",
    "Renewed acceptance of the 66 policy dispositions",
    "Temporary access and isolated fixture cleanup",
  ],
  excludedFromTheseReceipts: [
    "Full Atlas model conversations",
    "Cross-instance revocation synchronization",
    "Shared DEV enforcement activation",
  ],
  temporaryAccessExpiresAt: "2026-09-12T01:15:00Z",
  temporaryAccessRenewed: false,
  sharedDevChanged: false,
  qualificationNotes: [
    "Business-activity provider returns 409 without transaction coordinates; positive transaction-context activity remains unqualified.",
    "Initial export missing pinned-worker receipt is preserved; source compiler worker was stopped and a fresh export passed.",
    "Initial browser timeout identified disabled BP360 feature; isolated UI flag is now enabled and captured separately.",
    "Approved case and import histories are retained as isolated qualification evidence.",
  ],
};
const path = base + "business-partner-dependency-milestone-20260912.dev.json";
fs.writeFileSync(path, JSON.stringify(out, null, 2) + "\n", { flag: "wx" });
console.log({ report: path, status: out.status, passed: out.passed });
