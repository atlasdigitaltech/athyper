import { test } from "node:test";
import assert from "node:assert/strict";
import { candidateId } from "./named-role-review.mjs";
import { compileTargetAssignments } from "./compile-target-assignments.mjs";
const binding = {
  tenant_id: "t",
  principal_id: "p",
  group_id: "g",
  role_id: "r",
  scope_target_id: "s",
  scope_entity_id: "org",
  scope_kind: "operating_organization",
  propagation_mode: "subtree",
  principal_status: "active",
  has_current_plane_membership: true,
  role_permission_codes: ["case.read"],
};
const row = {
  candidateId: candidateId(binding),
  principal: { id: "p" },
  tenant: { id: "t" },
  proposal: {
    decision: "approve_responsibilities",
    responsibilities: [
      {
        responsibility: "case_reader",
        capabilities: ["case.read"],
        scope: {
          scopeTargetId: "s",
          targetId: "org",
          kind: "operating_organization",
          propagationMode: "subtree",
        },
      },
    ],
    conditions: {
      effectiveFrom: "2026-09-11T00:00:00Z",
      effectiveUntil: "2026-12-10T00:00:00Z",
    },
  },
};
const run = (rows = [binding], item = row, now = "2026-09-12T00:00:00Z") =>
  compileTargetAssignments({
    packet: { items: [item] },
    current: { candidates: rows },
    now,
  });
test("retains exact reviewed binding with no generated grants", () => {
  const r = run();
  assert.equal(r.blockedRows, 0);
  assert.deepEqual(r.grantMutations, []);
  assert.equal(r.assignments[0].binding.scopeKind, "operating_organization");
  assert.equal(r.activationReady, false);
});
test("does not restore missing bindings or revoked capabilities", () => {
  assert.ok(
    run([]).assignments[0].blockers.includes(
      "current_binding_missing_do_not_restore",
    ),
  );
  assert.ok(
    run([
      { ...binding, role_permission_codes: [] },
    ]).assignments[0].blockers.includes("capability_missing_do_not_regrant"),
  );
});
test("does not widen scope or reinterpret propagation", () => {
  const changed = structuredClone(row);
  changed.proposal.responsibilities[0].scope.kind = "tenant";
  assert.ok(
    run([binding], changed).assignments[0].blockers.includes(
      "scope_or_propagation_mismatch",
    ),
  );
});
test("blocks early and expired windows without changing effective grants", () => {
  for (const now of ["2026-09-10T23:59:59Z", "2026-12-10T00:00:00Z"])
    assert.ok(
      run([binding], row, now).assignments[0].blockers.includes(
        "outside_reviewed_assignment_window",
      ),
    );
});
