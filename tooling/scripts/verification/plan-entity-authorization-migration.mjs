// Proposal/dry run only. This module has no database writer or activation path.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [inventoryPath, profilePath, output] = process.argv.slice(2);
if (!inventoryPath || !profilePath || !output)
  throw new Error(
    "Usage: node plan-entity-authorization-migration.mjs <inventory.json> <profile.json> <output.json>",
  );
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8")),
  profile = JSON.parse(readFileSync(profilePath, "utf8"));
if (inventory.schemaVersion !== 1 || profile.schemaVersion !== 1)
  throw new Error("Unsupported input version");
const plane = inventory.planes.find((p) => p.plane === profile.planeKey);
if (!plane) throw new Error("Plane is absent from inventory");
const descriptors = plane.entities.filter(
  (e) => e.entityCode === profile.entityCode,
);
const bpGrants = plane.grants.filter(
  (g) =>
    g.permission_code.startsWith("neon.relationship.") ||
    g.permission_code.startsWith("neon.supplier.") ||
    g.permission_code.startsWith("neon.customer."),
);
const candidateRoles = [
  ...new Set(
    bpGrants
      .filter((g) => /admin|steward/i.test(g.role_code))
      .map((g) => g.role_code),
  ),
].sort();
const report = {
  schemaVersion: 1,
  kind: "proposal_and_dry_run",
  environment: inventory.environment,
  entityCode: profile.entityCode,
  planeKey: profile.planeKey,
  generatedAt: new Date().toISOString(),
  inventorySha256: createHash("sha256")
    .update(readFileSync(inventoryPath))
    .digest("hex"),
  profileFileSha256: createHash("sha256")
    .update(readFileSync(profilePath))
    .digest("hex"),
  effectiveGrantsChanged: false,
  grantChanges: [],
  candidateRoles: candidateRoles.map((role) => ({
    role,
    recommendation:
      "Review as a candidate only; no automatic global stewardship",
  })),
  mappingReview: {
    status: "pending",
    requiredResponsibilities: [
      "directory_reader",
      "global_steward",
      "organization_requester",
      "company_administrator",
      "bank_custodian",
      "approver",
    ],
    namedAssignments: [],
  },
  descriptorPlans: descriptors.map((d) => ({
    descriptorHash: d.descriptorHash,
    contractHash: d.contractHash,
    releaseId: d.releaseId,
    missingOperations: profile.operations
      .filter((o) => !d.operations?.[o.key])
      .map((o) => ({ key: o.key, permissionCode: o.permissionCode })),
    permissionMismatches: profile.operations
      .filter(
        (o) =>
          d.operations?.[o.key] &&
          d.operations[o.key].permissionCode !== o.permissionCode,
      )
      .map((o) => o.key),
    unmappedLegacyOperations: Object.keys(d.operations ?? {}).filter(
      (key) => !profile.operations.some((o) => o.key === key),
    ),
    unmappedFields: d.fields
      .filter(
        (f) => !profile.fieldPolicies.some((g) => g.fields.includes(f.key)),
      )
      .map((f) => f.key),
  })),
  observedGrantBoundaries: [
    ...new Set(bpGrants.map((g) => g.scope_kind)),
  ].sort(),
  activation: {
    eligible: false,
    selectedMode: "legacy",
    blockers: [
      "Named steward/requester mapping is not reviewed; effective grants remain unchanged",
      "Published operation/permission/scope bindings require a compatible reviewed release",
      "Full BP provider/command integration and authenticated persona parity evidence are required",
      "Company entity and independent-child fixtures are not deployed service qualification",
      "Signed activation/rollback evidence and current revocation watermark are required",
    ],
  },
  rollback: {
    status: "plan_only",
    retain: "Current compatible descriptor/binding/runtime set",
    restoreGrants: false,
    rule: "Do not restore historical grant snapshots. Revalidate current denials and revocations before selecting prior compatible artifacts.",
  },
  compatibilityRetirement: {
    eligible: false,
    reason: "Retain existing paths until reviewed parity and full coverage",
  },
};
mkdirSync(dirname(resolve(output)), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    output,
    candidateRoles: candidateRoles.length,
    descriptorPlans: report.descriptorPlans.length,
    activationEligible: false,
    effectiveGrantsChanged: false,
  }),
);
