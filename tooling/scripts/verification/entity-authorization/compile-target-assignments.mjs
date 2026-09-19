import { candidateId, proposalHash } from "./named-role-review.mjs";

/** Compile reviewed responsibilities onto exact current bindings. Never create or restore grants. */
export function compileTargetAssignments({ packet, current, now }) {
  const live = new Map(
    current.candidates.map((row) => [candidateId(row), row]),
  );
  if (live.size !== current.candidates.length)
    throw Error("Duplicate current binding");
  const assignments = packet.items
    .filter((row) => row.proposal.decision === "approve_responsibilities")
    .map((row) => {
      const binding = live.get(row.candidateId),
        proposal = row.proposal,
        blockers = [];
      if (!binding) blockers.push("current_binding_missing_do_not_restore");
      const capabilities = [
        ...new Set(
          proposal.responsibilities.flatMap((item) => item.capabilities),
        ),
      ].sort();
      for (const responsibility of proposal.responsibilities) {
        const scope = responsibility.scope;
        if (
          !binding ||
          scope.scopeTargetId !== binding.scope_target_id ||
          scope.targetId !== binding.scope_entity_id ||
          scope.kind !== binding.scope_kind ||
          scope.propagationMode !== binding.propagation_mode
        )
          blockers.push("scope_or_propagation_mismatch");
      }
      const missingCapabilities = capabilities.filter(
        (code) => !binding?.role_permission_codes.includes(code),
      );
      if (missingCapabilities.length)
        blockers.push("capability_missing_do_not_regrant");
      if (
        binding?.principal_status !== "active" ||
        !binding?.has_current_plane_membership
      )
        blockers.push("principal_or_plane_inactive");
      const from = Date.parse(proposal.conditions.effectiveFrom),
        until = Date.parse(proposal.conditions.effectiveUntil);
      if (
        !Number.isFinite(from) ||
        !Number.isFinite(until) ||
        !(Date.parse(now) >= from && Date.parse(now) < until)
      )
        blockers.push("outside_reviewed_assignment_window");
      return {
        candidateId: row.candidateId,
        proposalSha256: proposalHash(proposal),
        principal: row.principal,
        tenant: row.tenant,
        binding: binding
          ? {
              roleId: binding.role_id,
              groupId: binding.group_id,
              scopeTargetId: binding.scope_target_id,
              scopeKind: binding.scope_kind,
              targetId: binding.scope_entity_id,
              propagationMode: binding.propagation_mode,
            }
          : null,
        responsibilities: proposal.responsibilities,
        conditions: proposal.conditions,
        capabilities,
        missingCapabilities,
        disposition: blockers.length ? "blocked" : "retain_existing_binding",
        blockers: [...new Set(blockers)],
        grantMutations: [],
        executionQualificationRequired: true,
      };
    });
  return {
    schemaVersion: 1,
    kind: "reviewed_target_assignment_compilation",
    generatedAt: now,
    assignments,
    grantMutations: [],
    compiledRows: assignments.length,
    blockedRows: assignments.filter((row) => row.blockers.length).length,
    applySupported: false,
    activationReady: false,
    limits: [
      "Existing bindings remain governed by current IAM denials, revocation, expiry and owning-service conditions.",
      "Responsibility windows and MFA/separation-of-duties conditions are preserved as qualification requirements; this report installs no enforcement.",
      "Unreviewed tenant BP capabilities and stewardship are not inferred from administrator membership.",
    ],
  };
}
