import {
  assessNamedRoleReview,
  proposalHash,
  candidateId,
} from "./named-role-review.mjs";
const domains = ["business", "security"];
const scopeOf = (c) => ({
  kind: c.scope_kind,
  targetId: c.scope_entity_id,
  scopeTargetId: c.scope_target_id,
  propagationMode: c.propagation_mode,
});
export const rowRevision = (packet, item) =>
  proposalHash({
    candidateId: item.candidateId,
    sourceSha256: packet.sourceSha256,
    proposal: item.proposal,
  });

/** Recommendations only. Membership contents are not effective permissions or steward authority. */
export function recommendNamedRoles(inventory, original, sourceSha256, window) {
  if (original.sourceSha256 !== sourceSha256) throw Error("Inventory changed");
  if (original.items.some((i) => i.approvals?.length))
    throw Error(
      "Preserve reviewed packet; recommendations require an unapproved revision",
    );
  if (
    !Number.isFinite(Date.parse(window.from)) ||
    !Number.isFinite(Date.parse(window.until)) ||
    Date.parse(window.until) <= Date.parse(window.from)
  )
    throw Error("Invalid proposed window");
  const packet = structuredClone(original),
    candidates = new Map(inventory.candidates.map((c) => [candidateId(c), c]));
  packet.recommendationVersion = 1;
  packet.approvalBatches = [];
  packet.items = packet.items.map((item) => {
    const c = candidates.get(item.candidateId);
    if (!c) throw Error("Candidate removed");
    const caps = c.role_permission_codes,
      has = (p) => caps.includes(`neon.relationship.entity_case.${p}`);
    const scope = scopeOf(c),
      responsibilities = [];
    let decision = "retain_legacy_only",
      rationale;
    const add = (responsibility, capabilities) => {
      if (capabilities.length)
        responsibilities.push({
          responsibility,
          capabilities: capabilities.sort(),
          scope,
        });
    };
    const fixture =
      c.role_code.startsWith("acceptance.bp.") &&
      c.scope_key.includes("acceptance.bp.");
    if (fixture) {
      decision = "exclude_from_target";
      rationale =
        "Acceptance fixture role and scope: exclude this test-only combination from the target business responsibility mapping. Existing grants remain untouched; any fixture cleanup requires a separate change.";
    } else if (c.scope_kind === "operating_organization" && has("create")) {
      decision = "approve_responsibilities";
      add(
        "case_requester",
        caps.filter((p) =>
          /^neon\.relationship\.entity_case\.(create|update|validate|submit)$/.test(
            p,
          ),
        ),
      );
      add(
        "case_reader",
        caps.filter((p) => p === "neon.relationship.entity_case.read"),
      );
      if (has("materialize"))
        add("case_applier", ["neon.relationship.entity_case.materialize"]);
      rationale =
        "Map existing organization-scoped case request/read/apply capabilities. Do not assign approver from this mixed administrator combination; preserve its legacy decide and BP mutations pending separate review. An applier cannot apply a case they approved, and cannot approve their own submission.";
    } else if (c.scope_kind === "operating_organization" && has("decide")) {
      decision = "approve_responsibilities";
      add(
        "case_reader",
        caps.filter((p) => p === "neon.relationship.entity_case.read"),
      );
      add("case_approver", ["neon.relationship.entity_case.decide"]);
      rationale =
        "Map the dedicated existing case review responsibility in its exact organization scope. Retain independent work-item assignment and maker/checker authorization; scoped BP read is not promoted to global-record read.";
    } else if (
      c.scope_kind === "operating_organization" &&
      caps.includes("neon.relationship.business_partner.verify_contact")
    ) {
      decision = "approve_responsibilities";
      add("contact_verifier", [
        "neon.relationship.business_partner.verify_contact",
      ]);
      rationale =
        "Map contact verification only at the existing organization target. This confers neither sensitive-value reveal nor global BP write access; target parent admission remains an activation prerequisite.";
    } else if (c.scope_kind === "legal_entity")
      rationale =
        "Retain the existing legacy BP create/update grant only. Legal-entity scope cannot be reinterpreted as company-code scope; a company configurator requires an explicit ownership/capability proposal.";
    else if (c.scope_kind === "tenant")
      rationale =
        "Retain tenant-scoped legacy create/update only. These permissions do not establish steward, global reader, requester, approver or materializer responsibilities.";
    else if (
      item.flags.includes("reader_name_includes_mutation_or_sensitive_access")
    )
      rationale =
        "Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.";
    else if (
      item.flags.includes("sensitive_capabilities_require_separate_review")
    )
      rationale =
        "Retain existing sensitive read/write access pending purpose, data-class and parent-admission review. Do not copy these capabilities into global stewardship or an unrestricted reader responsibility.";
    else
      rationale =
        "Retain scoped legacy root read/update pending resolution of directory/global-read policy and governed mutation capabilities; do not widen scope or infer stewardship.";
    const assigned = new Set(responsibilities.flatMap((r) => r.capabilities));
    item.proposal = {
      decision,
      rationale,
      responsibilities,
      reviewedExistingScope: scope,
      reviewedExistingCapabilities: [...caps].sort(),
      retainedLegacyCapabilities: caps.filter((p) => !assigned.has(p)).sort(),
      legacyGrantEffect: "unchanged",
      assignmentSubject: "this_named_principal_and_current_membership_only",
      conditions:
        decision === "approve_responsibilities"
          ? {
              mfa: "required",
              mfaRationale:
                "Require normal issuer step-up for migrated case commands and contact verification; no local assurance bypass.",
              makerMayApprove: false,
              approverMayApply: false,
              separationOfDuties:
                "Owning command rechecks creator/submitter versus approver, approver versus applier, and current assigned work item on execution.",
              denyAndRevocationPrecedence: true,
              effectiveFrom: window.from,
              effectiveUntil: window.until,
              expiryPolicy: "bounded_pilot_review_required",
              scopeCoverage:
                scope.propagationMode === "subtree"
                  ? "current_and_future_descendants_reviewed"
                  : "exact_target_reviewed",
              activationRequired: true,
              activateWithinWindowOnly: true,
              expiredWindowRequiresNewReview: true,
            }
          : {
              effectiveFrom: window.from,
              effectiveUntil: window.until,
              dateMeaning:
                "Review recommendation window only; no change to existing grant validity, MFA or command conditions.",
              denyAndRevocationPrecedence: true,
            },
      activationPrerequisites:
        decision === "approve_responsibilities"
          ? [
              "Explicit business and security approval of this revision",
              "Compatible published metadata, bindings and runtime",
              "Target parent admission and exact stored/proposed ownership qualification",
              "Authenticated same-phase commands and revocation checks",
              "Separate enforcement approval and audited rollback preserving revocations",
            ]
          : [],
      grantChanges: [],
    };
    const reasons = [];
    if (fixture) reasons.push("test_fixture_exclusion");
    if (item.flags.includes("sensitive_capabilities_require_separate_review"))
      reasons.push("sensitive_or_mixed_reader");
    if (scope.kind === "tenant") reasons.push("global_authority_boundary");
    if (packet.reviewers.some((r) => r.principalId === c.principal_id))
      reasons.push("reviewer_is_assignment_subject");
    item.reviewMode = reasons.length
      ? "individual_exception"
      : "equivalent_batch";
    item.exceptionReasons = reasons;
    item.approvals = [];
    return item;
  });
  if (packet.items.length !== candidates.size)
    throw Error("Candidate coverage mismatch");
  const assessment = assessNamedRoleReview(inventory, packet, sourceSha256);
  const nonApprovalGates = assessment.rows.flatMap((r) =>
    r.gates.filter((g) => !g.endsWith("_approval_missing_or_stale")),
  );
  if (nonApprovalGates.length)
    throw Error(
      `Incomplete recommendations: ${[...new Set(nonApprovalGates)].join(", ")}`,
    );
  packet.batches = buildReviewBatches(packet);
  return packet;
}
export function buildReviewBatches(packet) {
  const groups = new Map();
  for (const item of packet.items) {
    // Different exact targets may share a review template; every target remains explicit and hash-bound below.
    const p = item.proposal,
      template = {
        tenantId: item.tenant.id,
        role: item.role.code,
        scopeKind: item.existingScope.kind,
        propagation: item.existingScope.propagationMode,
        decision: p.decision,
        responsibilities: p.responsibilities.map((r) => ({
          responsibility: r.responsibility,
          capabilities: r.capabilities,
        })),
        conditions: p.conditions,
        retainedLegacyCapabilities: p.retainedLegacyCapabilities,
        reviewMode: item.reviewMode,
        ...(item.reviewMode === "individual_exception"
          ? { candidateId: item.candidateId }
          : {}),
      };
    const key = proposalHash(template),
      group = groups.get(key) ?? {
        batchId: `bp-review-${key.slice(0, 16)}`,
        reviewMode: item.reviewMode,
        tenantId: item.tenant.id,
        roleCode: item.role.code,
        decision: p.decision,
        members: [],
      };
    group.members.push({
      candidateId: item.candidateId,
      principalId: item.principal.id,
      principalCode: item.principal.code,
      groupId: item.group.id,
      groupCode: item.group.code,
      scope: item.existingScope,
      scopeName: item.scopeName,
      proposalSha256: rowRevision(packet, item),
    });
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => {
      g.members.sort((a, b) => a.candidateId.localeCompare(b.candidateId));
      return {
        ...g,
        batchSha256: proposalHash({ sourceSha256: packet.sourceSha256, ...g }),
      };
    })
    .sort((a, b) => a.batchId.localeCompare(b.batchId));
}
/** Records supplied review evidence, never invents it and never changes runtime grants. */
export function recordBatchApproval(inventory, packet, sourceSha256, approval) {
  if (packet.sourceSha256 !== sourceSha256) throw Error("Inventory changed");
  if (
    !approval ||
    approval.decision !== "approve" ||
    !approval.reference?.trim() ||
    !Number.isFinite(Date.parse(approval.approvedAt)) ||
    JSON.stringify([...(approval.domains ?? [])].sort()) !==
      JSON.stringify(domains)
  )
    throw Error("Explicit business and security approval evidence required");
  const current = buildReviewBatches(packet).find(
    (b) => b.batchId === approval.batchId,
  );
  if (!current || current.batchSha256 !== approval.batchSha256)
    throw Error("Batch changed; approve the current exact manifest");
  const reviewer = packet.reviewers.find((r) => r.id === approval.reviewerId);
  if (
    !reviewer?.authorityReference ||
    !reviewer.name ||
    !reviewer.tenantIds.includes(current.tenantId) ||
    domains.some((d) => !reviewer.domains.includes(d))
  )
    throw Error("Reviewer is not nominated for both domains and this tenant");
  if (
    reviewer.assignedBatchIds &&
    !reviewer.assignedBatchIds.includes(current.batchId)
  )
    throw Error("Batch not assigned to reviewer");
  if (
    reviewer.prohibitSelfReview &&
    current.members.some((m) => m.principalId === reviewer.principalId)
  )
    throw Error("Self review prohibited");
  if (
    current.members.some((m) => m.principalId === reviewer.principalId) &&
    approval.selfReviewAcknowledged !== true
  )
    throw Error("Assignment-subject review requires explicit acknowledgement");
  const result = structuredClone(packet);
  for (const member of current.members) {
    const item = result.items.find((i) => i.candidateId === member.candidateId);
    if (item.approvals?.length)
      throw Error(
        "Existing approval preserved; supersession requires a separate reviewed revision",
      );
    item.approvals = domains.map((domain) => ({
      domain,
      reviewerId: approval.reviewerId,
      ...(reviewer.assignedBatchIds
        ? { reviewerAuthoritySha256: proposalHash(reviewer) }
        : {}),
      decision: "approve",
      proposalSha256: member.proposalSha256,
      reference: approval.reference,
      approvedAt: approval.approvedAt,
      batchId: current.batchId,
      batchSha256: current.batchSha256,
      ...(approval.selfReviewAcknowledged
        ? { selfReviewAcknowledged: true }
        : {}),
    }));
  }
  const assessed = assessNamedRoleReview(inventory, result, sourceSha256);
  if (
    assessed.rows.some(
      (r) =>
        current.members.some((m) => m.candidateId === r.candidateId) &&
        !r.resolved,
    )
  )
    throw Error(
      "Approval cannot bypass incomplete or incompatible proposal conditions",
    );
  result.approvalBatches = [...(result.approvalBatches ?? []), approval];
  return result;
}
