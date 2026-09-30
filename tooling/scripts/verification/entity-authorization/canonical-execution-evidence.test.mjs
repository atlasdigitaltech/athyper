import test from "node:test";
import assert from "node:assert/strict";
import { canonicalExecutionComparisons as parse } from "./canonical-execution-evidence.mjs";
const ref = "11111111-1111-4111-8111-111111111111";
const event = (stage, state, operationKey = "contact_read") => ({
  kind: "isolated_target_decision",
  evaluationRef: ref,
  requestedOperationKey: "contact_read",
  operationKey,
  stage,
  state,
});
test("compares source with final backend result, retaining parent and constraint evidence", () => {
  const r = parse([
    event("source_authority", "denied"),
    event("complete", "allowed", "read"),
    event("source_constraints", "satisfied"),
    event("complete", "allowed"),
    event("backend_complete", "allowed"),
  ]);
  assert.equal(r.diagnosticComplete, true);
  assert.equal(r.comparisons.length, 1);
  assert.equal(r.comparisons[0].differs, true);
  assert.equal(r.acceptanceRecorded, false);
});
test("does not count an allowed intermediate read as an allowed field operation", () => {
  const r = parse([
    event("source_authority", "allowed"),
    event("complete", "allowed"),
    event("backend_complete", "denied"),
  ]);
  assert.equal(r.comparisons[0].target, "denied");
});
test("rejects legacy uncorrelated logs and missing final decisions", () => {
  assert.equal(
    parse([
      { kind: "isolated_target_decision", stage: "complete", state: "allowed" },
    ]).diagnosticComplete,
    false,
  );
  assert.equal(
    parse([event("source_authority", "denied")]).diagnosticComplete,
    false,
  );
});
test("rejects duplicate or conflicting final decisions", () => {
  for (const events of [
    [event("backend_complete", "allowed"), event("backend_complete", "denied")],
    [
      {
        ...event("backend_complete", "allowed"),
        requestedOperationKey: "read",
      },
    ],
  ])
    assert.equal(
      parse([event("source_authority", "denied"), ...events])
        .diagnosticComplete,
      false,
    );
});
test("empty/profile-only evidence cannot satisfy execution comparison", () => {
  assert.equal(parse([]).diagnosticComplete, false);
  assert.equal(
    parse([
      {
        event: "bp_authorization_shadow",
        kind: "decision",
        candidateTarget: "allowed",
      },
    ]).diagnosticComplete,
    false,
  );
});
