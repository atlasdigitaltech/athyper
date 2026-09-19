// Explicit named grant proposal. No approvals, provisioning or activation are performed.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
if (process.argv.length !== 2) throw Error("No apply mode");
const read = (p) => JSON.parse(readFileSync(p)),
  hash = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const exact = read(
    "governance/policy/reports/business-partner-exact-release.dev.json",
  ),
  gaps = read(
    "governance/policy/reviews/business-partner-release-19-qualification-grant-gaps.dev.json",
  );
if (exact.coordinate.releaseId !== gaps.releaseId)
  throw Error("Release source mismatch");
const tenant = gaps.tenantId,
  accounts = ["catl.admin", "catl.owner"];
const query = `BEGIN READ ONLY; SELECT jsonb_build_object('principals',(SELECT jsonb_agg(jsonb_build_object('id',id,'account',code,'status',status)) FROM master.principal WHERE tenant_id='${tenant}' AND code IN ('catl.admin','catl.owner')),'permissions',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'code',p.canonical_code,'status',p.status,'scopeKinds',(SELECT jsonb_agg(s.scope_kind::text ORDER BY s.scope_kind::text) FROM authz.permission_scope_kind s WHERE s.permission_id=p.id AND s.status='active'))) FROM authz.permission p WHERE p.canonical_code LIKE 'neon.relationship.bp_target.%'),'scopeTargets',(SELECT jsonb_agg(jsonb_build_object('id',id,'kind',scope_kind,'targetId',target_id)) FROM authz.scope_target WHERE tenant_id='${tenant}' AND scope_kind='tenant' AND target_id='${tenant}' AND status='active')); COMMIT;`;
const output = execFileSync(
  "docker",
  [
    "exec",
    "athyper-dev-db-1",
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    query,
  ],
  { encoding: "utf8" },
);
const live = JSON.parse(
  output.split("\n").find((line) => line.startsWith("{")),
);
if (
  live.principals?.length !== 2 ||
  live.principals.some((p) => p.status !== "active") ||
  live.scopeTargets?.length !== 1
)
  throw Error("Named principal/scope prerequisites changed");
const operations = exact.source.compiled_json.authorization.operations;
const rows = gaps.permissions.map((p) => {
  const op = operations.find(
      (o) => o.key === p.operation && o.permissionCode === p.permissionCode,
    ),
    permission = live.permissions.find(
      (x) => x.id === p.permissionId && x.code === p.permissionCode,
    );
  if (
    !op ||
    permission?.status !== "published" ||
    JSON.stringify([...permission.scopeKinds].sort()) !==
      JSON.stringify([...p.catalogScopeKinds].sort())
  )
    throw Error("Permission/catalog compatibility changed");
  const propose =
    op.effect === "read" &&
    op.scope === "tenant.record.v1" &&
    op.key !== "export";
  return {
    operation: op.key,
    permissionId: permission.id,
    permissionCode: permission.code,
    effect: op.effect,
    resolver: op.scope,
    disposition: propose
      ? "propose_named_read_assignment"
      : "no_new_grant_pending_separate_review",
    proposedAccounts: propose ? accounts : [],
    reason: propose
      ? "Read-only tenant BP access through existing field/provider policies; no reveal or mutation capability."
      : "Separate review for data egress, import, reveal or organization/company ownership; existing grants are not revoked.",
  };
});
const permissions = rows
  .filter((r) => r.proposedAccounts.length)
  .map((r) => ({
    id: r.permissionId,
    code: r.permissionCode,
    operation: r.operation,
  }));
const id = (label) => {
  const h = createHash("sha256")
    .update("bp.r19.shared-reader.v1:" + tenant + ":" + label)
    .digest("hex");
  return (
    h.slice(0, 8) +
    "-" +
    h.slice(8, 12) +
    "-5" +
    h.slice(13, 16) +
    "-a" +
    h.slice(17, 20) +
    "-" +
    h.slice(20, 32)
  );
};
const inventory = read(
  "governance/policy/reports/business-partner-target-assignment-current.dev.json",
);
const affected = [
  ...new Map(
    inventory.candidates
      .filter((r) => r.tenant_id === tenant)
      .map((r) => [
        r.principal_id,
        { principalId: r.principal_id, account: r.principal_code },
      ]),
  ).values(),
];
const body = {
  schemaVersion: 1,
  kind: "bp_release_19_named_tenant_read_grant_proposal",
  environment: "dev",
  plane: "neon",
  tenantId: tenant,
  releaseId: gaps.releaseId,
  artifactHash: gaps.artifactHash,
  effectiveFrom: "2026-09-11T00:00:00Z",
  effectiveUntil: "2026-12-10T00:00:00Z",
  role: { id: id("role"), code: "bp.r19.shared_reader.pilot.v1", permissions },
  group: {
    id: id("group"),
    code: "bp.r19.shared_reader.pilot.v1",
    members: live.principals.map((p) => ({
      principalId: p.id,
      account: p.account,
    })),
  },
  assignment: {
    id: id("assignment"),
    scopeTargetId: live.scopeTargets[0].id,
    scopeKind: "tenant",
    targetId: tenant,
    propagationMode: "exact",
  },
  rows,
  explicitAccessExpansion:
    "These are NEW tenant-wide read grants for both named users, not conversions of their organization grants. They cover all BP records in CirrusAtlantic; no record-only pilot restriction is claimed.",
  conditions: {
    existingGrants:
      "Retain; no updates, removals or restoration of existing grants.",
    mfa: "Normal owning-service assurance policies remain mandatory; a role assignment does not enforce step-up.",
    fieldPolicy:
      "Existing canonical mask, reveal, query-use and independent-provider policies remain enforced. No unmask capability is included.",
    separationOfDuties:
      "Existing maker/approver/applier rules remain. This role grants no command authority.",
    membership:
      "Only the two listed principals; no nested groups or automatic future members.",
    rollback:
      "Revoke only newly provisioned bindings. Preserve subsequent revocations and denials; never restore a snapshot.",
    dates:
      "Apply within this window only; later changes require a new proposal revision.",
  },
  activationImpact: {
    existingTenantCandidates: affected,
    notIncludedInReadProposal: affected.filter(
      (p) => !accounts.includes(p.account),
    ),
    blocker:
      "Entity/plane activation affects the whole selected tenant population. This two-user proposal alone cannot preserve legacy access for the other users; their dispositions must be resolved explicitly without an allow union.",
  },
  approvals: [],
  applySupported: false,
  activationReady: false,
};
const proposalRevision = hash(body),
  path =
    "governance/policy/reviews/business-partner-target-read-grants.proposal.dev.json";
writeFileSync(
  path,
  JSON.stringify({ ...body, proposalRevision }, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    path,
    proposalRevision,
    readPermissions: permissions.length,
    principals: 2,
    separatelyReviewedRows: rows.length - permissions.length,
    otherTenantPrincipals:
      body.activationImpact.notIncludedInReadProposal.length,
    grantsChanged: false,
  }),
);
