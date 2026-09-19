import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { sql, fingerprint } from "./neon-final-client.mjs";
const read = (p) => JSON.parse(fs.readFileSync(p)),
  sha = (b) => createHash("sha256").update(b).digest("hex");
const old = read(
  "governance/policy/reviews/business-partner-neon-final-execution-20260912.proposal.dev.json",
);
const manifestPath =
    "governance/policy/reports/business-partner-finance-reveal-candidate-v2-20260912.dev.json",
  manifest = read(manifestPath);
const inventory = read(
  "governance/policy/reports/business-partner-finance-reveal-access-inventory-20260912.dev.json",
).captures.find(
  (c) => c.container === "athyper-bp-enter-db" && c.plane === "neon",
);
assert.equal(inventory.assignments.filter((a) => a.activePath).length, 0);
const migration = fs.readFileSync(manifest.migration.path, "utf8");
const before = fingerprint();
const finance = JSON.parse(
  sql(
    "BEGIN;SET LOCAL app.database_plane='neon';" +
      migration +
      "SELECT jsonb_build_object('id',p.id,'code',p.canonical_code,'kind',p.permission_kind,'status',p.status,'requires_mfa',p.requires_mfa,'requires_sod',p.requires_sod,'risk_tier',p.risk_tier,'scopes',jsonb_build_array(jsonb_build_object('scopeKind','company_code','propagation','exact','status','active'))) FROM authz.permission p WHERE canonical_code='finance.ledger.business_partner_activity.read';ROLLBACK;",
  ),
);
assert.deepEqual(fingerprint(), before);
const renewIdentity = (b) => ({
  ...b,
  roleId: randomUUID(),
  groupId: randomUUID(),
  assignmentId: randomUUID(),
  code: b.code.replace("bp.neon.final.", "bp.finance.reveal."),
});
const batches = old.batches.map(renewIdentity);
const organization = batches.find((b) => b.purpose === "case-read").scope,
  company = batches.find((b) => b.purpose === "company-reads").scope;
function batch(account, purpose, scope, propagation, codes) {
  return renewIdentity({
    account,
    principalId: inventory.principals.find((p) => p.code === account).id,
    purpose,
    scope,
    propagation,
    code: "bp.neon.final." + account.split(".")[1] + "." + purpose,
    permissions: codes.map((code) => {
      const p =
        code === finance.code
          ? finance
          : inventory.catalog.find(
              (p) => p.code === code && p.status === "published",
            );
      assert(
        p?.scopes.some(
          (s) =>
            s.scopeKind === scope.scope_kind &&
            s.propagation === propagation &&
            s.status === "active",
        ),
      );
      return p;
    }),
  });
}
batches.push(
  batch("catl.admin", "source", organization, "subtree", [
    "neon.relationship.business_partner.read",
    "neon.relationship.business_partner_bank.reveal",
    "neon.relationship.business_partner_tax.reveal",
  ]),
  batch("catl.owner", "source", organization, "subtree", [
    "neon.relationship.business_partner.read",
  ]),
  batch("catl.admin", "finance-activity", company, "exact", [finance.code]),
);
const fixturePath =
  "tooling/scripts/verification/isolated-enter/finance-activity-final-fixture.sql";
const p = {
  schemaVersion: 1,
  kind: "isolated_neon_finance_reveal_qualification",
  approved: false,
  applied: false,
  tenantId: old.tenantId,
  releaseId: old.releaseId,
  artifactHash: old.artifactHash,
  previousRuntimeImage: manifest.previousRuntimeImage,
  runtimeImage: manifest.runtimeImage,
  releaseSetHash: manifest.releaseSetHash,
  artifacts: manifest.artifacts,
  candidateManifest: manifestPath,
  candidateManifestSha256: sha(fs.readFileSync(manifestPath)),
  destination: old.destination,
  effectiveFrom: "2026-09-12T06:00:00.000Z",
  effectiveUntil: "2026-09-12T08:00:00.000Z",
  scopeRegistrations: [],
  batches,
  permissionAssignments: batches.reduce((n, b) => n + b.permissions.length, 0),
  referenceMigration: manifest.migration,
  fixtures: old.fixtures,
  additionalFixtures: {
    path: fixturePath,
    sha256: sha(fs.readFileSync(fixturePath)),
    records:
      "1 synthetic draft GL account, 3 unposted draft journals, 6 journal lines; fixture provisioner attribution; no posting lifecycle claimed",
    retention:
      "Retain synthetic drafts as qualification history; include exact IDs in cleanup receipt.",
  },
  conditions: {
    ...old.conditions,
    sourceIntersection:
      "Add current source BP read to both actors at the selected operating-organization subtree. Add source bank/tax reveal to admin only at that subtree; existing target grants, MFA, claims and audit remain required.",
    finance:
      "Only admin receives finance.ledger.business_partner_activity.read at CirrusAtlantic UK exact company scope. This is a new Accounting-owned medium-risk reference. No finance.ledger.read or posting permission is granted. Owner is the independent denial control.",
    cleanup:
      "Revoke all 13 NEW memberships/assignments as soon as checks finish, no later than 16:00 MYT. Never restore or extend prior access. Retain catalog definitions, revoked history and inventoried synthetic drafts.",
  },
  qualification: [
    "Positive source/target-intersected bank and tax reveals and owner denial",
    "Positive company reads with compatible selection and stale/wrong-company rejection",
    "Populated Finance journal SQL-filtered counts and independent Finance denial",
    "Independent children, scoped Atlas, staged live revocation and compatible recovery",
    "Capture final release comparisons for 66 dispositions; seek separate explicit acceptance",
  ],
  excluded: [
    ...old.excluded.filter((x) => x !== "Company lifecycle command grants"),
    "Company lifecycle command grants",
    "General ledger access",
    "Posted journal business workflow",
    "Publication of a new NEON UI image",
  ],
  enforcementActivationAuthorized: false,
  compatibilityRetirementAuthorized: false,
  dispositionAcceptanceAuthorized: false,
};
p.proposalRevision = sha(JSON.stringify(p));
fs.writeFileSync(
  "governance/policy/reviews/business-partner-finance-reveal-execution-20260912.proposal.dev.json",
  JSON.stringify(p, null, 2) + "\n",
  { flag: "wx" },
);
console.log({
  proposalRevision: p.proposalRevision,
  batches: batches.length,
  permissionAssignments: p.permissionAssignments,
  runtimeImage: p.runtimeImage,
  grantsApplied: false,
});
