import fs from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { sql, fingerprint } from "./finance-reveal-client.mjs";
const file =
    "tooling/scripts/verification/isolated-enter/create-protected-bank-fixture-20260912.sql",
  before = fingerprint();
sql(
  "BEGIN;" +
    fs.readFileSync(file, "utf8") +
    "SET CONSTRAINTS ALL IMMEDIATE;ROLLBACK;",
);
assert.deepEqual(fingerprint(), before);
const parent = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-finance-reveal-execution-20260912.proposal.dev.json",
    ),
  ),
  manifestPath =
    "governance/policy/reports/business-partner-protected-values-candidate-20260912.dev.json",
  m = JSON.parse(fs.readFileSync(manifestPath)),
  sha = (b) => createHash("sha256").update(b).digest("hex");
const p = {
  schemaVersion: 1,
  kind: "isolated_neon_reveal_runtime_dependency_amendment",
  approved: false,
  applied: false,
  parentProposalRevision: parent.proposalRevision,
  tenantId: parent.tenantId,
  previousRuntimeImage: m.previousRuntimeImage,
  runtimeImage: m.runtimeImage,
  releaseSetHash: m.releaseSetHash,
  artifacts: m.artifacts,
  candidateManifest: manifestPath,
  candidateManifestSha256: sha(fs.readFileSync(manifestPath)),
  effectiveFrom: parent.effectiveFrom,
  effectiveUntil: parent.effectiveUntil,
  auditMigration: m.auditMigration,
  bankFixtureMigration: { path: file, sha256: sha(fs.readFileSync(file)) },
  bankFixture: {
    accountId: "b19c9b40-398c-4b73-a5c4-e2d13f541531",
    linkId: "b19c9b40-398c-4b73-a5c4-e2d13f541532",
    businessPartnerId: "01a092d1-8242-7948-9ce9-6f19c38c4b27",
    verified: false,
  },
  secret: {
    ...m.secretStore,
    reference: m.secretReference,
    valueClass: "One public synthetic IBAN fixture; no customer data",
    overwriteExisting: false,
    retention:
      "Retain this synthetic secret while the associated test bank fixture is retained; inventory both as qualification artifacts.",
  },
  network:
    "Only a new TLS pass-through relay joins isolated and dev app networks; API/worker remain exclusively isolated. Existing shared containers unchanged.",
  access:
    "Use only existing parent-approved access until 16:00 MYT. Add, renew, extend or restore no grants.",
  sharedDevException:
    "Create one dedicated synthetic fixture secret in the existing dev Infisical project. Existing secrets and shared DEV application data/access remain unchanged.",
  activationAuthorized: false,
  compatibilityRetirementAuthorized: false,
  dispositionAcceptance: false,
};
p.proposalRevision = sha(JSON.stringify(p));
fs.writeFileSync(
  "governance/policy/reviews/business-partner-protected-values-amendment-20260912.proposal.dev.json",
  JSON.stringify(p, null, 2) + "\n",
  { flag: "wx" },
);
console.log({
  proposalRevision: p.proposalRevision,
  runtimeImage: p.runtimeImage,
  bankFixtureRehearsalPassed: true,
  grantsChanged: false,
});
