import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { accessInsertionSql } from "./access-sql.mjs";
import { sql, fingerprint } from "./protected-reveal-client.mjs";
const sha = (x) => createHash("sha256").update(x).digest("hex"),
  old = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-finance-reveal-execution-20260912.proposal.dev.json",
    ),
  ),
  manifestPath =
    "governance/policy/reports/business-partner-affordance-count-candidate-20260912.dev.json",
  m = JSON.parse(fs.readFileSync(manifestPath));
const inv = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-protected-reveal-final-access-20260912.dev.json",
  ),
).captures.find(
  (c) => c.container === "athyper-bp-enter-db" && c.plane === "neon",
);
const fresh = (b) => ({
  ...b,
  roleId: randomUUID(),
  groupId: randomUUID(),
  assignmentId: randomUUID(),
  code: "bp.affordance.count." + b.account.split(".")[1] + "." + b.purpose,
});
const batches = old.batches
  .filter((b) =>
    ["reads", "source", "reveals", "company-reads"].includes(b.purpose),
  )
  .map((b) =>
    fresh({
      ...b,
      permissions:
        b.purpose === "company-reads"
          ? b.permissions.filter((p) =>
              p.code.endsWith(".customer_company_read"),
            )
          : b.permissions,
    }),
  );
const caseRead = old.batches.find(
  (b) => b.account === "catl.admin" && b.purpose === "case-read",
);
batches.push(fresh(caseRead));
const create = inv.catalog.find(
  (p) => p.code === "neon.relationship.entity_case.create",
);
assert(
  create &&
    create.scopes.some(
      (s) =>
        s.status === "active" &&
        s.scopeKind === caseRead.scope.scope_kind &&
        s.propagation === caseRead.propagation,
    ),
);
batches.push(
  fresh({ ...caseRead, purpose: "case-create", permissions: [create] }),
);
const p = {
  schemaVersion: 1,
  kind: "isolated_neon_ui_reveal_and_open_work_execution",
  approved: false,
  applied: false,
  tenantId: old.tenantId,
  releaseId: old.releaseId,
  artifactHash: old.artifactHash,
  runtimeImage: m.runtimeImage,
  uiImage: m.uiImage,
  previousRuntimeImage: m.previousRuntimeImage,
  previousUiImage: m.previousUiImage,
  releaseSetHash: m.releaseSetHash,
  artifacts: m.artifacts,
  candidateManifest: manifestPath,
  candidateManifestSha256: sha(fs.readFileSync(manifestPath)),
  destination: old.destination,
  effectiveFrom: "2026-09-12T07:15:00.000Z",
  effectiveUntil: "2026-09-12T08:00:00.000Z",
  scopeRegistrations: [],
  batches,
  permissionAssignments: batches.reduce((n, b) => n + b.permissions.length, 0),
  fixtures: {
    businessPartnerId: "01a092d1-8242-7948-9ce9-6f19c38c4b27",
    protectedBankLinkId: "b19c9b40-398c-4b73-a5c4-e2d13f541532",
    taxRegistrationId: "bfd7ff75-099b-49d9-af07-924469922db0",
    operatingOrganizationId: "a478f9c0-8226-5d22-9599-b8fb27a45180",
    companyCodeId: "793b6cb3-3c61-57c0-9562-2cbc288bd4cf",
  },
  ordinaryDrafts: {
    count: 2,
    kind: "deactivate",
    submissionAuthorized: false,
    approvalAuthorized: false,
    applicationAuthorized: false,
    retention:
      "Retain two synthetic draft requests and genuine draft-command/snapshot/audit history; do not submit, approve, or apply them. Existing BP remains active.",
  },
  qualification: [
    "Normal authenticated admin and owner UI sessions; admin has separate reveal authority, owner does not",
    "Bank and tax reveal buttons, confirmation, selected context, expiry and denied retry",
    "Create two ordinary draft requests through the governed API; verify positive rows and active counts for admin, zero for parent-only owner",
    "Revoke case/reveal access between read and execution; verify counts and commands deny; revoke all new access",
    "Preserve the existing 66-disposition acceptance on its exact reviewed release; record new candidate comparison evidence without manufacturing acceptance",
  ],
  boundaries: {
    access:
      "NEW explicitly approved groups only. No old revoked/expired membership or assignment may be restored or extended.",
    scope:
      "Tenant-scoped BP reads apply across isolated CirrusAtlantic; source BP/reveal and case-create/read cover the selected operating-organization subtree; customer-company read is exact selected company. Fixture restrictions are operator discipline, not record-level grants.",
    ui: "Deploy the reviewed standalone NEON workspace build only to the isolated UI. No shared DEV publication is authorized by this proposal.",
    cleanup:
      "Revoke these new memberships/assignments after qualification, no later than 16:00 MYT. Preserve signed artifacts, accepted dispositions and approval history.",
  },
  enforcementActivationAuthorized: false,
  compatibilityRetirementAuthorized: false,
  dispositionAcceptanceAuthorized: false,
};
p.proposalRevision = sha(JSON.stringify(p));
const out =
  "governance/policy/reviews/business-partner-affordance-count-execution-20260912.proposal.dev.json";
fs.writeFileSync(out, JSON.stringify(p, null, 2) + "\n", { flag: "wx" });
const before = fingerprint();
const result = sql(accessInsertionSql(p) + "ROLLBACK;");
assert.deepEqual(fingerprint(), before);
const report = {
  createdAt: new Date().toISOString(),
  proposalRevision: p.proposalRevision,
  passed: true,
  rollbackOnly: true,
  grantsApplied: false,
  counts: JSON.parse(result.trim()),
};
assert.equal(report.counts.permissionAssignments, p.permissionAssignments);
fs.writeFileSync(
  "governance/policy/reports/business-partner-affordance-count-access-rehearsal-20260912.dev.json",
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
const md = `# UI reveal affordances and ordinary open-work qualification\n\nProposal revision **${p.proposalRevision}**. Prepared; no execution access has been added.\n\nThe 66 dispositions were explicitly accepted at revision 589733af… and recorded with 66 accepted / zero pending. This proposal does not reopen or fabricate that acceptance.\n\nEngineering is complete in local preview: reveal permissions now run the existing non-mutating command preflight; tax affordances depend on authorization rather than storage flags; bank accounts without a protected token do not offer an unavailable reveal. The UI clears values on expiry, denied retry, scope/record/permission change, and aborts stale requests. Tests cover these boundaries. The backend and NEON production build pass; both preview canaries return health 200.\n\nTwo ordinary draft requests created through the production repository and governed SQL command produced authorized row/count pairs 1/1, 2/2 and 0/0. Revocation during aggregation rejected the response. All preview drafts, snapshots and command records rolled back. This is SQL engineering evidence, not authenticated execution qualification.\n\n- Candidate backend: ${p.runtimeImage}\n- Candidate UI: ${p.uiImage}\n- Backend release set: ${p.releaseSetHash}\n- Five Studio-signed artifacts remain unchanged.\n- Access window: **15:15–16:00 MYT, 12 September 2026**.\n- **${p.permissionAssignments} permission assignments in ${p.batches.length} new groups/memberships/role assignments**.\n\nBoth accounts receive tenant BP reads, organization-scoped source BP read and exact selected-company customer read. Only admin receives source/target bank and tax reveals, ordinary-case read and ordinary-case create. Owner is the parent-only denial control. No owner case permission, Finance, Atlas, submit, approve, materialize or direct BP mutation permission is included.\n\nThe new case-create grant supports two **unsubmitted deactivation-request drafts** for the synthetic BP. They will never be submitted, approved or applied. The BP remains active. Drafts and genuine command/snapshot/audit history will be retained and inventoried. All new access is revoked after the checks or by 16:00, whichever comes first. Previously revoked/expired grants remain untouched.\n\nApproval covers the exact candidate images and these new isolated execution assignments. It does not authorize shared DEV publication, enforcement activation, compatibility retirement, or extension of access. The full standalone UI comes from the current NEON workspace; it is reviewed as an isolated candidate, not claimed as a narrowly patched production UI bundle.\n\n[Exact permissions and bindings](../../${out}) · [SQL preview](../../governance/policy/reports/business-partner-positive-open-work-preview-20260912.dev.json) · [Access insertion rollback](../../governance/policy/reports/business-partner-affordance-count-access-rehearsal-20260912.dev.json)\n`;
fs.writeFileSync(
  "docs/reviews/business-partner-affordance-count-execution-20260912.md",
  md,
  { flag: "wx" },
);
console.log({
  proposalRevision: p.proposalRevision,
  permissions: p.permissionAssignments,
  batches: p.batches.length,
  rehearsalPassed: true,
});
