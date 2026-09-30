import fs from "node:fs";
import { randomUUID, createHash } from "node:crypto";
const path =
  "governance/policy/reviews/business-partner-enter-test-access.proposal.dev.json";
if (fs.existsSync(path)) throw Error("Preserve proposal");
const inventory = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-enter-qualification-access.dev.json",
  ),
);
const c = inventory.captures.find(
  (x) => x.container === "athyper-bp-enter-db" && x.plane === "neon",
);
const exact = JSON.parse(
    fs.readFileSync(
      "governance/policy/reports/business-partner-enter-correction-exact-release.dev.json",
    ),
  ),
  ops = exact.source.compiled_json.authorization.operations;
const reads = ops
  .filter(
    (o) =>
      o.effect === "read" &&
      o.scope === "tenant.record.v1" &&
      o.key !== "export",
  )
  .map((o) => o.permissionCode);
if (reads.length !== 17) throw Error("Read selection changed");
const scope = (kind) => {
  const s = c.scopeTargets.filter(
    (s) => s.scope_kind === kind && s.status === "active",
  );
  if (s.length !== 1) throw Error("Ambiguous scope");
  return s[0];
};
const batch = (account, purpose, kind, codes) => ({
  account,
  principalId: c.principals.find(
    (p) => p.code === account && p.status === "active",
  ).id,
  purpose,
  roleId: randomUUID(),
  groupId: randomUUID(),
  assignmentId: randomUUID(),
  code: "bp.enter.test." + account.split(".")[1] + "." + purpose,
  scope: scope(kind),
  propagation: kind === "tenant" ? "exact" : "subtree",
  permissions: codes.map((code) => {
    const p = c.catalog.find(
      (p) => p.code === code && p.status === "published",
    );
    if (
      !p ||
      !p.scopes.some(
        (s) =>
          s.scopeKind === kind &&
          ["exact", "subtree"].includes(s.propagation) &&
          s.status === "active",
      )
    )
      throw Error("Catalog incompatible: " + code);
    return p;
  }),
});
const p = {
  schemaVersion: 1,
  kind: "isolated_bp_qualification_access",
  tenantId: exact.coordinate.tenantId,
  releaseId: exact.coordinate.releaseId,
  artifactHash:
    "45ddc85ece1f453e84b1eccc0cea9ca141fe9847c68ab7d2500e7d347d7b75fc",
  image:
    "sha256:671d0d5abecbfc16790e2d8e643222171eed8d1b5ab485b3b4048b466439fc47",
  destination: {
    container: "athyper-bp-enter-db",
    network: "athyper-bp-enter-isolated",
    database: "athyper_neon",
  },
  effectiveFrom: "2026-09-11T10:30:00Z",
  effectiveUntil: "2026-09-11T14:30:00Z",
  batches: [
    batch("catl.admin", "reads", "tenant", reads),
    batch("catl.owner", "reads", "tenant", reads),
    batch("catl.admin", "transfers", "tenant", [
      "neon.relationship.bp_target.import",
      "neon.relationship.bp_target.export",
    ]),
    batch(
      "catl.admin",
      "requests",
      "operating_organization",
      ["create", "read", "update", "validate", "submit", "materialize"].map(
        (k) => "neon.relationship.entity_case." + k,
      ),
    ),
    batch(
      "catl.owner",
      "approval",
      "operating_organization",
      ["read", "decide"].map((k) => "neon.relationship.entity_case." + k),
    ),
  ],
  conditions: {
    mfa: "Preserve catalog flags per permission; case.decide requires MFA. Normal route/workflow step-up remains enforced. No extra grant-level MFA condition is implied.",
    separationOfDuties:
      "catl.admin creates/submits/applies; catl.owner decides; existing maker/approver/applier checks remain mandatory.",
    propagation:
      "Tenant grants are exact-only. Case grants use operating-organization subtree as required by the existing catalog: selected organization and its descendants. Current captured scope inventory has one organization; future descendants would be included during this temporary window.",
    resourceBoundary:
      "Tenant reads/transfers affect authorized BP data throughout this isolated tenant. entity_case grants cover generic governed cases within the selected organization; IAM does not limit these permission codes to BP or particular test records.",
    testDiscipline:
      "Use newly created test records and cases only; this is an operator restriction, not a per-record grant condition.",
    sourceConstraints:
      "Current source denials and conditions remain; no legacy allow grants are automatically added.",
    cleanup:
      "Revoke only these new memberships and assignments after testing, or expire at the exact end; never restore old grants.",
  },
  excluded: [
    "Shared DEV grants and activation",
    "Sensitive reveals",
    "Company-scoped permissions: no active company scope target exists",
    "Company-owned pilot and independent-child grants until exact published policies/scopes are qualified",
    "Supplier qualification administration",
    "Approval of 66 policy dispositions",
    "Expired/revoked test grants",
  ],
  sharedGrantChanges: [],
  activationAuthorized: false,
  approved: false,
};
p.proposalRevision = createHash("sha256")
  .update(JSON.stringify(p))
  .digest("hex");
fs.writeFileSync(path, JSON.stringify(p, null, 2) + "\n");
console.log({
  proposalRevision: p.proposalRevision,
  batches: p.batches.length,
  permissionAssignments: p.batches.reduce(
    (n, b) => n + b.permissions.length,
    0,
  ),
  windowMYT: "11 September 18:30–22:30",
  applied: false,
});
